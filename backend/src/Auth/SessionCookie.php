<?php

declare(strict_types=1);

namespace Jastip\Auth;

/**
 * Cookie sesi: HttpOnly, SameSite=Strict, Path=/, Secure (bisa dimatikan hanya untuk lokal).
 * Dengan Secure, nama memakai awalan __Host- supaya browser menolak cookie
 * yang di-set tanpa HTTPS, dengan Domain, atau dengan Path selain "/".
 */
final class SessionCookie
{
    public function __construct(
        private readonly bool $secure,
        private readonly int $maxAgeSeconds,
    ) {
    }

    public function name(): string
    {
        return $this->secure ? '__Host-jastip_sesi' : 'jastip_sesi';
    }

    public function issue(string $token): string
    {
        return $this->build($token, $this->maxAgeSeconds);
    }

    public function clear(): string
    {
        return $this->build('', 0);
    }

    private function build(string $value, int $maxAge): string
    {
        $parts = [
            $this->name() . '=' . $value,
            'Path=/',
            'Max-Age=' . $maxAge,
            'HttpOnly',
            'SameSite=Strict',
        ];
        if ($this->secure) {
            $parts[] = 'Secure';
        }

        return implode('; ', $parts);
    }
}
