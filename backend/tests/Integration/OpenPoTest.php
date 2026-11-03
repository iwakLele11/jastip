<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use PHPUnit\Framework\Attributes\DataProvider;

final class OpenPoTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
    }

    public function testBuatOtomatisServerMenghitungUlangKursJastip(): void
    {
        $response = $this->call('POST', '/api/v1/open-po', [
            'nama' => '  Open PO Australia Nov 2026 ',
            'kurs' => [
                'mode' => 'otomatis',
                'kurs_pasar' => '12673',
                'tanggal_kurs' => '2026-10-25',
                'kurs_jastip' => 1, // diabaikan untuk mode otomatis
            ],
        ]);
        $po = $this->ok($response, 201);

        self::assertSame('/api/v1/open-po/' . $po['id'], $response->headers()['Location']);
        self::assertSame('Open PO Australia Nov 2026', $po['nama']);
        self::assertSame('AUD', $po['mata_uang']);
        self::assertSame('buka', $po['status']);
        self::assertSame([
            'mode' => 'otomatis',
            'kurs_jastip' => 13_054,
            'kurs_pasar' => '12673',
            'tanggal_kurs' => '2026-10-25',
            'buffer_persen' => '3',
            'sumber' => 'Frankfurter',
        ], $po['kurs']);
        self::assertFalse($po['kurs_terkunci']);
        self::assertNull($po['kurs_terkunci_pada']);
        self::assertSame('50', $po['dp_persen']);
        self::assertSame(['jumlah_customer' => 0, 'total_pesanan' => 0, 'dana_diterima' => 0], $po['ringkasan']);
    }

    public function testBuatManualTanpaBufferDenganAtauTanpaKursPasar(): void
    {
        $tanpaPasar = $this->ok($this->call('POST', '/api/v1/open-po', [
            'nama' => 'PO manual',
            'kurs' => ['mode' => 'manual', 'kurs_jastip' => 13_100],
        ]), 201);
        self::assertSame([
            'mode' => 'manual',
            'kurs_jastip' => 13_100,
            'kurs_pasar' => null,
            'tanggal_kurs' => null,
            'buffer_persen' => null,
            'sumber' => null,
        ], $tanpaPasar['kurs']);

        $denganPasar = $this->ok($this->call('POST', '/api/v1/open-po', [
            'nama' => 'PO manual pembanding',
            'kurs' => ['mode' => 'manual', 'kurs_jastip' => 13_000, 'kurs_pasar' => '12673', 'tanggal_kurs' => '2026-10-25'],
        ]), 201);
        self::assertSame(13_000, $denganPasar['kurs']['kurs_jastip']);
        self::assertSame('12673', $denganPasar['kurs']['kurs_pasar']);
        self::assertNull($denganPasar['kurs']['buffer_persen']);
    }

    /**
     * @return array<string, array{array<string, mixed>, array<string, string>}>
     */
    public static function inputSalah(): array
    {
        $wajib = 'Kurs wajib diisi. Ambil kurs otomatis atau isi manual.';

        return [
            'nama kosong, kurs tidak ada' => [
                ['nama' => ' '],
                ['nama' => 'Nama Open PO wajib diisi.', 'kurs' => $wajib],
            ],
            'manual tanpa kurs' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'manual']],
                ['kurs.kurs_jastip' => $wajib],
            ],
            'manual nol' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'manual', 'kurs_jastip' => 0]],
                ['kurs.kurs_jastip' => 'Kurs harus lebih dari 0.'],
            ],
            'manual negatif' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'manual', 'kurs_jastip' => -5]],
                ['kurs.kurs_jastip' => 'Kurs harus lebih dari 0.'],
            ],
            'manual teks' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'manual', 'kurs_jastip' => '13.054']],
                ['kurs.kurs_jastip' => 'Isi angka saja, mis. 13054.'],
            ],
            'manual desimal' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'manual', 'kurs_jastip' => 13054.5]],
                ['kurs.kurs_jastip' => 'Isi angka saja, mis. 13054.'],
            ],
            'otomatis tanpa kurs pasar' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'otomatis', 'tanggal_kurs' => '2026-10-25']],
                ['kurs.kurs_pasar' => $wajib],
            ],
            'otomatis tanggal salah' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'otomatis', 'kurs_pasar' => '12673', 'tanggal_kurs' => '25-10-2026']],
                ['kurs.tanggal_kurs' => 'Tanggal kurs tidak valid.'],
            ],
            'mode tidak dikenal' => [
                ['nama' => 'PO', 'kurs' => ['mode' => 'harian']],
                ['kurs.mode' => 'Pilih kurs Otomatis atau Manual.'],
            ],
            'nama terlalu panjang' => [
                ['nama' => str_repeat('a', 101), 'kurs' => ['mode' => 'manual', 'kurs_jastip' => 13054]],
                ['nama' => 'Nama Open PO maksimal 100 karakter.'],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, string> $fields
     */
    #[DataProvider('inputSalah')]
    public function testValidasiBuat(array $body, array $fields): void
    {
        $error = $this->fails($this->call('POST', '/api/v1/open-po', $body), 422, 'VALIDASI');

        self::assertSame($fields, $error['field']);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM open_po')->fetchColumn());
    }

    public function testDpDanBufferDisnapshotSaatPoDibuat(): void
    {
        $lama = $this->createOpenPo('PO lama');
        $this->ok($this->call('PATCH', '/api/v1/pengaturan', ['dp_persen' => '30', 'buffer_aud_persen' => '5']));
        $baru = $this->createOpenPo('PO baru');

        $lamaSekarang = $this->ok($this->call('GET', '/api/v1/open-po/' . $lama['id']));
        self::assertSame('50', $lamaSekarang['dp_persen']);
        self::assertSame('3', $lamaSekarang['kurs']['buffer_persen']);
        self::assertSame(13_054, $lamaSekarang['kurs']['kurs_jastip']);

        self::assertSame('30', $baru['dp_persen']);
        self::assertSame('5', $baru['kurs']['buffer_persen']);
        // 12.673 × 1,05 = 13.306,65 → Rp13.307
        self::assertSame(13_307, $baru['kurs']['kurs_jastip']);
    }

    public function testDaftarBukaDuluTerbaruDiAtasDenganPagination(): void
    {
        $a = $this->createOpenPo('PO A');
        $b = $this->createOpenPo('PO B');
        $c = $this->createOpenPo('PO C');
        $this->ok($this->call('PATCH', '/api/v1/open-po/' . $c['id'], ['status' => 'selesai']));

        $all = self::json($this->call('GET', '/api/v1/open-po'));
        self::assertSame(['PO B', 'PO A', 'PO C'], array_column($all['data'], 'nama'));
        self::assertSame(
            ['halaman' => 1, 'per_halaman' => 20, 'total' => 3, 'total_halaman' => 1,
                'jumlah_per_status' => ['buka' => 2, 'selesai' => 1]],
            $all['meta'],
        );

        $page2 = self::json($this->call('GET', '/api/v1/open-po', query: ['per_halaman' => '1', 'halaman' => '2']));
        self::assertSame(['PO A'], array_column($page2['data'], 'nama'));
        self::assertSame(3, $page2['meta']['total_halaman']);

        $selesai = self::json($this->call('GET', '/api/v1/open-po', query: ['status' => 'selesai']));
        self::assertSame([$c['id']], array_column($selesai['data'], 'id'));
        self::assertSame(1, $selesai['meta']['total']);

        unset($a, $b);
    }

    public function testValidasiQueryDaftar(): void
    {
        $error = $this->fails(
            $this->call('GET', '/api/v1/open-po', query: ['status' => 'aktif', 'per_halaman' => '500']),
            422,
            'VALIDASI',
        );
        self::assertSame(['status' => 'Status harus buka atau selesai.'], $error['field']);

        $error = $this->fails($this->call('GET', '/api/v1/open-po', query: ['per_halaman' => '500']), 422, 'VALIDASI');
        self::assertSame(['per_halaman' => 'per_halaman harus antara 1 dan 100.'], $error['field']);
    }

    public function testDetailTidakAda(): void
    {
        $this->fails($this->call('GET', '/api/v1/open-po/999'), 404, 'TIDAK_DITEMUKAN');
        $this->fails($this->call('PATCH', '/api/v1/open-po/999', ['nama' => 'x']), 404, 'TIDAK_DITEMUKAN');
    }

    public function testUbahNamaStatusDanKursSebelumTerkunci(): void
    {
        $po = $this->createOpenPo();

        $this->rates->body = '{"date":"2026-10-27","base":"AUD","quote":"IDR","rate":12700}';
        $preview = $this->ok($this->call('GET', '/api/v1/kurs/aud-idr'));
        $updated = $this->ok($this->call('PATCH', '/api/v1/open-po/' . $po['id'], [
            'nama' => 'Australia Nov 2026',
            'status' => 'selesai',
            'kurs' => ['mode' => 'otomatis', 'kurs_pasar' => $preview['kurs_pasar'], 'tanggal_kurs' => $preview['tanggal_kurs']],
        ]));

        self::assertSame('Australia Nov 2026', $updated['nama']);
        self::assertSame('selesai', $updated['status']);
        self::assertSame($preview['kurs_jastip'], $updated['kurs']['kurs_jastip']);
        self::assertSame('2026-10-27', $updated['kurs']['tanggal_kurs']);

        $manual = $this->ok($this->call('PATCH', '/api/v1/open-po/' . $po['id'], [
            'kurs' => ['mode' => 'manual', 'kurs_jastip' => 13_500],
        ]));
        self::assertSame('manual', $manual['kurs']['mode']);
        self::assertNull($manual['kurs']['buffer_persen']);
        self::assertNull($manual['kurs']['kurs_pasar']);
        self::assertSame('selesai', $manual['status']);
    }

    public function testKursTerkunciDitolak409TapiNamaDanStatusTetapBisaDiubah(): void
    {
        $po = $this->createOpenPo();
        $this->pdo->prepare('UPDATE open_po SET kurs_terkunci_at = ? WHERE id = ?')->execute(['2026-10-26 01:00:00', $po['id']]);

        $detail = $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']));
        self::assertTrue($detail['kurs_terkunci']);
        self::assertSame('2026-10-26T01:00:00Z', $detail['kurs_terkunci_pada']);

        $error = $this->fails($this->call('PATCH', '/api/v1/open-po/' . $po['id'], [
            'nama' => 'Ganti nama',
            'kurs' => ['mode' => 'manual', 'kurs_jastip' => 14_000],
        ]), 409, 'KURS_TERKUNCI');
        self::assertSame('Kurs sudah terkunci karena ada pesanan. Data kurs terbaru sudah dimuat.', $error['pesan']);

        // Seluruh perubahan dibatalkan, termasuk nama.
        $after = $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']));
        self::assertSame($po['nama'], $after['nama']);
        self::assertSame(13_054, $after['kurs']['kurs_jastip']);

        $renamed = $this->ok($this->call('PATCH', '/api/v1/open-po/' . $po['id'], ['nama' => 'Ganti nama', 'status' => 'selesai']));
        self::assertSame('Ganti nama', $renamed['nama']);
        self::assertTrue($renamed['kurs_terkunci']);
    }

    public function testRingkasanPoDariKeranjangBerisi(): void
    {
        $po = $this->createOpenPo();
        $other = $this->createOpenPo('PO lain');
        $rina = $this->createCustomer('Rina', '081234567890');
        $sari = $this->createCustomer('Sari', '081398765432');
        $dewi = $this->createCustomer('Dewi', '081311112222');

        // Rina: QA langkah 5 (A + B Kosong + C, bayar 1.468.000 + 1.467.000, refund 384.000).
        $this->seedCart(
            $po['id'],
            $rina['id'],
            [[359_000, 2, false], [128_000, 3, true], [1_833_000, 1, false]],
            [1_468_000, 1_467_000],
            [384_000],
        );
        // Sari: belum bayar.
        $this->seedCart($po['id'], $sari['id'], [[100_000, 12, false]]);
        // Dewi: keranjang kosong (tidak dihitung).
        $this->pdo->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$po['id'], $dewi['id']]);
        // PO lain tidak ikut terhitung.
        $this->seedCart($other['id'], $sari['id'], [[5_000, 1, false]], [5_000]);

        $detail = $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']));
        self::assertSame(
            ['jumlah_customer' => 2, 'total_pesanan' => 2_551_000 + 1_200_000, 'dana_diterima' => 2_551_000],
            $detail['ringkasan'],
        );

        $list = self::json($this->call('GET', '/api/v1/open-po'))['data'];
        $byName = array_column($list, 'ringkasan', 'nama');
        self::assertSame(['jumlah_customer' => 1, 'total_pesanan' => 5_000, 'dana_diterima' => 5_000], $byName['PO lain']);
    }
}
