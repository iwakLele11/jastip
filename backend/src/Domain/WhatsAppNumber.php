<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * No WA Indonesia.
 *
 * - Kanonik (disimpan di DB, field API `no_wa`): digit saja, diawali 62, 11–15 digit.
 *   Contoh: 6281234567890.
 * - Tampilan (field API `no_wa_tampil`, rekap WA): diawali 0. Contoh: 081234567890.
 *
 * Input menerima awalan 08, 62, atau +62. Spasi, tanda hubung, dan kurung dibuang
 * lebih dulu (sama dengan perilaku front-end, ui-spec §7.8).
 */
final class WhatsAppNumber
{
    private const MIN_CANONICAL_LENGTH = 11;
    private const MAX_CANONICAL_LENGTH = 15;

    private function __construct(private readonly string $canonical)
    {
    }

    /**
     * @throws InvalidWhatsAppNumber
     */
    public static function fromInput(string $input): self
    {
        $value = self::stripSeparators($input);
        if ($value === '') {
            throw new InvalidWhatsAppNumber(InvalidWhatsAppNumber::KOSONG);
        }
        if (preg_match('/^\+?[0-9]+$/D', $value) !== 1) {
            throw new InvalidWhatsAppNumber(InvalidWhatsAppNumber::BUKAN_ANGKA);
        }

        $canonical = self::canonicalPrefix($value);
        if ($canonical === null) {
            throw new InvalidWhatsAppNumber(InvalidWhatsAppNumber::AWALAN);
        }

        $length = strlen($canonical);
        if ($length < self::MIN_CANONICAL_LENGTH || $length > self::MAX_CANONICAL_LENGTH) {
            throw new InvalidWhatsAppNumber(InvalidWhatsAppNumber::PANJANG);
        }

        return new self($canonical);
    }

    /** Untuk nilai dari database yang sudah kanonik. */
    public static function fromCanonical(string $canonical): self
    {
        return new self($canonical);
    }

    /**
     * Pola pencarian untuk kolom no_wa kanonik, atau null jika kueri bukan nomor.
     * Awalan 08/62/+62 dianggap sama dan dicari sebagai awalan; digit lain dicari
     * sebagai potongan di mana saja.
     *
     * @return array{mode: 'awalan'|'mengandung', digit: string}|null
     */
    public static function searchPattern(string $query): ?array
    {
        $value = self::stripSeparators($query);
        if (preg_match('/^\+?[0-9]{3,}$/D', $value) !== 1) {
            return null;
        }

        $canonical = self::canonicalPrefix($value);
        if ($canonical !== null) {
            return ['mode' => 'awalan', 'digit' => $canonical];
        }

        return ['mode' => 'mengandung', 'digit' => ltrim($value, '+')];
    }

    public function canonical(): string
    {
        return $this->canonical;
    }

    public function display(): string
    {
        return '0' . substr($this->canonical, 2);
    }

    private static function stripSeparators(string $input): string
    {
        return (string) preg_replace('/[\s\-()]+/u', '', trim($input));
    }

    private static function canonicalPrefix(string $value): ?string
    {
        return match (true) {
            str_starts_with($value, '+62') => '62' . substr($value, 3),
            str_starts_with($value, '+') => null,
            str_starts_with($value, '62') => $value,
            str_starts_with($value, '08') => '62' . substr($value, 1),
            default => null,
        };
    }
}
