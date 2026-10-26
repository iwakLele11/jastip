# QA bagian A: API, keamanan, perhitungan, rekap WA, paket deploy, MySQL 8

Tanggal uji: 26 Okt 2026. Versi: commit `1e984ff` + `build/jastip-htdocs.zip` (dibangun 08:20 UTC, isinya sama dengan `rilis/jastip-htdocs.zip`, sumber tidak berubah sesudahnya). Bagian B (UI lintas browser dan ukuran layar) belum dikerjakan.

Cara mengulang: `qa/run.sh bagian-a` (lihat [`qa/README.md`](../../qa/README.md)). Hasil mentah: `qa/hasil/*.json`. Bukti bug: [`docs/qa/bukti/`](bukti/).

## Ringkasan

- **854 uji, 832 lulus, 22 gagal.** Semua kegagalan berasal dari 7 bug di bawah. Satu bug bisa menggagalkan uji yang sama di beberapa target.
- **Tidak ada bug Kritis atau Tinggi.** Ada 3 bug Sedang (2 keamanan, 1 MySQL 8) dan 4 bug Rendah.
- Perhitungan uang (harga jual, kurs, DP, status, pengembalian dana, ringkasan PO) cocok penuh dengan oracle `decimal` Python dan pratinjau front-end di semua target. Tidak ada selisih Rp1.
- Paket htdocs di Apache: 128 dari 128 cek lulus di MariaDB 10.11 dan 11.4 (header, 403 file sensitif, listing, `index.php`, Paksa HTTPS, konfigurasi production, install.sql, SQL upgrade, `create-admin.php --sql`).
- Dampak ke rilis (target XAMPP MariaDB 10.11 dan InfinityFree MariaDB 11.4): QA-A-01 (open redirect) dan QA-A-02 (batas login paralel) sebaiknya diperbaiki sebelum rilis, karena aplikasi terbuka di internet dan menyimpan data pribadi customer. QA-A-06 dan QA-A-07 tidak memengaruhi target saat ini. Keputusan blokir rilis ada di product manager. Laporan kesiapan rilis lengkap dibuat setelah bagian B.

| Suite | Target | Lulus / total | Gagal (bug) |
|---|---|---|---|
| `keamanan` | dev-stack (`php -S`, MariaDB 11.4) | 46 / 49 | SEC-D9 (A-02), SEC-G3 (A-05), SEC-M4 (A-04) |
| `keamanan` | paket Apache, MariaDB 10.11 | 43 / 46 | sama |
| `keamanan` | paket Apache, MariaDB 11.4 | 43 / 46 | sama |
| `hitung` | dev-stack, paket 10.11, paket 11.4 | 24 / 24 (×3) | - |
| `rekap` | dev-stack, paket 10.11, paket 11.4 | 14 / 16 (×3) | RKP-15, RKP-16 (A-03) |
| `konkurensi` | dev-stack, paket 10.11, paket 11.4 | 10 / 10 (×3) | - |
| `redirect` | Node + Chromium (dev-stack) | 1 / 4 | RED-01, RED-02, RED-04 (A-01) |
| `paket` | Apache 2.4.69 + PHP-FPM 8.4, MariaDB 10.11 | 128 / 128 | - |
| `paket` | Apache 2.4.69 + PHP-FPM 8.4, MariaDB 11.4 | 128 / 128 | - |
| `mysql8-backend` | `backend/bin/test.sh`, MySQL 8.4.13 | 291 / 293 | SqlExportTest (A-06), MigrationTest (A-07) |
| `mysql8-sql` | SQL paket di MySQL 8.4.13 | 8 / 10 | M8-06, M8-07 (A-06) |
| **Jumlah** | | **832 / 854** | |

Suite `keamanan` di paket punya 3 uji lebih sedikit. SEC-J2 (stub kurs), SEC-K1 (file sensitif di `php -S`), dan bagian L (production lewat `php -S`) hanya ada di dev-stack; padanannya untuk paket ada di `PKT-C*` dan `PKT-F*`.

## Lingkungan

| Komponen | Versi / catatan |
|---|---|
| Dev-stack | `.tools/dev-stack.sh`: PHP 8.4.23 `php -S` (4 worker), MariaDB 11.4 port 3307, DB `jastip_e2e` baru per suite, kurs stub 12673 |
| Paket | `qa/paket/uji-paket.sh`: zip diekstrak ke folder baru, Apache 2.4.69 + PHP-FPM 8.4.26 (4 worker, user `nobody`), `AllowOverride All` dan `Options Indexes FollowSymLinks` seperti XAMPP, `.htaccess` paket dibaca apa adanya, `app/.env` dari `.env.contoh-lokal` |
| Database | MariaDB 10.11.16 (port 3309, sama dengan XAMPP 8.4), MariaDB 11.4 (port 3307), MySQL 8.4.13 LTS (port 3308, sql_mode dan collation bawaan) |
| Klien uji | Node 22.23 (`fetch`), Python 3.11 (`decimal`), Chromium Playwright 1.64.1 (hanya untuk bukti QA-A-01) |

## Matriks cakupan dan hasil

Kolom target: **D** = dev-stack, **P10** / **P11** = paket Apache dengan MariaDB 10.11 / 11.4, **M8** = MySQL 8.4. ✅ lulus, ❌ gagal (ID bug), – tidak dijalankan di target itu.

### 1. Keamanan API dan form

