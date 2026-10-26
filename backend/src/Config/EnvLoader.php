<?php

declare(strict_types=1);

namespace Jastip\Config;

/**
 * Pembaca file .env sederhana: KEY=VALUE per baris, # untuk komentar,
 * nilai boleh diapit tanda kutip. Tanpa ekspansi variabel.
 */
final class EnvLoader
{
    /**
     * @return array<string, string>
     */
    public static function parseFile(string $path): array
    {
        if (!is_file($path) || !is_readable($path)) {
            return [];
        }

        $values = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if (preg_match('/^[A-Z][A-Z0-9_]*$/D', $key) !== 1) {
                continue;
            }
            $values[$key] = self::unquote($value);
        }

        return $values;
    }

    private static function unquote(string $value): string
    {
        $length = strlen($value);
        if ($length >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[$length - 1] === $value[0]) {
            return substr($value, 1, -1);
        }

        return $value;
    }
}
