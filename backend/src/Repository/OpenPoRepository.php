<?php

declare(strict_types=1);

namespace Jastip\Repository;

use DateTimeImmutable;
use Jastip\Infrastructure\Database;
use RuntimeException;

final class OpenPoRepository
{
    private const SELECT = 'SELECT id, nama, mata_uang, status, kurs_mode, kurs_pasar, kurs_tanggal, kurs_buffer_bp,'
        . ' kurs_jastip, dp_bp, kurs_terkunci_at, created_at, updated_at FROM open_po';

    private const UPDATABLE = ['nama', 'status', 'kurs_mode', 'kurs_pasar', 'kurs_tanggal', 'kurs_buffer_bp', 'kurs_jastip'];

    public function __construct(private readonly Database $db)
    {
    }

    /**
     * @param array{nama: string, kurs_mode: string, kurs_pasar: ?string, kurs_tanggal: ?string,
     *              kurs_buffer_bp: ?int, kurs_jastip: int, dp_bp: int} $data
     */
    public function insert(array $data): int
    {
        $stmt = $this->db->pdo()->prepare(
            'INSERT INTO open_po (nama, mata_uang, status, kurs_mode, kurs_pasar, kurs_tanggal, kurs_buffer_bp,'
            . ' kurs_jastip, dp_bp) VALUES (?, \'AUD\', \'buka\', ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['nama'],
            $data['kurs_mode'],
            $data['kurs_pasar'],
            $data['kurs_tanggal'],
            $data['kurs_buffer_bp'],
            $data['kurs_jastip'],
            $data['dp_bp'],
        ]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->pdo()->prepare(self::SELECT . ' WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Mengunci baris PO (X) sampai transaksi selesai. Dipakai saat mengubah kurs dan
     * saat menyimpan baris pesanan, supaya penguncian kurs tidak balapan dengan ubah kurs.
     *
     * @return array<string, mixed>|null
     */
    public function findForUpdate(int $id): ?array
    {
        return $this->findLocked($id, ' FOR UPDATE');
    }

    /**
     * Kunci bersama (S) pada baris PO. Dipakai saat mencatat pembayaran: insert keranjang
     * baru butuh kunci S pada PO untuk cek foreign key, jadi kunci ini diambil di awal
     * supaya urutan kunci sama dengan tambah barang (open_po → customer → keranjang).
     *
     * @return array<string, mixed>|null
     */
    public function findForShare(int $id): ?array
    {
        return $this->findLocked($id, ' LOCK IN SHARE MODE');
    }

    /**
     * Mengisi kurs_terkunci_at sekali saja (tidak pernah dikosongkan lagi).
     * Panggil setelah findForUpdate() di transaksi yang sama dengan insert baris pesanan.
     */
    public function lockKurs(int $id, DateTimeImmutable $now): void
    {
        $stmt = $this->db->pdo()->prepare(
            'UPDATE open_po SET kurs_terkunci_at = ? WHERE id = ? AND kurs_terkunci_at IS NULL'
        );
        $stmt->execute([Sql::datetime($now), $id]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findLocked(int $id, string $lockClause): ?array
    {
        if (!$this->db->pdo()->inTransaction()) {
            throw new RuntimeException('Locking read open_po harus di dalam transaksi.');
        }
        $stmt = $this->db->pdo()->prepare(self::SELECT . ' WHERE id = ?' . $lockClause);
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?string $status, int $limit, int $offset): array
    {
        $sql = self::SELECT . ($status !== null ? ' WHERE status = :status' : '')
            . " ORDER BY CASE status WHEN 'buka' THEN 0 ELSE 1 END, created_at DESC, id DESC"
            . ' LIMIT :limit OFFSET :offset';
        $stmt = $this->db->pdo()->prepare($sql);
        if ($status !== null) {
            $stmt->bindValue(':status', $status);
        }
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * @return array{buka: int, selesai: int}
     */
    public function countByStatus(): array
    {
        $counts = ['buka' => 0, 'selesai' => 0];
        foreach ($this->db->pdo()->query('SELECT status, COUNT(*) AS n FROM open_po GROUP BY status') as $row) {
            $counts[$row['status']] = (int) $row['n'];
        }

        return $counts;
    }

    /**
     * @param array<string, int|string|null> $changes
     */
    public function update(int $id, array $changes): void
    {
        $sets = [];
        $params = [];
        foreach ($changes as $column => $value) {
            if (!in_array($column, self::UPDATABLE, true)) {
                throw new RuntimeException('Kolom open_po tidak bisa diubah: ' . $column);
            }
            $sets[] = $column . ' = ?';
            $params[] = $value;
        }
        if ($sets === []) {
            return;
        }
        $params[] = $id;
        $this->db->pdo()->prepare('UPDATE open_po SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }

    /**
     * Ringkasan per PO dari keranjang berisi: jumlah customer, total pesanan
     * (tanpa baris Kosong), dan dana diterima (Σ pembayaran − Σ pengembalian dana).
     *
     * @param list<int> $ids
     * @return array<int, array{jumlah_customer: int, total_pesanan: int, dana_diterima: int}>
     */
    public function ringkasan(array $ids): array
    {
        $result = [];
        foreach ($ids as $id) {
            $result[$id] = ['jumlah_customer' => 0, 'total_pesanan' => 0, 'dana_diterima' => 0];
        }
        if ($ids === []) {
            return $result;
        }

        $placeholders = implode(', ', array_fill(0, count($ids), '?'));
        $stmt = $this->db->pdo()->prepare(
            'SELECT x.open_po_id, COUNT(*) AS jumlah_customer, SUM(x.total_barang) AS total_pesanan,'
            . ' SUM(x.total_bayar) - SUM(x.total_kembali) AS dana_diterima'
            . ' FROM (SELECT k.open_po_id,'
            . ' (SELECT COALESCE(SUM(b.subtotal), 0) FROM baris_pesanan b'
            . '  WHERE b.keranjang_id = k.id AND b.kosong = 0) AS total_barang,'
            . ' (SELECT COALESCE(SUM(p.nominal), 0) FROM pembayaran p WHERE p.keranjang_id = k.id) AS total_bayar,'
            . ' (SELECT COALESCE(SUM(r.nominal), 0) FROM pengembalian_dana r'
            . '  WHERE r.keranjang_id = k.id) AS total_kembali'
            . ' FROM keranjang k WHERE k.open_po_id IN (' . $placeholders . ') AND ' . KeranjangSql::berisi('k')
            . ') x GROUP BY x.open_po_id'
        );
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $result[(int) $row['open_po_id']] = [
                'jumlah_customer' => (int) $row['jumlah_customer'],
                'total_pesanan' => (int) $row['total_pesanan'],
                'dana_diterima' => (int) $row['dana_diterima'],
            ];
        }

        return $result;
    }
}