| Area | Yang diuji (ID) | D | P10 | P11 |
|---|---|---|---|---|
| Autentikasi semua endpoint | 29 endpoint tanpa sesi → 401 BELUM_MASUK tanpa data, data tidak berubah; token palsu, path traversal, SQL di cookie, Bearer rusak, Basic; health tanpa data aplikasi (SEC-A1–A3) | ✅ | ✅ | ✅ |
| Cookie | HttpOnly, SameSite=Strict, Path=/, Max-Age=43200, tanpa Domain, token tidak di body; token 64 hex acak; dikirim ulang maks. 1×/menit; session fixation (SEC-B1–B4) | ✅ | ✅ | ✅ |
| Cookie production | `__Host-jastip_sesi … Secure`, logout `Max-Age=0` dengan atribut sama, nama tanpa `__Host-` tidak dipakai (SEC-L1, PKT-C07) | ✅ | ✅ | ✅ |
| Logout dan sesi 12 jam | logout 204 + token mati, logout kedua 401; logout Bearer mobile; 721 menit → SESI_BERAKHIR, 719 menit → aktif dan diperpanjang (SEC-C1–C3) | ✅ | ✅ | ✅ |
| Batas login per nama | pesan sama untuk semua jenis gagal; waktu respons setara (median ±204 ms untuk pengguna ada, tidak ada, dan di luar pola); 5 gagal → 429 + Retry-After ≈ 900 dan pesan menit; huruf besar/spasi satu hitungan (SEC-D1–D4) | ✅ | ✅ | ✅ |
| Variasi Unicode | aksen, fullwidth, soft hyphen, ZWSP, NUL, combining → tidak pernah login, juga dengan sandi benar (SEC-D5, SEC-D6) | ✅ | ✅ | ✅ |
| Batas login per IP | 20 gagal → login ke-21 (sandi benar) 429; login sukses tidak menghapus hitungan IP (SEC-D8) | ✅ | ✅ | ✅ |
| Batas login paralel | 30 / 40 request bersamaan (SEC-D9) | ❌ A-02 | ❌ A-02 | ❌ A-02 |
| Validasi login | field kosong 422, tipe salah, `klien` tidak dikenal, kata sandi 60 KB (SEC-D7) | ✅ | ✅ | ✅ |
| CSRF | 7 Origin asing (termasuk `null`, sufiks, `@`, skema https) → 403 dan data tidak berubah; 8 Content-Type non-JSON → 415; method override (3 cara) → 405; tanpa CORS; Origin sah huruf besar / garis miring akhir diterima (SEC-E1–E5) | ✅ | ✅ | ✅ |
| SQL injection | pencarian dengan payload SQL/LIKE (`%`, `_`, UNION…); 33 parameter query aneh tidak pernah 500; ID di luar INT → 404; payload SQL di semua field teks tersimpan apa adanya, tabel utuh (SEC-F1–F4) | ✅ | ✅ | ✅ |
| XSS tersimpan | 8 payload di nama PO, nama/alamat customer, nama barang, catatan pengembalian: tersimpan apa adanya, keluar sebagai JSON + nosniff di detail, daftar, cari, barang-unik, cek-no-wa, rekap (SEC-X1, SEC-X2). Render di UI → bagian B | ✅ | ✅ | ✅ |
| Open redirect `next` | `nextAman()` + navigasi Chromium (RED-01–RED-04) | ❌ A-01 | – | – |
| Panjang field | batas tepat dan batas+1 untuk 5 field, ASCII dan emoji (SEC-M1) | ✅ | ✅ | ✅ |
| Angka dan format aneh | 79 kasus: nol, negatif, desimal berlebih, eksponen, digit Arab/fullwidth, NaN, kurs > 1 jt, nominal > 1 T, 2^63, tanggal salah, no WA salah → 422 dengan pesan kontrak; pengaturan tidak berubah (SEC-M2) | ✅ | ✅ | ✅ |
| Nilai batas sah | harga 0,01 / 100.000,00, qty 1 / 999, markup 0 / 100 / 12,5, nominal 1 / 1 T, no WA 10 / 14 digit, trim (SEC-M3) | ✅ | ✅ | ✅ |
| Nama tak terlihat | NBSP, U+3000, U+200B di nama wajib (SEC-M4) | ❌ A-04 | ❌ A-04 | ❌ A-04 |
| Unicode / emoji / RTL | round trip dan pencarian emoji (SEC-M5) | ✅ | ✅ | ✅ |
| Body dan JSON | > 64 KB → 413, tepat 65.536 diproses, 65.537 → 413; JSON rusak, terlalu dalam, UTF-8 rusak, surrogate tunggal, BOM, skalar, `{}{}` → 400; float untuk desimal/integer ditolak (SEC-G1, G2, G4) | ✅ | ✅ | ✅ |
| Body `[]` | (SEC-G3) | ❌ A-05 | ❌ A-05 | ❌ A-05 |
| Kirim ganda pembayaran | 5 pembayaran identik bersamaan → semua 201, tercatat konsisten, tanpa 500 (SEC-H1). Kontrak tidak meminta idempotensi; pencegahan hanya di UI (bagian B) | ✅ | ✅ | ✅ |
| Header API | nosniff, `no-store`, `no-referrer`, JSON UTF-8 di 200/401/404; tanpa X-Powered-By (SEC-I1, I2) | ✅ | ✅ | ✅ |
| Kebocoran error | 400–422 tanpa path, SQL, stack trace, atau pantulan input; 502 kurs generik; DB mati → 503/500 generik; konfigurasi production salah → 500 generik (SEC-J1, J2, L2, L3) | ✅ | ✅ | ✅ |
| Isi log | `app.log` tanpa kata sandi, token sesi, atau nama customer (SEC-J3, PKT-C12) | ✅ | ✅ | ✅ |
| Hak akses per peran | Tidak berlaku: aplikasi hanya punya satu peran (admin). Semua akun admin setara (multi-admin di luar scope) | – | – | – |

