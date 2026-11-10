<?php

/**
 * Menyusun file SQL dari database/migrations untuk diimpor lewat phpMyAdmin
 * (hosting tanpa CLI, mis. InfinityFree). Tidak butuh koneksi database.
 *
 *   php bin/export-sql.php install            skema lengkap untuk database kosong
 *   php bin/export-sql.php upgrade <versi>    satu migrasi lanjutan, mis. upgrade 002_tambah_kolom
 *   php bin/export-sql.php versions           daftar versi migrasi
 *
 * Hasil ditulis ke STDOUT, mis. php bin/export-sql.php install > install.sql
 */

declare(strict_types=1);

use Jastip\Infrastructure\MigrationSqlExport;

require dirname(__DIR__) . '/vendor/autoload.php';

$command = $argv[1] ?? '';
$export = new MigrationSqlExport(dirname(__DIR__) . '/database/migrations');

try {
    switch ($command) {
        case 'install':
            fwrite(STDOUT, $export->install());
            break;

        case 'upgrade':
            $version = $argv[2] ?? '';
            if ($version === '') {
                fwrite(STDERR, "Pakai: php bin/export-sql.php upgrade <versi>\n");
                exit(2);
            }
            fwrite(STDOUT, $export->upgrade($version));
            break;

        case 'versions':
            fwrite(STDOUT, implode("\n", $export->versions()) . "\n");
            break;

        default:
            fwrite(STDERR, "Pakai: php bin/export-sql.php install | upgrade <versi> | versions\n");
            exit(2);
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Gagal: ' . $e->getMessage() . "\n");
    exit(1);
}
