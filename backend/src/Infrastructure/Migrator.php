<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

use PDO;
use RuntimeException;

/**
 * Menjalankan file migrasi SQL berurutan: NNN_nama.sql (up) dan NNN_nama.down.sql (rollback).
 * Versi yang sudah dijalankan dicatat di tabel schema_migrations.
 *
 * Catatan: DDL di MySQL/MariaDB melakukan implicit commit, jadi satu migrasi
 * tidak atomik. Kalau gagal di tengah, perbaiki manual lalu jalankan ulang.
 */
final class Migrator
{
    public function __construct(private readonly PDO $pdo, private readonly string $directory)
    {
    }

    /**
     * @return list<string> versi yang baru dijalankan
     */
    public function up(): array
    {
        $this->ensureTable();
        $applied = $this->applied();
        $ran = [];
        foreach ($this->available() as $version => $file) {
            if (in_array($version, $applied, true)) {
                continue;
            }
            $this->runFile($file);
            $stmt = $this->pdo->prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP())');
            $stmt->execute([$version]);
            $ran[] = $version;
        }

        return $ran;
    }

    /**
     * @return list<string> versi yang di-rollback
     */
    public function down(int $steps = 1): array
    {
        $this->ensureTable();
        $applied = array_reverse($this->applied());
        $available = $this->available();
        $rolledBack = [];
        foreach (array_slice($applied, 0, $steps) as $version) {
            if (!isset($available[$version])) {
                throw new RuntimeException('File migrasi tidak ditemukan untuk versi ' . $version);
            }
            $downFile = substr($available[$version], 0, -4) . '.down.sql';
            if (!is_file($downFile)) {
                throw new RuntimeException('File rollback tidak ditemukan: ' . basename($downFile));
            }
            $this->runFile($downFile);
            $this->pdo->prepare('DELETE FROM schema_migrations WHERE version = ?')->execute([$version]);
            $rolledBack[] = $version;
        }

        return $rolledBack;
    }

    /**
     * @return array<string, bool> versi => sudah dijalankan
     */
    public function status(): array
    {
        $this->ensureTable();
        $applied = $this->applied();
        $status = [];
        foreach (array_keys($this->available()) as $version) {
            $status[$version] = in_array($version, $applied, true);
        }

        return $status;
    }

    /**
     * @return list<string>
     */
    public static function splitStatements(string $sql): array
    {
        $lines = array_filter(
            explode("\n", str_replace("\r\n", "\n", $sql)),
            static fn (string $line): bool => !str_starts_with(ltrim($line), '--'),
        );
        $statements = preg_split('/;\s*(?:\n|$)/', implode("\n", $lines)) ?: [];

        return array_values(array_filter(array_map('trim', $statements), static fn (string $s): bool => $s !== ''));
    }

    private function runFile(string $file): void
    {
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException('Tidak bisa membaca ' . $file);
        }
        foreach (self::splitStatements($sql) as $statement) {
            $this->pdo->exec($statement);
        }
    }

    private function ensureTable(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            . ' version VARCHAR(191) NOT NULL PRIMARY KEY,'
            . ' applied_at DATETIME NOT NULL'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    /**
     * @return list<string>
     */
    private function applied(): array
    {
        $rows = $this->pdo->query('SELECT version FROM schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_COLUMN);

        return array_map('strval', $rows);
    }

    /**
     * @return array<string, string> versi => path file up
     */
    private function available(): array
    {
        $files = glob($this->directory . '/[0-9][0-9][0-9]_*.sql') ?: [];
        $result = [];
        foreach ($files as $file) {
            if (str_ends_with($file, '.down.sql')) {
                continue;
            }
            $result[basename($file, '.sql')] = $file;
        }
        ksort($result, SORT_STRING);

        return $result;
    }
}
