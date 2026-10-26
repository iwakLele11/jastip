<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

/**
 * GET /open-po/{id}/customer (filter status + jumlah_per_status) dan GET /open-po/{id}/barang-unik.
 */
final class OpenPoCustomerTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
    }

    /**
     * Satu customer per status. Barang A AUD 24,95 markup 10% = Rp359.000, DP 50% = Rp180.000.
     *
     * @return array<string, mixed> Open PO
     */
    private function poDenganSemuaStatus(): array
    {
        $po = $this->createOpenPo();
        $buat = function (string $nama, string $noWa, ?int $bayar, bool $kosong = false) use ($po): void {
            $customer = $this->createCustomer($nama, $noWa);
            $cart = $this->addLine($po, $customer, 'Barang A', '24,95', 1, '10');
            if ($kosong) {
                $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][0]['id'] . '/kosong'));
            }
            if ($bayar !== null) {
                $this->pay($po, $customer, $bayar);
            }
        };
        // Sengaja tidak urut abjad supaya urutan nama dari server teruji.
        $buat('Eka', '081200000005', 400_000);     // lebih_bayar
        $buat('budi', '081200000002', 100_000);    // kurang_dp
        $buat('Andi', '081200000001', null);       // belum_bayar
        $buat('Dewi', '081200000004', 359_000);    // lunas
        $buat('Citra', '081200000003', 180_000);   // dp
        $buat('Fajar', '081200000006', null, true); // lunas: hanya baris Kosong (Rp0 = Rp0)

        // Keranjang kosong dan keranjang di PO lain tidak dihitung.
        $gita = $this->createCustomer('Gita', '081200000007');
        $this->pdo->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$po['id'], $gita['id']]);
        $this->addLine($this->createOpenPo('PO lain'), $gita, 'Barang Z', '1', 1, '0');

        return $po;
    }

    public function testDaftarUrutNamaDenganStatusDanJumlahPerStatus(): void
    {
        $po = $this->poDenganSemuaStatus();

        $list = self::json($this->call('GET', '/api/v1/open-po/' . $po['id'] . '/customer'));

        $statusPerNama = [];
        foreach ($list['data'] as $item) {
            $statusPerNama[] = [$item['customer']['nama'], $item['status']];
        }
        self::assertSame([
            ['Andi', 'belum_bayar'], ['budi', 'kurang_dp'], ['Citra', 'dp'],
            ['Dewi', 'lunas'], ['Eka', 'lebih_bayar'], ['Fajar', 'lunas'],
        ], $statusPerNama);
        self::assertSame([
            'halaman' => 1, 'per_halaman' => 20, 'total' => 6, 'total_halaman' => 1,
            'jumlah_per_status' => ['semua' => 6, 'belum_bayar' => 1, 'kurang_dp' => 1, 'dp' => 1, 'lunas' => 2, 'lebih_bayar' => 1],
        ], $list['meta']);

        $eka = $list['data'][4];
        self::assertSame(
            ['total' => 359_000, 'dana_diterima' => 400_000, 'sisa' => 0, 'kelebihan_bayar' => 41_000, 'status' => 'lebih_bayar'],
            array_diff_key($eka, ['customer' => true]),
        );
        self::assertSame(['id', 'nama', 'no_wa', 'no_wa_tampil', 'diarsipkan'], array_keys($eka['customer']));
        self::assertSame('081200000005', $eka['customer']['no_wa_tampil']);
        $budi = $list['data'][1];
        self::assertSame([359_000, 100_000, 259_000, 0], [$budi['total'], $budi['dana_diterima'], $budi['sisa'], $budi['kelebihan_bayar']]);
    }

    public function testFilterStatusTidakMengubahJumlahPerStatus(): void
    {
        $po = $this->poDenganSemuaStatus();
        $semua = ['semua' => 6, 'belum_bayar' => 1, 'kurang_dp' => 1, 'dp' => 1, 'lunas' => 2, 'lebih_bayar' => 1];
        $url = '/api/v1/open-po/' . $po['id'] . '/customer';

        $lunas = self::json($this->call('GET', $url, query: ['status' => 'lunas']));
        self::assertSame(['Dewi', 'Fajar'], array_column(array_column($lunas['data'], 'customer'), 'nama'));
        self::assertSame(2, $lunas['meta']['total']);
        self::assertSame($semua, $lunas['meta']['jumlah_per_status']);

        foreach (['belum_bayar' => 'Andi', 'kurang_dp' => 'budi', 'dp' => 'Citra', 'lebih_bayar' => 'Eka'] as $status => $nama) {
            $result = self::json($this->call('GET', $url, query: ['status' => $status]));
            self::assertSame([$nama], array_column(array_column($result['data'], 'customer'), 'nama'), $status);
            self::assertSame($semua, $result['meta']['jumlah_per_status']);
        }

        $page = self::json($this->call('GET', $url, query: ['per_halaman' => '2', 'halaman' => '2']));
        self::assertSame(['Citra', 'Dewi'], array_column(array_column($page['data'], 'customer'), 'nama'));
        self::assertSame(['halaman' => 2, 'per_halaman' => 2, 'total' => 6, 'total_halaman' => 3], array_diff_key(
            $page['meta'],
            ['jumlah_per_status' => true],
        ));

        $error = $this->fails($this->call('GET', $url, query: ['status' => 'aktif']), 422, 'VALIDASI');
        self::assertSame(
            ['status' => 'Status harus salah satu dari belum_bayar, kurang_dp, dp, lunas, lebih_bayar.'],
            $error['field'],
        );
        $this->fails($this->call('GET', $url, query: ['per_halaman' => '0']), 422, 'VALIDASI');
    }

    public function testStatusBerubahSaatBarisDitandaiKosong(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $cart = $this->addLine($po, $rina, 'Barang B', '8,50', 3, '15');
        $this->pay($po, $rina, 1_102_000);
        $url = '/api/v1/open-po/' . $po['id'] . '/customer';
        self::assertSame('lunas', self::json($this->call('GET', $url))['data'][0]['status']);

        $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));

        $list = self::json($this->call('GET', $url, query: ['status' => 'lebih_bayar']));
        self::assertSame(384_000, $list['data'][0]['kelebihan_bayar']);
        self::assertSame(1, $list['meta']['jumlah_per_status']['lebih_bayar']);
        self::assertSame(0, $list['meta']['jumlah_per_status']['lunas']);
    }

    public function testPoTanpaKeranjang(): void
    {
        $po = $this->createOpenPo();

        $list = self::json($this->call('GET', '/api/v1/open-po/' . $po['id'] . '/customer'));

        self::assertSame([], $list['data']);
        self::assertSame(0, $list['meta']['total']);
        self::assertSame(0, $list['meta']['total_halaman']);
        self::assertSame(
            ['semua' => 0, 'belum_bayar' => 0, 'kurang_dp' => 0, 'dp' => 0, 'lunas' => 0, 'lebih_bayar' => 0],
            $list['meta']['jumlah_per_status'],
        );
        self::assertSame([], $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id'] . '/barang-unik')));
    }

    public function testBarangUnikPerNamaDanHargaTermasukKosong(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $sari = $this->createCustomer('Sari', '081398765432');
        $this->addLine($po, $rina, 'Barang C', '129,99', 1, '8');
        $cart = $this->addLine($po, $rina, 'Barang B', '8,50', 3, '15');
        $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));
        $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $this->addLine($po, $sari, 'Barang A', '24.95', 1, '12');  // sama: nama + harga
        $this->addLine($po, $sari, 'barang a', '24,95', 1, '10');  // beda huruf besar/kecil saja: digabung
        $this->addLine($po, $sari, 'Barang A', '25', 1, '10');     // harga beda: baris sendiri
        $this->addLine($this->createOpenPo('PO lain'), $sari, 'Barang Z', '1', 1, '10');

        self::assertSame([
            ['nama_barang' => 'Barang A', 'harga_aud' => '24.95'],
            ['nama_barang' => 'Barang A', 'harga_aud' => '25.00'],
            ['nama_barang' => 'Barang B', 'harga_aud' => '8.50'],
            ['nama_barang' => 'Barang C', 'harga_aud' => '129.99'],
        ], $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id'] . '/barang-unik')));
    }
}
