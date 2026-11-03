<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\DecimalFormatter;
use Jastip\Domain\KursCalculator;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\Database;
use Jastip\Repository\OpenPoRepository;
use Jastip\Repository\SettingsRepository;

final class OpenPoService
{
    public function __construct(
        private readonly Database $db,
        private readonly OpenPoRepository $openPo,
        private readonly SettingsRepository $settings,
    ) {
    }

    /**
     * Status selalu "buka" saat dibuat. DP % dan buffer diambil dari pengaturan saat ini
     * lalu disimpan sebagai snapshot di PO.
     *
     * @return array<string, mixed>
     */
    public function create(string $nama, KursInput $kurs): array
    {
        $settings = $this->settings->get();
        $id = $this->openPo->insert(['nama' => $nama, 'dp_bp' => $settings['dp_bp']]
            + $this->kursColumns($kurs, $settings['buffer_aud_bp']));

        return $this->get($id);
    }

    /**
     * @return array<string, mixed>
     */
    public function get(int $id): array
    {
        $row = $this->openPo->find($id) ?? throw HttpError::notFound('Open PO tidak ditemukan.');

        return $row + ['ringkasan' => $this->openPo->ringkasan([$id])[$id]];
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int, per_status: array{buka: int, selesai: int}}
     */
    public function list(?string $status, int $limit, int $offset): array
    {
        $rows = $this->openPo->list($status, $limit, $offset);
        $ringkasan = $this->openPo->ringkasan(array_map(static fn (array $r): int => (int) $r['id'], $rows));
        $perStatus = $this->openPo->countByStatus();

        return [
            'items' => array_map(static fn (array $r): array => $r + ['ringkasan' => $ringkasan[(int) $r['id']]], $rows),
            'total' => $status === null ? $perStatus['buka'] + $perStatus['selesai'] : $perStatus[$status],
            'per_status' => $perStatus,
        ];
    }

    /**
     * Mengubah kurs ditolak 409 jika kurs sudah terkunci. Baris PO dikunci
     * (SELECT ... FOR UPDATE) supaya tidak balapan dengan penyimpanan baris pesanan pertama.
     *
     * @return array<string, mixed>
     */
    public function update(int $id, ?string $nama, ?string $status, ?KursInput $kurs): array
    {
        $this->db->transaction(function () use ($id, $nama, $status, $kurs): void {
            $row = $this->openPo->findForUpdate($id) ?? throw HttpError::notFound('Open PO tidak ditemukan.');

            $changes = [];
            if ($kurs !== null) {
                if ($row['kurs_terkunci_at'] !== null) {
                    throw HttpError::conflict(
                        'KURS_TERKUNCI',
                        'Kurs sudah terkunci karena ada pesanan. Data kurs terbaru sudah dimuat.',
                    );
                }
                $changes = $this->kursColumns($kurs, $this->settings->get()['buffer_aud_bp']);
            }
            if ($nama !== null) {
                $changes['nama'] = $nama;
            }
            if ($status !== null) {
                $changes['status'] = $status;
            }
            $this->openPo->update($id, $changes);
        });

        return $this->get($id);
    }

    /**
     * @return array{kurs_mode: string, kurs_pasar: ?string, kurs_tanggal: ?string, kurs_buffer_bp: ?int, kurs_jastip: int}
     */
    private function kursColumns(KursInput $kurs, int $bufferBp): array
    {
        $kursPasar = $kurs->kursPasarMikro === null
            ? null
            : DecimalFormatter::fixed($kurs->kursPasarMikro, KursCalculator::PASAR_SCALE);

        if ($kurs->mode === 'otomatis') {
            return [
                'kurs_mode' => 'otomatis',
                'kurs_pasar' => $kursPasar,
                'kurs_tanggal' => $kurs->tanggalKurs,
                'kurs_buffer_bp' => $bufferBp,
                'kurs_jastip' => KursCalculator::kursJastip((int) $kurs->kursPasarMikro, $bufferBp),
            ];
        }

        return [
            'kurs_mode' => 'manual',
            'kurs_pasar' => $kursPasar,
            'kurs_tanggal' => $kurs->tanggalKurs,
            'kurs_buffer_bp' => null,
            'kurs_jastip' => (int) $kurs->kursJastipManual,
        ];
    }
}
