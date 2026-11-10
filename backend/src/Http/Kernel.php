<?php

declare(strict_types=1);

namespace Jastip\Http;

use Jastip\Auth\AuthContext;
use Jastip\Auth\AuthService;
use Jastip\Auth\Credential;
use Jastip\Auth\SessionCookie;
use Jastip\Infrastructure\ErrorContext;
use Jastip\Infrastructure\Logger;
use Throwable;

/**
 * Pintu masuk semua request API: routing, proteksi CSRF, autentikasi, penanganan error.
 */
final class Kernel
{
    private const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
    private const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

    /**
     * @param list<string> $allowedOrigins
     */
    public function __construct(
        private readonly Router $router,
        private readonly AuthService $auth,
        private readonly SessionCookie $cookie,
        private readonly array $allowedOrigins,
        private readonly Logger $logger,
    ) {
    }

    public function handle(Request $request): Response
    {
        try {
            $response = $this->dispatch($request);
        } catch (HttpError $e) {
            $response = Response::fromError($e);
        } catch (Throwable $e) {
            $this->logger->error(
                'exception_tidak_tertangani',
                ErrorContext::fromThrowable($e) + ['method' => $request->method, 'path' => $request->path],
            );
            $response = Response::fromError(new HttpError(
                500,
                'KESALAHAN_SERVER',
                'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.',
            ));
        }

        return $response
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('Referrer-Policy', 'no-referrer');
    }

    private function dispatch(Request $request): Response
    {
        $path = $request->path === '/' ? '/' : rtrim($request->path, '/');
        $route = $this->router->match($request->method, $path);

        if (strlen($request->body) > Request::MAX_BODY_BYTES) {
            throw new HttpError(413, 'BODY_TERLALU_BESAR', 'Ukuran data terlalu besar.');
        }
        if (in_array($request->method, self::MUTATING_METHODS, true)) {
            $this->guardCsrf($request);
        }

        $auth = $route->public ? null : $this->auth->authenticate($this->credential($request));
        $response = ($route->handler)($request, $route->params, $auth);

        return $this->refreshCookie($response, $auth);
    }

    /**
     * Request yang mengubah data: header Origin (jika dikirim browser) harus termasuk
     * origin yang diizinkan, dan POST/PUT/PATCH wajib Content-Type application/json
     * (form HTML lintas situs tidak bisa mengirim tipe ini tanpa preflight CORS).
     */
    private function guardCsrf(Request $request): void
    {
        $origin = $request->header('origin');
        if ($origin !== null && !in_array(strtolower(rtrim($origin, '/')), $this->allowedOrigins, true)) {
            throw new HttpError(403, 'ORIGIN_DITOLAK', 'Permintaan ditolak.');
        }

        if (in_array($request->method, self::BODY_METHODS, true)) {
            $contentType = $request->header('content-type') ?? '';
            if (preg_match('#^application/json\s*(;|$)#i', $contentType) !== 1) {
                throw new HttpError(415, 'CONTENT_TYPE_TIDAK_DIDUKUNG', 'Gunakan Content-Type: application/json.');
            }
        }
    }

    private function credential(Request $request): ?Credential
    {
        $authorization = $request->header('authorization');
        if ($authorization !== null) {
            if (preg_match('/^Bearer\s+(\S+)$/iD', trim($authorization), $m) !== 1) {
                throw new HttpError(401, 'BELUM_MASUK', 'Silakan masuk terlebih dahulu.');
            }

            return new Credential($m[1], false);
        }

        $token = $request->cookies[$this->cookie->name()] ?? null;

        return is_string($token) && $token !== '' ? new Credential($token, true) : null;
    }

    private function refreshCookie(Response $response, ?AuthContext $auth): Response
    {
        if ($auth === null || !$auth->viaCookie || !$auth->refreshed || $response->hasCookie($this->cookie->name())) {
            return $response;
        }

        return $response->withCookie($this->cookie->name(), $this->cookie->issue($auth->token));
    }
}
