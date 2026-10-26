<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Domain;

use Jastip\Domain\CartCalculator;
use Jastip\Domain\CartSummary;
use Jastip\Domain\RekapItem;
use Jastip\Domain\RekapWa;
use PHPUnit\Framework\TestCase;

/**
 * Contoh per status di ui-spec §9.6 (angka QA scope: Barang A + B + C, DP 50%).
 */
final class RekapWaTest extends TestCase
{
    private const HEADER = "*REKAP JASTIP - Open PO Australia Nov 2026*\n"
        . "Customer: Rina (081234567890)\n"
        . "\n";

    private const BARANG_ABC = "1. Barang A\n"
        . "   2 x Rp359.000 = Rp718.000\n"
        . "2. Barang B\n"
        . "   3 x Rp128.000 = Rp384.000\n"
        . "3. Barang C\n"
        . "   1 x Rp1.833.000 = Rp1.833.000\n"
        . "\n";

    private const BARANG_B_KOSONG = "1. Barang A\n"
        . "   2 x Rp359.000 = Rp718.000\n"
        . "2. Barang B (Kosong, tidak ditagih)\n"
        . "3. Barang C\n"
        . "   1 x Rp1.833.000 = Rp1.833.000\n"
        . "\n";

    /**
     * @return list<RekapItem>
     */
    private static function items(bool $bKosong = false): array
    {
        return [
            new RekapItem('Barang A', 2, 359_000, 718_000, false),
            new RekapItem('Barang B', 3, 128_000, 384_000, $bKosong),
            new RekapItem('Barang C', 1, 1_833_000, 1_833_000, false),
        ];
    }

    private static function rekap(CartSummary $summary, bool $bKosong = false): string
    {
        return RekapWa::text('Open PO Australia Nov 2026', 'Rina', '081234567890', self::items($bKosong), $summary);
    }

    public function testBelumBayar(): void
    {
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "*Mohon transfer DP: Rp1.468.000*\n"
            . 'Status: BELUM BAYAR',
            self::rekap(CartCalculator::summarize(2_935_000, 5_000, 0, 0)),
        );
    }

    public function testKurangDp(): void
    {
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "Sudah dibayar: Rp500.000\n"
            . "*Sisa pelunasan: Rp2.435.000*\n"
            . 'Status: KURANG DP',
            self::rekap(CartCalculator::summarize(2_935_000, 5_000, 500_000, 0)),
        );
    }

    public function testDp(): void
    {
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "Sudah dibayar: Rp1.468.000\n"
            . "*Sisa pelunasan: Rp1.467.000*\n"
            . 'Status: DP DITERIMA ✅',
            self::rekap(CartCalculator::summarize(2_935_000, 5_000, 1_468_000, 0)),
        );
    }

    public function testLunasTanpaPengembalian(): void
    {
        self::assertSame(
            self::HEADER . self::BARANG_ABC
            . "*Total: Rp2.935.000*\n"
            . "DP 50%: Rp1.468.000\n"
            . "Sudah dibayar: Rp2.935.000\n"
            . "*Sisa pelunasan: Rp0*\n"
            . 'Status: LUNAS ✅',
            self::rekap(CartCalculator::summarize(2_935_000, 5_000, 2_935_000, 0)),
        );
    }

    public function testLebihBayar(): void
    {
        self::assertSame(
            self::HEADER . self::BARANG_B_KOSONG
            . "*Total: Rp2.551.000*\n"
            . "DP 50%: Rp1.276.000\n"
            . "Sudah dibayar: Rp2.935.000\n"
            . "*Kelebihan bayar (akan dikembalikan): Rp384.000*\n"
            . 'Status: LEBIH BAYAR',
            self::rekap(CartCalculator::summarize(2_551_000, 5_000, 2_935_000, 0), bKosong: true),
        );
    }

    public function testLunasSetelahPengembalianDana(): void
    {
        self::assertSame(
            self::HEADER . self::BARANG_B_KOSONG
            . "*Total: Rp2.551.000*\n"
            . "DP 50%: Rp1.276.000\n"
            . "Sudah dibayar: Rp2.935.000\n"
            . "Dikembalikan: Rp384.000\n"
            . "*Sisa pelunasan: Rp0*\n"
            . 'Status: LUNAS ✅',
            self::rekap(CartCalculator::summarize(2_551_000, 5_000, 2_935_000, 384_000), bKosong: true),
        );
    }

    public function testPersenDesimalMemakaiKoma(): void
    {
        $text = RekapWa::text('PO', 'Rina', '081234567890', [
            new RekapItem('Barang A', 1, 100_000, 100_000, false),
        ], CartCalculator::summarize(100_000, 3_750, 0, 0));

        self::assertStringContainsString("\nDP 37,5%: Rp38.000\n", $text);
    }

    public function testKeranjangTanpaBarang(): void
    {
        self::assertSame(
            "*REKAP JASTIP - PO*\n"
            . "Customer: Rina (081234567890)\n"
            . "\n"
            . "*Total: Rp0*\n"
            . "DP 50%: Rp0\n"
            . "*Sisa pelunasan: Rp0*\n"
            . 'Status: LUNAS ✅',
            RekapWa::text('PO', 'Rina', '081234567890', [], CartCalculator::summarize(0, 5_000, 0, 0)),
        );
    }

    public function testNamaBerisiBarisBaruDijadikanSatuBaris(): void
    {
        $text = RekapWa::text(" PO\nNov ", "Rina \t Sari", '081234567890', [
            new RekapItem("Barang\r\nA ", 1, 1_000, 1_000, false),
        ], CartCalculator::summarize(1_000, 5_000, 0, 0));

        self::assertStringStartsWith("*REKAP JASTIP - PO Nov*\nCustomer: Rina Sari (081234567890)\n\n1. Barang A\n", $text);
        foreach (explode("\n", $text) as $line) {
            self::assertSame(rtrim($line), $line, 'Tidak boleh ada spasi di akhir baris');
            self::assertSame(0, substr_count($line, '*') % 2, 'Pasangan * harus di satu baris: ' . $line);
        }
    }
}
