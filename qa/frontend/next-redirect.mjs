// Open redirect lewat parameter `next` di login (frontend/src/js/lib/rute.js nextAman + pages/login.js).
// Bagian 1 (Node, tanpa server): nextAman() untuk banyak payload.
// Bagian 2 (Chromium Playwright, butuh dev-stack): bukti navigasi nyata setelah login. Domain
// penyerang tidak pernah dihubungi: semua request ke evil.example dicegat page.route().
// Hasil: qa/hasil/redirect.json
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { nextAman } from '../../frontend/src/js/lib/rute.js';
import { bagian, cek, harap, selesai } from '../lib/uji.mjs';

const O = 'https://jastip.example';

bagian('1. nextAman() (Node)');
const PAYLOAD_JAHAT = [
  '//evil.example/index.html', '/\\evil.example/index.html', 'https://evil.example/po.html', '/%2F%2Fevil.example/index.html',
  '/..//evil.example/index.html', '/.//evil.example/index.html', '/%2e%2e//evil.example/index.html', '/%2e//evil.example/po.html',
  '/a/..//evil.example/index.html', '/././/evil.example/index.html', '/...//evil.example/index.html', '/..%2f%2fevil.example/index.html',
  '/\t//evil.example/index.html', 'javascript:alert(1)//index.html', '/%09//evil.example/index.html', '/@evil.example/index.html',
];
const hasilNode = PAYLOAD_JAHAT.map((p) => {
  const v = nextAman(p, O);
  const tujuan = v === null ? null : new URL(v, O);
  return { payload: p, kembali: v, origin: tujuan?.origin ?? null };
});
const lolos = hasilNode.filter((h) => h.kembali !== null && h.origin !== O);
await cek('RED-01', `nextAman() tidak pernah mengembalikan tujuan di origin lain (${PAYLOAD_JAHAT.length} payload)`, () => {
  harap(!lolos.length, lolos.map((h) => `${JSON.stringify(h.payload)} → "${h.kembali}" (dibuka browser sebagai ${h.origin})`).join('\n'));
});
await cek('RED-02', 'nextAman() tidak pernah mengembalikan nilai berawalan "//" atau "/\\" (URL relatif-protokol)', () => {
  const buruk = hasilNode.filter((h) => h.kembali && /^\/[/\\]/.test(h.kembali));
  harap(!buruk.length, buruk.map((h) => `${JSON.stringify(h.payload)} → "${h.kembali}"`).join('\n'));
});
await cek('RED-03', 'Kontrol: path internal sah tetap diterima', () => {
  for (const [p, h] of [['/po.html?id=3', '/po.html?id=3'], ['/', '/'], ['/keranjang.html?po=1&customer=2&i=1', '/keranjang.html?po=1&customer=2'], ['/a/../po.html', '/po.html']]) {
    harap(nextAman(p, O) === h, `${p} → ${nextAman(p, O)}`);
  }
});

bagian('2. Bukti di Chromium (login sungguhan di dev-stack)');
await cek('RED-04', 'Setelah login dari /login.html?next=/..//evil.example/index.html browser tetap di origin aplikasi', async () => {
  if (!process.env.APP_URL || !process.env.ADMIN_PASSWORD) return 'dilewati: butuh dev-stack (APP_URL, ADMIN_PASSWORD)';
  let pw;
  try { pw = createRequire(`${process.env.NODE_PATH ?? '/projects/sandbox/.tools/pw/node_modules'}/`)('playwright'); } catch (e) { return `dilewati: Playwright tidak tersedia (${e.message})`; }
  const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const dicegat = [];
    await page.route((u) => u.hostname === 'evil.example', (route) => { dicegat.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>HALAMAN PENYERANG</h1>' }); });
    await page.goto(`${process.env.APP_URL}/login.html?next=${encodeURIComponent('/..//evil.example/index.html')}`);
    await page.fill('#nama-pengguna', process.env.ADMIN_USER);
    await page.fill('#kata-sandi', process.env.ADMIN_PASSWORD);
    await page.click('#tombol-masuk');
    await page.waitForURL((u) => !u.pathname.endsWith('/login.html'), { timeout: 10000 }).catch(() => {});
    const url = page.url();
    if (dicegat.length) {
      const bukti = new URL('../../docs/qa/bukti/', import.meta.url).pathname;
      mkdirSync(bukti, { recursive: true });
      await page.screenshot({ path: `${bukti}open-redirect-next.png` });
    }
    harap(!dicegat.length && new URL(url).origin === new URL(process.env.APP_URL).origin,
      `Setelah login browser membuka ${url} (request dicegat: ${dicegat.join(', ')}); isi halaman: ${(await page.textContent('body')).slice(0, 60)}`);
    return url;
  } finally { await browser.close(); }
});

process.exit(selesai('redirect'));
