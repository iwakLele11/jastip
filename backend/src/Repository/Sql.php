<?php

declare(strict_types=1);

namespace Jastip\Repository;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Helper konversi nilai SQL <-> API.
 */
final class Sql
{
    public static function datetime(DateTimeImmutable $value): string
    {
        return $value->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    public static function parseDatetime(string $value): DateTimeImmutable
    {
        return new DateTimeImmutable($value, new DateTimeZone('UTC'));
    }

    /** DATETIME UTC dari DB menjadi ISO 8601, mis. "2026-10-25T09:00:00Z". */
    public static function isoOrNull(?string $value): ?string
    {
        return $value === null ? null : self::parseDatetime($value)->format('Y-m-d\TH:i:s\Z');
    }

    /** Escape untuk LIKE dengan ESCAPE '!'. */
    public static function likeEscape(string $value): string
    {
        return strtr($value, ['!' => '!!', '%' => '!%', '_' => '!_']);
    }
}
