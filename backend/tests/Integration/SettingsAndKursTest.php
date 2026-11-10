<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use PHPUnit\Framework\Attributes\DataProvider;

final class SettingsAndKursTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
    }

    public function testNilaiAwalPengaturan(): void
    {
        $data = $this->ok($this->call('GET', '/api/v1/pengaturan'));

        self::assertSame('10', $data['default_markup_persen']);
        self::assertSame('3', $data['buffer_aud_persen']);
        self::assertSame('50', $data['dp_persen']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $data['diubah_pada']);
    }

    public function testUbahSebagianDenganKomaAtauTitik(): void
    {
        $data = $this->ok($this->call('PATCH', '/api/v1/pengaturan', [
            'default_markup_persen' => '12,5',
            'buffer_aud_persen' => '3.75',
        ]));

        self::assertSame('12.5', $data['default_markup_persen']);
        self::assertSame('3.75', $data['buffer_aud_persen']);
        self::assertSame('50', $data['dp_persen']);
        self::assertSame(
            ['default_markup_bp' => 1250, 'buffer_aud_bp' => 375, 'dp_bp' => 5000],
            $this->pdo->query('SELECT default_markup_bp, buffer_aud_bp, dp_bp FROM pengaturan')->fetch(),
        );
    }

    /**
     * @return array<string, array{string, mixed, string}>
     */
    public static function inputSalah(): array
    {
        return [
            'markup negatif' => ['default_markup_persen', '-1', 'Markup tidak boleh negatif.'],
            'markup > 100' => ['default_markup_persen', '100.01', 'Markup maksimal 100%.'],
            'markup 3 desimal' => ['default_markup_persen', '10.125', 'Maksimal 2 angka di belakang koma.'],
            'markup huruf' => ['default_markup_persen', 'sepuluh', 'Isi angka, mis. 10.'],
            'markup angka JSON' => ['default_markup_persen', 10, 'Isi angka, mis. 10.'],
            'markup kosong' => ['default_markup_persen', '', 'Markup wajib diisi.'],
            'buffer negatif' => ['buffer_aud_persen', '-0.5', 'Buffer tidak boleh negatif.'],
            'dp > 100' => ['dp_persen', '101', 'DP harus antara 0 dan 100%.'],
            'dp negatif' => ['dp_persen', '-5', 'DP harus antara 0 dan 100%.'],
            'dp float JSON' => ['dp_persen', 50.5, 'Isi angka, mis. 10.'],
        ];
    }

    #[DataProvider('inputSalah')]
    public function testValidasiPengaturan(string $field, mixed $value, string $message): void
    {
        $error = $this->fails($this->call('PATCH', '/api/v1/pengaturan', [$field => $value]), 422, 'VALIDASI');

        self::assertSame([$field => $message], $error['field']);
        self::assertSame($message, $error['pesan']);
    }

    public function testBatasNolDanSeratusDiterima(): void
    {
        $data = $this->ok($this->call('PATCH', '/api/v1/pengaturan', [
            'default_markup_persen' => '0',
            'buffer_aud_persen' => '100',
            'dp_persen' => '100',
        ]));

        self::assertSame(['0', '100', '100'], [$data['default_markup_persen'], $data['buffer_aud_persen'], $data['dp_persen']]);
    }

    public function testPratinjauKursContohScope(): void
    {
        $data = $this->ok($this->call('GET', '/api/v1/kurs/aud-idr'));

        self::assertSame([
            'mata_uang' => 'AUD',
            'kurs_pasar' => '12673',
            'tanggal_kurs' => '2026-10-25',
            'buffer_persen' => '3',
            'kurs_jastip' => 13054,
            'sumber' => 'Frankfurter',
        ], $data);
    }

    public function testPratinjauKursMemakaiBufferTerbaruDanKursDesimal(): void
    {
        $this->rates->body = '{"date":"2026-10-26","base":"AUD","quote":"IDR","rate":12673.45}';
        $this->call('PATCH', '/api/v1/pengaturan', ['buffer_aud_persen' => '3.5']);

        $data = $this->ok($this->call('GET', '/api/v1/kurs/aud-idr'));

        self::assertSame('12673.45', $data['kurs_pasar']);
        self::assertSame('3.5', $data['buffer_persen']);
        // 12.673,45 × 1,035 = 13.117,02075 → Rp13.118
        self::assertSame(13_118, $data['kurs_jastip']);
    }

    /**
     * @return array<string, array{?string}>
     */
    public static function responsKursRusak(): array
    {
        return [
            'jaringan gagal' => [null],
            'bukan JSON' => ['<html>error</html>'],
            'pasangan salah' => ['{"date":"2026-10-25","base":"USD","quote":"IDR","rate":15000}'],
            'rate string' => ['{"date":"2026-10-25","base":"AUD","quote":"IDR","rate":"12673"}'],
            'rate nol' => ['{"date":"2026-10-25","base":"AUD","quote":"IDR","rate":0}'],
            'rate negatif' => ['{"date":"2026-10-25","base":"AUD","quote":"IDR","rate":-1}'],
            'tanggal salah' => ['{"date":"2026-13-40","base":"AUD","quote":"IDR","rate":12673}'],
        ];
    }

    #[DataProvider('responsKursRusak')]
    public function testKursGagalMengembalikanKodeKhusus(?string $body): void
    {
        $this->rates->body = $body;

        $error = $this->fails($this->call('GET', '/api/v1/kurs/aud-idr'), 502, 'KURS_GAGAL');

        self::assertSame('Kurs otomatis gagal diambil. Isi kurs manual, atau coba lagi.', $error['pesan']);
        self::assertContains('kurs_gagal', $this->logger->events());
    }
}
