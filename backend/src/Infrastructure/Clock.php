<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

use DateTimeImmutable;

interface Clock
{
    /** Waktu sekarang dalam UTC. */
    public function now(): DateTimeImmutable;
}
