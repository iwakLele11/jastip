<?php

declare(strict_types=1);

use Jastip\Bootstrap\AppFactory;
use Jastip\Http\Request;
use Jastip\Http\ResponseEmitter;

// Front controller paket htdocs (XAMPP lokal / InfinityFree): web root = folder ini,
// kode back-end + konfigurasi di app/ (ditolak dari web oleh .htaccess). Hanya /api/* yang
// diarahkan ke file ini; halaman front-end (*.html) dilayani langsung oleh web server.

date_default_timezone_set('UTC');

// Error sebelum aplikasi jalan: catat alasan (tanpa rahasia), lalu kirim JSON error standar.
$gagalMulai = static function (string $alasan): never {
    error_log('jastip: gagal memulai aplikasi: ' . $alasan);
    // Hosting gratis sering tidak memberi akses ke log PHP, jadi catat juga di app/storage/logs.
    $line = json_encode(
        [
            'waktu' => gmdate('Y-m-d\TH:i:s\Z'),
            'level' => 'error',
            'kejadian' => 'gagal_memulai_aplikasi',
            'konteks' => ['alasan' => $alasan],
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE,
    );
    @file_put_contents(__DIR__ . '/app/storage/logs/app.log', $line . "\n", FILE_APPEND | LOCK_EX);

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo '{"error":{"kode":"KESALAHAN_SERVER","pesan":"Terjadi kesalahan di server. Coba lagi beberapa saat lagi."}}';
    exit;
};

if (!is_file(__DIR__ . '/app/vendor/autoload.php')) {
    $gagalMulai('app/vendor/autoload.php tidak ditemukan (folder app/ belum terunggah lengkap)');
}
require __DIR__ . '/app/vendor/autoload.php';

try {
    $app = AppFactory::fromEnvironment(__DIR__ . '/app');
} catch (InvalidArgumentException $e) {
    // Konfigurasi salah (mis. app/.env tidak ada atau tidak lengkap). Pesan Config tidak memuat rahasia.
    $gagalMulai('konfigurasi: ' . $e->getMessage()
        . (is_file(__DIR__ . '/app/.env') ? '' : ' (file app/.env tidak ditemukan)'));
} catch (Throwable $e) {
    $gagalMulai(get_class($e) . ' di ' . basename($e->getFile()) . ':' . $e->getLine());
}

ResponseEmitter::emit($app->handle(Request::fromGlobals()));
