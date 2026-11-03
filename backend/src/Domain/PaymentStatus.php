<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Status pembayaran keranjang. Nilai = kode di API (ui-spec §9.2).
 */
enum PaymentStatus: string
{
    case BelumBayar = 'belum_bayar';
    case KurangDp = 'kurang_dp';
    case Dp = 'dp';
    case Lunas = 'lunas';
    case LebihBayar = 'lebih_bayar';

    /** Label badge di layar. */
    public function label(): string
    {
        return match ($this) {
            self::BelumBayar => 'Belum bayar',
            self::KurangDp => 'Kurang DP',
            self::Dp => 'DP',
            self::Lunas => 'Lunas',
            self::LebihBayar => 'Lebih bayar',
        };
    }

    /** Teks setelah "Status: " di rekap WA. */
    public function rekapLabel(): string
    {
        return match ($this) {
            self::BelumBayar => 'BELUM BAYAR',
            self::KurangDp => 'KURANG DP',
            self::Dp => 'DP DITERIMA ✅',
            self::Lunas => 'LUNAS ✅',
            self::LebihBayar => 'LEBIH BAYAR',
        };
    }
}
