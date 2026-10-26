<?php

/**
 * Membuat akun admin (tidak ada registrasi publik).
 *
 *   php bin/create-admin.php <nama_pengguna>          buat admin baru
 *   php bin/create-admin.php <nama_pengguna> --reset  ganti kata sandi admin yang ada
 *                                                     (semua sesi admin tersebut diakhiri)
 *   php bin/create-admin.php <nama_pengguna> --sql [--reset]
 *       Tanpa koneksi database: cetak pernyataan SQL untuk ditempel di tab SQL phpMyAdmin
 *       (hosting tanpa CLI, mis. InfinityFree). INSERT untuk admin baru; dengan --reset,
 *       UPDATE hash + hapus semua sesi admin itu. SQL ke STDOUT, pesan lain ke STDERR.
 *
 * Kata sandi dibaca dari terminal tanpa ditampilkan (diminta dua kali), atau dari
 * STDIN satu baris kalau di-pipe. Di Windows ketikan tidak bisa disembunyikan (ada
 * peringatan). Kata sandi tidak pernah diterima sebagai argumen supaya tidak tersimpan
 * di riwayat shell.
 */

declare(strict_types=1);

use Jastip\Config\Config;
use Jastip\Infrastructure\Database;
use Jastip\Repository\AdminRepository;
use Jastip\Repository\SessionRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES = 72; // batas bcrypt (PASSWORD_DEFAULT)
const USAGE = "Pakai: php bin/create-admin.php <nama_pengguna> [--reset] [--sql]\n";

function isInteractive(): bool
{
    return stream_isatty(STDIN);
}

function readPassword(string $prompt): string
{
    $interactive = isInteractive();
    $hideEcho = $interactive && PHP_OS_FAMILY !== 'Windows';
    if ($interactive) {
        fwrite(STDERR, $prompt);
    }
    if ($hideEcho) {
        shell_exec('stty -echo');
    }
    try {
        $line = fgets(STDIN);
    } finally {
        if ($hideEcho) {
            shell_exec('stty echo');
            fwrite(STDERR, "\n"); // Enter tidak ikut tampil saat echo mati
        }
    }

    return $line === false ? '' : rtrim($line, "\r\n");
}

/** Minta kata sandi (dua kali kalau interaktif) dan validasi panjangnya. Keluar jika tidak valid. */
function askNewPassword(): string
{
    if (isInteractive() && PHP_OS_FAMILY === 'Windows') {
        fwrite(STDERR, "Peringatan: di Windows ketikan kata sandi TERLIHAT di layar. Pastikan tidak ada yang\n"
            . "melihat layar, dan tutup jendela ini setelah selesai.\n");
    }
    $password = readPassword('Kata sandi: ');
    if (isInteractive() && readPassword('Ulangi kata sandi: ') !== $password) {
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

    return $password;
}

/**
 * Literal string SQL. Nilai yang masuk sudah divalidasi ke karakter aman; escape ini lapisan
 * kedua (petik digandakan, aman dengan atau tanpa NO_BACKSLASH_ESCAPES).
 */
function sqlString(string $value): string
{
    return "'" . str_replace(['\\', "'"], ['\\\\', "''"], $value) . "'";
}

function adminSql(string $username, string $hash, bool $reset): string
{
    // Hash password_hash(): $2y$… (bcrypt) atau $argon2id$…, hanya karakter ini.
    if (preg_match('#^\$[A-Za-z0-9$./=,+-]+$#D', $hash) !== 1) {
        throw new RuntimeException('Format hash kata sandi tidak dikenal.');
    }
    $name = sqlString($username);
    $stamp = gmdate('Y-m-d H:i') . ' UTC';

    if (!$reset) {
        return "-- Admin jastip {$name} (bin/create-admin.php --sql, {$stamp}).\n"
            . "-- phpMyAdmin: pilih database aplikasi, buka tab SQL, tempel, klik Go. Hasil: 1 row inserted.\n"
            . 'INSERT INTO admin (nama_pengguna, password_hash) VALUES (' . $name . ', ' . sqlString($hash) . ");\n";
    }

    return "-- Ganti kata sandi admin jastip {$name} dan akhiri semua sesinya"
        . " (bin/create-admin.php --sql --reset, {$stamp}).\n"
        . "-- phpMyAdmin: pilih database aplikasi, buka tab SQL, tempel, klik Go.\n"
        . "-- Pastikan UPDATE menghasilkan 1 row affected (0 = nama pengguna salah).\n"
        . "START TRANSACTION;\n"
        . 'UPDATE admin SET password_hash = ' . sqlString($hash) . ' WHERE nama_pengguna = ' . $name . ";\n"
        . 'DELETE FROM sesi_login WHERE admin_id IN (SELECT id FROM admin WHERE nama_pengguna = ' . $name . ");\n"
        . "COMMIT;\n";
}

$username = $argv[1] ?? '';
$flags = array_slice($argv, 2);
$reset = in_array('--reset', $flags, true);
$sqlOnly = in_array('--sql', $flags, true);

if (preg_match('/^[A-Za-z0-9._-]{3,50}$/D', $username) !== 1) {
    fwrite(STDERR, USAGE);
    fwrite(STDERR, "Nama pengguna 3–50 karakter: huruf, angka, titik, garis bawah, tanda hubung.\n");
    exit(2);
}
foreach ($flags as $flag) {
    if (!in_array($flag, ['--reset', '--sql'], true)) {
        fwrite(STDERR, "Opsi tidak dikenal: {$flag}\n" . USAGE);
        exit(2);
    }
}

try {
    if ($sqlOnly) {
        $password = askNewPassword();
        $sql = adminSql($username, password_hash($password, PASSWORD_DEFAULT), $reset);
        fwrite(STDERR, "\nSalin SQL di bawah ini (dari baris -- pertama sampai baris terakhir).\n"
            . "Jangan kirim lewat chat/email: isinya hash kata sandi.\n\n");
        fwrite(STDOUT, $sql);
        exit(0);
    }

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

    $hash = password_hash(askNewPassword(), PASSWORD_DEFAULT);
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
