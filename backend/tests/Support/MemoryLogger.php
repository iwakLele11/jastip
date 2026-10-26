<?php

declare(strict_types=1);

namespace Jastip\Tests\Support;

use Jastip\Infrastructure\Logger;

final class MemoryLogger implements Logger
{
    /** @var list<array{level: string, event: string, context: array<string, scalar|null>}> */
    public array $records = [];

    public function error(string $event, array $context = []): void
    {
        $this->records[] = ['level' => 'error', 'event' => $event, 'context' => $context];
    }

    public function warning(string $event, array $context = []): void
    {
        $this->records[] = ['level' => 'warning', 'event' => $event, 'context' => $context];
    }

    public function info(string $event, array $context = []): void
    {
        $this->records[] = ['level' => 'info', 'event' => $event, 'context' => $context];
    }

    public function dump(): string
    {
        return (string) json_encode($this->records, JSON_UNESCAPED_UNICODE);
    }

    /**
     * @return list<string>
     */
    public function events(): array
    {
        return array_map(static fn (array $r): string => $r['event'], $this->records);
    }
}
