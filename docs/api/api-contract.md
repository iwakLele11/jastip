# Kontrak API v1 — Aplikasi Jastip (MVP)

Status: **final**. Semua endpoint Must sudah diimplementasi dan dites di `backend/` (tahap 1: auth, pengaturan, kurs, Open PO, customer; tahap 2: customer per PO, keranjang, pembayaran, pengembalian dana, rekap WA). Sumber aturan: [`docs/product/scope-mvp.md`](../product/scope-mvp.md) dan [`docs/design/ui-spec.md`](../design/ui-spec.md).

Penanda di daftar endpoint:
- ✅ sudah diimplementasi dan dites (`backend/`, `bin/test.sh`).

---

## 1. Konvensi umum

### 1.1 Dasar

| Hal | Aturan |
|---|---|
| Base path | `/api/v1`, satu origin dengan front-end, wajib HTTPS di staging/production |
| Format | JSON UTF-8. Nama field `snake_case` Bahasa Indonesia |
| Request yang mengubah data | `POST`, `PATCH`, `DELETE`. `POST`/`PATCH` **wajib** header `Content-Type: application/json`, termasuk yang tanpa body (kirim `{}` atau body kosong) |
| Sukses | `{"data": ...}`, daftar ditambah `"meta"` |
| Error | `{"error": {"kode": "...", "pesan": "...", "field": {...}}}` (lihat §1.5) |
| Waktu | `dibuat_pada`, `diubah_pada`, dst. dalam ISO 8601 UTC: `"2026-10-25T09:00:00Z"` |
| Tanggal | `"YYYY-MM-DD"` (tanggal pembayaran, tanggal kurs). Tanpa zona waktu, dikirim apa adanya dari perangkat |
| Cache | Semua respons `Cache-Control: no-store` |

### 1.2 Tipe angka (tanpa float)

| Jenis | Di request | Di respons | Contoh |
|---|---|---|---|
| Rupiah | integer JSON | integer JSON | `1468000` |
| Qty | integer JSON | integer JSON | `2` |
| Kurs jastip | integer JSON (rupiah per 1 AUD) | integer JSON | `13054` |
| Harga AUD | **string** desimal, maks. 2 desimal | string, selalu 2 desimal | req `"24,95"` atau `"24.95"` → resp `"24.95"` |
| Persen (markup, buffer, DP) | **string** desimal, maks. 2 desimal | string, nol di belakang dibuang | req `"3,5"` → resp `"3.5"`; `"10"` |
| Kurs pasar | string desimal, maks. 6 desimal | string, nol di belakang dibuang | `"12673"`, `"12673.45"` |

- Pemisah desimal boleh titik atau koma, tepat satu. Pemisah ribuan **tidak** diterima: `"1.299"` dibaca 1 koma 299 (3 desimal) dan ditolak untuk harga AUD ("Maksimal 2 angka di belakang koma."), sesuai ui-spec §9.3.
- Angka JSON (`24.95`, `10`) untuk field desimal ditolak supaya tidak ada ambiguitas float atau satuan.
- Respons selalu memakai titik. Front-end memformat untuk tampilan (§10 ui-spec): `"24.95"` → `AUD 24,95`, `1468000` → `Rp1.468.000`.
- Di server: harga AUD disimpan dalam sen, persen dalam basis point (1% = 100), rupiah bulat.

### 1.3 Autentikasi

| Klien | Cara |
|---|---|
| Web | `POST /auth/login` mengirim cookie sesi `__Host-jastip_sesi` (HTTPS) atau `jastip_sesi` (lokal tanpa HTTPS): `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`. Token tidak ada di body. Browser mengirim cookie otomatis |
| Mobile (nanti) | `POST /auth/login` dengan `"klien": "mobile"` → token di body. Kirim `Authorization: Bearer <token>` di setiap request. Tidak ada cookie |

- Sesi berakhir setelah **12 jam tidak aktif** (sliding). Setiap request terautentikasi memperpanjang sesi; untuk web, cookie dikirim ulang (paling sering sekali per menit) supaya `Max-Age` ikut diperpanjang.
- Token: 32 byte acak (64 karakter hex). Server hanya menyimpan hash SHA-256.
- Semua endpoint selain `POST /auth/login` dan `GET /health` mengembalikan `401` tanpa sesi valid.
- `401 SESI_BERAKHIR` = sesi habis karena tidak aktif → tampilkan "Sesi berakhir. Silakan masuk lagi." `401 BELUM_MASUK` = tidak ada token / token tidak dikenal (mis. sudah logout). Keduanya: simpan rute, arahkan ke `/login?next=…` (ui-spec §12.7).

### 1.4 Proteksi CSRF

1. Cookie `SameSite=Strict`.
2. Request `POST`/`PATCH`/`DELETE` yang membawa header `Origin` harus berasal dari origin yang terdaftar (`APP_ALLOWED_ORIGINS`). Selain itu → `403 ORIGIN_DITOLAK`.
3. `POST`/`PATCH` wajib `Content-Type: application/json` → selain itu `415 CONTENT_TYPE_TIDAK_DIDUKUNG`. Form HTML lintas situs tidak bisa mengirim tipe ini tanpa preflight CORS, dan API tidak mengaktifkan CORS.

Tidak ada token CSRF terpisah yang perlu dikelola front-end.

### 1.5 Format error

```json
{
  "error": {
    "kode": "VALIDASI",
    "pesan": "Periksa 2 isian yang ditandai.",
    "field": {
      "harga_aud": "Maksimal 2 angka di belakang koma.",
      "qty": "Qty minimal 1."
    }
  }
}
```

- `pesan` siap ditampilkan (Bahasa Indonesia, microcopy ui-spec §9.3/§9.4).
- `field` hanya ada untuk `VALIDASI`. Kunci = nama field request; field bertingkat memakai titik, mis. `"kurs.kurs_jastip"`.
- Untuk `VALIDASI`: kalau 1 field salah, `pesan` = pesan field itu; kalau lebih, `"Periksa {n} isian yang ditandai."`.

