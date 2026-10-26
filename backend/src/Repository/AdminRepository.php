<?php

declare(strict_types=1);

namespace Jastip\Repository;

use Jastip\Infrastructure\Database;

final class AdminRepository
{
    public function __construct(private readonly Database $db)
    {
    }

    /**
     * Pencocokan nama pengguna tidak peka huruf besar/kecil (collation utf8mb4_unicode_ci).
     *
     * @return array{id: int, nama_pengguna: string, password_hash: string}|null
     */
    public function findByUsername(string $namaPengguna): ?array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, nama_pengguna, password_hash FROM admin WHERE nama_pengguna = ? LIMIT 1'
        );
        $stmt->execute([$namaPengguna]);
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
