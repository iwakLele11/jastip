<?php

declare(strict_types=1);

namespace Jastip\Kurs;

use DateTimeImmutable;
use Jastip\Domain\DecimalParser;
use Jastip\Domain\InvalidDecimal;
use Jastip\Domain\KursCalculator;

/**
 * Klien Frankfurter API v2: GET https://api.frankfurter.dev/v2/rate/aud/idr
 * Contoh respons: {"date":"2026-10-25","base":"AUD","quote":"IDR","rate":12673}
 */
final class FrankfurterClient implements ExchangeRateProvider
{
    public function __construct(
        private readonly string $url,
        private readonly int $timeoutSeconds,
    ) {
    }

    public function fetchAudIdr(): MarketRate
    {
        $handle = curl_init($this->url);
        if ($handle === false) {
            throw new ExchangeRateUnavailable('curl_init gagal');
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(3, $this->timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_USERAGENT => 'jastip-backend/1.0',
        ]);
        $body = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if (!is_string($body) || $status !== 200) {
            throw new ExchangeRateUnavailable(sprintf('HTTP %d %s', $status, $error));
        }

        return self::parse($body);
    }

    /**
     * Angka kurs dibaca langsung dari teks JSON (bukan dari float hasil json_decode)
     * supaya tidak ada pembulatan biner.
     */
    public static function parse(string $body): MarketRate
    {
        $data = json_decode($body, true);
        if (!is_array($data) || ($data['base'] ?? null) !== 'AUD' || ($data['quote'] ?? null) !== 'IDR') {
            throw new ExchangeRateUnavailable('Struktur respons tidak dikenal');
        }

        $date = $data['date'] ?? null;
        $parsedDate = is_string($date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
        if ($parsedDate === false || $parsedDate->format('Y-m-d') !== $date) {
            throw new ExchangeRateUnavailable('Tanggal kurs tidak valid');
        }

        if (
            !(is_int($data['rate'] ?? null) || is_float($data['rate'] ?? null))
            || preg_match_all('/"rate"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*[,}]/', $body, $matches) !== 1
        ) {
            throw new ExchangeRateUnavailable('Nilai kurs tidak valid');
        }

        try {
            $rate = DecimalParser::parseRoundHalfUp($matches[1][0], KursCalculator::PASAR_SCALE);
        } catch (InvalidDecimal) {
            throw new ExchangeRateUnavailable('Nilai kurs tidak valid');
        }
        if ($rate <= 0 || $rate > KursCalculator::MAX_KURS_PASAR_MIKRO) {
            throw new ExchangeRateUnavailable('Nilai kurs di luar rentang');
        }

        return new MarketRate($rate, $date);
    }
}