| HTTP | `kode` | Kapan | `pesan` |
|---|---|---|---|
| 400 | `JSON_TIDAK_VALID` | Body bukan JSON objek | "Format JSON tidak valid." / "Body harus berupa objek JSON." |
| 401 | `BELUM_MASUK` | Tanpa token / token tidak dikenal | "Silakan masuk terlebih dahulu." |
| 401 | `SESI_BERAKHIR` | 12 jam tidak aktif | "Sesi berakhir. Silakan masuk lagi." |
| 401 | `LOGIN_GAGAL` | Nama pengguna atau kata sandi salah | "Nama pengguna atau kata sandi salah." |
| 403 | `ORIGIN_DITOLAK` | Origin tidak terdaftar | "Permintaan ditolak." |
| 404 | `ENDPOINT_TIDAK_DITEMUKAN` | Path tidak ada / ID bukan angka positif | "Endpoint tidak ditemukan." |
| 404 | `TIDAK_DITEMUKAN` | Data dengan ID tersebut tidak ada | mis. "Open PO tidak ditemukan." |
| 405 | `METODE_TIDAK_DIIZINKAN` | Metode salah (header `Allow` berisi metode yang benar) | "Metode tidak diizinkan untuk endpoint ini." |
| 409 | `KURS_TERKUNCI` | Ubah kurs PO yang sudah punya pesanan | "Kurs sudah terkunci karena ada pesanan. Data kurs terbaru sudah dimuat." |
| 409 | `CUSTOMER_PUNYA_PESANAN` | Hapus customer yang punya pesanan | "{nama} sudah punya pesanan, jadi tidak bisa dihapus. Arsipkan customer ini." |
| 409 | `CUSTOMER_DIARSIPKAN` | Buat keranjang baru untuk customer yang diarsipkan | "Customer ini sudah diarsipkan." |
| 409 | `PENGEMBALIAN_TIDAK_AKTIF` | Catat pengembalian dana saat status bukan Lebih bayar | "Pengembalian dana hanya bisa dicatat saat status Lebih bayar." |
| 409 | `HAPUS_PENGEMBALIAN_DULU` | Hapus pembayaran yang membuat dana diterima negatif | Isi dialog ui-spec §9.5 dengan nominal pengembalian |
| 413 | `BODY_TERLALU_BESAR` | Body > 64 KB | "Ukuran data terlalu besar." |
| 415 | `CONTENT_TYPE_TIDAK_DIDUKUNG` | `POST`/`PATCH` tanpa JSON | "Gunakan Content-Type: application/json." |
| 422 | `VALIDASI` | Input tidak valid | lihat atas |
| 429 | `TERLALU_BANYAK_PERCOBAAN` | ≥ 5 login gagal / nama pengguna / 15 menit (header `Retry-After` dalam detik) | "Terlalu banyak percobaan masuk. Coba lagi dalam {n} menit." |
| 500 | `KESALAHAN_SERVER` | Error tak terduga (detail hanya di log server) | "Terjadi kesalahan di server. Coba lagi beberapa saat lagi." |
| 502 | `KURS_GAGAL` | Frankfurter gagal / timeout 5 detik / respons tidak valid | "Kurs otomatis gagal diambil. Isi kurs manual, atau coba lagi." |
| 503 | `LAYANAN_TIDAK_TERSEDIA` | Health check: database mati | "Database tidak dapat dihubungi." |

### 1.6 Pagination

Query `?halaman=1&per_halaman=20` (default 20, maks. 100).

```json
"meta": { "halaman": 1, "per_halaman": 20, "total": 42, "total_halaman": 3 }
```

Nilai tidak valid → `422 VALIDASI` dengan `field.halaman` / `field.per_halaman`.

### 1.7 No WA

| Field | Format | Contoh |
|---|---|---|
| `no_wa` (respons, disimpan) | kanonik: digit saja, awalan `62`, 11–15 digit | `"6281234567890"` |
| `no_wa_tampil` (respons) | awalan `0`, untuk layar dan rekap WA | `"081234567890"` |
| `no_wa` (request) | awalan `08`, `62`, atau `+62`. Spasi, `-`, `(`, `)` dibuang dulu | `"0812-3456-7890"`, `"+62 812 3456 7890"` |

Urutan validasi dan pesan: kosong → "No WA wajib diisi."; ada huruf/simbol → "No WA hanya boleh berisi angka."; awalan lain → "No WA harus diawali 08, 62, atau +62."; panjang di luar 10–14 digit (format 08) → "No WA harus 10–14 digit (format 08…)."

---

## 2. Daftar endpoint

| | Metode | Path | Keterangan |
|---|---|---|---|
| ✅ | GET | `/health` | Health check (publik) |
| ✅ | POST | `/auth/login` | Login (publik) |
| ✅ | POST | `/auth/logout` | Logout |
| ✅ | GET | `/auth/sesi` | Info sesi |
| ✅ | GET | `/pengaturan` | Baca pengaturan |
| ✅ | PATCH | `/pengaturan` | Ubah pengaturan |
| ✅ | GET | `/kurs/aud-idr` | Pratinjau kurs otomatis |
| ✅ | GET | `/open-po` | Daftar Open PO + ringkasan |
| ✅ | POST | `/open-po` | Buat Open PO |
| ✅ | GET | `/open-po/{id}` | Detail Open PO + `kurs_terkunci` + ringkasan |
| ✅ | PATCH | `/open-po/{id}` | Ubah nama / status / kurs |
| ✅ | GET | `/customer` | Daftar & cari customer |
| ✅ | POST | `/customer` | Buat customer |
| ✅ | GET | `/customer/cek-no-wa` | Cek duplikat no WA |
| ✅ | GET | `/customer/{id}` | Detail customer + `punya_pesanan` |
| ✅ | PATCH | `/customer/{id}` | Ubah customer |
| ✅ | DELETE | `/customer/{id}` | Hapus customer tanpa pesanan |
| ✅ | POST | `/customer/{id}/arsip` | Arsipkan customer |
| ✅ | GET | `/open-po/{id}/customer` | Customer per PO + status + jumlah per status |
| ✅ | GET | `/open-po/{id}/barang-unik` | Barang unik (nama + harga AUD) untuk saran |
| ✅ | GET | `/open-po/{id}/keranjang/{customer_id}` | Keranjang lengkap |
| ✅ | POST | `/open-po/{id}/keranjang/{customer_id}/baris-pesanan` | Tambah barang (mengunci kurs) |
| ✅ | PATCH | `/baris-pesanan/{id}` | Ubah barang |
| ✅ | DELETE | `/baris-pesanan/{id}` | Hapus barang (salah input) |
| ✅ | POST | `/baris-pesanan/{id}/kosong` | Tandai Kosong |
| ✅ | DELETE | `/baris-pesanan/{id}/kosong` | Lepas tanda Kosong |
| ✅ | POST | `/open-po/{id}/keranjang/{customer_id}/pembayaran` | Catat pembayaran |
| ✅ | DELETE | `/pembayaran/{id}` | Hapus pembayaran |
| ✅ | POST | `/open-po/{id}/keranjang/{customer_id}/pengembalian-dana` | Catat pengembalian dana |
| ✅ | DELETE | `/pengembalian-dana/{id}` | Hapus pengembalian dana |
| ✅ | GET | `/open-po/{id}/keranjang/{customer_id}/rekap` | Teks rekap WA |

