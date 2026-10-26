<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Domain;

use DomainException;
use Jastip\Domain\CartCalculator;
use Jastip\Domain\OrderLineAmount;
use Jastip\Domain\PaymentDeletionRule;
use Jastip\Domain\PaymentStatus;
use Jastip\Domain\RefundRule;
use Jastip\Domain\RefundViolation;
use PHPUnit\Framework\TestCase;

/**
 * Langkah QA 1–5 di scope-mvp.md, keranjang Barang A + B + C, DP 50%.
 */
final class CartCalculatorTest extends TestCase
{
    private const DP_BP = 5_000;

    /**
     * @return list<OrderLineAmount>
     */
    private static function linesAbc(bool $bKosong = false): array
    {
        return [
            new OrderLineAmount(718_000, false),
            new OrderLineAmount(384_000, $bKosong),
            new OrderLineAmount(1_833_000, false),
        ];
    }

    public function testLangkah1TotalDanDp(): void
    {
        $total = CartCalculator::total(self::linesAbc());

        self::assertSame(2_935_000, $total);
        // 2.935.000 × 50% = 1.467.500 → Rp1.468.000
        self::assertSame(1_468_000, CartCalculator::dp($total, self::DP_BP));

        $summary = CartCalculator::summarize($total, self::DP_BP, 0, 0);
        self::assertSame(PaymentStatus::BelumBayar, $summary->status);
        self::assertSame(2_935_000, $summary->sisa);
        self::assertSame(0, $summary->kelebihanBayar);
    }

    public function testLangkah2BayarDp(): void
    {
        $summary = CartCalculator::summarize(2_935_000, self::DP_BP, 1_468_000, 0);

        self::assertSame(PaymentStatus::Dp, $summary->status);
        self::assertSame(1_468_000, $summary->danaDiterima);
        self::assertSame(1_467_000, $summary->sisa);
    }

    public function testLangkah3Lunas(): void
    {
        $summary = CartCalculator::summarize(2_935_000, self::DP_BP, 1_468_000 + 1_467_000, 0);

        self::assertSame(PaymentStatus::Lunas, $summary->status);
        self::assertSame(0, $summary->sisa);
        self::assertSame(0, $summary->kelebihanBayar);
    }

    public function testLangkah4BarangBKosongJadiLebihBayar(): void
    {
        $total = CartCalculator::total(self::linesAbc(bKosong: true));
        $summary = CartCalculator::summarize($total, self::DP_BP, 2_935_000, 0);

        self::assertSame(2_551_000, $total);
        self::assertSame(1_276_000, $summary->dp);
        self::assertSame(PaymentStatus::LebihBayar, $summary->status);
        self::assertSame(384_000, $summary->kelebihanBayar);
        self::assertSame(0, $summary->sisa);
    }

    public function testLangkah5PengembalianDanaJadiLunas(): void
    {
        $sebelum = CartCalculator::summarize(2_551_000, self::DP_BP, 2_935_000, 0);
        self::assertNull(RefundRule::check($sebelum, 384_000));

        $sesudah = CartCalculator::summarize(2_551_000, self::DP_BP, 2_935_000, 384_000);
        self::assertSame(PaymentStatus::Lunas, $sesudah->status);
        self::assertSame(2_551_000, $sesudah->danaDiterima);
        self::assertSame(384_000, $sesudah->totalPengembalian);
        self::assertSame(0, $sesudah->sisa);
    }

    public function testKurangDp(): void
    {
        $summary = CartCalculator::summarize(2_935_000, self::DP_BP, 500_000, 0);

        self::assertSame(PaymentStatus::KurangDp, $summary->status);
        self::assertSame(2_435_000, $summary->sisa);
    }

    public function testTotalNolDanDanaNolAdalahLunas(): void
    {
        $summary = CartCalculator::summarize(0, self::DP_BP, 0, 0);

        self::assertSame(PaymentStatus::Lunas, $summary->status);
        self::assertSame(0, $summary->dp);
    }

