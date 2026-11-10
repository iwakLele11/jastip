// Deteksi + pemulihan tantangan hosting di src/js/lib/api.js, dengan fetch, document, dan iframe
// palsu. Server palsu meniru InfinityFree: tanpa cookie yang benar → HTML 200 text/html.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, PESAN, api, pesanError, tampakTantangan } from '../../src/js/lib/api.js';

const ORIGIN = 'https://jastip.example';
const HTML_TANTANGAN = '<html><body><script>document.cookie="__test=abc; path=/";location.href="/po.html?i=1";</script></body></html>';

/** Status server + browser palsu. */
let s;
const tantangan = () => new Response(HTML_TANTANGAN, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });

beforeEach(() => {
  s = {
    kunci: 'k1', // kunci server saat ini
    cookie: '', // cookie __test di browser
    rusak: false, // tantangan tidak pernah selesai
    pindahHttps: false,
    permintaan: [], // semua fetch
    tercatat: [], // POST yang benar-benar diproses server
    iframe: [],
    tahan: null, // (url) => Promise<Response> | null: menahan jawaban fetch tertentu
  };
});

class IframePalsu {
  constructor() {
    this.dataset = {};
    this.atribut = {};
    this.dengar = [];
    this.isConnected = false;
    this.contentDocument = null;
  }
  addEventListener(jenis, fn) {
    if (jenis === 'load') this.dengar.push(fn);
  }
  setAttribute(k, v) {
    this.atribut[k] = v;
  }
  remove() {
    this.isConnected = false;
  }
  muat(dataset) {
    if (!this.isConnected) return;
    this.contentDocument = { documentElement: { dataset } };
    for (const fn of this.dengar) fn();
  }
}

/** Browser di iframe: halaman tantangan memasang cookie lalu redirect ke segarkan.html?…&i=1. */
function jalankanIframe(el) {
  const tahap = () => {
    if (!el.isConnected) return;
    const lolos = !s.rusak && s.cookie === s.kunci;
    if (lolos) {
      el.muat({ segar: 'ok' });
      return;
    }
    el.muat({}); // halaman tantangan
    s.cookie = s.rusak ? 'salah' : s.kunci;
    if (!s.rusak) setImmediate(tahap);
  };
  setImmediate(tahap);
}

globalThis.location = { origin: ORIGIN, href: `${ORIGIN}/po.html?id=3`, pathname: '/po.html', search: '?id=3' };
globalThis.document = {
  baseURI: `${ORIGIN}/po.html?id=3`,
  documentElement: { hasAttribute: (n) => n === 'data-pindah-https' && s.pindahHttps },
  createElement: (tag) => {
    assert.equal(tag, 'iframe');
    return new IframePalsu();
  },
  body: {
    append: (el) => {
      el.isConnected = true;
      s.iframe.push(el);
      jalankanIframe(el);
    },
  },
};
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  s.permintaan.push({ path: u.pathname, method: init.method, body: init.body, redirect: init.redirect });
  const ditahan = s.tahan?.(u.pathname);
  if (ditahan) return ditahan;
  if (s.cookie !== s.kunci || s.rusak) return tantangan();
  if (u.pathname.endsWith('/error-html')) return new Response('<h1>500</h1>', { status: 500, headers: { 'content-type': 'text/html' } });
  if (init.method === 'POST') s.tercatat.push(JSON.parse(init.body));
  return Response.json({ data: { path: u.pathname, tercatat: s.tercatat.length } });
};

const tunggu = async (syarat) => {
  for (let i = 0; i < 1000 && !syarat(); i += 1) await new Promise((r) => setImmediate(r));
  assert.ok(syarat(), 'syarat tidak terpenuhi');
};

// ---------- tampakTantangan ----------