Semua path di bawah diawali `/api/v1`. `{id}` selalu bilangan bulat positif.

---

## 3. Health ✅

### `GET /health`

Publik, tanpa data aplikasi. Untuk monitoring uptime.

`200`
```json
{ "data": { "status": "ok", "database": "ok" } }
```
`503 LAYANAN_TIDAK_TERSEDIA` jika database tidak bisa dihubungi.

---

## 4. Auth ✅

### `POST /auth/login`

```json
{ "nama_pengguna": "pemilik", "kata_sandi": "••••••••••", "klien": "web" }
```

| Field | Aturan | Pesan |
|---|---|---|
| `nama_pengguna` | wajib, tidak peka huruf besar/kecil, spasi di tepi dibuang | "Isi nama pengguna." |
| `kata_sandi` | wajib | "Isi kata sandi." |
| `klien` | opsional, `web` (default) atau `mobile` | "klien harus web atau mobile." |

`200` (web, + header `Set-Cookie`)
```json
{
  "data": {
    "pengguna": { "id": 1, "nama_pengguna": "pemilik" },
    "sesi_tidak_aktif_maks_menit": 720
  }
}
```
`200` (mobile): sama, ditambah `"token": "<64 hex>"` dan `"jenis_token": "Bearer"`, tanpa cookie.

Error: `401 LOGIN_GAGAL` (pesan sama untuk pengguna tidak ada dan kata sandi salah), `422 VALIDASI`, `429 TERLALU_BANYAK_PERCOBAAN`. Saat terblokir, kata sandi yang benar pun ditolak sampai jendela 15 menit lewat. Login sukses menghapus hitungan gagal.

### `POST /auth/logout`

Tanpa body. `204`, sesi dihapus di server, cookie dikosongkan (`Max-Age=0`).

### `GET /auth/sesi`

`200`
```json
{ "data": { "pengguna": { "id": 1, "nama_pengguna": "pemilik" }, "sesi_tidak_aktif_maks_menit": 720 } }
```
Dipakai front-end saat aplikasi dibuka untuk tahu sudah login atau belum.

---

## 5. Pengaturan ✅

### `GET /pengaturan`

`200`
```json
{
  "data": {
    "default_markup_persen": "10",
    "buffer_aud_persen": "3",
    "dp_persen": "50",
    "diubah_pada": "2026-10-25T09:00:00Z"
  }
}
```
Nilai awal migrasi: markup 10%, buffer 3%, DP 50%.

### `PATCH /pengaturan`

Semua field opsional, hanya yang dikirim yang diubah. Respons sama dengan `GET`.

```json
{ "default_markup_persen": "12,5", "buffer_aud_persen": "3", "dp_persen": "50" }
```

| Field | Rentang | Pesan |
|---|---|---|
| `default_markup_persen` | 0–100, maks. 2 desimal | "Markup wajib diisi." / "Markup tidak boleh negatif." / "Markup maksimal 100%." |
| `buffer_aud_persen` | 0–100, maks. 2 desimal | "Buffer wajib diisi." / "Buffer tidak boleh negatif." / "Buffer maksimal 100%." |
| `dp_persen` | 0–100, maks. 2 desimal | "DP wajib diisi." / "DP harus antara 0 dan 100%." |
| semua | bukan angka / angka JSON | "Isi angka, mis. 10." |
| semua | > 2 desimal | "Maksimal 2 angka di belakang koma." |

Perubahan tidak memengaruhi PO, baris, atau keranjang yang sudah ada: buffer dan DP % disalin ke PO saat PO dibuat (ui-spec §13 P4), markup disalin ke baris saat baris disimpan.

---

## 6. Kurs ✅

### `GET /kurs/aud-idr`

Mengambil kurs pasar dari Frankfurter (`https://api.frankfurter.dev/v2/rate/aud/idr`, timeout 5 detik) dan menghitung kurs jastip dengan buffer di pengaturan saat ini. Tidak menyimpan apa pun.

`200`
```json
{
  "data": {
    "mata_uang": "AUD",
    "kurs_pasar": "12673",
    "tanggal_kurs": "2026-10-25",
    "buffer_persen": "3",
    "kurs_jastip": 13054,
    "sumber": "Frankfurter"
  }
}
```
`kurs_jastip = ceil(kurs_pasar × (1 + buffer%))` ke Rp1. Kurs pasar bertanda desimal dibaca dari teks respons apa adanya (maks. 6 desimal, lebih dari itu dibulatkan half-up).

`502 KURS_GAGAL` → front-end pindah ke mode Manual (ui-spec §6.3).

---

## 7. Open PO ✅

### Objek Open PO

```json
{
  "id": 1,
  "nama": "Open PO Australia Nov 2026",
  "mata_uang": "AUD",
  "status": "buka",
  "kurs": {
    "mode": "otomatis",
    "kurs_jastip": 13054,
    "kurs_pasar": "12673",
    "tanggal_kurs": "2026-10-25",
    "buffer_persen": "3",
    "sumber": "Frankfurter"
  },
  "kurs_terkunci": false,
  "kurs_terkunci_pada": null,
  "dp_persen": "50",
  "ringkasan": { "jumlah_customer": 0, "total_pesanan": 0, "dana_diterima": 0 },
  "dibuat_pada": "2026-10-25T09:00:00Z",
  "diubah_pada": "2026-10-25T09:00:00Z"
}
```

