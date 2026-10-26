<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\MigrationSqlExport;
use Jastip\Infrastructure\Migrator;
use Jastip\Tests\Support\TestDatabase;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * install.sql / upgrade SQL untuk phpMyAdmin (bin/export-sql.php): hasilnya harus sama dengan
 * skema yang dibuat Migrator, dan pengaman upgrade harus berhenti sebelum mengubah apa pun.
 */
final class SqlExportTest extends TestCase
{
    private const DB = 'jastip_migrasi_test';

    private PDO $server;
    private PDO $pdo;
    private string $migrations;
    private ?string $tempDir = null;

    protected function setUp(): void
    {
        $s = TestDatabase::settings();
        $this->server = Database::connect($s['host'], $s['port'], null, $s['user'], $s['password']);
        TestDatabase::recreate($this->server, self::DB);
        $this->pdo = Database::connect($s['host'], $s['port'], self::DB, $s['user'], $s['password']);
        $this->migrations = dirname(__DIR__, 2) . '/database/migrations';
    }

    protected function tearDown(): void
    {
        $this->server->exec('DROP DATABASE IF EXISTS `' . self::DB . '`');
        if ($this->tempDir !== null) {
            array_map('unlink', glob($this->tempDir . '/*') ?: []);
            rmdir($this->tempDir);
        }
    }

    public function testInstallSqlMenghasilkanSkemaYangSamaDenganMigrator(): void
    {
        $sql = (new MigrationSqlExport($this->migrations))->install();

        self::assertDoesNotMatchRegularExpression('/^\s*(USE|DELIMITER)\b/im', $sql);
        self::assertDoesNotMatchRegularExpression('/\bCREATE\s+(DATABASE|SCHEMA)\b/i', $sql);
        self::assertStringContainsString("SET NAMES utf8mb4;\n", $sql);
        self::assertStringContainsString('CREATE TABLE ' . Migrator::TABLE_DEFINITION . ";\n", $sql);
        self::assertSame(
            'CREATE TABLE ' . Migrator::TABLE_DEFINITION,
            Migrator::splitStatements($sql)[3],
            'Setelah 3 SET, pernyataan pertama harus CREATE TABLE schema_migrations (gagal di DB berisi).',
        );

        $this->runSql($sql);

        $migrator = new Migrator($this->pdo, $this->migrations);
        self::assertSame(['001_init' => true], $migrator->status());
        self::assertSame([], $migrator->up());
        self::assertSame(self::schema(TestDatabase::pdo()), self::schema($this->pdo));
        self::assertSame(
            ['default_markup_bp' => 1000, 'buffer_aud_bp' => 300, 'dp_bp' => 5000],
            $this->pdo->query('SELECT default_markup_bp, buffer_aud_bp, dp_bp FROM pengaturan')->fetch(),
        );
    }

