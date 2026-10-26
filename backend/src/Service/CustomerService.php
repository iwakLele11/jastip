<?php

declare(strict_types=1);

namespace Jastip\Service;

use Jastip\Domain\WhatsAppNumber;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\Clock;
use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\Logger;
use Jastip\Repository\CustomerRepository;

final class CustomerService
{
    public function __construct(
        private readonly Database $db,
        private readonly CustomerRepository $customers,
        private readonly Clock $clock,
        private readonly Logger $logger,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function create(string $nama, WhatsAppNumber $noWa, ?string $alamat): array
    {
        return $this->get($this->customers->insert($nama, $noWa->canonical(), $alamat));
    }

    /**
     * @return array<string, mixed>
     */
    public function get(int $id): array
    {
        return $this->customers->find($id) ?? throw HttpError::notFound('Customer tidak ditemukan.');
    }

    /**
     * @param array<string, string|null> $changes kolom nama/no_wa/alamat yang dikirim
     * @return array<string, mixed>
     */
    public function update(int $id, array $changes): array
    {
        $this->get($id);
        $this->customers->update($id, $changes);

        return $this->get($id);
    }

    /**
     * Peringatan (bukan blokir) jika no WA sudah dipakai customer aktif lain.
     *
     * @return list<array{id: int, nama: string, no_wa: string}>
     */
    public function duplicates(WhatsAppNumber $noWa, ?int $exceptId): array
    {
        return $this->customers->findActiveByNoWa($noWa->canonical(), $exceptId);
    }

    /**
     * Customer yang sudah punya pesanan tidak bisa dihapus (409), harus diarsipkan.
     * Keranjang kosong milik customer ikut dihapus.
     */
    public function delete(int $id): void
    {
        $this->db->transaction(function () use ($id): void {
            $customer = $this->customers->find($id, forUpdate: true)
                ?? throw HttpError::notFound('Customer tidak ditemukan.');
            if ((bool) $customer['punya_pesanan']) {
                throw HttpError::conflict(
                    'CUSTOMER_PUNYA_PESANAN',
                    sprintf('%s sudah punya pesanan, jadi tidak bisa dihapus. Arsipkan customer ini.', $customer['nama']),
                );
            }
            $this->customers->deleteEmptyCarts($id);
            $this->customers->delete($id);
        });
        $this->logger->info('customer_dihapus', ['customer_id' => $id]);
    }

    /**
     * Idempoten: customer yang sudah diarsipkan tetap diarsipkan.
     *
     * @return array<string, mixed>
     */
    public function archive(int $id): array
    {
        $this->get($id);
        $this->customers->archive($id, $this->clock->now());

        return $this->get($id);
    }
}