### 2. Paket htdocs di Apache (`qa/hasil/paket-10.11.json`, `paket-11.4.json`)

| Area | Yang diuji (ID) | P10 | P11 |
|---|---|---|---|
| Header HTML | `/`, `index.html`, `login.html`, `keranjang.html`: X-Frame-Options SAMEORIGIN, nosniff, Referrer-Policy no-referrer, Cache-Control no-cache; `/` melayani `index.html` (PKT-H00, H01) | ✅ | ✅ |
| Header CSS/JS | `app.css?v=…`, `js/pages/*.js?v=…`, `awal.js`: `public, max-age=31536000, immutable` + nosniff; JS ber-Content-Type JavaScript (PKT-H02, H03) | ✅ | ✅ |
| X-Powered-By | tidak ada di HTML, CSS, JS, SVG, API 200/401/404, halaman 403/404, dan skrip PHP polos (PKT-H04) | ✅ | ✅ |
| Header API lewat Apache | no-store, nosniff dan Referrer-Policy tepat sekali, tanpa CORS (PKT-H05, H06) | ✅ | ✅ |
| 403 file sensitif | 48 path, termasuk `/app`, `/app/.env`, `/app/.env.txt`, `/app/install.sql`, `/app/storage/logs/app.log`, `/.htaccess`, `/app/vendor/autoload.php`, `/app/src/…`, `/app/bin/*.php`, `.sql`/`.SQL`/`.log`/`.LOG` di root, `/APP/.env`, `/aPp/…`, `/%61pp/.env`, `/%41PP/…`, `/app/.env/`, `/app/.env.`, `/app/install.sql%20`, `//app/.env`, `/./app/.env`, `/js/../app/.env`, `/index.php/../app/.env`; emulasi nama Windows `/app./…`, `/App%20/…`, `/APP/vendor/…` (PKT-F01–F48); `.well-known` tetap 200 (PKT-F90); isi `.env`/SQL tidak pernah ada di body (PKT-F91) | ✅ | ✅ |
| Listing folder | `/js/`, `/css/`, `/js/pages/`, `/js/lib/`, `/.well-known/` → 403 (PKT-L01) | ✅ | ✅ |
| `index.php` hanya `/api/*` | `/index.php` → 404 JSON, PATH_INFO tidak melayani API, `/api` dan `/api/` → 404 JSON, `/apix` dan `/api.html` → 404 Apache, header Authorization sampai ke PHP (PKT-L02–L06) | ✅ | ✅ |
| Paksa HTTPS | 4 baris diaktifkan seperti panduan: halaman dan API → 301 ke https dengan path + query; di belakang proxy (X-Forwarded-Proto, CF-Visitor) 200 tanpa loop; `.env`/`.htaccess` tetap 403 (PKT-S01–S05) | ✅ | ✅ |
| Production salah | `SESSION_COOKIE_SECURE=false`, origin http, salah satu origin http, `APP_ENV=produksi`, `.env` tersimpan sebagai `.env.txt` → health 500 generik, alasan tercatat di `app/storage/logs/app.log`, tanpa bocor (PKT-C01–C05) | ✅ | ✅ |
| Production benar | health 200, cookie `__Host-…; Secure`, Origin http ditolak, password DB salah → 503 generik, `.env` CRLF dan UTF-8 BOM tetap terbaca (PKT-C06–C11) | ✅ | ✅ |
| `install.sql` | impor ke DB kosong: 11 tabel `utf8mb4_unicode_ci`, `001_init`, pengaturan 10/3/50, CHECK aktif; impor kedua gagal di baris `CREATE TABLE schema_migrations` (error 1050) dan checksum skema/data tidak berubah; `migrate.php status` = sudah (PKT-D00–D08) | ✅ | ✅ |
| SQL upgrade | urutan salah → 1048 `applied_at cannot be null` tanpa perubahan; normal → berhasil; impor ulang → 1062 Duplicate entry; `migrate.php` tidak menjalankan ulang (PKT-U01–U04) | ✅ | ✅ |
| `create-admin.php --sql` | STDOUT 2 komentar + 1 INSERT bcrypt, pesan di STDERR, tanpa kata sandi; impor 1 row; nama tidak valid → exit 2; sandi < 10 / > 72 byte → exit 1; opsi salah → exit 2; INSERT ganda beda huruf → Duplicate entry (PKT-A01–A07) | ✅ | ✅ |
| `--sql --reset` | START TRANSACTION, UPDATE, DELETE sesi, COMMIT; nama beda huruf tetap cocok (1 row); sesi cookie dan token mobile lama → 401, sandi lama 401, sandi baru 200; nama salah → 0 rows (PKT-A10–A14) | ✅ | ✅ |
| Error log Apache | tanpa error tak terduga (PKT-E01) | ✅ | ✅ |

### 3. Perhitungan (`qa/hasil/hitung*.json`)

