<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Bootstrap\AppFactory;
use Jastip\Config\Config;
use Jastip\Http\Kernel;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Infrastructure\Database;
use Jastip\Tests\Support\CountingPasswordHasher;
use Jastip\Tests\Support\MemoryLogger;
use Jastip\Tests\Support\MutableClock;
use Jastip\Tests\Support\StubExchangeRateProvider;
use Jastip\Tests\Support\TestDatabase;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Test level dispatcher: request melewati Kernel (router, CSRF, auth, validasi)
 * dan database MariaDB/MySQL sungguhan.
 */
abstract class IntegrationTestCase extends TestCase
{
    protected const ORIGIN = 'https://jastip.test';
    protected const COOKIE = '__Host-jastip_sesi';
    protected const ADMIN = 'admin';
    protected const PASSWORD = 'kata-sandi-uji-123';
    protected const IP = '203.0.113.7';

    protected MutableClock $clock;
    protected StubExchangeRateProvider $rates;
    protected MemoryLogger $logger;
    protected CountingPasswordHasher $passwords;
    protected Kernel $app;
    protected PDO $pdo;
    protected ?string $sessionToken = null;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::pdo();
        TestDatabase::reset();

        $this->clock = new MutableClock();
        $this->rates = new StubExchangeRateProvider();
        $this->logger = new MemoryLogger();
        $this->passwords = new CountingPasswordHasher();
        $this->sessionToken = null;

        $s = TestDatabase::settings();
        $config = Config::fromArray([
            'APP_ENV' => 'testing',
            'APP_ALLOWED_ORIGINS' => self::ORIGIN,
            'DB_HOST' => $s['host'],
            'DB_PORT' => (string) $s['port'],
            'DB_NAME' => $s['name'],
            'DB_USER' => $s['user'],
            'DB_PASSWORD' => $s['password'],
            'SESSION_COOKIE_SECURE' => 'true',
            'LOG_PATH' => 'php://stderr',
        ], dirname(__DIR__, 2));

