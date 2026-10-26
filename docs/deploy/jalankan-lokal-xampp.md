# Menjalankan Jastip Admin di laptop (XAMPP, Windows)

Panduan ini untuk menjalankan aplikasi di laptop sendiri, misalnya untuk mencoba sebelum dipasang di internet. Aplikasi hanya bisa dibuka dari laptop itu (dan, kalau diatur, dari HP di Wi-Fi yang sama).

Yang dibutuhkan:

- Laptop Windows 10/11.
- File paket **`jastip-htdocs.zip`** (dibuat oleh developer dengan `deploy/build-htdocs.sh`).
- Koneksi internet hanya untuk mengunduh XAMPP dan untuk kurs otomatis.

Perkiraan waktu: 30 menit.

> Aplikasi harus berada **langsung** di `C:\xampp\htdocs`, bukan di subfolder seperti `C:\xampp\htdocs\jastip`. Alamat halaman dan API di aplikasi selalu dimulai dari `/`.

---

## 1. Instal XAMPP

1. Buka <https://www.apachefriends.org>, unduh **XAMPP for Windows** versi **8.4.x** (berisi PHP 8.4 dan MariaDB 10.11).
2. Jalankan installer. Kalau muncul peringatan antivirus atau UAC, klik **OK**/**Yes**.
3. Di layar **Select Components**, pastikan **Apache**, **MySQL**, **PHP**, dan **phpMyAdmin** tercentang. Komponen lain boleh dihilangkan.
4. Folder instalasi: biarkan **`C:\xampp`**. Jangan pilih `C:\Program Files`.
5. Selesaikan instalasi, lalu buka **XAMPP Control Panel**.

## 2. Nyalakan Apache dan MySQL

1. Di XAMPP Control Panel, klik **Start** di baris **Apache**, lalu **Start** di baris **MySQL**.
2. Kedua nama modul harus berlatar hijau.
3. Kalau Windows menampilkan **Windows Security Alert** untuk Apache:
   - hanya dipakai di laptop: klik **Cancel** (aplikasi tetap jalan di laptop);
   - ingin dibuka dari HP juga: centang **Private networks** saja, lalu klik **Allow access**.

Kalau Apache tidak mau hijau, lihat [Masalah umum](#masalah-umum) bagian "Port 80 dipakai".

## 3. Buat database dan impor `install.sql`

1. Ekstrak dulu `jastip-htdocs.zip` ke folder sementara (klik kanan → **Extract All…** → **Extract**), misalnya `C:\Users\NamaAnda\Downloads\jastip-htdocs`. File `app\install.sql` ada di dalamnya.
2. Di XAMPP Control Panel, klik **Admin** di baris **MySQL**. Browser membuka phpMyAdmin (`http://localhost/phpmyadmin`).
3. Di panel kiri, klik **New** (bahasa Indonesia: **Baru**).
4. Isi:
   - **Database name**: `jastip`
   - daftar pilihan di sebelahnya (collation): pilih **`utf8mb4_unicode_ci`**
5. Klik **Create**. Database `jastip` muncul di panel kiri dan sudah terpilih.
6. Pastikan `jastip` yang terpilih (namanya tertulis di bagian atas halaman), lalu klik tab **Import**.
7. Di **File to import**, klik **Browse…**/**Choose File**, pilih `app\install.sql` dari folder hasil ekstrak.
8. Gulir ke bawah, klik **Import** (di beberapa versi: **Go**).
9. Harus muncul pesan hijau **"Import has been successfully finished"**. Di panel kiri, database `jastip` sekarang berisi 11 tabel (`admin`, `customer`, …, `schema_migrations`).

