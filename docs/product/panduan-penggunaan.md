# Panduan Penggunaan Aplikasi Jastip Admin

Panduan ini untuk kamu, admin/pemilik jastip, yang memakai aplikasi sehari-hari.
Ditulis dengan bahasa sederhana. Aplikasi bisa dibuka dari HP maupun laptop.

**Alamat aplikasi:** https://www.bagasimel.my.id

> Catatan: hanya **admin** yang login. Customer tidak punya akun — mereka memesan lewat
> chat pribadi (WhatsApp), lalu kamu yang mencatat pesanannya di aplikasi ini.

---

## Daftar isi

1. [Gambaran singkat: bagaimana aplikasi ini bekerja](#1-gambaran-singkat)
2. [Masuk (login) dan keluar (logout)](#2-masuk-dan-keluar)
3. [Atur Pengaturan dulu (sekali di awal)](#3-atur-pengaturan-dulu)
4. [Langkah kerja satu putaran jastip (urutan yang disarankan)](#4-langkah-kerja-satu-putaran-jastip)
5. [Membuat Open PO](#5-membuat-open-po)
6. [Menambah Customer](#6-menambah-customer)
7. [Mencatat pesanan barang](#7-mencatat-pesanan-barang)
8. [Keranjang: lihat total, DP, dan status](#8-keranjang-total-dp-dan-status)
9. [Mencatat pembayaran](#9-mencatat-pembayaran)
10. [Mencatat pengembalian dana (refund)](#10-mencatat-pengembalian-dana-refund)
11. [Menyalin rekap ke WhatsApp](#11-menyalin-rekap-ke-whatsapp)
12. [Arti status pembayaran](#12-arti-status-pembayaran)
13. [Istilah penting](#13-istilah-penting)
14. [Pertanyaan yang sering muncul](#14-pertanyaan-yang-sering-muncul)

---

## 1. Gambaran singkat

Aplikasi ini membantu kamu mengelola jastip (jasa titip) dari Australia. Alurnya:

1. Kamu buka **Open PO** (sesi titipan, mis. "Open PO Australia Nov 2026").
2. Saat PO dibuat, aplikasi **mengunci kurs AUD→Rupiah** supaya harga adil dan tidak berubah-ubah.
3. Customer memesan lewat WA. Kamu catat tiap customer dan **barang pesanannya**.
4. Aplikasi otomatis menghitung **harga jual, total, DP, dan sisa pelunasan**.
5. Kamu catat **pembayaran** dari customer.
6. Kamu kirim **rekap** ke customer lewat WhatsApp dengan satu klik.

Kamu tidak perlu menghitung manual — aplikasi yang menghitung semuanya.

---

## 2. Masuk dan keluar

**Masuk (login):**
1. Buka https://www.bagasimel.my.id
2. Isi **nama pengguna** dan **kata sandi** admin, lalu klik **Masuk**.

**Keluar (logout):**
- Klik tombol **Keluar** di pojok kanan atas.

**Hal yang perlu tahu:**
- Kalau kata sandi salah, muncul pesan error. (Demi keamanan, pesannya tidak menyebut apakah
  yang salah nama pengguna atau kata sandinya.)
- Kalau aplikasi tidak dipakai **selama 12 jam**, kamu otomatis keluar dan harus login lagi.
- Selalu buka lewat **https://** (ada gembok di address bar). Lewat http biasa, login ditolak.

---

## 3. Atur Pengaturan dulu

Sebelum mulai, buka menu **Pengaturan** (di bar atas). Ada tiga angka yang mengatur cara aplikasi
menghitung harga. Nilai bawaan sudah masuk akal, tapi boleh kamu ubah.

| Pengaturan | Artinya | Bawaan |
|---|---|---|
| **Default ongkos berat** | Perkiraan ongkos berat/kirim per barang (AUD) | AUD 5 |
| **Default fee jastip** | Fee jasa titip per barang (AUD) | AUD 3 |
| **Buffer kurs AUD** | Pengaman kurs supaya tidak rugi saat kurs naik (%) | 3% |
| **DP (uang muka)** | Berapa persen total yang diminta sebagai uang muka | 50% |

Klik **Simpan pengaturan** setelah mengubah.

> **Penting:** Mengubah angka di Pengaturan **hanya berlaku untuk data baru**. Open PO, barang,
> dan DP yang sudah terlanjur dibuat **tidak ikut berubah**. Jadi atur ini di awal, sebelum
> membuat Open PO dan mencatat barang.

---

## 4. Langkah kerja satu putaran jastip

Urutan yang disarankan dari awal buka titipan sampai customer lunas:

1. **Pengaturan** → pastikan markup, buffer, dan DP sudah sesuai. (Bagian 3)
2. **Buat Open PO** → kurs otomatis terkunci. (Bagian 5)
3. **Tambah Customer** setiap ada yang memesan. (Bagian 6)
4. **Catat pesanan barang** tiap customer. (Bagian 7)
5. Buka **Keranjang** customer → lihat total & DP. (Bagian 8)
6. **Salin rekap WA** → kirim ke customer, minta transfer DP. (Bagian 11)
7. Customer bayar → **catat pembayaran**. (Bagian 9)
8. Ulangi kirim rekap setiap ada perubahan sampai **Lunas**.

---

## 5. Membuat Open PO

Open PO adalah satu sesi titipan (satu periode belanja).

1. Di halaman **Open PO**, klik **+ Open PO baru**.
2. **Nama Open PO**: beri nama yang jelas, mis. `Open PO Australia Nov 2026`.
3. **Mata uang**: sudah tetap **AUD (Dolar Australia)**.
4. **Kurs**: pilih salah satu:
   - **Otomatis** (disarankan): aplikasi mengambil kurs AUD→Rupiah terbaru otomatis, lalu
     menambahkan buffer. Kamu akan melihat kurs pasar, tanggal kurs, dan **kurs jastip** (kurs
     yang dipakai untuk menghitung harga).
   - **Manual**: kamu isi sendiri **Kurs jastip (Rp per 1 AUD)**. Pakai ini kalau pengambilan
     kurs otomatis gagal, atau kamu ingin menentukan kurs sendiri. Isi angka saja, mis. `13054`.
5. **Status**: biarkan **Buka** (nanti ubah ke **Selesai** kalau titipan sudah ditutup).
6. Klik **Simpan Open PO**.

> **Kurs terkunci:** Setelah kamu mulai mencatat barang pesanan pertama, **kurs PO ini tidak bisa
> diubah lagi** (tombol "ambil kurs terbaru" dan kolom kurs jadi nonaktif). Ini disengaja supaya
> semua customer di PO yang sama dihitung dengan kurs yang sama. Jadi pastikan kurs sudah benar
> **sebelum** mencatat barang.

**Menghapus Open PO.** Kalau ada PO yang salah dibuat dan ingin dibuang, buka PO itu lalu klik
tombol **Hapus** di kanan atas. Muncul konfirmasi yang menyebut berapa customer dan berapa dana
yang sudah masuk di PO itu — sebagai pengingat. Kalau kamu lanjutkan, **seluruh isi PO (barang,
pembayaran, pengembalian dana) ikut terhapus permanen** dan tidak bisa dikembalikan. Data customer
sendiri tidak terhapus (mereka tetap ada di menu Customer). Karena permanen, baca dulu angka di
konfirmasi sebelum menghapus.

---

## 6. Menambah Customer

Setiap orang yang memesan dicatat sebagai customer.

1. Buka menu **Customer** → klik **Customer baru** (atau tambahkan dari dalam Open PO).
2. Isi:
   - **Nama** (wajib)
   - **No WA** (wajib) — angka saja, contoh `081234567890`. Awalan `08`, `62`, atau `+62`
     otomatis diseragamkan.
   - **Alamat** (opsional)
3. Klik **Simpan customer**.

**Hal yang perlu tahu:**
- Kalau no WA sudah pernah terdaftar, muncul **peringatan** supaya tidak dobel.
- Kamu bisa **mencari** customer berdasarkan nama atau no WA.
- Customer baru **baru muncul di daftar Open PO setelah** dia punya barang atau pembayaran
  pertama. Ini supaya customer yang belum pesan apa-apa tidak tampil membingungkan.

---

## 7. Mencatat pesanan barang

Catat barang yang dipesan tiap customer di dalam Open PO terkait.

1. Buka **Open PO** → pilih customer → buka **Keranjang**-nya.
2. Tambahkan barang satu per satu. Untuk tiap barang isi:
   - **Nama barang** — saat mengetik, akan muncul saran dari barang yang sudah ada di PO yang
     sama (harga AUD-nya ikut terisi otomatis).
   - **Harga AUD** — harga asli di Australia, maksimal 2 angka di belakang koma, mis. `24.95`.
   - **Qty** — jumlah, minimal 1.
   - **Ongkos berat (AUD)** — perkiraan ongkos berat barang; sudah terisi default dari Pengaturan, boleh diubah per barang.
   - **Fee jastip (AUD)** — fee jasa titip; sudah terisi default dari Pengaturan, boleh diubah per barang.

   Harga jual dihitung: **(harga + ongkos berat + fee jastip) × kurs**, lalu dibulatkan ke atas ke
   Rp1.000. Semua dikali qty.
3. Sebelum simpan, aplikasi menampilkan **preview harga per unit dan subtotal**. Angka ini sama
   persis dengan hasil akhir.
4. Simpan barang.

**Yang bisa kamu lakukan pada baris barang:**
- **Edit** — kalau ada yang salah ketik.
- **Hapus** — untuk salah input.
- **Tandai "Kosong"** — kalau barang ternyata **habis / tidak dapat dibeli**. Baris Kosong
  **tetap tampil** di rekap (supaya customer tahu), tapi **tidak dihitung** ke total. Tanda
  Kosong bisa dilepas lagi kalau barang akhirnya dapat.

> Setiap baris menyimpan "foto" harga saat dicatat (harga AUD, kurs, ongkos, fee, harga jual).
> Jadi kalau nanti kamu mengubah Pengaturan, barang yang sudah dicatat **tidak berubah**.
>
> Barang yang dicatat dengan versi lama aplikasi (sistem markup %) **tidak bisa diedit** — kalau
> perlu diubah, hapus lalu tambahkan lagi.

---

## 8. Keranjang: total, DP, dan status

**Keranjang** = semua pesanan satu customer dalam satu Open PO. Di halaman Keranjang kamu melihat:

- **Total** — jumlah semua subtotal barang (baris Kosong tidak dihitung).
- **DP** — uang muka yang diminta (mis. 50% dari total, dibulatkan).
- **Dana diterima** — total yang sudah dibayar dikurangi yang dikembalikan.
- **Sisa** — yang masih harus dibayar.
- **Status** — lihat [bagian 12](#12-arti-status-pembayaran).

Di daftar customer dalam satu Open PO, kamu bisa **memfilter berdasarkan status** (mis. hanya yang
"Belum bayar") supaya mudah menagih.

---

## 9. Mencatat pembayaran

Setiap kali customer transfer, catat di aplikasi.

1. Buka **Keranjang** customer.
2. Pada bagian pembayaran / **Riwayat pembayaran**, tambahkan pembayaran baru:
   - **Nominal** — harus lebih dari 0.
   - **Tanggal** pembayaran.
3. Simpan. **Status dan sisa** otomatis dihitung ulang.

**Hal yang perlu tahu:**
- Pembayaran **tidak bisa diubah**. Kalau salah input, **hapus** pembayaran itu (lewat dialog
  konfirmasi) lalu catat ulang nominal yang benar.
- Semua pembayaran yang dicatat muncul di **Riwayat pembayaran**.

---

## 10. Mencatat pengembalian dana (refund)

Dipakai kalau customer **kelebihan bayar** (mis. ada barang yang Kosong setelah dia sudah lunas),
dan kamu mengembalikan uangnya lewat transfer pribadi.

1. Pengembalian uang ke customer kamu lakukan **sendiri di luar aplikasi** (transfer biasa).
   Aplikasi hanya **mencatat** nominalnya.
2. Tombol pengembalian dana **hanya aktif saat status "Lebih bayar"**.
3. Catat:
   - **Nominal** — lebih dari 0 dan **tidak melebihi** kelebihan bayar.
   - **Tanggal**.
   - **Catatan** (opsional).

**Hal yang perlu tahu:**
- Pengembalian dana juga **tidak bisa diubah**, hanya bisa **dihapus** lalu dicatat ulang.
- Aturan hapus: pembayaran tidak boleh dihapus kalau setelah dihapus jumlah pengembalian jadi
  lebih besar dari jumlah pembayaran. Kalau begitu, **hapus pengembalian dananya dulu**, baru
  pembayarannya.

---

## 11. Menyalin rekap ke WhatsApp

Fitur paling sering dipakai untuk komunikasi ke customer.

1. Buka **Keranjang** customer.
2. Klik **Salin rekap WA**. Teks rekap tersalin ke clipboard.
3. Buka WhatsApp customer, **tempel** (paste), kirim.

Isi rekap otomatis rapi: alamat customer (kalau diisi), daftar barang, dan total. Format rupiah
seperti `Rp2.551.000`, dan tulisan tebal WhatsApp (`*teks*`) tampil benar. Barang Kosong ditandai,
barang yang dikembalikan ditampilkan. Semua rekap diakhiri `Terimakasih 💕`.

Bagian bawah rekap menyesuaikan status:
- **Belum lunas** (belum bayar / kurang DP / DP): muncul `*Silakan lakukan pembayaran*` dan
  `Rekening BCA : 5005023600`, **tanpa** menampilkan status — supaya tidak terkesan menagih.
- **Sudah lunas / lebih bayar**: menampilkan `Status: LUNAS ✅` atau info kelebihan bayar.

Baris **Alamat** hanya muncul kalau customer punya alamat. Kalau alamatnya belum diisi, baris itu
tidak ditampilkan (rekap tetap rapi).

Rekap **tidak** menampilkan harga asli AUD, kurs, atau markup — jadi aman dikirim ke customer.

Contoh rekap untuk customer yang **belum lunas** (belum bayar / kurang DP / DP) — berisi ajakan
bayar + nomor rekening, tanpa baris status:

```
*REKAP JASTIP - Open PO Australia Nov 2026*
Customer: Rina (0812xxxxxxxx)
Alamat: Jl. Melati No. 5, Jakarta

1. Barang A
   2 x Rp359.000 = Rp718.000
2. Barang B (Kosong)
3. Barang C
   1 x Rp1.833.000 = Rp1.833.000

*Total: Rp2.551.000*
DP 50%
*Silakan lakukan pembayaran*
Rekening BCA : 5005023600
Terimakasih 💕
```

Contoh rekap untuk customer yang **sudah lunas** — tetap menampilkan status:

```
*Total: Rp2.935.000*
DP 50%
Sudah dibayar: Rp2.935.000
*Sisa pelunasan: Rp0*
Status: LUNAS ✅
Terimakasih 💕
```

---

## 12. Arti status pembayaran

| Status | Artinya |
|---|---|
| **Belum bayar** | Belum ada pembayaran masuk sama sekali. |
| **Kurang DP** | Sudah bayar sebagian, tapi belum mencapai jumlah DP. |
| **DP** | Sudah membayar minimal DP, tapi belum lunas. |
| **Lunas** | Sudah membayar penuh (sama dengan total). |
| **Lebih bayar** | Membayar lebih dari total. Kelebihan sebaiknya dikembalikan (lihat bagian 10). |

Status dihitung ulang otomatis setiap kali ada perubahan barang, pembayaran, atau pengembalian.

---

## 13. Istilah penting

- **Open PO** — satu sesi/periode titipan belanja (mis. "Australia Nov 2026").
- **Kurs jastip** — kurs AUD→Rupiah yang dipakai aplikasi untuk menghitung harga jual. Sudah
  termasuk buffer. Dikunci per Open PO.
- **Buffer** — tambahan persen pada kurs sebagai pengaman kalau kurs naik.
- **Markup** — keuntungan yang ditambahkan ke tiap barang.
- **DP** — uang muka, sebagian dari total yang diminta di awal.
- **Keranjang** — kumpulan pesanan satu customer dalam satu Open PO.
- **Baris "Kosong"** — barang yang ternyata tidak dapat dibeli; tampil di rekap tapi tidak
  dihitung ke total.
- **Subtotal** — harga jual per unit dikali jumlah (qty).

---

## 14. Pertanyaan yang sering muncul

**Kenapa harga jual dibulatkan?**
Supaya angka enak dibaca dan ditransfer. Harga per unit dibulatkan ke atas ke kelipatan Rp1.000.

**Saya salah mengisi kurs, tapi sudah terkunci. Bagaimana?**
Kurs terkunci setelah ada barang pertama. Kalau benar-benar salah, buat **Open PO baru** dengan
kurs yang benar dan pindahkan pesanannya ke sana. Pastikan lain kali kurs sudah benar sebelum
mencatat barang.

**Kurs otomatis gagal diambil.**
Layanan kurs sedang tidak bisa dihubungi. Pilih mode **Manual** dan isi kurs jastip sendiri, atau
coba lagi beberapa saat kemudian.

**Saya ubah markup/DP di Pengaturan, kenapa barang lama tidak berubah?**
Memang disengaja. Perubahan pengaturan hanya berlaku untuk data **baru**. Yang sudah tercatat
tetap memakai angka saat dicatat.

**Customer sudah saya buat, tapi tidak muncul di daftar Open PO.**
Customer baru muncul setelah punya **barang atau pembayaran pertama** di PO itu. Catat satu barang
atau satu pembayaran, nanti dia muncul.

**Salah catat pembayaran. Tidak ada tombol edit.**
Pembayaran memang tidak bisa diubah. **Hapus** yang salah, lalu catat ulang nominal yang benar.

**Muncul "Terjadi kesalahan di server."**
Ada gangguan teknis (biasanya koneksi database atau konfigurasi). Coba muat ulang halaman; kalau
tetap, hubungi yang mengelola hosting/developer. (Detail teknis ada di
`docs/deploy/indowebsite.md`.)

**Bisa dipakai di HP?**
Ya. Semua halaman utama dirancang nyaman dipakai di layar HP, termasuk saat kamu sedang belanja
di Australia.
