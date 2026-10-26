<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\CartCalculator;
use Jastip\Domain\CartSummary;
use Jastip\Domain\OrderLineAmount;

/**
 * Mengubah baris database keranjang menjadi input modul Domain. Semua aturan
 * (total tanpa baris Kosong, DP, status) tetap di CartCalculator.
 */
final class CartState
{
    /**
     * @param list<array<string, mixed>> $lines kolom subtotal + kosong
     * @param list<array<string, mixed>> $payments kolom nominal
     * @param list<array<string, mixed>> $refunds kolom nominal
     */
    public static function summarize(array $lines, array $payments, array $refunds, int $dpBp): CartSummary
    {
        return CartCalculator::summarize(
            CartCalculator::total(self::amounts($lines)),
            $dpBp,
            self::sum($payments),
            self::sum($refunds),
        );
    }

    /**
     * @param list<array<string, mixed>> $lines
     * @return list<OrderLineAmount>
     */
    public static function amounts(array $lines): array
    {
        return array_map(
            static fn (array $line): OrderLineAmount => new OrderLineAmount((int) $line['subtotal'], (bool) $line['kosong']),
            $lines,
        );
    }

    /**
     * @param list<array<string, mixed>> $rows
     */
    public static function sum(array $rows): int
    {
        $total = 0;
        foreach ($rows as $row) {
            $total += (int) $row['nominal'];
        }

        return $total;
    }
}
