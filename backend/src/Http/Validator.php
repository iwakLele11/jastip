<?php

declare(strict_types=1);

namespace Jastip\Http;

use DateTimeImmutable;
use Jastip\Domain\DecimalParser;
use Jastip\Domain\InvalidDecimal;
use Jastip\Domain\InvalidDecimalReason;

/**
 * Validasi body JSON. Setiap method mengembalikan nilai bersih atau null,
 * dan mencatat pesan error per field (kunci bertingkat memakai titik, mis. "kurs.kurs_jastip").
 *
 * Aturan tipe:
 * - teks: string JSON
 * - desimal (harga AUD, persen, kurs pasar): string JSON, "24.95" atau "24,95"; angka JSON ditolak
 * - rupiah dan qty: integer JSON
 */
final class Validator
{
    /** @var array<string, string> */
    private array $ownErrors = [];

    /**
     * @param array<string, mixed> $input
     */
    public function __construct(
        private readonly array $input,
        private readonly string $prefix = '',
        private ?Validator $parent = null,
    ) {
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->input);
    }

    public function text(string $key, string $requiredMessage, int $maxLength, string $tooLongMessage): ?string
    {
        $value = $this->input[$key] ?? null;
        if (!is_string($value) || trim($value) === '') {
            $this->error($key, $requiredMessage);

            return null;
        }
        $value = trim($value);
        if (mb_strlen($value) > $maxLength) {
            $this->error($key, $tooLongMessage);

            return null;
        }

        return $value;
    }

    /** Teks opsional: null, "" atau spasi menjadi null. */
    public function optionalText(string $key, int $maxLength, string $tooLongMessage, string $typeMessage): ?string
    {
        $value = $this->input[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            $this->error($key, $typeMessage);

            return null;
        }
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (mb_strlen($value) > $maxLength) {
            $this->error($key, $tooLongMessage);

            return null;
        }

        return $value;
    }

    /**
     * @param array{wajib: string, bukan_angka: string, desimal: string, negatif: string, min?: string, max: string} $messages
     *        min: pesan jika nilai harus > 0 tetapi 0
     */
    public function decimal(string $key, int $scale, array $messages, int $maxScaled): ?int
    {
        $value = $this->input[$key] ?? null;
        if ($value === null || (is_string($value) && trim($value) === '')) {
            $this->error($key, $messages['wajib']);

            return null;
        }
        if (!is_string($value)) {
            $this->error($key, $messages['bukan_angka']);

            return null;
        }

        try {
            $scaled = DecimalParser::parse($value, $scale);
        } catch (InvalidDecimal $e) {
            $this->error($key, match ($e->reason) {
                InvalidDecimalReason::Empty => $messages['wajib'],
                InvalidDecimalReason::TooManyDecimals => $messages['desimal'],
                InvalidDecimalReason::Negative => $messages['negatif'],
                InvalidDecimalReason::TooLarge => $messages['max'],
                InvalidDecimalReason::NotANumber => $messages['bukan_angka'],
            });

            return null;
        }

        if ($scaled === 0 && isset($messages['min'])) {
            $this->error($key, $messages['min']);

            return null;
        }
        if ($scaled > $maxScaled) {
            $this->error($key, $messages['max']);

            return null;
        }

        return $scaled;
    }

    /**
     * @param array{wajib: string, bukan_angka: string, min: string, max: string} $messages
     */
    public function integer(string $key, array $messages, int $min, int $max): ?int
    {
        $value = $this->input[$key] ?? null;
        if ($value === null || $value === '') {
            $this->error($key, $messages['wajib']);

            return null;
        }
        if (!is_int($value)) {
            $this->error($key, $messages['bukan_angka']);

            return null;
        }
        if ($value < $min) {
            $this->error($key, $messages['min']);

            return null;
        }
        if ($value > $max) {
            $this->error($key, $messages['max']);

            return null;
        }

        return $value;
    }

    /**
     * @param list<string> $allowed
     */
    public function choice(string $key, array $allowed, string $message): ?string
    {
        $value = $this->input[$key] ?? null;
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            $this->error($key, $message);

            return null;
        }

        return $value;
    }

    /** Tanggal format YYYY-MM-DD. */
    public function date(string $key, string $requiredMessage, string $invalidMessage): ?string
    {
        $value = $this->input[$key] ?? null;
        if ($value === null || $value === '') {
            $this->error($key, $requiredMessage);

            return null;
        }
        if (!is_string($value) || !self::isDate($value)) {
            $this->error($key, $invalidMessage);

            return null;
        }

        return $value;
    }

    /** Sub-objek JSON, error-nya ikut tercatat di validator ini dengan awalan "key.". */
    public function object(string $key, string $requiredMessage): ?Validator
    {
        $value = $this->input[$key] ?? null;
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            $this->error($key, $requiredMessage);

            return null;
        }

        /** @var array<string, mixed> $value */
        return new self($value, $this->prefix . $key . '.', $this);
    }

    public function error(string $key, string $message): void
    {
        if ($this->parent !== null) {
            $this->parent->error(substr($this->prefix, strlen($this->parent->prefix)) . $key, $message);

            return;
        }
        $this->ownErrors[$this->prefix . $key] ??= $message;
    }

    public function hasError(string $key): bool
    {
        return isset($this->ownErrors[$key]);
    }

    /**
     * @throws HttpError 422 VALIDASI
     */
    public function throwIfInvalid(): void
    {
        if ($this->ownErrors !== []) {
            throw HttpError::validation($this->ownErrors);
        }
    }

    public static function isDate(string $value): bool
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value;
    }
}
