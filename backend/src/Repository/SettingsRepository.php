<?php

declare(strict_types=1);

namespace Jastip\Repository;

use Jastip\Infrastructure\Database;
use RuntimeException;

final class SettingsRepository
{
    private const COLUMNS = ['default_markup_bp', 'buffer_aud_bp', 'dp_bp'];

    public function __construct(private readonly Database $db)
    {
    }

    /**
     * @return array{default_markup_bp: int, buffer_aud_bp: int, dp_bp: int, updated_at: string}
     */
    public function get(): array
    {
        $row = $this->db->pdo()
            ->query('SELECT default_markup_bp, buffer_aud_bp, dp_bp, updated_at FROM pengaturan WHERE id = 1')
            ->fetch();
        if ($row === false) {
            throw new RuntimeException('Baris pengaturan (id = 1) tidak ada. Jalankan migrasi.');
        }

        /** @var array{default_markup_bp: int, buffer_aud_bp: int, dp_bp: int, updated_at: string} $row */
        return $row;
    }

    /**
     * @param array<string, int> $values kolom => nilai basis point
     */
    public function update(array $values): void
    {
        $sets = [];
        $params = [];
        foreach ($values as $column => $value) {
            if (!in_array($column, self::COLUMNS, true)) {
                throw new RuntimeException('Kolom pengaturan tidak dikenal: ' . $column);
            }
            $sets[] = $column . ' = ?';
            $params[] = $value;
        }
        if ($sets === []) {
            return;
        }
        $this->db->pdo()->prepare('UPDATE pengaturan SET ' . implode(', ', $sets) . ' WHERE id = 1')->execute($params);
    }
}
