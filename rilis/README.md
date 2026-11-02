# Paket siap pakai

`jastip-htdocs.zip` adalah paket aplikasi untuk XAMPP (lokal), InfinityFree, dan hosting cPanel seperti Indowebsite. Isinya langsung disalin ke web root (`htdocs` / `public_html`).

| Versi | Keterangan |
|---|---|
| `v0.1.0-uji` | Versi uji coba sebelum UAT. Belum lulus QA lengkap. |

Cara pakai:

- Lokal: [`docs/deploy/jalankan-lokal-xampp.md`](../docs/deploy/jalankan-lokal-xampp.md)
- InfinityFree: [`docs/deploy/infinityfree.md`](../docs/deploy/infinityfree.md)
- Indowebsite (cPanel): [`docs/deploy/indowebsite.md`](../docs/deploy/indowebsite.md)

Paket tidak berisi kata sandi atau data. `app/.env` dibuat sendiri dari contoh yang disertakan.

Paket ini dibuat ulang dengan `deploy/build-htdocs.sh` setiap kali kode berubah.
