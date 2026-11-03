<?php

declare(strict_types=1);

namespace Jastip\Auth;

interface PasswordHasher
{
    public function hash(string $password): string;

    public function verify(string $password, string $hash): bool;

    public function needsRehash(string $hash): bool;

    /**
     * Hash pengganti untuk login yang tidak punya akun (pengguna tidak ada / nama tidak valid):
     * verify() terhadap hash ini memakan waktu sama dengan verifikasi hash admin, tanpa
     * menghitung hash baru di setiap request.
     */
    public function dummyHash(): string;
}
