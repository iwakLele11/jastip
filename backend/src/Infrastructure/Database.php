<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

use Closure;
use Jastip\Config\Config;
use PDO;
use Throwable;

/**
 * Koneksi PDO yang dibuat saat pertama kali dipakai, plus helper transaksi.
 */
final class Database
{
    private ?PDO $pdo = null;

    /**
     * @param Closure(): PDO $factory
     */
    public function __construct(private readonly Closure $factory)
    {
    }

    public static function fromConfig(Config $config): self
    {
        return new self(static fn (): PDO => self::connect(
            $config->dbHost,
            $config->dbPort,
            $config->dbName,
            $config->dbUser,
            $config->dbPassword,
        ));
    }

    public static function connect(string $host, int $port, ?string $name, string $user, string $password): PDO
    {
        $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $host, $port);
        if ($name !== null) {
            $dsn .= ';dbname=' . $name;
        }

        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        // Semua DATETIME dalam UTC; mode ketat supaya data salah ditolak, bukan dipotong.
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,"
            . "ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");

        return $pdo;
    }

    public function pdo(): PDO
    {
        return $this->pdo ??= ($this->factory)();
    }

    /**
     * @template T
     * @param callable(): T $callback
     * @return T
     */
    public function transaction(callable $callback): mixed
    {
        $pdo = $this->pdo();
        $pdo->beginTransaction();
        try {
            $result = $callback();
            $pdo->commit();

            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
