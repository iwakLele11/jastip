<?php

declare(strict_types=1);

namespace Jastip\Repository;

use Jastip\Infrastructure\Database;
use PDO;
use RuntimeException;

/**
 * Keranjang (satu customer dalam satu Open PO) beserta isinya: baris pesanan,
 * pembayaran, dan pengembalian dana.
 *
 * Method dengan $forUpdate = true memakai SELECT … FOR UPDATE dan hanya boleh dipanggil
 * di dalam transaksi. Locking read selalu membaca versi terbaru yang sudah di-commit,
 * jadi validasi uang di transaksi tulis tidak memakai snapshot lama.
 */
final class KeranjangRepository
{
    private const SELECT = 'SELECT id, open_po_id, customer_id, created_at, updated_at FROM keranjang';

    private const LINE_COLUMNS = 'id, keranjang_id, nama_barang, harga_aud_sen, qty, markup_bp, kurs_jastip,'
        . ' harga_jual_unit, subtotal, kosong, created_at, updated_at';

    public function __construct(private readonly Database $db)
    {
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $openPoId, int $customerId, bool $forUpdate = false): ?array
    {
        $this->guard($forUpdate);
        $stmt = $this->db->pdo()->prepare(
            self::SELECT . ' WHERE open_po_id = ? AND customer_id = ?' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$openPoId, $customerId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Mengunci baris keranjang (X) sampai transaksi selesai. Semua perubahan isi
     * keranjang mengambil kunci ini lebih dulu, jadi perubahan pada satu keranjang
     * berjalan berurutan.
     *
     * @return array<string, mixed>|null
     */
    public function lock(int $id): ?array
    {
        $this->guard(true);
        $stmt = $this->db->pdo()->prepare(self::SELECT . ' WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public function insert(int $openPoId, int $customerId): int
    {
        $stmt = $this->db->pdo()->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)');
        $stmt->execute([$openPoId, $customerId]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    /**
     * Baris pesanan urut waktu dibuat (urutan ini juga nomor di rekap WA).
     *
     * @return list<array<string, mixed>>
     */
    public function lines(int $keranjangId, bool $forUpdate = false): array
    {
        $this->guard($forUpdate);
        $stmt = $this->db->pdo()->prepare(
            'SELECT ' . self::LINE_COLUMNS . ' FROM baris_pesanan WHERE keranjang_id = ?'
            . ' ORDER BY created_at ASC, id ASC' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$keranjangId]);

        return $stmt->fetchAll();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function payments(int $keranjangId, bool $forUpdate = false): array
    {
        $this->guard($forUpdate);
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, keranjang_id, nominal, tanggal, NULL AS catatan, created_at FROM pembayaran'
            . ' WHERE keranjang_id = ? ORDER BY id ASC' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$keranjangId]);

        return $stmt->fetchAll();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function refunds(int $keranjangId, bool $forUpdate = false): array
    {
        $this->guard($forUpdate);
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, keranjang_id, nominal, tanggal, catatan, created_at FROM pengembalian_dana'
            . ' WHERE keranjang_id = ? ORDER BY id ASC' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$keranjangId]);

        return $stmt->fetchAll();
    }

    /**
     * Keranjang berisi di satu Open PO beserta data customer, urut nama A–Z.
     *
     * @return list<array<string, mixed>>
     */
    public function filledInOpenPo(int $openPoId): array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT k.id AS keranjang_id, c.id AS customer_id, c.nama, c.no_wa, c.diarsipkan_at'
            . ' FROM keranjang k JOIN customer c ON c.id = k.customer_id'
            . ' WHERE k.open_po_id = ? AND ' . KeranjangSql::berisi('k')
            . ' ORDER BY c.nama ASC, c.id ASC'
        );
        $stmt->execute([$openPoId]);

        return $stmt->fetchAll();
    }

    /**
     * Subtotal dan tanda Kosong semua baris di satu Open PO, untuk menghitung total per keranjang.
     *
     * @return list<array{keranjang_id: int, subtotal: int, kosong: int}>
     */
    public function lineAmountsInOpenPo(int $openPoId): array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT b.keranjang_id, b.subtotal, b.kosong FROM baris_pesanan b'
            . ' JOIN keranjang k ON k.id = b.keranjang_id WHERE k.open_po_id = ?'
        );
        $stmt->execute([$openPoId]);

        /** @var list<array{keranjang_id: int, subtotal: int, kosong: int}> */
        return $stmt->fetchAll();
    }

    /**
     * Σ pembayaran dan Σ pengembalian dana per keranjang di satu Open PO.
     *
     * @return array<int, array{pembayaran: int, pengembalian: int}>
     */
    public function moneyTotalsInOpenPo(int $openPoId): array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT k.id,'
            . ' (SELECT COALESCE(SUM(p.nominal), 0) FROM pembayaran p WHERE p.keranjang_id = k.id) AS pembayaran,'
            . ' (SELECT COALESCE(SUM(r.nominal), 0) FROM pengembalian_dana r WHERE r.keranjang_id = k.id) AS pengembalian'
            . ' FROM keranjang k WHERE k.open_po_id = ?'
        );
        $stmt->execute([$openPoId]);
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[(int) $row['id']] = [
                'pembayaran' => (int) $row['pembayaran'],
                'pengembalian' => (int) $row['pengembalian'],
            ];
        }

        return $result;
    }

    /**
     * Barang unik (nama + harga AUD) di satu Open PO, termasuk baris Kosong (ui-spec §13 P5).
     * Nama yang hanya beda huruf besar/kecil digabung (collation _ci); ejaan yang
     * dikembalikan dipilih secara deterministik.
     *
     * @return list<array{nama_barang: string, harga_aud_sen: int}>
     */
    public function uniqueItems(int $openPoId, int $limit): array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT MIN(b.nama_barang COLLATE utf8mb4_bin) AS nama_barang, b.harga_aud_sen'
            . ' FROM baris_pesanan b JOIN keranjang k ON k.id = b.keranjang_id'
            . ' WHERE k.open_po_id = :po'
            . ' GROUP BY b.nama_barang, b.harga_aud_sen'
            . ' ORDER BY b.nama_barang ASC, b.harga_aud_sen ASC'
            . ' LIMIT :limit'
        );
        $stmt->bindValue(':po', $openPoId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        /** @var list<array{nama_barang: string, harga_aud_sen: int}> */
        return $stmt->fetchAll();
    }

    private function guard(bool $forUpdate): void
    {
        if ($forUpdate && !$this->db->pdo()->inTransaction()) {
            throw new RuntimeException('Locking read keranjang harus di dalam transaksi.');
        }
    }
}
