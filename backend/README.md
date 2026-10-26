# Back-end Jastip

REST API JSON untuk aplikasi jastip (MVP). PHP murni + PDO + MySQL, tanpa framework. Kontrak API: [`docs/api/api-contract.md`](../docs/api/api-contract.md).

- PHP ≥ 8.2 dengan ekstensi `pdo_mysql`, `mbstring`, `curl`, `json`
- MySQL 8.0.16+ atau MariaDB 10.6+
- Composer (dependensi produksi: tidak ada; dev: PHPUnit, PHP_CodeSniffer)

## Struktur

```
backend/
├── bin/
│   ├── migrate.php          migrasi up / down / status
│   ├── create-admin.php     buat admin atau ganti kata sandi (--sql: cetak SQL, tanpa koneksi DB)
│   ├── export-sql.php       install.sql / SQL upgrade dari migrasi, untuk phpMyAdmin
│   └── test.sh              satu perintah untuk semua test
├── database/migrations/     001_init.sql + 001_init.down.sql
├── public/                  DOCUMENT ROOT: index.php (front controller), .htaccess
├── src/
│   ├── Bootstrap/           AppFactory: merakit dependensi + daftar route
│   ├── Http/                Request, Response, Router, Kernel (CSRF, auth, error), Validator
│   │   └── Controller/      satu controller per sumber daya
│   ├── Service/             aturan bisnis + transaksi (KeranjangLocks: urutan kunci keranjang)
│   ├── Repository/          SQL (PDO prepared statement)
│   ├── Domain/              hitungan murni tanpa DB: harga, total, DP, status, aturan refund/hapus
│   │                        pembayaran, teks rekap WA, no WA, desimal
│   ├── Auth/                sesi, cookie, login throttle
│   ├── Kurs/                klien Frankfurter
│   ├── Config/              konfigurasi dari environment / .env
│   └── Infrastructure/      Database, Migrator, MigrationSqlExport, Logger, Clock
├── storage/logs/            log aplikasi (JSON per baris)
└── tests/
    ├── Unit/Domain/         rumus scope + kasus tepi, teks rekap WA per status
    ├── Integration/         lewat Kernel ke MariaDB/MySQL sungguhan + 1 smoke test php -S
    │                        + KonkurensiTest (dua transaksi bersamaan, proses PHP kedua)
    └── Support/             stub, clock, logger, kernel-request.php (request di proses terpisah)
```

## Setup lokal

```bash
cd backend
composer install
cp .env.example .env          # isi DB_*; SESSION_COOKIE_SECURE=false hanya untuk http lokal
```

Buat database kosong (contoh MySQL):

```sql
CREATE DATABASE jastip CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'jastip'@'localhost' IDENTIFIED BY '<kata sandi kuat>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON jastip.* TO 'jastip'@'localhost';
```

Migrasi dan admin:

```bash
php bin/migrate.php up
php bin/create-admin.php pemilik            # kata sandi diminta tanpa ditampilkan, min. 10 karakter
php bin/create-admin.php pemilik --reset    # ganti kata sandi (lupa sandi), semua sesi lama diakhiri
```

Hosting tanpa CLI (mis. InfinityFree): jalankan skrip di komputer sendiri dengan `--sql`. Kata sandi diminta seperti biasa, lalu skrip mencetak SQL siap tempel di tab SQL phpMyAdmin (`INSERT`; dengan `--reset`: `UPDATE` hash + hapus sesi). Tidak ada koneksi database. SQL ke STDOUT, pesan ke STDERR:

```bash
php bin/create-admin.php pemilik --sql > ../admin.sql
php bin/create-admin.php pemilik --sql --reset > ../admin.sql
```

Di Windows ketikan kata sandi tidak bisa disembunyikan; skrip menampilkan peringatan.

Server lokal:

```bash
php -S 127.0.0.1:8080 -t public public/index.php
curl http://127.0.0.1:8080/api/v1/health
```

Setel `APP_ALLOWED_ORIGINS=http://127.0.0.1:8080` (atau origin front-end lokal) supaya request `POST/PATCH/DELETE` dari browser tidak ditolak `403 ORIGIN_DITOLAK`.

### Migrasi

| Perintah | Fungsi |
|---|---|
| `php bin/migrate.php status` | Daftar migrasi dan statusnya |
| `php bin/migrate.php up` | Jalankan migrasi yang belum |
| `php bin/migrate.php down --yes [--steps=N]` | Rollback N migrasi terakhir. **Menghapus tabel dan data.** Ditolak di `APP_ENV=production` kecuali ditambah `--allow-production` |

File baru: `database/migrations/NNN_nama.sql` + `NNN_nama.down.sql`. DDL MySQL melakukan implicit commit, jadi migrasi yang gagal di tengah perlu dibereskan manual. Backup dulu sebelum migrasi di production.

