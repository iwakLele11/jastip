<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

use RuntimeException;

/**
 * Menyusun file SQL dari file migrasi, untuk hosting tanpa CLI (impor lewat phpMyAdmin).
 *
 * install(): skema lengkap untuk database KOSONG, termasuk tabel schema_migrations (definisi
 *   sama dengan Migrator) berisi semua versi, supaya `bin/migrate.php up` nanti tidak
 *   menjalankan ulang. Pernyataan pertama adalah CREATE TABLE schema_migrations tanpa
 *   IF NOT EXISTS, jadi impor ke database yang sudah berisi skema langsung berhenti.
 *
 * upgrade($versi): satu migrasi lanjutan untuk database yang sudah berisi versi sebelumnya.
 *   Pernyataan pertama mencatat versi itu di schema_migrations dan sekaligus menjadi pengaman:
 *   gagal sebelum ada perubahan skema jika versi itu sudah tercatat (duplicate key) atau versi
 *   sebelumnya belum tercatat (applied_at NULL). phpMyAdmin berhenti di error pertama.
 *   Diuji di MariaDB 10.11 dan 11.4.
 *
 * Tanpa CREATE DATABASE / USE / DELIMITER, supaya bisa diimpor ke database yang dipilih di
 * phpMyAdmin dan dipecah per pernyataan oleh Migrator::splitStatements.
 */
final class MigrationSqlExport
{
    public function __construct(private readonly string $directory)
    {
    }

    /**
     * @return list<string>
     */
    public function versions(): array
    {
        return array_keys($this->files());
    }

    public function install(): string
    {
        $files = $this->files();
        if ($files === []) {
            throw new RuntimeException('Tidak ada file migrasi di ' . $this->directory);
        }
        $versions = array_keys($files);

        $sql = $this->header([
            'install.sql aplikasi jastip. DIBUAT OTOMATIS dari database/migrations, jangan diedit.',
            'Berisi migrasi: ' . implode(', ', $versions) . '.',
            '',
            'Impor SEKALI ke database KOSONG lewat phpMyAdmin (pilih database, tab Import).',
            'Kalau muncul "Table \'schema_migrations\' already exists", database itu tidak kosong:',
            'skema sudah terpasang. Untuk versi baru pakai file upgrade, bukan file ini.',
        ]);
        $sql .= 'CREATE TABLE ' . Migrator::TABLE_DEFINITION . ";\n";
        foreach ($files as $version => $file) {
            $sql .= "\n-- ===== " . $version . " =====\n\n" . $this->body($file) . "\n";
            $sql .= 'INSERT INTO schema_migrations (version, applied_at) VALUES ('
                . self::quote($version) . ", UTC_TIMESTAMP());\n";
        }

        return $sql;
    }

    public function upgrade(string $version): string
    {
        $files = $this->files();
        $versions = array_keys($files);
        $index = array_search($version, $versions, true);
        if ($index === false) {
            throw new RuntimeException('Versi migrasi tidak ditemukan: ' . $version);
        }
        if ($index === 0) {
            throw new RuntimeException('Versi pertama (' . $version . ') dipasang lewat install.sql, bukan upgrade.');
        }
        $previous = $versions[$index - 1];

        $sql = $this->header([
            'Upgrade database jastip ke migrasi ' . $version . '. DIBUAT OTOMATIS, jangan diedit.',
            'Syarat: migrasi ' . $previous . ' sudah tercatat di tabel schema_migrations.',
            'Backup dulu (tab Export), lalu impor lewat phpMyAdmin (pilih database, tab Import).',
            '',
            'Pernyataan pertama adalah pengaman. Error di pernyataan itu berarti TIDAK ADA yang diubah:',
            '  "Duplicate entry \'' . $version . '\'"      -> upgrade ini sudah pernah dijalankan.',
            '  "Column \'applied_at\' cannot be null" -> jalankan upgrade sebelumnya dulu (' . $previous . ').',
            'Error di pernyataan berikutnya berarti upgrade berhenti di tengah: pulihkan dari backup.',
        ]);
        $sql .= 'INSERT INTO schema_migrations (version, applied_at) VALUES (' . self::quote($version)
            . ', (SELECT UTC_TIMESTAMP() FROM schema_migrations WHERE version = ' . self::quote($previous) . "));\n";
        $sql .= "\n-- ===== " . $version . " =====\n\n" . $this->body($files[$version]);

        return $sql;
    }

    /**
     * @return array<string, string> versi => path file up
     */
    private function files(): array
    {
        $files = Migrator::availableIn($this->directory);
        foreach (array_keys($files) as $version) {
            if (preg_match('/^[0-9]{3}_[A-Za-z0-9_]+$/D', $version) !== 1) {
                throw new RuntimeException('Nama file migrasi tidak didukung: ' . $version . '.sql');
            }
        }

        return $files;
    }

    /**
     * @param list<string> $lines
     */
    private function header(array $lines): string
    {
        $comment = '';
        foreach ($lines as $line) {
            $comment .= rtrim('-- ' . $line) . "\n";
        }

        // Sama dengan pengaturan koneksi aplikasi (Database::connect).
        return $comment . "\n"
            . "SET NAMES utf8mb4;\n"
            . "SET time_zone = '+00:00';\n"
            . "SET SESSION sql_mode = '" . Database::SQL_MODE . "';\n\n";
    }

    private function body(string $file): string
    {
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException('Tidak bisa membaca ' . $file);
        }
        $sql = str_replace("\r\n", "\n", $sql);
        if (str_starts_with($sql, "\u{FEFF}")) {
            $sql = substr($sql, 3);
        }

        $code = implode("\n", array_filter(
            explode("\n", $sql),
            static fn (string $line): bool => !str_starts_with(ltrim($line), '--'),
        ));
        $forbidden = [
            '/^\s*DELIMITER\b/im' => 'DELIMITER',
            '/^\s*USE\s/im' => 'USE',
            '/\b(CREATE|DROP)\s+(DATABASE|SCHEMA)\b/i' => 'CREATE/DROP DATABASE',
        ];
        foreach ($forbidden as $pattern => $label) {
            if (preg_match($pattern, $code) === 1) {
                throw new RuntimeException(basename($file) . ' memuat ' . $label . ', tidak bisa diimpor lewat phpMyAdmin.');
            }
        }
        if (!str_ends_with(rtrim($code), ';')) {
            throw new RuntimeException(basename($file) . ': pernyataan terakhir harus diakhiri titik koma.');
        }

        return rtrim($sql) . "\n";
    }

    private static function quote(string $value): string
    {
        return "'" . str_replace(['\\', "'"], ['\\\\', "''"], $value) . "'";
    }
}
