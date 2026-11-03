<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\DecimalFormatter;
use Jastip\Domain\KursCalculator;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\ErrorContext;
use Jastip\Infrastructure\Logger;
use Jastip\Kurs\ExchangeRateProvider;
use Jastip\Kurs\ExchangeRateUnavailable;
use Jastip\Repository\SettingsRepository;

final class KursService
{
    public const SUMBER = 'Frankfurter';

    public function __construct(
        private readonly ExchangeRateProvider $provider,
        private readonly SettingsRepository $settings,
        private readonly Logger $logger,
    ) {
    }

    /**
     * Pratinjau kurs sebelum Open PO disimpan. Tidak menyimpan apa pun.
     *
     * @return array<string, int|string>
     */
    public function preview(): array
    {
        try {
            $rate = $this->provider->fetchAudIdr();
        } catch (ExchangeRateUnavailable $e) {
            $this->logger->warning('kurs_gagal', ErrorContext::fromThrowable($e));

            throw new HttpError(502, 'KURS_GAGAL', 'Kurs otomatis gagal diambil. Isi kurs manual, atau coba lagi.');
        }

        $bufferBp = $this->settings->get()['buffer_aud_bp'];

        return [
            'mata_uang' => 'AUD',
            'kurs_pasar' => DecimalFormatter::trimmed($rate->rateMikro, KursCalculator::PASAR_SCALE),
            'tanggal_kurs' => $rate->date,
            'buffer_persen' => DecimalFormatter::trimmed($bufferBp, 2),
            'kurs_jastip' => KursCalculator::kursJastip($rate->rateMikro, $bufferBp),
            'sumber' => self::SUMBER,
        ];
    }
}
