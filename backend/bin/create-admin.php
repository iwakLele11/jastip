<?php

/**
 * Membuat akun admin (tidak ada registrasi publik).
 *
 *   php bin/create-admin.php <nama_pengguna>          buat admin baru
 *   php bin/create-admin.php <nama_pengguna> --reset  ganti kata sandi admin yang ada
 *                                                     (semua sesi admin tersebut diakhiri)
 *
 * Kata sandi dibaca dari terminal tanpa ditampilkan (diminta dua kali), atau dari
 * STDIN satu baris kalau di-pipe. Kata sandi tidak pernah diterima sebagai argumen
 * supaya tidak tersimpan di riwayat shell.
 */

declare(strict_types=1);

use Jastip\Config\Config;
use Jastip\Infrastructure\Database;
use Jastip\Repository\AdminRepository;
use Jastip\Repository\SessionRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES = 72; // batas bcrypt (PASSWORD_DEFAULT)

function readPassword(string $prompt): string
{
    $interactive = function_exists('posix_isatty') && posix_isatty(STDIN);
    if ($interactive) {
        fwrite(STDOUT, $prompt);
        shell_exec('stty -echo');
    }
    $line = fgets(STDIN);
    if ($interactive) {
        shell_exec('stty echo');
        fwrite(STDOUT, "\n");
    }

    return $line === false ? '' : rtrim($line, "\r\n");
}

$username = $argv[1] ?? '';
$reset = in_array('--reset', array_slice($argv, 2), true);

if (preg_match('/^[A-Za-z0-9._-]{3,50}$/D', $username) !== 1) {
    fwrite(STDERR, "Pakai: php bin/create-admin.php <nama_pengguna> [--reset]\n");
    fwrite(STDERR, "Nama pengguna 3–50 karakter: huruf, angka, titik, garis bawah, tanda hubung.\n");
    exit(2);
}

try {
    $config = Config::fromEnvironment(dirname(__DIR__));
    $db = Database::fromConfig($config);
    $admins = new AdminRepository($db);
    $existing = $admins->findByUsername($username);

    if ($existing !== null && !$reset) {
        fwrite(STDERR, "Admin '{$username}' sudah ada. Pakai --reset untuk mengganti kata sandi.\n");
        exit(1);
    }
    if ($existing === null && $reset) {
        fwrite(STDERR, "Admin '{$username}' tidak ditemukan.\n");
        exit(1);
    }

    $password = readPassword('Kata sandi: ');
    $interactive = function_exists('posix_isatty') && posix_isatty(STDIN);
    if ($interactive && readPassword('Ulangi kata sandi: ') !== $password) {
        fwrite(STDERR, "Kata sandi tidak sama.\n");
        exit(1);
    }
    if (mb_strlen($password) < MIN_PASSWORD_LENGTH) {
        fwrite(STDERR, 'Kata sandi minimal ' . MIN_PASSWORD_LENGTH . " karakter.\n");
        exit(1);
    }
    if (strlen($password) > MAX_PASSWORD_BYTES) {
        fwrite(STDERR, 'Kata sandi maksimal ' . MAX_PASSWORD_BYTES . " byte.\n");
        exit(1);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    if ($existing === null) {
        $id = $admins->create($username, $hash);
        fwrite(STDOUT, "Admin '{$username}' dibuat (id {$id}).\n");
    } else {
        $admins->updatePasswordHash($existing['id'], $hash);
        (new SessionRepository($db))->deleteForAdmin($existing['id']);
        fwrite(STDOUT, "Kata sandi '{$username}' diganti. Semua sesi lama diakhiri.\n");
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Gagal: ' . $e->getMessage() . "\n");
    exit(1);
}
