<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Auth\AuthContext;
use Jastip\Auth\AuthService;
use Jastip\Auth\SessionCookie;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Http\Validator;

final class AuthController
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly SessionCookie $cookie,
    ) {
    }

    /**
     * klien "web" (default): token dikirim sebagai cookie HttpOnly, tidak ada di body.
     * klien "mobile": token dikirim di body untuk header Authorization: Bearer, tanpa cookie.
     */
    public function login(Request $request): Response
    {
        $body = $request->json();
        $v = new Validator($body);
        $namaPengguna = $body['nama_pengguna'] ?? null;
        if (!is_string($namaPengguna) || trim($namaPengguna) === '') {
            $v->error('nama_pengguna', 'Isi nama pengguna.');
        }
        $kataSandi = $body['kata_sandi'] ?? null;
        if (!is_string($kataSandi) || $kataSandi === '') {
            $v->error('kata_sandi', 'Isi kata sandi.');
        }
        $klien = $v->has('klien') ? $v->choice('klien', ['web', 'mobile'], 'klien harus web atau mobile.') : 'web';
        $v->throwIfInvalid();
        assert(is_string($namaPengguna) && is_string($kataSandi));

        $result = $this->auth->login($namaPengguna, $kataSandi, $request->clientIp);
        $data = [
            'pengguna' => ['id' => $result->adminId, 'nama_pengguna' => $result->namaPengguna],
            'sesi_tidak_aktif_maks_menit' => $this->auth->idleMinutes(),
        ];

        if ($klien === 'mobile') {
            return Response::data($data + ['token' => $result->token, 'jenis_token' => 'Bearer']);
        }

        return Response::data($data)->withCookie($this->cookie->name(), $this->cookie->issue($result->token));
    }

    public function logout(AuthContext $auth): Response
    {
        $this->auth->logout($auth);

        return Response::noContent()->withCookie($this->cookie->name(), $this->cookie->clear());
    }

    public function session(AuthContext $auth): Response
    {
        return Response::data([
            'pengguna' => ['id' => $auth->adminId, 'nama_pengguna' => $auth->namaPengguna],
            'sesi_tidak_aktif_maks_menit' => $this->auth->idleMinutes(),
        ]);
    }
}
