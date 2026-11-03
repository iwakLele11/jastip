# Front-end Jastip

Front-end aplikasi jastip (MVP, tahap 1 + 2): HTML semantik + Tailwind CSS v4 + JavaScript vanilla
(ES module, tanpa framework dan tanpa bundler). Mengambil data dari API `/api/v1` di origin yang sama.

- Desain: [`docs/design/ui-spec.md`](../docs/design/ui-spec.md)
- Kontrak API: [`docs/api/api-contract.md`](../docs/api/api-contract.md)
- Scope: [`docs/product/scope-mvp.md`](../docs/product/scope-mvp.md)
- Screenshot hasil E2E: [`docs/design/screenshots/`](../docs/design/screenshots/) (`m-*` = 360×740, `d-*` = 1280×800)

## Struktur

```
frontend/
├── package.json             build, test, test:e2e, icons
├── scripts/
│   ├── build.mjs            src → dist (partial HTML, ikon inline, token kelas, versi cache, modulepreload, Tailwind,
│   │                        cek awal.js skrip pertama + segarkan.html statis)
│   └── salin-ikon.mjs       salin path Heroicons yang dipakai ke src/js/lib/ikon-data.js
├── src/
│   ├── pages/               satu file .html per layar (MPA)
│   ├── partials/            head, topnav, bottomnav, toast, tautan "Langsung ke konten"
│   ├── styles/app.css       Tailwind v4 + token warna @theme (ui-spec §2 / §12.1)
│   ├── assets/              favicon.svg, segarkan.html (halaman pemulihan tantangan hosting, tanpa JS)
│   └── js/
│       ├── awal.js          skrip klasik pertama tiap halaman: http → https, buang ?i=N hosting
│       ├── lib/             api.js (klien API + pemulihan tantangan hosting), format.js, parse.js,
│       │                    harga.js (pratinjau harga BigInt), validasi.js (form barang / nominal,
│       │                    pesan = server), rute.js (rute + validasi `next` + buang ?i=N),
│       │                    dom.js (pembuat elemen aman), ikon.js
│       ├── ui/              kelas.js (kelas komponen), komponen.js (StatusBadge, Banner, EmptyState,
│       │                    Skeleton, tombol loading, MoneyRow), field.js (error/peringatan field),
│       │                    dialog.js (ConfirmDialog, Sheet, ActionSheet), toast.js, kurs.js (KursCard),
│       │                    halaman.js, no-wa.js (field No WA + cek duplikat),
│       │                    form-barang.js (OrderLineForm + PricePreview + combobox saran),
│       │                    form-uang.js (sheet pembayaran / pengembalian dana),
│       │                    sheet-customer.js (sheet Tambah customer ke Open PO)
│       └── pages/           satu modul per layar
├── tests/
│   ├── unit/                node --test: harga, format/parse, rute, validasi, awal (https + ?i=N),
│   │                        api-tantangan (deteksi + pemulihan tantangan hosting)
│   └── e2e/                 Playwright 1.64.1 (mobile 360×740 + desktop 1280×800):
│                            bantu.mjs (fixture + helper), komponen, tahap1, tahap2,
│                            tantangan-hosting (InfinityFree + https)
└── dist/                    hasil build (artefak deploy, tidak di-commit)
```

| Layar | File | Catatan |
|---|---|---|
| Login | `login.html` | `?next=<path internal>`, `?alasan=sesi-berakhir` |
| Daftar Open PO | `index.html` | beranda |
| Form Open PO | `po-form.html` (buat), `po-form.html?id=3` (ubah) | kurs otomatis / manual / gagal / terkunci / konflik 409 |
| Detail Open PO | `po.html?id=3` (`&status=lunas` = filter chip) | "+ Customer" membuka sheet Tambah customer |
| Daftar customer | `customer.html` (`#q=rina` = teks pencarian) | |
| Form customer | `customer-form.html`, `customer-form.html?id=5` | |
| Pengaturan | `pengaturan.html` | termasuk Keluar (mobile) |
| Keranjang | `keranjang.html?po=3&customer=5` | sheet barang, pembayaran, pengembalian dana, salin rekap |

