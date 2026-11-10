// Rute aplikasi (MPA: satu file .html per layar) dan validasi parameter `next` login.
// Fungsi murni di bagian atas bisa dites di Node.

/** Halaman yang boleh dituju lewat `next` setelah login. '' = index (path berakhiran /). */
export const HALAMAN_INTERNAL = new Set([
  '', 'index.html', 'po.html', 'po-form.html', 'keranjang.html',
  'customer.html', 'customer-form.html', 'pengaturan.html',
]);

/**
 * Membuang parameter `i=<angka>` yang ditambahkan tantangan hosting (InfinityFree: redirect ke
 * URL yang sama + ?i=N) dari query string. Parameter lain dan urutannya tidak diubah.
 * Logika yang sama dipakai src/js/awal.js (skrip klasik, tidak bisa mengimpor modul ini).
 * @param {string} search mis. "?id=3&i=1" → "?id=3"
 */
export function buangParamHosting(search) {
  const bagian = search.replace(/^\?/, '').split('&');
  const sisa = bagian.filter((p) => !/^i=\d+$/.test(p));
  if (sisa.length === bagian.length) return search;
  const q = sisa.filter(Boolean).join('&');
  return q ? `?${q}` : '';
}

/**
 * Mengembalikan path internal yang aman untuk `next`, atau null.
 * Mencegah open redirect: hanya path relatif-origin ("/..."), bukan "//host" atau "/\host",
 * origin harus sama, dan nama file harus salah satu halaman aplikasi (bukan login.html).
 *
 * @param {unknown} nilai isi parameter `next`
 * @param {string} origin origin halaman saat ini, mis. "https://jastip.example"
 */
export function nextAman(nilai, origin) {
  if (typeof nilai !== 'string' || nilai.length === 0 || nilai.length > 2000) return null;
  if (!nilai.startsWith('/') || nilai.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f\s]/.test(nilai)) return null;
  let url;
  try {
    url = new URL(nilai, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const file = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  if (!HALAMAN_INTERNAL.has(file)) return null;
  return url.pathname + buangParamHosting(url.search);
}

/** ID dari query string: bilangan bulat positif (sama dengan aturan `{id}` di API), atau null. */
export function idDariQuery(nilai) {
  return typeof nilai === 'string' && /^[1-9][0-9]{0,9}$/.test(nilai) ? Number(nilai) : null;
}

/** Rute saat ini untuk `next`. Hash sengaja tidak ikut (bisa berisi teks pencarian/nama). */
export function ruteSaatIni() {
  return location.pathname + location.search;
}

/** Arahkan ke login dengan `next` = rute saat ini. Dipakai saat API membalas 401. */
export function keLogin({ sesiBerakhir = false } = {}) {
  const q = new URLSearchParams();
  const next = nextAman(ruteSaatIni(), location.origin);
  if (next) q.set('next', next);
  if (sesiBerakhir) q.set('alasan', 'sesi-berakhir');
  const qs = q.toString();
  location.replace(`login.html${qs ? `?${qs}` : ''}`);
}

export const rute = {
  beranda: () => 'index.html',
  login: () => 'login.html',
  poBaru: () => 'po-form.html',
  poUbah: (id) => `po-form.html?id=${encodeURIComponent(id)}`,
  poDetail: (id) => `po.html?id=${encodeURIComponent(id)}`,
  keranjang: (poId, customerId) =>
    `keranjang.html?po=${encodeURIComponent(poId)}${customerId ? `&customer=${encodeURIComponent(customerId)}` : ''}`,
  customer: () => 'customer.html',
  customerBaru: () => 'customer-form.html',
  customerUbah: (id) => `customer-form.html?id=${encodeURIComponent(id)}`,
  pengaturan: () => 'pengaturan.html',
};
