<?php

declare(strict_types=1);

namespace Jastip\Domain;

use DomainException;
use InvalidArgumentException;

/**
 * Rumus scope "Total, DP, dan status pembayaran":
 *
 *   total         = Σ subtotal baris yang tidak bertanda Kosong
 *   dp            = bulat_ke_atas_Rp1000(total × DP%)
 *   dana_diterima = Σ pembayaran − Σ pengembalian dana
 *   sisa          = total − dana_diterima
 */
final class CartCalculator
{
    /**
     * @param iterable<OrderLineAmount> $lines
     */
    public static function total(iterable $lines): int
    {
        $total = 0;
        foreach ($lines as $line) {
            if (!$line->kosong) {
                $total += $line->subtotal;
            }
        }

        return $total;
    }

    public static function dp(int $total, int $dpBp): int
    {
        if ($total < 0) {
            throw new InvalidArgumentException('Total tidak boleh negatif.');
        }
        if ($dpBp < 0 || $dpBp > 10_000) {
            throw new InvalidArgumentException('DP di luar rentang.');
        }

        // ceil(total × bp / 10^7) × 1000, dipecah supaya total × bp tidak overflow.
        $unit = 10_000_000;
        $quotient = intdiv($total, $unit);
        $remainder = $total % $unit;
        $thousands = $quotient * $dpBp + intdiv($remainder * $dpBp + $unit - 1, $unit);

        return $thousands * 1_000;
    }

    public static function status(int $total, int $dp, int $danaDiterima): PaymentStatus
    {
        if ($danaDiterima < 0) {
            throw new DomainException('Dana diterima tidak boleh negatif.');
        }

        return match (true) {
            $danaDiterima > $total => PaymentStatus::LebihBayar,
            $danaDiterima === $total => PaymentStatus::Lunas,
            $danaDiterima === 0 => PaymentStatus::BelumBayar,
            $danaDiterima < $dp => PaymentStatus::KurangDp,
            default => PaymentStatus::Dp,
        };
    }

    public static function summarize(int $total, int $dpBp, int $totalPembayaran, int $totalPengembalian): CartSummary
    {
        if ($totalPembayaran < 0 || $totalPengembalian < 0) {
            throw new InvalidArgumentException('Jumlah pembayaran tidak boleh negatif.');
        }

        $dp = self::dp($total, $dpBp);
        $danaDiterima = $totalPembayaran - $totalPengembalian;
        $sisa = $total - $danaDiterima;

        return new CartSummary(
            total: $total,
            dp: $dp,
            dpBp: $dpBp,
            totalPembayaran: $totalPembayaran,
            totalPengembalian: $totalPengembalian,
            danaDiterima: $danaDiterima,
            sisa: max(0, $sisa),
            kelebihanBayar: max(0, -$sisa),
            status: self::status($total, $dp, $danaDiterima),
        );
    }
}