File `install.sql` hanya untuk database **kosong**. Kalau muncul error `Table 'schema_migrations' already exists`, database itu sudah pernah diisi. Lihat [Masalah umum](#masalah-umum).

## 4. Pindahkan isi bawaan `htdocs`, lalu pasang aplikasi

1. Buka File Explorer ke `C:\xampp`.
2. Buat folder baru bernama **`htdocs-bawaan`**.
3. Buka `C:\xampp\htdocs`, pilih semua isinya (**Ctrl+A**), lalu **Cut** (**Ctrl+X**) dan **Paste** (**Ctrl+V**) ke `C:\xampp\htdocs-bawaan`. Folder `htdocs` sekarang kosong. (phpMyAdmin tetap bisa dibuka; letaknya di folder lain.)
4. Salin **isi** folder hasil ekstrak (`index.html`, `index.php`, `.htaccess`, `app`, `css`, `js`, dan file `.html` lainnya) ke `C:\xampp\htdocs`.
5. Periksa: harus ada `C:\xampp\htdocs\index.html` dan `C:\xampp\htdocs\app\install.sql`. Kalau yang ada malah `C:\xampp\htdocs\jastip-htdocs\index.html`, pindahkan isi folder `jastip-htdocs` itu satu tingkat ke atas.

## 5. Buat file konfigurasi `app\.env`

1. Di XAMPP Control Panel, klik **Shell** (tombol di kanan). Jendela hitam terbuka.
2. Ketik perintah berikut, tekan **Enter** setelah setiap baris:

   ```bat
   cd C:\xampp\htdocs
   copy app\.env.contoh-lokal app\.env
   ```

   Hasil: `1 file(s) copied.`
3. Isi bawaan sudah cocok dengan XAMPP standar (database `jastip`, user `root` tanpa password). Untuk melihat atau mengubahnya: `notepad app\.env`.

Membuat file lewat Shell menghindari masalah Notepad yang diam-diam menyimpan nama `.env.txt`.

## 6. Buat akun admin

Masih di jendela Shell yang sama (MySQL harus menyala):

```bat
php app\bin\create-admin.php pemilik
```

- `pemilik` adalah nama pengguna untuk login. Boleh diganti (3–50 karakter: huruf, angka, titik, garis bawah, tanda hubung).
- Skrip meminta **Kata sandi** dua kali. Minimal 10 karakter. Pakai huruf, angka, dan tanda baca biasa (hindari huruf beraksen atau emoji).
- Di Windows, ketikan kata sandi **terlihat di layar** (skrip menampilkan peringatan). Pastikan tidak ada yang melihat, lalu tutup jendela Shell setelah selesai.
- Hasil yang benar: `Admin 'pemilik' dibuat (id 1).`

Lupa kata sandi? Jalankan `php app\bin\create-admin.php pemilik --reset`. Kata sandi diganti dan semua sesi login lama diakhiri.

## 7. Buka aplikasi

Buka browser ke **<http://localhost>**. Halaman **Masuk** tampil. Login dengan `pemilik` dan kata sandi tadi.

---

## Opsional: membuka dari HP di Wi-Fi yang sama

Laptop dan HP harus tersambung ke Wi-Fi yang sama. Pakai hanya di Wi-Fi rumah yang dipercaya. Koneksinya `http` (tidak terenkripsi), jadi jangan dipakai di Wi-Fi umum.

1. Cari IP laptop: di jendela Shell ketik `ipconfig`. Di bagian **Wireless LAN adapter Wi-Fi**, catat **IPv4 Address**, misalnya `192.168.1.10`.
2. Buka `notepad app\.env` (dari `C:\xampp\htdocs`) dan tambahkan alamat itu di `APP_ALLOWED_ORIGINS`, dipisah koma, tanpa garis miring di akhir:

   ```ini
   APP_ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,http://192.168.1.10
   ```

   Simpan (**Ctrl+S**). Tidak perlu restart Apache.
3. Izinkan Apache di firewall (kalau belum di langkah 2):
   - **Control Panel** → **Windows Defender Firewall** → **Allow an app or feature through Windows Defender Firewall** → **Change settings**.
   - Cari **Apache HTTP Server**, centang kolom **Private**, klik **OK**.
   - Pastikan jaringan Wi-Fi laptop berjenis **Private**: **Settings** → **Network & internet** → **Wi-Fi** → nama Wi-Fi → **Network profile type: Private network**.
4. Di HP, buka browser ke `http://192.168.1.10`.

Catatan:

- IP laptop bisa berubah setelah restart router. Kalau login di HP menampilkan **"Permintaan ditolak."**, cek lagi `ipconfig` dan perbarui `APP_ALLOWED_ORIGINS`.
- Browser HP hanya mengizinkan salin otomatis di `https` atau `localhost`. Di alamat IP, tombol **Salin rekap** membuka layar **Salin manual**: tekan lama teksnya lalu salin.

---

## Checklist setelah pemasangan

| Cek | Cara | Hasil yang benar |
|---|---|---|
| API dan database | buka `http://localhost/api/v1/health` | `{"data":{"status":"ok","database":"ok"}}` |
| `.env` terlindungi | buka `http://localhost/app/.env` | halaman **Access forbidden!** / **Error 403** |
| `install.sql` terlindungi | buka `http://localhost/app/install.sql` | 403 |
| `.htaccess` terlindungi | buka `http://localhost/.htaccess` | 403 |
| Daftar folder dimatikan | buka `http://localhost/js/` | 403, bukan daftar file |
| Halaman utama | buka `http://localhost` | halaman Masuk aplikasi, bukan dashboard XAMPP |
| Login | masuk dengan akun admin | daftar Open PO tampil |
| Kurs otomatis | **+ Open PO**, mode otomatis | kurs dari Frankfurter tampil (butuh internet) |
| Header keamanan (opsional) | **F12** → tab **Network** → muat ulang → klik baris `localhost` → **Response Headers** | ada `X-Frame-Options: SAMEORIGIN` dan `Cache-Control: no-cache`. Untuk `app.css?v=…`: `Cache-Control: public, max-age=31536000, immutable` |

Kalau `http://localhost/app/.env` **menampilkan isi file**, berarti `.htaccess` tidak terbaca. Jangan lanjutkan; lihat [Masalah umum](#masalah-umum).

## Backup

Semua data (Open PO, customer, pesanan, pembayaran) ada di database `jastip`. Backup minimal seminggu sekali dan sebelum update aplikasi:

1. phpMyAdmin → klik `jastip` di panel kiri → tab **Export**.
2. **Export method**: **Quick**, **Format**: **SQL**.
3. Klik **Export** (di beberapa versi: **Go**). File `jastip.sql` terunduh.
4. Simpan di luar laptop (Google Drive, flashdisk). Beri nama bertanggal, mis. `jastip-2026-10-26.sql`.

Memulihkan: buat database kosong baru (langkah 3, nama misalnya `jastip_pulih`), **Import** file backup itu, lalu ubah `DB_NAME` di `app\.env` ke nama database baru.

## Masalah umum

**Apache tidak mau Start, log menulis "Port 80 in use".** Ada program lain yang memakai port 80 (Skype lama, IIS, VMware, "World Wide Web Publishing Service"). Pilihan:

- Matikan program itu, lalu **Start** lagi; atau
- Pindahkan Apache ke port 8080: di baris Apache klik **Config** → **Apache (httpd.conf)**, ganti `Listen 80` menjadi `Listen 8080` dan `ServerName localhost:80` menjadi `ServerName localhost:8080`, simpan, **Start**. Buka `http://localhost:8080` dan ubah `app\.env`: `APP_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080`.

**MySQL tidak mau Start, "Port 3306 in use".** Ada MySQL/MariaDB lain yang sudah jalan. Matikan layanan itu (**Services** di XAMPP Control Panel), atau minta bantuan developer. Jangan menghapus folder `C:\xampp\mysql\data`: data Anda ada di sana.

**Login menampilkan "Permintaan ditolak."** (kode `403 ORIGIN_DITOLAK`). Alamat di address bar tidak tercantum di `APP_ALLOWED_ORIGINS`. Contoh: aplikasi dibuka lewat `http://127.0.0.1:8080` atau IP laptop. Tambahkan alamat itu persis (dengan `http://`, dengan port kalau ada, tanpa `/` di akhir) ke `app\.env`.

**"Terjadi kesalahan di server."** dan `http://localhost/api/v1/health` membalas 500. Biasanya `app\.env` tidak ada atau salah.

- Di Shell: `dir app` dari `C:\xampp\htdocs`. Harus ada `.env`, bukan `.env.txt`. Kalau perlu ulangi langkah 5.
- Buka baris terakhir `C:\xampp\htdocs\app\storage\logs\app.log` dengan Notepad. Kejadian `gagal_memulai_aplikasi` menyebut alasannya, mis. `DB_NAME wajib diisi. (file app/.env tidak ditemukan)`.

**`/api/v1/health` membalas 503 "Database tidak dapat dihubungi."** MySQL belum **Start**, atau `DB_NAME`/`DB_USER`/`DB_PASSWORD` di `app\.env` tidak cocok dengan database di phpMyAdmin.

**Yang tampil dashboard XAMPP, bukan aplikasi.** Isi bawaan `htdocs` belum dipindahkan (langkah 4), atau browser menyimpan halaman lama: tekan **Ctrl+F5**.

**Halaman tampil berantakan tanpa warna, atau 404.** Aplikasi terpasang di subfolder (`http://localhost/jastip-htdocs/`). Pindahkan isinya langsung ke `C:\xampp\htdocs` (langkah 4).

**`http://localhost/app/.env` menampilkan isi file.** File `.htaccess` tidak ikut tersalin (cek `C:\xampp\htdocs\.htaccess` dan `C:\xampp\htdocs\app\.htaccess`), atau `AllowOverride` di `httpd.conf` sudah diubah dari bawaan XAMPP (`AllowOverride All`).

**`'php' is not recognized…`** Perintah diketik di Command Prompt biasa. Pakai tombol **Shell** di XAMPP Control Panel, atau ketik path lengkap: `C:\xampp\php\php.exe app\bin\create-admin.php pemilik`.

**Import gagal: `#1046 - No database selected`.** Klik `jastip` di panel kiri dulu, baru tab **Import**.

**Import gagal: `Table 'schema_migrations' already exists`.** Database tidak kosong. Kalau ini pemasangan baru tanpa data, buat database baru dengan nama lain (mis. `jastip2`), impor ke sana, dan ubah `DB_NAME` di `app\.env`. Jangan menghapus database yang sudah berisi data.
