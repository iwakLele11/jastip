<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Domain;

use Jastip\Domain\DecimalFormatter;
use Jastip\Domain\DecimalParser;
use Jastip\Domain\InvalidDecimal;
use Jastip\Domain\InvalidDecimalReason;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DecimalParserTest extends TestCase
{
    /**
     * @return array<string, array{string, int, int}>
     */
    public static function validInputs(): array
    {
        return [
            'titik desimal' => ['24.95', 2, 2495],
            'koma desimal' => ['24,95', 2, 2495],
            'satu desimal' => ['8.5', 2, 850],
            'tanpa desimal' => ['129', 2, 12900],
            'harga C' => ['129,99', 2, 12999],
            'spasi di tepi' => [' 10 ', 2, 1000],
            'nol di depan' => ['024.95', 2, 2495],
            'nol' => ['0', 2, 0],
            'persen desimal' => ['3,5', 2, 350],
            'kurs pasar bulat' => ['12673', 6, 12_673_000_000],
            'kurs pasar desimal' => ['12673.45', 6, 12_673_450_000],
            'minus nol' => ['-0', 2, 0],
        ];
    }

    #[DataProvider('validInputs')]
    public function testParsesValidInput(string $input, int $scale, int $expected): void
    {
        self::assertSame($expected, DecimalParser::parse($input, $scale));
    }

    /**
     * @return array<string, array{string, InvalidDecimalReason}>
     */
    public static function invalidInputs(): array
    {
        return [
            'kosong' => ['', InvalidDecimalReason::Empty],
            'spasi saja' => ['   ', InvalidDecimalReason::Empty],
            'huruf' => ['abc', InvalidDecimalReason::NotANumber],
            'titik di akhir' => ['24.', InvalidDecimalReason::NotANumber],
            'titik di awal' => ['.5', InvalidDecimalReason::NotANumber],
            'pemisah ganda' => ['1.299,00', InvalidDecimalReason::NotANumber],
            'eksponen' => ['1e3', InvalidDecimalReason::NotANumber],
            'mata uang' => ['AUD 24,95', InvalidDecimalReason::NotANumber],
            '1.299 dibaca 3 desimal' => ['1.299', InvalidDecimalReason::TooManyDecimals],
            '3 desimal koma' => ['24,955', InvalidDecimalReason::TooManyDecimals],
            'negatif' => ['-5', InvalidDecimalReason::Negative],
            'terlalu besar' => ['1234567890123', InvalidDecimalReason::TooLarge],
        ];
    }

    #[DataProvider('invalidInputs')]
    public function testRejectsInvalidInput(string $input, InvalidDecimalReason $reason): void
    {
        try {
            DecimalParser::parse($input, 2);
            self::fail('Seharusnya ditolak: ' . $input);
        } catch (InvalidDecimal $e) {
            self::assertSame($reason, $e->reason);
        }
    }

    public function testRoundHalfUpForExternalRates(): void
    {
        self::assertSame(12_673_123_457, DecimalParser::parseRoundHalfUp('12673.1234565', 6));
        self::assertSame(12_673_123_456, DecimalParser::parseRoundHalfUp('12673.1234564', 6));
        self::assertSame(12_673_000_000, DecimalParser::parseRoundHalfUp('12673', 6));
    }

    public function testFormatterRoundTrips(): void
    {
        self::assertSame('24.95', DecimalFormatter::fixed(2495, 2));
        self::assertSame('8.50', DecimalFormatter::fixed(850, 2));
        self::assertSame('0.05', DecimalFormatter::fixed(5, 2));
        self::assertSame('10', DecimalFormatter::trimmed(1000, 2));
        self::assertSame('3.5', DecimalFormatter::trimmed(350, 2));
        self::assertSame('0', DecimalFormatter::trimmed(0, 2));
        self::assertSame('12673', DecimalFormatter::trimmed(12_673_000_000, 6));
        self::assertSame('12673.45', DecimalFormatter::trimmed(12_673_450_000, 6));
    }
}
