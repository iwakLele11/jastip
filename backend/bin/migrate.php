<?php

/**
 * Migrasi skema database.
 *
 *   php bin/migrate.php up                  jalankan migrasi yang belum
 *   php bin/migrate.php status              tampilkan status migrasi
 *   php bin/migrate.php down --yes [--steps=N] [--allow-production]
 *                                           rollback N migrasi terakhir (default 1). MENGHAPUS DATA.
 *
 * Koneksi dibaca dari environment / .env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */

declare(strict_types=1);

use Jastip\Config\Config;
use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\Migrator;

require dirname(__DIR__) . '/vendor/autoload.php';

$args = array_slice($argv, 1);
$command = $args[0] ?? 'status';
$flags = array_slice($args, 1);

try {
    $config = Config::fromEnvironment(dirname(__DIR__));
    $pdo = Database::connect($config->dbHost, $config->dbPort, $config->dbName, $config->dbUser, $config->dbPassword);
    $migrator = new Migrator($pdo, dirname(__DIR__) . '/database/migrations');

    switch ($command) {
        case 'up':
            $ran = $migrator->up();
            fwrite(STDOUT, $ran === [] ? "Tidak ada migrasi baru.\n" : 'Dijalankan: ' . implode(', ', $ran) . "\n");
            break;

        case 'status':
            foreach ($migrator->status() as $version => $applied) {
                fwrite(STDOUT, sprintf("%-40s %s\n", $version, $applied ? 'sudah' : 'belum'));
            }
            break;

        case 'down':
            if (!in_array('--yes', $flags, true)) {
                fwrite(STDERR, "Rollback menghapus tabel dan data. Backup dulu, lalu ulangi dengan --yes.\n");
                exit(1);
            }
            if ($config->appEnv === 'production' && !in_array('--allow-production', $flags, true)) {
                fwrite(STDERR, "APP_ENV=production. Rollback ditolak tanpa --allow-production.\n");
                exit(1);
            }
            $steps = 1;
            foreach ($flags as $flag) {
                if (preg_match('/^--steps=([1-9][0-9]*)$/D', $flag, $m) === 1) {
                    $steps = (int) $m[1];
                }
            }
            $rolledBack = $migrator->down($steps);
            fwrite(STDOUT, $rolledBack === []
                ? "Tidak ada migrasi untuk di-rollback.\n"
                : 'Rollback: ' . implode(', ', $rolledBack) . "\n");
            break;

        default:
            fwrite(STDERR, "Perintah tidak dikenal: {$command}. Gunakan up, status, atau down.\n");
            exit(2);
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Migrasi gagal: ' . $e->getMessage() . "\n");
    exit(1);
}
