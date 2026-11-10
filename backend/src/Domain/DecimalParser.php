<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Mengubah string desimal menjadi bilangan bulat berskala, tanpa float.
 *
 * Contoh dengan skala 2: "24.95" dan "24,95" menjadi 2495, "8.5" menjadi 850.
 * Pemisah ribuan tidak diterima, jadi "1.299" dibaca sebagai 1 koma 299
 * (3 desimal) dan ditolak untuk skala 2 (ui-spec §9.3).
 */
final class DecimalParser
{
    /** Batas digit bagian bulat supaya hasil berskala tetap di bawah PHP_INT_MAX. */
    private const MAX_INTEGER_DIGITS = 12;

    /**
     * @throws InvalidDecimal
     */
    public static function parse(string $input, int $scale): int
    {
        [$negative, $integer, $fraction] = self::split($input);
        if (strlen($fraction) > $scale) {
            throw new InvalidDecimal(InvalidDecimalReason::TooManyDecimals);
        }

        $value = self::combine($integer, str_pad($fraction, $scale, '0'), $scale);
        if ($negative && $value !== 0) {
            throw new InvalidDecimal(InvalidDecimalReason::Negative);
        }

        return $value;
    }

    /**
     * Seperti parse(), tetapi desimal lebih dari $scale dibulatkan half-up.
     * Dipakai untuk kurs pasar dari API eksternal.
     *
     * @throws InvalidDecimal
     */
    public static function parseRoundHalfUp(string $input, int $scale): int
    {
        [$negative, $integer, $fraction] = self::split($input);
        $roundUp = strlen($fraction) > $scale && $fraction[$scale] >= '5';
        $kept = str_pad(substr($fraction, 0, $scale), $scale, '0');

        $value = self::combine($integer, $kept, $scale) + ($roundUp ? 1 : 0);
        if ($negative && $value !== 0) {
            throw new InvalidDecimal(InvalidDecimalReason::Negative);
        }

        return $value;
    }

    /**
     * @return array{bool, string, string}
     */
    private static function split(string $input): array
    {
        $value = trim($input);
        if ($value === '') {
            throw new InvalidDecimal(InvalidDecimalReason::Empty);
        }
        if (preg_match('/^(-?)([0-9]+)(?:[.,]([0-9]+))?$/D', $value, $match) !== 1) {
            throw new InvalidDecimal(InvalidDecimalReason::NotANumber);
        }

        $integer = ltrim($match[2], '0');
        if (strlen($integer) > self::MAX_INTEGER_DIGITS) {
            throw new InvalidDecimal(InvalidDecimalReason::TooLarge);
        }

        return [$match[1] === '-', $integer === '' ? '0' : $integer, $match[3] ?? ''];
    }

    private static function combine(string $integer, string $fraction, int $scale): int
    {
        return (int) $integer * (10 ** $scale) + ($scale > 0 ? (int) $fraction : 0);
    }
}
