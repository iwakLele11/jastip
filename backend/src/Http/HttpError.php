<?php

declare(strict_types=1);

namespace Jastip\Http;

use RuntimeException;

/**
 * Error yang dipetakan langsung ke respons {"error": {"kode", "pesan", "field"?}}.
 */
class HttpError extends RuntimeException
{
    /**
     * @param array<string, string> $fields pesan per field (hanya untuk VALIDASI)
     * @param array<string, string> $headers header tambahan, mis. Retry-After
     */
    public function __construct(
        public readonly int $status,
        public readonly string $kode,
        string $pesan,
        public readonly array $fields = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($pesan);
    }

    /**
     * @param array<string, string> $fields
     */
    public static function validation(array $fields): self
    {
        $pesan = count($fields) === 1
            ? (string) reset($fields)
            : sprintf('Periksa %d isian yang ditandai.', count($fields));

        return new self(422, 'VALIDASI', $pesan, $fields);
    }

    public static function notFound(string $pesan = 'Data tidak ditemukan.'): self
    {
        return new self(404, 'TIDAK_DITEMUKAN', $pesan);
    }

    public static function conflict(string $kode, string $pesan): self
    {
        return new self(409, $kode, $pesan);
    }
}
