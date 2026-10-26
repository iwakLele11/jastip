<?php

declare(strict_types=1);

namespace Jastip\Repository;

use DateTimeImmutable;
use Jastip\Infrastructure\Database;

final class LoginAttemptRepository
{
    public function __construct(private readonly Database $db)
    {
    }

    public function record(string $keyHash, DateTimeImmutable $now): void
    {
        $stmt = $this->db->pdo()->prepare('INSERT INTO percobaan_login (kunci_hash, dicoba_at) VALUES (?, ?)');
        $stmt->execute([$keyHash, Sql::datetime($now)]);
    }

    /**
     * @return array{jumlah: int, paling_awal: string|null}
     */
    public function countSince(string $keyHash, DateTimeImmutable $since): array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT COUNT(*) AS jumlah, MIN(dicoba_at) AS paling_awal FROM percobaan_login'
            . ' WHERE kunci_hash = ? AND dicoba_at > ?'
        );
        $stmt->execute([$keyHash, Sql::datetime($since)]);
        $row = $stmt->fetch();

        return ['jumlah' => (int) $row['jumlah'], 'paling_awal' => $row['paling_awal']];
    }

    public function clear(string $keyHash): void
    {
        $this->db->pdo()->prepare('DELETE FROM percobaan_login WHERE kunci_hash = ?')->execute([$keyHash]);
    }

    public function deleteOlderThan(DateTimeImmutable $threshold): void
    {
        $stmt = $this->db->pdo()->prepare('DELETE FROM percobaan_login WHERE dicoba_at <= ?');
        $stmt->execute([Sql::datetime($threshold)]);
    }
}
