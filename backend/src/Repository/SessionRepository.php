<?php

declare(strict_types=1);

namespace Jastip\Repository;

use DateTimeImmutable;
use Jastip\Infrastructure\Database;

final class SessionRepository
{
    public function __construct(private readonly Database $db)
    {
    }

    public function create(int $adminId, string $tokenHash, DateTimeImmutable $now): int
    {
        $stmt = $this->db->pdo()->prepare(
            'INSERT INTO sesi_login (admin_id, token_hash, terakhir_aktif_at, created_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$adminId, $tokenHash, Sql::datetime($now), Sql::datetime($now)]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    /**
     * @return array{id: int, admin_id: int, nama_pengguna: string, terakhir_aktif_at: string}|null
     */
    public function findByTokenHash(string $tokenHash): ?array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT s.id, s.admin_id, a.nama_pengguna, s.terakhir_aktif_at'
            . ' FROM sesi_login s JOIN admin a ON a.id = s.admin_id'
            . ' WHERE s.token_hash = ? LIMIT 1'
        );
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch();

        /** @var array{id: int, admin_id: int, nama_pengguna: string, terakhir_aktif_at: string}|false $row */
        return $row === false ? null : $row;
    }

    public function touch(int $id, DateTimeImmutable $now): void
    {
        $stmt = $this->db->pdo()->prepare('UPDATE sesi_login SET terakhir_aktif_at = ? WHERE id = ?');
        $stmt->execute([Sql::datetime($now), $id]);
    }

    public function delete(int $id): void
    {
        $this->db->pdo()->prepare('DELETE FROM sesi_login WHERE id = ?')->execute([$id]);
    }

    public function deleteForAdmin(int $adminId): void
    {
        $this->db->pdo()->prepare('DELETE FROM sesi_login WHERE admin_id = ?')->execute([$adminId]);
    }

    public function deleteInactiveSince(DateTimeImmutable $threshold): void
    {
        $stmt = $this->db->pdo()->prepare('DELETE FROM sesi_login WHERE terakhir_aktif_at <= ?');
        $stmt->execute([Sql::datetime($threshold)]);
    }
}
