<?php

declare(strict_types=1);

namespace Jastip\Repository;

use DateTimeImmutable;
use Jastip\Domain\WhatsAppNumber;
use Jastip\Infrastructure\Database;
use PDO;
use RuntimeException;

final class CustomerRepository
{
    private const COLUMNS = 'c.id, c.nama, c.no_wa, c.alamat, c.diarsipkan_at, c.created_at, c.updated_at';
    private const UPDATABLE = ['nama', 'no_wa', 'alamat'];

    public function __construct(private readonly Database $db)
    {
    }

    public function insert(string $nama, string $noWa, ?string $alamat): int
    {
        $stmt = $this->db->pdo()->prepare('INSERT INTO customer (nama, no_wa, alamat) VALUES (?, ?, ?)');
        $stmt->execute([$nama, $noWa, $alamat]);

        return (int) $this->db->pdo()->lastInsertId();
    }

    /**
     * Termasuk customer yang diarsipkan (pesanan lamanya tetap tampil di PO terkait).
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id, bool $forUpdate = false): ?array
    {
        if ($forUpdate && !$this->db->pdo()->inTransaction()) {
            throw new RuntimeException('find(forUpdate) harus di dalam transaksi.');
        }
        $stmt = $this->db->pdo()->prepare(
            'SELECT ' . self::COLUMNS . ', ' . $this->punyaPesananSql() . ' AS punya_pesanan'
            . ' FROM customer c WHERE c.id = ?' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Kunci X pada baris customer tanpa subquery (tidak ada consistent read di dalamnya).
     * Dipakai sebelum membuat keranjang baru: cek arsip tidak balapan dengan arsipkan,
     * dan dua request pertama untuk customer + PO yang sama berjalan berurutan.
     *
     * @return array{id: int, diarsipkan_at: ?string}|null
     */
    public function lock(int $id): ?array
    {
        if (!$this->db->pdo()->inTransaction()) {
            throw new RuntimeException('lock() harus di dalam transaksi.');
        }
        $stmt = $this->db->pdo()->prepare('SELECT id, diarsipkan_at FROM customer WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        /** @var array{id: int, diarsipkan_at: ?string}|false $row */
        return $row === false ? null : $row;
    }

    /**
     * Pencarian customer aktif (tidak diarsipkan). Nama dicocokkan sebagian tanpa peka
     * huruf besar/kecil; kueri berbentuk nomor juga dicocokkan ke no WA kanonik.
     *
     * @param 'nama'|'terakhir_diubah' $urut
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function search(?string $query, string $urut, int $limit, int $offset, ?int $openPoId): array
    {
        $where = ['c.diarsipkan_at IS NULL'];
        $params = [];
        if ($query !== null && trim($query) !== '') {
            $conditions = ['c.nama LIKE :nama ESCAPE \'!\''];
            $params[':nama'] = '%' . Sql::likeEscape(trim($query)) . '%';
            $pattern = WhatsAppNumber::searchPattern($query);
            if ($pattern !== null) {
                $conditions[] = 'c.no_wa LIKE :no_wa';
                $params[':no_wa'] = ($pattern['mode'] === 'awalan' ? '' : '%') . $pattern['digit'] . '%';
            }
            $where[] = '(' . implode(' OR ', $conditions) . ')';
        }
        $whereSql = ' WHERE ' . implode(' AND ', $where);

        $count = $this->db->pdo()->prepare('SELECT COUNT(*) FROM customer c' . $whereSql);
        $count->execute($params);
        $total = (int) $count->fetchColumn();

        $sudahDiPo = $openPoId === null
            ? 'NULL'
            : 'EXISTS (SELECT 1 FROM keranjang k WHERE k.customer_id = c.id AND k.open_po_id = :po AND '
                . KeranjangSql::berisi('k') . ')';
        $order = $urut === 'terakhir_diubah' ? 'c.updated_at DESC, c.id DESC' : 'c.nama ASC, c.id ASC';

        $stmt = $this->db->pdo()->prepare(
            'SELECT ' . self::COLUMNS . ', ' . $sudahDiPo . ' AS sudah_di_po FROM customer c' . $whereSql
            . ' ORDER BY ' . $order . ' LIMIT :limit OFFSET :offset'
        );
        foreach ($params as $name => $value) {
            $stmt->bindValue($name, $value);
        }
        if ($openPoId !== null) {
            $stmt->bindValue(':po', $openPoId, PDO::PARAM_INT);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['items' => $stmt->fetchAll(), 'total' => $total];
    }

    /**
     * Customer aktif dengan no WA kanonik yang sama, urut dari yang paling lama.
     *
     * @return list<array{id: int, nama: string, no_wa: string}>
     */
    public function findActiveByNoWa(string $noWa, ?int $exceptId): array
    {
        $stmt = $this->db->pdo()->prepare(
            'SELECT id, nama, no_wa FROM customer WHERE no_wa = ? AND diarsipkan_at IS NULL AND id <> ?'
            . ' ORDER BY id ASC LIMIT 10'
        );
        $stmt->execute([$noWa, $exceptId ?? 0]);

        /** @var list<array{id: int, nama: string, no_wa: string}> */
        return $stmt->fetchAll();
    }

    /**
     * @param array<string, string|null> $changes
     */
    public function update(int $id, array $changes): void
    {
        $sets = [];
        $params = [];
        foreach ($changes as $column => $value) {
            if (!in_array($column, self::UPDATABLE, true)) {
                throw new RuntimeException('Kolom customer tidak bisa diubah: ' . $column);
            }
            $sets[] = $column . ' = ?';
            $params[] = $value;
        }
        if ($sets === []) {
            return;
        }
        $params[] = $id;
        $this->db->pdo()->prepare('UPDATE customer SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }

    public function archive(int $id, DateTimeImmutable $now): void
    {
        $stmt = $this->db->pdo()->prepare(
            'UPDATE customer SET diarsipkan_at = ? WHERE id = ? AND diarsipkan_at IS NULL'
        );
        $stmt->execute([Sql::datetime($now), $id]);
    }

    /** Keranjang tanpa baris, pembayaran, atau pengembalian dana tidak dihitung sebagai pesanan. */
    public function deleteEmptyCarts(int $customerId): void
    {
        $stmt = $this->db->pdo()->prepare(
            'DELETE k FROM keranjang k WHERE k.customer_id = ? AND NOT ' . KeranjangSql::berisi('k')
        );
        $stmt->execute([$customerId]);
    }

    public function delete(int $id): void
    {
        $this->db->pdo()->prepare('DELETE FROM customer WHERE id = ?')->execute([$id]);
    }

    private function punyaPesananSql(): string
    {
        return 'EXISTS (SELECT 1 FROM keranjang k WHERE k.customer_id = c.id AND ' . KeranjangSql::berisi('k') . ')';
    }
}
