<?php

declare(strict_types=1);

namespace Jastip\Http;

/**
 * Parameter ?halaman=1&per_halaman=20 (maks. 100).
 */
final class Pagination
{
    public const DEFAULT_PER_PAGE = 20;
    public const MAX_PER_PAGE = 100;

    public function __construct(public readonly int $halaman, public readonly int $perHalaman)
    {
    }

    public static function fromRequest(Request $request): self
    {
        $errors = [];
        $halaman = self::positiveInt($request->query['halaman'] ?? null, 1);
        if ($halaman === null) {
            $errors['halaman'] = 'Halaman harus bilangan bulat mulai dari 1.';
        }
        $perHalaman = self::positiveInt($request->query['per_halaman'] ?? null, self::DEFAULT_PER_PAGE);
        if ($perHalaman === null || $perHalaman > self::MAX_PER_PAGE) {
            $errors['per_halaman'] = sprintf('per_halaman harus antara 1 dan %d.', self::MAX_PER_PAGE);
        }
        if ($errors !== []) {
            throw HttpError::validation($errors);
        }

        return new self((int) $halaman, (int) $perHalaman);
    }

    public function offset(): int
    {
        return ($this->halaman - 1) * $this->perHalaman;
    }

    /**
     * @return array{halaman: int, per_halaman: int, total: int, total_halaman: int}
     */
    public function meta(int $total): array
    {
        return [
            'halaman' => $this->halaman,
            'per_halaman' => $this->perHalaman,
            'total' => $total,
            'total_halaman' => (int) ceil($total / $this->perHalaman),
        ];
    }

    private static function positiveInt(mixed $value, int $default): ?int
    {
        if ($value === null || $value === '') {
            return $default;
        }
        if (!is_string($value) || preg_match('/^[1-9][0-9]{0,8}$/D', $value) !== 1) {
            return null;
        }

        return (int) $value;
    }
}