| Area | Yang diuji (ID) | D | P10 | P11 |
|---|---|---|---|---|
| Harga jual | 443 kasus (400 acak seed `20261126`, 23 batas, 20 tepat kelipatan): AUD 0,01 / 100.000,00, markup 0 / 100 / 2 desimal, qty 1 / 999, kurs 1 / 7 / 999 / 1.000 / 1.001 / … / 1.000.000; pratinjau `harga.js` == oracle termasuk angka "Rincian hitungan" (CALC-A1); server == oracle, total keranjang benar (CALC-B1) | ✅ | ✅ | ✅ |
| Pratinjau vs validasi | pratinjau kosong tepat untuk input yang ditolak server (CALC-A2) | ✅ | ✅ | ✅ |
| Ubah barang | 25 PATCH acak dihitung ulang dengan kurs snapshot; `{}` tidak mengubah (CALC-B2) | ✅ | ✅ | ✅ |
| Vektor dokumen | kontrak §12.1 dan tabel scope A/B/C (CALC-C1) | ✅ | ✅ | ✅ |
| Kurs jastip | 67 kasus kurs pasar ≤ 6 desimal × buffer 0–100% == oracle, termasuk 13.054 / 10.300 / 13.118 / 1.000.000; `kurs_jastip` klien diabaikan (CALC-K1); pratinjau kurs memakai buffer terbaru, Frankfurter gagal → 502 (CALC-K2, hanya D); manual tanpa buffer (CALC-K3) | ✅ | ✅ | ✅ |
| DP | 70 kasus DP % 0 / 0,01 / 49,99 / 50 / 50,01 / 33,33 / 37,5 / 100 == oracle (CALC-D1) | ✅ | ✅ | ✅ |
| 5 status dan transisi | maju sesuai vektor kontrak §12.2 (CALC-E1); mundur, batas tepat DP dan DP − 1 (CALC-E2); total Rp0 (CALC-E3); jalan acak 150 aksi di 6 keranjang (DP % dan kurs berbeda): ringkasan, `bisa_dihapus`, kode 409/422 == oracle (CALC-E4) | ✅ | ✅ | ✅ |
| Pengembalian dana | bukan Lebih bayar → 409; > kelebihan → 422 dengan nominal; = kelebihan → Lunas; 0/negatif → 422; tanpa keranjang → 409 dan keranjang tidak dibuat (CALC-F1, F3) | ✅ | ✅ | ✅ |
| Hapus pembayaran diblokir | 409 HAPUS_PENGEMBALIAN_DULU dengan pesan dialog; setelah refund dihapus → bisa (CALC-F2) | ✅ | ✅ | ✅ |
| Kurs terkunci | terkunci sejak barang pertama, tetap setelah semua barang dihapus, konflik membatalkan seluruh PATCH (CALC-G1); request gagal tidak mengunci, pembayaran saja tidak mengunci (CALC-G2); sebelum terkunci memakai buffer terbaru, DP % tidak bisa diubah (CALC-G3) | ✅ | ✅ | ✅ |
| Snapshot pengaturan | PO, baris, DP, dan PATCH baris lama tidak berubah; PO baru memakai nilai baru (CALC-H1) | ✅ | ✅ | ✅ |
| Customer diarsipkan | tetap di PO lama, keranjang lama bisa diubah/dibayar, PO baru 409, hilang dari daftar/cari/cek-no-wa, hapus 409, arsip idempoten; hapus customer tanpa pesanan (CALC-I1, I2) | ✅ | ✅ | ✅ |
| Ringkasan PO | 8 keranjang di 5 status: ringkasan, urut A–Z, filter, `jumlah_per_status`, pagination, refund mengubah ringkasan, `jumlah_per_status` Open PO, urutan buka/selesai (CALC-J1) | ✅ | ✅ | ✅ |
| Skenario scope | kurs 12.673 + 3% → 13.054, rincian A/B/C, langkah 1–5, urutan riwayat (CALC-S1) | ✅ | ✅ | ✅ |

### 4. Rekap WA (`qa/hasil/rekap*.json`)

