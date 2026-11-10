<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\CartSummary;
use Jastip\Http\HttpError;
use Jastip\Repository\CustomerRepository;
use Jastip\Repository\KeranjangRepository;
use Jastip\Repository\OpenPoRepository;

/**
 * Penguncian bersama untuk semua transaksi yang mengubah keranjang.
 *
 * Aturan:
 * - Urutan kunci selalu open_po → customer → keranjang → baris anak (baris pesanan,
 *   pembayaran, pengembalian dana), supaya tidak ada deadlock antar-request.
 * - Setiap perubahan isi keranjang memegang kunci X baris keranjang sampai commit,
 *   jadi perubahan pada satu keranjang berjalan berurutan.
 * - Di dalam transaksi tulis hanya ada locking read (FOR UPDATE / LOCK IN SHARE MODE),
 *   tidak ada consistent read sebelum kunci diambil. Validasi uang selalu memakai data
 *   terbaru yang sudah di-commit, juga di MariaDB dengan innodb_snapshot_isolation=ON.
 *
 * Semua method harus dipanggil di dalam transaksi.
 */
final class KeranjangLocks
{
    public function __construct(
        private readonly OpenPoRepository $openPo,
        private readonly CustomerRepository $customers,
        private readonly KeranjangRepository $keranjang,
    ) {
    }

    /**
     * $exclusive = true (tambah barang): FOR UPDATE, karena kurs_terkunci_at bisa diisi.
     * $exclusive = false (pembayaran): LOCK IN SHARE MODE, cukup untuk insert keranjang baru.
     *
     * @return array<string, mixed>
     */
    public function lockOpenPo(int $id, bool $exclusive): array
    {
        $row = $exclusive ? $this->openPo->findForUpdate($id) : $this->openPo->findForShare($id);

        return $row ?? throw HttpError::notFound('Open PO tidak ditemukan.');
    }

    /**
     * Mengunci customer lalu keranjang, dan membuat keranjang jika belum ada
     * (ui-spec §13 P1). Customer yang diarsipkan hanya boleh memakai keranjang lamanya.
     *
     * @return int ID keranjang (terkunci X sampai commit)
     */
    public function openCart(int $openPoId, int $customerId): int
    {
        $customer = $this->customers->lock($customerId) ?? throw HttpError::notFound('Customer tidak ditemukan.');
        $cart = $this->keranjang->find($openPoId, $customerId, forUpdate: true);
        if ($cart !== null) {
            return (int) $cart['id'];
        }
        if ($customer['diarsipkan_at'] !== null) {
            throw HttpError::conflict('CUSTOMER_DIARSIPKAN', 'Customer ini sudah diarsipkan.');
        }

        return $this->keranjang->insert($openPoId, $customerId);
    }

    /**
     * @return array<string, mixed> baris keranjang (open_po_id, customer_id)
     */
    public function lockCart(int $id): array
    {
        // Keranjang tidak pernah dihapus selama masih punya baris anak (FK RESTRICT),
        // jadi kalau anak ditemukan, keranjangnya pasti ada.
        return $this->keranjang->lock($id) ?? throw HttpError::notFound('Keranjang tidak ditemukan.');
    }

    /**
     * Ringkasan dari data terbaru, dengan kunci pada semua baris anak keranjang.
     */
    public function lockedSummary(int $keranjangId, int $dpBp): CartSummary
    {
        return CartState::summarize(
            $this->keranjang->lines($keranjangId, forUpdate: true),
            $this->keranjang->payments($keranjangId, forUpdate: true),
            $this->keranjang->refunds($keranjangId, forUpdate: true),
            $dpBp,
        );
    }

    /**
     * @return array{pembayaran: int, pengembalian: int}
     */
    public function lockedMoneyTotals(int $keranjangId): array
    {
        return [
            'pembayaran' => CartState::sum($this->keranjang->payments($keranjangId, forUpdate: true)),
            'pengembalian' => CartState::sum($this->keranjang->refunds($keranjangId, forUpdate: true)),
        ];
    }
}
