<?php

declare(strict_types=1);

namespace Jastip\Auth;

use DateTimeImmutable;
use Jastip\Http\HttpError;
use Jastip\Infrastructure\Clock;
use Jastip\Infrastructure\Logger;
use Jastip\Repository\AdminRepository;
use Jastip\Repository\LoginAttemptRepository;
use Jastip\Repository\SessionRepository;
use Jastip\Repository\Sql;

/**
 * Login, validasi sesi (12 jam tidak aktif, sliding), dan logout.
 *
 * - Token: 32 byte acak (64 karakter hex), hanya hash SHA-256 yang disimpan.
 * - Pembatasan dalam satu jendela waktu, hanya login gagal yang dihitung: setelah N kali gagal
 *   untuk nama pengguna yang sama, atau M kali gagal dari IP yang sama, percobaan berikutnya
 *   ditolak 429 (termasuk yang kata sandinya benar).
 * - Nama pengguna dinormalisasi lewat Username. Nilai yang sama dipakai untuk pencarian admin
 *   dan untuk kunci pembatasan. Nama di luar pola langsung gagal tanpa pencarian ke database,
 *   tetapi tetap dicatat dan dihitung.
 * - Setiap login gagal menjalankan tepat satu verifikasi kata sandi (hash dummy kalau tidak ada
 *   akun), supaya waktu respons tidak membedakan pengguna ada dan tidak ada.
 */
final class AuthService
{
    private const TOKEN_BYTES = 32;
    /** terakhir_aktif_at diperbarui paling sering sekali per menit. */
    private const TOUCH_INTERVAL_SECONDS = 60;
    /**
     * Awalan kunci percobaan_login selain nama pengguna valid (yang di-hash apa adanya). Titik dua
     * tidak ada di pola nama pengguna, jadi kunci ini tidak pernah sama dengan kunci akun.
     */
    private const KEY_PREFIX_IP = 'ip:';
    private const KEY_PREFIX_INVALID = 'tidak-valid:';

    public function __construct(
        private readonly AdminRepository $admins,
        private readonly SessionRepository $sessions,
        private readonly LoginAttemptRepository $attempts,
        private readonly PasswordHasher $passwords,
        private readonly Clock $clock,
        private readonly Logger $logger,
        private readonly int $idleMinutes,
        private readonly int $maxAttempts,
        private readonly int $windowMinutes,
        private readonly int $maxAttemptsPerIp,
    ) {
    }

    public function idleMinutes(): int
    {
        return $this->idleMinutes;
    }

    /**
     * @param string $ip alamat klien dari koneksi (REMOTE_ADDR), hanya disimpan sebagai hash
     */
    public function login(string $namaPengguna, string $kataSandi, string $ip): LoginResult
    {
        $now = $this->clock->now();
        $windowStart = $now->modify(sprintf('-%d minutes', $this->windowMinutes));
        $kunci = Username::normalize($namaPengguna);
        $userKey = hash('sha256', $kunci ?? self::KEY_PREFIX_INVALID . mb_strtolower(trim($namaPengguna)));
        $ipKey = hash('sha256', self::KEY_PREFIX_IP . $ip);

        $this->attempts->deleteOlderThan($windowStart);
        $this->guardThrottle($userKey, $ipKey, $windowStart, $now, $ip);

        $admin = $kunci === null ? null : $this->admins->findByNormalizedUsername($kunci);
        $valid = $this->passwords->verify($kataSandi, $admin['password_hash'] ?? $this->passwords->dummyHash());
        if ($admin === null || !$valid) {
            $this->attempts->record($userKey, $now);
            $this->attempts->record($ipKey, $now);
            $this->logger->warning('login_gagal', ['ip' => $ip]);

            throw new HttpError(401, 'LOGIN_GAGAL', 'Nama pengguna atau kata sandi salah.');
        }

        // Hanya hitungan nama pengguna yang dihapus. Hitungan IP berjalan terus sampai jendela lewat.
        $this->attempts->clear($userKey);
        if ($this->passwords->needsRehash($admin['password_hash'])) {
            $this->admins->updatePasswordHash($admin['id'], $this->passwords->hash($kataSandi));
        }

        $this->sessions->deleteInactiveSince($this->idleThreshold());
        $token = bin2hex(random_bytes(self::TOKEN_BYTES));
        $this->sessions->create($admin['id'], hash('sha256', $token), $now);
        $this->logger->info('login_berhasil', ['admin_id' => $admin['id'], 'ip' => $ip]);

        return new LoginResult($token, $admin['id'], $admin['nama_pengguna']);
    }

