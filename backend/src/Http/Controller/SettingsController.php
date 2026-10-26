<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Domain\DecimalFormatter;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Http\Validator;
use Jastip\Repository\SettingsRepository;
use Jastip\Repository\Sql;

final class SettingsController
{
    /** field API => [kolom DB, label untuk pesan] */
    private const FIELDS = [
        'default_markup_persen' => ['default_markup_bp', 'Markup'],
        'buffer_aud_persen' => ['buffer_aud_bp', 'Buffer'],
        'dp_persen' => ['dp_bp', 'DP'],
    ];

    public function __construct(private readonly SettingsRepository $settings)
    {
    }

    public function show(): Response
    {
        return Response::data($this->present());
    }

    public function update(Request $request): Response
    {
        $v = new Validator($request->json());
        $changes = [];
        foreach (self::FIELDS as $field => [$column, $label]) {
            if (!$v->has($field)) {
                continue;
            }
            $range = $label === 'DP' ? 'DP harus antara 0 dan 100%.' : null;
            $value = $v->decimal($field, 2, [
                'wajib' => $label . ' wajib diisi.',
                'bukan_angka' => 'Isi angka, mis. 10.',
                'desimal' => 'Maksimal 2 angka di belakang koma.',
                'negatif' => $range ?? $label . ' tidak boleh negatif.',
                'max' => $range ?? $label . ' maksimal 100%.',
            ], 10_000);
            if ($value !== null) {
                $changes[$column] = $value;
            }
        }
        $v->throwIfInvalid();

        $this->settings->update($changes);

        return Response::data($this->present());
    }

    /**
     * @return array<string, string|null>
     */
    private function present(): array
    {
        $row = $this->settings->get();

        return [
            'default_markup_persen' => DecimalFormatter::trimmed($row['default_markup_bp'], 2),
            'buffer_aud_persen' => DecimalFormatter::trimmed($row['buffer_aud_bp'], 2),
            'dp_persen' => DecimalFormatter::trimmed($row['dp_bp'], 2),
            'diubah_pada' => Sql::isoOrNull($row['updated_at']),
        ];
    }
}
