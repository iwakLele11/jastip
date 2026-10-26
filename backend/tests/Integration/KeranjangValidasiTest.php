<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Validasi input sesuai tabel pesan kontrak §10, dan 404 untuk ID yang tidak ada.
 */
final class KeranjangValidasiTest extends IntegrationTestCase
{
    private const BARANG_OK = ['nama_barang' => 'Barang A', 'harga_aud' => '24,95', 'qty' => 2, 'markup_persen' => '10'];

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
     * @return array<string, array{array<string, mixed>, array<string, string>}>
     */
    public static function barangSalah(): array
    {
        $ok = self::BARANG_OK;

        return [
            'semua kosong' => [[], [
                'nama_barang' => 'Nama barang wajib diisi.',
                'harga_aud' => 'Harga wajib diisi.',
                'qty' => 'Qty minimal 1.',
                'markup_persen' => 'Markup wajib diisi.',
            ]],
            'nama spasi' => [['nama_barang' => '   '] + $ok, ['nama_barang' => 'Nama barang wajib diisi.']],
            'nama 151 karakter' => [['nama_barang' => str_repeat('é', 151)] + $ok, ['nama_barang' => 'Nama barang maksimal 150 karakter.']],
            'harga kosong' => [['harga_aud' => ' '] + $ok, ['harga_aud' => 'Harga wajib diisi.']],
            'harga nol' => [['harga_aud' => '0,00'] + $ok, ['harga_aud' => 'Harga harus lebih dari 0.']],
            'harga negatif' => [['harga_aud' => '-1'] + $ok, ['harga_aud' => 'Harga harus lebih dari 0.']],
            'harga 3 desimal (1.299)' => [['harga_aud' => '1.299'] + $ok, ['harga_aud' => 'Maksimal 2 angka di belakang koma.']],
            'harga huruf' => [['harga_aud' => 'dua puluh'] + $ok, ['harga_aud' => 'Isi angka saja, mis. 24,95.']],
            'harga pemisah ribuan' => [['harga_aud' => '1.299,00'] + $ok, ['harga_aud' => 'Isi angka saja, mis. 24,95.']],
            'harga angka JSON' => [['harga_aud' => 24.95] + $ok, ['harga_aud' => 'Isi angka saja, mis. 24,95.']],
            'harga di atas maksimum' => [['harga_aud' => '100000,01'] + $ok, ['harga_aud' => 'Harga maksimal AUD 100.000,00.']],
            'qty nol' => [['qty' => 0] + $ok, ['qty' => 'Qty minimal 1.']],
            'qty negatif' => [['qty' => -2] + $ok, ['qty' => 'Qty minimal 1.']],
            'qty pecahan' => [['qty' => 1.5] + $ok, ['qty' => 'Qty harus bilangan bulat.']],
            'qty teks' => [['qty' => '2'] + $ok, ['qty' => 'Qty harus bilangan bulat.']],
            'qty 1000' => [['qty' => 1000] + $ok, ['qty' => 'Qty maksimal 999.']],
            'markup kosong' => [['markup_persen' => ''] + $ok, ['markup_persen' => 'Markup wajib diisi.']],
            'markup negatif' => [['markup_persen' => '-0,5'] + $ok, ['markup_persen' => 'Markup tidak boleh negatif.']],
            'markup di atas 100' => [['markup_persen' => '100,01'] + $ok, ['markup_persen' => 'Markup maksimal 100%.']],
            'markup 3 desimal' => [['markup_persen' => '7,555'] + $ok, ['markup_persen' => 'Maksimal 2 angka di belakang koma.']],
            'markup angka JSON' => [['markup_persen' => 10] + $ok, ['markup_persen' => 'Isi angka, mis. 10.']],
        ];
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, string> $fields
     */
    #[DataProvider('barangSalah')]
    public function testValidasiTambahBarang(array $body, array $fields): void
    {
        $error = $this->fails(
            $this->call('POST', self::cartPath($this->po, $this->rina) . '/baris-pesanan', $body),
            422,
            'VALIDASI',
        );

        self::assertSame($fields, $error['field']);
        self::assertSame(count($fields) === 1 ? reset($fields) : 'Periksa 4 isian yang ditandai.', $error['pesan']);
        // Validasi gagal: tidak ada keranjang dibuat dan kurs belum terkunci.
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());
        self::assertFalse($this->ok($this->call('GET', '/api/v1/open-po/' . $this->po['id']))['kurs_terkunci']);
    }

