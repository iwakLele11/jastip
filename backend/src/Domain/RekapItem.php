<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Satu barang di rekap WA, dalam urutan tampil di keranjang.
 */
final class RekapItem
{
    public function __construct(
        public readonly string $namaBarang,
        public readonly int $qty,
        public readonly int $hargaJualUnit,
        public readonly int $subtotal,
        public readonly bool $kosong,
    ) {
    }
}
