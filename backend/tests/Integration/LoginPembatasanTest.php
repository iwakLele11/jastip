<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

/**
 * Temuan uji keamanan SEC-D2, D5, D6: pembatasan login tidak bisa diakali dengan variasi
 * penulisan nama pengguna, batas per IP, dan jumlah verifikasi kata sandi per percobaan.
 */
final class LoginPembatasanTest extends IntegrationTestCase
{
    /** Penulisan ASCII yang dinormalisasi ke nama yang sama ('qathrottle'). */
    private const ASCII = ['qathrottle', 'QATHROTTLE', 'QaThRoTtLe', ' qathrottle ', "\tqathrottle\n"];

    /** Dianggap sama dengan 'qathrottle' oleh collation utf8mb4_unicode_ci, tetapi di luar pola nama pengguna. */
    private const UNICODE = [
        'qáthrottle',
        'qathröttle',
        'ｑａｔｈｒｏｔｔｌｅ',
        "qathrottle\u{00AD}",
        "qa\u{0301}throttle",
        "\u{00A0}qathrottle",
    ];

    public function testVariasiNamaSaatAkunTerkunciTidakPernahBerhasil(): void
    {
        $hash = $this->adminHash($this->createAdmin('qathrottle'));
        for ($i = 0; $i < 5; $i++) {
            $this->fails($this->login('qathrottle', 'salah-' . $i), 401, 'LOGIN_GAGAL');
        }
        $this->passwords->reset();

        foreach (self::ASCII as $username) {
            $this->fails($this->login($username, self::PASSWORD), 429, 'TERLALU_BANYAK_PERCOBAAN');
        }
        foreach (self::UNICODE as $username) {
            // Di luar pola: langsung gagal, tanpa pencarian ke DB dan tanpa memeriksa sandi akun.
            $this->fails($this->login($username, self::PASSWORD), 401, 'LOGIN_GAGAL');
        }

        self::assertSame(0, $this->passwords->verifiedAgainst($hash), 'sandi diperiksa terhadap akun yang terkunci');
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM sesi_login')->fetchColumn());
    }

    public function testTebakanDenganVariasiNamaDariBanyakIpHanyaLimaYangDiperiksa(): void
    {
        $hash = $this->adminHash($this->createAdmin('qabrute'));
        $variasi = ['qabrute', 'QABRUTE', ' qabrute ', 'qábrute', 'ｑａｂｒｕｔｅ', "qabrute\u{00AD}"];

        $statuses = [];
        $n = 0;
        for ($round = 0; $round < 2; $round++) {
            foreach ($variasi as $username) {
                $n++;
                // IP berbeda di setiap tebakan: batas per nama pengguna harus berlaku tanpa bantuan batas per IP.
                $statuses[] = $this->login($username, 'tebakan-' . $n, '198.51.100.' . $n)->status;
            }
        }

        self::assertSame(5, $this->passwords->verifiedAgainst($hash), 'tebakan yang benar-benar diperiksa terhadap akun');
        // Putaran 2: tebakan ASCII ke-6 ditolak 429; variasi Unicode selalu 401 tanpa memeriksa akun.
        self::assertSame([401, 401, 401, 401, 401, 401, 401, 401, 429, 401, 401, 401], $statuses);

        // Kata sandi benar pun ditolak sampai jendela 15 menit lewat, dari IP mana pun.
        $this->fails($this->login('QaBrute', self::PASSWORD, '198.51.100.99'), 429, 'TERLALU_BANYAK_PERCOBAAN');
        self::assertSame(5, $this->passwords->verifiedAgainst($hash));

        $this->clock->advance('+15 minutes');
        $this->ok($this->login('QaBrute', self::PASSWORD, '198.51.100.99'));
    }

    public function testLoginNormalTetapBerhasilTanpaMembedakanHurufBesarKecil(): void
    {
        // bin/create-admin.php mengizinkan huruf besar; nama disimpan seperti diketik.
        $this->createAdmin('Pemilik.Toko');

        foreach (['Pemilik.Toko', 'pemilik.toko', 'PEMILIK.TOKO', ' pemilik.toko '] as $username) {
            $data = $this->ok($this->login($username, self::PASSWORD));
            self::assertSame('Pemilik.Toko', $data['pengguna']['nama_pengguna'], $username);
        }
    }

    public function testPencarianAdminBinerBukanKesetaraanCollation(): void
    {
        // Baris di luar aturan create-admin (mis. diisi langsung lewat SQL).
        $hash = $this->adminHash($this->createAdmin('ädmin'));
        self::assertSame(
            1,
            (int) $this->pdo->query("SELECT COUNT(*) FROM admin WHERE nama_pengguna = 'admin'")->fetchColumn(),
            'prasyarat: collation menganggap ädmin = admin',
        );

        $this->fails($this->login('admin', self::PASSWORD), 401, 'LOGIN_GAGAL');
        $this->fails($this->login('ädmin', self::PASSWORD), 401, 'LOGIN_GAGAL');
        self::assertSame(0, $this->passwords->verifiedAgainst($hash));
    }

    public function testDuaPuluhGagalDariSatuIpMemblokirIpItu(): void
    {
        $this->createAdmin();
        // 20 nama berbeda, masing-masing jauh di bawah batas per nama. Nama di luar pola ikut dihitung.
        for ($i = 0; $i < 10; $i++) {
            $this->fails($this->login('tebak-' . $i, 'salah'), 401, 'LOGIN_GAGAL');
            $this->fails($this->login('tébak-' . $i, 'salah'), 401, 'LOGIN_GAGAL');
        }
        $this->passwords->reset();

        $blocked = $this->login(self::ADMIN, self::PASSWORD);
        $error = $this->fails($blocked, 429, 'TERLALU_BANYAK_PERCOBAAN');
        self::assertSame('900', $blocked->headers()['Retry-After']);
        self::assertSame('Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.', $error['pesan']);
        self::assertSame(0, $this->passwords->verifyCalls());
        $last = $this->logger->records[array_key_last($this->logger->records)];
        self::assertSame(['login_diblokir', 'ip'], [$last['event'], $last['context']['batas']]);

        // IP lain tidak ikut terblokir, dan akun admin tidak terkunci. Login berhasil dari IP lain
        // tidak menghapus hitungan IP pertama.
        $this->ok($this->login(self::ADMIN, self::PASSWORD, '198.51.100.1'));
        $this->fails($this->login(self::ADMIN, self::PASSWORD), 429, 'TERLALU_BANYAK_PERCOBAAN');

        $this->clock->advance('+15 minutes');
        $this->ok($this->login(self::ADMIN, self::PASSWORD));
    }

    public function testSetiapLoginGagalTepatSatuVerifyTanpaPasswordHash(): void
    {
        $hash = $this->adminHash($this->createAdmin());
        $dummy = $this->passwords->dummyHash();
        $cases = [
            'pengguna tidak ada' => ['bukan-admin', $dummy],
            'nama di luar pola' => ['ädmin', $dummy],
            'kata sandi salah' => [self::ADMIN, $hash],
        ];

        foreach ($cases as $label => [$username, $expectedHash]) {
            $this->passwords->reset();
            $this->fails($this->login($username, 'salah-sekali'), 401, 'LOGIN_GAGAL');
            self::assertSame([$expectedHash], $this->passwords->verified, $label);
            self::assertSame(0, $this->passwords->hashCalls, $label);
        }
    }

    private function adminHash(int $id): string
    {
        $stmt = $this->pdo->prepare('SELECT password_hash FROM admin WHERE id = ?');
        $stmt->execute([$id]);

        return (string) $stmt->fetchColumn();
    }
}
