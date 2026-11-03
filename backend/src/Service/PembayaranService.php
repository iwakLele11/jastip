<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\CartCalculator;
use Jastip\Domain\PaymentDeletionRule;
use Jastip\Domain\RefundRule;
use Jastip\Domain\RefundViolation;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\Logger;
use Jastip\Repository\CustomerRepository;
use Jastip\Repository\KeranjangRepository;
use Jastip\Repository\OpenPoRepository;
use Jastip\Repository\PembayaranRepository;

/**
 * Catat dan hapus pembayaran serta pengembalian dana. Aturan uang (RefundRule,
 * PaymentDeletionRule) dicek di dalam transaksi setelah keranjang dikunci, dengan
 * angka terbaru dari locking read, jadi dua request bersamaan tidak bisa membuat
 * dana diterima negatif atau pengembalian dana melebihi kelebihan bayar.
 */
final class PembayaranService
{
    public function __construct(
        private readonly Database $db,
        private readonly OpenPoRepository $openPo,
        private readonly CustomerRepository $customers,
        private readonly KeranjangRepository $keranjangRepo,
        private readonly PembayaranRepository $payments,
        private readonly KeranjangLocks $locks,
        private readonly KeranjangService $keranjang,
        private readonly Logger $logger,
    ) {
    }

    /**
     * Membuat keranjang jika belum ada (customer arsip → 409 CUSTOMER_DIARSIPKAN).
     *
     * @return array{keranjang: array<string, mixed>, id: int}
     */
    public function addPayment(int $openPoId, int $customerId, int $nominal, string $tanggal): array
    {
        $id = $this->db->transaction(function () use ($openPoId, $customerId, $nominal, $tanggal): int {
            $this->locks->lockOpenPo($openPoId, exclusive: false);
            $keranjangId = $this->locks->openCart($openPoId, $customerId);

            return $this->payments->insertPayment($keranjangId, $nominal, $tanggal);
        });

        return ['keranjang' => $this->keranjang->get($openPoId, $customerId), 'id' => $id];
    }

    /**
     * Ditolak 409 HAPUS_PENGEMBALIAN_DULU jika Σ pembayaran − nominal < Σ pengembalian dana.
     *
     * @return array<string, mixed> objek keranjang
     */
    public function deletePayment(int $id): array
    {
        $table = PembayaranRepository::PEMBAYARAN;
        $keranjangId = $this->payments->keranjangIdOf($table, $id)
            ?? throw HttpError::notFound('Pembayaran tidak ditemukan.');

        [$cart, $nominal] = $this->db->transaction(function () use ($table, $id, $keranjangId): array {
            $cart = $this->locks->lockCart($keranjangId);
            $payment = $this->payments->findForUpdate($table, $id);
            if ($payment === null || (int) $payment['keranjang_id'] !== $keranjangId) {
                throw HttpError::notFound('Pembayaran tidak ditemukan.');
            }
            $totals = $this->locks->lockedMoneyTotals($keranjangId);
            if (!PaymentDeletionRule::canDelete($totals['pembayaran'], $totals['pengembalian'], (int) $payment['nominal'])) {
                throw HttpError::conflict(
                    'HAPUS_PENGEMBALIAN_DULU',
                    PaymentDeletionRule::blockedMessage($totals['pengembalian']),
                );
            }
            $this->payments->delete($table, $id);

            return [$cart, (int) $payment['nominal']];
        });
        $this->logger->info('pembayaran_dihapus', [
            'pembayaran_id' => $id,
            'nominal' => $nominal,
            'keranjang_id' => $keranjangId,
        ]);

        return $this->keranjang->get((int) $cart['open_po_id'], (int) $cart['customer_id']);
    }

    /**
     * Hanya saat status Lebih bayar (409 PENGEMBALIAN_TIDAK_AKTIF), nominal ≤ kelebihan bayar
     * (422, field nominal). Tidak pernah membuat keranjang baru: tanpa keranjang statusnya Lunas.
     *
     * @return array{keranjang: array<string, mixed>, id: int}
     */
    public function addRefund(int $openPoId, int $customerId, int $nominal, string $tanggal, ?string $catatan): array
    {
        // Cek keberadaan di luar transaksi, supaya transaksi tulis hanya berisi locking read.
        $po = $this->openPo->find($openPoId) ?? throw HttpError::notFound('Open PO tidak ditemukan.');
        $this->customers->find($customerId) ?? throw HttpError::notFound('Customer tidak ditemukan.');
        $dpBp = (int) $po['dp_bp'];

        $id = $this->db->transaction(function () use ($openPoId, $customerId, $nominal, $tanggal, $catatan, $dpBp): int {
            $cart = $this->keranjangRepo->find($openPoId, $customerId, forUpdate: true);
            $summary = $cart === null
                ? CartCalculator::summarize(0, $dpBp, 0, 0)
                : $this->locks->lockedSummary((int) $cart['id'], $dpBp);

            $violation = RefundRule::check($summary, $nominal);
            if ($violation === RefundViolation::BukanLebihBayar) {
                throw HttpError::conflict('PENGEMBALIAN_TIDAK_AKTIF', RefundRule::message($violation, $summary));
            }
            if ($violation !== null) {
                throw HttpError::validation(['nominal' => RefundRule::message($violation, $summary)]);
            }
            assert($cart !== null);

            return $this->payments->insertRefund((int) $cart['id'], $nominal, $tanggal, $catatan);
        });

        return ['keranjang' => $this->keranjang->get($openPoId, $customerId), 'id' => $id];
    }

    /**
     * Selalu diizinkan. Status bisa kembali ke Lebih bayar.
     *
     * @return array<string, mixed> objek keranjang
     */
    public function deleteRefund(int $id): array
    {
        $table = PembayaranRepository::PENGEMBALIAN_DANA;
        $keranjangId = $this->payments->keranjangIdOf($table, $id)
            ?? throw HttpError::notFound('Pengembalian dana tidak ditemukan.');

        [$cart, $nominal] = $this->db->transaction(function () use ($table, $id, $keranjangId): array {
            $cart = $this->locks->lockCart($keranjangId);
            $refund = $this->payments->findForUpdate($table, $id);
            if ($refund === null || (int) $refund['keranjang_id'] !== $keranjangId) {
                throw HttpError::notFound('Pengembalian dana tidak ditemukan.');
            }
            $this->payments->delete($table, $id);

            return [$cart, (int) $refund['nominal']];
        });
        $this->logger->info('pengembalian_dana_dihapus', [
            'pengembalian_dana_id' => $id,
            'nominal' => $nominal,
            'keranjang_id' => $keranjangId,
        ]);

        return $this->keranjang->get((int) $cart['open_po_id'], (int) $cart['customer_id']);
    }
}
