<?php

declare(strict_types=1);

namespace Jastip\Domain;

use InvalidArgumentException;

/**
 * kurs_jastip = bulat_ke_atas_Rp1(kurs_pasar × (1 + buffer%)).
 */
final class KursCalculator
{
    /** Kurs pasar dihitung sebagai bilangan bulat berskala 6 desimal ("mikro rupiah"). */
    public const PASAR_SCALE = 6;

    /**
     * Batas kurs pasar Rp500.000 per AUD (jauh di atas nilai wajar). Dengan buffer maks. 100%,
     * kurs jastip tetap ≤ Pricing::MAX_KURS dan semua hitungan bebas overflow.
     */
    public const MAX_KURS_PASAR_MIKRO = 500_000 * 1_000_000;

    public const MAX_BUFFER_BP = 10_000;

    public static function kursJastip(int $kursPasarMikro, int $bufferBp): int
    {
        if ($kursPasarMikro <= 0 || $kursPasarMikro > self::MAX_KURS_PASAR_MIKRO) {
            throw new InvalidArgumentException('Kurs pasar di luar rentang.');
        }
        if ($bufferBp < 0 || $bufferBp > self::MAX_BUFFER_BP) {
            throw new InvalidArgumentException('Buffer di luar rentang.');
        }

        // P mikro-rupiah × (10000 + bp) / (10^6 × 10^4), dibulatkan ke atas.
        $numerator = $kursPasarMikro * (10_000 + $bufferBp);
        $denominator = 10_000_000_000;

        return intdiv($numerator + $denominator - 1, $denominator);
    }
}
