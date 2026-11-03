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
    /** Field persen (basis point, 0–100%). field API => [kolom DB, label untuk pesan] */
    private const FIELDS = [
        'buffer_aud_persen' => ['buffer_aud_bp', 'Buffer'],
        'dp_persen' => ['dp_bp', 'DP'],
    ];

    /** Field nominal AUD (sen). field API => [kolom DB, label untuk pesan] */
    private const FIELDS_AUD = [
        'default_ongkos_berat' => ['default_ongkos_berat_sen', 'Ongkos berat'],
        'default_fee_jastip' => ['default_fee_jastip_sen', 'Fee jastip'],
    ];
    private const MAX_AUD_SEN = 10_000_000;

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
        foreach (self::FIELDS_AUD as $field => [$column, $label]) {
            if (!$v->has($field)) {
                continue;
            }
            $value = $v->decimal($field, 2, [
                'wajib' => $label . ' wajib diisi.',
                'bukan_angka' => 'Isi angka saja, mis. 5.',
                'desimal' => 'Maksimal 2 angka di belakang koma.',
                'negatif' => $label . ' tidak boleh negatif.',
                'max' => $label . ' maksimal AUD 100.000,00.',
            ], self::MAX_AUD_SEN);
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
            'default_ongkos_berat' => DecimalFormatter::fixed($row['default_ongkos_berat_sen'], 2),
            'default_fee_jastip' => DecimalFormatter::fixed($row['default_fee_jastip_sen'], 2),
            'buffer_aud_persen' => DecimalFormatter::trimmed($row['buffer_aud_bp'], 2),
            'dp_persen' => DecimalFormatter::trimmed($row['dp_bp'], 2),
            'diubah_pada' => Sql::isoOrNull($row['updated_at']),
        ];
    }
}