| Area | Yang diuji (ID) | D | P10 | P11 |
|---|---|---|---|---|
| Format per status | teks persis blok contoh ui-spec §9.6 untuk Belum bayar, Kurang DP, DP, Lunas, Lebih bayar, Lunas setelah pengembalian (dibaca langsung dari `ui-spec.md`) (RKP-01–06) | ✅ | ✅ | ✅ |
| Angka identik layar | setiap baris rekap == ringkasan dan barang keranjang (RKP-07); hapus refund / lepas Kosong / hapus pembayaran mengembalikan teks (RKP-08) | ✅ | ✅ | ✅ |
| Variasi | DP 37,5% / 12,34% / 0% / 100% dengan koma (RKP-09); tanpa barang dan keranjang belum ada (RKP-10); Rp1.000.000.000.000 dan semua Kosong (RKP-11); customer diarsipkan (RKP-12) | ✅ | ✅ | ✅ |
| Nama berisi baris baru / tab / CR / U+2028 / spasi ganda | diringkas jadi satu spasi (RKP-13) | ✅ | ✅ | ✅ |
| Nama sangat panjang + emoji | PO 100, customer 100, barang 150 karakter (RKP-14) | ✅ | ✅ | ✅ |
| Nama dengan `*`, `_`, `~`, `` ` ``, emoji | judul tebal (RKP-15), format tidak diminta di baris Customer/barang (RKP-16) | ❌ A-03 | ❌ A-03 | ❌ A-03 |

### 5. MySQL 8.4 (`qa/hasil/mysql8-backend.json`, `mysql8-sql.json`)

| Kelas / cek | Hasil |
|---|---|
| Unit: PhpPasswordHasher 3, Username 24, CartCalculator 16, DecimalParser 26, Pricing 13, RekapWa 9, WhatsAppNumber 18 | ✅ 109 / 109 |
| Integrasi: Auth 28, CreateAdminSql 3, Customer 17, HttpProtection 7, HttpSmoke 2, Keranjang 8, KeranjangValidasi 46, Konkurensi 7, LoginPembatasan 6, OpenPoCustomer 5, OpenPo 19, Pembayaran 6, SettingsAndKurs 22 | ✅ 176 / 176 |
| `MigrationTest` (2) | ❌ 1 gagal: `testConstraintMenolakDataSalah` (A-07) |
| `SqlExportTest` (6) | ❌ 1 gagal: `testUpgradeSqlDenganPengaman` (A-06) |
| phpcs PSR-12 | ✅ |
| SQL paket di MySQL 8.4 (M8-00–M8-09) | ✅ 8 / 10; M8-06, M8-07 gagal (A-06) |

### 6. Konkurensi dasar (`qa/hasil/konkurensi*.json`)

Setiap skenario diulang 10–20 putaran dengan pola urutan bergantian (bersamaan, A lalu B, B lalu A), supaya kedua hasil yang sah benar-benar terjadi.

| Skenario (ID) | Hasil yang teramati | D | P10 | P11 |
|---|---|---|---|---|
| Dua pembayaran pertama bersamaan, customer tanpa keranjang (KON-01) | 201/201, satu keranjang, Σ benar | ✅ | ✅ | ✅ |
| Dua barang pertama bersamaan; barang + pembayaran pertama bersamaan (KON-02) | 201/201, satu keranjang, kurs terkunci | ✅ | ✅ | ✅ |
| Dua refund 60.000 dengan kelebihan 100.000; 4 refund 30.000 (KON-03) | tepat satu 201 + satu 422; tepat tiga 201 | ✅ | ✅ | ✅ |
| Hapus pembayaran vs catat refund (KON-04) | "refund 409, hapus 200" (7) dan "refund 201, hapus 409" (3); dana tidak pernah negatif | ✅ | ✅ | ✅ |
| Dua hapus pembayaran saat ada refund (KON-05) | maks. satu terhapus | ✅ | ✅ | ✅ |
| Lepas Kosong vs refund penuh kelebihan (KON-06) | kedua urutan teramati, hasil akhir sah | ✅ | ✅ | ✅ |
| Ubah kurs vs barang pertama, 20 putaran (KON-07) | "PATCH 200 → barang kurs baru" (12–13 putaran) dan "PATCH 409 → barang kurs lama" (7–8 putaran); kurs PO selalu == kurs barang | ✅ | ✅ | ✅ |
| Dua PATCH kurs + dua barang pertama (KON-08) | semua barang memakai kurs PO akhir | ✅ | ✅ | ✅ |
| Hapus customer vs barang/pembayaran pertama (KON-09) | (204, 404) atau (409, 201); tidak ada keranjang yatim | ✅ | ✅ | ✅ |
| Arsipkan customer vs barang pertama di PO baru (KON-10) | (200, 409, kurs tidak terkunci) atau (200, 201) | ✅ | ✅ | ✅ |

## Daftar bug

### QA-A-01: Open redirect setelah login lewat `next` dengan segmen titik

| | |
|---|---|
| Keparahan | **Sedang** (keamanan) |
| Untuk | front-end-developer |
| Lokasi | `frontend/src/js/lib/rute.js` `nextAman()` baris 34 dan 45; dipakai `frontend/src/js/pages/login.js` baris 17 dan 63 |
| Environment | Node 22 (unit), Chromium Playwright 1.64.1 di dev-stack. Berlaku di semua deploy karena logika ada di front-end |

Langkah reproduksi:

1. Buka `https://<situs>/login.html?next=/..//evil.example/index.html` (juga `/.//evil.example/…`, `/%2e%2e//…`, `/a/..//…`).
2. Masuk dengan nama pengguna dan kata sandi yang benar.

Harapan: setelah login tetap di origin aplikasi (Open PO). Komentar `nextAman()` sendiri menyebut tujuan `//host` harus ditolak.

Aktual: `nextAman()` mengecek `startsWith('//')` sebelum URL dinormalisasi, lalu mengembalikan `url.pathname` hasil normalisasi, yaitu `//evil.example/index.html`. `location.replace()` membacanya sebagai URL relatif-protokol, dan browser pindah ke `https://evil.example/index.html`. Dibuktikan di Chromium (request ke domain penyerang dicegat oleh uji, tidak benar-benar dikirim).

Dampak: tautan login dengan domain asli bisa membawa admin ke halaman penyerang tepat setelah login, mis. halaman "Sesi berakhir, masuk lagi" palsu untuk mencuri kata sandi.

Bukti: [`bukti/QA-A-01-open-redirect.txt`](bukti/QA-A-01-open-redirect.txt), [`bukti/open-redirect-next.png`](bukti/open-redirect-next.png); `qa/hasil/redirect.json` RED-01, RED-02, RED-04.

Saran: tolak hasil yang `pathname`-nya diawali `//`, atau kembalikan `url.href` (origin sudah dicek); tambahkan payload di atas ke `tests/unit/rute.test.mjs`.

### QA-A-02: Batas login gagal bisa dilewati dengan request paralel

| | |
|---|---|
| Keparahan | **Sedang** (keamanan) |
| Untuk | back-end-developer |
| Lokasi | `backend/src/Auth/AuthService.php` `login()` baris 72–78: `guardThrottle()` menghitung, lalu `password_verify`, lalu `attempts->record()`, tanpa kunci atau transaksi; `backend/src/Repository/LoginAttemptRepository.php` |
| Environment | dev-stack (`php -S`, 4 worker) dan paket Apache + PHP-FPM (4 worker), MariaDB 10.11 dan 11.4 |

Langkah reproduksi:

1. Buat akun admin uji.
2. Kirim 30 `POST /api/v1/auth/login` bersamaan untuk akun itu dengan kata sandi salah.
3. Hitung respons 401 (sandi benar-benar diperiksa) dan 429.
4. Ulangi dengan 40 nama pengguna berbeda dari IP yang sama.

