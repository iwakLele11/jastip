<?php

declare(strict_types=1);

namespace Jastip\Domain;

use InvalidArgumentException;

final class InvalidDecimal extends InvalidArgumentException
{
    public function __construct(public readonly InvalidDecimalReason $reason)
    {
        parent::__construct('Angka desimal tidak valid: ' . $reason->value);
    }
}
