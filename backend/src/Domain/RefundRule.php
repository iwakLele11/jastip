<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Aturan pengembalian dana (scope M6):
 * - hanya saat status Lebih bayar,
 * - nominal > 0 dan ≤ kelebihan bayar,
 * - pengembalian dana selalu boleh dihapus.
 */
final class RefundRule
{
    public static function check(CartSummary $summary, int $nominal): ?RefundViolation
    {
        if ($summary->status !== PaymentStatus::LebihBayar) {
            return RefundViolation::BukanLebihBayar;
        }
        if ($nominal <= 0) {
            return RefundViolation::NominalTidakPositif;
        }
        if ($nominal > $summary->kelebihanBayar) {
            return RefundViolation::MelebihiKelebihanBayar;
        }

        return null;
    }

    /** Pesan field "nominal" ui-spec §9.3. */
    public static function message(RefundViolation $violation, CartSummary $summary): string
    {
        return match ($violation) {
            RefundViolation::BukanLebihBayar => 'Pengembalian dana hanya bisa dicatat saat status Lebih bayar.',
            RefundViolation::NominalTidakPositif => 'Nominal harus lebih dari Rp0.',
            RefundViolation::MelebihiKelebihanBayar => sprintf(
                'Nominal maksimal %s (kelebihan bayar).',
                Rupiah::format($summary->kelebihanBayar),
            ),
        };
    }
}
