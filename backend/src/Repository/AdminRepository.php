<?php

declare(strict_types=1);

namespace Jastip\Repository;

use InvalidArgumentException;
use Jastip\Auth\Username;
use Jastip\Infrastructure\Database;

final class AdminRepository
{
    public function __construct(private readonly Database $db)
    {
    }

    /**
     * Cari admin dengan nama pengguna ternormalisasi (Username::normalize: huruf kecil ASCII).
     *
     * Yang menentukan adalah perbandingan biner LOWER(nama_pengguna) dengan nilai itu, bukan
     * kesetaraan collation: utf8mb4_unicode_ci menyamakan mis. 'qáthrottle', fullwidth, dan soft
     * hyphen dengan 'qathrottle'. Syarat `nama_pengguna = ?` hanya supaya indeks unik terpakai.
     * Nama yang tersimpan dengan huruf besar ('Pemilik') tetap cocok dengan 'pemilik'.
     *
     * @return array{id: int, nama_pengguna: string, password_hash: string}|null
     */
    public function findByNormalizedUsername(string $kunci): ?array
    {
        if (Username::normalize($kunci) !== $kunci) {
            throw new InvalidArgumentException('Nama pengguna belum dinormalisasi (Username::normalize).');
        }
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, nama_pengguna, password_hash FROM admin'
            . ' WHERE nama_pengguna = ? AND CAST(LOWER(nama_pengguna) AS BINARY) = CAST(? AS BINARY) LIMIT 1'
        );
        $stmt->execute([$kunci, $kunci]);
        $row = $stmt->fetch();

        /** @var array{id: int, nama_pengguna: string, password_hash: string}|false $row */
        return $row === false ? null : $row;
    }

    public function create(string $namaPengguna, string $passwordHash): int
    {
        $stmt = $this->db->pdo()->prepare('INSERT INTO admin (nama_pengguna, password_hash) VALUES (?, ?)');
        $stmt->execute([$namaPengguna, $passwordHash]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    public function updatePasswordHash(int $id, string $passwordHash): void
    {
        $stmt = $this->db->pdo()->prepare('UPDATE admin SET password_hash = ? WHERE id = ?');
        $stmt->execute([$passwordHash, $id]);
    }
}
