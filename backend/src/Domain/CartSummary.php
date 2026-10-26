<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Ringkasan uang satu keranjang. sisa dan kelebihan_bayar tidak pernah negatif:
 * sisa = max(0, total − dana_diterima), kelebihan_bayar = max(0, dana_diterima − total).
 */
final class CartSummary
{
    public function __construct(
        public readonly int $total,
        public readonly int $dp,
        public readonly int $dpBp,
        public readonly int $totalPembayaran,
        public readonly int $totalPengembalian,
        public readonly int $danaDiterima,
        public readonly int $sisa,
        public readonly int $kelebihanBayar,
        public readonly PaymentStatus $status,
    ) {
    }

    /**
     * @return array<string, int|string>
     */
    public function toArray(): array
    {
        return [
            'total' => $this->total,
            'dp' => $this->dp,
            'dp_persen' => DecimalFormatter::trimmed($this->dpBp, 2),
            'total_pembayaran' => $this->totalPembayaran,
            'total_pengembalian' => $this->totalPengembalian,
            'dana_diterima' => $this->danaDiterima,
            'sisa' => $this->sisa,
            'kelebihan_bayar' => $this->kelebihanBayar,
            'status' => $this->status->value,
        ];
    }
}
