<?php

declare(strict_types=1);

namespace Jastip\Tests\Support;

use DateTimeImmutable;
use DateTimeZone;
use Jastip\Infrastructure\Clock;

final class MutableClock implements Clock
{
    private DateTimeImmutable $now;

    public function __construct(string $start = '2026-10-25 09:00:00')
    {
        $this->now = new DateTimeImmutable($start, new DateTimeZone('UTC'));
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }

    public function advance(string $modifier): void
    {
        $this->now = $this->now->modify($modifier);
    }
}
