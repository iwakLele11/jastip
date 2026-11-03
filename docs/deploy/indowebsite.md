# Memasang Jastip Admin di Indowebsite (cPanel)

Panduan ini memasang aplikasi di hosting Indowebsite yang memakai **cPanel**, supaya bisa
dibuka lewat `https://` dari HP dan laptop. Ditulis untuk kondisi cPanel yang **tidak punya
menu Terminal** dan di halaman **Select PHP Version tidak ada tab Extensions**. Semua langkah
dilakukan lewat halaman cPanel, phpMyAdmin, dan File Manager (atau FileZilla).

Yang dibutuhkan:

- File paket **`jastip-htdocs.zip`**. Unduh dari folder [`rilis/`](../../rilis/) di repository
  GitHub (buka filenya, lalu klik **Download raw file**), atau buat sendiri dengan
  `deploy/build-htdocs.sh`.
- Laptop Windows dengan **XAMPP** terpasang (lihat langkah 1 di
  [jalankan-lokal-xampp.md](jalankan-lokal-xampp.md)). Dipakai sekali saja untuk menjalankan PHP
  membuat akun admin. Apache dan MySQL XAMPP tidak perlu dinyalakan.
- Akses login **cPanel** Indowebsite.

Contoh domain di panduan ini: **`bagasimel.my.id`**.

---

## 1. Atur versi PHP ke 8.2 atau lebih baru (WAJIB)

Aplikasi menolak jalan di bawah PHP 8.2. Error "Terjadi kesalahan di server" dengan pesan
`Your Composer dependencies require a PHP version ">= 8.2.0"` berarti versi PHP masih terlalu rendah.

