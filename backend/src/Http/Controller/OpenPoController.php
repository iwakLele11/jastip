<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Domain\DecimalFormatter;
use Jastip\Domain\DecimalParser;
use Jastip\Domain\KursCalculator;
use Jastip\Domain\Pricing;
use Jastip\Http\HttpError;
use Jastip\Http\Pagination;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Http\Validator;
use Jastip\Repository\Sql;
use Jastip\Service\KursInput;
use Jastip\Service\KursService;
use Jastip\Service\OpenPoService;

final class OpenPoController
{
    private const STATUSES = ['buka', 'selesai'];
    private const KURS_WAJIB = 'Kurs wajib diisi. Ambil kurs otomatis atau isi manual.';
    private const KURS_PASAR_SALAH = 'Kurs pasar tidak valid. Ambil kurs terbaru.';

    public function __construct(private readonly OpenPoService $service)
    {
    }

    public function index(Request $request): Response
    {
        $status = $request->query['status'] ?? null;
        if ($status !== null && (!is_string($status) || !in_array($status, self::STATUSES, true))) {
            throw HttpError::validation(['status' => 'Status harus buka atau selesai.']);
        }
        $page = Pagination::fromRequest($request);
        $result = $this->service->list($status, $page->perHalaman, $page->offset());

        return Response::data(
            array_map([self::class, 'present'], $result['items']),
            meta: $page->meta($result['total']) + ['jumlah_per_status' => $result['per_status']],
        );
    }

    public function store(Request $request): Response
    {
        $v = new Validator($request->json());
        $nama = $v->text('nama', 'Nama Open PO wajib diisi.', 100, 'Nama Open PO maksimal 100 karakter.');
        $kurs = $this->kursInput($v);
        $v->throwIfInvalid();
        assert($nama !== null && $kurs !== null);

        $po = $this->service->create($nama, $kurs);

        return Response::data(self::present($po), 201)->withHeader('Location', '/api/v1/open-po/' . $po['id']);
    }

    /**
     * @param array<string, int> $params
     */
    public function show(array $params): Response
    {
        return Response::data(self::present($this->service->get($params['id'])));
    }

    /**
     * Semua field opsional. Jangan kirim "kurs" kalau kurs_terkunci = true (ditolak 409).
     *
     * @param array<string, int> $params
     */
    public function update(Request $request, array $params): Response
    {
        $v = new Validator($request->json());
        $nama = $v->has('nama')
            ? $v->text('nama', 'Nama Open PO wajib diisi.', 100, 'Nama Open PO maksimal 100 karakter.')
            : null;
        $status = $v->has('status') ? $v->choice('status', self::STATUSES, 'Status harus buka atau selesai.') : null;
        $kurs = $v->has('kurs') ? $this->kursInput($v) : null;
        $v->throwIfInvalid();

        return Response::data(self::present($this->service->update($params['id'], $nama, $status, $kurs)));
    }

    private function kursInput(Validator $v): ?KursInput
    {
        $kurs = $v->object('kurs', self::KURS_WAJIB);
        if ($kurs === null) {
            return null;
        }
        $mode = $kurs->choice('mode', ['otomatis', 'manual'], 'Pilih kurs Otomatis atau Manual.');
        if ($mode === null) {
            return null;
        }

        $kursPasar = null;
        $tanggal = null;
        if ($mode === 'otomatis' || $kurs->has('kurs_pasar') || $kurs->has('tanggal_kurs')) {
            $kursPasar = $kurs->decimal('kurs_pasar', KursCalculator::PASAR_SCALE, [
                'wajib' => $mode === 'otomatis' ? self::KURS_WAJIB : self::KURS_PASAR_SALAH,
                'bukan_angka' => self::KURS_PASAR_SALAH,
                'desimal' => self::KURS_PASAR_SALAH,
                'negatif' => self::KURS_PASAR_SALAH,
                'min' => self::KURS_PASAR_SALAH,
                'max' => self::KURS_PASAR_SALAH,
            ], KursCalculator::MAX_KURS_PASAR_MIKRO);
            $tanggal = $kurs->date('tanggal_kurs', self::KURS_PASAR_SALAH, 'Tanggal kurs tidak valid.');
        }

        $manual = null;
        if ($mode === 'manual') {
            $manual = $kurs->integer('kurs_jastip', [
                'wajib' => self::KURS_WAJIB,
                'bukan_angka' => 'Isi angka saja, mis. 13054.',
                'min' => 'Kurs harus lebih dari 0.',
                'max' => 'Kurs maksimal Rp1.000.000.',
            ], 1, Pricing::MAX_KURS);
        }

        return new KursInput($mode, $kursPasar, $tanggal, $manual);
    }

    /**
     * @param array<string, mixed> $po
     * @return array<string, mixed>
     */
    public static function present(array $po): array
    {
        $kursPasar = $po['kurs_pasar'] === null
            ? null
            : DecimalFormatter::trimmed(
                DecimalParser::parse((string) $po['kurs_pasar'], KursCalculator::PASAR_SCALE),
                KursCalculator::PASAR_SCALE,
            );

        return [
            'id' => (int) $po['id'],
            'nama' => $po['nama'],
            'mata_uang' => $po['mata_uang'],
            'status' => $po['status'],
            'kurs' => [
                'mode' => $po['kurs_mode'],
                'kurs_jastip' => (int) $po['kurs_jastip'],
                'kurs_pasar' => $kursPasar,
                'tanggal_kurs' => $po['kurs_tanggal'],
                'buffer_persen' => $po['kurs_buffer_bp'] === null
                    ? null
                    : DecimalFormatter::trimmed((int) $po['kurs_buffer_bp'], 2),
                'sumber' => $kursPasar === null ? null : KursService::SUMBER,
            ],
            'kurs_terkunci' => $po['kurs_terkunci_at'] !== null,
            'kurs_terkunci_pada' => Sql::isoOrNull($po['kurs_terkunci_at']),
            'dp_persen' => DecimalFormatter::trimmed((int) $po['dp_bp'], 2),
            'ringkasan' => $po['ringkasan'],
            'dibuat_pada' => Sql::isoOrNull($po['created_at']),
            'diubah_pada' => Sql::isoOrNull($po['updated_at']),
        ];
    }
}
