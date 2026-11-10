<?php

declare(strict_types=1);

namespace Jastip\Tests\Support;

use Jastip\Auth\PasswordHasher;
use Jastip\Auth\PhpPasswordHasher;

/**
 * PhpPasswordHasher sungguhan + penghitung panggilan, untuk memastikan berapa kali kata sandi
 * benar-benar diperiksa (dan terhadap hash apa).
 */
final class CountingPasswordHasher implements PasswordHasher
{
    public int $hashCalls = 0;
    /** @var list<string> hash yang dipakai di setiap verify(), berurutan */
    public array $verified = [];

    public function __construct(private readonly PasswordHasher $inner = new PhpPasswordHasher())
    {
    }

    public function reset(): void
    {
        $this->hashCalls = 0;
        $this->verified = [];
    }

    public function verifyCalls(): int
    {
        return count($this->verified);
    }

    /** Berapa kali verify() dijalankan terhadap hash tertentu (mis. hash milik satu admin). */
    public function verifiedAgainst(string $hash): int
    {
        return count(array_filter($this->verified, static fn (string $h): bool => $h === $hash));
    }

    public function hash(string $password): string
    {
        $this->hashCalls++;

        return $this->inner->hash($password);
    }

    public function verify(string $password, string $hash): bool
    {
        $this->verified[] = $hash;

        return $this->inner->verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return $this->inner->needsRehash($hash);
    }

    public function dummyHash(): string
    {
        return $this->inner->dummyHash();
    }
}
