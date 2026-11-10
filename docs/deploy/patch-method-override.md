# Patch manual: method override (hosting tanpa PATCH/DELETE)

Dipakai kalau hosting menolak method **PATCH** dan **DELETE** dengan 403 (mis. Indowebsite
hosting gratis / CWP, InfinityFree). Perbaikan ini membuat aplikasi mengirim PATCH/DELETE
sebagai **POST + header `X-HTTP-Method-Override`**, lalu server mengembalikannya ke method asli.

Cukup mengubah **2 file di server** lewat **File Manager** (keduanya file teks biasa, tidak
di-minify). Setelah selesai, **hard refresh** browser (Ctrl+Shift+R) dan coba ubah markup.

> Ganti `public_html` dengan nama web root kamu kalau berbeda.

---

## File 1 — `public_html/app/src/Http/Request.php` (back-end)

Buka file, cari baris berikut (ada di dalam fungsi `fromGlobals()`, sekitar baris 70):

```php
        return new self(
            method: strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            path: is_string($path) && $path !== '' ? $path : '/',
```

**Ganti** menjadi (tambahkan blok `$method` sebelum `return`, lalu pakai `method: $method,`):

```php
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method === 'POST') {
            $override = strtoupper(trim((string) ($headers['x-http-method-override'] ?? '')));
            if (in_array($override, ['PATCH', 'PUT', 'DELETE'], true)) {
                $method = $override;
            }
        }

        return new self(
            method: $method,
            path: is_string($path) && $path !== '' ? $path : '/',
```

Simpan. (Bagian lain dari `return new self(...)` — `path`, `query`, dst. — biarkan apa adanya.)

---

## File 2 — `public_html/js/lib/api.js` (front-end)

Buka file, cari fungsi `kirim(...)`. Di dalamnya ada bagian seperti ini:

```js
  const mengubah = method !== 'GET' && method !== 'HEAD';
  const headers = { Accept: 'application/json' };
  if (mengubah) headers['Content-Type'] = 'application/json';
  const kirimBody = method === 'POST' || method === 'PATCH' || method === 'PUT';
```

…dan beberapa baris di bawahnya, di dalam `fetch(url, { ... })`:

```js
    res = await fetch(url, {
      method,
      headers,
      body: kirimBody ? JSON.stringify(body ?? {}) : undefined,
```

### Lakukan 2 perubahan:

**(a)** Ganti blok pertama menjadi:

```js
  const mengubah = method !== 'GET' && method !== 'HEAD';
  const headers = { Accept: 'application/json' };
  if (mengubah) headers['Content-Type'] = 'application/json';

  let methodHttp = method;
  if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
    headers['X-HTTP-Method-Override'] = method;
    methodHttp = 'POST';
  }
  const kirimBody = methodHttp === 'POST';
```

**(b)** Di dalam `fetch(url, { ... })`, ganti baris `method,` menjadi `method: methodHttp,`:

```js
    res = await fetch(url, {
      method: methodHttp,
      headers,
      body: kirimBody ? JSON.stringify(body ?? {}) : undefined,
```

Simpan.

> Jangan ubah baris `import ... './rute.js?v=...'` dan `?v=` lain yang sudah ada di file server.
> Yang diubah hanya isi fungsi `kirim()`.

---

## Setelah kedua file disimpan

1. **Hard refresh** browser: Ctrl+Shift+R (atau di HP: tutup tab, buka lagi).
2. Login, buka keranjang customer, coba **ubah markup** barang yang sudah tersimpan.
3. Harus berhasil tanpa "Terjadi kesalahan di server".

Kalau masih gagal, cek `public_html/app/storage/logs/app.log` baris paling bawah dan laporkan.

## Catatan .htaccess

Jangan menambahkan direktif ModSecurity (`SecRuleRemoveById`, `SecFilterEngine`, dll) ke
`.htaccess`: di server ini bisa memicu "500 Internal Server Error". Perbaikan method override di
atas sudah cukup, tanpa perlu mengubah `.htaccess`.
