<?php

declare(strict_types=1);

namespace Jastip\Bootstrap;

use Jastip\Auth\AuthContext;
use Jastip\Auth\AuthService;
use Jastip\Auth\SessionCookie;
use Jastip\Config\Config;
use Jastip\Http\Controller\AuthController;
use Jastip\Http\Controller\BarisPesananController;
use Jastip\Http\Controller\CustomerController;
use Jastip\Http\Controller\HealthController;
use Jastip\Http\Controller\KeranjangController;
use Jastip\Http\Controller\KursController;
use Jastip\Http\Controller\OpenPoController;
use Jastip\Http\Controller\PembayaranController;
use Jastip\Http\Controller\SettingsController;
use Jastip\Http\Kernel;
use Jastip\Http\Request;
use Jastip\Http\Router;
use Jastip\Infrastructure\Clock;
use Jastip\Infrastructure\Database;
use Jastip\Infrastructure\FileLogger;
use Jastip\Infrastructure\Logger;
use Jastip\Infrastructure\SystemClock;
use Jastip\Kurs\ExchangeRateProvider;
use Jastip\Kurs\FrankfurterClient;
use Jastip\Repository\AdminRepository;
use Jastip\Repository\BarisPesananRepository;
use Jastip\Repository\CustomerRepository;
use Jastip\Repository\KeranjangRepository;
use Jastip\Repository\LoginAttemptRepository;
use Jastip\Repository\OpenPoRepository;
use Jastip\Repository\PembayaranRepository;
use Jastip\Repository\SessionRepository;
use Jastip\Repository\SettingsRepository;
use Jastip\Service\BarisPesananService;
use Jastip\Service\CustomerService;
use Jastip\Service\KeranjangLocks;
use Jastip\Service\KeranjangService;
use Jastip\Service\KursService;
use Jastip\Service\OpenPoService;
use Jastip\Service\PembayaranService;

/**
 * Merakit dependensi (tanpa container) dan mendaftarkan route API v1.
 */
final class AppFactory
{
    public static function fromEnvironment(string $basePath): Kernel
    {
        $config = Config::fromEnvironment($basePath);
        $clock = new SystemClock();

        return self::create(
            $config,
            Database::fromConfig($config),
            new FrankfurterClient($config->kursApiUrl, $config->kursTimeoutSeconds),
            $clock,
            new FileLogger($config->logPath, $clock),
        );
    }

