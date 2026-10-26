<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Tests\Support\TestDatabase;
use PHPUnit\Framework\TestCase;

/**
 * Uji lewat HTTP sungguhan: php -S + public/index.php, memastikan front controller,
 * pembacaan header/cookie dari $_SERVER, dan pengiriman Set-Cookie berjalan.
 */
final class HttpSmokeTest extends TestCase
{
    /** @var list<resource> */
    private array $processes = [];
    private int $port = 0;

    protected function setUp(): void
    {
        $pdo = TestDatabase::pdo();
        TestDatabase::reset();
        $pdo->prepare('INSERT INTO admin (nama_pengguna, password_hash) VALUES (?, ?)')
            ->execute(['smoke', password_hash('kata-sandi-smoke', PASSWORD_DEFAULT)]);

        $this->port = $this->startServer();
    }

    protected function tearDown(): void
    {
        foreach ($this->processes as $process) {
            if (is_resource($process)) {
                proc_terminate($process);
                proc_close($process);
            }
        }
    }

    public function testAlurLoginLewatHttp(): void
    {
        [$status, $headers, $body] = $this->request('GET', '/api/v1/health');
        self::assertSame(200, $status);
        self::assertSame(['data' => ['status' => 'ok', 'database' => 'ok']], json_decode($body, true));
        self::assertNoPoweredBy($headers);

        [$status, $headers, $body] = $this->request('GET', '/api/v1/pengaturan');
        self::assertSame(401, $status);
        self::assertSame('BELUM_MASUK', json_decode($body, true)['error']['kode']);
        self::assertNoPoweredBy($headers);

        [$status, $headers, $body] = $this->request('POST', '/api/v1/auth/login', [
            'Content-Type: application/json',
            'Origin: http://127.0.0.1:' . $this->port,
        ], '{"nama_pengguna":"smoke","kata_sandi":"kata-sandi-smoke"}');
        self::assertSame(200, $status, $body);
        self::assertNoPoweredBy($headers);
        self::assertMatchesRegularExpression(
            '/^set-cookie: jastip_sesi=([0-9a-f]{64}); Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict\r?$/mi',
            $headers,
        );
        preg_match('/jastip_sesi=([0-9a-f]{64})/', $headers, $m);

        [$status, , $body] = $this->request('GET', '/api/v1/pengaturan', ['Cookie: jastip_sesi=' . $m[1]]);
        self::assertSame(200, $status, $body);
        self::assertSame('50', json_decode($body, true)['data']['dp_persen']);

        $login = '{"nama_pengguna":"smoke","kata_sandi":"kata-sandi-smoke","klien":"mobile"}';
        $mobile = json_decode($this->request('POST', '/api/v1/auth/login', ['Content-Type: application/json'], $login)[2], true);
        [$status] = $this->request('GET', '/api/v1/auth/sesi', ['Authorization: Bearer ' . $mobile['data']['token']]);
        self::assertSame(200, $status);
    }

    public function testGagalMulaiTetapTanpaXPoweredBy(): void
    {
        $this->port = $this->startServer(['APP_ENV' => 'bukan-env']);

        [$status, $headers, $body] = $this->request('GET', '/api/v1/health');
        self::assertSame(500, $status);
        self::assertSame('KESALAHAN_SERVER', json_decode($body, true)['error']['kode']);
        self::assertNoPoweredBy($headers);
    }

    private static function assertNoPoweredBy(string $headers): void
    {
        self::assertDoesNotMatchRegularExpression('/^x-powered-by:/mi', $headers);
    }

    /**
     * Jalankan php -S (expose_php bawaan aktif, jadi PHP menambahkan X-Powered-By kalau tidak dihapus).
     *
     * @param array<string, string> $override
     */
    private function startServer(array $override = []): int
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        self::assertNotFalse($socket);
        $port = (int) substr((string) strrchr((string) stream_socket_get_name($socket, false), ':'), 1);
        fclose($socket);

        $s = TestDatabase::settings();
        $root = dirname(__DIR__, 2);
        $env = $override + [
            'APP_ENV' => 'testing',
            'APP_ALLOWED_ORIGINS' => 'http://127.0.0.1:' . $port,
            'DB_HOST' => $s['host'],
            'DB_PORT' => (string) $s['port'],
            'DB_NAME' => $s['name'],
            'DB_USER' => $s['user'],
            'DB_PASSWORD' => $s['password'],
            'SESSION_COOKIE_SECURE' => 'false',
            'LOG_PATH' => 'php://stderr',
            'KURS_API_URL' => 'http://127.0.0.1:9/tidak-dipakai',
            'PATH' => (string) getenv('PATH'),
        ];
        $command = [
            PHP_BINARY, '-d', 'expose_php=1', '-S', '127.0.0.1:' . $port, '-t', $root . '/public', $root . '/public/index.php',
        ];
        $io = [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']];
        $process = proc_open($command, $io, $pipes, $root, $env);
        self::assertIsResource($process);
        $this->processes[] = $process;

        for ($i = 0; $i < 50; $i++) {
            $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
            if ($conn !== false) {
                fclose($conn);

                return $port;
            }
            usleep(100_000);
        }
        self::fail('php -S tidak siap');
    }

    /**
     * @param list<string> $headers
     * @return array{int, string, string}
     */
    private function request(string $method, string $path, array $headers = [], ?string $body = null): array
    {
        $ch = curl_init('http://127.0.0.1:' . $this->port . $path);
        self::assertNotFalse($ch);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 10,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = (string) curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        return [$status, substr($raw, 0, $headerSize), substr($raw, $headerSize)];
    }
}