| Field | Arti |
|---|---|
| `status` | `buka` / `selesai` |
| `kurs.mode` | `otomatis` / `manual` (badge "Otomatis" / "Manual") |
| `kurs.kurs_pasar`, `kurs.tanggal_kurs`, `kurs.sumber` | `null` jika manual tanpa pembanding ("Kurs pasar tidak tersedia") |
| `kurs.buffer_persen` | `null` untuk manual ("Diisi manual, tanpa buffer") |
| `kurs_terkunci` | `true` sejak baris pesanan pertama tersimpan, permanen walau barisnya dihapus |
| `dp_persen` | snapshot DP % saat PO dibuat |
| `ringkasan.jumlah_customer` | customer dengan keranjang berisi (≥ 1 baris termasuk Kosong, atau ≥ 1 pembayaran/pengembalian dana) |
| `ringkasan.total_pesanan` | Σ total keranjang (tanpa baris Kosong) |
| `ringkasan.dana_diterima` | Σ pembayaran − Σ pengembalian dana di PO ini |

### `GET /open-po`

Query: `status` (opsional, `buka`/`selesai`), `halaman`, `per_halaman`. Urutan: `buka` dulu, lalu `selesai`; di dalamnya terbaru di atas.

`200`
```json
{
  "data": [ { "...objek Open PO..." } ],
  "meta": {
    "halaman": 1, "per_halaman": 20, "total": 3, "total_halaman": 1,
    "jumlah_per_status": { "buka": 1, "selesai": 2 }
  }
}
```
`jumlah_per_status` untuk judul bagian "Buka (1)" / "Selesai (2)", selalu dihitung dari semua PO.

### `POST /open-po`

Otomatis (nilai dari `GET /kurs/aud-idr`):
```json
{
  "nama": "Open PO Australia Nov 2026",
  "kurs": { "mode": "otomatis", "kurs_pasar": "12673", "tanggal_kurs": "2026-10-25" }
}
```
Manual:
```json
{
  "nama": "Open PO Australia Nov 2026",
  "kurs": { "mode": "manual", "kurs_jastip": 13054, "kurs_pasar": "12673", "tanggal_kurs": "2026-10-25" }
}
```

- Otomatis: server menghitung ulang `kurs_jastip` dari `kurs_pasar` dan buffer pengaturan saat ini, lalu menyimpan buffer tersebut. `kurs_jastip` dari klien diabaikan.
- Manual: `kurs_jastip` dipakai apa adanya, tanpa buffer. `kurs_pasar` + `tanggal_kurs` opsional (berdua) sebagai pembanding.
- Status selalu `buka`. DP % disalin dari pengaturan.

`201` + header `Location: /api/v1/open-po/{id}`, body objek Open PO.

| Field | Pesan |
|---|---|
| `nama` kosong / > 100 karakter | "Nama Open PO wajib diisi." / "Nama Open PO maksimal 100 karakter." |
| `kurs` tidak ada | "Kurs wajib diisi. Ambil kurs otomatis atau isi manual." |
| `kurs.mode` salah | "Pilih kurs Otomatis atau Manual." |
| `kurs.kurs_jastip` (manual) kosong | "Kurs wajib diisi. Ambil kurs otomatis atau isi manual." |
| `kurs.kurs_jastip` ≤ 0 | "Kurs harus lebih dari 0." |
| `kurs.kurs_jastip` bukan integer | "Isi angka saja, mis. 13054." |
| `kurs.kurs_jastip` > 1.000.000 | "Kurs maksimal Rp1.000.000." |
| `kurs.kurs_pasar` (otomatis) kosong | "Kurs wajib diisi. Ambil kurs otomatis atau isi manual." |
| `kurs.kurs_pasar` tidak valid (> Rp500.000, ≤ 0, > 6 desimal) | "Kurs pasar tidak valid. Ambil kurs terbaru." |
| `kurs.tanggal_kurs` bukan `YYYY-MM-DD` | "Tanggal kurs tidak valid." |

### `GET /open-po/{id}`

`200` objek Open PO. `404 TIDAK_DITEMUKAN` ("Open PO tidak ditemukan.").

### `PATCH /open-po/{id}`

Semua field opsional:
```json
{ "nama": "Australia Nov 2026", "status": "selesai", "kurs": { "mode": "manual", "kurs_jastip": 13100 } }
```

- `status`: `buka` / `selesai` ("Status harus buka atau selesai.").
- `kurs`: format sama dengan `POST`. **Jangan kirim `kurs` kalau `kurs_terkunci = true`**; server menolak `409 KURS_TERKUNCI` dan seluruh perubahan di request itu dibatalkan. Front-end lalu memuat ulang PO dan menampilkan pesan konflik (ui-spec §12.7).
- Mode otomatis memakai buffer pengaturan saat ini (alur "Ambil kurs terbaru" sebelum terkunci).
- DP % tidak bisa diubah.

`200` objek Open PO.

---

## 8. Customer ✅

### Objek customer

```json
{
  "id": 1,
  "nama": "Rina",
  "no_wa": "6281234567890",
  "no_wa_tampil": "081234567890",
  "alamat": "Jl. Melati 1, Bandung",
  "diarsipkan": false,
  "diarsipkan_pada": null,
  "punya_pesanan": false,
  "dibuat_pada": "2026-10-25T09:00:00Z",
  "diubah_pada": "2026-10-25T09:00:00Z"
}
```
`punya_pesanan = true` jika customer punya keranjang berisi di PO mana pun. Menentukan tombol "Arsipkan customer" (true) atau "Hapus customer" (false).

### `GET /customer`

| Query | Arti |
|---|---|
| `q` | Cari nama (sebagian, tidak peka huruf besar/kecil). Kalau berbentuk nomor (≥ 3 digit), juga dicocokkan ke no WA: awalan `08`/`62`/`+62` dianggap sama dan dicari sebagai awalan; digit lain dicari di mana saja. Maks. 100 karakter |
| `urut` | `nama` (default, A–Z) atau `terakhir_diubah` (untuk "10 customer yang terakhir diubah" di sheet Tambah customer: `?urut=terakhir_diubah&per_halaman=10`) |
| `open_po_id` | Opsional. Menambahkan `sudah_di_po` (boolean) di setiap item untuk label "Sudah di PO ini" |
| `halaman`, `per_halaman` | Pagination |