    public function testBatasAtasBarangDiterima(): void
    {
        $cart = $this->ok($this->call('POST', self::cartPath($this->po, $this->rina) . '/baris-pesanan', [
            'nama_barang' => str_repeat('é', 150),
            'harga_aud' => '100000',
            'qty' => 999,
            'markup_persen' => '100',
        ]), 201);

        $line = $cart['barang'][0];
        self::assertSame('100000.00', $line['harga_aud']);
        self::assertSame('100', $line['markup_persen']);
        // 10.000.000 sen × 13.054 × 2 = Rp2.610.800.000 per unit.
        self::assertSame(2_610_800_000, $line['harga_jual_unit']);
        self::assertSame(2_610_800_000 * 999, $line['subtotal']);

        $nol = $this->ok($this->call('PATCH', '/api/v1/baris-pesanan/' . $line['id'], ['markup_persen' => '0', 'harga_aud' => '0,01']));
        // 1 sen × 13.054 = Rp130,54 → Rp1.000.
        self::assertSame(1_000, $nol['barang'][0]['harga_jual_unit']);
    }

    public function testValidasiUbahBarisHanyaFieldYangDikirim(): void
    {
        $cart = $this->ok($this->call('POST', self::cartPath($this->po, $this->rina) . '/baris-pesanan', self::BARANG_OK), 201);
        $url = '/api/v1/baris-pesanan/' . $cart['barang'][0]['id'];

        $error = $this->fails($this->call('PATCH', $url, ['qty' => 0]), 422, 'VALIDASI');
        self::assertSame(['qty' => 'Qty minimal 1.'], $error['field']);

        $error = $this->fails($this->call('PATCH', $url, ['harga_aud' => null, 'nama_barang' => '']), 422, 'VALIDASI');
        self::assertSame(['nama_barang' => 'Nama barang wajib diisi.', 'harga_aud' => 'Harga wajib diisi.'], $error['field']);
        self::assertSame('Periksa 2 isian yang ditandai.', $error['pesan']);

        self::assertSame($cart['barang'], $this->ok($this->call('GET', self::cartPath($this->po, $this->rina)))['barang']);
    }

