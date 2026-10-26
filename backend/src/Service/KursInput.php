<?php

declare(strict_types=1);

namespace Jastip\Service;

/**
 * Kurs yang dikirim klien saat membuat/mengubah Open PO, sudah lolos validasi format.
 *
 * - otomatis: kurs pasar + tanggal dari pratinjau GET /kurs/aud-idr; server menghitung
 *   ulang kurs jastip dengan buffer pengaturan saat ini.
 * - manual: kurs jastip final dari admin, tanpa buffer; kurs pasar opsional sebagai pembanding.
 */
final class KursInput
{
    public function __construct(
        public readonly string $mode,
        public readonly ?int $kursPasarMikro,
        public readonly ?string $tanggalKurs,
        public readonly ?int $kursJastipManual,
    ) {
    }
}
