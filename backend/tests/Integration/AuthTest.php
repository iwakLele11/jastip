<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

final class AuthTest extends IntegrationTestCase
{
    public function testLoginWebMengirimCookieAmanTanpaTokenDiBody(): void
    {
        $this->createAdmin();

        $response = $this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => self::ADMIN,
            'kata_sandi' => self::PASSWORD,
        ]);

        $data = $this->ok($response);
        self::assertSame(self::ADMIN, $data['pengguna']['nama_pengguna']);
        self::assertSame(720, $data['sesi_tidak_aktif_maks_menit']);
        self::assertArrayNotHasKey('token', $data);

        $cookie = $response->cookies()[0];
        self::assertMatchesRegularExpression('/^__Host-jastip_sesi=[0-9a-f]{64}; /', $cookie);
        self::assertStringContainsString('HttpOnly', $cookie);
        self::assertStringContainsString('SameSite=Strict', $cookie);
        self::assertStringContainsString('Secure', $cookie);
        self::assertStringContainsString('Path=/', $cookie);
        self::assertStringContainsString('Max-Age=43200', $cookie);
    }

    public function testTokenDisimpanSebagaiHashSaja(): void
    {
        $this->loginAsAdmin();

        $stored = $this->pdo->query('SELECT token_hash FROM sesi_login')->fetchColumn();
        self::assertSame(hash('sha256', (string) $this->sessionToken), $stored);
        self::assertNotSame($this->sessionToken, $stored);
    }

    public function testSesiDanLogout(): void
    {
        $this->loginAsAdmin();

        $sesi = $this->ok($this->call('GET', '/api/v1/auth/sesi'));
        self::assertSame(self::ADMIN, $sesi['pengguna']['nama_pengguna']);

        $logout = $this->call('POST', '/api/v1/auth/logout');
        self::assertSame(204, $logout->status);
        self::assertStringContainsString('Max-Age=0', $logout->cookies()[0]);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM sesi_login')->fetchColumn());

        $this->fails($this->call('GET', '/api/v1/auth/sesi'), 401, 'BELUM_MASUK');
    }

    public function testLoginMobileMemakaiBearer(): void
    {
        $this->createAdmin();

        $data = $this->ok($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => self::ADMIN,
            'kata_sandi' => self::PASSWORD,
            'klien' => 'mobile',
        ]));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $data['token']);
        self::assertSame('Bearer', $data['jenis_token']);

        $sesi = $this->call('GET', '/api/v1/auth/sesi', headers: ['Authorization' => 'Bearer ' . $data['token']]);
        self::assertSame(200, $sesi->status);
        self::assertSame([], $sesi->cookies());

        $this->fails(
            $this->call('GET', '/api/v1/auth/sesi', headers: ['Authorization' => 'Basic abc']),
            401,
            'BELUM_MASUK',
        );
    }

    public function testLoginGagalPesanUmumUntukPasswordSalahDanPenggunaTidakAda(): void
    {
        $this->createAdmin();

        $salahSandi = $this->fails($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => self::ADMIN,
            'kata_sandi' => 'salah-sekali',
        ]), 401, 'LOGIN_GAGAL');
        $tidakAda = $this->fails($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => 'bukan-admin',
            'kata_sandi' => 'salah-sekali',
        ]), 401, 'LOGIN_GAGAL');

        self::assertSame('Nama pengguna atau kata sandi salah.', $salahSandi['pesan']);
        self::assertSame($salahSandi['pesan'], $tidakAda['pesan']);
        self::assertArrayNotHasKey('field', $salahSandi);
    }

    public function testValidasiLogin(): void
    {
        $error = $this->fails($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => '  ',
            'kata_sandi' => '',
        ]), 422, 'VALIDASI');

        self::assertSame('Isi nama pengguna.', $error['field']['nama_pengguna']);
        self::assertSame('Isi kata sandi.', $error['field']['kata_sandi']);
        self::assertSame('Periksa 2 isian yang ditandai.', $error['pesan']);
    }

    public function testNamaPenggunaTidakPekaHurufBesar(): void
    {
        $this->createAdmin();

        $this->ok($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => ' ADMIN ',
            'kata_sandi' => self::PASSWORD,
        ]));
    }

    public function testLimaKaliGagalLaluDiblokirLimaBelasMenit(): void
    {
        $this->createAdmin();
        for ($i = 0; $i < 5; $i++) {
            $this->fails($this->call('POST', '/api/v1/auth/login', [
                'nama_pengguna' => self::ADMIN,
                'kata_sandi' => 'salah-' . $i,
            ]), 401, 'LOGIN_GAGAL');
            $this->clock->advance('+1 minute');
        }

        // Percobaan ke-6, kata sandi benar pun ditolak.
        $blocked = $this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => 'Admin',
            'kata_sandi' => self::PASSWORD,
        ]);
        $error = $this->fails($blocked, 429, 'TERLALU_BANYAK_PERCOBAAN');
        self::assertSame('600', $blocked->headers()['Retry-After']);
        self::assertSame('Terlalu banyak percobaan masuk. Coba lagi dalam 10 menit.', $error['pesan']);

        // Nama pengguna lain tidak ikut terblokir.
        $this->fails($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => 'orang-lain',
            'kata_sandi' => 'x',
        ]), 401, 'LOGIN_GAGAL');

        // Setelah percobaan gagal pertama keluar dari jendela 15 menit, login kembali bisa.
        $this->clock->advance('+10 minutes');
        $this->ok($this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => self::ADMIN,
            'kata_sandi' => self::PASSWORD,
        ]));
        self::assertSame(0, (int) $this->pdo->query(
            "SELECT COUNT(*) FROM percobaan_login WHERE kunci_hash = '" . hash('sha256', 'admin') . "'"
        )->fetchColumn());
    }

    public function testSesiBerakhirSetelahDuaBelasJamTidakAktif(): void
    {
        $this->loginAsAdmin();

        $this->clock->advance('+12 hours');

        $this->fails($this->call('GET', '/api/v1/auth/sesi'), 401, 'SESI_BERAKHIR');
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM sesi_login')->fetchColumn());
    }

    public function testSesiSlidingDiperpanjangSetiapAktivitas(): void
    {
        $this->loginAsAdmin();

        $this->clock->advance('+11 hours');
        $first = $this->call('GET', '/api/v1/auth/sesi');
        self::assertSame(200, $first->status);
        // Cookie dikirim ulang supaya Max-Age ikut diperpanjang.
        self::assertSame($this->sessionToken, self::cookieValue($first, self::COOKIE));

        $this->clock->advance('+11 hours');
        self::assertSame(200, $this->call('GET', '/api/v1/auth/sesi')->status);

        $this->clock->advance('+12 hours');
        $this->fails($this->call('GET', '/api/v1/auth/sesi'), 401, 'SESI_BERAKHIR');
    }

    public function testTokenTidakDikenalDitolak(): void
    {
        $this->sessionToken = str_repeat('a', 64);
        $this->fails($this->call('GET', '/api/v1/pengaturan'), 401, 'BELUM_MASUK');

        $this->sessionToken = 'bukan-token';
        $this->fails($this->call('GET', '/api/v1/pengaturan'), 401, 'BELUM_MASUK');
    }

    /**
     * @return list<array{string, string}>
     */
    public static function protectedEndpoints(): array
    {
        return [
            ['GET', '/api/v1/auth/sesi'],
            ['POST', '/api/v1/auth/logout'],
            ['GET', '/api/v1/pengaturan'],
            ['PATCH', '/api/v1/pengaturan'],
            ['GET', '/api/v1/kurs/aud-idr'],
            ['GET', '/api/v1/open-po'],
            ['POST', '/api/v1/open-po'],
            ['GET', '/api/v1/open-po/1'],
            ['PATCH', '/api/v1/open-po/1'],
            ['GET', '/api/v1/customer'],
            ['POST', '/api/v1/customer'],
            ['GET', '/api/v1/customer/cek-no-wa'],
            ['GET', '/api/v1/customer/1'],
            ['PATCH', '/api/v1/customer/1'],
            ['DELETE', '/api/v1/customer/1'],
            ['POST', '/api/v1/customer/1/arsip'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('protectedEndpoints')]
    public function testSemuaEndpointSelainLoginWajibSesi(string $method, string $path): void
    {
        $this->fails($this->call($method, $path, []), 401, 'BELUM_MASUK');
    }

    public function testLogTidakMemuatKataSandiAtauToken(): void
    {
        $this->createAdmin();
        $this->call('POST', '/api/v1/auth/login', ['nama_pengguna' => self::ADMIN, 'kata_sandi' => 'sandi-rahasia-salah']);
        $this->loginAsAdmin();

        $log = $this->logger->dump();
        self::assertContains('login_gagal', $this->logger->events());
        self::assertContains('login_berhasil', $this->logger->events());
        self::assertStringNotContainsString('sandi-rahasia-salah', $log);
        self::assertStringNotContainsString(self::PASSWORD, $log);
        self::assertStringNotContainsString((string) $this->sessionToken, $log);
    }
}