    /**
     * @return array<string, array{array<string, mixed>, array<string, string>}>
     */
    public static function pembayaranSalah(): array
    {
        $ok = ['nominal' => 1_468_000, 'tanggal' => '2026-10-28'];

        return [
            'semua kosong' => [[], ['nominal' => 'Nominal wajib diisi.', 'tanggal' => 'Tanggal wajib diisi.']],
            'nominal nol' => [['nominal' => 0] + $ok, ['nominal' => 'Nominal harus lebih dari Rp0.']],
            'nominal negatif' => [['nominal' => -1_000] + $ok, ['nominal' => 'Nominal harus lebih dari Rp0.']],
            'nominal teks' => [['nominal' => '1468000'] + $ok, ['nominal' => 'Isi angka saja, mis. 1468000.']],
            'nominal pecahan' => [['nominal' => 1_468_000.5] + $ok, ['nominal' => 'Isi angka saja, mis. 1468000.']],
            'nominal terlalu besar' => [['nominal' => 1_000_000_000_001] + $ok, ['nominal' => 'Nominal terlalu besar.']],
            'tanggal kosong' => [['tanggal' => ''] + $ok, ['tanggal' => 'Tanggal wajib diisi.']],
            'tanggal tidak ada' => [['tanggal' => '2026-02-30'] + $ok, ['tanggal' => 'Tanggal tidak valid.']],
            'tanggal format lain' => [['tanggal' => '28-10-2026'] + $ok, ['tanggal' => 'Tanggal tidak valid.']],
            'tanggal angka' => [['tanggal' => 20261028] + $ok, ['tanggal' => 'Tanggal tidak valid.']],
        ];
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, string> $fields
     */
    #[DataProvider('pembayaranSalah')]
    public function testValidasiPembayaran(array $body, array $fields): void
    {
        $error = $this->fails(
            $this->call('POST', self::cartPath($this->po, $this->rina) . '/pembayaran', $body),
            422,
            'VALIDASI',
        );

        self::assertSame($fields, $error['field']);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, string> $fields
     */
    #[DataProvider('pembayaranSalah')]
    public function testValidasiPengembalianDanaSebelumCekStatus(array $body, array $fields): void
    {
        // Input salah ditolak 422 lebih dulu, walaupun status bukan Lebih bayar.
        $error = $this->fails(
            $this->call('POST', self::cartPath($this->po, $this->rina) . '/pengembalian-dana', $body),
            422,
            'VALIDASI',
        );

        self::assertSame($fields, $error['field']);
    }

    public function testValidasiCatatanPengembalianDana(): void
    {
        $path = self::cartPath($this->po, $this->rina) . '/pengembalian-dana';
        $ok = ['nominal' => 1_000, 'tanggal' => '2026-10-29'];

        $error = $this->fails($this->call('POST', $path, $ok + ['catatan' => str_repeat('x', 256)]), 422, 'VALIDASI');
        self::assertSame(['catatan' => 'Catatan maksimal 255 karakter.'], $error['field']);
        $error = $this->fails($this->call('POST', $path, $ok + ['catatan' => 123]), 422, 'VALIDASI');
        self::assertSame(['catatan' => 'Catatan harus berupa teks.'], $error['field']);

        $this->pay($this->po, $this->rina, 10_000);
        $cart = $this->refund($this->po, $this->rina, 1_000, '2026-10-29', str_repeat('x', 255));
        self::assertSame(str_repeat('x', 255), $cart['riwayat'][0]['catatan']);
    }

    public function testIdTidakDitemukan(): void
    {
        $cart = self::cartPath($this->po, $this->rina);
        $poTidakAda = '/api/v1/open-po/999999/keranjang/' . $this->rina['id'];
        $customerTidakAda = '/api/v1/open-po/' . $this->po['id'] . '/keranjang/999999';
        $bayar = ['nominal' => 1_000, 'tanggal' => '2026-10-28'];

        $cases = [
            ['GET', $poTidakAda, null, 'Open PO tidak ditemukan.'],
            ['GET', $customerTidakAda, null, 'Customer tidak ditemukan.'],
            ['GET', $poTidakAda . '/rekap', null, 'Open PO tidak ditemukan.'],
            ['GET', $customerTidakAda . '/rekap', null, 'Customer tidak ditemukan.'],
            ['POST', $poTidakAda . '/baris-pesanan', self::BARANG_OK, 'Open PO tidak ditemukan.'],
            ['POST', $customerTidakAda . '/baris-pesanan', self::BARANG_OK, 'Customer tidak ditemukan.'],
            ['POST', $poTidakAda . '/pembayaran', $bayar, 'Open PO tidak ditemukan.'],
            ['POST', $customerTidakAda . '/pembayaran', $bayar, 'Customer tidak ditemukan.'],
            ['POST', $poTidakAda . '/pengembalian-dana', $bayar, 'Open PO tidak ditemukan.'],
            ['POST', $customerTidakAda . '/pengembalian-dana', $bayar, 'Customer tidak ditemukan.'],
            ['GET', '/api/v1/open-po/999999/customer', null, 'Open PO tidak ditemukan.'],
            ['GET', '/api/v1/open-po/999999/barang-unik', null, 'Open PO tidak ditemukan.'],
            ['PATCH', '/api/v1/baris-pesanan/999999', ['qty' => 1], 'Barang tidak ditemukan.'],
            ['DELETE', '/api/v1/baris-pesanan/999999', null, 'Barang tidak ditemukan.'],
            ['POST', '/api/v1/baris-pesanan/999999/kosong', null, 'Barang tidak ditemukan.'],
            ['DELETE', '/api/v1/baris-pesanan/999999/kosong', null, 'Barang tidak ditemukan.'],
            ['DELETE', '/api/v1/pembayaran/999999', null, 'Pembayaran tidak ditemukan.'],
            ['DELETE', '/api/v1/pengembalian-dana/999999', null, 'Pengembalian dana tidak ditemukan.'],
        ];
        foreach ($cases as [$method, $path, $body, $pesan]) {
            $error = $this->fails($this->call($method, $path, $body), 404, 'TIDAK_DITEMUKAN');
            self::assertSame($pesan, $error['pesan'], $method . ' ' . $path);
        }

        // 404 tidak meninggalkan efek: kurs belum terkunci, tidak ada keranjang.
        self::assertFalse($this->ok($this->call('GET', '/api/v1/open-po/' . $this->po['id']))['kurs_terkunci']);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());

        // ID yang ada di tabel lain tidak tertukar: ID pembayaran bukan ID pengembalian dana / baris.
        $paid = $this->pay($this->po, $this->rina, 1_000);
        $paymentId = $paid['riwayat'][0]['id'];
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM pengembalian_dana')->fetchColumn());
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM baris_pesanan')->fetchColumn());
        $this->fails($this->call('DELETE', '/api/v1/pengembalian-dana/' . $paymentId), 404, 'TIDAK_DITEMUKAN');
        $this->fails($this->call('DELETE', '/api/v1/baris-pesanan/' . $paymentId), 404, 'TIDAK_DITEMUKAN');

        // Hapus dua kali: yang kedua 404.
        $this->ok($this->call('DELETE', '/api/v1/pembayaran/' . $paymentId));
        $this->fails($this->call('DELETE', '/api/v1/pembayaran/' . $paymentId), 404, 'TIDAK_DITEMUKAN');
        self::assertSame(200, $this->call('GET', $cart)->status);
    }

    public function testRouteMetodeDanProteksi(): void
    {
        $this->fails($this->call('GET', '/api/v1/open-po/' . $this->po['id'] . '/keranjang/abc'), 404, 'ENDPOINT_TIDAK_DITEMUKAN');
        $this->fails($this->call('GET', '/api/v1/baris-pesanan/0'), 404, 'ENDPOINT_TIDAK_DITEMUKAN');

        $get = $this->call('GET', '/api/v1/baris-pesanan/1');
        $this->fails($get, 405, 'METODE_TIDAK_DIIZINKAN');
        self::assertSame('PATCH, DELETE', $get->headers()['Allow']);
        $put = $this->call('PUT', self::cartPath($this->po, $this->rina) . '/pembayaran', []);
        self::assertSame('POST', $put->headers()['Allow']);

        // POST tanpa body tetap wajib Content-Type JSON; Origin asing ditolak.
        $this->fails(
            $this->call('POST', '/api/v1/baris-pesanan/1/kosong', null, ['Content-Type' => 'text/plain']),
            415,
            'CONTENT_TYPE_TIDAK_DIDUKUNG',
        );
        $this->fails(
            $this->call('DELETE', '/api/v1/pembayaran/1', null, ['Origin' => 'https://evil.example']),
            403,
            'ORIGIN_DITOLAK',
        );

        $this->sessionToken = null;
        $this->fails($this->call('GET', self::cartPath($this->po, $this->rina)), 401, 'BELUM_MASUK');
        $this->fails($this->call('GET', self::cartPath($this->po, $this->rina) . '/rekap'), 401, 'BELUM_MASUK');
    }
}
