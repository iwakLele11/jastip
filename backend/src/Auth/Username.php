<?php

declare(strict_types=1);

namespace Jastip\Auth;

/**
 * Aturan nama pengguna admin: 3–50 karakter ASCII (huruf, angka, titik, garis bawah, tanda hubung).
 *
 * Nama disimpan seperti diketik saat dibuat (huruf besar boleh). Bentuk ternormalisasi (spasi di
 * tepi dibuang, huruf kecil ASCII) dipakai untuk pencarian admin di database DAN untuk kunci
 * pembatasan login, supaya semua penulisan yang mengarah ke akun yang sama memakai satu hitungan.
 * Huruf beraksen, fullwidth, soft hyphen, dan karakter non-ASCII lain ditolak, karena collation
 * database (utf8mb4_unicode_ci) menganggap banyak di antaranya sama dengan huruf ASCII.
 */
final class Username
{
    public const PATTERN = '/^[A-Za-z0-9._-]{3,50}$/D';

    public static function isValid(string $namaPengguna): bool
    {
        return preg_match(self::PATTERN, $namaPengguna) === 1;
    }

    /**
     * @return string|null huruf kecil ASCII, atau null jika (setelah trim) tidak sesuai pola
     */
    public static function normalize(string $input): ?string
    {
        $trimmed = trim($input);

        return self::isValid($trimmed) ? strtolower($trimmed) : null;
    }
}