test('tampakTantangan: HTML / bukan JSON / redirect = tantangan', () => {
  assert.equal(tampakTantangan(tantangan()), true);
  assert.equal(tampakTantangan(new Response('x', { status: 200, headers: { 'content-type': 'text/plain' } })), true);
  assert.equal(tampakTantangan(new Response('x', { status: 200 })), true); // tanpa Content-Type
  assert.equal(tampakTantangan({ type: 'opaqueredirect', status: 0, headers: new Headers() }), true);
  assert.equal(tampakTantangan({ type: 'basic', redirected: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }) }), true);
});

test('tampakTantangan: JSON, 204, dan error server non-JSON bukan tantangan', () => {
  assert.equal(tampakTantangan(Response.json({ data: 1 })), false);
  assert.equal(tampakTantangan(new Response('{}', { status: 201, headers: { 'content-type': 'application/json; charset=utf-8' } })), false);
  assert.equal(tampakTantangan(new Response('{}', { status: 200, headers: { 'content-type': 'Application/JSON' } })), false);
  assert.equal(tampakTantangan(new Response('{}', { status: 200, headers: { 'content-type': 'application/problem+json' } })), false);
  assert.equal(tampakTantangan(new Response(null, { status: 204 })), false);
  for (const status of [401, 404, 422, 500, 503]) {
    assert.equal(tampakTantangan(new Response('<h1>x</h1>', { status, headers: { 'content-type': 'text/html' } })), false, String(status));
  }
});

// ---------- api(): pemulihan ----------

test('GET kena tantangan → iframe segarkan.html → diulang sekali → data', async () => {
  const { data } = await api('/open-po/3');
  assert.equal(data.path, '/api/v1/open-po/3');
  assert.deepEqual(s.permintaan.map((p) => p.path), ['/api/v1/open-po/3', '/api/v1/open-po/3']);
  assert.ok(s.permintaan.every((p) => p.redirect === 'manual'));
  assert.equal(s.iframe.length, 1);
  const el = s.iframe[0];
  assert.match(el.src, /^https:\/\/jastip\.example\/segarkan\.html\?t=\d+$/);
  assert.equal(el.hidden, true);
  assert.equal(el.tabIndex, -1);
  assert.equal(el.atribut['aria-hidden'], 'true');
  assert.equal(el.isConnected, false, 'iframe dihapus setelah selesai');
});

test('tanpa tantangan: tidak ada iframe, satu request', async () => {
  s.cookie = s.kunci;
  await api('/pengaturan');
  assert.equal(s.permintaan.length, 1);
  assert.equal(s.iframe.length, 0);
});

test('beberapa request kena tantangan bersamaan → satu pemulihan bersama, masing-masing diulang sekali', async () => {
  const hasil = await Promise.all([api('/a'), api('/b'), api('/c', { method: 'POST', body: { x: 1 } })]);
  assert.deepEqual(hasil.map((h) => h.data.path), ['/api/v1/a', '/api/v1/b', '/api/v1/c']);
  assert.equal(s.iframe.length, 1);
  assert.equal(s.permintaan.length, 6);
  assert.equal(s.tercatat.length, 1);
});

test('POST kena tantangan → diulang dengan method dan body yang sama, tercatat tepat sekali', async () => {
  const body = { nominal: 1468000, tanggal: '2026-10-28' };
  const { data } = await api('/open-po/3/keranjang/5/pembayaran', { method: 'POST', body });
  assert.equal(data.tercatat, 1);
  assert.deepEqual(s.tercatat, [body]);
  const [p1, p2] = s.permintaan;
  assert.deepEqual([p1.method, p2.method], ['POST', 'POST']);
  assert.equal(p1.body, p2.body);
});

test('redirect (opaqueredirect) diperlakukan sebagai tantangan', async () => {
  let pertama = true;
  s.tahan = () => {
    if (!pertama) return null;
    pertama = false;
    return Promise.resolve({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), body: null });
  };
  const { data } = await api('/customer');
  assert.equal(data.path, '/api/v1/customer');
  assert.equal(s.iframe.length, 1);
  assert.equal(s.permintaan.length, 2);
});

