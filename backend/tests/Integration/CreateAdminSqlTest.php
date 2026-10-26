<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Infrastructure\Migrator;

/**
 * bin/create-admin.php --sql: SQL hasil skrip (tanpa koneksi DB) dijalankan ke database test,
 * lalu login lewat API dengan kata sandi yang sama.
 */
final class CreateAdminSqlTest extends IntegrationTestCase
{
    private const NEW_PASSWORD = 'sandi-dari-skrip-sql-123';

    public function testSqlAdminBaruBisaDipakaiLogin(): void
    {
        [$status, $stdout, $stderr] = self::runScript(['pemilik', '--sql'], self::NEW_PASSWORD . "\n");

        self::assertSame(0, $status, $stderr);
        self::assertStringStartsWith('-- Admin jastip', $stdout);
        self::assertMatchesRegularExpression(
            '/^INSERT INTO admin \(nama_pengguna, password_hash\) VALUES \(\'pemilik\', \'\$2y\$[^\']{56}\'\);$/m',
            $stdout,
        );
        self::assertStringNotContainsString(self::NEW_PASSWORD, $stdout . $stderr);
        $this->runSql($stdout);

        $this->fails($this->login('pemilik', 'bukan-kata-sandinya'), 401, 'LOGIN_GAGAL');
        $data = $this->ok($this->login('pemilik', self::NEW_PASSWORD));
        self::assertSame('pemilik', $data['pengguna']['nama_pengguna']);
    }

    public function testSqlResetMenggantiSandiDanMengakhiriSesi(): void
    {
        $this->loginAsAdmin();
        $this->ok($this->call('GET', '/api/v1/auth/sesi'));

        [$status, $stdout, $stderr] = self::runScript([self::ADMIN, '--sql', '--reset'], self::NEW_PASSWORD . "\n");

        self::assertSame(0, $status, $stderr);
        self::assertStringContainsString('UPDATE admin SET password_hash = ', $stdout);
        self::assertStringContainsString('DELETE FROM sesi_login WHERE admin_id IN', $stdout);
        $this->runSql($stdout);

        $this->fails($this->call('GET', '/api/v1/auth/sesi'), 401, 'BELUM_MASUK');
        $this->sessionToken = null;
        $this->fails($this->login(self::ADMIN, self::PASSWORD), 401, 'LOGIN_GAGAL');
        $this->ok($this->login(self::ADMIN, self::NEW_PASSWORD));
    }

    public function testInputTidakValidDitolakTanpaSql(): void
    {
        $cases = [
            'nama dengan petik' => [["x'); DROP TABLE admin; --", '--sql'], 2],
            'nama terlalu pendek' => [['ab', '--sql'], 2],
            'opsi salah ketik' => [['pemilik', '--sq1'], 2],
            'kata sandi pendek' => [['pemilik', '--sql'], 1, "pendek\n"],
            'kata sandi > 72 byte' => [['pemilik', '--sql'], 1, str_repeat('a', 73) . "\n"],
        ];
        foreach ($cases as $label => $case) {
            [$status, $stdout] = self::runScript($case[0], $case[2] ?? self::NEW_PASSWORD . "\n");
            self::assertSame($case[1], $status, $label);
            self::assertSame('', $stdout, $label);
        }
        self::assertSame(1, (int) $this->pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
            . " AND TABLE_NAME = 'admin'")->fetchColumn());
    }

    private function runSql(string $sql): void
    {
        foreach (Migrator::splitStatements($sql) as $statement) {
            $this->pdo->exec($statement);
        }
    }

    /**
     * Jalankan skrip di proses PHP terpisah. Konfigurasi DB sengaja menunjuk ke port yang tidak
     * dipakai: mode --sql tidak boleh membuka koneksi database.
     *
     * @param list<string> $args
     * @return array{int, string, string}
     */
    private static function runScript(array $args, string $stdin): array
    {
        $root = dirname(__DIR__, 2);
        $env = [
            'PATH' => (string) getenv('PATH'),
            'APP_ENV' => 'testing',
            'DB_HOST' => '127.0.0.1',
            'DB_PORT' => '9',
            'DB_NAME' => 'tidak_dipakai',
        ];
        $io = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = proc_open([PHP_BINARY, $root . '/bin/create-admin.php', ...$args], $io, $pipes, $root, $env);
        self::assertIsResource($process);
        fwrite($pipes[0], $stdin);
        fclose($pipes[0]);
        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return [proc_close($process), $stdout, $stderr];
    }
}