1. Di cPanel, buka **Select PHP Version** (bisa juga bernama **MultiPHP Manager**).
2. Pilih versi **8.2** atau **8.3**, lalu simpan (**Set as current** / **Apply**).
3. cPanel ini tidak punya tab **Extensions**. Pada shared hosting cPanel, ekstensi yang dibutuhkan
   aplikasi (`pdo_mysql`, `mbstring`, `curl`, `json`) hampir selalu **sudah aktif secara bawaan**
   pada PHP 8.2/8.3. Cara memastikannya ada di [Checklist](#checklist-setelah-pemasangan)
   (buka `/api/v1/health`). Kalau ternyata ada ekstensi yang mati, hubungi CS Indowebsite untuk
   mengaktifkannya — di panel ini tidak ada tombol untuk itu.

## 2. Pastikan HTTPS (SSL) aktif

Aplikasi **wajib** dibuka lewat `https://`. Lewat `http://`, login akan ditolak.

1. Di cPanel buka **SSL/TLS Status** (atau **Let's Encrypt SSL**).
2. Pastikan `bagasimel.my.id` (dan `www.bagasimel.my.id` kalau dipakai) berstatus punya
   sertifikat aktif. Kalau belum, jalankan **Run AutoSSL** / terbitkan Let's Encrypt, lalu tunggu
   sampai aktif.
3. Cek di browser: `https://bagasimel.my.id` tidak boleh ada peringatan "Not secure".

## 3. Buat database MySQL

1. Di cPanel buka **MySQL Databases** (atau jalankan **MySQL Database Wizard**).
2. **Create New Database**, mis. `jastip`. Nama jadi berawalan nama akun, mis. `namaakun_jastip`.
3. **Add New User**: buat user, mis. `jastip`, dengan password kuat. Nama jadi `namaakun_jastip`.
4. **Add User To Database**: pilih user dan database tadi, lalu beri **ALL PRIVILEGES**.
5. Catat empat nilai ini (punyamu pasti berbeda):

   | Nilai | Contoh | Dipakai untuk |
   |---|---|---|
   | Host | `localhost` | `DB_HOST` |
   | Database | `namaakun_jastip` | `DB_NAME` |
   | Username | `namaakun_jastip` | `DB_USER` |
   | Password | (yang kamu buat) | `DB_PASSWORD` |

   Di cPanel `DB_HOST` biasanya **`localhost`** (beda dengan InfinityFree).

## 4. Impor `install.sql` lewat phpMyAdmin

1. Di laptop, ekstrak `jastip-htdocs.zip` (klik kanan → **Extract All…**), mis. ke
   `C:\Users\NamaAnda\Downloads\jastip-htdocs`. Folder ini dipakai sampai selesai.
2. Di cPanel buka **phpMyAdmin**. Di panel kiri, klik database `namaakun_jastip`.
3. Klik tab **Import** → **Choose File** → pilih `app\install.sql` dari folder hasil ekstrak → **Go**.
4. Harus muncul **"Import has been successfully finished"** dan database berisi 11 tabel
   (termasuk `admin` dan `schema_migrations`).

`install.sql` hanya untuk database **kosong**. Error `Table 'schema_migrations' already exists`
berarti database sudah terisi; buat database baru yang kosong dan impor ke sana.

## 5. Buat akun admin (SQL dibuat di laptop)

cPanel ini tidak punya Terminal, jadi SQL akun admin dibuat di laptop dengan PHP dari XAMPP, lalu
ditempel di phpMyAdmin. Cara ini sama seperti di InfinityFree.

1. Buka **XAMPP Control Panel** → klik **Shell**.
2. Masuk ke folder hasil ekstrak, lalu tulis SQL admin ke file di folder **di atasnya**
   (`..\admin.sql`, supaya tidak ikut terunggah):

   ```bat
   cd /d C:\Users\NamaAnda\Downloads\jastip-htdocs
   php app\bin\create-admin.php pemilik --sql > ..\admin.sql
   ```

   - `pemilik` = nama pengguna untuk login (3–50 karakter: huruf, angka, titik, garis bawah, tanda hubung).
   - Ketik **Kata sandi** dua kali. Minimal 10 karakter.
   - Di Windows ketikan kata sandi terlihat di layar (skrip memberi peringatan). Pastikan tidak ada yang melihat.
   - Skrip ini tidak menghubungi database. `admin.sql` berisi nama pengguna dan hash kata sandi, bukan kata sandinya.
3. Buka file: `notepad ..\admin.sql`. Pilih semua (**Ctrl+A**), salin (**Ctrl+C**).
4. Di phpMyAdmin (database yang sama), klik tab **SQL**, tempel (**Ctrl+V**), klik **Go**.
5. Harus muncul **"1 row inserted."**
6. Hapus file itu dari laptop (`del ..\admin.sql`), dan jangan kirim isinya lewat chat atau email.

Lupa kata sandi nanti? Ulangi dengan `php app\bin\create-admin.php pemilik --sql --reset > ..\admin.sql`.
SQL-nya berisi `UPDATE` kata sandi dan penghapusan semua sesi lama. Setelah **Go**, pastikan baris
`UPDATE` menghasilkan **1 row affected** (0 berarti nama pengguna salah ketik).

## 6. Isi konfigurasi `app\.env` (di laptop, sebelum diunggah)

1. Di jendela Shell XAMPP (masih di folder hasil ekstrak):

   ```bat
   copy app\.env.contoh-indowebsite app\.env
   notepad app\.env
   ```

2. Ganti semua nilai yang diawali `GANTI_`:

   ```ini
   APP_ENV=production
   APP_ALLOWED_ORIGINS=https://bagasimel.my.id
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=namaakun_jastip
   DB_USER=namaakun_jastip
   DB_PASSWORD=password-mysql-anda
   SESSION_COOKIE_SECURE=true
   ```

   - `APP_ALLOWED_ORIGINS` persis seperti alamat di address bar: diawali `https://`, tanpa `/` di akhir.
   - Kalau situs juga dibuka lewat `www`: `https://bagasimel.my.id,https://www.bagasimel.my.id`.
   - `APP_ENV=production` dan `SESSION_COOKIE_SECURE=true` jangan diubah.
3. Simpan (**Ctrl+S**) dan tutup Notepad.

## 7. Unggah file ke `public_html`

Semua isi folder hasil ekstrak diunggah **langsung ke `public_html`** (web root domain utama).
Jangan sampai masuk ke subfolder seperti `public_html/jastip-htdocs/`.

### Cara A — File Manager cPanel (tanpa aplikasi tambahan)

1. Di laptop, pilih semua isi folder `jastip-htdocs`, klik kanan → **Send to → Compressed (zipped) folder**
   untuk membuat satu zip (atau pakai `jastip-htdocs.zip` asli — tapi pastikan isinya di akar zip,
   bukan di dalam subfolder).
2. Di cPanel buka **File Manager** → masuk ke **`public_html`**.
3. Hapus file bawaan kalau ada (mis. `index.html` contoh dari hosting) agar `public_html` bersih.
4. Klik **Upload**, pilih zip-nya, tunggu selesai.
5. Kembali ke File Manager, klik kanan zip → **Extract**, ekstrak ke `public_html`.
6. Pastikan hasilnya: `public_html/index.html`, `public_html/index.php`, `public_html/.htaccess`,
   `public_html/app/`, `public_html/css/`, `public_html/js/` ada **langsung** di `public_html`
   (bukan di dalam subfolder). Kalau file berawalan titik tidak terlihat, aktifkan **Settings →
   Show Hidden Files (dotfiles)** di File Manager.
7. Hapus file zip dari `public_html` setelah ekstrak. Pastikan tidak ada `admin.sql` di sana.

### Cara B — FileZilla (FTP)

1. Ambil data FTP dari cPanel (**FTP Accounts**): host, username, password, port 21.
2. Sambungkan FileZilla, di panel kanan masuk **`public_html`**.
3. Di panel kiri buka folder `jastip-htdocs`, pilih semua isinya (**Ctrl+A**), seret ke `public_html`.
4. Aktifkan **Server → Force showing hidden files** agar `.htaccess` dan `app/.env` ikut terlihat/terunggah.
5. Cek tab **Failed transfers** kosong, dan susunan file seperti poin 6 di Cara A.

## 8. Buka aplikasi

Buka **`https://bagasimel.my.id`** di browser.

- Halaman **Masuk** tampil. Login dengan `pemilik` dan kata sandi dari langkah 5.
- Setelah login, daftar Open PO harus tampil tanpa pesan "Terjadi kesalahan di server".

---

## Checklist setelah pemasangan

| Cek | Cara | Hasil yang benar |
|---|---|---|
| Versi PHP | **Select PHP Version** di cPanel | 8.2 atau lebih baru |
| API + database + ekstensi | buka `https://bagasimel.my.id/api/v1/health` | `{"data":{"status":"ok","database":"ok"}}` |
| `.env` terlindungi | buka `https://bagasimel.my.id/app/.env` | **403 Forbidden** (bukan isi file) |
| `install.sql` terlindungi | buka `https://bagasimel.my.id/app/install.sql` | 403 |
| Daftar folder dimatikan | buka `https://bagasimel.my.id/js/` | 403, bukan daftar file |
| Login | masuk dengan akun admin | daftar Open PO tampil |
| Kurs otomatis | **+ Open PO**, mode otomatis | kurs dari Frankfurter tampil |

Catatan: `GET /api/v1/health` di Indowebsite (cPanel biasa) bisa diakses juga dari luar browser
(`curl`, aplikasi mobile), berbeda dengan InfinityFree yang memblokir akses non-browser.

## Masalah umum

**"Terjadi kesalahan di server." + `/api/v1/health` 500 dengan pesan tentang PHP `>= 8.2.0`.**
Versi PHP masih di bawah 8.2. Ulangi [langkah 1](#1-atur-versi-php-ke-82-atau-lebih-baru-wajib).

**"Terjadi kesalahan di server." + `/api/v1/health` 500 lainnya.** Konfigurasi salah. Buka
`public_html/app/storage/logs/app.log` lewat File Manager. Baris terakhir `gagal_memulai_aplikasi`
menyebut alasannya, mis. `file app/.env tidak ditemukan` (`.env` belum terunggah atau tersimpan
sebagai `.env.txt`), `SESSION_COOKIE_SECURE wajib true di production`, atau
`APP_ALLOWED_ORIGINS di production wajib https`.

**`/api/v1/health` 503 "Database tidak dapat dihubungi."** `DB_HOST`, `DB_NAME`, `DB_USER`, atau
`DB_PASSWORD` salah. Di cPanel `DB_HOST` umumnya `localhost`, dan nama DB/user berawalan nama akun
cPanel. Pastikan user sudah di-**Add User To Database** dengan ALL PRIVILEGES.

**Login menampilkan "Permintaan ditolak." (`403 ORIGIN_DITOLAK`).** Alamat di address bar tidak
sama persis dengan `APP_ALLOWED_ORIGINS`. Periksa `https` vs `http`, `www` vs tanpa `www`, tanpa
`/` di akhir.

**Setelah login langsung kembali ke halaman Masuk.** Situs dibuka lewat `http://`. Buka `https://`
dan pastikan SSL aktif (langkah 2).

**Masih tampil halaman bawaan hosting atau 404.** File terunggah ke subfolder
(`public_html/jastip-htdocs/…`). Semua file harus langsung di `public_html`.

**`health` menyebut ekstensi tidak ada (mis. `pdo_mysql`/`curl`/`mbstring`).** Hubungi CS
Indowebsite untuk mengaktifkan ekstensi itu pada versi PHP yang kamu pilih; panel ini tidak punya
tab Extensions.

## Backup rutin

cPanel biasanya punya menu **Backup** / **Backup Wizard**. Minimal, backup database berkala:
phpMyAdmin → pilih database → tab **Export** → **Quick** → **SQL** → **Go**, simpan file `.sql`
di tempat aman (nama bertanggal). Simpan juga salinan `app/.env` (berisi password database).
