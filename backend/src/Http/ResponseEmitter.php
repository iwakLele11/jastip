<?php

declare(strict_types=1);

namespace Jastip\Http;

final class ResponseEmitter
{
    public static function emit(Response $response): void
    {
        if (!headers_sent()) {
            http_response_code($response->status);
            foreach ($response->headers() as $name => $value) {
                header($name . ': ' . $value);
            }
            foreach ($response->cookies() as $cookie) {
                header('Set-Cookie: ' . $cookie, false);
            }
        }
        echo $response->body();
    }
}
