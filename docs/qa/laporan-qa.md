# Laporan QA aplikasi jastip (ringkas)

Tanggal: 26 Okt 2026. Versi: branch `mvp`, commit `1e984ff`, paket `rilis/jastip-htdocs.zip` (v0.1.0-uji).

Status: **pengujian dihentikan atas permintaan user.** Bagian A selesai. Bagian B (UI lintas browser dan ukuran layar) baru sebagian berjalan, dan hasilnya belum ditinjau ulang oleh QA.

- Bagian A lengkap: [`bagian-a.md`](bagian-a.md)
- Skrip uji yang bisa diulang: [`qa/README.md`](../../qa/README.md) (`qa/run.sh bagian-a`)

## Rekomendasi rilis

**Siap untuk uji coba pribadi (UAT) dengan catatan.** Perhitungan uang, status pembayaran, rekap WA, keamanan dasar, dan paket deploy lulus. Sebelum dipakai rutin dengan data customer sungguhan di internet (InfinityFree), perbaiki dulu dua bug keamanan Sedang: QA-A-01 dan QA-A-02.

## Hasil bagian A (API, keamanan, perhitungan, rekap, paket, MySQL 8)

**854 uji, 832 lulus.** Semua kegagalan berasal dari 7 bug di bawah. Tidak ada bug Kritis atau Tinggi.

- Perhitungan harga, kurs, DP, dan 5 status cocok penuh dengan perhitungan independen (Python `decimal`). Ini mencakup 443 kasus harga, 67 kurs, 70 DP, dan 150 aksi acak, tanpa selisih Rp1.
- Paket htdocs di Apache dengan MariaDB 10.11 (versi XAMPP) dan 11.4 (versi InfinityFree) lulus 128/128 cek: header, 48 file sensitif tertutup (403), `install.sql`, SQL admin.
- Request bersamaan (konkurensi) tidak pernah menghasilkan data salah.

## Temuan awal bagian B (belum ditinjau QA)

Uji UI sempat berjalan di **Chromium, WebKit (pendekatan Safari), dan Firefox**, di lebar 320, 360, 390, 768, 1024, dan 1440 px. Alur utama dengan data normal berjalan di ketiga browser. Kegagalan yang tercatat di `qa/hasil/matriks.json` dan `qa/hasil/tautan.json`:

| ID sementara | Temuan | Perkiraan keparahan |
|---|---|---|
| QA-B-01 | Nama sangat panjang **tanpa spasi** (mis. 50+ huruf menyambung) membuat halaman bisa digeser ke samping di daftar Open PO, menutupi header di detail PO, dan meluber di judul dialog hapus | Rendah |
| QA-B-02 | Toast dengan teks panjang (mis. "Rekap {nama panjang} tersalin…") lebih lebar dari layar HP dan terpotong | Rendah |
| QA-B-03 | WebKit menulis error CSP "Refused to apply a stylesheet…" di console. Belum diketahui apakah ada tampilan yang terdampak; perlu dicek di Safari iPhone | Perlu dicek |
| QA-B-04 | Firefox di lebar 320–360 px: tombol "+ Tambah barang" di bar bawah keranjang meluber 4–14 px | Rendah |
| QA-B-05 | Sheet pembayaran di layar sangat pendek (320×568) dengan data panjang mungkin tidak bisa di-scroll sampai tombol terakhir | Perlu dicek |
| — | QA-A-01 (open redirect) juga terbukti di WebKit dan Firefox | lihat QA-A-01 |

Yang belum sempat diuji: aksesibilitas (axe-core, keyboard), performa di jaringan lambat, clipboard di WebKit, dan XSS di render UI (skrip `qa/ui/xss.mjs` sudah ada, hasilnya belum ada).

## Semua bug

| ID | Keparahan | Pemilik | Ringkasan | Wajib sebelum rilis? |
|---|---|---|---|---|
| QA-A-01 | Sedang | front-end | Tautan login `next=/..//situs-lain/…` membawa admin ke situs lain setelah login (open redirect). Terjadi di Chromium, WebKit, Firefox | **Ya** |
| QA-A-02 | Sedang | back-end | Batas 5 kali salah kata sandi bisa dilewati dengan request bersamaan (7–8 tebakan lolos, bukan 5) | **Ya** |
| QA-A-06 | Sedang | back-end | File SQL upgrade (migrasi 002 dst.) gagal di MySQL 8 (error 1093). Tidak berdampak ke XAMPP/InfinityFree (MariaDB) | Tidak, sebelum migrasi 002 |
| QA-A-03 | Rendah | back-end + desain | `*`, `_`, `~` di nama PO/customer/barang mengacaukan huruf tebal/miring di rekap WA | Tidak |
| QA-A-04 | Rendah | back-end | Nama wajib bisa diisi spasi tak terlihat (NBSP, U+3000, U+200B) | Tidak |
| QA-A-05 | Rendah | back-end | Body JSON `[]` diterima seperti `{}` (kontrak minta 400) | Tidak |
| QA-A-07 | Rendah | back-end | Satu test back-end tidak portabel ke MySQL 8 (kode SQLSTATE berbeda); aplikasinya benar | Tidak |
| QA-B-01…05 | Rendah / perlu dicek | front-end | Lihat tabel bagian B di atas | Tidak |

Temuan spesifikasi (bukan bug) ada di [`bagian-a.md`](bagian-a.md#temuan-spesifikasi). Yang paling perlu diputuskan adalah **TS-A-01**: siapa pun yang tahu nama pengguna admin bisa membuat admin terkunci 15 menit. Sebaiknya pakai nama pengguna yang tidak mudah ditebak, bukan `pemilik`.

## Checklist uji manual oleh user

Hal-hal ini tidak bisa diuji di sandbox:

- [ ] **XAMPP di Windows**: ikuti `docs/deploy/jalankan-lokal-xampp.md` sampai checklist di bagian akhirnya, termasuk `http://localhost/app/.env` harus 403.
- [ ] **Chrome/Edge di laptop**: jalankan satu Open PO dari awal sampai rekap.
- [ ] **HP lewat Wi-Fi ke XAMPP**: buka `http://IP-laptop`; tombol salin rekap akan membuka "Salin manual" (normal untuk http).
- [ ] **InfinityFree**: ikuti `docs/deploy/infinityfree.md` sampai checklist; aktifkan SSL; biarkan tab terbuka 10–15 menit lalu simpan sesuatu (menguji pemulihan pengecekan browser).
- [ ] **iPhone Safari** (di InfinityFree, https): login, tambah barang, catat pembayaran, **Salin rekap WA** lalu tempel di WhatsApp. Cek tampilan tidak berantakan (terkait QA-B-03).
- [ ] **Android Chrome**: sama seperti iPhone.
- [ ] **Tempel rekap di WhatsApp**: huruf tebal di judul, total, dan sisa tampil benar; emoji ✅ muncul.
- [ ] **Backup**: coba Export database di phpMyAdmin dan simpan filenya.
