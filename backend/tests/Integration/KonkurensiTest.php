<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Infrastructure\Database;
use Jastip\Tests\Support\TestDatabase;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Dua transaksi bersamaan, berurutan secara deterministik:
 *
 * 1. Koneksi kedua ($other) memerankan "request 1" yang sedang di tengah transaksi: sudah
 *    memegang kunci dengan urutan yang sama dengan service dan sudah menulis, belum commit.
 * 2. "Request 2" dijalankan lewat Kernel di proses PHP lain (tests/Support/kernel-request.php).
 * 3. Test menunggu sampai request 2 tertahan kunci (INNODB_TRX.trx_state = 'LOCK WAIT'),
 *    lalu request 1 di-commit.
 * 4. Request 2 harus memvalidasi ulang dengan data terbaru.
 *
 * Tanpa penguncian, request 2 akan membaca angka sebelum request 1 dan lolos validasi.
 */
final class KonkurensiTest extends IntegrationTestCase
{
    private ?PDO $other = null;
    /** @var resource|null */
    private $process = null;
    /** @var array<int, resource> */
    private array $pipes = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->loginAsAdmin();
        $s = TestDatabase::settings();
        $this->other = Database::connect($s['host'], $s['port'], $s['name'], $s['user'], $s['password']);
    }

    protected function tearDown(): void
    {
        if ($this->other !== null && $this->other->inTransaction()) {
            $this->other->rollBack();
        }
        $this->other = null;
        if (is_resource($this->process)) {
            foreach ($this->pipes as $pipe) {
                if (is_resource($pipe)) {
                    fclose($pipe);
                }
            }
            proc_terminate($this->process);
            proc_close($this->process);
        }
        $this->process = null;
        parent::tearDown();
    }

    /**
     * @return array<string, array{int, int, string, string|null}>
     */
    public static function pengembalianBersamaan(): array
    {
        return [
            'request 1 mengembalikan semua' => [384_000, 409, 'PENGEMBALIAN_TIDAK_AKTIF', null],
            'request 1 mengembalikan sebagian' => [300_000, 422, 'VALIDASI', 'Nominal maksimal Rp84.000 (kelebihan bayar).'],
        ];
    }

    #[DataProvider('pengembalianBersamaan')]
    public function testDuaPengembalianDanaBersamaanTidakMelebihiKelebihanBayar(
        int $pertama,
        int $status,
        string $kode,
        ?string $pesanNominal,
    ): void {
        [$po, $rina, $keranjangId] = $this->lebihBayar384();

        $other = $this->begin();
        $other->prepare('SELECT id FROM keranjang WHERE id = ? FOR UPDATE')->execute([$keranjangId]);
        $other->prepare('INSERT INTO pengembalian_dana (keranjang_id, nominal, tanggal) VALUES (?, ?, ?)')
            ->execute([$keranjangId, $pertama, '2026-10-29']);

        $this->startRequest('POST', self::cartPath($po, $rina) . '/pengembalian-dana', [
            'nominal' => 384_000,
            'tanggal' => '2026-10-29',
        ]);
        $this->waitUntilBlocked();
        $other->commit();
        $result = $this->finishRequest();

        self::assertSame($status, $result['status'], (string) json_encode($result['body']));
        self::assertSame($kode, $result['body']['error']['kode']);
        if ($pesanNominal !== null) {
            self::assertSame(['nominal' => $pesanNominal], $result['body']['error']['field']);
        }
        self::assertSame($pertama, (int) $this->pdo->query('SELECT SUM(nominal) FROM pengembalian_dana')->fetchColumn());
        $cart = $this->ok($this->call('GET', self::cartPath($po, $rina)));
        self::assertSame(2_935_000 - $pertama, $cart['ringkasan']['dana_diterima']);
        self::assertGreaterThanOrEqual($cart['ringkasan']['total'], $cart['ringkasan']['dana_diterima']);
    }

    public function testHapusPembayaranSaatPengembalianDanaSedangDicatat(): void
    {
        [$po, $rina, $keranjangId] = $this->lebihBayar384();
        $paymentId = (int) $this->pdo->query('SELECT id FROM pembayaran')->fetchColumn();

        $other = $this->begin();
        $other->prepare('SELECT id FROM keranjang WHERE id = ? FOR UPDATE')->execute([$keranjangId]);
        $other->prepare('INSERT INTO pengembalian_dana (keranjang_id, nominal, tanggal) VALUES (?, 384000, ?)')
            ->execute([$keranjangId, '2026-10-29']);

        $this->startRequest('DELETE', '/api/v1/pembayaran/' . $paymentId, null);
        $this->waitUntilBlocked();
        $other->commit();
        $result = $this->finishRequest();

        self::assertSame(409, $result['status'], (string) json_encode($result['body']));
        self::assertSame('HAPUS_PENGEMBALIAN_DULU', $result['body']['error']['kode']);
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM pembayaran')->fetchColumn());
        $cart = $this->ok($this->call('GET', self::cartPath($po, $rina)));
        self::assertSame(['dana_diterima' => 2_551_000, 'status' => 'lunas'], [
            'dana_diterima' => $cart['ringkasan']['dana_diterima'],
            'status' => $cart['ringkasan']['status'],
        ]);
    }

    public function testDuaHapusPembayaranBersamaan(): void
    {
        // QA langkah 5: bayar 1.468.000 + 1.467.000, kembali 384.000. Masing-masing boleh dihapus,
        // tapi tidak keduanya (sisa Rp0 < Rp384.000).
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $cart = $this->addLine($po, $rina, 'Barang B', '8,50', 3, '15');
        $this->addLine($po, $rina, 'Barang C', '129,99', 1, '8');
        $p1 = $this->pay($po, $rina, 1_468_000)['riwayat'][0]['id'];
        $p2 = $this->pay($po, $rina, 1_467_000, '2026-10-30')['riwayat'][0]['id'];
        $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));
        $this->refund($po, $rina, 384_000);
        $keranjangId = (int) $this->pdo->query('SELECT id FROM keranjang')->fetchColumn();

        $other = $this->begin();
        $other->prepare('SELECT id FROM keranjang WHERE id = ? FOR UPDATE')->execute([$keranjangId]);
        $other->prepare('DELETE FROM pembayaran WHERE id = ?')->execute([$p2]);

        $this->startRequest('DELETE', '/api/v1/pembayaran/' . $p1, null);
        $this->waitUntilBlocked();
        $other->commit();
        $result = $this->finishRequest();

        self::assertSame(409, $result['status'], (string) json_encode($result['body']));
        self::assertSame('HAPUS_PENGEMBALIAN_DULU', $result['body']['error']['kode']);
        $cart = $this->ok($this->call('GET', self::cartPath($po, $rina)));
        self::assertSame([$p1], array_column(array_filter(
            $cart['riwayat'],
            static fn (array $r): bool => $r['jenis'] === 'pembayaran',
        ), 'id'));
        self::assertSame(1_084_000, $cart['ringkasan']['dana_diterima']);
    }

    public function testUbahKursMenungguBarisPertamaLaluDitolak(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');

        // Request 1 = tambah barang pertama, urutan BarisPesananService: kunci PO, kunci kurs, keranjang, baris.
        $other = $this->begin();
        $other->prepare('SELECT id FROM open_po WHERE id = ? FOR UPDATE')->execute([$po['id']]);
        $other->prepare('UPDATE open_po SET kurs_terkunci_at = ? WHERE id = ?')->execute(['2026-10-25 09:00:00', $po['id']]);
        $other->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$po['id'], $rina['id']]);
        $other->prepare(
            'INSERT INTO baris_pesanan (keranjang_id, nama_barang, harga_aud_sen, qty, markup_bp, kurs_jastip, harga_jual_unit,'
            . ' subtotal) VALUES (?, ?, 2495, 2, 1000, 13054, 359000, 718000)'
        )->execute([(int) $other->lastInsertId(), 'Barang A']);

        $this->startRequest('PATCH', '/api/v1/open-po/' . $po['id'], ['kurs' => ['mode' => 'manual', 'kurs_jastip' => 14_000]]);
        $this->waitUntilBlocked();
        $other->commit();
        $result = $this->finishRequest();

        self::assertSame(409, $result['status'], (string) json_encode($result['body']));
        self::assertSame('KURS_TERKUNCI', $result['body']['error']['kode']);
        self::assertSame(13_054, $this->ok($this->call('GET', '/api/v1/open-po/' . $po['id']))['kurs']['kurs_jastip']);
    }

    public function testBarisPertamaMenungguUbahKursLaluMemakaiKursBaru(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');

        // Request 1 = PATCH kurs (OpenPoService::update) yang belum commit.
        $other = $this->begin();
        $other->prepare('SELECT id FROM open_po WHERE id = ? FOR UPDATE')->execute([$po['id']]);
        $other->prepare("UPDATE open_po SET kurs_mode = 'manual', kurs_buffer_bp = NULL, kurs_jastip = 10000 WHERE id = ?")
            ->execute([$po['id']]);

        $this->startRequest('POST', self::cartPath($po, $rina) . '/baris-pesanan', [
            'nama_barang' => 'Barang tepat', 'harga_aud' => '35,90', 'qty' => 1, 'markup_persen' => '0',
        ]);
        $this->waitUntilBlocked();
        $other->commit();
        $result = $this->finishRequest();

        self::assertSame(201, $result['status'], (string) json_encode($result['body']));
        $line = $result['body']['data']['barang'][0];
        self::assertSame([10_000, 359_000], [$line['kurs_jastip'], $line['harga_jual_unit']]);
        self::assertTrue($result['body']['data']['open_po']['kurs_terkunci']);
    }

    public function testDuaPembayaranPertamaBersamaanMemakaiSatuKeranjang(): void
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');

        // Request 1 = pembayaran pertama (PembayaranService::addPayment) yang belum commit.
        $other = $this->begin();
        $other->prepare('SELECT id FROM open_po WHERE id = ? LOCK IN SHARE MODE')->execute([$po['id']]);
        $other->prepare('SELECT id FROM customer WHERE id = ? FOR UPDATE')->execute([$rina['id']]);
        $other->prepare('SELECT id FROM keranjang WHERE open_po_id = ? AND customer_id = ? FOR UPDATE')
            ->execute([$po['id'], $rina['id']]);
        $other->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$po['id'], $rina['id']]);
        $other->prepare('INSERT INTO pembayaran (keranjang_id, nominal, tanggal) VALUES (?, 100000, ?)')
            ->execute([(int) $other->lastInsertId(), '2026-10-28']);

        $this->startRequest('POST', self::cartPath($po, $rina) . '/pembayaran', ['nominal' => 50_000, 'tanggal' => '2026-10-28']);
        $this->waitUntilBlocked();
        $other->commit();
        $result = $this->finishRequest();

        self::assertSame(201, $result['status'], (string) json_encode($result['body']));
        self::assertSame(150_000, $result['body']['data']['ringkasan']['total_pembayaran']);
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM keranjang')->fetchColumn());
    }

    /**
     * Satu pembayaran Rp2.935.000 untuk A + B + C, lalu B Kosong → Lebih bayar Rp384.000.
     *
     * @return array{array<string, mixed>, array<string, mixed>, int}
     */
    private function lebihBayar384(): array
    {
        $po = $this->createOpenPo();
        $rina = $this->createCustomer('Rina', '081234567890');
        $this->addLine($po, $rina, 'Barang A', '24,95', 2, '10');
        $cart = $this->addLine($po, $rina, 'Barang B', '8,50', 3, '15');
        $this->addLine($po, $rina, 'Barang C', '129,99', 1, '8');
        $this->pay($po, $rina, 2_935_000);
        $cart = $this->ok($this->call('POST', '/api/v1/baris-pesanan/' . $cart['barang'][1]['id'] . '/kosong'));
        self::assertSame(384_000, $cart['ringkasan']['kelebihan_bayar']);

        return [$po, $rina, (int) $this->pdo->query('SELECT id FROM keranjang')->fetchColumn()];
    }

    private function begin(): PDO
    {
        self::assertNotNull($this->other);
        $this->other->beginTransaction();

        return $this->other;
    }

    /**
     * @param array<string, mixed>|null $body
     */
    private function startRequest(string $method, string $path, ?array $body): void
    {
        $s = TestDatabase::settings();
        $env = [
            'TEST_DB_HOST' => $s['host'],
            'TEST_DB_PORT' => (string) $s['port'],
            'TEST_DB_NAME' => $s['name'],
            'TEST_DB_USER' => $s['user'],
            'TEST_DB_PASSWORD' => $s['password'],
            'PATH' => (string) getenv('PATH'),
        ];
        $io = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = proc_open(
            [PHP_BINARY, dirname(__DIR__) . '/Support/kernel-request.php'],
            $io,
            $this->pipes,
            dirname(__DIR__, 2),
            $env,
        );
        self::assertIsResource($process);
        $this->process = $process;

        fwrite($this->pipes[0], (string) json_encode([
            'method' => $method,
            'path' => $path,
            'body' => $body,
            'token' => $this->sessionToken,
            'now' => $this->clock->now()->format('Y-m-d H:i:s'),
        ]));
        fclose($this->pipes[0]);
    }

    /**
     * Tunggu sampai request 2 tertahan kunci yang dipegang request 1.
     * Jeda polling > 100 ms: InnoDB hanya menyegarkan cache INNODB_TRX kalau tabel itu
     * tidak dibaca selama 100 ms.
     */
    private function waitUntilBlocked(): void
    {
        self::assertIsResource($this->process);
        $deadline = microtime(true) + 10;
        while (microtime(true) < $deadline) {
            usleep(150_000);
            $waiting = (int) $this->pdo
                ->query("SELECT COUNT(*) FROM information_schema.INNODB_TRX WHERE trx_state = 'LOCK WAIT'")
                ->fetchColumn();
            if ($waiting > 0) {
                return;
            }
            if (!proc_get_status($this->process)['running']) {
                self::fail('Request 2 selesai tanpa menunggu kunci: ' . stream_get_contents($this->pipes[1])
                    . stream_get_contents($this->pipes[2]));
            }
        }
        self::fail('Request 2 tidak tertahan kunci dalam 10 detik.');
    }

    /**
     * @return array{status: int, body: array<string, mixed>}
     */
    private function finishRequest(): array
    {
        self::assertIsResource($this->process);
        $out = (string) stream_get_contents($this->pipes[1]);
        $err = (string) stream_get_contents($this->pipes[2]);
        fclose($this->pipes[1]);
        fclose($this->pipes[2]);
        proc_close($this->process);
        $this->process = null;

        $result = json_decode($out, true);
        self::assertIsArray($result, 'Output request 2: ' . $out . $err);
        $body = json_decode((string) $result['body'], true);
        self::assertIsArray($body, (string) $result['body']);

        return ['status' => (int) $result['status'], 'body' => $body];
    }
}
