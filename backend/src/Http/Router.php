<?php

declare(strict_types=1);

namespace Jastip\Http;

use Closure;
use Jastip\Auth\AuthContext;

/**
 * Router kecil berbasis regex. Parameter {nama} hanya menerima ID positif.
 */
final class Router
{
    /** @var list<array{method: string, regex: string, handler: Closure, public: bool}> */
    private array $routes = [];

    /**
     * @param Closure(Request, array<string, int>, ?AuthContext): Response $handler
     */
    public function add(string $method, string $pattern, Closure $handler, bool $public = false): void
    {
        $regex = preg_replace_callback(
            '/\{([a-z_]+)\}/',
            static fn (array $m): string => '(?P<' . $m[1] . '>[1-9][0-9]{0,17})',
            $pattern,
        );
        $this->routes[] = [
            'method' => strtoupper($method),
            'regex' => '#^' . $regex . '$#D',
            'handler' => $handler,
            'public' => $public,
        ];
    }

    public function match(string $method, string $path): RouteMatch
    {
        $allowed = [];
        foreach ($this->routes as $route) {
            if (preg_match($route['regex'], $path, $matches) !== 1) {
                continue;
            }
            if ($route['method'] !== $method) {
                $allowed[] = $route['method'];
                continue;
            }

            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = (int) $value;
                }
            }

            return new RouteMatch($route['handler'], $params, $route['public']);
        }

        if ($allowed !== []) {
            throw new HttpError(
                405,
                'METODE_TIDAK_DIIZINKAN',
                'Metode tidak diizinkan untuk endpoint ini.',
                [],
                ['Allow' => implode(', ', array_unique($allowed))],
            );
        }

        throw new HttpError(404, 'ENDPOINT_TIDAK_DITEMUKAN', 'Endpoint tidak ditemukan.');
    }
}