    public function testSemuaBarangKosongSetelahBayarJadiLebihBayar(): void
    {
        $total = CartCalculator::total([new OrderLineAmount(718_000, true)]);
        $summary = CartCalculator::summarize($total, self::DP_BP, 300_000, 0);

        self::assertSame(0, $total);
        self::assertSame(PaymentStatus::LebihBayar, $summary->status);
        self::assertSame(300_000, $summary->kelebihanBayar);
    }

    public function testBatasDpTepat(): void
    {
        $tepatDp = CartCalculator::summarize(2_935_000, self::DP_BP, 1_468_000, 0);
        $kurangSeribu = CartCalculator::summarize(2_935_000, self::DP_BP, 1_467_000, 0);

        self::assertSame(PaymentStatus::Dp, $tepatDp->status);
        self::assertSame(PaymentStatus::KurangDp, $kurangSeribu->status);
    }

    public function testDpNolPersen(): void
    {
        self::assertSame(0, CartCalculator::dp(2_935_000, 0));
        self::assertSame(PaymentStatus::BelumBayar, CartCalculator::summarize(2_935_000, 0, 0, 0)->status);
        self::assertSame(PaymentStatus::Dp, CartCalculator::summarize(2_935_000, 0, 1_000, 0)->status);
    }

    public function testDpTidakOverflowUntukTotalBesar(): void
    {
        self::assertSame(4_611_686_018_427_388_000, CartCalculator::dp(9_223_372_036_854_775_000, self::DP_BP));
    }

    public function testDanaNegatifDitolak(): void
    {
        $this->expectException(DomainException::class);
        CartCalculator::summarize(100_000, self::DP_BP, 100_000, 200_000);
    }

    public function testPengembalianDanaHanyaSaatLebihBayar(): void
    {
        $dp = CartCalculator::summarize(2_935_000, self::DP_BP, 1_468_000, 0);

        self::assertSame(RefundViolation::BukanLebihBayar, RefundRule::check($dp, 1_000));
    }

    public function testPengembalianDanaMelebihiKelebihanBayar(): void
    {
        $lebih = CartCalculator::summarize(2_551_000, self::DP_BP, 2_935_000, 0);

        self::assertSame(RefundViolation::MelebihiKelebihanBayar, RefundRule::check($lebih, 385_000));
        self::assertSame(RefundViolation::NominalTidakPositif, RefundRule::check($lebih, 0));
        self::assertSame(
            'Nominal maksimal Rp384.000 (kelebihan bayar).',
            RefundRule::message(RefundViolation::MelebihiKelebihanBayar, $lebih),
        );
    }

    public function testHapusPembayaranDiblokirOlehPengembalianDana(): void
    {
        // Satu pembayaran Rp2.935.000, sudah ada pengembalian Rp384.000.
        // Kalau pembayaran dihapus, dana diterima = −Rp384.000 → ditolak.
        self::assertFalse(PaymentDeletionRule::canDelete(2_935_000, 384_000, 2_935_000));
        self::assertSame(
            'Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana Rp384.000. '
            . 'Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini.',
            PaymentDeletionRule::blockedMessage(384_000),
        );
    }

    public function testHapusPembayaranDiizinkanJikaDanaTidakNegatif(): void
    {
        // QA langkah 5: pembayaran 1.468.000 + 1.467.000, pengembalian 384.000.
        self::assertTrue(PaymentDeletionRule::canDelete(2_935_000, 384_000, 1_468_000));
        self::assertTrue(PaymentDeletionRule::canDelete(2_935_000, 0, 2_935_000));
        // Sisa pembayaran tepat sama dengan pengembalian: dana diterima = 0, boleh.
        self::assertTrue(PaymentDeletionRule::canDelete(684_000, 384_000, 300_000));

        // Setelah dihapus, status dihitung ulang dari angka baru.
        $sesudah = CartCalculator::summarize(2_551_000, self::DP_BP, 1_467_000, 384_000);
        self::assertSame(PaymentStatus::KurangDp, $sesudah->status);
    }
}