Harapan (kontrak §4, `backend/README.md`): maksimal 5 percobaan diperiksa per nama pengguna dan 20 per IP per 15 menit. Sisanya 429.

Aktual: paket Apache: 8 dari 30 tebakan diperiksa (3 dari 3 putaran, di 10.11 dan 11.4), per IP 20–22 dari 40. Dev-stack: per nama 5–7, per IP 20–24. Semua request yang lolos cek sebelum percobaan pertama tercatat ikut diperiksa, jadi jumlah tebakan ekstra kira-kira sebanyak worker PHP yang melayani bersamaan. Server dengan lebih banyak worker memberi celah lebih besar.

Dampak: perlindungan brute force melemah sebanding dengan konkurensi server. Kata sandi minimal 10 karakter dan tantangan browser InfinityFree membatasi risiko praktis, tetapi jaminan "5 per 15 menit" di kontrak tidak berlaku.

Bukti: [`bukti/QA-A-02-login-paralel.txt`](bukti/QA-A-02-login-paralel.txt); SEC-D9 di `keamanan.json`, `keamanan-paket-10.11.json`, `keamanan-paket-11.4.json`.

Saran: jadikan cek + catat atomik, mis. catat percobaan sebelum `password_verify` (dan hapus saat sukses) di dalam kunci per kunci hash (`GET_LOCK()` atau baris kunci `FOR UPDATE`).

### QA-A-03: Tanda `*` di nama Open PO merusak judul tebal rekap WA

| | |
|---|---|
| Keparahan | **Rendah** |
| Untuk | back-end-developer (aturan teks perlu disepakati dengan product-manager / ui-ux-designer) |
| Lokasi | `backend/src/Domain/RekapWa.php` baris 43–49: nama PO, customer, dan barang disisipkan apa adanya; `singleLine()` hanya meringkas spasi |
| Environment | semua target (dev-stack, paket 10.11, paket 11.4) |

Langkah reproduksi:

1. Buat Open PO bernama `PO *Spesial* Nov` (atau `PO Nov 2026*`, `*PO Nov 2026`, `PO 5* Nov`).
2. Tambah satu barang untuk customer mana pun.
3. `GET /api/v1/open-po/{id}/keranjang/{customer_id}/rekap`.

Harapan: ui-spec §9.6: judul `*REKAP JASTIP - {nama}*` tebal utuh, `*` menempel ke teks dan setiap pasangan `*` di satu baris. Scope M7: "Huruf tebal WA (`*teks*`) tampil benar". Tugas QA bagian A meminta ini dicatat sebagai bug.

Aktual: judul menjadi `*REKAP JASTIP - PO *Spesial* Nov*`, `*REKAP JASTIP - PO Nov 2026**`, `*REKAP JASTIP - *PO Nov 2026*`, `*REKAP JASTIP - PO 5* Nov*`. Jumlah `*` di baris itu jadi 3 atau 4, sehingga WA menutup tebal di tempat yang salah atau menampilkan `*` mentah. Nama customer dan barang seperti `Rina *VIP*`, `Tas *Promo*`, `Sepatu _Nike_`, `Jaket ~Diskon~`, ``Kaos ```XL``` `` akan ikut ditebalkan, dimiringkan, dicoret, atau monospace di WA. Garis bawah, tilde, backtick, dan emoji di nama PO tidak merusak judul tebal. Nama PO yang hanya berisi spasi Unicode juga merusak judul (lihat QA-A-04).

Bukti: [`bukti/QA-A-03-rekap-tanda-bintang.txt`](bukti/QA-A-03-rekap-tanda-bintang.txt); RKP-15, RKP-16. Render di aplikasi WhatsApp asli tidak bisa diuji (lihat bagian terakhir).

Saran: sepakati aturan, mis. ganti `*` di nama dengan `∗` (U+2217) atau buang, atau tolak `*` di nama Open PO; tambah kasus di `RekapWaTest`.

### QA-A-04: Nama wajib bisa diisi spasi Unicode atau karakter tak terlihat

| | |
|---|---|
| Keparahan | **Rendah** |
| Untuk | back-end-developer |
| Lokasi | `backend/src/Http/Validator.php` `text()` baris 44 dan 49: `trim()` PHP hanya membuang spasi ASCII. Berlaku untuk `customer.nama`, `open_po.nama`, `nama_barang` |
| Environment | semua target |

Langkah reproduksi: `POST /api/v1/customer` dengan `{"nama": "\u00A0", "no_wa": "081234567890"}`. Ulangi dengan `"\u3000"` dan `"\u200B"`, juga untuk `POST /api/v1/open-po` dan baris pesanan.

Harapan: 422 "Nama wajib diisi." (dan pesan wajib yang sesuai untuk PO/barang), sama seperti untuk `"   "`. Validasi harus tetap berlaku di server.

Aktual: 201, nama tersimpan sebagai karakter tak terlihat. Rekap menjadi `*REKAP JASTIP - *` (tebal rusak), `Customer:  (0812…)` (spasi ganda), dan `1. ` (spasi di akhir baris, melanggar ui-spec §9.6). Lewat form UI, `String.trim()` JavaScript sudah membuang NBSP dan U+3000 tetapi tidak U+200B.

Bukti: [`bukti/QA-A-04-nama-tak-terlihat.txt`](bukti/QA-A-04-nama-tak-terlihat.txt); SEC-M4.

### QA-A-05: Body JSON `[]` diterima sebagai objek kosong

| | |
|---|---|
| Keparahan | **Rendah** |
| Untuk | back-end-developer |
| Lokasi | `backend/src/Http/Request.php` `json()` baris 99: `[]` lolos karena cek `array_is_list` hanya untuk array tidak kosong |
| Environment | semua target |

