# QA aplikasi jastip

Skrip uji QA yang bisa diulang di sandbox. Laporan bagian A: [`docs/qa/bagian-a.md`](../docs/qa/bagian-a.md).

Semua skrip hanya memakai database dan server lokal sandbox (`.tools/`). Tidak ada yang menyentuh production. Kata sandi admin tidak tertulis di repo: skrip membaca `ADMIN_PASSWORD` dari `.tools/dev-stack.sh`, atau membuat kata sandi acak per run (paket, akun uji tambahan).

## Prasyarat

```bash
cd /projects/sandbox/frontend && npm run build        # frontend/dist (dipakai dev-stack)
cd /projects/sandbox && deploy/build-htdocs.sh        # build/jastip-htdocs.zip (dipakai uji paket)
qa/mysql8/setup-mysql8.sh                             # sekali: MySQL 8.4 di .tools/mysql8 (sudah terpasang)
```

`qa/run.sh` memberi peringatan kalau `frontend/src` lebih baru dari `frontend/dist`, atau sumber back-end/deploy lebih baru dari zip.

## Menjalankan

```bash
qa/run.sh bagian-a        # semua uji bagian A (±5 menit), lalu tabel ringkasan
qa/run.sh keamanan        # satu suite di dev-stack: keamanan | hitung | rekap | konkurensi | redirect
qa/run.sh paket           # paket htdocs di Apache + PHP-FPM, MariaDB 10.11 lalu 11.4
qa/run.sh paket 10.11     # satu varian DB saja (10.11 | 11.4 | 11.4-sendiri)
qa/run.sh mysql8          # backend/bin/test.sh terhadap MySQL 8.4 + SQL paket di MySQL 8.4
qa/run.sh ringkasan       # tabel dari qa/hasil/*.json
.tools/dev-stack.sh node qa/tools/bukti.mjs   # tulis ulang bukti bug ke docs/qa/bukti/*.txt
```

Exit status 1 kalau ada uji yang gagal (termasuk bug yang sudah dilaporkan). Semua suite tetap dijalankan.

Semua langkah memakai MariaDB bersama di port 3307 (dev-stack dan paket 11.4) secara berurutan. **Jangan menjalankan dua `qa/run.sh` atau `dev-stack.sh` sekaligus.** Proses latar belakang sandbox mati saat perintah selesai, jadi setiap skrip menyalakan dan mematikan DB/server sendiri.

Env opsional: `QA_SEED` (seed kasus acak perhitungan, default `20261126`), `QA_PUTARAN` (putaran per skenario konkurensi, default 10), `QA_PAKET_NODE=0` (uji paket tanpa suite Node).

## Isi folder

| Path | Isi |
|---|---|
| `run.sh` | Pintu masuk semua uji |
| `lib/klien.mjs` | Klien HTTP (cookie sesi), `sql()` ke DB lokal, `resetPercobaanLogin()`/`resetIp()` untuk isolasi batas login, `buatAdmin()` |
| `lib/uji.mjs` | `cek(id, judul, fn)` + tulis `hasil/<nama>.json` |
| `lib/hasil.sh` | Versi shell dari `uji.mjs` (format JSON sama) |
| `api/keamanan.mjs` | Autentikasi semua endpoint, cookie, sesi 12 jam, logout, batas login per nama/IP (termasuk Unicode dan paralel), CSRF, SQL injection, XSS tersimpan, input berlebihan, body/JSON aneh, kirim ganda, kebocoran error, isi log, mode production (`SEC-*`) |
| `api/hitung.mjs` | Harga jual (443 kasus acak + batas), pratinjau `harga.js` == server == oracle, kurs jastip, DP, 5 status dan transisinya, jalan acak, pengembalian dana, kurs terkunci, snapshot pengaturan, arsip customer, ringkasan PO, skenario scope (`CALC-*`) |
| `hitung/oracle.py` | Oracle independen dengan `decimal.Decimal` |
| `api/rekap.mjs` | Rekap WA dibanding blok contoh di `docs/design/ui-spec.md` §9.6, variasi DP/angka/nama (`RKP-*`) |
| `api/konkurensi.mjs` | Request paralel: pembayaran/barang pertama, refund ganda, hapus vs refund, kurs vs barang pertama, hapus/arsip customer (`KON-*`) |
| `frontend/next-redirect.mjs` | Open redirect `next` login: `nextAman()` di Node + bukti navigasi di Chromium (`RED-*`) |
| `paket/uji-paket.sh` | Paket htdocs di Apache 2.4 + PHP-FPM: install.sql, SQL upgrade, `create-admin.php --sql [--reset]`, header, 403, listing, `index.php`, Paksa HTTPS, konfigurasi production, lalu suite Node terhadap paket (`PKT-*`) |
| `mysql8/test-backend-mysql8.sh` | `backend/bin/test.sh` dengan override env ke MySQL 8.4 (port 3308) |
| `mysql8/junit-ke-json.py` | Log JUnit PHPUnit → `hasil/mysql8-backend.json` (per test) |
| `mysql8/sql-mysql8.sh` | install.sql, SQL upgrade, dan SQL create-admin di MySQL 8.4 (`M8-*`) |
| `mysql8/setup-mysql8.sh` | Pasang MySQL 8.4 + libaio/libnuma di `.tools/` |
| `tools/ringkasan.py` | Tabel ringkasan + `hasil/ringkasan-bagian-a.json` |
| `tools/bukti.mjs` | Bukti reproduksi bug → `docs/qa/bukti/` |
| `tools/launch-check.cjs`, `tools/setup-webkit.py` | Persiapan browser Playwright (untuk bagian B) |
| `hasil/` | Hasil JSON terakhir per suite. Akhiran `-paket-10.11` / `-paket-11.4` = suite yang sama terhadap paket Apache |
| `tmp/` | File kerja (log run, JUnit, SQL upgrade contoh). Boleh dihapus |

## Format hasil

```json
{ "waktu": "…Z", "target": "http://127.0.0.1:8090", "total": 49, "lulus": 46, "gagal": 3,
  "hasil": [ { "id": "SEC-A1", "judul": "…", "lulus": true, "catatan": null, "ms": 205 } ] }
```

## Catatan lingkungan uji

- **Isolasi batas login.** Batas 20 login gagal / IP / 15 menit berlaku untuk semua uji dari 127.0.0.1. `keamanan.mjs` mengosongkan `percobaan_login` lewat DB sebelum setiap uji yang butuh login baru. Ini pembersihan data uji, bukan perilaku aplikasi.
- **Header HTML** (X-Frame-Options, Cache-Control, dst.) diuji di paket Apache (`PKT-H*`), bukan di `php -S` dev-stack yang memang tidak mengirimnya.
- **PHP-FPM di sandbox** jalan sebagai `nobody` dan `/tmp` sandbox tidak bisa ditulis user itu, jadi `uji-paket.sh` mengatur `sys_temp_dir`/`upload_tmp_dir` ke folder uji. Tanpa itu PHP membuang body request > 16 KB.
- **Nama file gaya Windows** (huruf besar/kecil sama, titik/spasi di akhir nama folder) ditiru dengan symlink `APP`, `app.`, `App ` → `app` di salinan paket. Ini emulasi, bukan Windows sungguhan.
- **Kurs** di dev-stack memakai stub (12673). Paket Apache memakai URL Frankfurter asli, tetapi uji tidak memanggilnya.