Migrasi tidak boleh memakai `DELIMITER`, `USE`, atau `CREATE DATABASE`, dan setiap pernyataan diakhiri `;` di akhir baris. Aturan ini dicek oleh `bin/export-sql.php`, supaya file yang sama bisa diimpor lewat phpMyAdmin:

| Perintah | Hasil |
|---|---|
| `php bin/export-sql.php install` | Skema lengkap untuk database **kosong** + tabel `schema_migrations` (definisi sama dengan `Migrator`) berisi semua versi, jadi `migrate.php up` sesudahnya tidak menjalankan ulang |
| `php bin/export-sql.php upgrade 002_nama` | Satu migrasi lanjutan. Pernyataan pertama mencatat versi di `schema_migrations` sekaligus pengaman: gagal sebelum ada perubahan kalau versi itu sudah tercatat atau versi sebelumnya belum ada |
| `php bin/export-sql.php versions` | Daftar versi |

`deploy/build-htdocs.sh` memakai perintah ini untuk `app/install.sql` dan `app/upgrade/NNN_*.sql` di paket htdocs.

## Menjalankan test

```bash
bin/test.sh                          # start DB sandbox, PHPUnit (unit + integrasi), PSR-12, stop DB
bin/test.sh --filter CustomerTest    # argumen diteruskan ke PHPUnit
```

- Integrasi memakai database `jastip_test` yang **dihapus dan dibuat ulang setiap run**. Nama database test wajib berakhiran `_test` (dicek di kode).
- Default `bin/test.sh` memakai PHP dan MariaDB di `../.tools` (sandbox). Di mesin lain:
  ```bash
  PHP_BIN=php DB_SH= TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3306 TEST_DB_USER=root TEST_DB_PASSWORD=... bin/test.sh
  ```
  User test perlu hak `CREATE`/`DROP DATABASE` untuk `jastip_test` dan `jastip_migrasi_test`.
- Tidak ada panggilan jaringan saat test: Frankfurter diganti `tests/Support/StubExchangeRateProvider`.
- Waktu dikendalikan `MutableClock`, jadi kasus 12 jam tidak aktif dan jendela login 15 menit dites tanpa menunggu.
- `KonkurensiTest` menahan kunci dari koneksi kedua, menjalankan request lewat `tests/Support/kernel-request.php` di proses PHP lain, lalu menunggu request itu tertahan kunci (`information_schema.INNODB_TRX`) sebelum commit. User test perlu bisa membaca `INNODB_TRX` (hak `PROCESS` di MySQL 8).

## Konsistensi uang dan request bersamaan

Semua hitungan uang (harga, total, DP, status, batas pengembalian dana, aturan hapus pembayaran) ada di `src/Domain/`. Service hanya membaca data lalu memanggil Domain.

Transaksi tulis keranjang (`Service/KeranjangLocks`):

| Aksi | Kunci, berurutan |
|---|---|
| Tambah barang | `open_po` FOR UPDATE (+ isi `kurs_terkunci_at` jika kosong) → `customer` FOR UPDATE → `keranjang` FOR UPDATE (dibuat jika belum ada) |
| Catat pembayaran | `open_po` LOCK IN SHARE MODE → `customer` FOR UPDATE → `keranjang` FOR UPDATE (dibuat jika belum ada) |
| Catat pengembalian dana | `keranjang` FOR UPDATE → baris pesanan, pembayaran, pengembalian dana FOR UPDATE → `RefundRule` |
| Hapus pembayaran | `keranjang` FOR UPDATE → pembayaran itu → Σ pembayaran / pengembalian FOR UPDATE → `PaymentDeletionRule` |
| Ubah / hapus / Kosong barang, hapus pengembalian dana | `keranjang` FOR UPDATE → baris itu FOR UPDATE |
| Ubah kurs (`PATCH /open-po/{id}`) | `open_po` FOR UPDATE |

- Urutan kunci selalu `open_po → customer → keranjang → baris anak`, supaya tidak ada deadlock.
- Di dalam transaksi tulis hanya ada locking read. Pencarian ID induk (mis. keranjang dari ID pembayaran) dan cek keberadaan PO/customer untuk pengembalian dana dilakukan sebelum transaksi. Dengan begitu validasi selalu memakai data terbaru, juga di MariaDB 11.6+ yang mengaktifkan `innodb_snapshot_isolation` secara default.
- Respons aksi dibaca ulang setelah commit, di satu transaksi baca (snapshot konsisten).

## Konfigurasi

Semua dari environment variable; file `.env` hanya cadangan (lihat `.env.example`). Variabel environment asli selalu menang. Jangan commit `.env`.

