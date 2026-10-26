<?php

declare(strict_types=1);

namespace Jastip\Auth;

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
 * - Pembatasan: setelah N kali gagal untuk nama pengguna yang sama dalam jendela
 *   waktu, percobaan berikutnya ditolak 429 (termasuk yang kata sandinya benar).
 */
final class AuthService
{
    private const TOKEN_BYTES = 32;
    /** terakhir_aktif_at diperbarui paling sering sekali per menit. */
    private const TOUCH_INTERVAL_SECONDS = 60;

    private static ?string $dummyHash = null;

    public function __construct(
        private readonly AdminRepository $admins,
        private readonly SessionRepository $sessions,
        private readonly LoginAttemptRepository $attempts,
        private readonly Clock $clock,
        private readonly Logger $logger,
        private readonly int $idleMinutes,
        private readonly int $maxAttempts,
        private readonly int $windowMinutes,
    ) {
    }

    public function idleMinutes(): int
    {
        return $this->idleMinutes;
    }

    public function login(string $namaPengguna, string $kataSandi, string $ip): LoginResult
    {
        $now = $this->clock->now();
        $namaPengguna = trim($namaPengguna);
        $key = hash('sha256', mb_strtolower($namaPengguna));
        $windowStart = $now->modify(sprintf('-%d minutes', $this->windowMinutes));

        $this->attempts->deleteOlderThan($windowStart);
        $recent = $this->attempts->countSince($key, $windowStart);
        if ($recent['jumlah'] >= $this->maxAttempts && $recent['paling_awal'] !== null) {
            $retryAt = Sql::parseDatetime($recent['paling_awal'])->modify(sprintf('+%d minutes', $this->windowMinutes));
            $seconds = max(1, $retryAt->getTimestamp() - $now->getTimestamp());
            $this->logger->warning('login_diblokir', ['ip' => $ip]);

            throw new HttpError(
                429,
                'TERLALU_BANYAK_PERCOBAAN',
                sprintf('Terlalu banyak percobaan masuk. Coba lagi dalam %d menit.', (int) ceil($seconds / 60)),
                [],
                ['Retry-After' => (string) $seconds],
            );
        }

        $admin = $this->admins->findByUsername($namaPengguna);
        // Tetap jalankan password_verify walau pengguna tidak ada, supaya waktu respons serupa.
        $valid = password_verify($kataSandi, $admin['password_hash'] ?? self::dummyHash());
        if ($admin === null || !$valid) {
            $this->attempts->record($key, $now);
            $this->logger->warning('login_gagal', ['ip' => $ip]);

            throw new HttpError(401, 'LOGIN_GAGAL', 'Nama pengguna atau kata sandi salah.');
        }

        $this->attempts->clear($key);
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            $this->admins->updatePasswordHash($admin['id'], password_hash($kataSandi, PASSWORD_DEFAULT));
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

    private function idleThreshold(): \DateTimeImmutable
    {
        return $this->clock->now()->modify(sprintf('-%d minutes', $this->idleMinutes));
    }

    private static function notLoggedIn(): HttpError
    {
        return new HttpError(401, 'BELUM_MASUK', 'Silakan masuk terlebih dahulu.');
    }

    private static function dummyHash(): string
    {
        return self::$dummyHash ??= password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    }
}
