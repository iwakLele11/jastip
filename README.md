# Jastip Admin

Aplikasi web untuk admin jasa titip (jastip) barang dari Australia: menghitung harga jual dari harga AUD, kurs, dan markup, serta mencatat pesanan dan pembayaran per customer per Open PO, lengkap dengan rekap siap kirim ke WhatsApp.

Pengguna: satu admin (pemilik jastip). Customer tidak login; mereka memesan lewat chat pribadi dan menerima rekap WA.

## Fitur versi pertama (MVP)

- Login admin.
- Kurs AUD→IDR otomatis (Frankfurter) + cadangan 3%, dikunci per Open PO setelah pesanan pertama.
- Open PO, data customer, keranjang per customer per Open PO.
- Input barang dengan pratinjau harga: harga AUD × kurs × (1 + markup), dibulatkan ke atas ke Rp1.000 per unit.
- Tandai barang Kosong, DP 50%, status pembayaran otomatis (Belum bayar, Kurang DP, DP, Lunas, Lebih bayar), pengembalian dana, hapus pembayaran salah input.
- Salin rekap WA per customer.

## Struktur

| Folder | Isi |
|---|---|
| [`backend/`](backend/) | REST API JSON: PHP 8.2+ murni + PDO + MySQL 8. Lihat [`backend/README.md`](backend/README.md) |
| [`frontend/`](frontend/) | HTML + Tailwind CSS v4 + JavaScript vanilla (MPA). Lihat [`frontend/README.md`](frontend/README.md) |
| [`docs/product/scope-mvp.md`](docs/product/scope-mvp.md) | Scope, aturan bisnis, rumus, contoh hitungan QA |
| [`docs/design/ui-spec.md`](docs/design/ui-spec.md) | Spesifikasi UI/UX, palet warna, microcopy |
| [`docs/design/screenshots/`](docs/design/screenshots/) | Screenshot hasil test E2E (`m-` = HP 360px, `d-` = desktop) |
| [`docs/api/api-contract.md`](docs/api/api-contract.md) | Kontrak API v1 |

## Menjalankan test

```bash
cd backend && composer install && bin/test.sh        # butuh MySQL/MariaDB, lihat backend/README.md
cd frontend && npm ci && npm test && npm run test:e2e
```

## Deploy

### Paket htdocs (XAMPP lokal dan InfinityFree)

Satu paket untuk web server Apache yang web root-nya tidak bisa diatur (`htdocs`): front-end di akar, back-end di `app/` (ditolak dari web oleh `.htaccess`).

```bash
deploy/build-htdocs.sh      # → build/jastip-htdocs/ dan build/jastip-htdocs.zip (< 10 MB)
```

Skrip ini membangun front-end, menyalin back-end tanpa file dev, menjalankan `composer install --no-dev --optimize-autoloader`, membuat `app/install.sql` (dan `app/upgrade/NNN_*.sql` untuk migrasi setelah `001_init`) dari `backend/database/migrations`, lalu mengecek batas ukuran file InfinityFree. Alat bisa diganti lewat `PHP_BIN`, `COMPOSER`, `NPM_CACHE` (lihat kepala skrip). Template paket (`index.php`, `.htaccess`, contoh `.env`) ada di [`deploy/htdocs/`](deploy/htdocs/).

```
htdocs/
  .htaccess  index.php  *.html  css/  js/  favicon.svg
  app/       .htaccess (tolak semua), src/, vendor/, bin/, database/, storage/logs/,
             install.sql, .env.contoh-lokal, .env.contoh-infinityfree  (→ salin jadi app/.env)
```

Panduan langkah demi langkah untuk pengguna:

- [`docs/deploy/jalankan-lokal-xampp.md`](docs/deploy/jalankan-lokal-xampp.md): XAMPP 8.4 di Windows (`http://localhost`), opsional dibuka dari HP di Wi-Fi yang sama.
- [`docs/deploy/infinityfree.md`](docs/deploy/infinityfree.md): InfinityFree (HTTPS, phpMyAdmin, FileZilla), backup, batasan hosting gratis, dan cara update.

Di InfinityFree API hanya bisa diakses dari browser (ada pengecekan JavaScript + cookie untuk setiap request). Aplikasi mobile nanti butuh hosting lain.

### Server sendiri (VPS)

1. Server dengan PHP ≥ 8.2, MySQL 8 / MariaDB 10.6+, dan HTTPS. Document root = `backend/public/`.
2. `cd backend && composer install --no-dev --optimize-autoloader`, isi environment (lihat `backend/.env.example`), `php bin/migrate.php up`, `php bin/create-admin.php <nama>`.
3. `cd frontend && npm ci && npm run build`, lalu salin isi `frontend/dist/` ke `backend/public/` (tanpa menghapus `index.php` dan `.htaccess`).

Detail ada di README masing-masing folder.