    public function testInstallSqlKeDatabaseBerisiBerhentiDiPernyataanPertama(): void
    {
        $sql = (new MigrationSqlExport($this->migrations))->install();
        $this->runSql($sql);

        try {
            $this->runSql($sql);
            self::fail('Impor kedua seharusnya gagal');
        } catch (PDOException $e) {
            self::assertSame('42S01', $e->getCode(), $e->getMessage());
            self::assertStringContainsString('schema_migrations', $e->getMessage());
        }
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn());
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM pengaturan')->fetchColumn());
    }

    public function testUpgradeSqlDenganPengaman(): void
    {
        $dir = $this->tempMigrations([
            '001_init.sql' => (string) file_get_contents($this->migrations . '/001_init.sql'),
            '002_contoh.sql' => "-- contoh\nCREATE TABLE contoh (id INT UNSIGNED NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;\n",
            '003_contoh_lagi.sql' => "ALTER TABLE contoh ADD COLUMN catatan VARCHAR(20) NULL;\n",
        ]);
        $export = new MigrationSqlExport($dir);
        self::assertSame(['001_init', '002_contoh', '003_contoh_lagi'], $export->versions());

        // Database versi lama: install.sql dari migrasi asli (hanya 001).
        $this->runSql((new MigrationSqlExport($this->migrations))->install());

        // 003 sebelum 002: ditolak di pernyataan pengaman, tidak ada yang berubah.
        $this->assertGuardRejects($export->upgrade('003_contoh_lagi'), 1048, ['001_init']);

        $upgrade002 = $export->upgrade('002_contoh');
        self::assertDoesNotMatchRegularExpression('/^\s*(USE|DELIMITER)\b/im', $upgrade002);
        $this->runSql($upgrade002);
        self::assertSame(['001_init', '002_contoh'], $this->applied());
        self::assertSame(['id'], $this->columns('contoh'));

        // Impor ulang 002: ditolak (duplicate key) sebelum CREATE TABLE.
        $this->assertGuardRejects($upgrade002, 1062, ['001_init', '002_contoh']);

        $this->runSql($export->upgrade('003_contoh_lagi'));
        self::assertSame(['id', 'catatan'], $this->columns('contoh'));

        // Migrator membaca catatan yang sama: tidak ada yang dijalankan ulang.
        self::assertSame([], (new Migrator($this->pdo, $dir))->up());
    }

    public function testUpgradeVersiPertamaAtauTidakAdaDitolak(): void
    {
        $export = new MigrationSqlExport($this->migrations);
        foreach (['001_init', '999_tidak_ada'] as $version) {
            try {
                $export->upgrade($version);
                self::fail('Seharusnya ditolak: ' . $version);
            } catch (RuntimeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testMigrasiYangTidakBisaDiimporPhpMyAdminDitolak(): void
    {
        $bad = [
            'DELIMITER' => "DELIMITER $$\nCREATE TABLE a (id INT)$$\n",
            'USE' => "USE jastip;\nCREATE TABLE a (id INT);\n",
            'CREATE DATABASE' => "CREATE DATABASE jastip;\n",
            'tanpa titik koma' => "CREATE TABLE a (id INT)\n-- komentar;\n",
        ];
        foreach ($bad as $label => $content) {
            $dir = $this->tempMigrations(['001_init.sql' => $content]);
            try {
                (new MigrationSqlExport($dir))->install();
                self::fail('Seharusnya ditolak: ' . $label);
            } catch (RuntimeException $e) {
                self::assertStringContainsString('001_init.sql', $e->getMessage(), $label);
            }
        }
    }

    public function testCliMenulisInstallSqlKeStdout(): void
    {
        $root = dirname(__DIR__, 2);
        $io = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $command = [PHP_BINARY, $root . '/bin/export-sql.php', 'install'];
        $process = proc_open($command, $io, $pipes, $root, ['PATH' => (string) getenv('PATH')]);
        self::assertIsResource($process);
        $stdout = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        self::assertSame(0, proc_close($process));
        self::assertSame((new MigrationSqlExport($this->migrations))->install(), $stdout);
    }

    /**
     * @param list<string> $expectedApplied
     */
    private function assertGuardRejects(string $sql, int $driverCode, array $expectedApplied): void
    {
        $tablesBefore = self::schema($this->pdo);
        try {
            $this->runSql($sql);
            self::fail('Pengaman upgrade seharusnya menolak');
        } catch (PDOException $e) {
            self::assertSame($driverCode, $e->errorInfo[1] ?? null, $e->getMessage());
        }
        self::assertSame($expectedApplied, $this->applied());
        self::assertSame($tablesBefore, self::schema($this->pdo));
    }

    private function runSql(string $sql): void
    {
        foreach (Migrator::splitStatements($sql) as $statement) {
            $this->pdo->exec($statement);
        }
    }

    /**
     * @return list<string>
     */
    private function applied(): array
    {
        return $this->pdo->query('SELECT version FROM schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * @return list<string>
     */
    private function columns(string $table): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            . ' ORDER BY ORDINAL_POSITION'
        );
        $stmt->execute([$table]);

        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * SHOW CREATE TABLE semua tabel, tanpa penghitung AUTO_INCREMENT.
     *
     * @return array<string, string>
     */
    private static function schema(PDO $pdo): array
    {
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        sort($tables);
        $schema = [];
        foreach ($tables as $table) {
            $create = (string) $pdo->query('SHOW CREATE TABLE `' . $table . '`')->fetch(PDO::FETCH_NUM)[1];
            $schema[$table] = (string) preg_replace('/ AUTO_INCREMENT=\d+/', '', $create);
        }

        return $schema;
    }

    /**
     * @param array<string, string> $files
     */
    private function tempMigrations(array $files): string
    {
        if ($this->tempDir !== null) {
            array_map('unlink', glob($this->tempDir . '/*') ?: []);
        } else {
            $this->tempDir = sys_get_temp_dir() . '/jastip-migrasi-' . bin2hex(random_bytes(6));
            mkdir($this->tempDir, 0700);
        }
        foreach ($files as $name => $content) {
            file_put_contents($this->tempDir . '/' . $name, $content);
        }

        return $this->tempDir;
    }
}