Langkah reproduksi: `POST /api/v1/customer` dengan body `[]` dan `Content-Type: application/json`; `PATCH /api/v1/pengaturan` dengan body `[]`.

Harapan (kontrak §1.5): 400 `JSON_TIDAK_VALID` "Body harus berupa objek JSON.", sama seperti `[1,2]` dan `"x"`.

Aktual: POST → 422 VALIDASI (field wajib); PATCH → 200 tanpa perubahan. Tidak ada data salah tersimpan; hanya tidak sesuai kontrak untuk klien lain (mis. aplikasi mobile nanti).

Bukti: [`bukti/QA-A-05-body-array-kosong.txt`](bukti/QA-A-05-body-array-kosong.txt); SEC-G3.

### QA-A-06: SQL upgrade tidak bisa dijalankan di MySQL 8 (error 1093 di pernyataan pengaman)

| | |
|---|---|
| Keparahan | **Sedang** (fitur upgrade lewat phpMyAdmin rusak di platform yang disebut didukung; ada jalan lain lewat CLI; tidak memengaruhi target saat ini) |
| Untuk | back-end-developer |
| Lokasi | `backend/src/Infrastructure/MigrationSqlExport.php` `upgrade()` baris 89–90 (`INSERT … VALUES (…, (SELECT … FROM schema_migrations …))`) |
| Environment | MySQL 8.4.13, sql_mode dan collation bawaan |

Langkah reproduksi:

1. DB MySQL 8.4 berisi `install.sql` (001_init).
2. Buat migrasi contoh `002_*.sql`, lalu `php bin/export-sql.php upgrade 002_*` (sama dengan yang dipakai `deploy/build-htdocs.sh` untuk `app/upgrade/`).
3. Impor SQL itu.

Harapan (`backend/README.md`: "MySQL 8.0.16+ atau MariaDB 10.6+"; panduan update InfinityFree): pernyataan pertama hanya gagal kalau versi sudah tercatat (1062) atau versi sebelumnya belum ada (1048); kasus normal berhasil.

Aktual: kasus normal pun gagal dengan `ERROR 1093 (HY000): You can't specify target table 'schema_migrations' for update in FROM clause`. Gagalnya aman (tidak ada perubahan), tetapi upgrade tidak pernah bisa jalan, dan pesan ini tidak ada di panduan. Di MariaDB 10.11 dan 11.4 perilakunya benar (PKT-U01–U04). `SqlExportTest::testUpgradeSqlDenganPengaman` gagal di MySQL 8 karena hal yang sama.

Dampak saat ini: paket belum punya file upgrade (baru 001_init), dan target user (XAMPP MariaDB 10.11, InfinityFree MariaDB 11.4) tidak terdampak. Yang terdampak: hosting MySQL 8 tanpa CLI begitu migrasi 002 dirilis. Server dengan CLI bisa memakai `bin/migrate.php up`.

Bukti: [`bukti/QA-A-06-mysql8-upgrade-1093.txt`](bukti/QA-A-06-mysql8-upgrade-1093.txt); `mysql8-sql.json` M8-06, M8-07; `mysql8-backend.json`.

### QA-A-07: `MigrationTest` mengharapkan SQLSTATE 23000 yang khas MariaDB

| | |
|---|---|
| Keparahan | **Rendah** (test tidak portabel; perilaku aplikasi benar) |
| Untuk | back-end-developer |
| Lokasi | `backend/tests/Integration/MigrationTest.php` baris 74, 94, 102, 109 (`assertSame('23000', $e->getCode())`) |
| Environment | MySQL 8.4.13 |

Langkah reproduksi: `qa/run.sh mysql8` (atau `qa/mysql8/test-backend-mysql8.sh --filter MigrationTest`).

Harapan: suite hijau di MySQL 8 sesuai klaim README.

Aktual: `testConstraintMenolakDataSalah` gagal: MySQL 8 menolak data dengan `3819 Check constraint … is violated` dan SQLSTATE `HY000`, sedangkan MariaDB memakai `23000`. Constraint tetap ditegakkan (M8-04), dan `backend/src` tidak bergantung pada SQLSTATE ini.

Catatan: developer menyebut kedua kegagalan MySQL 8 disebabkan error 1093. Hanya `SqlExportTest` yang karena 1093; `MigrationTest` karena perbedaan SQLSTATE.

Bukti: [`bukti/QA-A-07-mysql8-sqlstate-check.txt`](bukti/QA-A-07-mysql8-sqlstate-check.txt).

## Temuan spesifikasi

Perilaku di bawah sesuai dokumen, jadi tidak dicatat sebagai bug. Dokumennya yang perlu ditinjau.

