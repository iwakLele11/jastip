<?php

declare(strict_types=1);

namespace Jastip\Domain;

use InvalidArgumentException;

final class InvalidWhatsAppNumber extends InvalidArgumentException
{
    public const KOSONG = 'kosong';
    public const BUKAN_ANGKA = 'bukan_angka';
    public const AWALAN = 'awalan';
    public const PANJANG = 'panjang';

    private const MESSAGES = [
        self::KOSONG => 'No WA wajib diisi.',
        self::BUKAN_ANGKA => 'No WA hanya boleh berisi angka.',
        self::AWALAN => 'No WA harus diawali 08, 62, atau +62.',
        self::PANJANG => 'No WA harus 10–14 digit (format 08…).',
    ];

    public function __construct(public readonly string $reason)
    {
        parent::__construct(self::MESSAGES[$reason]);
    }
}
