<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Domain;

use Jastip\Domain\InvalidWhatsAppNumber;
use Jastip\Domain\Rupiah;
use Jastip\Domain\WhatsAppNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class WhatsAppNumberTest extends TestCase
{
    /**
     * @return array<string, array{string}>
     */
    public static function samaDenganRina(): array
    {
        return [
            'awalan 08' => ['081234567890'],
            'awalan 62' => ['6281234567890'],
            'awalan +62' => ['+6281234567890'],
            'tanda hubung' => ['0812-3456-7890'],
            'spasi' => ['0812 3456 7890'],
            'kurung dan spasi' => ['(0812) 3456 7890'],
            '+62 dengan spasi' => ['+62 812 3456 7890'],
        ];
    }

    #[DataProvider('samaDenganRina')]
    public function testNormalisasiKeFormatKanonik(string $input): void
    {
        $number = WhatsAppNumber::fromInput($input);

        self::assertSame('6281234567890', $number->canonical());
        self::assertSame('081234567890', $number->display());
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function inputSalah(): array
    {
        return [
            'kosong' => ['', InvalidWhatsAppNumber::KOSONG, 'No WA wajib diisi.'],
            'huruf' => ['0812abc', InvalidWhatsAppNumber::BUKAN_ANGKA, 'No WA hanya boleh berisi angka.'],
            'simbol' => ['0812#3456', InvalidWhatsAppNumber::BUKAN_ANGKA, 'No WA hanya boleh berisi angka.'],
            'plus di tengah' => ['0812+3456', InvalidWhatsAppNumber::BUKAN_ANGKA, 'No WA hanya boleh berisi angka.'],
            'awalan 021' => ['0215551234', InvalidWhatsAppNumber::AWALAN, 'No WA harus diawali 08, 62, atau +62.'],
            'awalan 8' => ['81234567890', InvalidWhatsAppNumber::AWALAN, 'No WA harus diawali 08, 62, atau +62.'],
            'negara lain' => ['+6591234567', InvalidWhatsAppNumber::AWALAN, 'No WA harus diawali 08, 62, atau +62.'],
            'terlalu pendek' => ['0812345', InvalidWhatsAppNumber::PANJANG, 'No WA harus 10–14 digit (format 08…).'],
            'terlalu panjang' => ['081234567890123', InvalidWhatsAppNumber::PANJANG, 'No WA harus 10–14 digit (format 08…).'],
        ];
    }

    #[DataProvider('inputSalah')]
    public function testMenolakInputSalah(string $input, string $reason, string $message): void
    {
        try {
            WhatsAppNumber::fromInput($input);
            self::fail('Seharusnya ditolak: ' . $input);
        } catch (InvalidWhatsAppNumber $e) {
            self::assertSame($reason, $e->reason);
            self::assertSame($message, $e->getMessage());
        }
    }

    public function testPolaPencarian(): void
    {
        self::assertSame(['mode' => 'awalan', 'digit' => '62812'], WhatsAppNumber::searchPattern('0812'));
        self::assertSame(['mode' => 'awalan', 'digit' => '62812'], WhatsAppNumber::searchPattern('+62812'));
        self::assertSame(['mode' => 'awalan', 'digit' => '62812'], WhatsAppNumber::searchPattern('62812'));
        self::assertSame(['mode' => 'mengandung', 'digit' => '7890'], WhatsAppNumber::searchPattern('7890'));
        self::assertNull(WhatsAppNumber::searchPattern('Rina'));
        self::assertNull(WhatsAppNumber::searchPattern('08'));
    }

    public function testFormatRupiah(): void
    {
        self::assertSame('Rp0', Rupiah::format(0));
        self::assertSame('Rp384.000', Rupiah::format(384_000));
        self::assertSame('Rp1.234.567', Rupiah::format(1_234_567));
        self::assertSame('Rp1.833.000', Rupiah::format(1_833_000));
    }
}
