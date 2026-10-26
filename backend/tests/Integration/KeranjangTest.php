<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

/**
 * Keranjang: skenario QA scope langkah 1–5 (dengan teks rekap WA persis ui-spec §9.6),
 * kurs terkunci, baris pesanan, customer arsip, dan keranjang kosong.
 */
final class KeranjangTest extends IntegrationTestCase
{
    private const HEADER = "*REKAP JASTIP - Open PO Australia Nov 2026*\n"
        . "Customer: Rina (081234567890)\n"
        . "\n";

    private const BARANG_ABC = "1. Barang A\n"
        . "   2 x Rp359.000 = Rp718.000\n"
        . "2. Barang B\n"
        . "   3 x Rp128.000 = Rp384.000\n"
        . "3. Barang C\n"
        . "   1 x Rp1.833.000 = Rp1.833.000\n"
        . "\n";

    private const BARANG_B_KOSONG = "1. Barang A\n"
        . "   2 x Rp359.000 = Rp718.000\n"
        . "2. Barang B (Kosong, tidak ditagih)\n"
        . "3. Barang C\n"
        . "   1 x Rp1.833.000 = Rp1.833.000\n"
        . "\n";

    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
    }

    public function testSkenarioQaLangkah1Sampai5(): void
    {
        $po = $this->createOpenPo();
        self::assertSame(13_054, $po['kurs']['kurs_jastip']);
        $rina = $this->createCustomer('Rina', '081234567890');
        $path = self::cartPath($po, $rina);

        // Sebelum ada barang: keranjang belum ada, GET tetap 200 dengan angka nol.
        $kosong = $this->ok($this->call('GET', $path));
        self::assertSame(0, $kosong['ringkasan']['total']);
        self::assertSame([], $kosong['barang']);
        self::assertSame([], $kosong['riwayat']);
        self::assertFalse($kosong['open_po']['kurs_terkunci']);

        // Langkah 1: Barang A, B, C.
        $response = $this->call('POST', $path . '/baris-pesanan', [
            'nama_barang' => 'Barang A',
            'harga_aud' => '24,95',
            'qty' => 2,
            'markup_persen' => '10',
        ]);
        $cart = $this->ok($response, 201);
        self::assertSame(
            ['dibuat' => ['jenis' => 'baris_pesanan', 'id' => $cart['barang'][0]['id']]],
            self::json($response)['meta'],
        );
        $this->addLine($po, $rina, 'Barang B', '8.50', 3, '15');
        $cart = $this->addLine($po, $rina, 'Barang C', '129,99', 1, '8');

        self::assertSame(
            [
                'id' => $po['id'],
                'nama' => 'Open PO Australia Nov 2026',
                'status' => 'buka',
                'kurs_jastip' => 13_054,
                'kurs_terkunci' => true,
            ],
            $cart['open_po'],
        );
        self::assertSame(
            ['id' => $rina['id'], 'nama' => 'Rina', 'no_wa' => '6281234567890', 'no_wa_tampil' => '081234567890', 'diarsipkan' => false],
            $cart['customer'],
        );
        $barang = array_map(static fn (array $b): array => array_intersect_key($b, array_flip([
            'nama_barang', 'harga_aud', 'qty', 'markup_persen', 'kurs_jastip', 'harga_jual_unit', 'subtotal', 'kosong',
        ])), $cart['barang']);
        self::assertSame([
            ['nama_barang' => 'Barang A', 'harga_aud' => '24.95', 'qty' => 2, 'markup_persen' => '10', 'kurs_jastip' => 13_054,
                'harga_jual_unit' => 359_000, 'subtotal' => 718_000, 'kosong' => false],
            ['nama_barang' => 'Barang B', 'harga_aud' => '8.50', 'qty' => 3, 'markup_persen' => '15', 'kurs_jastip' => 13_054,
                'harga_jual_unit' => 128_000, 'subtotal' => 384_000, 'kosong' => false],
            ['nama_barang' => 'Barang C', 'harga_aud' => '129.99', 'qty' => 1, 'markup_persen' => '8', 'kurs_jastip' => 13_054,
                'harga_jual_unit' => 1_833_000, 'subtotal' => 1_833_000, 'kosong' => false],
        ], $barang);
        self::assertSame('2026-10-25T09:00:00Z', $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']))['kurs_terkunci_pada']);
        self::assertSame(
            self::ringkasan(2_935_000, 1_468_000, 0, 0, 0, 2_935_000, 0, 'belum_bayar'),
            $cart['ringkasan'],
        );
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "*Mohon transfer DP: Rp1.468.000*\n"
            . 'Status: BELUM BAYAR',
            $this->rekap($po, $rina),
        );

        // Langkah 2: bayar DP Rp1.468.000.
        $response = $this->call('POST', $path . '/pembayaran', ['nominal' => 1_468_000, 'tanggal' => '2026-10-28']);
        $cart = $this->ok($response, 201);
        $bayar1 = $cart['riwayat'][0]['id'];
        self::assertSame(['dibuat' => ['jenis' => 'pembayaran', 'id' => $bayar1]], self::json($response)['meta']);
        self::assertSame(
            self::ringkasan(2_935_000, 1_468_000, 1_468_000, 0, 1_468_000, 1_467_000, 0, 'dp'),
            $cart['ringkasan'],
        );
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "Sudah dibayar: Rp1.468.000\n"
            . "*Sisa pelunasan: Rp1.467.000*\n"
            . 'Status: DP DITERIMA ✅',
            $this->rekap($po, $rina),
        );

        // Langkah 3: bayar sisa Rp1.467.000.
        $cart = $this->pay($po, $rina, 1_467_000, '2026-10-30');
        $bayar2 = $cart['riwayat'][0]['id'];
        self::assertSame(
            self::ringkasan(2_935_000, 1_468_000, 2_935_000, 0, 2_935_000, 0, 0, 'lunas'),
            $cart['ringkasan'],
        );
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "Sudah dibayar: Rp2.935.000\n"
            . "*Sisa pelunasan: Rp0*\n"
            . 'Status: LUNAS ✅',
            $this->rekap($po, $rina),
        );

        // Langkah 4: Barang B ditandai Kosong → Lebih bayar Rp384.000.
        $cart = $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));
        self::assertTrue($cart['barang'][1]['kosong']);
        self::assertSame(384_000, $cart['barang'][1]['subtotal'], 'Subtotal Kosong tetap dikirim untuk teks coret');
        self::assertSame(
            self::ringkasan(2_551_000, 1_276_000, 2_935_000, 0, 2_935_000, 0, 384_000, 'lebih_bayar'),
            $cart['ringkasan'],
        );
        self::assertSame(
            self::HEADER . self::BARANG_B_KOSONG
            . "*Total: Rp2.551.000*\n"
            . "DP 50%: Rp1.276.000\n"
            . "Sudah dibayar: Rp2.935.000\n"
            . "*Kelebihan bayar (akan dikembalikan): Rp384.000*\n"
            . 'Status: LEBIH BAYAR',
            $this->rekap($po, $rina),
        );

        // Langkah 5: pengembalian dana Rp384.000 → Lunas.
        $response = $this->call('POST', $path . '/pengembalian-dana', [
            'nominal' => 384_000,
            'tanggal' => '2026-10-31',
            'catatan' => 'transfer BCA 31 Okt',
        ]);
        $cart = $this->ok($response, 201);
        $kembali = $cart['riwayat'][0]['id'];
        self::assertSame(['dibuat' => ['jenis' => 'pengembalian_dana', 'id' => $kembali]], self::json($response)['meta']);
        self::assertSame(
            self::ringkasan(2_551_000, 1_276_000, 2_935_000, 384_000, 2_551_000, 0, 0, 'lunas'),
            $cart['ringkasan'],
        );
        self::assertSame(
            self::HEADER . self::BARANG_B_KOSONG
            . "*Total: Rp2.551.000*\n"
            . "DP 50%: Rp1.276.000\n"
            . "Sudah dibayar: Rp2.935.000\n"
            . "Dikembalikan: Rp384.000\n"
            . "*Sisa pelunasan: Rp0*\n"
            . 'Status: LUNAS ✅',
            $this->rekap($po, $rina),
        );

        // Riwayat terbaru di atas; kedua pembayaran masih bisa dihapus (sisa ≥ pengembalian).
        $riwayat = array_map(static fn (array $r): array => array_diff_key($r, ['dibuat_pada' => true]), $cart['riwayat']);
        self::assertSame([
            ['jenis' => 'pengembalian_dana', 'id' => $kembali, 'nominal' => 384_000, 'tanggal' => '2026-10-31',
                'catatan' => 'transfer BCA 31 Okt', 'bisa_dihapus' => true],
            ['jenis' => 'pembayaran', 'id' => $bayar2, 'nominal' => 1_467_000, 'tanggal' => '2026-10-30',
                'catatan' => null, 'bisa_dihapus' => true],
            ['jenis' => 'pembayaran', 'id' => $bayar1, 'nominal' => 1_468_000, 'tanggal' => '2026-10-28',
                'catatan' => null, 'bisa_dihapus' => true],
        ], $riwayat);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $cart['riwayat'][0]['dibuat_pada']);

        // Ringkasan Open PO dan punya_pesanan dari data yang dibuat lewat API.
        $detail = $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']));
        self::assertSame(['jumlah_customer' => 1, 'total_pesanan' => 2_551_000, 'dana_diterima' => 2_551_000], $detail['ringkasan']);
        self::assertTrue($this->ok($this->call('GET', '/api/v1/customer/' . $rina['id']))['punya_pesanan']);

        // GET keranjang = respons aksi terakhir.
        self::assertSame($cart, $this->ok($this->call('GET', $path)));
    }

    public function testKursTerkunciSetelahBarisPertamaDanTetapTerkunciSetelahSemuaDihapus(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $sari = $this->createCustomer('Sari', '081398765432');

        // Sebelum terkunci kurs masih bisa diubah, dan baris pertama memakai kurs terbaru PO.
        $this->ok($this->call('PATCH', '/api/v1/open-po/' . $po['id'], ['kurs' => ['mode' => 'manual', 'kurs_jastip' => 10_000]]));
        $cart = $this->addLine($po, $rina, 'Barang tepat', '35,90', 1, '0');
        self::assertSame(10_000, $cart['barang'][0]['kurs_jastip']);
        self::assertSame(359_000, $cart['barang'][0]['harga_jual_unit']);
        self::assertTrue($cart['open_po']['kurs_terkunci']);

        $kursBaru = ['kurs' => ['mode' => 'manual', 'kurs_jastip' => 12_000]];
        $this->fails($this->call('PATCH', '/api/v1/open-po/' . $po['id'], $kursBaru), 409, 'KURS_TERKUNCI');

        // Baris berikutnya tidak menggeser waktu kunci.
        $this->clock->advance('+2 hours');
        $cartSari = $this->addLine($po, $sari, 'Barang lain', '10', 1, '10');
        self::assertSame(
            '2026-10-25T09:00:00Z',
            $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']))['kurs_terkunci_pada'],
        );

        // Hapus semua baris: kurs tetap terkunci permanen.
        $this->ok($this->call('DELETE', '/api/v1/baris-pesanan/' . $cart['barang'][0]['id']));
        $this->ok($this->call('DELETE', '/api/v1/baris-pesanan/' . $cartSari['barang'][0]['id']));
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM baris_pesanan')->fetchColumn());

        $detail = $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']));
        self::assertTrue($detail['kurs_terkunci']);
        self::assertSame('2026-10-25T09:00:00Z', $detail['kurs_terkunci_pada']);
        self::assertSame(['jumlah_customer' => 0, 'total_pesanan' => 0, 'dana_diterima' => 0], $detail['ringkasan']);
        $this->fails($this->call('PATCH', '/api/v1/open-po/' . $po['id'], $kursBaru), 409, 'KURS_TERKUNCI');
        $this->fails(
            $this->call('PATCH', '/api/v1/open-po/' . $po['id'], [
                'kurs' => ['mode' => 'otomatis', 'kurs_pasar' => '12673', 'tanggal_kurs' => '2026-10-25'],
            ]),
            409,
            'KURS_TERKUNCI',
        );
        self::assertSame(10_000, $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']))['kurs']['kurs_jastip']);
        self::assertContains('baris_pesanan_dihapus', $this->logger->events());
    }

    public function testPembayaranSajaTidakMengunciKurs(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');

        $cart = $this->pay($po, $rina, 100_000);

        self::assertFalse($cart['open_po']['kurs_terkunci']);
        self::assertSame('lebih_bayar', $cart['ringkasan']['status']);
        $this->ok($this->call('PATCH', '/api/v1/open-po/' . $po['id'], ['kurs' => ['mode' => 'manual', 'kurs_jastip' => 13_100]]));
    }

    public function testUbahBarisMenghitungUlangDenganKursSnapshotBaris(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $cart = $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $id = $cart['barang'][0]['id'];

        // Snapshot kurs baris sengaja dibuat beda dari kurs PO untuk membuktikan yang dipakai snapshot.
        $this->pdo->prepare('UPDATE baris_pesanan SET kurs_jastip = 10000 WHERE id = ?')->execute([$id]);

        $updated = $this->ok($this->call('PATCH', '/api/v1/baris-pesanan/' . $id, [
            'nama_barang' => ' Barang A (biru) ',
            'harga_aud' => '35.9',
            'markup_persen' => '0',
        ]));
        $line = $updated['barang'][0];
        self::assertSame('Barang A (biru)', $line['nama_barang']);
        self::assertSame('35.90', $line['harga_aud']);
        self::assertSame('0', $line['markup_persen']);
        self::assertSame(2, $line['qty']);
        self::assertSame(10_000, $line['kurs_jastip']);
        self::assertSame(359_000, $line['harga_jual_unit']);
        self::assertSame(718_000, $line['subtotal']);

        $qty = $this->ok($this->call('PATCH', '/api/v1/baris-pesanan/' . $id, ['qty' => 3]));
        self::assertSame(1_077_000, $qty['barang'][0]['subtotal']);
        self::assertSame(1_077_000, $qty['ringkasan']['total']);

        // Body kosong: tidak ada perubahan, tetap 200 dengan objek keranjang.
        self::assertSame($qty['barang'], $this->ok($this->call('PATCH', '/api/v1/baris-pesanan/' . $id, []))['barang']);
    }

    public function testTandaKosongIdempotenDanBarisKosongTetapBisaDiubah(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $cart = $this->addLine($po, $rina, 'Barang B', '8,50', 3, '15');
        $b = $cart['barang'][1]['id'];

        $once = $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $b . '/kosong'));
        $twice = $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $b . '/kosong'));
        self::assertSame($once, $twice);
        self::assertSame(718_000, $twice['ringkasan']['total']);

        $edited = $this->ok($this->call('PATCH', '/api/v1/baris-pesanan/' . $b, ['qty' => 1]));
        self::assertTrue($edited['barang'][1]['kosong']);
        self::assertSame(128_000, $edited['barang'][1]['subtotal']);
        self::assertSame(718_000, $edited['ringkasan']['total']);

        $lepas = $this->ok($this->call('DELETE', '/api/v1/baris-pesanan/' . $b . '/kosong'));
        self::assertFalse($lepas['barang'][1]['kosong']);
        self::assertSame(846_000, $lepas['ringkasan']['total']);
        self::assertSame($lepas, $this->ok($this->call('DELETE', '/api/v1/baris-pesanan/' . $b . '/kosong')));
    }

    public function testCustomerDiarsipkanTidakBisaMembuatKeranjangBaruTapiKeranjangLamaTetapTerbuka(): void
    {
        $poLama = $this->createOpenPo('PO lama');
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->addLine($poLama, $rina, 'Barang A', '24,95', 2, '10');
        $this->ok($this->call('POST', '/api/v1/customer/' . $rina['id'] . '/arsip'));

        // Keranjang lama tetap bisa dibuka, direkap, dan masih menerima barang/pembayaran.
        $lama = $this->ok($this->call('GET', self::cartPath($poLama, $rina)));
        self::assertTrue($lama['customer']['diarsipkan']);
        self::assertSame(718_000, $lama['ringkasan']['total']);
        self::assertStringContainsString('Customer: Rina (081234567890)', $this->rekap($poLama, $rina));
        $this->pay($poLama, $rina, 359_000);
        self::assertCount(2, $this->addLine($poLama, $rina, 'Barang B', '8,50', 1, '15')['barang']);
        $list = self::json($this->call('GET', '/api/v1/open-po/' . $poLama['id'] . '/customer'))['data'];
        self::assertSame([[
            'id' => $rina['id'], 'nama' => 'Rina', 'no_wa' => '6281234567890', 'no_wa_tampil' => '081234567890', 'diarsipkan' => true,
        ]], array_column($list, 'customer'));

        // PO baru: tidak boleh membuat keranjang, lewat barang maupun pembayaran.
        $poBaru = $this->createOpenPo('PO baru');
        $error = $this->fails($this->call('POST', self::cartPath($poBaru, $rina) . '/baris-pesanan', [
            'nama_barang' => 'Barang A', 'harga_aud' => '24,95', 'qty' => 1, 'markup_persen' => '10',
        ]), 409, 'CUSTOMER_DIARSIPKAN');
        self::assertSame('Customer ini sudah diarsipkan.', $error['pesan']);
        $this->fails($this->call('POST', self::cartPath($poBaru, $rina) . '/pembayaran', [
            'nominal' => 100_000, 'tanggal' => '2026-10-28',
        ]), 409, 'CUSTOMER_DIARSIPKAN');

        // Seluruh transaksi dibatalkan: tidak ada keranjang baru dan kurs PO baru belum terkunci.
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM keranjang WHERE open_po_id = ?');
        $stmt->execute([$poBaru['id']]);
        self::assertSame(0, (int) $stmt->fetchColumn());
        self::assertFalse($this->ok($this->call('GET', '/api/v1/open-po/' . $poBaru['id']))['kurs_terkunci']);

        // GET keranjang (belum ada) tetap 200 dengan angka nol.
        $baru = $this->ok($this->call('GET', self::cartPath($poBaru, $rina)));
        self::assertSame(0, $baru['ringkasan']['total']);
        self::assertTrue($baru['customer']['diarsipkan']);
    }

    public function testKeranjangKosongTidakMunculDiDaftarCustomerPo(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $sari = $this->createCustomer('Sari', '081398765432');
        $dewi = $this->createCustomer('Dewi', '081311112222');
        $this->addLine($po, $rina, 'Barang A', '24,95', 1, '10');

        // Sari: barang lalu dihapus. Dewi: pembayaran lalu dihapus. Keranjangnya tetap ada tapi kosong.
        $sariCart = $this->addLine($po, $sari, 'Barang salah', '10', 1, '10');
        $this->ok($this->call('DELETE', '/api/v1/baris-pesanan/' . $sariCart['barang'][0]['id']));
        $dewiCart = $this->pay($po, $dewi, 50_000);
        $this->ok($this->call('DELETE', '/api/v1/pembayaran/' . $dewiCart['riwayat'][0]['id']));
        self::assertSame(3, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());

        $list = self::json($this->call('GET', '/api/v1/open-po/' . $po['id'] . '/customer'));
        self::assertSame(['Rina'], array_column(array_column($list['data'], 'customer'), 'nama'));
        self::assertSame(1, $list['meta']['total']);
        self::assertSame(1, $list['meta']['jumlah_per_status']['semua']);
        self::assertSame(1, $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']))['ringkasan']['jumlah_customer']);

        // Customer dengan keranjang kosong belum dianggap punya pesanan, jadi masih bisa dihapus.
        self::assertFalse($this->ok($this->call('GET', '/api/v1/customer/' . $sari['id']))['punya_pesanan']);
        $sudahDiPo = self::json($this->call('GET', '/api/v1/customer', query: ['open_po_id' => (string) $po['id']]))['data'];
        self::assertSame(['Dewi' => false, 'Rina' => true, 'Sari' => false], array_column($sudahDiPo, 'sudah_di_po', 'nama'));
        self::assertSame(204, $this->call('DELETE', '/api/v1/customer/' . $sari['id'])->status);
    }

    public function testOperasiBarisMemakaiKeranjangPemiliknya(): void
    {
        $po = $this->createOpenPo();
        $poLain = $this->createOpenPo('PO lain');
        $rina = $this->createCustomer('Rina', '081234567890');
        $sari = $this->createCustomer('Sari', '081398765432');
        $rinaCart = $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $sariCart = $this->addLine($poLain, $sari, 'Barang Sari', '8,50', 3, '15');

        $updated = $this->ok($this->call('PATCH', '/api/v1/baris-pesanan/' . $sariCart['barang'][0]['id'], ['qty' => 1]));

        self::assertSame($poLain['id'], $updated['open_po']['id']);
        self::assertSame($sari['id'], $updated['customer']['id']);
        self::assertSame(128_000, $updated['ringkasan']['total']);
        self::assertSame($rinaCart['barang'], $this->ok($this->call('GET', self::cartPath($po, $rina)))['barang']);
        // Customer yang tidak punya keranjang di PO ini melihat keranjang kosong, bukan milik orang lain.
        self::assertSame([], $this->ok($this->call('GET', self::cartPath($po, $sari)))['barang']);
    }

    /**
     * @return array<string, int|string>
     */
    private static function ringkasan(
        int $total,
        int $dp,
        int $bayar,
        int $kembali,
        int $dana,
        int $sisa,
        int $lebih,
        string $status,
    ): array {
        return [
            'total' => $total,
            'dp' => $dp,
            'dp_persen' => '50',
            'total_pembayaran' => $bayar,
            'total_pengembalian' => $kembali,
            'dana_diterima' => $dana,
            'sisa' => $sisa,
            'kelebihan_bayar' => $lebih,
            'status' => $status,
        ];
    }
}
