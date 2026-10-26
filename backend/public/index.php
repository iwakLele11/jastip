<?php

declare(strict_types=1);

use Jastip\Bootstrap\AppFactory;
use Jastip\Http\Request;
use Jastip\Http\ResponseEmitter;

// Front controller. Document root web server = folder public/ ini.
require dirname(__DIR__) . '/vendor/autoload.php';

date_default_timezone_set('UTC');

try {
    $app = AppFactory::fromEnvironment(dirname(__DIR__));
} catch (Throwable $e) {
    // Konfigurasi salah (mis. .env tidak lengkap). Detail hanya ke log server.
    error_log('jastip: gagal memulai aplikasi: ' . $e->getMessage());
    header_remove('X-Powered-By');
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo '{"error":{"kode":"KESALAHAN_SERVER","pesan":"Terjadi kesalahan di server. Coba lagi beberapa saat lagi."}}';
    exit;
}

ResponseEmitter::emit($app->handle(Request::fromGlobals()));
