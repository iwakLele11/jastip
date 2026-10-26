<?php

declare(strict_types=1);

namespace Jastip\Auth;

final class LoginResult
{
    public function __construct(
        public readonly string $token,
        public readonly int $adminId,
        public readonly string $namaPengguna,
    ) {
    }
}
