# Memasang Jastip Admin di InfinityFree (hosting gratis)

Panduan ini memasang aplikasi di internet supaya bisa dibuka dari HP dan laptop lewat `https://`. InfinityFree tidak punya terminal (SSH), jadi semua langkah dilakukan lewat halaman web InfinityFree, phpMyAdmin, dan FileZilla.

Yang dibutuhkan:

- File paket **`jastip-htdocs.zip`**. Unduh dari folder [`rilis/`](../../rilis/) di repository GitHub (buka filenya, lalu klik tombol **Download raw file**), atau buat sendiri dengan `deploy/build-htdocs.sh`.
- Laptop Windows dengan **XAMPP** terpasang (lihat langkah 1 di [jalankan-lokal-xampp.md](jalankan-lokal-xampp.md)). Di sini XAMPP hanya dipakai untuk menjalankan PHP satu kali (membuat akun admin). Apache dan MySQL tidak perlu dinyalakan.
- Program **FileZilla Client** (gratis, <https://filezilla-project.org>) untuk mengunggah file.

Perkiraan waktu: 1 jam, ditambah waktu tunggu SSL kalau memakai domain sendiri.

Baca dulu [Batasan InfinityFree](#batasan-infinityfree) supaya tahu apa yang tidak bisa dilakukan di hosting gratis.

---

## 1. Daftar dan buat akun hosting

1. Buka <https://www.infinityfree.com>, klik **Sign Up**/**Register**, daftar dengan email, lalu klik tautan verifikasi di email.
2. Masuk ke client area: <https://dash.infinityfree.com>.
3. Klik **Create Account** dan pilih alamat situs:
   - **Subdomain gratis** (paling mudah): ketik nama, mis. `jastipku`, dan pilih akhiran, mis. `.rf.gd` → alamat menjadi `jastipku.rf.gd`.
   - **Domain sendiri** (mis. `jastipku.com`, dibeli di tempat lain): ikuti petunjuk InfinityFree untuk mengarahkan nameserver domain ke InfinityFree.
4. Selesaikan pembuatan akun. Di daftar **Accounts**, akun baru muncul. Klik **Manage** di sebelahnya. Halaman ini dipakai di langkah-langkah berikut.

Catat alamat situs Anda. Di panduan ini contohnya **`jastipku.rf.gd`**.

## 2. Pastikan HTTPS (SSL) aktif

Aplikasi **wajib** dibuka lewat `https://`. Lewat `http://`, login akan ditolak.

**Subdomain gratis** (mis. `jastipku.rf.gd`): SSL sudah aktif otomatis, tidak perlu diatur. Tetapi alamat dengan `www.` (`www.jastipku.rf.gd`) **tidak** didukung; selalu pakai alamat tanpa `www`.

**Domain sendiri**: minta sertifikat gratis dulu, dan **tunggu sampai aktif** sebelum langkah 7 dan 9:

1. Di client area, buka halaman **Free SSL Certificates** → klik **New SSL Certificate**.
2. Ketik domain tanpa `https://` dan tanpa `www` (mis. `jastipku.com`). Sertifikat berlaku untuk `jastipku.com` dan `www.jastipku.com`. Klik **Create Order**.
3. Klik **Setup CNAME Records Automatically** (muncul kalau domain memakai nameserver InfinityFree).
4. Tunggu sampai status pengecekan **Ready** (bisa beberapa jam), lalu klik **Request Certificate**.
5. Setelah sertifikat terbit, pasang ke akun hosting (opsi pemasangan otomatis di halaman sertifikat).
6. Cek: buka `https://jastipku.com` di browser. Tidak boleh ada peringatan "Not secure"/"Your connection is not private".

## 3. Buat database MySQL

1. Di halaman **Manage** akun, buka **MySQL Databases**.
2. Ketik nama database, mis. `jastip`, lalu klik **Create Database**.
3. Catat empat nilai yang tampil di halaman itu. Contoh (milik Anda pasti berbeda):

   | Nilai | Contoh | Dipakai untuk |
   |---|---|---|
   | MySQL Host Name | `sql123.infinityfree.com` | `DB_HOST` |
   | MySQL DB Name | `if0_12345678_jastip` | `DB_NAME` |
   | MySQL User Name | `if0_12345678` | `DB_USER` |
   | MySQL Password | (biasanya sama dengan password akun hosting; klik **Show** untuk melihat) | `DB_PASSWORD` |

   Host-nya **bukan** `localhost`.

## 4. Impor `install.sql` lewat phpMyAdmin

1. Di laptop, ekstrak `jastip-htdocs.zip` (klik kanan → **Extract All…** → **Extract**), mis. ke `C:\Users\NamaAnda\Downloads\jastip-htdocs`. Folder ini dipakai sampai selesai.
2. Buka phpMyAdmin untuk database `if0_12345678_jastip`: klik **phpMyAdmin** di baris database itu di halaman **MySQL Databases**, atau klik tombol hijau **Control Panel** → **phpMyAdmin** → **Connect Now** di sebelah database itu.
3. Pastikan nama database itu tertulis di bagian atas phpMyAdmin, lalu klik tab **Import**.
4. Klik **Browse…**/**Choose File**, pilih `app\install.sql` dari folder hasil ekstrak.
5. Klik **Go** (di versi lain: **Import**) di bagian bawah.
6. Harus muncul **"Import has been successfully finished"**, dan di panel kiri database berisi 11 tabel (termasuk `admin` dan `schema_migrations`).

`install.sql` hanya untuk database **kosong**. Error `Table 'schema_migrations' already exists` berarti database sudah terisi; lihat [Masalah umum](#masalah-umum).

## 5. Buat akun admin (SQL dibuat di laptop)

InfinityFree tidak bisa menjalankan perintah, jadi SQL akun admin dibuat di laptop dengan PHP dari XAMPP, lalu ditempel di phpMyAdmin.

1. Buka **XAMPP Control Panel** → klik **Shell**.
2. Masuk ke folder hasil ekstrak, lalu tulis SQL admin ke file `admin.sql` di folder **di atasnya** (`..\admin.sql`, supaya tidak ikut terunggah ke hosting):

   ```bat
   cd /d C:\Users\NamaAnda\Downloads\jastip-htdocs
   php app\bin\create-admin.php pemilik --sql > ..\admin.sql
   ```

   - `cd /d` juga berfungsi kalau folder ada di drive lain (mis. `D:`).
   - `pemilik` = nama pengguna untuk login (3–50 karakter: huruf, angka, titik, garis bawah, tanda hubung).
   - Ketik **Kata sandi** dua kali. Minimal 10 karakter; pakai huruf, angka, dan tanda baca biasa.
   - Di Windows, ketikan kata sandi **terlihat** di layar (skrip memberi peringatan). Pastikan tidak ada yang melihat.
   - Skrip ini tidak menghubungi database mana pun. `admin.sql` berisi nama pengguna dan hash kata sandi, bukan kata sandinya.
3. Buka file itu: `notepad ..\admin.sql`. Isinya tiga baris: dua baris komentar `-- …` dan satu baris `INSERT INTO admin …`. Pilih semua (**Ctrl+A**), salin (**Ctrl+C**).
4. Di phpMyAdmin InfinityFree (database yang sama), klik tab **SQL**, tempel (**Ctrl+V**), klik **Go**.
5. Harus muncul **"1 row inserted."**
6. Hapus file itu dari laptop (`del ..\admin.sql` di Shell), dan jangan kirim isinya lewat chat atau email.

Lupa kata sandi nanti? Ulangi langkah ini dengan `php app\bin\create-admin.php pemilik --sql --reset > ..\admin.sql`. SQL-nya berisi `UPDATE` kata sandi dan penghapusan semua sesi login lama. Setelah **Go**, pastikan baris `UPDATE` menghasilkan **1 row affected** (0 berarti nama pengguna salah ketik).

## 6. Isi konfigurasi `app\.env` (di laptop, sebelum diunggah)

1. Di jendela Shell yang sama (masih di folder hasil ekstrak):

   ```bat
   copy app\.env.contoh-infinityfree app\.env
   notepad app\.env
   ```

2. Ganti semua nilai yang diawali `GANTI_`:

   ```ini
   APP_ENV=production
   APP_ALLOWED_ORIGINS=https://jastipku.rf.gd
   DB_HOST=sql123.infinityfree.com
   DB_PORT=3306
   DB_NAME=if0_12345678_jastip
   DB_USER=if0_12345678
   DB_PASSWORD=password-mysql-anda
   SESSION_COOKIE_SECURE=true
   ```

   - `APP_ALLOWED_ORIGINS` persis seperti alamat di address bar: diawali `https://`, tanpa `/` di akhir.
   - Domain sendiri yang juga dibuka lewat `www`: tulis keduanya, dipisah koma: `https://jastipku.com,https://www.jastipku.com`.
   - `APP_ENV=production` dan `SESSION_COOKIE_SECURE=true` jangan diubah. Aplikasi menolak jalan kalau salah satunya tidak sesuai.
3. Simpan (**Ctrl+S**) dan tutup Notepad.

## 7. Aktifkan pengalihan ke HTTPS

Supaya pengunjung yang mengetik `http://…` otomatis dibawa ke `https://…`:

1. Di Shell: `notepad .htaccess` (file `.htaccess` di folder hasil ekstrak, bukan yang di `app`).
2. Cari bagian **Paksa HTTPS**. Hapus tanda `# ` di depan **4 baris** ini sehingga menjadi:

   ```apache
       RewriteCond %{HTTP:X-Forwarded-Proto} !https
       RewriteCond %{HTTPS} off
       RewriteCond %{HTTP:CF-Visitor} !{"scheme":"https"}
       RewriteRule (.*) https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
   ```

3. Simpan. Lakukan ini hanya kalau `https://alamat-anda` sudah bisa dibuka (langkah 2).

## 8. Unggah file ke `htdocs` dengan FileZilla

1. Di halaman **Manage** akun, lihat tabel **FTP Details**: **FTP Hostname** (mis. `ftpupload.net`), **FTP Username** (mis. `if0_12345678`), **FTP Password** (tombol **Show**), port `21`. Password FTP berbeda dengan password client area.
   - Akun baru: klik tombol hijau **Control Panel** sekali dulu supaya akses FTP aktif.
2. Buka FileZilla. Di baris **Quickconnect** paling atas isi **Host**, **Username**, **Password**, **Port** `21`, lalu klik **Quickconnect**.
3. Di panel **kanan** (server), klik dua kali folder **`htdocs`**.
4. Hapus file bawaan InfinityFree di `htdocs`, mis. **`index2.html`**: klik kanan → **Delete**. Folder `htdocs` harus kosong sebelum diunggah. (File di luar `htdocs` tidak perlu disentuh; InfinityFree menghapusnya otomatis.)
5. Di panel **kiri** (laptop), buka folder hasil ekstrak `C:\Users\NamaAnda\Downloads\jastip-htdocs`.
6. Klik salah satu file di panel kiri, tekan **Ctrl+A** untuk memilih semua isi folder, lalu seret ke panel kanan (di dalam `htdocs`). Atau klik kanan → **Upload**.
7. Tunggu sampai antrean di bawah kosong. Buka tab **Failed transfers**: harus kosong. Kalau ada yang gagal, klik kanan → **Reset and requeue all**, lalu unggah ulang.
8. Periksa di panel kanan:
   - `htdocs/index.html`, `htdocs/index.php`, `htdocs/.htaccess`, `htdocs/app/`, `htdocs/css/`, `htdocs/js/` ada **langsung** di `htdocs` (bukan di `htdocs/jastip-htdocs/`);
   - `htdocs/app/.env` dan `htdocs/app/.htaccess` ada. Kalau file berawalan titik tidak terlihat, klik menu **Server** → **Force showing hidden files**.
   - tidak ada file `admin.sql` di `htdocs` (kalau ada, hapus).

Alternatif tanpa FileZilla: **File Manager** di halaman **Manage** akun, buka `htdocs`, lalu unggah file. File Manager kurang cocok untuk banyak file sekaligus, dan mengekstrak zip lewat File Manager tidak andal, jadi FileZilla lebih disarankan. File Manager praktis untuk mengedit satu file, mis. `app/.env`.

## 9. Buka aplikasi

Buka **`https://jastipku.rf.gd`** di browser HP atau laptop.

- Pertama kali, InfinityFree menjalankan pengecekan browser sebentar (alamat bisa berakhiran `?i=1`). Ini normal.
- Halaman **Masuk** tampil. Login dengan `pemilik` dan kata sandi dari langkah 5.

---

## Checklist setelah pemasangan

| Cek | Cara | Hasil yang benar |
|---|---|---|
| API dan database | buka `https://jastipku.rf.gd/api/v1/health` | `{"data":{"status":"ok","database":"ok"}}` |
| `.env` terlindungi | buka `https://jastipku.rf.gd/app/.env` | **403 Forbidden** (bukan isi file, bukan unduhan) |
| `install.sql` terlindungi | buka `https://jastipku.rf.gd/app/install.sql` | 403 |
| `.htaccess` terlindungi | buka `https://jastipku.rf.gd/.htaccess` | 403 |
| Daftar folder dimatikan | buka `https://jastipku.rf.gd/js/` | 403, bukan daftar file |
| Pengalihan HTTPS | ketik `http://jastipku.rf.gd` | pindah ke `https://jastipku.rf.gd` |
| Login | masuk dengan akun admin | daftar Open PO tampil |
| Kurs otomatis | **+ Open PO**, mode otomatis | kurs dari Frankfurter tampil, bukan pesan gagal |
| Salin rekap di HP | buka keranjang customer → **Salin rekap** → tempel di WhatsApp | teks rekap lengkap tertempel |
| Header keamanan (opsional, laptop) | **F12** → **Network** → muat ulang → klik baris dokumen → **Response Headers** | `X-Frame-Options: SAMEORIGIN`, `Cache-Control: no-cache` |

Kalau `/app/.env` **menampilkan isi file atau terunduh**: segera hapus `htdocs/app/.env` lewat FileZilla, ganti password akun hosting (password MySQL ikut berubah), lalu periksa apakah `.htaccess` di `htdocs` dan `htdocs/app` sudah terunggah. Setelah itu buat lagi `app/.env` dengan password baru.

## Backup rutin

**InfinityFree tidak membuat backup** dan tidak menjamin data di hosting gratis. Backup sendiri minimal seminggu sekali, dan selalu sebelum update:

1. phpMyAdmin InfinityFree → pilih database → tab **Export**.
2. **Export method**: **Quick**, **Format**: **SQL** → klik **Go** (di versi lain: **Export**).
3. Simpan file `.sql` di luar hosting (Google Drive, laptop, flashdisk), nama bertanggal, mis. `jastip-2026-10-26.sql`.

File aplikasi tidak perlu dibackup (bisa diunggah ulang dari zip). Yang perlu disimpan hanya database, dan salinan `app/.env` di tempat aman (isinya password database).

Memulihkan: buat database kosong baru, **Import** file backup, ubah `DB_NAME` di `app/.env`.

## Batasan InfinityFree

- **Hanya bisa diakses lewat browser.** Semua alamat situs dilindungi pengecekan browser (JavaScript + cookie `__test`) yang tidak bisa dimatikan. Browser di HP dan laptop berjalan normal. Yang **tidak bisa** mengakses API: aplikasi Android/iOS, Postman, `curl`, layanan monitoring (mis. UptimeRobot), dan webhook. Kalau nanti dibuat aplikasi mobile, API harus dipindah ke hosting lain (berbayar/VPS). Cek `/api/v1/health` juga hanya bisa dari browser.
- **Batas pemakaian.** Akun gratis punya batas hits harian, CPU, dan jumlah file (inode). Kalau terlampaui, situs bisa dinonaktifkan sementara. Pemakaian satu admin biasanya jauh di bawah batas; angka terbaru ada di halaman akun InfinityFree.
- **Batas ukuran file**: HTML/PHP/JS maks. 1 MB, `.htaccess` maks. 10 kB, file lain maks. 10 MB. File yang lebih besar dihapus otomatis. Paket ini sudah dicek oleh skrip build.
- **Tanpa cron dan tanpa backup otomatis.** Backup harus manual.
- **Data pribadi customer** (nama, no WA, alamat) disimpan di server gratis tanpa jaminan layanan. Anda tetap bertanggung jawab menjaga data itu (UU Pelindungan Data Pribadi). Simpan seperlunya, hapus customer yang tidak aktif, simpan backup di tempat aman, dan pertimbangkan hosting berbayar untuk pemakaian jangka panjang.

## Update ke versi baru

1. **Backup database** (lihat [Backup rutin](#backup-rutin)).
2. Ekstrak zip versi baru ke folder baru di laptop.
3. **Jangan timpa `app/.env` di server.** Paket tidak berisi `.env`, jadi unggahan tidak menimpanya. Jangan menghapus folder `htdocs/app` di server.
4. File `.htaccess` di paket baru kembali ke bawaan. Ulangi **langkah 7** (hapus `# ` di 4 baris HTTPS) pada `.htaccess` paket baru **sebelum** diunggah.
5. Unggah semua isi folder baru ke `htdocs` dengan FileZilla. Saat ditanya file sudah ada, pilih **Overwrite**, centang **Always use this action**, klik **OK**.
6. **SQL upgrade** (kalau ada). Lihat folder `app\upgrade\` di paket baru. Kalau folder itu tidak ada, lewati langkah ini.
   - Di phpMyAdmin, klik tabel `schema_migrations` → tab **Browse**. Kolom `version` berisi daftar perubahan database yang sudah terpasang, mis. `001_init`.
   - Untuk setiap file di `app\upgrade\` yang namanya (tanpa `.sql`) **belum** ada di daftar itu, urut dari nomor terkecil: tab **Import** → pilih file → **Go**.
   - Error di pernyataan pertama berarti **tidak ada yang diubah**: `Duplicate entry '…'` = upgrade itu sudah pernah dijalankan (abaikan); `Column 'applied_at' cannot be null` = ada upgrade sebelumnya yang belum dijalankan (jalankan yang nomornya lebih kecil dulu).
   - Error di pernyataan lain: upgrade berhenti di tengah. Jangan dicoba ulang; pulihkan database dari backup langkah 1 dan hubungi developer.
7. Buka aplikasi, muat ulang halaman, lalu jalankan [Checklist](#checklist-setelah-pemasangan) lagi.

Untuk developer: file upgrade dibuat otomatis oleh `deploy/build-htdocs.sh` dari setiap file migrasi setelah `001_init` (`backend/database/migrations/NNN_nama.sql` → `app/upgrade/NNN_nama.sql`). Satu file bisa juga dibuat manual: `php backend/bin/export-sql.php upgrade 002_nama > build/upgrade-002.sql`. Pernyataan pertama setiap file upgrade mencatat versinya di `schema_migrations` sekaligus menjadi pengaman: gagal kalau versi itu sudah tercatat atau versi sebelumnya belum ada. Catatan ini sama dengan yang dipakai `bin/migrate.php`, jadi kalau nanti pindah ke server dengan CLI, `php bin/migrate.php up` tidak menjalankan ulang migrasi yang sudah diimpor.

## Masalah umum

**Login menampilkan "Permintaan ditolak."** (`403 ORIGIN_DITOLAK`). Alamat di address bar tidak sama persis dengan `APP_ALLOWED_ORIGINS` di `app/.env`. Periksa `https` vs `http`, `www` vs tanpa `www`, dan tidak ada `/` di akhir. Edit `app/.env` lewat File Manager atau unggah ulang lewat FileZilla.

**Setelah login, langsung kembali ke halaman Masuk.** Situs dibuka lewat `http://`. Cookie login hanya dikirim lewat `https://`. Buka `https://…` dan aktifkan pengalihan HTTPS (langkah 7).

**"Terjadi kesalahan di server." dan `/api/v1/health` membalas 500.** Konfigurasi salah. Unduh `htdocs/app/storage/logs/app.log` dengan FileZilla dan buka dengan Notepad. Baris terakhir `gagal_memulai_aplikasi` menyebut alasannya, contohnya:

- `file app/.env tidak ditemukan`: `.env` belum terunggah, atau tersimpan sebagai `.env.txt`;
- `SESSION_COOKIE_SECURE wajib true di production`;
- `APP_ALLOWED_ORIGINS di production wajib https`.

**`/api/v1/health` membalas 503 "Database tidak dapat dihubungi."** `DB_HOST`, `DB_NAME`, `DB_USER`, atau `DB_PASSWORD` salah. Salin ulang dari halaman **MySQL Databases**. `DB_HOST` bukan `localhost`, dan nama database diawali `if0_`.

**Masih tampil halaman sambutan InfinityFree**, atau 404. File terunggah ke subfolder (`htdocs/jastip-htdocs/…`) atau `index2.html` belum dihapus. Semua file harus langsung di `htdocs`.

**`ERR_TOO_MANY_REDIRECTS` setelah langkah 7.** Kembalikan tanda `# ` di 4 baris HTTPS di `htdocs/.htaccess` (lewat File Manager), lalu tanyakan ke forum InfinityFree sambil menyertakan isi `.htaccess`.

**Seluruh situs "500 Internal Server Error" (halaman Apache, bukan pesan aplikasi).** Ada salah ketik di `.htaccess`. Unggah ulang `.htaccess` dari zip, lalu ulangi langkah 7 dengan hati-hati.

**Kurs otomatis gagal.** Frankfurter sedang tidak bisa dihubungi. Isi kurs manual di form Open PO, atau coba lagi nanti.

**Pesan "Koneksi ke server perlu diperbarui. Muat ulang halaman, lalu coba lagi."** Pengecekan browser InfinityFree muncul lagi (biasanya setelah lama tidak dibuka). Muat ulang halaman. Kalau terus terjadi, pastikan browser mengizinkan cookie dan JavaScript untuk situs ini.

**Import `install.sql` gagal: `Table 'schema_migrations' already exists`.** Database tidak kosong. Kalau ini pemasangan baru tanpa data, buat database baru di **MySQL Databases**, impor ke sana, dan ubah `DB_NAME` di `app/.env`. Jangan menghapus database yang sudah berisi data.

**FileZilla tidak bisa tersambung.** Klik **Control Panel** sekali di halaman **Manage** akun, cek ulang data **FTP Details** (password FTP ≠ password client area), lalu coba lagi.
