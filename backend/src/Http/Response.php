<?php

declare(strict_types=1);

namespace Jastip\Http;

final class Response
{
    /**
     * @param array<string, mixed>|null $payload
     * @param array<string, string> $headers
     * @param array<string, string> $cookies nama cookie => nilai header Set-Cookie
     */
    private function __construct(
        public readonly int $status,
        public readonly ?array $payload,
        private array $headers = [],
        private array $cookies = [],
    ) {
    }

    /**
     * @param array<string, mixed>|null $meta
     */
    public static function data(mixed $data, int $status = 200, ?array $meta = null): self
    {
        $payload = ['data' => $data];
        if ($meta !== null) {
            $payload['meta'] = $meta;
        }

        return new self($status, $payload);
    }

    public static function noContent(): self
    {
        return new self(204, null);
    }

    public static function fromError(HttpError $error): self
    {
        $body = ['kode' => $error->kode, 'pesan' => $error->getMessage()];
        if ($error->fields !== []) {
            $body['field'] = $error->fields;
        }

        $response = new self($error->status, ['error' => $body]);
        foreach ($error->headers as $name => $value) {
            $response = $response->withHeader($name, $value);
        }

        return $response;
    }

    public function withHeader(string $name, string $value): self
    {
        $clone = clone $this;
        $clone->headers[$name] = $value;

        return $clone;
    }

    public function withCookie(string $name, string $setCookieValue): self
    {
        $clone = clone $this;
        $clone->cookies[$name] = $setCookieValue;

        return $clone;
    }

    public function hasCookie(string $name): bool
    {
        return isset($this->cookies[$name]);
    }

    /**
     * @return array<string, string>
     */
    public function headers(): array
    {
        $headers = $this->headers;
        if ($this->payload !== null) {
            $headers['Content-Type'] = 'application/json; charset=utf-8';
        }

        return $headers;
    }

    /**
     * @return list<string> nilai header Set-Cookie
     */
    public function cookies(): array
    {
        return array_values($this->cookies);
    }

    public function body(): string
    {
        if ($this->payload === null) {
            return '';
        }

        return json_encode($this->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
}
