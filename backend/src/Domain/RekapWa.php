<?php

declare(strict_types=1);

namespace Jastip\Domain;

/**
 * Teks rekap WA per customer per Open PO, persis ui-spec §9.6:
 *
 *   *REKAP JASTIP - {nama Open PO}*
 *   Customer: {nama} ({no WA})
 *
 *   {n}. {nama barang}
 *      {qty} x {harga/unit} = {subtotal}
 *   {n}. {nama barang} (Kosong, tidak ditagih)
 *
 *   *Total: {total}*
 *   DP {dp%}: {dp}
 *   [Sudah dibayar: …]   jika ada pembayaran atau pengembalian dana
 *   [Dikembalikan: …]    jika ada pengembalian dana
 *   *{baris penentu}*
 *   Status: {STATUS}
 *
 * Tanpa harga AUD, kurs, atau markup. Baris baru "\n", tanpa spasi di akhir baris.
 * Nama (PO, customer, barang) dirapikan menjadi satu baris supaya setiap pasangan "*"
 * tetap di satu baris.
 */
final class RekapWa
{
    private const INDENT = '   ';

    /**
     * @param list<RekapItem> $items
     */
    public static function text(
        string $namaOpenPo,
        string $namaCustomer,
        string $noWaTampil,
        array $items,
        CartSummary $summary,
    ): string {
        $lines = [
            '*REKAP JASTIP - ' . self::singleLine($namaOpenPo) . '*',
            'Customer: ' . self::singleLine($namaCustomer) . ' (' . $noWaTampil . ')',
            '',
        ];

        foreach ($items as $i => $item) {
            $nomor = ($i + 1) . '. ' . self::singleLine($item->namaBarang);
            if ($item->kosong) {
                $lines[] = $nomor . ' (Kosong, tidak ditagih)';
                continue;
            }
            $lines[] = $nomor;
            $lines[] = sprintf(
                '%s%d x %s = %s',
                self::INDENT,
                $item->qty,
                Rupiah::format($item->hargaJualUnit),
                Rupiah::format($item->subtotal),
            );
        }
        if ($items !== []) {
            $lines[] = '';
        }

        $lines[] = '*Total: ' . Rupiah::format($summary->total) . '*';
        $lines[] = sprintf('DP %s%%: %s', self::persen($summary->dpBp), Rupiah::format($summary->dp));
        if ($summary->totalPembayaran > 0 || $summary->totalPengembalian > 0) {
            $lines[] = 'Sudah dibayar: ' . Rupiah::format($summary->totalPembayaran);
        }
        if ($summary->totalPengembalian > 0) {
            $lines[] = 'Dikembalikan: ' . Rupiah::format($summary->totalPengembalian);
        }
        $lines[] = '*' . self::penentu($summary) . '*';
        $lines[] = 'Status: ' . $summary->status->rekapLabel();

        return implode("\n", $lines);
    }

    private static function penentu(CartSummary $summary): string
    {
        return match ($summary->status) {
            PaymentStatus::BelumBayar => 'Mohon transfer DP: ' . Rupiah::format($summary->dp),
            PaymentStatus::KurangDp, PaymentStatus::Dp, PaymentStatus::Lunas
                => 'Sisa pelunasan: ' . Rupiah::format($summary->sisa),
            PaymentStatus::LebihBayar
                => 'Kelebihan bayar (akan dikembalikan): ' . Rupiah::format($summary->kelebihanBayar),
        };
    }

    /** Persen dengan koma desimal (ui-spec §10): 5000 bp → "50", 3750 bp → "37,5". */
    private static function persen(int $bp): string
    {
        return str_replace('.', ',', DecimalFormatter::trimmed($bp, 2));
    }

    /** Spasi, tab, dan baris baru di dalam nama diringkas menjadi satu spasi. */
    private static function singleLine(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $value));
    }
}