## Keputusan arsitektur

**MPA (satu file `.html` per layar), bukan hash routing.** Alasannya:

- Hosting statis tanpa aturan rewrite: setiap URL adalah file yang memang ada, ID lewat query string
  (`po.html?id=3`). Refresh dan tombol kembali/maju browser bekerja tanpa kode router.
- Browser yang mengurus riwayat, posisi scroll, dan reset fokus antar-layar. Setiap layar punya
  `<title>`, landmark, dan `<h1>` sendiri di HTML statis.
- Setiap layar hanya memuat modulnya sendiri (+ modul bersama yang di-cache). Graf impor tiap halaman
  di-preload (`<link rel="modulepreload">`) supaya tidak ada waterfall di sinyal lemah.
- Halaman yang dipulihkan dari bfcache dimuat ulang (`pageshow.persisted`), jadi data tidak basi
  dan layar tidak tampil lagi lewat tombol kembali setelah Keluar.

Konsekuensi: pindah layar = muat halaman baru. Toast sukses lintas halaman dibawa lewat kode di URL
(`?pesan=po-dibuat`), lalu parameter itu langsung dibuang dengan `history.replaceState`. Tidak ada
data customer di URL query, localStorage, atau sessionStorage; teks pencarian disimpan di hash
(`#q=`), yang tidak dikirim ke server.

Lainnya:

- **Sesi** memakai cookie HttpOnly dari server; `fetch` selalu `credentials: 'same-origin'`. Respons
  `401 BELUM_MASUK` / `SESI_BERAKHIR` → `login.html?next=<rute>`. `next` hanya diterima jika path
  internal ke halaman aplikasi (`src/js/lib/rute.js`, dites di `tests/unit/rute.test.mjs`).
