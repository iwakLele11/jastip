<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Domain\Pricing;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Http\Validator;
use Jastip\Service\BarisPesananService;

final class BarisPesananController
{
    private const FIELDS = ['nama_barang', 'harga_aud', 'qty', 'markup_persen'];

    public function __construct(private readonly BarisPesananService $service)
    {
    }

    /**
     * POST /open-po/{id}/keranjang/{customer_id}/baris-pesanan
     *
     * @param array<string, int> $params
     */
    public function store(Request $request, array $params): Response
    {
        $v = new Validator($request->json());
        $values = $this->validate($v, self::FIELDS);
        $v->throwIfInvalid();

        $result = $this->service->create(
            $params['id'],
            $params['customer_id'],
            (string) $values['nama_barang'],
            (int) $values['harga_aud_sen'],
            (int) $values['qty'],
            (int) $values['markup_bp'],
        );

        return Response::data(
            KeranjangController::present($result['keranjang']),
            201,
            ['dibuat' => ['jenis' => 'baris_pesanan', 'id' => $result['id']]],
        );
    }

    /**
     * PATCH /baris-pesanan/{id}. Semua field opsional, aturan sama dengan tambah.
     *
     * @param array<string, int> $params
     */
    public function update(Request $request, array $params): Response
    {
        $v = new Validator($request->json());
        $changes = $this->validate($v, array_values(array_filter(self::FIELDS, $v->has(...))));
        $v->throwIfInvalid();

        /** @var array{nama_barang?: string, harga_aud_sen?: int, qty?: int, markup_bp?: int} $changes */
        return Response::data(KeranjangController::present($this->service->update($params['id'], $changes)));
    }

    /**
     * DELETE /baris-pesanan/{id}
     *
     * @param array<string, int> $params
     */
    public function destroy(array $params): Response
    {
        return Response::data(KeranjangController::present($this->service->delete($params['id'])));
    }

    /**
     * POST /baris-pesanan/{id}/kosong (tandai) dan DELETE (lepas tanda). Idempoten.
     *
     * @param array<string, int> $params
     */
    public function kosong(array $params, bool $kosong): Response
    {
        return Response::data(KeranjangController::present($this->service->setKosong($params['id'], $kosong)));
    }

    /**
     * Pesan validasi kontrak §10 / ui-spec §9.3.
     *
     * @param list<string> $fields field request yang divalidasi
     * @return array<string, int|string> kolom DB => nilai bersih (hanya field yang valid)
     */
    private function validate(Validator $v, array $fields): array
    {
        $values = [];
        if (in_array('nama_barang', $fields, true)) {
            $values['nama_barang'] = $v->text('nama_barang', 'Nama barang wajib diisi.', 150, 'Nama barang maksimal 150 karakter.');
        }
        if (in_array('harga_aud', $fields, true)) {
            $values['harga_aud_sen'] = $v->decimal('harga_aud', 2, [
                'wajib' => 'Harga wajib diisi.',
                'bukan_angka' => 'Isi angka saja, mis. 24,95.',
                'desimal' => 'Maksimal 2 angka di belakang koma.',
                'negatif' => 'Harga harus lebih dari 0.',
                'min' => 'Harga harus lebih dari 0.',
                'max' => 'Harga maksimal AUD 100.000,00.',
            ], Pricing::MAX_HARGA_SEN);
        }
        if (in_array('qty', $fields, true)) {
            $values['qty'] = $v->integer('qty', [
                'wajib' => 'Qty minimal 1.',
                'bukan_angka' => 'Qty harus bilangan bulat.',
                'min' => 'Qty minimal 1.',
                'max' => 'Qty maksimal 999.',
            ], 1, Pricing::MAX_QTY);
        }
        if (in_array('markup_persen', $fields, true)) {
            $values['markup_bp'] = $v->decimal('markup_persen', 2, [
                'wajib' => 'Markup wajib diisi.',
                'bukan_angka' => 'Isi angka, mis. 10.',
                'desimal' => 'Maksimal 2 angka di belakang koma.',
                'negatif' => 'Markup tidak boleh negatif.',
                'max' => 'Markup maksimal 100%.',
            ], Pricing::MAX_MARKUP_BP);
        }

        return array_filter($values, static fn (mixed $value): bool => $value !== null);
    }
}