test('request yang dikirim sebelum pemulihan selesai diulang tanpa pemulihan baru', async () => {
  let lepas;
  s.tahan = (path) => (path.endsWith('/lambat') && !lepas ? new Promise((ok) => (lepas = () => ok(tantangan()))) : null);
  const lambat = api('/lambat');
  await tunggu(() => lepas);
  await api('/cepat'); // kena tantangan, memulihkan
  assert.equal(s.iframe.length, 1);
  lepas(); // jawaban tantangan lama datang setelah cookie diperbarui
  const { data } = await lambat;
  assert.equal(data.path, '/api/v1/lambat');
  assert.equal(s.iframe.length, 1);
});

test('tantangan tidak bisa diselesaikan → setelah 15 detik iframe dihapus, diulang sekali, PERLU_MUAT_ULANG', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  s.rusak = true;
  const janji = api('/open-po/3/keranjang/5/pembayaran', { method: 'POST', body: { nominal: 1 } });
  await tunggu(() => s.iframe[0]?.contentDocument);
  assert.equal(s.permintaan.length, 1, 'belum diulang sebelum batas waktu');
  t.mock.timers.tick(14999);
  await new Promise((r) => setImmediate(r));
  assert.equal(s.iframe[0].isConnected, true);
  t.mock.timers.tick(1);
  await assert.rejects(janji, (e) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.kode, 'PERLU_MUAT_ULANG');
    assert.equal(e.perluMuatUlang, true);
    assert.equal(e.jaringan, false);
    assert.equal(e.pesan, 'Koneksi ke server perlu diperbarui. Muat ulang halaman, lalu coba lagi.');
    return true;
  });
  assert.equal(s.iframe[0].isConnected, false);
  assert.equal(s.permintaan.length, 2);
  assert.equal(s.tercatat.length, 0);
});

test('penanda tercapai tapi request ulang masih kena tantangan → PERLU_MUAT_ULANG, tidak diulang lagi', async () => {
  let n = 0;
  s.tahan = (path) => (path.endsWith('/x') && ++n <= 2 ? Promise.resolve(tantangan()) : null);
  await assert.rejects(api('/x'), { kode: 'PERLU_MUAT_ULANG' });
  assert.equal(n, 2);
  assert.equal(s.iframe.length, 1);
});

test('dibatalkan pemanggil saat menunggu pemulihan → AbortError, bukan ApiError', async () => {
  const c = new AbortController();
  const janji = api('/customer', { signal: c.signal });
  await tunggu(() => s.iframe.length === 1);
  c.abort();
  await assert.rejects(janji, { name: 'AbortError' });
  assert.equal(s.permintaan.length, 1);
  await tunggu(() => !s.iframe[0].isConnected); // pemulihan bersama tetap selesai di belakang
});

test('error server HTML (500) bukan tantangan: tidak diulang', async () => {
  s.cookie = s.kunci;
  await assert.rejects(api('/error-html'), { kode: 'KESALAHAN_SERVER', status: 500 });
  assert.equal(s.permintaan.length, 1);
  assert.equal(s.iframe.length, 0);
});

test('halaman sedang dialihkan ke https (data-pindah-https): tidak ada request', async () => {
  s.pindahHttps = true;
  const hasil = await Promise.race([api('/auth/sesi').then(() => 'selesai'), new Promise((r) => setTimeout(() => r('tertunda'), 20))]);
  assert.equal(hasil, 'tertunda');
  assert.equal(s.permintaan.length, 0);
});

test('pesanError: PERLU_MUAT_ULANG memakai pesannya sendiri di semua konteks', () => {
  const e = new ApiError({ status: 0, kode: 'PERLU_MUAT_ULANG', pesan: PESAN.perluMuatUlang });
  for (const k of ['muat', 'simpan', 'login', 'aksi']) assert.equal(pesanError(e, k), PESAN.perluMuatUlang, k);
});
