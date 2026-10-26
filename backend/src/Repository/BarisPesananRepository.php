<?php

declare(strict_types=1);

namespace Jastip\Repository;

use Jastip\Infrastructure\Database;
use RuntimeException;

final class BarisPesananRepository
{
    private const UPDATABLE = ['nama_barang', 'harga_aud_sen', 'qty', 'markup_bp', 'harga_jual_unit', 'subtotal'];

    public function __construct(private readonly Database $db)
    {
    }

    /**
     * @param array{nama_barang: string, harga_aud_sen: int, qty: int, markup_bp: int, kurs_jastip: int,
     *              harga_jual_unit: int, subtotal: int} $data
     */
    public function insert(int $keranjangId, array $data): int
    {
        $stmt = $this->db->pdo()->prepare(
            'INSERT INTO baris_pesanan (keranjang_id, nama_barang, harga_aud_sen, qty, markup_bp, kurs_jastip,'
            . ' harga_jual_unit, subtotal, kosong) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
        );
        $stmt->execute([
            $keranjangId,
            $data['nama_barang'],
            $data['harga_aud_sen'],
            $data['qty'],
            $data['markup_bp'],
            $data['kurs_jastip'],
            $data['harga_jual_unit'],
            $data['subtotal'],
        ]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    /** Keranjang pemilik baris, untuk mengambil kunci keranjang lebih dulu. */
    public function keranjangIdOf(int $id): ?int
    {
        $stmt = $this->db->pdo()->prepare('SELECT keranjang_id FROM baris_pesanan WHERE id = ?');
        $stmt->execute([$id]);
        $value = $stmt->fetchColumn();

        return $value === false ? null : (int) $value;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findForUpdate(int $id): ?array
    {
        if (!$this->db->pdo()->inTransaction()) {
            throw new RuntimeException('findForUpdate harus dipanggil di dalam transaksi.');
        }
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, keranjang_id, nama_barang, harga_aud_sen, qty, markup_bp, kurs_jastip, harga_jual_unit,'
            . ' subtotal, kosong FROM baris_pesanan WHERE id = ? FOR UPDATE'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * @param array<string, int|string> $changes
     */
    public function update(int $id, array $changes): void
    {
        $sets = [];
        $params = [];
        foreach ($changes as $column => $value) {
            if (!in_array($column, self::UPDATABLE, true)) {
                throw new RuntimeException('Kolom baris_pesanan tidak bisa diubah: ' . $column);
            }
            $sets[] = $column . ' = ?';
            $params[] = $value;
        }
        if ($sets === []) {
            return;
        }
        $params[] = $id;
        $this->db->pdo()->prepare('UPDATE baris_pesanan SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }

    public function setKosong(int $id, bool $kosong): void
    {
        $this->db->pdo()->prepare('UPDATE baris_pesanan SET kosong = ? WHERE id = ?')->execute([$kosong ? 1 : 0, $id]);
    }

    public function delete(int $id): void
    {
        $this->db->pdo()->prepare('DELETE FROM baris_pesanan WHERE id = ?')->execute([$id]);
    }
}
