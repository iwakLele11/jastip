<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Format rupiah ui-spec §10: "Rp" + titik ribuan, tanpa spasi dan desimal.
 */
final class Rupiah
{
    public static function format(int $amount): string
    {
        $digits = (string) abs($amount);
        $grouped = ltrim(strrev(chunk_split(strrev($digits), 3, '.')), '.');

        return ($amount < 0 ? '-' : '') . 'Rp' . $grouped;
    }
}
