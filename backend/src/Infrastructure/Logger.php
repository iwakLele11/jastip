<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

/**
 * Logger aplikasi. Jangan pernah memasukkan kata sandi, token, atau data pribadi
 * customer (nama, no WA, alamat) ke $context.
 */
interface Logger
{
    /**
     * @param array<string, scalar|null> $context
     */
    public function error(string $event, array $context = []): void;

    /**
     * @param array<string, scalar|null> $context
     */
    public function warning(string $event, array $context = []): void;

    /**
     * @param array<string, scalar|null> $context
     */
    public function info(string $event, array $context = []): void;
}
