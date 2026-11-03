// Bagian B §2 + §8: tautan dan navigasi di Chromium, WebKit, Firefox.
//   TAU-A  semua halaman + tautan internal + aset (CSS/JS/ikon/favicon) tanpa 4xx/5xx, tautan eksternal
//   TAU-B  ID tidak ada / parameter salah → state yang benar + tautan pemulihan
//   TAU-C  tombol kembali dan refresh browser di setiap layar
//   TAU-D  bfcache setelah Keluar
//   TAU-E  ?i=N dan tantangan InfinityFree (set=on / putar / rusak) di setiap browser
//   TAU-F  regresi QA-A-01 (open redirect `next`) di WebKit dan Firefox
//   TAU-G  tombol kembali (Android/iOS swipe) saat sheet berisi isian
// Hasil: qa/hasil/tautan.json; screenshot docs/qa/screenshots/tautan/.
import { Klien, noWaUnik } from '../lib/klien.mjs';
import { bagian, cek, harap, selesai } from '../lib/uji.mjs';
import { APP_URL, BROWSER, apiJson, foto, luncurkan, masukApi, masukUi, pantau, profil, tidur } from '../lib/browser.mjs';

const a = new Klien();
await a.login();
const kurs = { mode: 'manual', kurs_jastip: 13054 };
const po = await a.ok('POST', '/open-po', { nama: 'Navigasi Nov 2026', kurs });
const c1 = await a.ok('POST', '/customer', { nama: 'Lani Navigasi', no_wa: noWaUnik(), alamat: 'Jl. Uji 1' });
const c2 = await a.ok('POST', '/customer', { nama: 'Sari Navigasi', no_wa: noWaUnik() });
const cTanpa = await a.ok('POST', '/customer', { nama: 'Tanpa Keranjang', no_wa: noWaUnik() });
await a.ok('POST', `/open-po/${po.id}/keranjang/${c1.id}/baris-pesanan`, { nama_barang: 'Barang A', harga_aud: '24,95', qty: 2, markup_persen: '10' });
await a.ok('POST', `/open-po/${po.id}/keranjang/${c1.id}/pembayaran`, { nominal: 718000, tanggal: '2026-10-28' });
await a.ok('POST', `/open-po/${po.id}/keranjang/${c2.id}/baris-pesanan`, { nama_barang: 'Barang B', harga_aud: '8,50', qty: 3, markup_persen: '15' });

const HALAMAN = [
  ['/', 'h1', 'Open PO'],
  ['/index.html', 'h1', 'Open PO'],
  [`/po.html?id=${po.id}`, 'h1', po.nama],
  ['/po-form.html', 'h1', 'Open PO baru'],
  [`/po-form.html?id=${po.id}`, 'h1', 'Ubah Open PO'],
  [`/keranjang.html?po=${po.id}&customer=${c1.id}`, 'h1', c1.nama],
  ['/customer.html', 'h1', 'Customer'],
  ['/customer-form.html', 'h1', 'Customer baru'],
  [`/customer-form.html?id=${c1.id}`, 'h1', c1.nama],
  ['/pengaturan.html', 'h1', 'Pengaturan'],
];

