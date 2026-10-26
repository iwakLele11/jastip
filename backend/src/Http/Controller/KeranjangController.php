<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Domain\CartSummary;
use Jastip\Domain\DecimalFormatter;
use Jastip\Domain\PaymentStatus;
use Jastip\Domain\WhatsAppNumber;
use Jastip\Http\HttpError;
use Jastip\Http\Pagination;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Repository\Sql;
use Jastip\Service\KeranjangService;

/**
 * Sisi baca keranjang: keranjang lengkap, rekap WA, customer per Open PO, barang unik.
 * present() juga dipakai controller aksi keranjang lain (semua aksi mengembalikan
 * objek keranjang lengkap).
 */
final class KeranjangController
{
    public function __construct(private readonly KeranjangService $service)
    {
    }

    /**
     * GET /open-po/{id}/keranjang/{customer_id}
     *
     * @param array<string, int> $params
     */
    public function show(array $params): Response
    {
        return Response::data(self::present($this->service->get($params['id'], $params['customer_id'])));
    }

    /**
     * GET /open-po/{id}/keranjang/{customer_id}/rekap
     *
     * @param array<string, int> $params
     */
    public function rekap(array $params): Response
    {
        return Response::data(['teks' => $this->service->rekap($params['id'], $params['customer_id'])]);
    }

    /**
     * GET /open-po/{id}/customer?status=&halaman=&per_halaman=
     *
     * @param array<string, int> $params
     */
    public function customers(Request $request, array $params): Response
    {
        $status = $request->query['status'] ?? null;
        $filter = is_string($status) ? PaymentStatus::tryFrom($status) : null;
        if ($status !== null && $filter === null) {
            throw HttpError::validation([
                'status' => 'Status harus salah satu dari belum_bayar, kurang_dp, dp, lunas, lebih_bayar.',
            ]);
        }
        $page = Pagination::fromRequest($request);
        $result = $this->service->listForOpenPo($params['id'], $filter, $page->perHalaman, $page->offset());

        return Response::data(
            array_map(static fn (array $item): array => [
                'customer' => self::presentCustomer($item['row']),
                'total' => $item['summary']->total,
                'dana_diterima' => $item['summary']->danaDiterima,
                'sisa' => $item['summary']->sisa,
                'kelebihan_bayar' => $item['summary']->kelebihanBayar,
                'status' => $item['summary']->status->value,
            ], $result['items']),
            meta: $page->meta($result['total']) + ['jumlah_per_status' => $result['per_status']],
        );
    }

    /**
     * GET /open-po/{id}/barang-unik
     *
     * @param array<string, int> $params
     */
    public function barangUnik(array $params): Response
    {
        return Response::data(array_map(static fn (array $row): array => [
            'nama_barang' => $row['nama_barang'],
            'harga_aud' => DecimalFormatter::fixed((int) $row['harga_aud_sen'], 2),
        ], $this->service->barangUnik($params['id'])));
    }

    /**
     * @param array{open_po: array<string, mixed>, customer: array<string, mixed>, summary: CartSummary,
     *              barang: list<array<string, mixed>>, riwayat: list<array<string, mixed>>} $cart
     * @return array<string, mixed>
     */
    public static function present(array $cart): array
    {
        $po = $cart['open_po'];

        return [
            'open_po' => [
                'id' => (int) $po['id'],
                'nama' => $po['nama'],
                'status' => $po['status'],
                'kurs_jastip' => (int) $po['kurs_jastip'],
                'kurs_terkunci' => $po['kurs_terkunci_at'] !== null,
            ],
            'customer' => self::presentCustomer(['customer_id' => $cart['customer']['id']] + $cart['customer']),
            'ringkasan' => $cart['summary']->toArray(),
            'barang' => array_map(static fn (array $line): array => [
                'id' => (int) $line['id'],
                'nama_barang' => $line['nama_barang'],
                'harga_aud' => DecimalFormatter::fixed((int) $line['harga_aud_sen'], 2),
                'qty' => (int) $line['qty'],
                'markup_persen' => DecimalFormatter::trimmed((int) $line['markup_bp'], 2),
                'kurs_jastip' => (int) $line['kurs_jastip'],
                'harga_jual_unit' => (int) $line['harga_jual_unit'],
                'subtotal' => (int) $line['subtotal'],
                'kosong' => (bool) $line['kosong'],
                'dibuat_pada' => Sql::isoOrNull($line['created_at']),
                'diubah_pada' => Sql::isoOrNull($line['updated_at']),
            ], $cart['barang']),
            'riwayat' => array_map(static fn (array $entry): array => [
                'jenis' => $entry['jenis'],
                'id' => $entry['id'],
                'nominal' => $entry['nominal'],
                'tanggal' => $entry['tanggal'],
                'catatan' => $entry['catatan'],
                'bisa_dihapus' => $entry['bisa_dihapus'],
                'dibuat_pada' => Sql::isoOrNull($entry['created_at']),
            ], $cart['riwayat']),
        ];
    }

    /**
     * @param array<string, mixed> $row kolom customer_id, nama, no_wa, diarsipkan_at
     * @return array<string, mixed>
     */
    private static function presentCustomer(array $row): array
    {
        $noWa = WhatsAppNumber::fromCanonical((string) $row['no_wa']);

        return [
            'id' => (int) $row['customer_id'],
            'nama' => $row['nama'],
            'no_wa' => $noWa->canonical(),
            'no_wa_tampil' => $noWa->display(),
            'diarsipkan' => $row['diarsipkan_at'] !== null,
        ];
    }
}
