// Bagian B §3: XSS di render UI. Payload di nama PO, nama/alamat customer, nama barang, catatan
// pengembalian dana; diperiksa di semua layar (daftar, detail + tabel desktop, keranjang, sheet,
// ActionSheet, dialog, toast, saran autocomplete, judul tab, peringatan no WA ganda, salin manual)
// di Chromium, WebKit, Firefox (390 dan 1280 px).
// Gagal jika: ada dialog JS, penanda global window.__xss terpasang (di frame mana pun), event
// securitypolicyviolation / pesan CSP (= ada upaya menyisipkan HTML yang diblokir CSP), elemen dari
// payload muncul di DOM (img[src=x], svg[onload], iframe[srcdoc], a[href^=javascript:]),
// atau teks tidak tampil apa adanya.
// Hasil: qa/hasil/xss.json
import { Klien } from '../lib/klien.mjs';
import { bagian, cek, harap, selesai } from '../lib/uji.mjs';
import { BROWSER, foto, luncurkan, masukApi, pantau, pasangPenangkapCsp, profil, tidur } from '../lib/browser.mjs';

const P = {
  script: '<script>window.__xss=1;alert(1)</script>',
  img: '<img src=x onerror="window.__xss=2;alert(2)">',
  svg: '"><svg onload="window.__xss=3;alert(3)">',
  js: 'javascript:window.__xss=4;alert(4)',
  iframe: '\'><iframe srcdoc="<script>parent.__xss=5</script>">',
  title: '</title><script>alert(6)</script>',
};
const a = new Klien();
await a.login();
const po = await a.ok('POST', '/open-po', { nama: `PO ${P.svg}`, kurs: { mode: 'manual', kurs_jastip: 13054 } });
const cust = [];
let i = 0;
for (const [k, v] of Object.entries(P)) {
  i += 1;
  const c = await a.ok('POST', '/customer', { nama: `${k} ${v}`.slice(0, 100), no_wa: `08129900${String(1000 + i)}`, alamat: `${P.img} ${P.js} ${P.script}` });
  cust.push(c);
}
const c0 = cust[0];
const base = `/open-po/${po.id}/keranjang/${c0.id}`;
await a.ok('POST', `${base}/baris-pesanan`, { nama_barang: `Tas ${P.img}`, harga_aud: '24,95', qty: 2, markup_persen: '10' });
await a.ok('POST', `${base}/baris-pesanan`, { nama_barang: `Sepatu ${P.script}`, harga_aud: '8,50', qty: 3, markup_persen: '15' });
await a.ok('POST', `${base}/baris-pesanan`, { nama_barang: P.svg, harga_aud: '1', qty: 1, markup_persen: '0' });
await a.ok('POST', `${base}/pembayaran`, { nominal: 1200000, tanggal: '2026-10-28' });
for (const c of cust.slice(1)) await a.ok('POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: `Kaos ${P.iframe}`, harga_aud: '5', qty: 1, markup_persen: '10' });
const k = await a.ok('GET', base);
const lebih = k.ringkasan.kelebihan_bayar;
if (lebih > 0) await a.ok('POST', `${base}/pengembalian-dana`, { nominal: Math.min(lebih, 1000), tanggal: '2026-10-29', catatan: `${P.img} ${P.js}` });

async function periksaHalaman(page, m, label) {
  await tidur(300);
  const dom = await page.evaluate(() => {
    const frames = [window, ...[...document.querySelectorAll('iframe')].map((f) => {
      try { return f.contentWindow; } catch { return null; }
    })].filter(Boolean);
    return {
      xss: frames.map((w) => { try { return w.__xss; } catch { return undefined; } }).filter((v) => v !== undefined),
      csp: window.__qaCsp ?? [],
      elemen: [
        ...document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload], iframe[srcdoc], a[href^="javascript:" i], script:not([src])'),
      ].map((e) => e.outerHTML.slice(0, 80)),
    };
  });
  const masalah = [];
  if (dom.xss.length) masalah.push(`penanda __xss=${dom.xss}`);
  if (dom.csp.length) masalah.push(`CSP event: ${dom.csp.join(' | ')}`);
  if (dom.elemen.length) masalah.push(`elemen payload di DOM: ${dom.elemen.join(' | ')}`);
  if (m.dialog.length) masalah.push(`dialog JS: ${m.dialog.join(' | ')}`);
  if (m.csp.length) masalah.push(`CSP console: ${m.csp.join(' | ')}`);
  if (m.masalah.length) masalah.push(...m.masalah);
  return masalah.map((x) => `[${label}] ${x}`);
}

