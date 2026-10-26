<?php

declare(strict_types=1);

namespace Jastip\Tests\Support;

use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\Migrator;
use PDO;
use RuntimeException;

/**
 * Database test terpisah. Dihapus dan dibuat ulang sekali per run PHPUnit,
 * lalu dimigrasi dengan file migrasi yang sama dengan production.
 */
final class TestDatabase
{
    private static ?PDO $pdo = null;

    /** @var list<string> */
    public const TABLES = [
        'pengembalian_dana', 'pembayaran', 'baris_pesanan', 'keranjang', 'customer',
        'open_po', 'percobaan_login', 'sesi_login', 'admin',
    ];

    /**
     * @return array{host: string, port: int, name: string, user: string, password: string}
     */
    public static function settings(): array
    {
        $name = (string) getenv('TEST_DB_NAME');
        if (!str_ends_with($name, '_test')) {
            throw new RuntimeException('TEST_DB_NAME harus berakhiran _test, karena database ini dihapus setiap run.');
        }

        return [
            'host' => (string) getenv('TEST_DB_HOST'),
            'port' => (int) getenv('TEST_DB_PORT'),
            'name' => $name,
            'user' => (string) getenv('TEST_DB_USER'),
            'password' => (string) getenv('TEST_DB_PASSWORD'),
        ];
    }

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $s = self::settings();
        $server = Database::connect($s['host'], $s['port'], null, $s['user'], $s['password']);
        self::recreate($server, $s['name']);

        $pdo = Database::connect($s['host'], $s['port'], $s['name'], $s['user'], $s['password']);
        (new Migrator($pdo, dirname(__DIR__, 2) . '/database/migrations'))->up();

        return self::$pdo = $pdo;
    }

    public static function recreate(PDO $server, string $name): void
    {
        if (!str_ends_with($name, '_test') || preg_match('/^[a-z0-9_]+$/D', $name) !== 1) {
            throw new RuntimeException('Nama database test tidak aman: ' . $name);
        }
        $server->exec('DROP DATABASE IF EXISTS `' . $name . '`');
        $server->exec('CREATE DATABASE `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    }

    /** Kosongkan semua tabel data dan kembalikan pengaturan ke nilai awal migrasi. */
    public static function reset(): void
    {
        $pdo = self::pdo();
        // DELETE (urut sesuai foreign key) jauh lebih cepat daripada TRUNCATE untuk tabel kecil.
        foreach (self::TABLES as $table) {
            $pdo->exec('DELETE FROM ' . $table);
        }
        $pdo->exec('UPDATE pengaturan SET default_markup_bp = 1000, buffer_aud_bp = 300, dp_bp = 5000 WHERE id = 1');
    }
}