Customer yang diarsipkan tidak pernah muncul (ui-spec §13 P3). Item daftar tidak memuat `punya_pesanan`.

`200`
```json
{
  "data": [
    { "id": 1, "nama": "Rina", "no_wa": "6281234567890", "no_wa_tampil": "081234567890", "alamat": null,
      "diarsipkan": false, "diarsipkan_pada": null, "dibuat_pada": "…", "diubah_pada": "…", "sudah_di_po": true }
  ],
  "meta": { "halaman": 1, "per_halaman": 20, "total": 1, "total_halaman": 1 }
}
```

### `POST /customer`

```json
{ "nama": "Rina", "no_wa": "0812-3456-7890", "alamat": "Jl. Melati 1, Bandung" }
```

| Field | Aturan / pesan |
|---|---|
| `nama` | wajib, maks. 100 karakter: "Nama wajib diisi." / "Nama maksimal 100 karakter." |
| `no_wa` | wajib, aturan §1.7 |
| `alamat` | opsional, `null`/kosong = tidak ada, maks. 500 karakter: "Alamat maksimal 500 karakter." |

No WA ganda **tidak** diblokir. `201` + `Location`, body objek customer.

### `GET /customer/cek-no-wa?no_wa=…&kecuali_id=…`

Dipanggil saat field No WA kehilangan fokus. `kecuali_id` = ID customer yang sedang diubah. Hanya customer aktif (tidak diarsipkan) yang dihitung.

`200`
```json
{
  "data": {
    "no_wa": "6281234567890",
    "no_wa_tampil": "081234567890",
    "terdaftar": true,
    "customer": [ { "id": 1, "nama": "Rina", "no_wa_tampil": "081234567890" } ],
    "pesan": "No WA ini sudah terdaftar atas nama Rina."
  }
}
```
`pesan` = `null` kalau belum terdaftar. `customer[0]` dipakai untuk tombol "Pakai Rina" / tautan "Lihat Rina". No WA tidak valid → `422` dengan `field.no_wa`.

### `GET /customer/{id}`

Objek customer, termasuk yang diarsipkan (pesanan lamanya tetap tampil di PO). `404` jika tidak ada.

### `PATCH /customer/{id}`

Field opsional `nama`, `no_wa`, `alamat` (aturan sama dengan `POST`; `"alamat": null` mengosongkan). `200` objek customer.

### `DELETE /customer/{id}`

Hanya untuk customer tanpa pesanan. `204`. Keranjang kosong miliknya ikut dihapus. Customer dengan pesanan → `409 CUSTOMER_PUNYA_PESANAN`.

### `POST /customer/{id}/arsip`

Tanpa body. `200` objek customer (`diarsipkan: true`). Idempoten. Tidak ada endpoint pulihkan di MVP.

---

## 9. Customer per Open PO ✅

### `GET /open-po/{id}/customer`

Query: `status` (opsional: `belum_bayar`, `kurang_dp`, `dp`, `lunas`, `lebih_bayar`), `halaman`, `per_halaman`. Hanya keranjang berisi. Urut nama customer A–Z. Customer yang diarsipkan tetap tampil di PO lamanya.

`200`
```json
{
  "data": [
    {
      "customer": { "id": 1, "nama": "Rina", "no_wa": "6281234567890", "no_wa_tampil": "081234567890", "diarsipkan": false },
      "total": 2551000,
      "dana_diterima": 2935000,
      "sisa": 0,
      "kelebihan_bayar": 384000,
      "status": "lebih_bayar"
    }
  ],
  "meta": {
    "halaman": 1, "per_halaman": 20, "total": 1, "total_halaman": 1,
    "jumlah_per_status": { "semua": 12, "belum_bayar": 3, "kurang_dp": 1, "dp": 5, "lunas": 2, "lebih_bayar": 1 }
  }
}
```
`jumlah_per_status` selalu dihitung dari semua keranjang berisi di PO (tidak terpengaruh filter), untuk chip filter. `meta.total` = jumlah setelah filter.

Error: `404` ("Open PO tidak ditemukan."), `status` tidak dikenal → `422` dengan `field.status` ("Status harus salah satu dari belum_bayar, kurang_dp, dp, lunas, lebih_bayar.").

### `GET /open-po/{id}/barang-unik`

Untuk saran nama barang (diambil sekali saat sheet dibuka, difilter di perangkat). Dikelompokkan berdasarkan nama + harga AUD (ui-spec §13 P5), termasuk baris Kosong. Nama yang hanya beda huruf besar/kecil dianggap sama (`Barang A` = `barang a`). Urut nama A–Z lalu harga. Tanpa pagination (dibatasi 1.000 entri). `404` jika PO tidak ada.

`200`
```json
{ "data": [ { "nama_barang": "Barang A", "harga_aud": "24.95" }, { "nama_barang": "Barang C", "harga_aud": "129.99" } ] }
```

---

## 10. Keranjang ✅

Keranjang diidentifikasi dengan pasangan `{id}` Open PO + `{customer_id}`. Keranjang baru dibuat di server saat barang atau pembayaran pertama disimpan (ui-spec §13 P1). Sebelum itu `GET` tetap `200` dengan angka nol.

### Objek keranjang

Contoh: QA langkah 4 (Barang B Kosong, sudah bayar Rp2.935.000).

