# Panduan Cepat Admin — Jastip

Versi ringkas untuk dipakai sambil kerja. Panduan lengkap:
[`panduan-penggunaan.md`](panduan-penggunaan.md).

**Buka aplikasi:** https://www.bagasimel.my.id (harus ada gembok 🔒)

---

## Alur singkat (dari buka titipan sampai lunas)

```
1. Pengaturan  →  2. Buat Open PO  →  3. Tambah Customer
→  4. Catat barang  →  5. Kirim rekap WA (minta DP)
→  6. Catat pembayaran  →  ulangi kirim rekap sampai LUNAS
```

---

## 1. Login
- Buka https://www.bagasimel.my.id → isi **nama pengguna** + **kata sandi** → **Masuk**.
- Keluar: tombol **Keluar** di kanan atas. (Otomatis keluar kalau 12 jam tidak dipakai.)

## 2. Atur Pengaturan (sekali di awal)
Menu **Pengaturan** → atur lalu **Simpan**:
- **Markup** (untung per barang) — bawaan 10%
- **Buffer kurs** (pengaman kurs) — bawaan 3%
- **DP** (uang muka) — bawaan 50%

⚠️ Ubahan di Pengaturan **hanya untuk data baru**. Atur dulu sebelum bikin PO & catat barang.

## 3. Buat Open PO
**Open PO** → **+ Open PO baru**:
- **Nama PO** (mis. `Australia Nov 2026`)
- **Kurs**: pilih **Otomatis** (disarankan) atau **Manual** (isi sendiri kalau otomatis gagal)
- **Simpan Open PO**

⚠️ **Kurs terkunci** begitu barang pertama dicatat. Pastikan kurs benar **sebelum** catat barang.

## 4. Tambah Customer
**Customer** → **Customer baru**:
- **Nama** (wajib), **No WA** (wajib, angka saja mis. `081234567890`), **Alamat** (opsional)
- **Simpan customer**

💡 Customer baru muncul di daftar PO **setelah** punya barang/pembayaran pertama.

## 5. Catat barang pesanan
Buka **Keranjang** customer → tambah barang. Tiap barang isi:
- **Nama barang** (ada saran otomatis), **Harga AUD** (mis. `24.95`), **Qty**, **Markup %**
- Cek **preview harga & subtotal** → simpan.

Pada tiap baris kamu bisa: **Edit**, **Hapus** (salah input), atau **Tandai "Kosong"** (barang
habis — tetap tampil di rekap, tapi tidak dihitung).

## 6. Lihat total & DP
Di **Keranjang** muncul otomatis: **Total**, **DP**, **Dana diterima**, **Sisa**, **Status**.
Kamu tidak perlu hitung manual.

## 7. Catat pembayaran
Keranjang → bagian pembayaran → isi **Nominal** (>0) + **Tanggal** → simpan.
Status & sisa langsung diperbarui.

💡 Salah input? Pembayaran **tidak bisa diedit** — **hapus** lalu catat ulang yang benar.

## 8. Kirim rekap ke WhatsApp
Keranjang → **Salin rekap WA** → buka WA customer → tempel (paste) → kirim.
Rekap tidak menampilkan harga AUD/kurs/markup, jadi aman dikirim.

## 9. Kalau customer kelebihan bayar (refund)
Tombol pengembalian dana aktif saat status **Lebih bayar**. Uang kamu transfer sendiri di luar
aplikasi; aplikasi cuma mencatat **Nominal + Tanggal + Catatan**.

---

## Arti status pembayaran
| Status | Artinya |
|---|---|
| **Belum bayar** | Belum ada pembayaran |
| **Kurang DP** | Sudah bayar sebagian, belum sampai DP |
| **DP** | Sudah ≥ DP, belum lunas |
| **Lunas** | Sudah bayar penuh |
| **Lebih bayar** | Bayar lebih dari total → sebaiknya dikembalikan |

## Masalah cepat
- **"Terjadi kesalahan di server"** → muat ulang halaman; kalau tetap, hubungi pengelola hosting.
- **Kurs otomatis gagal** → pilih **Manual**, isi kurs sendiri.
- **"Permintaan ditolak" saat login** → pastikan buka lewat **https://** (bukan http).
- **Customer tidak muncul di daftar PO** → catat 1 barang/pembayaran dulu.
