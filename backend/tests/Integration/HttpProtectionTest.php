<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Http\Request;

/**
 * CSRF, routing, format error, dan header keamanan.
 */
final class HttpProtectionTest extends IntegrationTestCase
{
    public function testPostTanpaContentTypeJsonDitolak(): void
    {
        $this->loginAsAdmin();

        $form = $this->call('POST', '/api/v1/customer', ['nama' => 'Rina'], [
            'Content-Type' => 'application/x-www-form-urlencoded',
        ]);
        $this->fails($form, 415, 'CONTENT_TYPE_TIDAK_DIDUKUNG');

        $plain = $this->call('POST', '/api/v1/auth/logout', null, ['Content-Type' => 'text/plain']);
        $this->fails($plain, 415, 'CONTENT_TYPE_TIDAK_DIDUKUNG');
        // Sesi tetap ada karena logout lintas situs diblokir.
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM sesi_login')->fetchColumn());
    }

    public function testOriginAsingDitolakUntukRequestYangMengubahData(): void
    {
        $this->loginAsAdmin();

        $this->fails(
            $this->call('PATCH', '/api/v1/pengaturan', ['dp_persen' => '40'], ['Origin' => 'https://evil.example']),
            403,
            'ORIGIN_DITOLAK',
        );
        $this->fails(
            $this->call('DELETE', '/api/v1/customer/1', null, ['Origin' => 'null']),
            403,
            'ORIGIN_DITOLAK',
        );
        // Login juga dilindungi (login CSRF).
        $this->fails(
            $this->call('POST', '/api/v1/auth/login', ['nama_pengguna' => 'a', 'kata_sandi' => 'b'], [
                'Origin' => 'https://evil.example',
            ]),
            403,
            'ORIGIN_DITOLAK',
        );

        self::assertSame('50', $this->ok($this->call('GET', '/api/v1/pengaturan'))['dp_persen']);
    }

    public function testOriginSendiriDanTanpaOriginDiterima(): void
    {
        $this->loginAsAdmin();

        $this->ok($this->call('PATCH', '/api/v1/pengaturan', ['dp_persen' => '40'], [
            'Origin' => self::ORIGIN,
            'Content-Type' => 'application/json; charset=utf-8',
        ]));
        $this->ok($this->call('PATCH', '/api/v1/pengaturan', ['dp_persen' => '45']));
    }

    public function testJsonRusakDanBodyBukanObjek(): void
    {
        $this->loginAsAdmin();
        $cookies = [self::COOKIE => (string) $this->sessionToken];
        $headers = ['Content-Type' => 'application/json'];

        $broken = $this->app->handle(new Request('POST', '/api/v1/customer', [], $headers, '{"nama":', $cookies));
        $this->fails($broken, 400, 'JSON_TIDAK_VALID');

        $list = $this->app->handle(new Request('POST', '/api/v1/customer', [], $headers, '[1,2]', $cookies));
        $this->fails($list, 400, 'JSON_TIDAK_VALID');
    }

    public function testRouteTidakAdaDanMetodeSalah(): void
    {
        $this->fails($this->call('GET', '/api/v1/tidak-ada'), 404, 'ENDPOINT_TIDAK_DITEMUKAN');
        $this->fails($this->call('GET', '/api/v1/open-po/abc'), 404, 'ENDPOINT_TIDAK_DITEMUKAN');
        $this->fails($this->call('GET', '/api/v1/open-po/0'), 404, 'ENDPOINT_TIDAK_DITEMUKAN');

        $put = $this->call('PUT', '/api/v1/pengaturan', []);
        $this->fails($put, 405, 'METODE_TIDAK_DIIZINKAN');
        self::assertSame('GET, PATCH', $put->headers()['Allow']);
    }

    public function testHeaderKeamananDanGarisMiringDiAkhir(): void
    {
        $response = $this->call('GET', '/api/v1/health/');

        self::assertSame(['status' => 'ok', 'database' => 'ok'], $this->ok($response));
        $headers = $response->headers();
        self::assertSame('application/json; charset=utf-8', $headers['Content-Type']);
        self::assertSame('nosniff', $headers['X-Content-Type-Options']);
        self::assertSame('no-store', $headers['Cache-Control']);
    }

    public function testErrorTakTerdugaJadi500TanpaDetail(): void
    {
        $this->loginAsAdmin();
        $this->pdo->exec('DELETE FROM pengaturan');

        $error = $this->fails($this->call('GET', '/api/v1/pengaturan'), 500, 'KESALAHAN_SERVER');

        self::assertSame('Terjadi kesalahan di server. Coba lagi beberapa saat lagi.', $error['pesan']);
        self::assertContains('exception_tidak_tertangani', $this->logger->events());

        $this->pdo->exec('INSERT INTO pengaturan (id, default_markup_bp, buffer_aud_bp, dp_bp) VALUES (1, 1000, 300, 5000)');
    }
}