    /**
     * @throws HttpError 401 BELUM_MASUK atau SESI_BERAKHIR
     */
    public function authenticate(?Credential $credential): AuthContext
    {
        if ($credential === null || preg_match('/^[0-9a-f]{64}$/D', $credential->token) !== 1) {
            throw self::notLoggedIn();
        }

        $session = $this->sessions->findByTokenHash(hash('sha256', $credential->token));
        if ($session === null) {
            throw self::notLoggedIn();
        }

        $now = $this->clock->now();
        $lastActive = Sql::parseDatetime($session['terakhir_aktif_at']);
        if ($lastActive <= $this->idleThreshold()) {
            $this->sessions->delete($session['id']);

            throw new HttpError(401, 'SESI_BERAKHIR', 'Sesi berakhir. Silakan masuk lagi.');
        }

        $refreshed = false;
        if ($now->getTimestamp() - $lastActive->getTimestamp() >= self::TOUCH_INTERVAL_SECONDS) {
            $this->sessions->touch($session['id'], $now);
            $refreshed = true;
        }

        return new AuthContext(
            sessionId: $session['id'],
            adminId: $session['admin_id'],
            namaPengguna: $session['nama_pengguna'],
            token: $credential->token,
            viaCookie: $credential->viaCookie,
            refreshed: $refreshed,
        );
    }

    public function logout(AuthContext $auth): void
    {
        $this->sessions->delete($auth->sessionId);
        $this->logger->info('logout', ['admin_id' => $auth->adminId]);
    }

    /**
     * @throws HttpError 429 jika batas per nama pengguna atau per IP sudah tercapai
     */
    private function guardThrottle(
        string $userKey,
        string $ipKey,
        DateTimeImmutable $windowStart,
        DateTimeImmutable $now,
        string $ip,
    ): void {
        $limits = [
            'nama_pengguna' => [$userKey, $this->maxAttempts],
            'ip' => [$ipKey, $this->maxAttemptsPerIp],
        ];
        $blockedBy = [];
        $seconds = 1;
        foreach ($limits as $batas => [$key, $max]) {
            $recent = $this->attempts->countSince($key, $windowStart);
            if ($recent['jumlah'] < $max || $recent['paling_awal'] === null) {
                continue;
            }
            $retryAt = Sql::parseDatetime($recent['paling_awal'])->modify(sprintf('+%d minutes', $this->windowMinutes));
            $seconds = max($seconds, $retryAt->getTimestamp() - $now->getTimestamp());
            $blockedBy[] = $batas;
        }
        if ($blockedBy === []) {
            return;
        }
        $this->logger->warning('login_diblokir', ['ip' => $ip, 'batas' => implode(',', $blockedBy)]);

        throw new HttpError(
            429,
            'TERLALU_BANYAK_PERCOBAAN',
            sprintf('Terlalu banyak percobaan masuk. Coba lagi dalam %d menit.', (int) ceil($seconds / 60)),
            [],
            ['Retry-After' => (string) $seconds],
        );
    }

    private function idleThreshold(): \DateTimeImmutable
    {
        return $this->clock->now()->modify(sprintf('-%d minutes', $this->idleMinutes));
    }

    private static function notLoggedIn(): HttpError
    {
        return new HttpError(401, 'BELUM_MASUK', 'Silakan masuk terlebih dahulu.');
    }
}
