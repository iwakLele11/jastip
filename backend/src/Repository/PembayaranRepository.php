<?php

declare(strict_types=1);

namespace Jastip\Repository;

use Jastip\Infrastructure\Database;
use RuntimeException;

/**
 * Tabel pembayaran dan pengembalian_dana punya bentuk yang sama (nominal, tanggal),
 * jadi satu repository melayani keduanya. Hard delete (kontrak API §13).
 */
final class PembayaranRepository
{
    public const PEMBAYARAN = 'pembayaran';
    public const PENGEMBALIAN_DANA = 'pengembalian_dana';

    public function __construct(private readonly Database $db)
    {
    }

    public function insertPayment(int $keranjangId, int $nominal, string $tanggal): int
    {
        $stmt = $this->db->pdo()->prepare('INSERT INTO pembayaran (keranjang_id, nominal, tanggal) VALUES (?, ?, ?)');
        $stmt->execute([$keranjangId, $nominal, $tanggal]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    public function insertRefund(int $keranjangId, int $nominal, string $tanggal, ?string $catatan): int
    {
        $stmt = $this->db->pdo()->prepare(
            'INSERT INTO pengembalian_dana (keranjang_id, nominal, tanggal, catatan) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$keranjangId, $nominal, $tanggal, $catatan]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    /**
     * @param self::PEMBAYARAN|self::PENGEMBALIAN_DANA $table
     */
    public function keranjangIdOf(string $table, int $id): ?int
    {
        $stmt = $this->db->pdo()->prepare('SELECT keranjang_id FROM ' . self::table($table) . ' WHERE id = ?');
        $stmt->execute([$id]);
        $value = $stmt->fetchColumn();

        return $value === false ? null : (int) $value;
    }

    /**
     * @param self::PEMBAYARAN|self::PENGEMBALIAN_DANA $table
     * @return array{id: int, keranjang_id: int, nominal: int}|null
     */
    public function findForUpdate(string $table, int $id): ?array
    {
        if (!$this->db->pdo()->inTransaction()) {
            throw new RuntimeException('findForUpdate harus dipanggil di dalam transaksi.');
        }
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, keranjang_id, nominal FROM ' . self::table($table) . ' WHERE id = ? FOR UPDATE'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        /** @var array{id: int, keranjang_id: int, nominal: int}|false $row */
        return $row === false ? null : $row;
    }

    /**
     * @param self::PEMBAYARAN|self::PENGEMBALIAN_DANA $table
     */
    public function delete(string $table, int $id): void
    {
        $this->db->pdo()->prepare('DELETE FROM ' . self::table($table) . ' WHERE id = ?')->execute([$id]);
    }

    private static function table(string $table): string
    {
        if ($table !== self::PEMBAYARAN && $table !== self::PENGEMBALIAN_DANA) {
            throw new RuntimeException('Tabel tidak dikenal: ' . $table);
        }

        return $table;
    }
}