- **Keamanan DOM**: data API tidak pernah lewat `innerHTML`/template string HTML. Semua elemen
  dibuat dengan `h()` (`src/js/lib/dom.js`), teks masuk sebagai text node. CSP di `<meta>`:
  `default-src 'self'`, `frame-src 'self'` (iframe pemulihan, lihat [Hosting InfinityFree](#hosting-infinityfree)),
  tanpa inline script/style.
- **Angka**: desimal di-parse dari string ke bilangan bulat (`parse.js`), tanpa `parseFloat`.
  Total, DP, status, ringkasan, jumlah chip, dan teks rekap selalu dari API. Setiap aksi keranjang
  mengembalikan objek keranjang lengkap dan layar dirender ulang dari objek itu. Pratinjau harga
  (`harga.js`) memakai `BigInt` dan rumus ui-spec §12.3; kalau angka respons server berbeda dari
  pratinjau, dicatat dengan `console.warn` (bukan `console.error`).
- **Tanpa request eksternal saat runtime**: font sistem, ikon Heroicons (MIT) disalin sebagai SVG.
- **Tailwind v4** lewat `@tailwindcss/cli`, diminify, hanya kelas yang dipakai. Palet bawaan
  Tailwind dimatikan (`--color-*: initial`), jadi hanya token ui-spec yang tersedia.

## Prasyarat

Node ≥ 22. Di sandbox ini home directory read-only, jadi selalu pakai cache npm di `.tools`:

```bash
cd frontend
npm ci --cache /projects/sandbox/.tools/npm-cache
```

## Build

```bash
npm run build        # → dist/
```

`scripts/build.mjs` menyusun HTML dari `src/pages` + `src/partials`, menyalin `src/js` apa adanya
(impor relatif diberi `?v=<hash build>`), menambahkan `modulepreload`, lalu menjalankan Tailwind CLI
(`--minify`). Build gagal jika ada token kelas atau partial yang tidak dikenal.

## Test

```bash
npm test             # unit test (node --test): harga, format/parse, rute, validasi, awal, api-tantangan
npm run test:e2e     # build + E2E Playwright lewat ../.tools/dev-stack.sh
```

E2E memakai `@playwright/test` **1.64.1** (versi persis, supaya memakai browser yang sudah ada di
`.tools/pw-browsers`; jangan menjalankan `playwright install`). `dev-stack.sh` menyalakan MariaDB,
membuat ulang database `jastip_e2e`, lalu melayani `dist/` + `/api/*` di `http://127.0.0.1:8090`
dengan kurs stub (12.673 → kurs jastip 13.054). Setiap test juga gagal jika ada `console.error`,
error JavaScript, aset statis yang gagal dimuat, atau respons API 400/403/415/5xx. Pesan Chrome
"Failed to load resource" untuk respons API yang memang diuji (401, 404, 409, 422, 502) diabaikan.

Screenshot ditulis ke `docs/design/screenshots/` setiap kali E2E berjalan.

`tantangan-hosting.spec.mjs` memakai simulasi tantangan InfinityFree di dev-router
(`/__dev/tantangan-mode`) dan selalu mematikannya di `finally`. Nama file sengaja diurutkan setelah
`tahap2`, supaya data test-nya tidak muncul di screenshot daftar mobile. Test "tantangan tidak bisa
diselesaikan" sengaja menunggu batas waktu pemulihan (±15 detik per project). `dev-stack.sh` memakai MariaDB bersama di port 3307: kalau
proses lain menghentikannya di tengah run (mis. `.tools/paket-smoke.sh` dengan DB 11.4), test berikutnya
gagal dengan 500 / `PDOException 2002` di `.tools/dev-app.log`. Itu bukan bug aplikasi; jalankan ulang.

Test Salin rekap WA memberi izin `clipboard-read`/`clipboard-write` ke context lalu membandingkan
isi clipboard dengan teks rekap yang diharapkan (persis ui-spec §9.6). Fallback "Salin manual"
dites dengan `tolakClipboard()` di `bantu.mjs`: init script yang membuat `navigator.clipboard.write`
dan `writeText` gagal dengan `NotAllowedError`, karena Playwright tidak punya cara untuk menolak izin.

## Menjalankan lokal (sandbox)

Proses latar belakang di sandbox mati saat perintah shell selesai, jadi stack hanya hidup selama
satu perintah. Untuk mencoba manual dengan browser/alat lain selama 30 menit:

```bash
npm run build
../.tools/dev-stack.sh node -e "setTimeout(() => {}, 30 * 60 * 1000)"
# buka http://127.0.0.1:8090, login dengan ADMIN_USER / ADMIN_PASSWORD dari dev-stack.sh
```

Mode kurs gagal: `GET http://127.0.0.1:8090/__dev/kurs-mode?set=gagal` (kembalikan dengan `?set=ok`).

Simulasi tantangan InfinityFree: `GET http://127.0.0.1:8090/__dev/tantangan-mode?set=on` (aktif + kunci
diputar), `?set=putar` (putar kunci saja, seperti setelah tab lama tidak aktif), `?set=rusak` (tantangan
tidak pernah selesai), `?set=off`.

## Hosting InfinityFree

Paket gratis InfinityFree memakai "browser security system": setiap request (halaman, aset, `/api/*`)
tanpa cookie `__test` yang valid dijawab **HTML 200 `text/html`** berisi JavaScript yang memasang cookie
lalu redirect ke URL yang sama + `?i=N`. Kunci cookie diputar berkala, jadi setelah tab lama tidak
aktif, `fetch()` ke API bisa menerima HTML itu, dan fetch tidak menjalankan JS-nya. Tantangan dicegat
sebelum PHP, jadi request yang kena tantangan **tidak diproses** server.

**Halaman** (navigasi biasa) diselesaikan browser sendiri. `src/js/awal.js` lalu membuang `i=N` dari URL
dengan `history.replaceState` sebelum modul halaman membaca `location.search`, jadi `id`/`po`/`customer`/
`status`, `next` login, `?pesan=`, chip filter, dan tautan yang dibangun dari URL tidak pernah membawa
`i`. `nextAman()` (`rute.js`) juga membuang `i` dari `next`.

**Request API** (`src/js/lib/api.js`):

1. Deteksi: respons `/api` 2xx (selain 204) yang `Content-Type`-nya bukan JSON, `type ===
   'opaqueredirect'` (fetch memakai `redirect: 'manual'`), atau `redirected`. Respons non-2xx yang bukan
   JSON (mis. 500/503 HTML dari hosting) tetap error server biasa dan **tidak** diulang, karena request
   itu mungkin sudah diproses.
2. Pemulihan: iframe tersembunyi (`hidden`, `aria-hidden`, `tabindex=-1`) memuat
   `segarkan.html?t=<waktu>` (query unik supaya tidak dari cache). Browser menjalankan tantangan di iframe
   itu; pemulihan selesai saat dokumen iframe berisi penanda `<html data-segar="ok">`, bukan pada `load`
   pertama (halaman tantangan muat dulu lalu redirect). Batas waktu 15 detik, lalu iframe dihapus.
3. Request yang kena tantangan bersamaan memakai **satu** pemulihan. Request yang dikirim sebelum
   pemulihan lain selesai langsung diulang tanpa pemulihan baru.
4. Request asli diulang **satu kali** (method, body sama), juga setelah batas waktu habis (cookie bisa
   saja sudah terpasang, dan request yang ditantang tidak pernah diproses). Kalau masih ditantang:
   `ApiError` kode `PERLU_MUAT_ULANG`, pesan "Koneksi ke server perlu diperbarui. Muat ulang halaman,
   lalu coba lagi." Banner / EmptyState muat data memakai aksi **Muat ulang** (`aksiCobaLagi()` di
   `ui/komponen.js`) menggantikan "Coba lagi". Banner form hanya menampilkan pesan; isi form tetap dan
   Simpan bisa dicoba lagi.
5. Salin rekap WA: `ClipboardItem` tetap diberi promise teks; promise itu menunggu pemulihan (Chrome
   menunggu promise selesai). Kalau gagal, banner dengan aksi Muat ulang.

**HTTPS**: cookie sesi produksi ber-flag `Secure`, jadi login lewat http tampak gagal tanpa penjelasan.
`awal.js` (skrip klasik, sinkron, pertama di `<head>`, karena CSP melarang inline script) mengalihkan
`http:` ke `https:` dengan `location.replace` untuk host publik. Tetap http: `localhost`, `127.x.x.x`,
`[::1]`, `10.x`, `172.16–31.x`, `192.168.x` (mis. XAMPP dibuka dari HP lewat IP LAN), dan `*.local`.
Selama pengalihan, `<html data-pindah-https>` membuat `api()` tidak mengirim apa pun lewat http.
Domain InfinityFree harus punya sertifikat SSL aktif.

Yang dibutuhkan dari paket deploy (back-end): `segarkan.html` ikut tersalin ke root `htdocs` di samping
halaman lain (iframe memakai path relatif), dan header-nya tidak menolak frame same-origin
(`X-Frame-Options: SAMEORIGIN` aman; jangan `DENY` / `frame-ancestors 'none'`).

Belum bisa dipastikan tanpa InfinityFree asli: apakah halaman tantangan asli boleh tampil di iframe
(tidak mengirim `X-Frame-Options: DENY`), apakah redirect-nya tetap `https://` (redirect ke `http://`
diblokir sebagai mixed content di iframe; request tetap diulang sekali setelah 15 detik), seberapa
sering kunci diputar, dan perilaku `ClipboardItem` dengan promise yang lama di Safari iOS. Hash URL
(`#q=` di daftar customer) hilang kalau halaman itu sendiri kena tantangan top-level.

## Deploy

`dist/` adalah artefak deploy. Front-end dan API satu origin: isi `dist/` disalin ke document root
back-end (`backend/public/`), berdampingan dengan `index.php` dan `.htaccess` milik back-end.

```bash
npm ci --cache /projects/sandbox/.tools/npm-cache   # di mesin build biasa: npm ci
npm test && npm run build
rsync -a dist/ /var/www/jastip/backend/public/      # JANGAN pakai --delete (index.php, .htaccess)
```

Untuk InfinityFree, paket deploy back-end menaruh isi `dist/` di root `htdocs` (lihat
[Hosting InfinityFree](#hosting-infinityfree)).

Catatan server:

- Wajib HTTPS (cookie sesi `Secure`, data pribadi customer).
- `/` harus melayani `index.html`, bukan `index.php`. Di Apache pastikan `DirectoryIndex index.html`
  (lihat catatan untuk back-end di laporan tahap 1). Nginx dengan konfigurasi di
  `backend/README.md` sudah benar (`index` default = `index.html`).
- Cache: `css/` dan `js/` aman di-cache lama (`Cache-Control: public, max-age=31536000, immutable`)
  karena URL-nya membawa `?v=<hash build>`. File `.html` sebaiknya `Cache-Control: no-cache`
  supaya versi baru langsung terpakai.
- Tidak ada secret atau API key di front-end; konfigurasi hanya di server.

## Status

**Tahap 1** (selesai): Login, Daftar Open PO, Form buat/ubah Open PO (otomatis, manual, gagal,
terkunci, konflik 409), Detail Open PO (KursCard, ringkasan, chip filter, tabel desktop, empty
state), Daftar customer, Form customer (cek duplikat no WA, arsipkan/hapus), Pengaturan + Keluar.

**Tahap 2** (selesai):

- Sheet **Tambah customer ke Open PO** (§7.5): 10 customer terakhir diubah, cari (debounce 300 ms,
  "Muat lebih banyak"), label "Sudah di PO ini", customer baru di sheet yang sama dengan peringatan
  no WA ganda + "Pakai {nama}", lalu ke Keranjang.
- **Keranjang** (§7.6): ringkasan + StatusBadge (sisa, kelebihan bayar, rincian dikembalikan),
  daftar barang + variant Kosong, ActionSheet (Ubah, Tandai/Lepas Kosong, Hapus + ConfirmDialog),
  riwayat pembayaran, StickyActionBar (mobile) dan dua kolom di `lg` dengan kartu form barang yang
  selalu terbuka + tombol aksi langsung di baris. State kosong, memuat, error jaringan, tidak
  ditemukan, customer diarsipkan (409).
- **Form barang + PricePreview**: combobox saran dari `barang-unik` (diambil sekali per halaman,
  difilter di perangkat, maks. 6), banner kurs akan terkunci, markup default dari Pengaturan,
  stepper qty, pratinjau langsung + live region 500 ms, Rincian hitungan, Simpan & tambah lagi,
  konfirmasi "Tutup tanpa menyimpan?".
- **Pembayaran / pengembalian dana**: chip isi cepat, tombol "Simpan Rp…", hapus dari Riwayat
  dengan ConfirmDialog / dialog info "Hapus pengembalian dana dulu", cegah kirim ganda.
- **Salin rekap WA**: teks dari API ke clipboard, "Tersalin" 2 detik + toast, fallback Sheet
  "Salin manual". Kalau tersedia, `ClipboardItem` diberi promise teks supaya tetap dianggap bagian
  dari ketukan di Safari iOS (yang menolak `writeText` setelah `await fetch`).

Keputusan kecil tahap 2 yang perlu dikonfirmasi ui-ux-designer ada di laporan tahap 2 (toast di
dalam sheet, banner customer diarsipkan, field Catatan satu baris, dll.).

Belum dikerjakan (Should): Daftar belanja, teks penutup rekap WA, Open PO Selesai read-only.
