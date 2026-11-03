<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

/**
 * Pembayaran dan pengembalian dana: aturan hapus pembayaran (HAPUS_PENGEMBALIAN_DULU),
 * aturan pengembalian dana (hanya Lebih bayar, nominal ≤ kelebihan bayar), dan log hapus.
 */
final class PembayaranTest extends IntegrationTestCase
{
    /** @var array<string, mixed> */
    private array $po;
    /** @var array<string, mixed> */
    private array $rina;

    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
        $this->po = $this->createOpenPo();
        $this->rina = $this->createCustomer('Rina', '081234567890');
    }

    /**
     * Barang A + B + C (total Rp2.935.000).
     *
     * @return array<string, mixed> objek keranjang
     */
    private function cartAbc(): array
    {
        $this->addLine($this->po, $this->rina, 'Barang A', '24,95', 2, '10');
        $this->addLine($this->po, $this->rina, 'Barang B', '8,50', 3, '15');

        return $this->addLine($this->po, $this->rina, 'Barang C', '129,99', 1, '8');
    }

    /**
     * Satu pembayaran Rp2.935.000, B Kosong → Lebih bayar Rp384.000.
     *
     * @return array<string, mixed> objek keranjang
     */
    private function lebihBayar384(): array
    {
        $cart = $this->cartAbc();
        $this->pay($this->po, $this->rina, 2_935_000);

        return $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));
    }

    public function testHapusPembayaranDiblokirLaluBerhasilSetelahPengembalianDanaDihapus(): void
    {
        $this->lebihBayar384();
        $cart = $this->refund($this->po, $this->rina, 384_000, '2026-10-29', 'transfer BCA');
        [$kembali, $bayar] = $cart['riwayat'];
        self::assertSame(['pengembalian_dana', true], [$kembali['jenis'], $kembali['bisa_dihapus']]);
        // Menghapus satu-satunya pembayaran membuat dana diterima −Rp384.000.
        self::assertSame(['pembayaran', false], [$bayar['jenis'], $bayar['bisa_dihapus']]);

        $error = $this->fails($this->call('DELETE', '/api/v1/pembayaran/' . $bayar['id']), 409, 'HAPUS_PENGEMBALIAN_DULU');
        self::assertSame(
            'Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana Rp384.000. '
            . 'Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini.',
            $error['pesan'],
        );
        self::assertArrayNotHasKey('field', $error);
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM pembayaran')->fetchColumn());

        // Hapus pengembalian dana dulu: status kembali Lebih bayar, pembayaran jadi bisa dihapus.
        $cart = $this->ok($this->call('DELETE', '/api/v1/pengembalian-dana/' . $kembali['id']));
        self::assertSame('lebih_bayar', $cart['ringkasan']['status']);
        self::assertSame(384_000, $cart['ringkasan']['kelebihan_bayar']);
        self::assertSame([['pembayaran', true]], array_map(
            static fn (array $r): array => [$r['jenis'], $r['bisa_dihapus']],
            $cart['riwayat'],
        ));

        $cart = $this->ok($this->call('DELETE', '/api/v1/pembayaran/' . $bayar['id']));
        self::assertSame([], $cart['riwayat']);
        self::assertSame('belum_bayar', $cart['ringkasan']['status']);
        self::assertSame(0, $cart['ringkasan']['dana_diterima']);
        self::assertSame(2_551_000, $cart['ringkasan']['sisa']);

        // Jejak hapus di log: ID, nominal, ID keranjang, tanpa data pribadi.
        $logs = array_values(array_filter(
            $this->logger->records,
            static fn (array $r): bool => in_array($r['event'], ['pembayaran_dihapus', 'pengembalian_dana_dihapus'], true),
        ));
        $keranjangId = (int) $this->pdo->query('SELECT id FROM keranjang')->fetchColumn();
        self::assertSame([
            ['level' => 'info', 'event' => 'pengembalian_dana_dihapus',
                'context' => ['pengembalian_dana_id' => $kembali['id'], 'nominal' => 384_000, 'keranjang_id' => $keranjangId]],
            ['level' => 'info', 'event' => 'pembayaran_dihapus',
                'context' => ['pembayaran_id' => $bayar['id'], 'nominal' => 2_935_000, 'keranjang_id' => $keranjangId]],
        ], $logs);
        self::assertStringNotContainsString('Rina', $this->logger->dump());
        self::assertStringNotContainsString('6281234567890', $this->logger->dump());
    }

    public function testHapusSebagianPembayaranDiizinkanSelamaDanaTidakNegatif(): void
    {
        $cart = $this->cartAbc();
        $this->pay($this->po, $this->rina, 1_468_000);
        $this->pay($this->po, $this->rina, 1_467_000, '2026-10-30');
        $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));
        $cart = $this->refund($this->po, $this->rina, 384_000);

        // QA langkah 5: masing-masing pembayaran masih ≥ pengembalian dana kalau yang lain dihapus.
        $bayar = array_values(array_filter($cart['riwayat'], static fn (array $r): bool => $r['jenis'] === 'pembayaran'));
        self::assertSame([true, true], array_column($bayar, 'bisa_dihapus'));

        $cart = $this->ok($this->call('DELETE', '/api/v1/pembayaran/' . $bayar[0]['id']));
        // Sisa: bayar Rp1.468.000 − kembali Rp384.000 = Rp1.084.000 < DP Rp1.276.000.
        self::assertSame(1_084_000, $cart['ringkasan']['dana_diterima']);
        self::assertSame('kurang_dp', $cart['ringkasan']['status']);
        // Pembayaran terakhir sekarang tidak bisa dihapus (1.468.000 − 1.468.000 < 384.000).
        $sisa = array_values(array_filter($cart['riwayat'], static fn (array $r): bool => $r['jenis'] === 'pembayaran'));
        self::assertSame([false], array_column($sisa, 'bisa_dihapus'));
        $this->fails($this->call('DELETE', '/api/v1/pembayaran/' . $sisa[0]['id']), 409, 'HAPUS_PENGEMBALIAN_DULU');
    }

    public function testPengembalianDanaSaatStatusBukanLebihBayarDitolak409(): void
    {
        $this->cartAbc();
        $this->pay($this->po, $this->rina, 1_468_000);

        $error = $this->fails($this->call('POST', self::cartPath($this->po, $this->rina) . '/pengembalian-dana', [
            'nominal' => 1_000, 'tanggal' => '2026-10-29',
        ]), 409, 'PENGEMBALIAN_TIDAK_AKTIF');
        self::assertSame('Pengembalian dana hanya bisa dicatat saat status Lebih bayar.', $error['pesan']);

        // Customer tanpa keranjang di PO ini: status Lunas (0 = 0), juga ditolak dan keranjang tidak dibuat.
        $sari = $this->createCustomer('Sari', '081398765432');
        $this->fails($this->call('POST', self::cartPath($this->po, $sari) . '/pengembalian-dana', [
            'nominal' => 1_000, 'tanggal' => '2026-10-29',
        ]), 409, 'PENGEMBALIAN_TIDAK_AKTIF');
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM pengembalian_dana')->fetchColumn());
    }

    public function testPengembalianDanaMelebihiKelebihanBayarDitolak422(): void
    {
        $this->lebihBayar384();
        $path = self::cartPath($this->po, $this->rina) . '/pengembalian-dana';

        $error = $this->fails($this->call('POST', $path, ['nominal' => 384_001, 'tanggal' => '2026-10-29']), 422, 'VALIDASI');
        self::assertSame(['nominal' => 'Nominal maksimal Rp384.000 (kelebihan bayar).'], $error['field']);
        self::assertSame('Nominal maksimal Rp384.000 (kelebihan bayar).', $error['pesan']);

        // Pengembalian sebagian: status tetap Lebih bayar, batas ikut turun.
        $cart = $this->refund($this->po, $this->rina, 100_000, '2026-10-29', '');
        self::assertSame('lebih_bayar', $cart['ringkasan']['status']);
        self::assertSame(284_000, $cart['ringkasan']['kelebihan_bayar']);
        self::assertNull($cart['riwayat'][0]['catatan'], 'Catatan kosong disimpan sebagai null');

        $error = $this->fails($this->call('POST', $path, ['nominal' => 284_001, 'tanggal' => '2026-10-30']), 422, 'VALIDASI');
        self::assertSame(['nominal' => 'Nominal maksimal Rp284.000 (kelebihan bayar).'], $error['field']);

        $cart = $this->refund($this->po, $this->rina, 284_000, '2026-10-30');
        self::assertSame('lunas', $cart['ringkasan']['status']);
        self::assertSame(384_000, $cart['ringkasan']['total_pengembalian']);
        self::assertSame(2_551_000, $cart['ringkasan']['dana_diterima']);

        // Sudah Lunas: pengembalian berikutnya ditolak 409.
        $this->fails($this->call('POST', $path, ['nominal' => 1_000, 'tanggal' => '2026-10-30']), 409, 'PENGEMBALIAN_TIDAK_AKTIF');
        self::assertSame(2, (int) $this->pdo->query('SELECT COUNT(*) FROM pengembalian_dana')->fetchColumn());
    }

    public function testRiwayatTerbaruDiAtasMenurutTanggalLaluWaktuDicatat(): void
    {
        $this->addLine($this->po, $this->rina, 'Barang A', '24,95', 1, '10');
        $path = self::cartPath($this->po, $this->rina);
        $catat = function (string $jenis, int $nominal, string $tanggal) use ($path): int {
            $response = $this->call('POST', $path . '/' . $jenis, ['nominal' => $nominal, 'tanggal' => $tanggal]);
            self::assertSame(201, $response->status, $response->body());

            return self::json($response)['meta']['dibuat']['id'];
        };
        $p1 = $catat('pembayaran', 100_000, '2026-10-30');
        $p2 = $catat('pembayaran', 300_000, '2026-10-28');
        $p3 = $catat('pembayaran', 200_000, '2026-10-30');
        // Bayar Rp600.000 untuk total Rp359.000 → kelebihan Rp241.000.
        $r1 = $catat('pengembalian-dana', 50_000, '2026-10-30');

        $riwayat = $this->ok($this->call('GET', self::cartPath($this->po, $this->rina)))['riwayat'];
        self::assertSame(
            [['pengembalian_dana', $r1], ['pembayaran', $p3], ['pembayaran', $p1], ['pembayaran', $p2]],
            array_map(static fn (array $r): array => [$r['jenis'], $r['id']], $riwayat),
        );
    }

    public function testPembayaranPertamaMembuatKeranjang(): void
    {
        $cart = $this->pay($this->po, $this->rina, 1_000_000_000_000);

        self::assertSame(1_000_000_000_000, $cart['ringkasan']['total_pembayaran']);
        self::assertSame('lebih_bayar', $cart['ringkasan']['status']);
        self::assertSame(
            ['jumlah_customer' => 1, 'total_pesanan' => 0, 'dana_diterima' => 1_000_000_000_000],
            $this->ok($this->call('GET', '/api/v1/open-po/' . $this->po['id']))['ringkasan'],
        );
        self::assertTrue($this->ok($this->call('GET', '/api/v1/customer/' . $this->rina['id']))['punya_pesanan']);
    }
}
