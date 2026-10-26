<?php

declare(strict_types=1);

namespace Jastip\Domain;

use InvalidArgumentException;

/**
 * Harga jual per baris pesanan, persis ui-spec §12.3 (hanya bilangan bulat):
 *
 *   N               = harga_sen × kurs × (10000 + markup_bp)   (satuan 1/10.000 sen rupiah)
 *   sen             = floor((2N + 10000) / 20000)              (bulat 2 desimal half-up)
 *   harga_jual_unit = ceil(sen / 100000) × 1000                (bulat ke atas ke Rp1.000)
 *   subtotal        = harga_jual_unit × qty
 */
final class Pricing
{
    /** AUD 100.000,00. */
    public const MAX_HARGA_SEN = 10_000_000;
    /** Rp1.000.000 per AUD. */
    public const MAX_KURS = 1_000_000;
    /** 100%. */
    public const MAX_MARKUP_BP = 10_000;
    public const MAX_QTY = 999;

    public static function hargaJualUnit(int $hargaSen, int $kursJastip, int $markupBp): int
    {
        if ($hargaSen <= 0 || $hargaSen > self::MAX_HARGA_SEN) {
            throw new InvalidArgumentException('Harga AUD di luar rentang.');
        }
        if ($kursJastip <= 0 || $kursJastip > self::MAX_KURS) {
            throw new InvalidArgumentException('Kurs di luar rentang.');
        }
        if ($markupBp < 0 || $markupBp > self::MAX_MARKUP_BP) {
            throw new InvalidArgumentException('Markup di luar rentang.');
        }

        // Nilai maksimum N = 1e7 × 1e6 × 2e4 = 2e17, aman di bawah PHP_INT_MAX (9,2e18).
        $n = $hargaSen * $kursJastip * (10_000 + $markupBp);
        $sen = intdiv(2 * $n + 10_000, 20_000);

        return intdiv($sen + 99_999, 100_000) * 1_000;
    }

    public static function subtotal(int $hargaJualUnit, int $qty): int
    {
        if ($qty < 1 || $qty > self::MAX_QTY) {
            throw new InvalidArgumentException('Qty di luar rentang.');
        }

        return $hargaJualUnit * $qty;
    }
}
