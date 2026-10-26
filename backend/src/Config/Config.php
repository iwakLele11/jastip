<?php

declare(strict_types=1);

namespace Jastip\Config;

use InvalidArgumentException;

/**
 * Konfigurasi aplikasi dari environment variable (atau file .env).
 * Variabel environment asli selalu menang atas isi .env.
 */
final class Config
{
    public const ENVIRONMENTS = ['development', 'staging', 'production', 'testing'];

    /**
     * @param list<string> $allowedOrigins
     */
    public function __construct(
        public readonly string $appEnv,
        public readonly string $dbHost,
        public readonly int $dbPort,
        public readonly string $dbName,
        public readonly string $dbUser,
        public readonly string $dbPassword,
        public readonly array $allowedOrigins,
        public readonly bool $cookieSecure,
        public readonly int $sessionIdleMinutes,
        public readonly int $loginMaxAttempts,
        public readonly int $loginWindowMinutes,
        public readonly int $loginMaxAttemptsPerIp,
        public readonly string $kursApiUrl,
        public readonly int $kursTimeoutSeconds,
        public readonly string $logPath,
    ) {
        if (!in_array($appEnv, self::ENVIRONMENTS, true)) {
            throw new InvalidArgumentException('APP_ENV harus salah satu dari: ' . implode(', ', self::ENVIRONMENTS));
        }
        if ($dbName === '') {
            throw new InvalidArgumentException('DB_NAME wajib diisi.');
        }
        if ($appEnv === 'production') {
            if (!$cookieSecure) {
                throw new InvalidArgumentException('SESSION_COOKIE_SECURE wajib true di production (HTTPS).');
            }
            foreach ($allowedOrigins as $origin) {
                if (!str_starts_with($origin, 'https://')) {
                    throw new InvalidArgumentException('APP_ALLOWED_ORIGINS di production wajib https.');
                }
            }
        }
    }

    public static function fromEnvironment(string $basePath): self
    {
        $values = EnvLoader::parseFile($basePath . '/.env');
        foreach (array_unique(array_merge(array_keys($values), self::knownKeys())) as $key) {
            $real = getenv($key);
            if ($real !== false) {
                $values[$key] = $real;
            }
        }

        return self::fromArray($values, $basePath);
    }

    /**
     * @param array<string, string> $env
     */
    public static function fromArray(array $env, string $basePath): self
    {
        $logPath = $env['LOG_PATH'] ?? 'storage/logs/app.log';
        if ($logPath !== '' && !str_starts_with($logPath, '/') && !str_starts_with($logPath, 'php://')) {
            $logPath = $basePath . '/' . $logPath;
        }

        return new self(
            appEnv: $env['APP_ENV'] ?? 'production',
            dbHost: $env['DB_HOST'] ?? '127.0.0.1',
            dbPort: self::int($env, 'DB_PORT', 3306),
            dbName: $env['DB_NAME'] ?? '',
            dbUser: $env['DB_USER'] ?? '',
            dbPassword: $env['DB_PASSWORD'] ?? '',
            allowedOrigins: self::origins($env['APP_ALLOWED_ORIGINS'] ?? ''),
            cookieSecure: self::bool($env, 'SESSION_COOKIE_SECURE', true),
            sessionIdleMinutes: self::int($env, 'SESSION_IDLE_MINUTES', 720),
            loginMaxAttempts: self::int($env, 'LOGIN_MAX_ATTEMPTS', 5),
            loginWindowMinutes: self::int($env, 'LOGIN_WINDOW_MINUTES', 15),
            loginMaxAttemptsPerIp: self::int($env, 'LOGIN_MAX_ATTEMPTS_PER_IP', 20),
            kursApiUrl: $env['KURS_API_URL'] ?? 'https://api.frankfurter.dev/v2/rate/aud/idr',
            kursTimeoutSeconds: self::int($env, 'KURS_TIMEOUT_SECONDS', 5),
            logPath: $logPath,
        );
    }

    /**
     * @return list<string>
     */
    private static function knownKeys(): array
    {
        return [
            'APP_ENV', 'APP_ALLOWED_ORIGINS', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
            'SESSION_COOKIE_SECURE', 'SESSION_IDLE_MINUTES', 'LOGIN_MAX_ATTEMPTS', 'LOGIN_WINDOW_MINUTES',
            'LOGIN_MAX_ATTEMPTS_PER_IP', 'KURS_API_URL', 'KURS_TIMEOUT_SECONDS', 'LOG_PATH',
        ];
    }

    /**
     * @return list<string>
     */
    private static function origins(string $raw): array
    {
        $origins = [];
        foreach (explode(',', $raw) as $origin) {
            $origin = rtrim(trim($origin), '/');
            if ($origin !== '') {
                $origins[] = strtolower($origin);
            }
        }

        return $origins;
    }

    /**
     * @param array<string, string> $env
     */
    private static function int(array $env, string $key, int $default): int
    {
        if (!isset($env[$key]) || $env[$key] === '') {
            return $default;
        }
        if (preg_match('/^[0-9]+$/D', $env[$key]) !== 1 || (int) $env[$key] < 1) {
            throw new InvalidArgumentException($key . ' harus bilangan bulat positif.');
        }

        return (int) $env[$key];
    }

    /**
     * @param array<string, string> $env
     */
    private static function bool(array $env, string $key, bool $default): bool
    {
        if (!isset($env[$key]) || $env[$key] === '') {
            return $default;
        }

        return match (strtolower($env[$key])) {
            'true', '1', 'yes', 'on' => true,
            'false', '0', 'no', 'off' => false,
            default => throw new InvalidArgumentException($key . ' harus true atau false.'),
        };
    }
}
