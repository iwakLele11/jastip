# Menerapkan update: ongkos berat + fee jastip

Panduan ini menerapkan perubahan model harga (markup % → ongkos berat + fee jastip) ke hosting.
Perubahan ini **menambah kolom database baru**, jadi ada langkah **import SQL upgrade** di
phpMyAdmin — tidak cukup hanya mengganti file.

Urutannya: (1) backup, (2) build paket baru di laptop, (3) import SQL upgrade, (4) upload file.
Perkiraan waktu: 30–45 menit.

> Ganti `public_html` dengan web root hosting kamu kalau berbeda.

---

## 0. Backup dulu (wajib)

1. cPanel/CWP → **phpMyAdmin** → pilih database → tab **Export** → **Quick** → **SQL** → **Go**.
2. Simpan file `.sql` bertanggal di tempat aman. Ini pengaman kalau ada yang salah.

---

## 1. Siapkan alat di laptop (sekali saja)

Butuh **PHP ≥ 8.2**, **Composer**, dan **Node ≥ 22**.

- PHP: paling mudah dari **XAMPP 8.2** (lihat [jalankan-lokal-xampp.md](jalankan-lokal-xampp.md) langkah 1). Apache/MySQL XAMPP tidak perlu dinyalakan.
- Composer: <https://getcomposer.org/download/>
- Node: <https://nodejs.org> (versi LTS ≥ 22).

Cek di terminal/CMD (semua harus keluar versinya):

```bat
php -v
composer --version
node -v
```

> Pastikan `php -v` menunjuk PHP 8.2+ milik XAMPP. Kalau belum, tambahkan folder `php` XAMPP
> (mis. `C:\xampp\php`) ke PATH, atau jalankan dari **XAMPP Shell**.

---

## 2. Ambil kode terbaru dan build paket

1. Clone/pull repo dari branch `mvp`:

   ```bat
   git clone -b mvp https://github.com/iwakLele11/jastip.git
   cd jastip
   ```

   (Kalau sudah pernah clone: `cd jastip` lalu `git checkout mvp` dan `git pull`.)

2. Jalankan skrip build:

   ```bat
   bash deploy/build-htdocs.sh
   ```

   Di Windows, jalankan lewat **Git Bash** (ikut terpasang dengan Git). Skrip akan: build
   front-end, salin back-end, `composer install --no-dev`, membuat `app/install.sql` **dan**
   `app/upgrade/002_ongkos_fee.sql`, lalu mengemas `build/jastip-htdocs.zip`.

3. Setelah selesai, ekstrak `build/jastip-htdocs.zip` ke sebuah folder, mis.
   `C:\Users\NamaAnda\Downloads\jastip-htdocs`. Pastikan ada:
   - `app/upgrade/002_ongkos_fee.sql`  ← file migrasi yang akan diimpor
   - `index.html`, `index.php`, `.htaccess`, `app/`, `css/`, `js/`

> Kalau `build-htdocs.sh` gagal di langkah "composer" karena offline, jalankan
> `composer install --no-dev --optimize-autoloader` manual di folder `backend/` dulu, lalu ulangi.

---

## 3. Import SQL upgrade ke phpMyAdmin (WAJIB, sebelum upload file)

Ini menambah kolom `ongkos_berat_sen`, `fee_jastip_sen` di tabel `baris_pesanan`, dan
`default_ongkos_berat_sen`, `default_fee_jastip_sen` di tabel `pengaturan`.

1. phpMyAdmin → pilih database kamu.
2. (Opsional, cek) klik tabel **`schema_migrations`** → tab **Browse**. Harusnya ada baris
   `001_init`. Kalau `002_ongkos_fee` **sudah** ada, berarti migrasi sudah jalan — lewati langkah ini.
3. Tab **Import** → **Choose File** → pilih `app\upgrade\002_ongkos_fee.sql` dari folder hasil
   ekstrak → **Go**.
4. Harus muncul **"Import has been successfully finished"**. Di `schema_migrations` kini ada baris
   `002_ongkos_fee`.

**Kalau muncul error:**
- `Duplicate entry '002_ongkos_fee'` → migrasi sudah pernah dijalankan; aman, lanjut.
- `Column already exists` → sebagian sudah terpasang; **hubungi saya** dengan pesan errornya,
  jangan diulang (pulihkan dari backup langkah 0 kalau perlu).

---

## 4. Upload file aplikasi

Upload **semua isi** folder hasil ekstrak ke `public_html`, menimpa yang lama.

### Lewat File Manager (cPanel/CWP)
1. Kompres isi folder jadi satu zip (atau pakai `jastip-htdocs.zip` asal isinya di akar zip).
2. File Manager → `public_html` → **Upload** zip → **Extract** di `public_html` → pilih
   **Overwrite** saat ditanya.
3. **JANGAN hapus/timpa `app/.env`** — itu berisi kredensial database kamu. Paket tidak memuat
   `.env`, jadi upload tidak menimpanya. Kalau File Manager menanyakan, lewati file `.env`.
4. Hapus file zip dari `public_html` setelah ekstrak.

### Lewat FileZilla
1. Sambungkan FTP → masuk `public_html`.
2. Seret semua isi folder hasil ekstrak ke `public_html`, pilih **Overwrite / Always**.
3. Pastikan `app/.env` **tidak** ikut tertimpa (paket tidak memuatnya).

> Catatan `.htaccess`: kalau dulu kamu mengaktifkan "Paksa HTTPS" dengan menghapus `#` di 4 baris,
> paket baru mengembalikannya ke default. Buka `.htaccess` hasil upload dan aktifkan lagi 4 baris
> itu kalau perlu (lihat [indowebsite.md](indowebsite.md) langkah HTTPS). Jangan menambahkan
> direktif ModSecurity — cukup method override yang sudah ada di kode.

---

## 5. Cek hasilnya

1. Buka `https://www.bagasimel.my.id/api/v1/health` → harus `{"data":{"status":"ok","database":"ok"}}`.
2. Login → buka **Pengaturan**: harus ada **Default ongkos berat** dan **Default fee jastip** (AUD),
   bukan lagi "Default markup".
3. Buka keranjang customer → **tambah barang**: form punya kolom **Ongkos berat** dan **Fee jastip**
   (AUD), preview harga = (harga + ongkos + fee) × kurs, dibulatkan ke atas ke Rp1.000.
4. **Ubah markup/ongkos** pada barang **baru** → harus berhasil (tidak error).
5. Barang **lama** (dibuat sebelum update) → tombol "Ubah" tidak muncul; hanya bisa Hapus /
   Tandai Kosong. Kalau mau mengubahnya, hapus lalu tambahkan lagi.

## Kalau ada masalah

- Error di layar → buka `public_html/app/storage/logs/app.log`, baris paling bawah, kirim ke saya.
- `health` 500 dengan pesan kolom/SQL → kemungkinan migrasi belum/sebagian terimpor; cek langkah 3.
- Jangan lupa: data lama aman karena sudah di-backup di langkah 0.
