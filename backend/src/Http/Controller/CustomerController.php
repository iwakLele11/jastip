<?php

declare(strict_types=1);

namespace Jastip\Http\Controller;

use Jastip\Domain\InvalidWhatsAppNumber;
use Jastip\Domain\WhatsAppNumber;
use Jastip\Http\HttpError;
use Jastip\Http\Pagination;
use Jastip\Http\Request;
use Jastip\Http\Response;
use Jastip\Http\Validator;
use Jastip\Repository\CustomerRepository;
use Jastip\Repository\Sql;
use Jastip\Service\CustomerService;

final class CustomerController
{
    private const MAX_NAMA = 100;
    private const MAX_ALAMAT = 500;
    private const MAX_QUERY = 100;

    public function __construct(
        private readonly CustomerService $service,
        private readonly CustomerRepository $customers,
    ) {
    }

    /**
     * GET /customer?q=&urut=nama|terakhir_diubah&open_po_id=&halaman=&per_halaman=
     */
    public function index(Request $request): Response
    {
        $errors = [];
        $q = $request->query['q'] ?? null;
        if ($q !== null && (!is_string($q) || mb_strlen($q) > self::MAX_QUERY)) {
            $errors['q'] = 'Kata kunci pencarian maksimal 100 karakter.';
        }
        $urut = $request->query['urut'] ?? 'nama';
        if (!in_array($urut, ['nama', 'terakhir_diubah'], true)) {
            $errors['urut'] = 'urut harus nama atau terakhir_diubah.';
        }
        $openPoId = $request->query['open_po_id'] ?? null;
        if ($openPoId !== null && (!is_string($openPoId) || preg_match('/^[1-9][0-9]{0,9}$/D', $openPoId) !== 1)) {
            $errors['open_po_id'] = 'open_po_id tidak valid.';
        }
        if ($errors !== []) {
            throw HttpError::validation($errors);
        }
        $page = Pagination::fromRequest($request);

        /** @var 'nama'|'terakhir_diubah' $urut */
        $result = $this->customers->search(
            is_string($q) ? $q : null,
            $urut,
            $page->perHalaman,
            $page->offset(),
            $openPoId === null ? null : (int) $openPoId,
        );

        return Response::data(
            array_map(static function (array $row) use ($openPoId): array {
                $item = self::present($row);
                unset($item['punya_pesanan']);
                if ($openPoId !== null) {
                    $item['sudah_di_po'] = (bool) $row['sudah_di_po'];
                }

                return $item;
            }, $result['items']),
            meta: $page->meta($result['total']),
        );
    }

    public function store(Request $request): Response
    {
        $v = new Validator($request->json());
        $nama = $v->text('nama', 'Nama wajib diisi.', self::MAX_NAMA, 'Nama maksimal 100 karakter.');
        $noWa = $this->noWa($v, $request->json()['no_wa'] ?? null);
        $alamat = $this->alamat($v);
        $v->throwIfInvalid();
        assert($nama !== null && $noWa !== null);

        $customer = $this->service->create($nama, $noWa, $alamat);

        return Response::data(self::present($customer), 201)
            ->withHeader('Location', '/api/v1/customer/' . $customer['id']);
    }

    /**
     * @param array<string, int> $params
     */
    public function show(array $params): Response
    {
        return Response::data(self::present($this->service->get($params['id'])));
    }

    /**
     * @param array<string, int> $params
     */
    public function update(Request $request, array $params): Response
    {
        $body = $request->json();
        $v = new Validator($body);
        $changes = [];
        if ($v->has('nama')) {
            $changes['nama'] = $v->text('nama', 'Nama wajib diisi.', self::MAX_NAMA, 'Nama maksimal 100 karakter.');
        }
        if ($v->has('no_wa')) {
            $changes['no_wa'] = $this->noWa($v, $body['no_wa'])?->canonical();
        }
        if ($v->has('alamat')) {
            $changes['alamat'] = $this->alamat($v);
        }
        $v->throwIfInvalid();

        return Response::data(self::present($this->service->update($params['id'], $changes)));
    }

    /**
     * GET /customer/cek-no-wa?no_wa=...&kecuali_id=...
     */
    public function checkNoWa(Request $request): Response
    {
        $raw = $request->query['no_wa'] ?? null;
        $kecuali = $request->query['kecuali_id'] ?? null;
        if ($kecuali !== null && (!is_string($kecuali) || preg_match('/^[1-9][0-9]{0,9}$/D', $kecuali) !== 1)) {
            throw HttpError::validation(['kecuali_id' => 'kecuali_id tidak valid.']);
        }
        try {
            $noWa = WhatsAppNumber::fromInput(is_string($raw) ? $raw : '');
        } catch (InvalidWhatsAppNumber $e) {
            throw HttpError::validation(['no_wa' => $e->getMessage()]);
        }

        $matches = $this->service->duplicates($noWa, $kecuali === null ? null : (int) $kecuali);

        return Response::data([
            'no_wa' => $noWa->canonical(),
            'no_wa_tampil' => $noWa->display(),
            'terdaftar' => $matches !== [],
            'customer' => array_map(static fn (array $c): array => [
                'id' => (int) $c['id'],
                'nama' => $c['nama'],
                'no_wa_tampil' => WhatsAppNumber::fromCanonical($c['no_wa'])->display(),
            ], $matches),
            'pesan' => $matches === []
                ? null
                : sprintf('No WA ini sudah terdaftar atas nama %s.', $matches[0]['nama']),
        ]);
    }

    /**
     * @param array<string, int> $params
     */
    public function destroy(array $params): Response
    {
        $this->service->delete($params['id']);

        return Response::noContent();
    }

    /**
     * @param array<string, int> $params
     */
    public function archive(array $params): Response
    {
        return Response::data(self::present($this->service->archive($params['id'])));
    }

    private function noWa(Validator $v, mixed $raw): ?WhatsAppNumber
    {
        try {
            return WhatsAppNumber::fromInput(is_string($raw) ? $raw : '');
        } catch (InvalidWhatsAppNumber $e) {
            $v->error('no_wa', $e->getMessage());

            return null;
        }
    }

    private function alamat(Validator $v): ?string
    {
        return $v->optionalText('alamat', self::MAX_ALAMAT, 'Alamat maksimal 500 karakter.', 'Alamat harus berupa teks.');
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function present(array $row): array
    {
        $noWa = WhatsAppNumber::fromCanonical((string) $row['no_wa']);

        return [
            'id' => (int) $row['id'],
            'nama' => $row['nama'],
            'no_wa' => $noWa->canonical(),
            'no_wa_tampil' => $noWa->display(),
            'alamat' => $row['alamat'],
            'diarsipkan' => $row['diarsipkan_at'] !== null,
            'diarsipkan_pada' => Sql::isoOrNull($row['diarsipkan_at']),
            'punya_pesanan' => (bool) ($row['punya_pesanan'] ?? false),
            'dibuat_pada' => Sql::isoOrNull($row['created_at']),
            'diubah_pada' => Sql::isoOrNull($row['updated_at']),
        ];
    }
}