const teksSama = async (loc, harapan, label, masalah) => {
  const t = (await loc.first().textContent())?.trim();
  if (!t?.includes(harapan)) masalah.push(`[${label}] teks tidak apa adanya: ${JSON.stringify(t?.slice(0, 120))}`);
};

for (const namaB of BROWSER) {
  bagian(`Browser ${namaB}`);
  let browser;
  try {
    browser = await luncurkan(namaB);
  } catch (e) {
    await cek(`XSS-${namaB}`, `${namaB} bisa diluncurkan`, () => {
      throw new Error(e.message.split('\n')[0]);
    });
    continue;
  }
  for (const layar of [{ w: 390, h: 844 }, { w: 1280, h: 800 }]) {
    const lg = layar.w >= 1024;
    const id = `XSS-${namaB}-${layar.w}`;
    const ctx = await browser.newContext(profil(namaB, layar));
    await pasangPenangkapCsp(ctx);
    // Salin rekap selalu lewat Sheet "Salin manual" (textarea) supaya teks rekap ikut diperiksa.
    await ctx.addInitScript(() => {
      const tolak = () => Promise.reject(new DOMException('ditolak uji', 'NotAllowedError'));
      if (navigator.clipboard) {
        navigator.clipboard.write = tolak;
        navigator.clipboard.writeText = tolak;
      }
    });
    await masukApi(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const m = pantau(page);
    const masalah = [];
    const langkah = [];
    const jalan = async (label, fn) => {
      try {
        await fn();
        masalah.push(...(await periksaHalaman(page, m, label)));
        langkah.push(label);
      } catch (e) {
        masalah.push(`[${label}] langkah gagal: ${e.message.split('\n')[0]}`);
        await foto(page, `xss/${namaB}-${layar.w}-${label}`);
      }
      m.reset();
    };

    await jalan('beranda', async () => {
      await page.goto('/');
      await page.locator(`[data-po-id="${po.id}"]`).waitFor();
      await teksSama(page.locator(`[data-po-id="${po.id}"]`), po.nama, 'beranda', masalah);
    });
    await jalan('detail PO', async () => {
      await page.goto(`/po.html?id=${po.id}`);
      await page.locator(`#daftar-customer [data-customer-id="${c0.id}"]`).filter({ visible: true }).first().waitFor();
      if ((await page.title()) !== `${po.nama} · Jastip Admin`) masalah.push(`[detail PO] document.title = ${JSON.stringify(await page.title())}`);
      await teksSama(page.locator('h1'), po.nama, 'detail h1', masalah);
      await teksSama(page.locator(`#daftar-customer [data-customer-id="${c0.id}"]`).filter({ visible: true }), c0.nama, `detail ${lg ? 'tabel' : 'daftar'}`, masalah);
    });
    await jalan('sheet tambah customer + cari', async () => {
      await page.locator(lg ? '#tambah-customer-header' : '#fab-customer').click();
      const s = page.getByRole('dialog', { name: 'Tambah customer' });
      await s.getByRole('list').first().waitFor();
      await s.getByLabel('Cari nama atau no WA').fill('img');
      await s.getByRole('list', { name: 'Hasil pencarian' }).waitFor();
      await s.getByLabel('Cari nama atau no WA').fill(P.svg);
      await s.getByRole('button', { name: /Buat customer baru/ }).filter({ hasText: 'svg' }).waitFor();
      await s.getByRole('button', { name: /Buat customer baru/ }).click();
      const b = page.getByRole('dialog', { name: 'Customer baru' });
      if ((await b.getByLabel('Nama').inputValue()) !== P.svg) masalah.push('[sheet customer baru] nama tidak terisi apa adanya');
      await b.getByLabel('No WA').fill(c0.no_wa_tampil);
      await b.getByLabel('Alamat (opsional)').click();
      await b.locator('[data-pakai-customer]').waitFor();
      await teksSama(b.locator('[data-peringatan-field]'), c0.nama, 'peringatan no WA ganda', masalah);
      await page.keyboard.press('Escape');
      const t = page.getByRole('alertdialog', { name: 'Tutup tanpa menyimpan?' });
      await t.getByRole('button', { name: 'Tutup' }).click();
    });
    await jalan('keranjang', async () => {
      await page.goto(`/keranjang.html?po=${po.id}&customer=${c0.id}`);
      await page.getByRole('heading', { name: 'Barang (3)' }).waitFor();
      const judulTab = await page.title();
      if (judulTab !== `${c0.nama} · ${po.nama} · Jastip Admin`) masalah.push(`[keranjang] document.title = ${JSON.stringify(judulTab)}`);
      await teksSama(page.locator('h1'), c0.nama, 'keranjang h1', masalah);
      await teksSama(page.locator('#subjudul'), po.nama, 'keranjang subjudul', masalah);
      await teksSama(page.locator('#daftar-barang li').first(), 'Tas <img src=x', 'baris barang', masalah);
      await teksSama(page.locator('#daftar-riwayat'), P.js, 'riwayat catatan', masalah);
    });
    await jalan('ActionSheet / dialog hapus barang', async () => {
      const nama = `Sepatu ${P.script}`;
      if (lg) await page.getByRole('button', { name: `Hapus ${nama}`, exact: true }).click();
      else {
        await page.locator('#daftar-barang button:visible', { hasText: 'Sepatu' }).click();
        const as = page.getByRole('dialog', { name: nama });
        await as.waitFor();
        await as.getByRole('button', { name: 'Hapus' }).click();
      }
      const d = page.getByRole('alertdialog', { name: `Hapus ${nama}?` });
      await d.waitFor();
      await d.getByRole('button', { name: 'Batal' }).click();
    });
    await jalan('toast Kosong', async () => {
      const nama = P.svg;
      if (lg) await page.getByRole('button', { name: `Tandai Kosong ${nama}`, exact: true }).click();
      else {
        await page.locator('#daftar-barang li').nth(2).locator('button:visible').first().click();
        await page.getByRole('dialog', { name: nama }).getByRole('button', { name: /^Tandai Kosong/ }).click();
      }
      await page.locator('[data-toast]').waitFor();
      await teksSama(page.locator('[data-toast]'), `${nama} ditandai Kosong.`, 'toast', masalah);
      await tidur(200);
      if (lg) await page.getByRole('button', { name: `Lepas tanda Kosong ${nama}`, exact: true }).click();
      else {
        await page.locator('[data-toast] button').click().catch(() => {});
        await page.locator('#daftar-barang li').nth(2).locator('button:visible').first().click();
        await page.getByRole('dialog', { name: nama }).getByRole('button', { name: 'Lepas tanda Kosong' }).click();
      }
      await page.locator('[data-toast]', { hasText: 'dilepas' }).waitFor();
    });
    await jalan('saran autocomplete', async () => {
      let form;
      if (lg) form = page.locator('#kartu-form-barang');
      else {
        await page.locator('[data-toast] button').click().catch(() => {});
        await page.locator('#tambah-barang').click();
        form = page.getByRole('dialog', { name: 'Tambah barang' });
      }
      const nama = form.getByLabel('Nama barang', { exact: true });
      await nama.click();
      await nama.pressSequentially('img', { delay: 30 });
      const l = form.getByRole('listbox', { name: 'Saran nama barang' });
      await l.waitFor();
      await teksSama(l, 'Tas <img src=x', 'saran', masalah);
      await nama.press('ArrowDown');
      await nama.press('Enter');
      if (!(await nama.inputValue()).includes('<img src=x')) masalah.push('[saran] nilai terpilih tidak apa adanya');
      await nama.fill('');
      await form.getByLabel('Harga (AUD)', { exact: true }).fill('');
      if (!lg) {
        await page.keyboard.press('Escape');
        await form.waitFor({ state: 'detached' });
      }
    });
    await jalan('salin manual (rekap)', async () => {
      await page.locator('[data-salin-rekap]:visible').click();
      const s = page.getByRole('dialog', { name: 'Salin manual' });
      await s.waitFor();
      const t = await s.locator('textarea').inputValue();
      if (!t.startsWith(`*REKAP JASTIP - ${po.nama}*`)) masalah.push(`[salin manual] baris pertama: ${t.split('\n')[0]}`);
      await page.keyboard.press('Escape');
    });
    await jalan('sheet pengembalian / pembayaran', async () => {
      await page.getByRole('button', { name: 'Catat pembayaran' }).first().click();
      await page.getByRole('dialog', { name: 'Catat pembayaran' }).waitFor();
      await page.keyboard.press('Escape');
    });
    await jalan('daftar customer + cari', async () => {
      await page.goto(`/customer.html#q=${encodeURIComponent('<')}`);
      await page.locator(`#daftar [data-customer-id="${c0.id}"]`).filter({ visible: true }).first().waitFor();
      await teksSama(page.locator(`#daftar [data-customer-id="${c0.id}"]`).filter({ visible: true }), c0.nama, `customer ${lg ? 'tabel' : 'daftar'}`, masalah);
      if (lg) await teksSama(page.locator(`#daftar tr[data-customer-id="${c0.id}"]`), P.js, 'kolom alamat', masalah);
      await page.goto(`/customer.html#q=${encodeURIComponent(P.iframe)}`);
      const buat = page.getByRole('link', { name: /^Buat customer/ });
      await buat.waitFor();
      await buat.click();
      await page.waitForURL(/customer-form\.html/);
      if ((await page.getByLabel('Nama', { exact: true }).inputValue()) !== P.iframe) masalah.push('[form customer prefill] nama tidak apa adanya');
    });
    await jalan('form customer + dialog arsip', async () => {
      await page.goto(`/customer-form.html?id=${c0.id}`);
      await page.locator('#tombol-arsip:not([hidden])').waitFor();
      if ((await page.title()) !== `${c0.nama} · Customer · Jastip Admin`) masalah.push(`[form customer] document.title = ${JSON.stringify(await page.title())}`);
      if ((await page.locator('#alamat').inputValue()) !== c0.alamat) masalah.push('[form customer] alamat tidak apa adanya');
      await page.locator('#tombol-arsip').click();
      const d = page.getByRole('alertdialog', { name: `Arsipkan ${c0.nama}?` });
      await d.waitFor();
      await teksSama(d, `${c0.nama} sudah punya pesanan`, 'dialog arsip', masalah);
      await d.getByRole('button', { name: 'Batal' }).click();
    });
    await jalan('form PO ubah', async () => {
      await page.goto(`/po-form.html?id=${po.id}`);
      await page.getByLabel('Nama Open PO').waitFor();
      if ((await page.getByLabel('Nama Open PO').inputValue()) !== po.nama) masalah.push('[form PO] nama tidak apa adanya');
    });

    await cek(id, `${namaB} ${layar.w}px: payload XSS tidak pernah dieksekusi atau menjadi HTML di ${langkah.length} layar/state`, () => {
      harap(!masalah.length, masalah.join('\n'));
      return langkah.join(', ');
    });
    await ctx.close();
  }
  await browser.close();
}

process.exitCode = selesai('xss');
