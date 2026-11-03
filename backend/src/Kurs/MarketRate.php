<?php

declare(strict_types=1);

namespace Jastip\Kurs;

/**
 * Kurs pasar AUD→IDR. Nilai disimpan sebagai bilangan bulat berskala 6 desimal.
 */
final class MarketRate
{
    public function __construct(
        public readonly int $rateMikro,
        public readonly string $date,
    ) {
    }
}
