<?php

/**
 * Menjalankan satu request lewat Kernel di proses PHP terpisah dengan koneksi database
 * sendiri. Dipakai test konkurensi (tests/Integration/KonkurensiTest.php) supaya dua
 * transaksi benar-benar berjalan bersamaan.
 *
 * stdin  (JSON): {"method", "path", "body": object|null, "token", "now": "Y-m-d H:i:s"}
 * stdout (JSON): {"status": int, "body": string}
 *
 * Koneksi ke database test yang SUDAH dibuat oleh proses PHPUnit (tidak membuat ulang).
 */

declare(strict_types=1);

use Jastip\Bootstrap\AppFactory;
use Jastip\Config\Config;
use Jastip\Http\Request;
use Jastip\Infrastructure\Database;
use Jastip\Tests\Support\MemoryLogger;
use Jastip\Tests\Support\MutableClock;
use Jastip\Tests\Support\StubExchangeRateProvider;
use Jastip\Tests\Support\TestDatabase;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

$input = json_decode((string) stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
$s = TestDatabase::settings();
$pdo = Database::connect($s['host'], $s['port'], $s['name'], $s['user'], $s['password']);
// Kalau kunci tidak pernah dilepas (test gagal), jangan menunggu default 50 detik.
$pdo->exec('SET SESSION innodb_lock_wait_timeout = 10');

$config = Config::fromArray([
    'APP_ENV' => 'testing',
    'APP_ALLOWED_ORIGINS' => 'https://jastip.test',
    'DB_HOST' => $s['host'],
    'DB_PORT' => (string) $s['port'],
    'DB_NAME' => $s['name'],
    'DB_USER' => $s['user'],
    'DB_PASSWORD' => $s['password'],
    'SESSION_COOKIE_SECURE' => 'true',
    'LOG_PATH' => 'php://stderr',
], dirname(__DIR__, 2));
$logger = new MemoryLogger();
$app = AppFactory::create(
    $config,
    new Database(static fn (): PDO => $pdo),
    new StubExchangeRateProvider(),
    new MutableClock((string) $input['now']),
    $logger,
);

$response = $app->handle(new Request(
    (string) $input['method'],
    (string) $input['path'],
    [],
    ['Content-Type' => 'application/json'],
    $input['body'] === null ? '' : (string) json_encode($input['body']),
    ['__Host-jastip_sesi' => (string) $input['token']],
    '203.0.113.8',
));

echo json_encode(['status' => $response->status, 'body' => $response->body(), 'log' => $logger->events()]);
