<?php

declare(strict_types=1);

namespace Jastip\Tests\Integration;

use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\Migrator;
use Jastip\Tests\Support\TestDatabase;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * Migrasi up → down → up di database terpisah, plus constraint penting di skema.
 */
final class MigrationTest extends TestCase
{
    private const DB = 'jastip_migrasi_test';

    private PDO $server;
    private PDO $pdo;

    protected function setUp(): void
    {
        $s = TestDatabase::settings();
        $this->server = Database::connect($s['host'], $s['port'], null, $s['user'], $s['password']);
        TestDatabase::recreate($this->server, self::DB);
        $this->pdo = Database::connect($s['host'], $s['port'], self::DB, $s['user'], $s['password']);
    }

    protected function tearDown(): void
    {
        $this->server->exec('DROP DATABASE IF EXISTS `' . self::DB . '`');
    }

    public function testUpDownUp(): void
    {
        $migrator = new Migrator($this->pdo, dirname(__DIR__, 2) . '/database/migrations');

        self::assertSame(['001_init'], $migrator->up());
        self::assertSame([], $migrator->up());
        self::assertSame(['001_init' => true], $migrator->status());
        self::assertCount(11, $this->tables());

        self::assertSame(['001_init'], $migrator->down());
        self::assertSame(['schema_migrations'], $this->tables());

        self::assertSame(['001_init'], $migrator->up());
        self::assertSame(
            ['default_markup_bp' => 1000, 'buffer_aud_bp' => 300, 'dp_bp' => 5000],
            $this->pdo->query('SELECT default_markup_bp, buffer_aud_bp, dp_bp FROM pengaturan')->fetch(),
        );
    }

    public function testConstraintMenolakDataSalah(): void
    {
        (new Migrator($this->pdo, dirname(__DIR__, 2) . '/database/migrations'))->up();

        $rejected = [
            'pengaturan kedua' => 'INSERT INTO pengaturan (id, default_markup_bp, buffer_aud_bp, dp_bp) VALUES (2, 0, 0, 0)',
            'no wa bukan kanonik' => "INSERT INTO customer (nama, no_wa) VALUES ('X', '081234567890')",
            'mata uang lain' =>
                "INSERT INTO open_po (nama, mata_uang, kurs_mode, kurs_jastip, dp_bp) VALUES ('X', 'USD', 'manual', 1, 5000)",
            'otomatis tanpa kurs pasar' =>
                "INSERT INTO open_po (nama, kurs_mode, kurs_jastip, dp_bp) VALUES ('X', 'otomatis', 1, 5000)",
            'kurs nol' => "INSERT INTO open_po (nama, kurs_mode, kurs_jastip, dp_bp) VALUES ('X', 'manual', 0, 5000)",
        ];
        foreach ($rejected as $label => $sql) {
            try {
                $this->pdo->exec($sql);
                self::fail('Seharusnya ditolak: ' . $label);
            } catch (PDOException $e) {
                self::assertSame('23000', $e->getCode(), $label . ': ' . $e->getMessage());
            }
        }

        $this->pdo->exec("INSERT INTO open_po (nama, kurs_mode, kurs_jastip, dp_bp) VALUES ('PO', 'manual', 13054, 5000)");
        $this->pdo->exec("INSERT INTO customer (nama, no_wa) VALUES ('Rina', '6281234567890')");
        $this->pdo->exec('INSERT INTO keranjang (open_po_id, customer_id) VALUES (1, 1)');

        $badLines = [
            'subtotal tidak cocok' => [359_000, 2, 700_000],
            'harga jual bukan ribuan' => [359_500, 1, 359_500],
        ];
        foreach ($badLines as $label => [$unit, $qty, $subtotal]) {
            try {
                $this->pdo->prepare(
                    'INSERT INTO baris_pesanan (keranjang_id, nama_barang, harga_aud_sen, qty, markup_bp, kurs_jastip,'
                    . ' harga_jual_unit, subtotal) VALUES (1, ?, 2495, ?, 1000, 13054, ?, ?)'
                )->execute([$label, $qty, $unit, $subtotal]);
                self::fail('Seharusnya ditolak: ' . $label);
            } catch (PDOException $e) {
                self::assertSame('23000', $e->getCode(), $label);
            }
        }

        try {
            $this->pdo->exec('INSERT INTO pembayaran (keranjang_id, nominal, tanggal) VALUES (1, 0, \'2026-10-28\')');
            self::fail('Pembayaran Rp0 seharusnya ditolak');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }

        try {
            $this->pdo->exec('DELETE FROM customer WHERE id = 1');
            self::fail('Customer dengan keranjang seharusnya tidak bisa dihapus (FK)');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }
    }

    /**
     * @return list<string>
     */
    private function tables(): array
    {
        $tables = $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        sort($tables);

        return $tables;
    }
}
