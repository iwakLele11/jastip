<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Http\Validator;
use Jastip\Service\PembayaranService;

/**
 * Pembayaran dan pengembalian dana. Tidak ada fitur ubah: salah input dihapus lalu dicatat ulang.
 */
final class PembayaranController
{
    /** Rp1.000.000.000.000. */
    private const MAX_NOMINAL = 1_000_000_000_000;
    private const MAX_CATATAN = 255;

    public function __construct(private readonly PembayaranService $service)
    {
    }

    /**
     * POST /open-po/{id}/keranjang/{customer_id}/pembayaran
     *
     * @param array<string, int> $params
     */
    public function storePayment(Request $request, array $params): Response
    {
        $v = new Validator($request->json());
        [$nominal, $tanggal] = $this->nominalDanTanggal($v);
        $v->throwIfInvalid();
        assert($nominal !== null && $tanggal !== null);

        $result = $this->service->addPayment($params['id'], $params['customer_id'], $nominal, $tanggal);

        return Response::data(
            KeranjangController::present($result['keranjang']),
            201,
            ['dibuat' => ['jenis' => 'pembayaran', 'id' => $result['id']]],
        );
    }

    /**
     * DELETE /pembayaran/{id}
     *
     * @param array<string, int> $params
     */
    public function destroyPayment(array $params): Response
    {
        return Response::data(KeranjangController::present($this->service->deletePayment($params['id'])));
    }

    /**
     * POST /open-po/{id}/keranjang/{customer_id}/pengembalian-dana
     *
     * @param array<string, int> $params
     */
    public function storeRefund(Request $request, array $params): Response
    {
        $v = new Validator($request->json());
        [$nominal, $tanggal] = $this->nominalDanTanggal($v);
        $catatan = $v->optionalText('catatan', self::MAX_CATATAN, 'Catatan maksimal 255 karakter.', 'Catatan harus berupa teks.');
        $v->throwIfInvalid();
        assert($nominal !== null && $tanggal !== null);

        $result = $this->service->addRefund($params['id'], $params['customer_id'], $nominal, $tanggal, $catatan);

        return Response::data(
            KeranjangController::present($result['keranjang']),
            201,
            ['dibuat' => ['jenis' => 'pengembalian_dana', 'id' => $result['id']]],
        );
    }

    /**
     * DELETE /pengembalian-dana/{id}
     *
     * @param array<string, int> $params
     */
    public function destroyRefund(array $params): Response
    {
        return Response::data(KeranjangController::present($this->service->deleteRefund($params['id'])));
    }

    /**
     * @return array{?int, ?string}
     */
    private function nominalDanTanggal(Validator $v): array
    {
        $nominal = $v->integer('nominal', [
            'wajib' => 'Nominal wajib diisi.',
            'bukan_angka' => 'Isi angka saja, mis. 1468000.',
            'min' => 'Nominal harus lebih dari Rp0.',
            'max' => 'Nominal terlalu besar.',
        ], 1, self::MAX_NOMINAL);
        $tanggal = $v->date('tanggal', 'Tanggal wajib diisi.', 'Tanggal tidak valid.');

        return [$nominal, $tanggal];
    }
}
