<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Bagian baris pesanan yang dibutuhkan untuk menghitung total keranjang.
 */
final class OrderLineAmount
{
    public function __construct(
        public readonly int $subtotal,
        public readonly bool $kosong,
    ) {
    }
}
