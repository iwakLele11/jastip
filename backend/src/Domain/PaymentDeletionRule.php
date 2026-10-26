<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Pembayaran tidak bisa dihapus jika setelah dihapus Σ pembayaran < Σ pengembalian dana
 * (dana diterima jadi negatif). Admin harus menghapus pengembalian dana lebih dulu.
 */
final class PaymentDeletionRule
{
    public static function canDelete(int $totalPembayaran, int $totalPengembalian, int $nominalDihapus): bool
    {
        return $totalPembayaran - $nominalDihapus >= $totalPengembalian;
    }

    /** Isi dialog info ui-spec §9.5 "Hapus pengembalian dana dulu". */
    public static function blockedMessage(int $totalPengembalian): string
    {
        return sprintf(
            'Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana %s. '
            . 'Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini.',
            Rupiah::format($totalPengembalian),
        );
    }
}
