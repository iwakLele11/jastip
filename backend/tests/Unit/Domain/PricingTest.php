<?php

declare(strict_types=1);

namespace Jastip\Tests\Unit\Domain;

use InvalidArgumentException;
use Jastip\Domain\DecimalParser;
use Jastip\Domain\KursCalculator;
use Jastip\Domain\Pricing;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PricingTest extends TestCase
{
    public function testKursJastipContohScope(): void
    {
        // 12.673 × 1,03 = 13.053,19 → Rp13.054
        $kursPasar = DecimalParser::parse('12673', KursCalculator::PASAR_SCALE);

        self::assertSame(13_054, KursCalculator::kursJastip($kursPasar, 300));
    }

    public function testKursJastipTepatBulatTidakNaik(): void
    {
        // 10.000 × 1,03 = 10.300 tepat → tetap 10.300
        self::assertSame(10_300, KursCalculator::kursJastip(10_000_000_000, 300));
        self::assertSame(12_673, KursCalculator::kursJastip(12_673_000_000, 0));
    }

    public function testKursJastipDariKursPasarDesimal(): void
    {
        // 12.673,45 × 1,035 = 13.117,02075 → Rp13.118
        self::assertSame(13_118, KursCalculator::kursJastip(12_673_450_000, 350));
    }

    /**
     * Tabel "Contoh hitungan (acuan test QA)" di scope-mvp.md.
     *
     * @return array<string, array{string, string, int, int, int}>
     */
    public static function contohQa(): array
    {
        return [
            'Barang A' => ['24,95', '10', 2, 359_000, 718_000],
            'Barang B' => ['8,50', '15', 3, 128_000, 384_000],
            'Barang C' => ['129,99', '8', 1, 1_833_000, 1_833_000],
        ];
    }

    #[DataProvider('contohQa')]
    public function testContohQaScope(string $hargaAud, string $markup, int $qty, int $unit, int $subtotal): void
    {
        $hargaSen = DecimalParser::parse($hargaAud, 2);
        $markupBp = DecimalParser::parse($markup, 2);

        $hargaJualUnit = Pricing::hargaJualUnit($hargaSen, 13_054, $markupBp);

        self::assertSame($unit, $hargaJualUnit);
        self::assertSame($subtotal, Pricing::subtotal($hargaJualUnit, $qty));
    }

    public function testHasilTepatKelipatanSeribuTidakNaik(): void
    {
        // AUD 35,90 × Rp10.000 × (1 + 0%) = Rp359.000,00 tepat
        self::assertSame(359_000, Pricing::hargaJualUnit(3_590, 10_000, 0));
    }

    /**
     * Hasil mentah sedikit di atas kelipatan Rp1.000, tetapi setelah dibulatkan
     * 2 desimal menjadi tepat kelipatan, jadi tidak boleh naik ke ribuan berikutnya.
     *
     * @return array<string, array{int, int, int, int}>
     */
    public static function pembulatanDuaDesimalDulu(): array
    {
        return [
            // 3,02 × 13.054 × 1,04 = 41.000,0032 → 41.000,00 → Rp41.000
            'AUD 3,02 markup 4%' => [302, 13_054, 400, 41_000],
            // 56,66 × 13.054 × 1,11 = 821.000,0004 → 821.000,00 → Rp821.000
            'AUD 56,66 markup 11%' => [5_666, 13_054, 1_100, 821_000],
            // 189,41 × 13.054 × 1,075 = 2.658.000,0005 → 2.658.000,00 → Rp2.658.000
            'AUD 189,41 markup 7,5%' => [18_941, 13_054, 750, 2_658_000],
        ];
    }

    #[DataProvider('pembulatanDuaDesimalDulu')]
    public function testPembulatanDuaDesimalSebelumKeRibuan(int $hargaSen, int $kurs, int $markupBp, int $unit): void
    {
        self::assertSame($unit, Pricing::hargaJualUnit($hargaSen, $kurs, $markupBp));
    }

    public function testPembulatanHalfUp(): void
    {
        // 0,50 × 13.054 × 1,005 = 6.559,635 → 6.559,64 (half-up) → Rp7.000
        self::assertSame(7_000, Pricing::hargaJualUnit(50, 13_054, 50));
    }

    public function testMenolakNilaiDiLuarRentang(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Pricing::hargaJualUnit(0, 13_054, 1_000);
    }

    public function testNilaiMaksimumTidakOverflow(): void
    {
        $unit = Pricing::hargaJualUnit(Pricing::MAX_HARGA_SEN, Pricing::MAX_KURS, Pricing::MAX_MARKUP_BP);

        self::assertSame(200_000_000_000, $unit);
        self::assertSame(199_800_000_000_000, Pricing::subtotal($unit, Pricing::MAX_QTY));
    }
}
