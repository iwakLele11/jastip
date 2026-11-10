<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

/**
 * Menulis satu baris JSON per kejadian ke file (atau php://stderr).
 */
final class FileLogger implements Logger
{
    public function __construct(private readonly string $path, private readonly Clock $clock)
    {
    }

    public function error(string $event, array $context = []): void
    {
        $this->write('error', $event, $context);
    }

    public function warning(string $event, array $context = []): void
    {
        $this->write('warning', $event, $context);
    }

    public function info(string $event, array $context = []): void
    {
        $this->write('info', $event, $context);
    }

    /**
     * @param array<string, scalar|null> $context
     */
    private function write(string $level, string $event, array $context): void
    {
        $line = json_encode(
            ['waktu' => $this->clock->now()->format('Y-m-d\TH:i:s\Z'), 'level' => $level, 'kejadian' => $event]
                + ($context === [] ? [] : ['konteks' => $context]),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE,
        );
        if (!str_starts_with($this->path, 'php://')) {
            $dir = dirname($this->path);
            if (!is_dir($dir)) {
                @mkdir($dir, 0750, true);
            }
        }
        if (@file_put_contents($this->path, $line . "\n", FILE_APPEND | LOCK_EX) === false) {
            error_log('jastip: gagal menulis log ke ' . $this->path . ': ' . $line);
        }
    }
}