        $pdo = $this->pdo;
        $this->app = AppFactory::create(
            $config,
            new Database(static fn (): PDO => $pdo),
            $this->rates,
            $this->clock,
            $this->logger,
            $this->passwords,
        );
    }

    /**
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     * @param array<string, mixed> $query
     */
    protected function call(
        string $method,
        string $path,
        ?array $body = null,
        array $headers = [],
        array $query = [],
        string $ip = self::IP,
    ): Response {
        if (in_array($method, ['POST', 'PUT', 'PATCH'], true) && !array_key_exists('Content-Type', $headers)) {
            $headers['Content-Type'] = 'application/json';
        }
        $cookies = $this->sessionToken === null ? [] : [self::COOKIE => $this->sessionToken];
        $raw = $body === null ? '' : (string) json_encode($body, JSON_UNESCAPED_UNICODE);

        return $this->app->handle(new Request($method, $path, $query, $headers, $raw, $cookies, $ip));
    }

    protected function login(string $username, string $password, string $ip = self::IP): Response
    {
        return $this->call('POST', '/api/v1/auth/login', ['nama_pengguna' => $username, 'kata_sandi' => $password], ip: $ip);
    }

    /**
     * @return array<string, mixed>
     */
    protected static function json(Response $response): array
    {
        $decoded = json_decode($response->body(), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @return array<string, mixed>
     */
    protected function ok(Response $response, int $status = 200): array
    {
        self::assertSame($status, $response->status, $response->body());

        return self::json($response)['data'] ?? [];
    }

    /**
     * @return array{kode: string, pesan: string, field?: array<string, string>}
     */
    protected function fails(Response $response, int $status, string $kode): array
    {
        self::assertSame($status, $response->status, $response->body());
        $error = self::json($response)['error'] ?? [];
        self::assertSame($kode, $error['kode'] ?? null, $response->body());

        return $error;
    }

    protected function createAdmin(string $username = self::ADMIN, string $password = self::PASSWORD): int
    {
        $stmt = $this->pdo->prepare('INSERT INTO admin (nama_pengguna, password_hash) VALUES (?, ?)');
        $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);

        return (int) $this->pdo->lastInsertId();
    }

    /** Buat admin, login lewat API, dan simpan cookie sesi untuk request berikutnya. */
    protected function loginAsAdmin(): void
    {
        $exists = $this->pdo->prepare('SELECT COUNT(*) FROM admin WHERE nama_pengguna = ?');
        $exists->execute([self::ADMIN]);
        if ((int) $exists->fetchColumn() === 0) {
            $this->createAdmin();
        }
        $response = $this->call('POST', '/api/v1/auth/login', [
            'nama_pengguna' => self::ADMIN,
            'kata_sandi' => self::PASSWORD,
        ]);
        self::assertSame(200, $response->status, $response->body());
        $this->sessionToken = self::cookieValue($response, self::COOKIE);
        self::assertNotNull($this->sessionToken);
    }

    protected static function cookieValue(Response $response, string $name): ?string
    {
        foreach ($response->cookies() as $cookie) {
            if (str_starts_with($cookie, $name . '=')) {
                return explode(';', substr($cookie, strlen($name) + 1), 2)[0];
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    protected function createOpenPo(string $nama = 'Open PO Australia Nov 2026'): array
    {
        return $this->ok($this->call('POST', '/api/v1/open-po', [
            'nama' => $nama,
            'kurs' => ['mode' => 'otomatis', 'kurs_pasar' => '12673', 'tanggal_kurs' => '2026-10-25'],
        ]), 201);
    }

    /**
     * @return array<string, mixed>
     */
    protected function createCustomer(string $nama = 'Rina', string $noWa = '081234567890'): array
    {
        return $this->ok($this->call('POST', '/api/v1/customer', ['nama' => $nama, 'no_wa' => $noWa]), 201);
    }

    /**
     * @param array<string, mixed> $po
     * @param array<string, mixed> $customer
     */
    protected static function cartPath(array $po, array $customer): string
    {
        return '/api/v1/open-po/' . $po['id'] . '/keranjang/' . $customer['id'];
    }

    /**
     * Tambah barang lewat API. Mengembalikan objek keranjang.
     *
     * @param array<string, mixed> $po
     * @param array<string, mixed> $customer
     * @return array<string, mixed>
     */
    protected function addLine(
        array $po,
        array $customer,
        string $nama,
        string $harga,
        int $qty = 1,
        string $markup = '10',
    ): array {
        return $this->ok($this->call('POST', self::cartPath($po, $customer) . '/baris-pesanan', [
            'nama_barang' => $nama,
            'harga_aud' => $harga,
            'qty' => $qty,
            'markup_persen' => $markup,
        ]), 201);
    }

    /**
     * @param array<string, mixed> $po
     * @param array<string, mixed> $customer
     * @return array<string, mixed>
     */
    protected function pay(array $po, array $customer, int $nominal, string $tanggal = '2026-10-28'): array
    {
        return $this->ok($this->call('POST', self::cartPath($po, $customer) . '/pembayaran', [
            'nominal' => $nominal,
            'tanggal' => $tanggal,
        ]), 201);
    }

    /**
     * @param array<string, mixed> $po
     * @param array<string, mixed> $customer
     * @return array<string, mixed>
     */
    protected function refund(
        array $po,
        array $customer,
        int $nominal,
        string $tanggal = '2026-10-29',
        ?string $catatan = null,
    ): array {
        return $this->ok($this->call('POST', self::cartPath($po, $customer) . '/pengembalian-dana', [
            'nominal' => $nominal,
            'tanggal' => $tanggal,
            'catatan' => $catatan,
        ]), 201);
    }

    /**
     * @param array<string, mixed> $po
     * @param array<string, mixed> $customer
     */
    protected function rekap(array $po, array $customer): string
    {
        return (string) $this->ok($this->call('GET', self::cartPath($po, $customer) . '/rekap'))['teks'];
    }

    /**
     * Isi keranjang langsung lewat SQL, untuk data uji yang tidak perlu lewat endpoint pesanan/pembayaran.
     *
     * @param list<array{int, int, bool}> $lines [harga_jual_unit, qty, kosong]
     * @param list<int> $payments
     * @param list<int> $refunds
     */
    protected function seedCart(int $poId, int $customerId, array $lines, array $payments = [], array $refunds = []): int
    {
        $this->pdo->prepare('INSERT INTO keranjang (open_po_id, customer_id) VALUES (?, ?)')->execute([$poId, $customerId]);
        $cartId = (int) $this->pdo->lastInsertId();
        $line = $this->pdo->prepare(
            'INSERT INTO baris_pesanan (keranjang_id, nama_barang, harga_aud_sen, qty, markup_bp, kurs_jastip,'
            . ' harga_jual_unit, subtotal, kosong) VALUES (?, ?, 100, ?, 1000, 13054, ?, ?, ?)'
        );
        foreach ($lines as $i => [$unit, $qty, $kosong]) {
            $line->execute([$cartId, 'Barang ' . ($i + 1), $qty, $unit, $unit * $qty, $kosong ? 1 : 0]);
        }
        foreach ($payments as $nominal) {
            $this->pdo->prepare('INSERT INTO pembayaran (keranjang_id, nominal, tanggal) VALUES (?, ?, ?)')
                ->execute([$cartId, $nominal, '2026-10-28']);
        }
        foreach ($refunds as $nominal) {
            $this->pdo->prepare('INSERT INTO pengembalian_dana (keranjang_id, nominal, tanggal) VALUES (?, ?, ?)')
                ->execute([$cartId, $nominal, '2026-10-29']);
        }

        return $cartId;
    }
}
