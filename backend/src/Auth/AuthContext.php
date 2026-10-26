<?php

declare(strict_types=1);

namespace Jastip\Auth;

/**
 * Sesi admin yang sedang dipakai request ini.
 */
final class AuthContext
{
    public function __construct(
        public readonly int $sessionId,
        public readonly int $adminId,
        public readonly string $namaPengguna,
        public readonly string $token,
        public readonly bool $viaCookie,
        /** true jika terakhir_aktif_at baru diperbarui, jadi cookie perlu dikirim ulang. */
        public readonly bool $refreshed,
    ) {
    }
}
