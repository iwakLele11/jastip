<?php

declare(strict_types=1);

namespace Jastip\Domain;

enum InvalidDecimalReason: string
{
    case Empty = 'kosong';
    case NotANumber = 'bukan_angka';
    case TooManyDecimals = 'terlalu_banyak_desimal';
    case Negative = 'negatif';
    case TooLarge = 'terlalu_besar';
}
