<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use PHPUnit\Framework\Attributes\DataProvider;

final class CustomerTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
    }

    public function testBuatMenormalkanNoWa(): void
    {
        $response = $this->call('POST', '/api/v1/customer', [
            'nama' => ' Rina ',
            'no_wa' => '+62 812-3456-7890',
            'alamat' => '  Jl. Melati 1, Bandung ',
        ]);
        $customer = $this->ok($response, 201);

        self::assertSame('/api/v1/customer/' . $customer['id'], $response->headers()['Location']);
        self::assertSame('Rina', $customer['nama']);
        self::assertSame('6281234567890', $customer['no_wa']);
        self::assertSame('081234567890', $customer['no_wa_tampil']);
        self::assertSame('Jl. Melati 1, Bandung', $customer['alamat']);
        self::assertFalse($customer['diarsipkan']);
        self::assertFalse($customer['punya_pesanan']);
    }

    /**
     * @return array<string, array{array<string, mixed>, array<string, string>}>
     */
    public static function inputSalah(): array
    {
        return [
            'semua kosong' => [[], ['nama' => 'Nama wajib diisi.', 'no_wa' => 'No WA wajib diisi.']],
            'no wa huruf' => [['nama' => 'Rina', 'no_wa' => '0812abc'], ['no_wa' => 'No WA hanya boleh berisi angka.']],
            'awalan salah' => [['nama' => 'Rina', 'no_wa' => '0215551234'], ['no_wa' => 'No WA harus diawali 08, 62, atau +62.']],
            'no wa angka JSON' => [['nama' => 'Rina', 'no_wa' => 81234567890], ['no_wa' => 'No WA wajib diisi.']],
            'alamat terlalu panjang' => [
                ['nama' => 'Rina', 'no_wa' => '081234567890', 'alamat' => str_repeat('x', 501)],
                ['alamat' => 'Alamat maksimal 500 karakter.'],
            ],
            'nama terlalu panjang' => [
                ['nama' => str_repeat('R', 101), 'no_wa' => '081234567890'],
                ['nama' => 'Nama maksimal 100 karakter.'],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, string> $fields
     */
    #[DataProvider('inputSalah')]
    public function testValidasi(array $body, array $fields): void
    {
        $error = $this->fails($this->call('POST', '/api/v1/customer', $body), 422, 'VALIDASI');

        self::assertSame($fields, $error['field']);
    }

    public function testCekNoWaDuplikatHanyaPeringatan(): void
    {
        $rina = $this->createCustomer('Rina', '081234567890');

        $cek = $this->ok($this->call('GET', '/api/v1/customer/cek-no-wa', query: ['no_wa' => '+6281234567890']));
        self::assertTrue($cek['terdaftar']);
        self::assertSame('6281234567890', $cek['no_wa']);
        self::assertSame('081234567890', $cek['no_wa_tampil']);
        self::assertSame([['id' => $rina['id'], 'nama' => 'Rina', 'no_wa_tampil' => '081234567890']], $cek['customer']);
        self::assertSame('No WA ini sudah terdaftar atas nama Rina.', $cek['pesan']);

        // Tetap boleh disimpan.
        $this->createCustomer('Rina (adik)', '6281234567890');

        // Saat mengubah customer sendiri, dirinya tidak dihitung.
        $sendiri = $this->ok($this->call('GET', '/api/v1/customer/cek-no-wa', query: [
            'no_wa' => '081234567890',
            'kecuali_id' => (string) $rina['id'],
        ]));
        self::assertSame(['Rina (adik)'], array_column($sendiri['customer'], 'nama'));

        $baru = $this->ok($this->call('GET', '/api/v1/customer/cek-no-wa', query: ['no_wa' => '081300000000']));
        self::assertFalse($baru['terdaftar']);
        self::assertNull($baru['pesan']);

        $error = $this->fails($this->call('GET', '/api/v1/customer/cek-no-wa', query: ['no_wa' => 'abc']), 422, 'VALIDASI');
        self::assertSame(['no_wa' => 'No WA hanya boleh berisi angka.'], $error['field']);
    }

    public function testCariNamaAtauNoWa(): void
    {
        $this->createCustomer('Rina', '081234567890');
        $this->createCustomer('rini', '081377712345');
        $this->createCustomer('Sari', '081398765432');

        $cari = fn (string $q): array => array_column(
            self::json($this->call('GET', '/api/v1/customer', query: ['q' => $q]))['data'],
            'nama',
        );

        self::assertSame(['Rina', 'rini', 'Sari'], $cari(''));
        self::assertSame(['Rina', 'rini'], $cari('RIN'));
        self::assertSame(['Rina'], $cari('0812'));
        self::assertSame(['Rina'], $cari('+62812'));
        self::assertSame(['Rina'], $cari('62812'));
        self::assertSame(['rini', 'Sari'], $cari('0813'));
        self::assertSame(['Sari'], $cari('5432'));
        self::assertSame(['Rina'], $cari('0812-3456'));
        self::assertSame([], $cari('%'));
        self::assertSame([], $cari('_'));
    }

    public function testPaginationDanUrutTerakhirDiubah(): void
    {
        $a = $this->createCustomer('Andi', '081200000001');
        $this->createCustomer('Budi', '081200000002');
        $this->createCustomer('Citra', '081200000003');
        $this->pdo->exec("UPDATE customer SET updated_at = '2026-10-20 00:00:00'");
        $this->pdo->prepare("UPDATE customer SET updated_at = '2026-10-25 00:00:00' WHERE id = ?")->execute([$a['id']]);

        $page = self::json($this->call('GET', '/api/v1/customer', query: ['per_halaman' => '2', 'halaman' => '2']));
        self::assertSame(['Citra'], array_column($page['data'], 'nama'));
        self::assertSame(['halaman' => 2, 'per_halaman' => 2, 'total' => 3, 'total_halaman' => 2], $page['meta']);

        $recent = self::json($this->call('GET', '/api/v1/customer', query: ['urut' => 'terakhir_diubah']));
        self::assertSame('Andi', $recent['data'][0]['nama']);

        $this->fails($this->call('GET', '/api/v1/customer', query: ['urut' => 'acak']), 422, 'VALIDASI');
    }

    public function testPenandaSudahDiPo(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $sari = $this->createCustomer('Sari', '081398765432');
        $this->seedCart($po['id'], $rina['id'], [[359_000, 1, false]]);
        // Keranjang Sari kosong, jadi belum dianggap ada di PO.
        $this->pdo->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$po['id'], $sari['id']]);

        $data = self::json($this->call('GET', '/api/v1/customer', query: ['open_po_id' => (string) $po['id']]))['data'];
        self::assertSame(['Rina' => true, 'Sari' => false], array_column($data, 'sudah_di_po', 'nama'));

        $tanpaPo = self::json($this->call('GET', '/api/v1/customer'))['data'];
        self::assertArrayNotHasKey('sudah_di_po', $tanpaPo[0]);
    }

    public function testUbahCustomer(): void
    {
        $rina = $this->createCustomer('Rina', '081234567890');

        $updated = $this->ok($this->call('PATCH', '/api/v1/customer/' . $rina['id'], [
            'no_wa' => '0813-1111-2222',
            'alamat' => 'Jl. Mawar 2',
        ]));
        self::assertSame('Rina', $updated['nama']);
        self::assertSame('6281311112222', $updated['no_wa']);
        self::assertSame('Jl. Mawar 2', $updated['alamat']);

        $cleared = $this->ok($this->call('PATCH', '/api/v1/customer/' . $rina['id'], ['alamat' => null]));
        self::assertNull($cleared['alamat']);

        $error = $this->fails($this->call('PATCH', '/api/v1/customer/' . $rina['id'], ['nama' => '']), 422, 'VALIDASI');
        self::assertSame(['nama' => 'Nama wajib diisi.'], $error['field']);

        $this->fails($this->call('PATCH', '/api/v1/customer/999', ['nama' => 'x']), 404, 'TIDAK_DITEMUKAN');
    }

    public function testHapusCustomerTanpaPesanan(): void
    {
        $po = $this->createOpenPo();
        $dewi = $this->createCustomer('Dewi', '081311112222');
        // Keranjang kosong tidak menghalangi hapus, dan ikut terhapus.
        $this->pdo->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$po['id'], $dewi['id']]);

        self::assertSame(204, $this->call('DELETE', '/api/v1/customer/' . $dewi['id'])->status);

        $this->fails($this->call('GET', '/api/v1/customer/' . $dewi['id']), 404, 'TIDAK_DITEMUKAN');
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());
        $this->fails($this->call('DELETE', '/api/v1/customer/' . $dewi['id']), 404, 'TIDAK_DITEMUKAN');
    }

    /**
     * @return array<string, array{list<array{int, int, bool}>, list<int>}>
     */
    public static function jenisPesanan(): array
    {
        return [
            'punya baris' => [[[359_000, 1, false]], []],
            'hanya baris Kosong' => [[[359_000, 1, true]], []],
            'hanya pembayaran' => [[], [100_000]],
        ];
    }

    /**
     * @param list<array{int, int, bool}> $lines
     * @param list<int> $payments
     */
    #[DataProvider('jenisPesanan')]
    public function testCustomerBerpesananHarusDiarsipkan(array $lines, array $payments): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->seedCart($po['id'], $rina['id'], $lines, $payments);

        self::assertTrue($this->ok($this->call('GET', '/api/v1/customer/' . $rina['id']))['punya_pesanan']);

        $error = $this->fails($this->call('DELETE', '/api/v1/customer/' . $rina['id']), 409, 'CUSTOMER_PUNYA_PESANAN');
        self::assertSame('Rina sudah punya pesanan, jadi tidak bisa dihapus. Arsipkan customer ini.', $error['pesan']);

        $archived = $this->ok($this->call('POST', '/api/v1/customer/' . $rina['id'] . '/arsip'));
        self::assertTrue($archived['diarsipkan']);
        self::assertSame('2026-10-25T09:00:00Z', $archived['diarsipkan_pada']);

        // Arsip idempoten; waktu arsip tidak berubah.
        $this->clock->advance('+1 hour');
        $again = $this->ok($this->call('POST', '/api/v1/customer/' . $rina['id'] . '/arsip'));
        self::assertSame('2026-10-25T09:00:00Z', $again['diarsipkan_pada']);
    }

    public function testCustomerDiarsipkanTidakTampilDiDaftarPencarianDanCekDuplikat(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->createCustomer('Rini', '081377712345');
        $this->seedCart($po['id'], $rina['id'], [[359_000, 1, false]]);
        $this->ok($this->call('POST', '/api/v1/customer/' . $rina['id'] . '/arsip'));

        $list = self::json($this->call('GET', '/api/v1/customer', query: ['q' => 'Rin']));
        self::assertSame(['Rini'], array_column($list['data'], 'nama'));
        self::assertSame(1, $list['meta']['total']);

        $cek = $this->ok($this->call('GET', '/api/v1/customer/cek-no-wa', query: ['no_wa' => '081234567890']));
        self::assertFalse($cek['terdaftar']);

        // Detail tetap bisa dibuka (pesanan lamanya masih tampil di PO terkait).
        $detail = $this->ok($this->call('GET', '/api/v1/customer/' . $rina['id']));
        self::assertTrue($detail['diarsipkan']);
        // Open PO tetap menghitung pesanannya.
        self::assertSame(1, $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']))['ringkasan']['jumlah_customer']);
    }
}