| Variabel | Default | Catatan |
|---|---|---|
| `APP_ENV` | `production` | `development`, `staging`, `production`, `testing` |
| `APP_ALLOWED_ORIGINS` | kosong | Origin front-end, dipisah koma. Di production wajib `https://` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | | |
| `SESSION_COOKIE_SECURE` | `true` | `false` ditolak di production |
| `SESSION_IDLE_MINUTES` | `720` | 12 jam tidak aktif |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES` | `5`, `15` | |
| `KURS_API_URL`, `KURS_TIMEOUT_SECONDS` | Frankfurter v2, `5` | |
| `LOG_PATH` | `storage/logs/app.log` | Relatif ke `backend/`, absolut, atau `php://stderr` |

Aplikasi menolak start di production jika cookie tidak Secure atau origin bukan HTTPS.

## Catatan deploy

Untuk XAMPP lokal dan hosting gratis tanpa CLI (InfinityFree) ada paket htdocs siap unggah: `deploy/build-htdocs.sh` dan panduan di [`docs/deploy/jalankan-lokal-xampp.md`](../docs/deploy/jalankan-lokal-xampp.md) dan [`docs/deploy/infinityfree.md`](../docs/deploy/infinityfree.md). Di paket itu web root berisi front-end + `index.php` (front controller ke `app/`), dan kode ini berada di `app/` yang ditolak dari web oleh `.htaccess`. Catatan di bawah untuk server sendiri (VPS) dengan document root `backend/public/`.

1. **HTTPS wajib** (data pribadi customer, cookie `Secure` dan awalan `__Host-`). Arahkan HTTP ke HTTPS di web server.
2. **Document root = `backend/public/`.** Folder lain (`src/`, `.env`, `vendor/`, `storage/`) tidak boleh bisa diakses dari web.
3. Install tanpa dependensi dev: `composer install --no-dev --optimize-autoloader`.
4. Isi environment per server (staging dan production terpisah, database terpisah). Pakai user database dengan hak minimum (lihat contoh `GRANT` di atas; `CREATE/ALTER/DROP` hanya perlu saat migrasi).
5. `php bin/migrate.php up`, lalu `php bin/create-admin.php <nama>`.
6. Pastikan `storage/logs/` bisa ditulis user PHP. Atur rotasi log (logrotate atau hapus berkala).
7. Front-end statis bisa dilayani dari document root yang sama; hanya `/api/*` yang diteruskan ke `index.php`.

Apache: `public/.htaccess` sudah menangani rewrite `/api/*` dan meneruskan header `Authorization`. Nginx:

```nginx
root /var/www/jastip/backend/public;
location /api/ {
    try_files $uri /index.php$is_args$args;
}
location = /index.php {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/index.php;
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
}
location ~ /\. { deny all; }
```

### Backup database

Jadwalkan backup harian, simpan di luar server aplikasi, dan uji restore secara berkala. Contoh cron (kredensial di file opsi, bukan di command line):

```bash
# /etc/cron.d/jastip-backup  (file ~/.jastip-backup.cnf berisi [client] user=… password=…, chmod 600)
15 2 * * * jastip mysqldump --defaults-extra-file=$HOME/.jastip-backup.cnf --single-transaction --routines jastip | gzip > /var/backups/jastip/jastip-$(date +\%F).sql.gz
```

### Monitoring

`GET /api/v1/health` (publik) mengembalikan `200 {"data":{"status":"ok","database":"ok"}}` atau `503`. Log aplikasi berisi kejadian `exception_tidak_tertangani`, `kurs_gagal`, `login_gagal`, `login_diblokir`, dan jejak hard delete `pembayaran_dihapus` / `pengembalian_dana_dihapus` (ID, nominal, ID keranjang) serta `baris_pesanan_dihapus` (ID, ID keranjang), tanpa data customer.

## Keamanan dan privasi

- Query selalu prepared statement (PDO native, `ATTR_EMULATE_PREPARES=false`).
- Kata sandi: `password_hash(PASSWORD_DEFAULT)`, min. 10 karakter, maks. 72 byte (batas bcrypt). Tidak ada kredensial default.
- Token sesi 32 byte acak, di DB hanya hash SHA-256. Cookie `HttpOnly; Secure; SameSite=Strict`.
- Login gagal dibatasi 5 kali per nama pengguna per 15 menit (`429`). Nama pengguna di tabel percobaan disimpan sebagai hash.
- CSRF: cek `Origin` + wajib `Content-Type: application/json` + `SameSite=Strict`.
- Log tidak memuat kata sandi, token, atau data customer. Pesan `PDOException` tidak dicatat (bisa memuat nilai data); yang dicatat SQLSTATE dan lokasi.
- Pencarian customer (`?q=`) dan cek no WA (`?no_wa=`) memakai query string, sehingga bisa tercatat di access log web server. Matikan pencatatan query string atau batasi retensi access log.
