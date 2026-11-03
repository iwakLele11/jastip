<?php

declare(strict_types=1);

namespace Jastip\Repository;

/**
 * Fragmen SQL bersama untuk aturan "keranjang berisi": keranjang punya minimal satu
 * baris pesanan (termasuk Kosong), pembayaran, atau pengembalian dana.
 * Hanya keranjang berisi yang membuat customer tampil di Open PO (ui-spec §13 P1)
 * dan menandai customer "punya pesanan" (arsip, bukan hapus).
 */
final class KeranjangSql
{
    public static function berisi(string $alias): string
    {
        return sprintf(
            '(EXISTS (SELECT 1 FROM baris_pesanan bx WHERE bx.keranjang_id = %1$s.id)'
            . ' OR EXISTS (SELECT 1 FROM pembayaran px WHERE px.keranjang_id = %1$s.id)'
            . ' OR EXISTS (SELECT 1 FROM pengembalian_dana rx WHERE rx.keranjang_id = %1$s.id))',
            $alias,
        );
    }
}
