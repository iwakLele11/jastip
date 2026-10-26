<?php

declare(strict_types=1);

namespace Jastip\Infrastructure;

use PDOException;
use Throwable;

/**
 * Ringkasan exception untuk log. Pesan PDOException tidak ikut dicatat karena
 * bisa memuat nilai data (mis. "Duplicate entry '62812…'").
 */
final class ErrorContext
{
    /**
     * @return array<string, scalar|null>
     */
    public static function fromThrowable(Throwable $e): array
    {
        $context = [
            'kelas' => $e::class,
            'lokasi' => basename($e->getFile()) . ':' . $e->getLine(),
        ];
        if ($e instanceof PDOException) {
            $context['sqlstate'] = (string) $e->getCode();
            $context['kode_driver'] = isset($e->errorInfo[1]) ? (string) $e->errorInfo[1] : null;
        } else {
            $context['pesan'] = $e->getMessage();
        }

        return $context;
    }
}
