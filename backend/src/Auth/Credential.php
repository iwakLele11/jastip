<?php

declare(strict_types=1);

namespace Jastip\Auth;

/**
 * Token sesi dari request: cookie (web) atau header Authorization: Bearer (mobile).
 */
final class Credential
{
    public function __construct(
        public readonly string $token,
        public readonly bool $viaCookie,
    ) {
    }
}
