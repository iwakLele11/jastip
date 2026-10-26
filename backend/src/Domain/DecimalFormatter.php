<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Mengubah bilangan bulat berskala kembali menjadi string desimal kanonik
 * (titik sebagai pemisah desimal, tanpa pemisah ribuan) untuk respons API.
 */
final class DecimalFormatter
{
    /** Selalu $scale desimal: 2495 (skala 2) menjadi "24.95", 850 menjadi "8.50". */
    public static function fixed(int $scaled, int $scale): string
    {
        $negative = $scaled < 0;
        $digits = str_pad((string) abs($scaled), $scale + 1, '0', STR_PAD_LEFT);
        $integer = substr($digits, 0, strlen($digits) - $scale);
        $fraction = substr($digits, strlen($digits) - $scale);

        return ($negative ? '-' : '') . $integer . ($scale > 0 ? '.' . $fraction : '');
    }

    /** Nol di belakang dibuang: 1000 (skala 2) menjadi "10", 350 menjadi "3.5". */
    public static function trimmed(int $scaled, int $scale): string
    {
        $fixed = self::fixed($scaled, $scale);

        return $scale > 0 ? rtrim(rtrim($fixed, '0'), '.') : $fixed;
    }
}
