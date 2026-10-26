<?php

declare(strict_types=1);

namespace Jastip\Tests\Support;

use Jastip\Kurs\ExchangeRateProvider;
use Jastip\Kurs\ExchangeRateUnavailable;
use Jastip\Kurs\FrankfurterClient;
use Jastip\Kurs\MarketRate;

/**
 * Pengganti Frankfurter di test: tanpa panggilan jaringan. Respons diproses
 * dengan parser yang sama dengan klien asli.
 */
final class StubExchangeRateProvider implements ExchangeRateProvider
{
    public ?string $body = '{"date":"2026-10-25","base":"AUD","quote":"IDR","rate":12673}';
    public int $calls = 0;

    public function fetchAudIdr(): MarketRate
    {
        $this->calls++;
        if ($this->body === null) {
            throw new ExchangeRateUnavailable('stub: jaringan gagal');
        }

        return FrankfurterClient::parse($this->body);
    }
}
