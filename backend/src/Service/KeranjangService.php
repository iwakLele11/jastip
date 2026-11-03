<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\CartCalculator;
use Jastip\Domain\CartSummary;
use Jastip\Domain\OrderLineAmount;
use Jastip\Domain\PaymentDeletionRule;
use Jastip\Domain\PaymentStatus;
use Jastip\Domain\RekapItem;
use Jastip\Domain\RekapWa;
use Jastip\Domain\WhatsAppNumber;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\Database;
use Jastip\Repository\CustomerRepository;
use Jastip\Repository\KeranjangRepository;
use Jastip\Repository\OpenPoRepository;

/**
 * Sisi baca keranjang: objek keranjang lengkap, daftar customer per PO, barang unik,
 * dan teks rekap WA. Setiap pembacaan berjalan di satu transaksi supaya semua query
 * melihat snapshot yang sama (ringkasan cocok dengan daftar barang dan riwayat).
 */
final class KeranjangService
{
    public const MAX_BARANG_UNIK = 1_000;

    public function __construct(
        private readonly Database $db,
        private readonly OpenPoRepository $openPo,
        private readonly CustomerRepository $customers,
        private readonly KeranjangRepository $keranjang,
    ) {
    }

    /**
     * Keranjang yang belum ada tetap dikembalikan dengan angka nol (kontrak §10).
     *
     * @return array{open_po: array<string, mixed>, customer: array<string, mixed>, summary: CartSummary,
     *               barang: list<array<string, mixed>>, riwayat: list<array<string, mixed>>}
     */
    public function get(int $openPoId, int $customerId): array
    {
        return $this->db->transaction(function () use ($openPoId, $customerId): array {
            $po = $this->openPo->find($openPoId) ?? throw HttpError::notFound('Open PO tidak ditemukan.');
            $customer = $this->customers->find($customerId) ?? throw HttpError::notFound('Customer tidak ditemukan.');
            $cart = $this->keranjang->find($openPoId, $customerId);

            $lines = $cart === null ? [] : $this->keranjang->lines((int) $cart['id']);
            $payments = $cart === null ? [] : $this->keranjang->payments((int) $cart['id']);
            $refunds = $cart === null ? [] : $this->keranjang->refunds((int) $cart['id']);
            $summary = CartState::summarize($lines, $payments, $refunds, (int) $po['dp_bp']);

            return [
                'open_po' => $po,
                'customer' => $customer,
                'summary' => $summary,
                'barang' => $lines,
                'riwayat' => self::history($payments, $refunds, $summary),
            ];
        });
    }

    public function rekap(int $openPoId, int $customerId): string
    {
        $cart = $this->get($openPoId, $customerId);
        $items = array_map(static fn (array $line): RekapItem => new RekapItem(
            (string) $line['nama_barang'],
            (int) $line['qty'],
            (int) $line['harga_jual_unit'],
            (int) $line['subtotal'],
            (bool) $line['kosong'],
        ), $cart['barang']);

        return RekapWa::text(
            (string) $cart['open_po']['nama'],
            (string) $cart['customer']['nama'],
            WhatsAppNumber::fromCanonical((string) $cart['customer']['no_wa'])->display(),
            $items,
            $cart['summary'],
        );
    }

    /**
     * Keranjang berisi di satu PO, urut nama customer A–Z. Status dihitung oleh
     * CartCalculator, lalu difilter dan dipaginasi di PHP; jumlah_per_status selalu
     * dari semua keranjang berisi.
     *
     * @return array{items: list<array{row: array<string, mixed>, summary: CartSummary}>, total: int,
     *               per_status: array<string, int>}
     */
    public function listForOpenPo(int $openPoId, ?PaymentStatus $filter, int $limit, int $offset): array
    {
        return $this->db->transaction(function () use ($openPoId, $filter, $limit, $offset): array {
            $po = $this->openPo->find($openPoId) ?? throw HttpError::notFound('Open PO tidak ditemukan.');
            $carts = $this->keranjang->filledInOpenPo($openPoId);

            $amounts = [];
            foreach ($this->keranjang->lineAmountsInOpenPo($openPoId) as $line) {
                $amounts[(int) $line['keranjang_id']][] = new OrderLineAmount((int) $line['subtotal'], (bool) $line['kosong']);
            }
            $money = $this->keranjang->moneyTotalsInOpenPo($openPoId);

            $perStatus = ['semua' => 0];
            foreach (PaymentStatus::cases() as $status) {
                $perStatus[$status->value] = 0;
            }
            $items = [];
            foreach ($carts as $cart) {
                $id = (int) $cart['keranjang_id'];
                $summary = CartCalculator::summarize(
                    CartCalculator::total($amounts[$id] ?? []),
                    (int) $po['dp_bp'],
                    $money[$id]['pembayaran'] ?? 0,
                    $money[$id]['pengembalian'] ?? 0,
                );
                $perStatus['semua']++;
                $perStatus[$summary->status->value]++;
                if ($filter === null || $summary->status === $filter) {
                    $items[] = ['row' => $cart, 'summary' => $summary];
                }
            }

            return [
                'items' => array_slice($items, $offset, $limit),
                'total' => count($items),
                'per_status' => $perStatus,
            ];
        });
    }

    /**
     * @return list<array{nama_barang: string, harga_aud_sen: int}>
     */
    public function barangUnik(int $openPoId): array
    {
        return $this->db->transaction(function () use ($openPoId): array {
            $this->openPo->find($openPoId) ?? throw HttpError::notFound('Open PO tidak ditemukan.');

            return $this->keranjang->uniqueItems($openPoId, self::MAX_BARANG_UNIK);
        });
    }

    /**
     * Pembayaran + pengembalian dana, terbaru di atas: tanggal, lalu waktu dicatat, lalu ID.
     * bisa_dihapus untuk pembayaran mengikuti PaymentDeletionRule; pengembalian dana selalu bisa.
     *
     * @param list<array<string, mixed>> $payments
     * @param list<array<string, mixed>> $refunds
     * @return list<array<string, mixed>>
     */
    private static function history(array $payments, array $refunds, CartSummary $summary): array
    {
        $entries = [];
        foreach ($payments as $p) {
            $entries[] = [
                'jenis' => 'pembayaran',
                'id' => (int) $p['id'],
                'nominal' => (int) $p['nominal'],
                'tanggal' => (string) $p['tanggal'],
                'catatan' => null,
                'bisa_dihapus' => PaymentDeletionRule::canDelete(
                    $summary->totalPembayaran,
                    $summary->totalPengembalian,
                    (int) $p['nominal'],
                ),
                'created_at' => (string) $p['created_at'],
            ];
        }
        foreach ($refunds as $r) {
            $entries[] = [
                'jenis' => 'pengembalian_dana',
                'id' => (int) $r['id'],
                'nominal' => (int) $r['nominal'],
                'tanggal' => (string) $r['tanggal'],
                'catatan' => $r['catatan'],
                'bisa_dihapus' => true,
                'created_at' => (string) $r['created_at'],
            ];
        }

        // Semua kunci menurun. Kalau tanggal dan waktu dicatat sama persis, "pengembalian_dana"
        // (biasanya dicatat setelah pembayaran) ada di atas "pembayaran".
        usort($entries, static fn (array $a, array $b): int => [$b['tanggal'], $b['created_at'], $b['jenis'], $b['id']]
            <=> [$a['tanggal'], $a['created_at'], $a['jenis'], $a['id']]);

        return $entries;
    }
}
