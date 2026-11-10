<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Auth;

use Jastip\Auth\PhpPasswordHasher;
use PHPUnit\Framework\TestCase;

final class PhpPasswordHasherTest extends TestCase
{
    public function testHashDummyKonstanDenganCostSamaDenganPasswordDefault(): void
    {
        $dummy = (new PhpPasswordHasher())->dummyHash();

        // Diambil dari daftar yang sudah dihitung, bukan password_hash() di setiap request.
        self::assertContains($dummy, PhpPasswordHasher::DUMMY_HASHES);
        self::assertSame($dummy, (new PhpPasswordHasher())->dummyHash());
        self::assertSame(PASSWORD_DEFAULT, password_get_info($dummy)['algo']);
        self::assertFalse(
            password_needs_rehash($dummy, PASSWORD_DEFAULT),
            'Cost default PASSWORD_DEFAULT di PHP ini tidak ada di PhpPasswordHasher::DUMMY_HASHES. Tambahkan hash untuk cost itu.',
        );
    }

    public function testSemuaHashDummyBcryptDenganCostSesuaiKunci(): void
    {
        foreach (PhpPasswordHasher::DUMMY_HASHES as $cost => $hash) {
            $info = password_get_info($hash);
            self::assertSame('bcrypt', $info['algoName']);
            self::assertSame($cost, $info['options']['cost']);
        }
    }

    public function testHashVerifyDanRehash(): void
    {
        $hasher = new PhpPasswordHasher();
        $hash = $hasher->hash('kata-sandi-uji-123');

        self::assertTrue($hasher->verify('kata-sandi-uji-123', $hash));
        self::assertFalse($hasher->verify('kata-sandi-salah', $hash));
        self::assertFalse($hasher->needsRehash($hash));
        self::assertTrue($hasher->needsRehash(password_hash('x', PASSWORD_BCRYPT, ['cost' => 4])));
    }
}
