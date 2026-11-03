<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Auth;

use Jastip\Auth\Username;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class UsernameTest extends TestCase
{
    /**
     * @return array<string, array{string, string}>
     */
    public static function valid(): array
    {
        return [
            'huruf kecil' => ['pemilik', 'pemilik'],
            'huruf besar' => ['PEMILIK', 'pemilik'],
            'campuran' => ['PeMiLiK', 'pemilik'],
            'spasi di tepi' => ['  pemilik ', 'pemilik'],
            'tab dan baris baru di tepi' => ["\tpemilik\n", 'pemilik'],
            'angka, titik, garis bawah, tanda hubung' => ['Admin.Toko_2-B', 'admin.toko_2-b'],
            '3 karakter' => ['abc', 'abc'],
            '50 karakter' => [str_repeat('A', 50), str_repeat('a', 50)],
        ];
    }

    #[DataProvider('valid')]
    public function testNormalisasiKeHurufKecilAscii(string $input, string $expected): void
    {
        self::assertSame($expected, Username::normalize($input));
    }

    /**
     * Banyak di antaranya dianggap sama dengan nama ASCII oleh collation utf8mb4_unicode_ci.
     *
     * @return array<string, array{string}>
     */
    public static function invalid(): array
    {
        return [
            'aksen (satu code point)' => ['qáthrottle'],
            'aksen (combining mark)' => ["qa\u{0301}throttle"],
            'umlaut' => ['qathröttle'],
            'fullwidth' => ['ｑａｔｈｒｏｔｔｌｅ'],
            'soft hyphen' => ["qathrottle\u{00AD}"],
            'zero width space' => ["qat\u{200B}hrottle"],
            'NBSP di tepi (tidak di-trim)' => ["\u{00A0}qathrottle"],
            'Kelvin sign (mb_strtolower jadi k)' => ["\u{212A}admin"],
            'I bertitik' => ["\u{0130}admin"],
            'spasi di tengah' => ['qa throttle'],
            'terlalu pendek' => ['ab'],
            'terlalu panjang' => [str_repeat('a', 51)],
            'hanya spasi' => ['   '],
            'petik' => ["admin'--"],
            'baris baru di tengah' => ["adm\nin"],
        ];
    }

    #[DataProvider('invalid')]
    public function testDiLuarPolaDitolak(string $input): void
    {
        self::assertNull(Username::normalize($input));
    }

    public function testIsValidTidakMembuangSpasi(): void
    {
        // Aturan bin/create-admin.php: nama disimpan persis seperti argumen.
        self::assertTrue(Username::isValid('Pemilik'));
        self::assertFalse(Username::isValid(' pemilik'));
    }
}
