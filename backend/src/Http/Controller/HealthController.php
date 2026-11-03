<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Http\HttpError;
use Jastip\Http\Response;
use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\ErrorContext;
use Jastip\Infrastructure\Logger;
use Throwable;

/**
 * Health check untuk monitoring/uptime. Publik, tidak mengembalikan data aplikasi.
 */
final class HealthController
{
    public function __construct(private readonly Database $db, private readonly Logger $logger)
    {
    }

    public function show(): Response
    {
        try {
            $this->db->pdo()->query('SELECT 1')->fetchColumn();
        } catch (Throwable $e) {
            $this->logger->error('health_database_gagal', ErrorContext::fromThrowable($e));

            throw new HttpError(503, 'LAYANAN_TIDAK_TERSEDIA', 'Database tidak dapat dihubungi.');
        }

        return Response::data(['status' => 'ok', 'database' => 'ok']);
    }
}
