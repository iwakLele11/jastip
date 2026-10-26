<?php

declare(strict_types=1);

namespace Jastip\Domain;

enum RefundViolation: string
{
    /** Status bukan Lebih bayar, tombol pengembalian dana nonaktif. */
    case BukanLebihBayar = 'bukan_lebih_bayar';
    case NominalTidakPositif = 'nominal_tidak_positif';
    case MelebihiKelebihanBayar = 'melebihi_kelebihan_bayar';
}