const TIDAK_ADA = 99999999;
const SALAH = [
  ['/po.html', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  ['/po.html?id=abc', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  ['/po.html?id=0', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  ['/po.html?id=-1', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  ['/po.html?id=1.5', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  [`/po.html?id=0${po.id}`, 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  [`/po.html?id=${TIDAK_ADA}`, 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  ['/po.html?id=99999999999999999999', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  [`/po.html?id=${po.id}&id=${TIDAK_ADA}`, null, null], // parameter ganda: yang pertama dipakai
  [`/po.html?id=${po.id}&status=ngawur`, null, null],
  ['/po-form.html?id=abc', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  [`/po-form.html?id=${TIDAK_ADA}`, 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  ['/keranjang.html', 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  [`/keranjang.html?po=${po.id}`, 'Customer tidak ditemukan.', 'Kembali ke Open PO'],
  [`/keranjang.html?po=${po.id}&customer=abc`, 'Customer tidak ditemukan.', 'Kembali ke Open PO'],
  [`/keranjang.html?po=${po.id}&customer=${TIDAK_ADA}`, 'Customer tidak ditemukan.', 'Kembali ke Open PO'],
  [`/keranjang.html?po=${TIDAK_ADA}&customer=${c1.id}`, 'Open PO tidak ditemukan.', 'Lihat daftar Open PO'],
  [`/keranjang.html?po=${po.id}&customer=${cTanpa.id}`, `Belum ada barang untuk ${cTanpa.nama}.`, null],
  ['/customer-form.html?id=abc', 'Customer tidak ditemukan.', 'Lihat daftar customer'],
  [`/customer-form.html?id=${TIDAK_ADA}`, 'Customer tidak ditemukan.', 'Lihat daftar customer'],
  ['/customer.html#q=%3Cscript%3Ezzz', 'Tidak ada customer dengan nama atau no WA "<script>zzz".', 'Buat customer "<script>zzz"'],
  ['/login.html?alasan=sesi-berakhir', 'Sesi berakhir. Silakan masuk lagi.', null],
];

const modeTantangan = async (set) => {
  const r = await fetch(`${APP_URL}/__dev/tantangan-mode?set=${set}`);
  return r.text();
};

async function denganBrowser(nama, fn) {
  let browser;
  try {
    browser = await luncurkan(nama);
  } catch (e) {
    await cek(`TAU-${nama}`, `${nama} bisa diluncurkan`, () => {
      throw new Error(e.message.split('\n')[0]);
    });
    return;
  }
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

for (const namaB of BROWSER) {
  bagian(`Browser ${namaB}`);
  await denganBrowser(namaB, async (browser) => {
    const layar = namaB === 'firefox' ? { w: 1280, h: 800 } : { w: 390, h: 844 };
    const baru = async (l = layar) => {
      const ctx = await browser.newContext(profil(namaB, l));
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      return { ctx, page, m: pantau(page) };
    };

    // ---------- A ----------
    await cek(`TAU-A1-${namaB}`, `${namaB}: ${HALAMAN.length} halaman + aset dimuat tanpa 4xx/5xx/gagal, tanpa error JS`, async () => {
      const { ctx, page, m } = await baru();
      await masukApi(ctx);
      const tautan = new Set();
      const salah = [];
      for (const [url, sel, teks] of HALAMAN) {
        await page.goto(url);
        await page.locator(sel, { hasText: teks }).first().waitFor();
        await tidur(400);
        for (const href of await page.$$eval('a[href], link[href], script[src]', (els) => els.map((e) => e.href || e.src))) tautan.add(href);
      }
      salah.push(...m.masalah);
      await ctx.close();
      harap(!salah.length, salah.join('\n'));
      return `${tautan.size} URL unik dikumpulkan`;
    });

    await cek(`TAU-A2-${namaB}`, `${namaB}: semua tautan internal (a, link, script) membalas 200 dengan Content-Type yang benar; tidak ada tautan eksternal`, async () => {
      const { ctx, page } = await baru();
      await masukApi(ctx);
      const tautan = new Map();
      for (const [url, sel, teks] of HALAMAN) {
        await page.goto(url);
        await page.locator(sel, { hasText: teks }).first().waitFor();
        await tidur(300);
        for (const t of await page.$$eval('a[href], link[href], script[src]', (els) => els.map((e) => ({ u: e.href || e.src, tag: e.tagName, rel: e.rel ?? '' })))) {
          if (!tautan.has(t.u)) tautan.set(t.u, { ...t, dari: url });
        }
      }
      const masalah = [];
      const eksternal = [];
      for (const [u, t] of tautan) {
        const url = new URL(u);
        if (url.origin !== new URL(APP_URL).origin) {
          eksternal.push(`${u} (dari ${t.dari})`);
          continue;
        }
        if (url.hash && url.pathname === new URL(t.dari, APP_URL).pathname) continue; // #konten
        const r = await ctx.request.get(u.split('#')[0]);
        const ct = r.headers()['content-type'] ?? '';
        const harap2 = t.tag === 'SCRIPT' || /modulepreload/.test(t.rel) ? /javascript/ : t.rel === 'stylesheet' ? /text\/css/ : t.rel === 'icon' ? /image\/svg\+xml/ : /text\/html/;
        if (r.status() !== 200 || !harap2.test(ct)) masalah.push(`${r.status()} ${ct} ${u} (dari ${t.dari})`);
      }
      await ctx.close();
      harap(!masalah.length && !eksternal.length, [...masalah, ...eksternal.map((e) => `eksternal: ${e}`)].join('\n'));
      return `${tautan.size} URL diperiksa, 0 eksternal`;
    });

    if (namaB === 'chromium') {
      await cek('TAU-A3', 'Ikon: favicon.svg 200 image/svg+xml; ikon tambahan yang diminta Safari/iOS (apple-touch-icon, favicon.ico)', async () => {
        const hasil = [];
        for (const p of ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
          const r = await fetch(`${APP_URL}${p}`);
          hasil.push(`${p} ${r.status} ${r.headers.get('content-type') ?? ''}`);
        }
        harap(hasil[0].startsWith('/favicon.svg 200 image/svg+xml'), hasil.join('; '));
        // php -S melayani index.html untuk path yang tidak ada (200 text/html); di Apache 404 (qa/ui/cache-paket.mjs).
        return `${hasil.join('; ')} (dev-stack: path tidak ada dijawab index.html oleh php -S)`;
      });
    }

    // ---------- B ----------
    await cek(`TAU-B-${namaB}`, `${namaB}: ${SALAH.length} URL dengan ID tidak ada / parameter salah menampilkan state yang benar`, async () => {
      const { ctx, page, m } = await baru();
      await masukApi(ctx);
      const salah = [];
      for (const [url, teks, aksi] of SALAH) {
        m.reset();
        await page.goto(url);
        try {
          if (teks) await page.getByText(teks, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
          else await page.getByRole('heading', { level: 1, name: po.nama }).waitFor({ timeout: 8000 });
          if (aksi) await page.getByRole('link', { name: aksi }).or(page.getByRole('button', { name: aksi })).filter({ visible: true }).first().waitFor({ timeout: 3000 });
          if (url.includes('status=ngawur')) {
            const pilih = await page.locator('#chip-status input:checked').getAttribute('value');
            if (pilih !== 'semua') salah.push(`${url}: chip ${pilih}`);
          }
          if (url.includes(`&id=${TIDAK_ADA}`) && !(await page.getByRole('heading', { level: 1, name: po.nama }).isVisible())) salah.push(`${url}: bukan PO pertama`);
        } catch (e) {
          salah.push(`${url}: ${e.message.split('\n')[0]} | body: ${(await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`);
          await foto(page, `tautan/${namaB}-B-${url.replace(/\W+/g, '-').slice(0, 60)}`);
        }
        const err = m.masalah.filter((x) => !/HTTP 404 GET .*\/api\//.test(x));
        if (err.length) salah.push(`${url}: ${err.join(' | ')}`);
      }
      await ctx.close();
      harap(!salah.length, salah.join('\n'));
    });

    // ---------- C ----------
    await cek(`TAU-C-${namaB}`, `${namaB}: kembali/maju/refresh di setiap layar (beranda, detail + filter, keranjang, form PO, customer + cari, pengaturan)`, async () => {
      const { ctx, page, m } = await baru();
      await masukApi(ctx);
      const salah = [];
      const h1 = async () => (await page.locator('h1').first().innerText()).trim();
      const harapH1 = async (t, ket) => {
        try {
          await page.getByRole('heading', { level: 1, name: t, exact: true }).waitFor({ timeout: 8000 });
        } catch {
          salah.push(`${ket}: h1 "${await h1().catch(() => '?')}" (harap "${t}") di ${page.url()}`);
        }
      };
      await page.goto('/');
      await harapH1('Open PO', 'beranda');
      await page.reload();
      await harapH1('Open PO', 'beranda refresh');
      await page.locator(`[data-po-id="${po.id}"]`).click();
      await harapH1(po.nama, 'detail');
      await page.locator('#chip-status label', { hasText: 'Lunas' }).click();
      await page.waitForURL(/status=lunas/);
      await page.reload();
      await harapH1(po.nama, 'detail refresh');
      if ((await page.locator('#chip-status input:checked').getAttribute('value')) !== 'lunas') salah.push('filter Lunas hilang setelah refresh');
      await page.locator(`#daftar-customer [data-customer-id="${c1.id}"]`).filter({ visible: true }).first().click();
      await harapH1(c1.nama, 'keranjang');
      await page.reload();
      await harapH1(c1.nama, 'keranjang refresh');
      await page.getByRole('button', { name: 'Catat pembayaran' }).click();
      await page.getByRole('dialog', { name: 'Catat pembayaran' }).waitFor();
      await page.reload();
      await harapH1(c1.nama, 'keranjang refresh dengan sheet terbuka');
      if (await page.getByRole('dialog').count()) salah.push('sheet masih terbuka setelah refresh');
      await page.goBack();
      await harapH1(po.nama, 'kembali ke detail');
      await page.locator('#chip-status input:checked').waitFor();
      if ((await page.locator('#chip-status input:checked').getAttribute('value')) !== 'lunas') salah.push('filter Lunas hilang setelah kembali dari keranjang');
      await page.goForward();
      await harapH1(c1.nama, 'maju ke keranjang');
      // Tombol ‹ AppBar = history.back saat asal = induk.
      await page.getByRole('link', { name: 'Kembali', exact: true }).click();
      await harapH1(po.nama, '‹ dari keranjang');
      await page.getByRole('link', { name: 'Ubah', exact: true }).click();
      await harapH1('Ubah Open PO', 'form ubah');
      await page.reload();
      await harapH1('Ubah Open PO', 'form ubah refresh');
      if ((await page.getByLabel('Nama Open PO').inputValue()) !== po.nama) salah.push('form ubah kosong setelah refresh');
      await page.goBack();
      await harapH1(po.nama, 'kembali dari form ubah');
      await page.goBack();
      await harapH1('Open PO', 'kembali ke beranda');
      // Buat PO baru: form diganti (location.replace) → kembali ke beranda, bukan ke form; ?pesan dibuang.
      await page.goto('/po-form.html');
      await page.locator('#panel-otomatis [data-kurs-jastip]').waitFor();
      await page.getByLabel('Nama Open PO').fill(`Navigasi baru ${Date.now() % 10000}`);
      await page.getByRole('button', { name: 'Simpan Open PO' }).click();
      await page.waitForURL(/\/po\.html\?id=\d+$/);
      if (/pesan=/.test(page.url())) salah.push(`?pesan tertinggal: ${page.url()}`);
      await page.reload();
      await page.locator('#isi-po:not([hidden])').waitFor();
      await tidur(300);
      if (await page.locator('[data-toast]').count()) salah.push('toast "Open PO dibuat." muncul lagi setelah refresh');
      await page.goBack();
      await harapH1('Open PO', 'kembali setelah simpan PO (harap beranda, bukan form)');
      // Customer + cari (#q=) → form → kembali: teks cari dan hasil tetap.
      await page.goto('/customer.html');
      await page.getByLabel('Cari nama atau no WA').fill('Navigasi');
      await page.waitForURL(/#q=Navigasi/);
      await page.locator(`#daftar [data-customer-id="${c2.id}"]`).filter({ visible: true }).first().waitFor();
      await page.reload();
      if ((await page.getByLabel('Cari nama atau no WA').inputValue()) !== 'Navigasi') salah.push('teks cari hilang setelah refresh');
      await page.locator(`#daftar [data-customer-id="${c2.id}"]`).filter({ visible: true }).first().click();
      await harapH1(c2.nama, 'form customer');
      await page.goBack();
      await page.locator(`#daftar [data-customer-id="${c2.id}"]`).filter({ visible: true }).first().waitFor({ timeout: 8000 }).catch(() => salah.push('hasil cari tidak tampil setelah kembali'));
      if ((await page.getByLabel('Cari nama atau no WA').inputValue()) !== 'Navigasi') salah.push('teks cari hilang setelah kembali');
      await page.goto('/pengaturan.html');
      await page.getByLabel('Default markup').waitFor();
      await page.reload();
      await page.getByLabel('Default markup').waitFor();
      const err = m.masalah;
      await ctx.close();
      harap(!salah.length && !err.length, [...salah, ...err].join('\n'));
    });

    // ---------- D ----------
    await cek(`TAU-D-${namaB}`, `${namaB}: setelah Keluar, tombol kembali tidak menampilkan data lama (bfcache) dan berakhir di login`, async () => {
      const { ctx, page } = await baru();
      await ctx.addInitScript(() => {
        window.addEventListener('pageshow', (e) => {
          if (e.persisted) sessionStorage.setItem(`qa-bfcache-${location.pathname}`, String(Date.now()));
        });
      });
      await masukUi(page);
      await page.goto(`/po.html?id=${po.id}`);
      await page.locator(`#daftar-customer [data-customer-id="${c1.id}"]`).filter({ visible: true }).first().waitFor();
      await page.goto(`/keranjang.html?po=${po.id}&customer=${c1.id}`);
      await page.getByRole('heading', { level: 1, name: c1.nama }).waitFor();
      await page.goto('/pengaturan.html');
      await page.getByLabel('Default markup').waitFor();
      await page.locator('[data-keluar]:visible').click();
      await page.waitForURL(/login\.html$/);
      const jejak = [];
      for (let i = 0; i < 3; i++) {
        // Ambil screenshot secepat mungkin setelah kembali, lalu tunggu halaman tenang.
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await tidur(60);
        const sekilas = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '').catch(() => '');
        const nama = `tautan/${namaB}-D-kembali-${i + 1}`;
        await foto(page, nama);
        await tidur(2500);
        jejak.push({
          url: page.url(),
          sekilasData: [c1.nama, po.nama, 'Rp718.000'].filter((t) => sekilas.includes(t)),
          akhirData: [c1.nama, po.nama].filter(() => false),
          bfcache: await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qa-bfcache'))).catch(() => []),
        });
        if (!page.url().includes('login.html')) break;
      }
      const akhir = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      const bocorAkhir = [c1.nama, 'Rp718.000'].filter((t) => akhir.includes(t));
      const sesi = await page.request.get(`${APP_URL}/api/v1/auth/sesi`);
      await ctx.close();
      const ringkas = jejak.map((j, i) => `kembali ${i + 1}: ${new URL(j.url).pathname}${new URL(j.url).search} sekilas=[${j.sekilasData}] bfcache=[${j.bfcache.map((k) => k.replace('qa-bfcache-', ''))}]`).join('; ');
      harap(jejak.every((j) => j.url.includes('login.html')), `tidak kembali ke login: ${ringkas}`);
      harap(!bocorAkhir.length, `data tampil setelah tenang: ${bocorAkhir} (${ringkas})`);
      harap(sesi.status() === 401, `sesi masih aktif (${sesi.status()})`);
      const sekilas = jejak.flatMap((j) => j.sekilasData);
      return `${ringkas}${sekilas.length ? ' — data lama terlihat sekilas sebelum dialihkan' : ''}`;
    });

    // ---------- E ----------
    await cek(`TAU-E1-${namaB}`, `${namaB}: ?i=N dibuang dari URL di setiap halaman, parameter lain tetap`, async () => {
      const { ctx, page, m } = await baru();
      await masukApi(ctx);
      const salah = [];
      for (const [masuk, harapUrl] of [
        [`/po.html?id=${po.id}&i=1`, `/po.html?id=${po.id}`],
        [`/po.html?i=2&id=${po.id}&status=lunas`, `/po.html?id=${po.id}&status=lunas`],
        [`/keranjang.html?po=${po.id}&i=3&customer=${c1.id}`, `/keranjang.html?po=${po.id}&customer=${c1.id}`],
        [`/customer.html?i=1#q=Lani`, '/customer.html#q=Lani'],
        ['/index.html?i=1', '/index.html'],
        [`/po.html?id=${po.id}&pesan=po-dibuat&i=1`, `/po.html?id=${po.id}`],
      ]) {
        await page.goto(masuk);
        await page.locator('h1').first().waitFor();
        await tidur(500);
        const u = new URL(page.url());
        if (`${u.pathname}${u.search}${u.hash}` !== harapUrl) salah.push(`${masuk} → ${u.pathname}${u.search}${u.hash} (harap ${harapUrl})`);
      }
      await ctx.close();
      harap(!salah.length && !m.masalah.length, [...salah, ...m.masalah].join('\n'));
    });

    await cek(`TAU-E2-${namaB}`, `${namaB}: tantangan set=on saat membuka halaman + login dengan next → selesai sendiri, URL tanpa i`, async () => {
      const { ctx, page, m } = await baru();
      try {
        await modeTantangan('on');
        const tujuan = `/po.html?id=${po.id}&status=lunas`;
        await page.goto(tujuan);
        await page.waitForURL(/login\.html\?next=/, { timeout: 15000 });
        const login = new URL(page.url());
        harap(login.searchParams.get('next') === tujuan && !login.searchParams.has('i'), `URL login: ${login.search}`);
        await modeTantangan('putar');
        await page.fill('#nama-pengguna', process.env.ADMIN_USER);
        await page.fill('#kata-sandi', process.env.ADMIN_PASSWORD);
        await page.click('#tombol-masuk');
        await page.waitForURL((u) => u.pathname.endsWith('/po.html'), { timeout: 30000 });
        await page.getByRole('heading', { level: 1, name: po.nama }).waitFor({ timeout: 20000 });
        const u = new URL(page.url());
        harap(`${u.pathname}${u.search}` === tujuan, `setelah login: ${u.pathname}${u.search}`);
        harap(!m.masalah.filter((x) => !/HTTP 401/.test(x)).length, m.masalah.join('\n'));
        return `login ${login.pathname}${login.search}`;
      } finally {
        await modeTantangan('off');
        await ctx.close();
      }
    });

    await cek(`TAU-E3-${namaB}`, `${namaB}: kunci diputar saat halaman terbuka → POST pembayaran dipulihkan lewat iframe, tercatat tepat sekali`, async () => {
      const { ctx, page, m } = await baru();
      const k0 = await a.ok('GET', `/open-po/${po.id}/keranjang/${c2.id}`);
      let post = 0;
      let html = 0;
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().endsWith(`/keranjang/${c2.id}/pembayaran`)) post += 1;
      });
      page.on('response', (r) => {
        if (new URL(r.url()).pathname.startsWith('/api/') && (r.headers()['content-type'] ?? '').startsWith('text/html')) html += 1;
      });
      try {
        await modeTantangan('on');
        await masukUi(page);
        await page.goto(`/keranjang.html?po=${po.id}&customer=${c2.id}`);
        await page.getByRole('heading', { level: 1, name: c2.nama }).waitFor({ timeout: 20000 });
        await modeTantangan('putar');
        await page.getByRole('button', { name: 'Catat pembayaran' }).click();
        const s = page.getByRole('dialog', { name: 'Catat pembayaran' });
        await s.getByLabel('Nominal').fill('50000');
        await s.getByRole('button', { name: 'Simpan Rp50.000' }).click();
        await page.locator('[data-toast]', { hasText: 'Pembayaran Rp50.000 dicatat.' }).waitFor({ timeout: 25000 });
      } finally {
        await modeTantangan('off');
      }
      const k1 = await a.ok('GET', `/open-po/${po.id}/keranjang/${c2.id}`);
      await ctx.close();
      const tambah = k1.riwayat.length - k0.riwayat.length;
      harap(tambah === 1, `pembayaran bertambah ${tambah} (POST terkirim ${post}×)`);
      harap(html >= 1, 'respons tantangan HTML tidak teramati (simulasi tidak aktif?)');
      harap(!m.masalah.length, m.masalah.join('\n'));
      return `POST terkirim ${post}× (1 ditantang + 1 ulang), respons HTML tantangan ${html}, tercatat 1`;
    });

    await cek(`TAU-E4-${namaB}`, `${namaB}: tantangan tidak bisa diselesaikan (set=rusak) → pesan "Muat ulang", data tidak berubah`, async () => {
      const { ctx, page } = await baru();
      await masukApi(ctx);
      await page.goto(`/keranjang.html?po=${po.id}&customer=${c2.id}`);
      await page.getByRole('heading', { level: 1, name: c2.nama }).waitFor();
      const k0 = await a.ok('GET', `/open-po/${po.id}/keranjang/${c2.id}`);
      let pesan = null;
      try {
        await modeTantangan('rusak');
        await page.getByRole('button', { name: 'Catat pembayaran' }).click();
        const s = page.getByRole('dialog', { name: 'Catat pembayaran' });
        await s.getByLabel('Nominal').fill('1000');
        await s.getByRole('button', { name: 'Simpan Rp1.000' }).click();
        const b = s.locator('[data-banner-form] [role=alert]');
        await b.waitFor({ timeout: 40000 });
        pesan = (await b.innerText()).trim();
        await foto(page, `tautan/${namaB}-E4-rusak`);
      } finally {
        await modeTantangan('off');
      }
      const k1 = await a.ok('GET', `/open-po/${po.id}/keranjang/${c2.id}`);
      await ctx.close();
      harap(pesan === 'Koneksi ke server perlu diperbarui. Muat ulang halaman, lalu coba lagi.', `banner: ${pesan}`);
      harap(k1.riwayat.length === k0.riwayat.length, 'pembayaran tercatat walau tantangan gagal');
      return pesan;
    });

    // ---------- F ----------
    await cek(`TAU-F-${namaB}`, `${namaB}: regresi QA-A-01 — setelah login dari next=/..//evil.example/… tetap di origin aplikasi`, async () => {
      const hasil = [];
      for (const payload of ['/..//evil.example/index.html', '/.//evil.example/index.html', '/%2e%2e//evil.example/po.html']) {
        const { ctx, page } = await baru();
        const dicegat = [];
        await ctx.route((u) => u.hostname === 'evil.example', (route) => {
          dicegat.push(route.request().url());
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>HALAMAN PENYERANG</h1>' });
        });
        await page.goto(`/login.html?next=${encodeURIComponent(payload)}`);
        await page.fill('#nama-pengguna', process.env.ADMIN_USER);
        await page.fill('#kata-sandi', process.env.ADMIN_PASSWORD);
        await page.click('#tombol-masuk');
        await page.waitForURL((u) => !u.pathname.endsWith('/login.html'), { timeout: 10000 }).catch(() => {});
        await tidur(500);
        const url = page.url();
        if (dicegat.length) await foto(page, `tautan/${namaB}-F-open-redirect`);
        hasil.push({ payload, url, dicegat: dicegat.length });
        await ctx.close();
      }
      const lolos = hasil.filter((h) => h.dicegat || new URL(h.url).origin !== new URL(APP_URL).origin);
      harap(!lolos.length, lolos.map((h) => `${h.payload} → ${h.url}`).join('\n'));
    });

    // ---------- G ----------
    await cek(`TAU-G-${namaB}`, `${namaB}: tombol kembali browser saat sheet "Tambah barang" berisi isian (catat perilaku)`, async () => {
      const { ctx, page } = await baru({ w: 390, h: 844 });
      await masukApi(ctx);
      await page.goto(`/po.html?id=${po.id}`);
      await page.locator(`#daftar-customer [data-customer-id="${c2.id}"]`).filter({ visible: true }).first().click();
      await page.getByRole('heading', { level: 1, name: c2.nama }).waitFor();
      await page.locator('#tambah-barang').click();
      const s = page.getByRole('dialog', { name: 'Tambah barang' });
      await s.getByLabel('Nama barang', { exact: true }).fill('Barang belum disimpan');
      await s.getByLabel('Harga (AUD)', { exact: true }).fill('10');
      let dialogJs = 0;
      page.on('dialog', (d) => {
        dialogJs += 1;
        d.dismiss();
      });
      await page.goBack();
      await tidur(800);
      const url = new URL(page.url());
      const masihSheet = await page.getByRole('dialog', { name: 'Tambah barang' }).count();
      await ctx.close();
      return `kembali → ${url.pathname}${url.search}; sheet ${masihSheet ? 'masih terbuka' : 'hilang'}; konfirmasi ${dialogJs ? 'muncul' : 'tidak ada'}; isian ${masihSheet ? 'tetap' : 'hilang tanpa "Tutup tanpa menyimpan?"'}`;
    });
  });
}

process.exitCode = selesai('tautan');
