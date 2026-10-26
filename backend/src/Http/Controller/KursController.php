<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Http\Response;
use Jastip\Service\KursService;

final class KursController
{
    public function __construct(private readonly KursService $service)
    {
    }

    public function preview(): Response
    {
        return Response::data($this->service->preview());
    }
}