```json
{
  "open_po": { "id": 1, "nama": "Open PO Australia Nov 2026", "status": "buka", "kurs_jastip": 13054, "kurs_terkunci": true },
  "customer": { "id": 1, "nama": "Rina", "no_wa": "6281234567890", "no_wa_tampil": "081234567890", "diarsipkan": false },
  "ringkasan": {
    "total": 2551000,
    "dp": 1276000,
    "dp_persen": "50",
    "total_pembayaran": 2935000,
    "total_pengembalian": 0,
    "dana_diterima": 2935000,
    "sisa": 0,
    "kelebihan_bayar": 384000,
    "status": "lebih_bayar"
  },
  "barang": [
    {
      "id": 11, "nama_barang": "Barang A", "harga_aud": "24.95", "qty": 2, "markup_persen": "10",
      "kurs_jastip": 13054, "harga_jual_unit": 359000, "subtotal": 718000, "kosong": false,
      "dibuat_pada": "…", "diubah_pada": "…"
    },
    {
      "id": 12, "nama_barang": "Barang B", "harga_aud": "8.50", "qty": 3, "markup_persen": "15",
      "kurs_jastip": 13054, "harga_jual_unit": 128000, "subtotal": 384000, "kosong": true,
      "dibuat_pada": "…", "diubah_pada": "…"
    }
  ],
  "riwayat": [
    { "jenis": "pembayaran", "id": 5, "nominal": 1467000, "tanggal": "2026-10-30", "catatan": null, "bisa_dihapus": true, "dibuat_pada": "…" },
    { "jenis": "pembayaran", "id": 4, "nominal": 1468000, "tanggal": "2026-10-28", "catatan": null, "bisa_dihapus": true, "dibuat_pada": "…" }
  ]
}
```

| Field | Aturan |
|---|---|
| `ringkasan.total` | Σ `subtotal` baris dengan `kosong = false` |
| `ringkasan.dp` | `ceil_ke_Rp1000(total × dp_persen)`, `dp_persen` dari PO |
| `ringkasan.dana_diterima` | `total_pembayaran − total_pengembalian` (tidak pernah negatif) |
| `ringkasan.sisa` | `max(0, total − dana_diterima)` → "Sisa pelunasan" |
| `ringkasan.kelebihan_bayar` | `max(0, dana_diterima − total)` → "Kelebihan bayar" |
| `ringkasan.status` | §12.2 |
| `barang` | urut waktu dibuat (urutan ini juga nomor di rekap WA). Subtotal baris Kosong tetap dikirim untuk teks coret di layar, tapi tidak dihitung |
| `riwayat` | pembayaran + pengembalian dana, terbaru di atas: `tanggal`, lalu waktu dicatat (`dibuat_pada`), lalu ID (ID dua tabel tidak bisa dibandingkan, jadi waktu dicatat yang menentukan urutan di tanggal yang sama). Pengembalian dana: `jenis = "pengembalian_dana"`, `catatan` terisi jika ada; pembayaran: `catatan` selalu `null` |
| `riwayat[].bisa_dihapus` | pembayaran: `false` jika menghapusnya membuat dana diterima negatif → tampilkan dialog info "Hapus pengembalian dana dulu". Pengembalian dana: selalu `true` |

Isi cepat di sheet pembayaran: "Isi DP" = `ringkasan.dp` (tampil hanya jika `total_pembayaran = 0`), "Isi sisa" = `ringkasan.sisa` (jika > 0). Sheet pengembalian dana: "Isi" = `kelebihan_bayar`.

### Respons semua aksi keranjang

Setiap aksi yang mengubah keranjang (barang, Kosong, pembayaran, pengembalian dana, termasuk hapus) mengembalikan **objek keranjang lengkap** supaya ringkasan dirender ulang dari respons. Aksi yang membuat data mengembalikan `201` + `meta.dibuat`:

```json
{ "data": { "...objek keranjang..." }, "meta": { "dibuat": { "jenis": "baris_pesanan", "id": 13 } } }
```
Hapus mengembalikan `200` (bukan `204`) dengan objek keranjang.

### Urutan pengecekan dan 404

Semua aksi: validasi input (`422`) → keberadaan data (`404`) → aturan bisnis (`409`, lalu `422` batas pengembalian dana). Pesan `404 TIDAK_DITEMUKAN`: "Open PO tidak ditemukan.", "Customer tidak ditemukan.", "Barang tidak ditemukan." (`/baris-pesanan/{id}`), "Pembayaran tidak ditemukan.", "Pengembalian dana tidak ditemukan.". Endpoint `/baris-pesanan/{id}`, `/pembayaran/{id}`, dan `/pengembalian-dana/{id}` selalu bekerja pada keranjang pemilik ID tersebut, dan respons memuat `open_po` + `customer` keranjang itu.

### `GET /open-po/{id}/keranjang/{customer_id}`

`200` objek keranjang. `404` jika PO atau customer tidak ada.

### `POST /open-po/{id}/keranjang/{customer_id}/baris-pesanan`

```json
{ "nama_barang": "Barang A", "harga_aud": "24,95", "qty": 2, "markup_persen": "10" }
```

| Field | Aturan | Pesan |
|---|---|---|
| `nama_barang` | wajib, maks. 150 karakter | "Nama barang wajib diisi." / "Nama barang maksimal 150 karakter." |
| `harga_aud` | string, > 0, maks. 2 desimal, maks. 100.000,00 | "Harga wajib diisi." / "Harga harus lebih dari 0." / "Maksimal 2 angka di belakang koma." / "Isi angka saja, mis. 24,95." / "Harga maksimal AUD 100.000,00." |
| `qty` | integer 1–999 | "Qty minimal 1." (juga jika kosong) / "Qty harus bilangan bulat." (pecahan, string, tipe lain) / "Qty maksimal 999." |
| `markup_persen` | string 0–100, maks. 2 desimal | "Markup wajib diisi." / "Markup tidak boleh negatif." / "Markup maksimal 100%." / "Maksimal 2 angka di belakang koma." / "Isi angka, mis. 10." (bukan angka / angka JSON, sama dengan pengaturan) |

Server, dalam satu transaksi:
1. `SELECT … FOR UPDATE` baris Open PO.
2. Jika `kurs_terkunci_at` kosong, isi dengan waktu sekarang (kurs terkunci permanen).
3. Buat keranjang jika belum ada. Customer yang diarsipkan tanpa keranjang di PO ini → `409 CUSTOMER_DIARSIPKAN`.
4. Hitung `harga_jual_unit` dan `subtotal` (§12.1) dengan `kurs_jastip` PO, simpan snapshot (nama, harga AUD, kurs, markup, harga jual, qty).

Kalau salah satu langkah gagal (`404`, `409`), seluruh transaksi dibatalkan, termasuk penguncian kurs. `201` objek keranjang (`open_po.kurs_terkunci` sudah `true`). Kalau angka respons berbeda dari pratinjau front-end, front-end mencatatnya di console (ui-spec §12.3).