| ID | Dokumen | Temuan | Saran |
|---|---|---|---|
| TS-A-01 | Kontrak §4 (pembatasan login), panduan XAMPP/InfinityFree | "Saat terblokir, kata sandi yang benar pun ditolak", dan panduan memakai nama `pemilik` sebagai contoh. Siapa pun yang tahu nama itu bisa mengunci admin terus-menerus dengan 5 request per 15 menit, dari IP mana pun (SEC-D3 membuktikan blokir berlaku untuk sandi benar). | Putuskan apakah risiko ini diterima. Mis. sarankan nama yang tidak mudah ditebak di panduan, atau sediakan jalan pemulihan. |
| TS-A-02 | Scope M2, kontrak §5 (DP 0–100%) | DP 0% diizinkan, tetapi rekap Belum bayar lalu menulis `*Mohon transfer DP: Rp0*`, dan pembayaran berapa pun langsung berstatus DP (RKP-09). Sesuai rumus, tetapi kata-kata untuk DP 0% belum diatur. | Tentukan teks rekap untuk DP 0%, atau batasi DP minimal. |
| TS-A-03 | Kontrak §10 (`tanggal` `YYYY-MM-DD`) | Tanggal tidak dibatasi rentang: `0000-01-01`, `0001-01-01`, `9999-12-31` diterima. Salah ketik tahun (mis. 2062) akan naik ke paling atas riwayat. | Pertimbangkan rentang wajar, mis. ±1 tahun dari hari ini. |
| TS-A-04 | `scope-mvp.md` "Format rekap WA" vs ui-spec §9.6 | Contoh di scope masih draf lama ("(Kosong)", "DP diterima ✅", "Kelebihan bayar (dikembalikan)", no WA disamarkan). Kontrak sudah menyebut ui-spec sebagai sumber kebenaran, dan uji memakai ui-spec. | Tandai blok di scope sebagai draf usang supaya UAT tidak bingung. |
| TS-A-05 | `backend/README.md`, `README.md` | Menyebut MySQL 8 didukung, tetapi `bin/test.sh` tidak hijau di MySQL 8.4 (QA-A-06, QA-A-07). | Perbaiki bug, atau sebut MySQL 8 belum teruji sampai suite hijau. |
| TS-A-06 | `deploy/htdocs/.htaccess`, panduan InfinityFree | Tidak ada header `Strict-Transport-Security` walaupun HTTPS wajib. Dokumen tidak memintanya. | Pertimbangkan HSTS di blok "Paksa HTTPS" setelah HTTPS stabil. |
| TS-A-07 | `deploy/htdocs/.htaccess` | `FilesMatch` hanya menolak `.sql` dan `.log`. Backup phpMyAdmin terkompresi (`.sql.gz`, `.sql.zip`) yang tertaruh di `htdocs` akan bisa diunduh (dibaca dari pola, tidak diuji). Panduan sudah menyuruh menyimpan backup di luar hosting. | Pertimbangkan menambah `gz`/`zip`/`bak`. |

## Hal yang tidak bisa diuji

| Hal | Alasan / yang dilakukan sebagai gantinya |
|---|---|
| Tampilan rekap di aplikasi WhatsApp | Tidak ada klien WhatsApp di sandbox. Aturan tebal diperiksa dari teks terhadap ui-spec §9.6. |
| InfinityFree sungguhan | Tidak ada akun/jaringan ke hosting. Belum teruji: tantangan `__test` dari server asli (simulasi dev-router dipakai di bagian B), konfigurasi Apache/mod_security dan MariaDB 11.4 hosting, `REMOTE_ADDR` di belakang proxy (batas per IP), TLS dan cookie `Secure` di browser, batas ukuran file dan inode. |
| XAMPP di Windows | Tidak ada Windows. Belum teruji: mod_php (uji memakai PHP-FPM; jalur `Header unset X-Powered-By` tanpa `always` khusus mod_php), nama pendek 8.3 (mis. `HTACCE~1`), NTFS ADS (`::$DATA`), dan perilaku nama file Windows yang sebenarnya. Huruf besar/kecil dan titik/spasi di akhir nama folder hanya ditiru dengan symlink. |
| phpMyAdmin | Impor diuji dengan klien `mariadb`/`mysql` yang juga berhenti di error pertama. Parser phpMyAdmin tidak diuji. |
| `create-admin.php` interaktif | Hanya input lewat pipe. Prompt TTY (`stty -echo`) dan peringatan Windows tidak diuji. |
| Frankfurter asli | Dev-stack memakai stub tetap 12673; kurs pasar > 6 desimal (pembulatan half-up) hanya tercakup unit test back-end. |
| Sesi 12 jam secara waktu nyata | Disimulasikan dengan memundurkan `terakhir_aktif_at` di DB. |
| Konkurensi > 4 worker | Server uji punya 4 worker. Celah QA-A-02 bisa lebih besar di server dengan lebih banyak worker; tidak diukur. |
| Suite API terhadap MySQL 8 | Hanya PHPUnit back-end (integrasi lewat Kernel) dan SQL paket. Suite Node tidak dijalankan ke MySQL 8. |
| Render XSS, kirim ganda di UI, open redirect di Safari/Edge | Bagian B. |

## Catatan perubahan skrip QA

- `qa/lib/klien.mjs`: fallback kata sandi dihapus; `APP_URL`, `ADMIN_USER`, `ADMIN_PASSWORD` wajib dari env. Akun uji tambahan memakai kata sandi acak per run.
- `qa/api/keamanan.mjs`: tabel `percobaan_login` dikosongkan sebelum setiap uji yang butuh login baru, jadi SEC-L1 tidak lagi gagal 429 karena batas IP. SEC-D6 disesuaikan dengan perbaikan developer (variasi Unicode tidak pernah login). Cek header HTML lama (SEC-I4/I5) dipindah ke paket Apache (`PKT-H*`), karena `php -S` dev memang tidak mengirim header itu.
- Baru: `qa/run.sh`, `api/rekap.mjs`, `api/konkurensi.mjs`, `frontend/next-redirect.mjs`, `paket/uji-paket.sh`, `mysql8/sql-mysql8.sh`, `mysql8/junit-ke-json.py`, `lib/hasil.sh`, `tools/ringkasan.py`, `tools/bukti.mjs`.
- Temuan yang sudah diperbaiki developer dan diuji ulang lulus: SEC-D2 (beda waktu login), SEC-D5/D6 (Unicode), SEC-I2 (X-Powered-By), batas 20 / IP (SEC-D8).
