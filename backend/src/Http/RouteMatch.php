<?php

declare(strict_types=1);

namespace Jastip\Http;

use Closure;

final class RouteMatch
{
    /**
     * @param array<string, int> $params
     */
    public function __construct(
        public readonly Closure $handler,
        public readonly array $params,
        public readonly bool $public,
    ) {
    }
}