### `PATCH /baris-pesanan/{id}`

Field opsional `nama_barang`, `harga_aud`, `qty`, `markup_persen` (aturan sama; hanya field yang dikirim yang divalidasi dan diubah, body `{}` tidak mengubah apa pun). Harga dihitung ulang dengan `kurs_jastip` snapshot baris itu. Baris Kosong tetap bisa diubah. `200` objek keranjang.

### `DELETE /baris-pesanan/{id}`

Hapus permanen (hanya untuk salah input). Kurs PO tetap terkunci. `200` objek keranjang.

### `POST /baris-pesanan/{id}/kosong` · `DELETE /baris-pesanan/{id}/kosong`

Tanpa body. Tandai / lepas tanda Kosong, idempoten. `200` objek keranjang. Front-end membandingkan `ringkasan.status` lama dan baru untuk toast "Status: {status}".

### `POST /open-po/{id}/keranjang/{customer_id}/pembayaran`

```json
{ "nominal": 1468000, "tanggal": "2026-10-28" }
```

| Field | Aturan | Pesan |
|---|---|---|
| `nominal` | integer > 0, maks. 1.000.000.000.000 | "Nominal wajib diisi." / "Nominal harus lebih dari Rp0." / "Isi angka saja, mis. 1468000." / "Nominal terlalu besar." |
| `tanggal` | `YYYY-MM-DD` | "Tanggal wajib diisi." / "Tanggal tidak valid." |

Membuat keranjang jika belum ada (customer arsip → `409 CUSTOMER_DIARSIPKAN`). `201` objek keranjang.

### `DELETE /pembayaran/{id}`

Diizinkan hanya jika `Σ pembayaran − nominal ≥ Σ pengembalian dana`. Jika tidak → `409 HAPUS_PENGEMBALIAN_DULU`:

```json
{ "error": { "kode": "HAPUS_PENGEMBALIAN_DULU", "pesan": "Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana Rp384.000. Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini." } }
```
Hard delete (lihat §13). `200` objek keranjang.

### `POST /open-po/{id}/keranjang/{customer_id}/pengembalian-dana`

```json
{ "nominal": 384000, "tanggal": "2026-10-29", "catatan": "transfer BCA 29 Okt" }
```

- Hanya saat status `lebih_bayar`, selain itu `409 PENGEMBALIAN_TIDAK_AKTIF` (juga untuk customer yang belum punya keranjang di PO ini; keranjang tidak dibuat).
- `nominal`: aturan pembayaran, ditambah ≤ `kelebihan_bayar` → "Nominal maksimal Rp384.000 (kelebihan bayar)." (`422`, `field.nominal`). Batas ini dicek di server dengan angka terbaru, setelah format input lolos.
- `catatan`: opsional, maks. 255 karakter ("Catatan maksimal 255 karakter."; bukan teks → "Catatan harus berupa teks."). `null`, `""`, atau spasi disimpan sebagai `null`.

`201` objek keranjang.

### `DELETE /pengembalian-dana/{id}`

Selalu diizinkan. Status bisa kembali ke Lebih bayar. `200` objek keranjang.

### `GET /open-po/{id}/keranjang/{customer_id}/rekap`

`200`
```json
{ "data": { "teks": "*REKAP JASTIP - Open PO Australia Nov 2026*\nCustomer: Rina (081234567890)\n\n1. Barang A\n   2 x Rp359.000 = Rp718.000\n…" } }
```
Format persis ui-spec §9.6 (sumber kebenaran untuk kata-kata; contoh di scope-mvp.md adalah draf awal):

- Judul `*REKAP JASTIP - {nama PO}*`, baris `Customer: {nama} ({no_wa_tampil})`, baris kosong.
- Barang bernomor sesuai urutan `barang`. Baris qty diindentasi 3 spasi: `{qty} x {Rp unit} = {Rp subtotal}`. Barang Kosong: `{n}. {nama} (Kosong, tidak ditagih)` tanpa baris qty.
- Baris kosong, `*Total: {total}*`, `DP {dp_persen}%: {dp}` (persen memakai koma desimal, mis. `DP 37,5%`).
- `Sudah dibayar: {total_pembayaran}` jika ada pembayaran atau pengembalian dana. `Dikembalikan: {total_pengembalian}` jika ada pengembalian dana.
- Baris penentu (tebal): Belum bayar `*Mohon transfer DP: {dp}*`; Kurang DP / DP / Lunas `*Sisa pelunasan: {sisa}*`; Lebih bayar `*Kelebihan bayar (akan dikembalikan): {kelebihan_bayar}*`.
- `Status: {label rekap}` (§12.2).
- Tanpa harga AUD, kurs, atau markup. Baris baru `\n`, tanpa spasi di akhir baris, setiap pasangan `*` di satu baris.
- Spasi, tab, atau baris baru di dalam nama PO, customer, dan barang diringkas menjadi satu spasi supaya format di atas tetap berlaku. Keranjang tanpa barang langsung lanjut ke `*Total: Rp0*` (tidak ada blok barang).
- `404` jika PO atau customer tidak ada. Keranjang yang belum ada tetap menghasilkan rekap dengan angka nol.

---

## 11. Data yang sengaja tidak ada di MVP

Hapus Open PO, pulihkan customer arsip, ubah pembayaran/pengembalian dana, daftar belanja dan teks penutup rekap (Should, menyusul setelah Must), PO Selesai read-only (Should; kode error `PO_SELESAI` 409 dicadangkan).

---

## 12. Algoritma bersama (front-end wajib identik)

### 12.1 Harga jual per baris (ui-spec §12.3)

Hanya bilangan bulat. Gunakan `BigInt` di JavaScript (nilai antara bisa sampai 2×10¹⁷ untuk input maksimum).