    public static function create(
        Config $config,
        Database $db,
        ExchangeRateProvider $rates,
        Clock $clock,
        Logger $logger,
    ): Kernel {
        $settingsRepo = new SettingsRepository($db);
        $customerRepo = new CustomerRepository($db);
        $cookie = new SessionCookie($config->cookieSecure, $config->sessionIdleMinutes * 60);
        $auth = new AuthService(
            new AdminRepository($db),
            new SessionRepository($db),
            new LoginAttemptRepository($db),
            $clock,
            $logger,
            $config->sessionIdleMinutes,
            $config->loginMaxAttempts,
            $config->loginWindowMinutes,
        );

        $health = new HealthController($db, $logger);
        $authController = new AuthController($auth, $cookie);
        $settings = new SettingsController($settingsRepo);
        $kurs = new KursController(new KursService($rates, $settingsRepo, $logger));
        $openPoRepo = new OpenPoRepository($db);
        $keranjangRepo = new KeranjangRepository($db);
        $openPo = new OpenPoController(new OpenPoService($db, $openPoRepo, $settingsRepo));
        $customer = new CustomerController(
            new CustomerService($db, $customerRepo, $clock, $logger),
            $customerRepo,
        );

        $keranjangService = new KeranjangService($db, $openPoRepo, $customerRepo, $keranjangRepo);
        $locks = new KeranjangLocks($openPoRepo, $customerRepo, $keranjangRepo);
        $keranjang = new KeranjangController($keranjangService);
        $barisPesanan = new BarisPesananController(new BarisPesananService(
            $db,
            $openPoRepo,
            new BarisPesananRepository($db),
            $locks,
            $keranjangService,
            $clock,
            $logger,
        ));
        $pembayaran = new PembayaranController(new PembayaranService(
            $db,
            $openPoRepo,
            $customerRepo,
            $keranjangRepo,
            new PembayaranRepository($db),
            $locks,
            $keranjangService,
            $logger,
        ));

        $r = new Router();
        $v1 = '/api/v1';

        $r->add('GET', $v1 . '/health', static fn (): mixed => $health->show(), public: true);

        $r->add('POST', $v1 . '/auth/login', static fn (Request $q): mixed => $authController->login($q), public: true);
        $r->add('POST', $v1 . '/auth/logout', static fn (Request $q, array $p, AuthContext $a): mixed
            => $authController->logout($a));
        $r->add('GET', $v1 . '/auth/sesi', static fn (Request $q, array $p, AuthContext $a): mixed
            => $authController->session($a));

        $r->add('GET', $v1 . '/pengaturan', static fn (): mixed => $settings->show());
        $r->add('PATCH', $v1 . '/pengaturan', static fn (Request $q): mixed => $settings->update($q));

        $r->add('GET', $v1 . '/kurs/aud-idr', static fn (): mixed => $kurs->preview());

        $r->add('GET', $v1 . '/open-po', static fn (Request $q): mixed => $openPo->index($q));
        $r->add('POST', $v1 . '/open-po', static fn (Request $q): mixed => $openPo->store($q));
        $r->add('GET', $v1 . '/open-po/{id}', static fn (Request $q, array $p): mixed => $openPo->show($p));
        $r->add('PATCH', $v1 . '/open-po/{id}', static fn (Request $q, array $p): mixed => $openPo->update($q, $p));

        $r->add('GET', $v1 . '/customer', static fn (Request $q): mixed => $customer->index($q));
        $r->add('POST', $v1 . '/customer', static fn (Request $q): mixed => $customer->store($q));
        $r->add('GET', $v1 . '/customer/cek-no-wa', static fn (Request $q): mixed => $customer->checkNoWa($q));
        $r->add('GET', $v1 . '/customer/{id}', static fn (Request $q, array $p): mixed => $customer->show($p));
        $r->add('PATCH', $v1 . '/customer/{id}', static fn (Request $q, array $p): mixed => $customer->update($q, $p));
        $r->add('DELETE', $v1 . '/customer/{id}', static fn (Request $q, array $p): mixed => $customer->destroy($p));
        $r->add('POST', $v1 . '/customer/{id}/arsip', static fn (Request $q, array $p): mixed => $customer->archive($p));

        $r->add('GET', $v1 . '/open-po/{id}/customer', static fn (Request $q, array $p): mixed
            => $keranjang->customers($q, $p));
        $r->add('GET', $v1 . '/open-po/{id}/barang-unik', static fn (Request $q, array $p): mixed
            => $keranjang->barangUnik($p));

        $cart = $v1 . '/open-po/{id}/keranjang/{customer_id}';
        $r->add('GET', $cart, static fn (Request $q, array $p): mixed => $keranjang->show($p));
        $r->add('GET', $cart . '/rekap', static fn (Request $q, array $p): mixed => $keranjang->rekap($p));
        $r->add('POST', $cart . '/baris-pesanan', static fn (Request $q, array $p): mixed => $barisPesanan->store($q, $p));
        $r->add('POST', $cart . '/pembayaran', static fn (Request $q, array $p): mixed => $pembayaran->storePayment($q, $p));
        $r->add('POST', $cart . '/pengembalian-dana', static fn (Request $q, array $p): mixed
            => $pembayaran->storeRefund($q, $p));

        $r->add('PATCH', $v1 . '/baris-pesanan/{id}', static fn (Request $q, array $p): mixed => $barisPesanan->update($q, $p));
        $r->add('DELETE', $v1 . '/baris-pesanan/{id}', static fn (Request $q, array $p): mixed => $barisPesanan->destroy($p));
        $r->add('POST', $v1 . '/baris-pesanan/{id}/kosong', static fn (Request $q, array $p): mixed
            => $barisPesanan->kosong($p, true));
        $r->add('DELETE', $v1 . '/baris-pesanan/{id}/kosong', static fn (Request $q, array $p): mixed
            => $barisPesanan->kosong($p, false));

        $r->add('DELETE', $v1 . '/pembayaran/{id}', static fn (Request $q, array $p): mixed => $pembayaran->destroyPayment($p));
        $r->add('DELETE', $v1 . '/pengembalian-dana/{id}', static fn (Request $q, array $p): mixed
            => $pembayaran->destroyRefund($p));

        return new Kernel($r, $auth, $cookie, $config->allowedOrigins, $logger);
    }
}
