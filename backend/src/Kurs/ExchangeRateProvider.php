<?php

declare(strict_types=1);

namespace Jastip\Kurs;

interface ExchangeRateProvider
{
    /**
     * @throws ExchangeRateUnavailable jika kurs tidak bisa diambil atau respons tidak valid
     */
    public function fetchAudIdr(): MarketRate;
}