```
harga_sen  = harga AUD × 100            (parse string, mis. "24,95" → 2495; tanpa parseFloat)
kurs       = kurs_jastip PO              (rupiah bulat)
markup_bp  = markup % × 100              (parse string, mis. "10" → 1000, "7,5" → 750)

N               = harga_sen × kurs × (10000 + markup_bp)    // satuan 1/10.000 sen rupiah
sen             = floor((2N + 10000) / 20000)               // bulat 2 desimal, half-up
harga_jual_unit = ceil(sen / 100000) × 1000                 // ke atas ke Rp1.000; kelipatan tepat tidak naik
subtotal        = harga_jual_unit × qty
```

"Rincian hitungan": `harga × kurs` = `harga_sen × kurs` sen (mis. 32.569.730 sen = Rp325.697,30); `+ markup` = `sen` (Rp358.267,03).

Vektor uji (semua ada di unit test server `tests/Unit/Domain/PricingTest.php`):

| Kasus | harga_sen | kurs | markup_bp | N | sen | harga_jual_unit | qty | subtotal |
|---|---|---|---|---|---|---|---|---|
| QA Barang A | 2495 | 13054 | 1000 | 358.267.030.000 | 35.826.703 | 359.000 | 2 | 718.000 |
| QA Barang B | 850 | 13054 | 1500 | 127.602.850.000 | 12.760.285 | 128.000 | 3 | 384.000 |
| QA Barang C | 12999 | 13054 | 800 | 1.832.640.616.800 | 183.264.062 | 1.833.000 | 1 | 1.833.000 |
| Tepat kelipatan Rp1.000 | 3590 | 10000 | 0 | 359.000.000.000 | 35.900.000 | 359.000 | 1 | 359.000 |
| Bulat 2 desimal dulu (41.000,0032) | 302 | 13054 | 400 | 41.000.003.200 | 4.100.000 | 41.000 | 1 | 41.000 |
| Bulat 2 desimal dulu (821.000,0004) | 5666 | 13054 | 1100 | 821.000.000.400 | 82.100.000 | 821.000 | 1 | 821.000 |
| Half-up (6.559,635) | 50 | 13054 | 50 | 6.559.635.000 | 655.964 | 7.000 | 1 | 7.000 |

Baris "Bulat 2 desimal dulu" menunjukkan kenapa pembulatan 2 desimal wajib dilakukan sebelum pembulatan ke ribuan: tanpa itu, 41.000,0032 naik menjadi Rp42.000.

### 12.2 Status pembayaran (dihitung server, tidak di front-end)

```
dp            = ceil(total × dp_bp / 10.000.000) × 1000
dana_diterima = Σ pembayaran − Σ pengembalian dana
```

Dievaluasi berurutan:

| # | Kondisi | `status` | Badge | Rekap WA |
|---|---|---|---|---|
| 1 | dana_diterima > total | `lebih_bayar` | Lebih bayar | `Status: LEBIH BAYAR` |
| 2 | dana_diterima = total (termasuk 0 = 0) | `lunas` | Lunas | `Status: LUNAS ✅` |
| 3 | dana_diterima = 0 | `belum_bayar` | Belum bayar | `Status: BELUM BAYAR` |
| 4 | dana_diterima < dp | `kurang_dp` | Kurang DP | `Status: KURANG DP` |
| 5 | lainnya (dp ≤ dana < total) | `dp` | DP | `Status: DP DITERIMA ✅` |

Vektor uji (keranjang A + B + C, DP 50%, `tests/Unit/Domain/CartCalculatorTest.php`):

| Langkah | total | dp | Σ bayar | Σ kembali | dana | sisa | kelebihan | status |
|---|---|---|---|---|---|---|---|---|
| Awal | 2.935.000 | 1.468.000 | 0 | 0 | 0 | 2.935.000 | 0 | belum_bayar |
| Bayar 500.000 | 2.935.000 | 1.468.000 | 500.000 | 0 | 500.000 | 2.435.000 | 0 | kurang_dp |
| QA 2 | 2.935.000 | 1.468.000 | 1.468.000 | 0 | 1.468.000 | 1.467.000 | 0 | dp |
| QA 3 | 2.935.000 | 1.468.000 | 2.935.000 | 0 | 2.935.000 | 0 | 0 | lunas |
| QA 4 (B Kosong) | 2.551.000 | 1.276.000 | 2.935.000 | 0 | 2.935.000 | 0 | 384.000 | lebih_bayar |
| QA 5 (kembali 384.000) | 2.551.000 | 1.276.000 | 2.935.000 | 384.000 | 2.551.000 | 0 | 0 | lunas |

### 12.3 Kurs jastip

`kurs_jastip = ceil(kurs_pasar × (10000 + buffer_bp) / 10000)`. 12.673 × 1,03 = 13.053,19 → **13.054**. 10.000 × 1,03 = 10.300 tepat → 10.300. 12.673,45 × 1,035 = 13.117,02 → 13.118.

---

## 13. Keputusan back-end yang memengaruhi front-end

| Topik | Keputusan |
|---|---|
| Hapus pembayaran / pengembalian dana | **Hard delete**. Alasan: tidak ada fitur pemulihan di scope, dan menyaring baris terhapus di setiap penjumlahan uang berisiko salah hitung. Jejak penghapusan dicatat di log aplikasi (ID, nominal, ID keranjang, tanpa data pribadi) dan tercakup backup harian |
| Keranjang berisi | Keranjang dianggap ada (customer tampil di PO, `punya_pesanan`, `sudah_di_po`) jika punya ≥ 1 baris (termasuk Kosong) atau ≥ 1 pembayaran/pengembalian dana. Keranjang yang dikosongkan lagi hilang dari daftar PO |
| Request bersamaan | Semua aksi pada satu keranjang diproses berurutan (kunci baris keranjang di database). Aturan uang (batas pengembalian dana, hapus pembayaran) dicek dengan angka terbaru di dalam transaksi, jadi request kedua bisa mendapat `409`/`422` walaupun layar yang lama menunjukkan boleh. Front-end cukup menampilkan pesan error lalu memuat ulang `GET` keranjang |
| Kurs otomatis saat simpan | Klien mengirim ulang `kurs_pasar` + `tanggal_kurs` dari pratinjau; server menghitung ulang `kurs_jastip`. Server tidak memanggil Frankfurter lagi saat simpan, supaya angka yang dilihat admin sama dengan yang tersimpan |
| No WA | Kanonik `62…`, tampil `08…` (§1.7). Duplikat hanya peringatan |
