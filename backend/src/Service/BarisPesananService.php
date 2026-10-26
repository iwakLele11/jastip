<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\Pricing;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\Clock;
use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\Logger;
use Jastip\Repository\BarisPesananRepository;
use Jastip\Repository\OpenPoRepository;

/**
 * Tambah, ubah, hapus, dan tandai Kosong baris pesanan. Setiap aksi mengembalikan
 * objek keranjang lengkap yang dibaca ulang setelah commit.
 */
final class BarisPesananService
{
    private const NOT_FOUND = 'Barang tidak ditemukan.';

    public function __construct(
        private readonly Database $db,
        private readonly OpenPoRepository $openPo,
        private readonly BarisPesananRepository $lines,
        private readonly KeranjangLocks $locks,
        private readonly KeranjangService $keranjang,
        private readonly Clock $clock,
        private readonly Logger $logger,
    ) {
    }

    /**
     * Satu transaksi (kontrak §10):
     * 1. SELECT … FOR UPDATE baris Open PO,
     * 2. isi kurs_terkunci_at jika masih kosong (kurs terkunci permanen),
     * 3. kunci customer + keranjang, buat keranjang jika belum ada (409 untuk customer arsip),
     * 4. hitung harga dengan kurs_jastip PO dan simpan snapshot baris.
     * Kalau salah satu langkah gagal, semuanya dibatalkan, termasuk penguncian kurs.
     *
     * @return array{keranjang: array<string, mixed>, id: int}
     */
    public function create(int $openPoId, int $customerId, string $nama, int $hargaSen, int $qty, int $markupBp): array
    {
        $id = $this->db->transaction(function () use ($openPoId, $customerId, $nama, $hargaSen, $qty, $markupBp): int {
            $po = $this->locks->lockOpenPo($openPoId, exclusive: true);
            if ($po['kurs_terkunci_at'] === null) {
                $this->openPo->lockKurs($openPoId, $this->clock->now());
            }
            $keranjangId = $this->locks->openCart($openPoId, $customerId);

            $kurs = (int) $po['kurs_jastip'];
            $unit = Pricing::hargaJualUnit($hargaSen, $kurs, $markupBp);

            return $this->lines->insert($keranjangId, [
                'nama_barang' => $nama,
                'harga_aud_sen' => $hargaSen,
                'qty' => $qty,
                'markup_bp' => $markupBp,
                'kurs_jastip' => $kurs,
                'harga_jual_unit' => $unit,
                'subtotal' => Pricing::subtotal($unit, $qty),
            ]);
        });

        return ['keranjang' => $this->keranjang->get($openPoId, $customerId), 'id' => $id];
    }

    /**
     * Harga dihitung ulang dengan kurs_jastip snapshot baris itu. Baris Kosong tetap bisa diubah.
     *
     * @param array{nama_barang?: string, harga_aud_sen?: int, qty?: int, markup_bp?: int} $changes
     * @return array<string, mixed> objek keranjang
     */
    public function update(int $id, array $changes): array
    {
        $cart = $this->mutate($id, function (array $line) use ($id, $changes): void {
            $hargaSen = $changes['harga_aud_sen'] ?? (int) $line['harga_aud_sen'];
            $qty = $changes['qty'] ?? (int) $line['qty'];
            $markupBp = $changes['markup_bp'] ?? (int) $line['markup_bp'];
            $unit = Pricing::hargaJualUnit($hargaSen, (int) $line['kurs_jastip'], $markupBp);

            $this->lines->update($id, $changes + [
                'harga_jual_unit' => $unit,
                'subtotal' => Pricing::subtotal($unit, $qty),
            ]);
        });

        return $this->view($cart);
    }

    /**
     * Hapus permanen (hanya untuk salah input). Kurs PO tetap terkunci.
     *
     * @return array<string, mixed> objek keranjang
     */
    public function delete(int $id): array
    {
        $cart = $this->mutate($id, function () use ($id): void {
            $this->lines->delete($id);
        });
        $this->logger->info('baris_pesanan_dihapus', ['baris_pesanan_id' => $id, 'keranjang_id' => (int) $cart['id']]);

        return $this->view($cart);
    }

    /**
     * Idempoten: menandai baris yang sudah Kosong (atau melepas yang belum) tidak mengubah apa pun.
     *
     * @return array<string, mixed> objek keranjang
     */
    public function setKosong(int $id, bool $kosong): array
    {
        $cart = $this->mutate($id, function (array $line) use ($id, $kosong): void {
            if ((bool) $line['kosong'] !== $kosong) {
                $this->lines->setKosong($id, $kosong);
            }
        });

        return $this->view($cart);
    }

    /**
     * Kunci keranjang pemilik baris dulu, lalu baris itu sendiri (urutan kunci KeranjangLocks).
     *
     * @param callable(array<string, mixed>): void $change
     * @return array<string, mixed> baris keranjang yang diubah (sudah di-commit)
     */
    private function mutate(int $id, callable $change): array
    {
        // Dibaca di luar transaksi: hanya untuk tahu keranjang mana yang dikunci.
        $keranjangId = $this->lines->keranjangIdOf($id) ?? throw HttpError::notFound(self::NOT_FOUND);

        return $this->db->transaction(function () use ($id, $keranjangId, $change): array {
            $cart = $this->locks->lockCart($keranjangId);
            $line = $this->lines->findForUpdate($id);
            if ($line === null || (int) $line['keranjang_id'] !== $keranjangId) {
                throw HttpError::notFound(self::NOT_FOUND);
            }
            $change($line);

            return $cart;
        });
    }

    /**
     * @param array<string, mixed> $cart
     * @return array<string, mixed>
     */
    private function view(array $cart): array
    {
        return $this->keranjang->get((int) $cart['open_po_id'], (int) $cart['customer_id']);
    }
}
