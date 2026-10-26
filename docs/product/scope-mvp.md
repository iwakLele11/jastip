# Scope MVP Aplikasi Jastip

Status: **final (scope freeze 27 Okt 2026)**. Target rilis: **Kamis, 26 November 2026**.
Fitur wajib baru setelah 27 Okt 2026 masuk backlog fase berikutnya.

## Konteks

- Pengguna: **admin tunggal** (pemilik jastip). Customer tidak login; mereka memesan lewat chat pribadi ke admin.
- Operasional berbasis **Open PO**. Untuk sekarang hanya satu negara: **Australia (AUD)**.
- Admin kemungkinan besar memakai HP, termasuk saat belanja di Australia.
- Teknologi: back-end PHP + MySQL dengan REST API JSON (siap dipakai aplikasi mobile nanti), front-end HTML + Tailwind CSS.
- Bahasa antarmuka: Bahasa Indonesia.

## Aturan bisnis dan rumus

### Kurs (dikunci per Open PO)

- Saat Open PO dibuat, sistem mengambil kurs pasar AUD→IDR dari [Frankfurter API](https://frankfurter.dev/) (`https://api.frankfurter.dev/v2/rate/aud/idr`, gratis, tanpa API key).
- `kurs_jastip = bulat_ke_atas_Rp1(kurs_pasar × (1 + buffer%))`. Buffer default AUD = 3%.
- Override manual: angka yang diisi admin adalah kurs jastip final, **tanpa** buffer. Ditampilkan dengan label "manual".
- Jika API gagal, admin wajib mengisi kurs manual. PO tidak bisa disimpan tanpa kurs.
- Kurs bisa diambil ulang atau diubah **hanya sebelum baris pesanan pertama tersimpan**. Setelah itu kurs PO terkunci permanen, walaupun baris tersebut kemudian dihapus.
- Tidak ada pengambilan kurs harian otomatis (cron).
- Disimpan per PO: kode mata uang (selalu `AUD`), kurs pasar, tanggal kurs dari respons API, buffer %, kurs jastip, penanda manual/otomatis.

### Harga jual per baris pesanan

```
harga_jual_unit = bulat_ke_atas_Rp1000( bulat_2_desimal( harga_aud × kurs_jastip × (1 + markup%) ) )
subtotal        = harga_jual_unit × qty
```

- Harga asli dalam AUD, maksimal 2 desimal, > 0. Qty bilangan bulat ≥ 1.
- Markup % dipilih per baris; terisi otomatis dari default markup di pengaturan. Rentang 0–100%, maksimal 2 desimal.
- Pembulatan 2 desimal memakai half-up. Hasil yang sudah tepat kelipatan Rp1.000 tidak boleh naik ke ribuan berikutnya.
- Setiap baris menyimpan snapshot: nama barang, harga AUD, kurs jastip, markup %, harga jual per unit, qty. Perubahan pengaturan tidak memengaruhi baris yang sudah ada.

### Total, DP, dan status pembayaran (per customer per Open PO)

```
total          = Σ subtotal baris yang TIDAK bertanda Kosong
dp             = bulat_ke_atas_Rp1000(total × DP%)      (DP default 50%)
dana_diterima  = Σ pembayaran − Σ pengembalian dana
sisa           = total − dana_diterima                  (tanpa pembulatan)
```

| Status | Kondisi |
|---|---|
| Belum bayar | dana_diterima = 0 dan total > 0 |
| Kurang DP | 0 < dana_diterima < dp |
| DP | dp ≤ dana_diterima < total |
| Lunas | dana_diterima = total (termasuk total Rp0 dan dana Rp0) |
| Lebih bayar | dana_diterima > total |

- DP % disimpan per Open PO saat PO dibuat (sama seperti kurs). Mengubah DP % di Pengaturan hanya berlaku untuk Open PO baru.
- DP dan status dihitung ulang setiap kali total berubah.
- Customer baru muncul di daftar Open PO setelah barang atau pembayaran pertamanya tersimpan, supaya keranjang kosong tidak tampil sebagai "Lunas".
- Pengembalian dana (refund) dilakukan admin secara pribadi di luar aplikasi; aplikasi hanya mencatat nominal, tanggal, dan catatan opsional.
- Pembayaran dan pengembalian dana yang salah input bisa **dihapus** (tidak bisa diubah); admin lalu mencatat ulang nominal yang benar. Status dihitung ulang setelah penghapusan.
- Pembayaran tidak bisa dihapus jika setelah dihapus Σ pembayaran < Σ pengembalian dana (dana diterima jadi negatif). Admin harus menghapus pengembalian dana terkait lebih dulu. Pengembalian dana selalu bisa dihapus.

## Fitur wajib (Must)

| # | Fitur | Acceptance criteria utama |
|---|---|---|
| M1 | Login admin | Login dengan nama pengguna dan kata sandi. Semua halaman dan endpoint API selain login menolak akses tanpa sesi. Password salah menampilkan pesan error umum. Logout mengakhiri sesi; sesi juga berakhir setelah 12 jam tidak aktif. Tidak ada registrasi publik. |
| M2 | Pengaturan | Default markup % (default 10%), buffer % untuk AUD (default 3%), DP % (default 50%). Semua bisa diubah admin kapan saja; perubahan hanya berlaku untuk data baru. |
| M3 | Open PO & kurs terkunci | Isian: nama PO, kurs (otomatis/manual), status Buka/Selesai. Mata uang tampil sebagai label tetap "AUD". Layar menampilkan kurs pasar, tanggal kurs, buffer, dan kurs jastip. Tombol "Ambil kurs terbaru" dan kolom kurs nonaktif permanen setelah ada baris pesanan. |
| M4 | Customer | Nama dan no WA wajib, alamat opsional. No WA hanya angka; awalan 08/62/+62 diseragamkan. Peringatan jika no WA sudah terdaftar. Cari berdasarkan nama atau no WA. Customer yang sudah punya pesanan diarsipkan, tidak dihapus. |
| M5 | Input pesanan | Satu form baris: nama barang (autocomplete dari barang di PO yang sama, harga AUD ikut terisi), harga AUD, qty, markup %. Preview harga/unit dan subtotal tampil sebelum simpan dan sama persis dengan hasil server. Baris bisa diedit, dihapus (untuk salah input), dan ditandai/dilepas tanda "Kosong". Baris Kosong tidak dihitung ke total. |
| M6 | Keranjang, pembayaran & pengembalian dana | Keranjang = pesanan satu customer dalam satu Open PO. Menampilkan total, DP, dana diterima, sisa, dan status. Catat pembayaran (nominal > 0, tanggal). Catat pengembalian dana (nominal > 0 dan ≤ kelebihan bayar, tanggal, catatan opsional); tombol hanya aktif saat status Lebih bayar. Pembayaran dan pengembalian dana bisa dihapus lewat dialog konfirmasi (tanpa fitur ubah), dengan aturan di bagian "Total, DP, dan status pembayaran". Daftar customer per PO bisa difilter per status. |
| M7 | Rekap WA | Satu klik menyalin teks rekap per customer per Open PO. Angka identik dengan layar. Format rupiah `Rp1.234.567`. Huruf tebal WA (`*teks*`) tampil benar. Baris Kosong tampil berlabel "Kosong" dan tidak dihitung. Baris "Dikembalikan" tampil jika ada pengembalian dana. Tidak menampilkan harga AUD, kurs, atau markup %. |

### Kebutuhan non-fungsional

- Semua alur utama nyaman dipakai di layar HP lebar 360px; tetap rapi di desktop.
- Perhitungan uang presisi (tidak boleh selisih Rp1). Perhitungan final ada di API.
- Semua fitur tersedia lewat REST API JSON.
- Data customer (nama, no WA, alamat) hanya bisa diakses setelah login; aplikasi berjalan di HTTPS.

## Should (setelah Must selesai)

- Daftar belanja per Open PO: nama barang, total qty, harga AUD, jumlah customer (tanpa baris Kosong).
- Teks penutup rekap WA (misalnya info rekening) di pengaturan.
- Open PO berstatus Selesai menjadi read-only untuk pesanan; pembayaran dan pengembalian dana tetap bisa dicatat.

## Ditunda

Biaya tambahan (ongkir, fee, bea cukai), pilihan negara/mata uang lain, beberapa mata uang dalam satu PO, kurs harian otomatis, DP berbeda per customer, fee minimum per barang, saldo lintas PO, login customer, aplikasi mobile, payment gateway, notifikasi WA otomatis, invoice PDF, laporan keuntungan, multi-admin, foto barang.

## Contoh hitungan (acuan test QA)

Kurs pasar 25 Okt 2026: 1 AUD = Rp12.673. Kurs jastip = 12.673 × 1,03 = 13.053,19 → **Rp13.054**.

| Barang | Harga AUD | Markup | Qty | harga × kurs | × (1+markup), 2 desimal | Harga/unit | Subtotal |
|---|---|---|---|---|---|---|---|
| A | 24,95 | 10% | 2 | 325.697,30 | 358.267,03 | 359.000 | 718.000 |
| B | 8,50 | 15% | 3 | 110.959,00 | 127.602,85 | 128.000 | 384.000 |
| C | 129,99 | 8% | 1 | 1.696.889,46 | 1.832.640,62 | 1.833.000 | 1.833.000 |

Keranjang A + B + C:

1. Total Rp2.935.000; DP 50% = 1.467.500 → **Rp1.468.000**.
2. Customer bayar Rp1.468.000 → status **DP**, sisa Rp1.467.000.
3. Customer bayar Rp1.467.000 → status **Lunas**.
4. Baris B ditandai Kosong → total Rp2.551.000, dana diterima Rp2.935.000 → **Lebih bayar Rp384.000**.
5. Admin catat pengembalian Rp384.000 → status **Lunas**.

## Format rekap WA

```
*REKAP JASTIP - Open PO Australia Nov 2026*
Customer: Rina (0812xxxxxxxx)

1. Barang A
   2 x Rp359.000 = Rp718.000
2. Barang B (Kosong)
3. Barang C
   1 x Rp1.833.000 = Rp1.833.000

*Total: Rp2.551.000*
DP 50%: Rp1.276.000
Sudah dibayar: Rp2.935.000
Dikembalikan: Rp384.000
*Sisa pelunasan: Rp0*
Status: LUNAS ✅
```

Variasi per status:

- Belum bayar: baris "Sudah dibayar/Sisa" diganti `*Mohon transfer DP: Rp…*`.
- DP: `Status: DP diterima ✅`.
- Lebih bayar: `Kelebihan bayar (dikembalikan): Rp…`.

Kata-kata label final ditentukan saat fase desain.

## Timeline

| Fase | Tanggal |
|---|---|
| Scope freeze | 26–27 Okt 2026 |
| Desain UI/UX | 28 Okt – 3 Nov |
| Kontrak API | 28–30 Okt |
| Back-end tahap 1 (login, pengaturan, kurs, PO, customer) | 28 Okt – 6 Nov |
| Front-end tahap 1 | 4–11 Nov |
| Back-end tahap 2 (pesanan, pembayaran, rekap) | 9–13 Nov |
| Front-end tahap 2 | 11–18 Nov |
| Uji fungsional + bugfix | 16–20 Nov |
| Regression + UAT bersama admin | 23–25 Nov |
| **Rilis MVP** | **Kamis, 26 Nov 2026** |
