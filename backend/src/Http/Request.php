<?php

declare(strict_types=1);

namespace Jastip\Http;

use JsonException;

final class Request
{
    public const MAX_BODY_BYTES = 65_536;

    /** @var array<string, string> nama header lowercase => nilai */
    public readonly array $headers;

    /** @var array<string, mixed>|null */
    private ?array $json = null;

    /**
     * @param array<string, mixed> $query
     * @param array<string, string> $headers
     * @param array<string, string> $cookies
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query = [],
        array $headers = [],
        public readonly string $body = '',
        public readonly array $cookies = [],
        public readonly string $clientIp = '',
    ) {
        $normalized = [];
        foreach ($headers as $name => $value) {
            $normalized[strtolower((string) $name)] = (string) $value;
        }
        $this->headers = $normalized;
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (is_string($key) && str_starts_with($key, 'HTTP_') && is_scalar($value)) {
                $headers[str_replace('_', '-', strtolower(substr($key, 5)))] = (string) $value;
            }
        }
        foreach (['CONTENT_TYPE' => 'content-type', 'CONTENT_LENGTH' => 'content-length'] as $key => $name) {
            if (isset($_SERVER[$key]) && is_scalar($_SERVER[$key])) {
                $headers[$name] = (string) $_SERVER[$key];
            }
        }
        // Apache + FastCGI kadang memindahkan header Authorization.
        if (!isset($headers['authorization']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['authorization'] = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }

        $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
        $body = file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES + 1);

        /** @var array<string, string> $cookies */
        $cookies = array_filter($_COOKIE, 'is_string');

        return new self(
            method: strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            path: is_string($path) && $path !== '' ? $path : '/',
            query: $_GET,
            headers: $headers,
            body: $body === false ? '' : $body,
            cookies: $cookies,
            clientIp: (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /**
     * Body JSON sebagai objek. Body kosong dianggap {}.
     *
     * @return array<string, mixed>
     */
    public function json(): array
    {
        if ($this->json !== null) {
            return $this->json;
        }
        if (trim($this->body) === '') {
            return $this->json = [];
        }

        try {
            $data = json_decode($this->body, true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (JsonException) {
            throw new HttpError(400, 'JSON_TIDAK_VALID', 'Format JSON tidak valid.');
        }
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw new HttpError(400, 'JSON_TIDAK_VALID', 'Body harus berupa objek JSON.');
        }

        /** @var array<string, mixed> $data */
        return $this->json = $data;
    }

    public function queryString(string $key): ?string
    {
        $value = $this->query[$key] ?? null;

        return is_string($value) ? $value : null;
    }
}
