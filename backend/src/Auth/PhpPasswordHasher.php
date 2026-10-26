<?php

declare(strict_types=1);

namespace Jastip\Auth;

/**
 * password_hash / password_verify dengan PASSWORD_DEFAULT (bcrypt).
 */
final class PhpPasswordHasher implements PasswordHasher
{
    /**
     * Hash bcrypt dari kata sandi acak yang langsung dibuang (tidak ada yang tahu kata sandinya),
     * dihitung sekali saat kode ditulis. Satu per cost default PASSWORD_DEFAULT:
     * 10 = PHP 8.2–8.3, 12 = PHP 8.4+. Kalau default PHP berubah lagi, tambahkan hash untuk cost
     * baru; PhpPasswordHasherTest gagal sebagai pengingat.
     */
    public const DUMMY_HASHES = [
        10 => '$2y$10$rdm8ZGWNpUeL2FNrXJd8uOwD/BdpikHlFYbwB4jvHak1JAE4GvAfm',
        12 => '$2y$12$NDSeEwhRSEfv75NWdyEMcO5QVxdm0/bqvXLpjEICwLjP85ZH9HCcK',
    ];

    public function hash(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    public function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_DEFAULT);
    }

    public function dummyHash(): string
    {
        foreach (self::DUMMY_HASHES as $hash) {
            if (!password_needs_rehash($hash, PASSWORD_DEFAULT)) {
                return $hash;
            }
        }

        // Default PHP di luar daftar: pakai cost tertinggi yang ada (tetap tanpa password_hash).
        return self::DUMMY_HASHES[max(array_keys(self::DUMMY_HASHES))];
    }
}
