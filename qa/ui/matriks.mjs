// Bagian B §1: matriks browser × layar untuk alur utama + data panjang.
// Untuk setiap browser (chromium = Chrome/Edge, webkit = pendekatan Safari, firefox) × lebar layar
// (320, 360, 390, 768, 1024, 1440) alur ini dijalankan lewat UI:
//   login → Open PO (otomatis / manual bergantian) → customer baru dari sheet → barang A/B/C dengan
//   pratinjau → DP → pelunasan → Kosong → pengembalian dana → hapus pembayaran (dialog diblokir) →
//   hapus pengembalian + pembayaran → salin rekap → detail PO → pengaturan → keluar.
// Di setiap state layar diperiksa: scroll horizontal, elemen keluar layar / teks meluber, elemen
// interaktif bertumpuk, elemen yang tetap tertutup sticky bar / FAB / toast, target sentuh < 44 px
// (layar < 768), sheet/dialog muat di layar pendek dan bisa di-scroll sampai tombol terakhir,
// inputmode keyboard. Lalu data panjang (nama PO 100, customer 100, barang 150 karakter tanpa spasi,
// angka sampai Rp199.800.000.000.000) di semua layar.
// Hasil: qa/hasil/matriks.json + qa/hasil/matriks-detail.json; screenshot docs/qa/screenshots/matriks/.
import { writeFileSync } from 'node:fs';
import { Klien, kursManual, noWaUnik } from '../lib/klien.mjs';
import { bagian, cek, harap, selesai } from '../lib/uji.mjs';
import {
  BROWSER, LAYAR, audit, foto, luncurkan, masukApi, masukUi, pantau, profil, temuanAudit, tidur,
} from '../lib/browser.mjs';

const TUNGGU = 15000;
const FOTO_RINGKAS = ['beranda', 'po-detail', 'keranjang', 'sheet-barang', 'keranjang-panjang'];

// ---------- Data panjang (lewat API, sesudah fase alur supaya tidak mengganggu beranda) ----------
const a = new Klien();
await a.login();
const ulang = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
const PANJANG = {
  po: ulang('POAustraliaNovember2026Spesial', 100),
  customer: ulang('RinaWulandariSetiawati', 100),
  barang1: ulang('TasKulitAsliAustraliaEdisiTerbatas', 150),
  barang2: ulang('Sepatu lari edisi terbatas warna hijau tosca ukuran 42 ', 150).trim(),
  alamat: ulang('Jl. Melati Indah No. 123 RT 04 RW 05, Kel. Sukamaju, Kec. Sukajaya, Kota Bandung 40123. ', 500).trim(),
};
let poP;
let cP;
let cE;
async function seedPanjang() {
  // PO 100 karakter tanpa spasi, kurs manual maksimum Rp1.000.000.
  poP = await a.ok('POST', '/open-po', { nama: PANJANG.po, kurs: kursManual(1000000) });
  // Customer 100 karakter tanpa spasi, alamat 500, no WA 14 digit. Total tepat Rp1.000.000.000.000.
  cP = await a.ok('POST', '/customer', { nama: PANJANG.customer, no_wa: '08123456789012', alamat: PANJANG.alamat });
  const base = `/open-po/${poP.id}/keranjang/${cP.id}`;
  await a.ok('POST', `${base}/baris-pesanan`, { nama_barang: PANJANG.barang1, harga_aud: '100000', qty: 10, markup_persen: '0' });
  await a.ok('POST', `${base}/baris-pesanan`, { nama_barang: PANJANG.barang2, harga_aud: '0,01', qty: 1, markup_persen: '0' });
  const k = await a.ok('GET', base);
  await a.ok('POST', `${base}/pembayaran`, { nominal: 1000000, tanggal: '2026-10-28' });
  // Ekstrem: batas maksimum server (AUD 100.000 × Rp1.000.000 × 200% × 999 = Rp199.800.000.000.000).
  cE = await a.ok('POST', '/customer', { nama: 'Ekstrem', no_wa: noWaUnik() });
  await a.ok('POST', `/open-po/${poP.id}/keranjang/${cE.id}/baris-pesanan`, { nama_barang: 'Barang maksimum', harga_aud: '100000', qty: 999, markup_persen: '100' });
  await a.ok('POST', `/open-po/${poP.id}/keranjang/${cE.id}/pembayaran`, { nominal: 1000000000000, tanggal: '2026-10-28' });
  const kE = await a.ok('GET', `/open-po/${poP.id}/keranjang/${cE.id}`);
  console.log(`data panjang: PO ${poP.id}, customer ${cP.id} total ${k.ringkasan.total}, ekstrem ${cE.id} total ${kE.ringkasan.total}`);
}

// ---------- Pembantu ----------
const detail = [];
const mobileW = (l) => l.w < 768;
const lgW = (l) => l.w >= 1024;

async function tutupToast(page) {
  for (const t of await page.locator('[data-toast] button[aria-label="Tutup pesan"]').all()) await t.click({ timeout: 2000 }).catch(() => {});
}

async function tungguToast(page, teks) {
  const t = page.locator('[data-toast]').filter({ hasText: teks });
  await t.first().waitFor({ state: 'visible', timeout: TUNGGU });
}

/** Toast tidak boleh menutupi bar tetap (sticky bar, FAB, bottom nav) atau tombol di dialog. */
async function auditToast(page) {
  return page.evaluate(() => {
    const t = document.querySelector('[data-toast]');
    if (!t) return [];
    const rt = t.getBoundingClientRect();
    const masalah = [];
    if (rt.left < -1 || rt.right > document.documentElement.clientWidth + 1) masalah.push(`toast keluar layar ${Math.round(rt.left)}–${Math.round(rt.right)}`);
    for (const el of document.querySelectorAll('[data-bottom-nav], [data-fab], [data-sticky-bar], dialog[open] button, dialog[open] input')) {
      if (el.closest('[data-toast]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || !el.checkVisibility()) continue;
      const x = Math.min(r.right, rt.right) - Math.max(r.left, rt.left);
      const y = Math.min(r.bottom, rt.bottom) - Math.max(r.top, rt.top);
      if (x > 2 && y > 2) masalah.push(`toast menutupi ${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.id).trim().slice(0, 40)}"`);
    }
    return masalah;
  });
}

/** Atribut keyboard field (ui-spec §12.2). */
async function cekInputmode(page, harapan) {
  const salah = [];
  for (const [label, attr] of Object.entries(harapan)) {
    const el = page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
    if (!(await el.count())) {
      salah.push(`${label}: tidak ditemukan`);
      continue;
    }
    for (const [k, v] of Object.entries(attr)) {
      const nyata = await el.getAttribute(k);
      if (nyata !== v) salah.push(`${label}: ${k}=${nyata} (harap ${v})`);
    }
  }
  return salah;
}

// ---------- Satu kombinasi ----------
const catatanPer = new Map();
async function kombinasi(browser, namaBrowser, layar, fase) {
  const kunci = `${namaBrowser}-${layar.w}`;
  const sentuh = layar.w < 1024; // 768 = tablet: dicatat sebagai info (ui-spec: chip/aksi 36 px di md)
  if (!catatanPer.has(kunci)) {
    const baru = { kunci, state: [], inputmode: [], toast: [], langkah: null, error: null, salin: null, info: [], masalah: [], csp: [], dialogJs: [] };
    catatanPer.set(kunci, baru);
    detail.push(baru);
  }
  const catatan = catatanPer.get(kunci);
  const ctx = await browser.newContext(profil(namaBrowser, layar));
  if (namaBrowser === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: process.env.APP_URL });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TUNGGU);
  const m = pantau(page);
  const langkah = (n) => {
    catatan.langkah = n;
  };
  const periksa = async (state, { panjang = false, fotoNama = null, opsi = {} } = {}) => {
    await tutupToast(page);
    await tidur(250); // animasi sheet/dialog 150–200 ms
    const hasil = await audit(page, { sentuh, ...opsi });
    const temuan = temuanAudit(hasil);
    catatan.state.push({ state, panjang, temuan, elipsis: hasil.elipsis, modal: hasil.modal });
    if (fotoNama && FOTO_RINGKAS.includes(fotoNama)) await foto(page, `matriks/${kunci}-${fotoNama}`);
    if (temuan.length) await foto(page, `matriks/temuan/${kunci}-${state}`);
    return hasil;
  };
  const cekToast = async (awalan = '') => {
    const t1 = await auditToast(page);
    if (!t1.length) return;
    await tidur(400);
    const t2 = await auditToast(page);
    if (t2.length) {
      catatan.toast.push(...t2.map((x) => `${awalan}${x}`));
      await foto(page, `matriks/temuan/${kunci}-toast-${catatan.langkah.replace(/\W+/g, '-')}`);
    } else catatan.info.push(`toast sempat menutupi (< 400 ms): ${t1.join(', ')}`);
  };
  /** Aksi baris barang: ActionSheet (< lg) atau tombol langsung di baris (lg). */
  const aksiBaris = async (namaBarang, aksi, stateAudit = null) => {
    if (lgW(layar)) {
      await page.getByRole('button', { name: `${aksi} ${namaBarang}`, exact: true }).click();
      return;
    }
    await page.locator('#daftar-barang button:visible', { hasText: namaBarang }).click();
    const as = page.getByRole('dialog', { name: namaBarang });
    await as.waitFor();
    if (stateAudit) await periksa(stateAudit);
    await as.getByRole('button', { name: new RegExp(`^${aksi}`) }).click();
    await as.waitFor({ state: 'detached' });
  };
  const sfx = `${namaBrowser[0]}${layar.w}`;
  const namaPo = `Open PO ${sfx} Nov 2026`;
  const namaCust = `Rina ${sfx}`;
  const wa = noWaUnik();
  const manual = LAYAR.indexOf(layar) % 2 === 1;

  if (fase === 'alur') try {
    langkah('login');
    await page.goto('/login.html');
    await page.locator('#nama-pengguna').waitFor();
    await periksa('login');
    await masukUi(page);
    await page.locator('#daftar-po > *').first().waitFor();
    await periksa('beranda', { fotoNama: 'beranda' });

    langkah('buat Open PO');
    await page.locator(mobileW(layar) ? 'a[data-fab]' : 'header a[href="po-form.html"]:visible').first().click();
    await page.locator('#panel-otomatis [data-kurs-jastip="13054"]').waitFor();
    await page.getByLabel('Nama Open PO').fill(namaPo);
    await periksa('po-form-otomatis');
    await page.locator('label', { hasText: 'Manual' }).filter({ visible: true }).first().click();
    catatan.inputmode.push(...(await cekInputmode(page, { 'Kurs jastip (Rp per 1 AUD)': { inputmode: 'numeric', type: 'text' } })));
    await periksa('po-form-manual');
    if (!manual) await page.locator('label', { hasText: 'Otomatis' }).filter({ visible: true }).first().click();
    else await page.getByLabel('Kurs jastip (Rp per 1 AUD)').fill('13054');
    await page.getByRole('button', { name: 'Simpan Open PO' }).click();
    await page.waitForURL(/\/po\.html\?id=\d+$/);
    const idPo = Number(new URL(page.url()).searchParams.get('id'));
    await tungguToast(page, 'Open PO dibuat.');
    await cekToast();
    await page.getByText('Belum ada customer di Open PO ini.').waitFor();
    await periksa('po-detail-kosong');

    langkah('tambah customer dari sheet');
    await page.locator(mobileW(layar) ? '#fab-customer' : '#tambah-customer-header').click();
    const sheetC = page.getByRole('dialog', { name: 'Tambah customer' });
    await sheetC.getByRole('list').first().waitFor();
    await sheetC.getByLabel('Cari nama atau no WA').fill(namaCust);
    const tBaru = sheetC.getByRole('button', { name: `+ Buat customer baru "${namaCust}"` });
    await tBaru.waitFor();
    await sheetC.getByText(`Tidak ada customer dengan nama atau no WA "${namaCust}".`).waitFor();
    await periksa('sheet-tambah-customer');
    await tBaru.click();
    const sheetBaru = page.getByRole('dialog', { name: 'Customer baru' });
    await sheetBaru.getByLabel('No WA').fill(wa);
    catatan.inputmode.push(...(await cekInputmode(page, { 'No WA': { type: 'tel' } })));
    await periksa('sheet-customer-baru');
    await sheetBaru.getByRole('button', { name: 'Simpan & buka keranjang' }).click();
    await page.waitForURL(/\/keranjang\.html\?po=\d+&customer=\d+$/);
    const idC = Number(new URL(page.url()).searchParams.get('customer'));
    await page.getByText(`Belum ada barang untuk ${namaCust}.`).waitFor();
    await periksa('keranjang-kosong');

    langkah('barang A/B/C');
    let form;
    if (lgW(layar)) {
      form = page.locator('#kartu-form-barang');
    } else {
      await page.locator('#tambah-barang').click();
      form = page.getByRole('dialog', { name: 'Tambah barang' });
      await form.waitFor();
    }
    const f = {
      nama: form.getByLabel('Nama barang', { exact: true }),
      harga: form.getByLabel('Harga (AUD)', { exact: true }),
      qty: form.getByLabel('Qty', { exact: true }),
      markup: form.getByLabel('Markup', { exact: true }),
    };
    catatan.inputmode.push(...(await cekInputmode(page, {
      'Harga (AUD)': { inputmode: 'decimal', type: 'text' }, Qty: { inputmode: 'numeric', type: 'text' }, Markup: { inputmode: 'decimal', type: 'text' },
    })));
    await f.nama.fill('Barang A');
    await f.harga.fill('24,95');
    await form.getByRole('button', { name: 'Tambah qty' }).click();
    await form.locator('[data-pratinjau="terisi"]').waitFor();
    harap((await form.locator('[data-pratinjau]').textContent()).includes('Rp718.000'), 'pratinjau A bukan Rp718.000');
    await form.getByRole('button', { name: 'Rincian hitungan' }).click();
    await periksa('sheet-barang', { fotoNama: 'sheet-barang' });
    if (layar.h <= 640 && !lgW(layar)) {
      // "Keyboard terbuka" (ui-spec §11.1, §12.6): tinggi layar dikurangi ±280 px, fokus di Markup.
      await page.setViewportSize({ width: layar.w, height: layar.h - 280 });
      await f.markup.focus();
      await tidur(200);
      const lihat = await form.evaluate((el) => {
        const vh = window.innerHeight;
        const di = (e) => {
          const r = e.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= vh;
        };
        const markup = el.querySelector('input[inputmode="decimal"]:last-of-type');
        const inputs = [...el.querySelectorAll('input')];
        const mk = inputs.find((i) => i.id.endsWith('-markup'));
        const pr = el.querySelector('[data-pratinjau] dl');
        return { markup: mk ? di(mk) : null, pratinjau: pr ? di(pr) : null, vh, x: Boolean(markup) };
      });
      catatan.info.push(`keyboard ±280px (${layar.w}×${layar.h - 280}), fokus Markup: Markup terlihat=${lihat.markup}, angka pratinjau terlihat=${lihat.pratinjau}`);
      if (!lihat.markup) catatan.state.push({ state: 'sheet-barang-keyboard', panjang: false, temuan: ['modal: Markup tidak terlihat saat keyboard terbuka'] });
      await page.setViewportSize({ width: layar.w, height: layar.h });
    }
    await form.getByRole('button', { name: 'Simpan & tambah lagi' }).click();
    await tungguToast(page, 'Barang A disimpan.');
    await cekToast();
    await f.nama.fill('Barang B');
    await f.harga.fill('8,50');
    await f.qty.fill('3');
    await f.markup.fill('15');
    await form.getByRole('button', { name: 'Simpan & tambah lagi' }).click();
    await tungguToast(page, 'Barang B disimpan.');
    await f.nama.fill('Barang C');
    await f.harga.fill('129,99');
    await f.markup.fill('8');
    await form.locator('[data-pratinjau="terisi"]').waitFor();
    await f.markup.press('Enter');
    await tungguToast(page, 'Barang C disimpan.');
    if (!lgW(layar)) await page.getByRole('dialog', { name: 'Tambah barang' }).waitFor({ state: 'detached' });
    await cekToast();
    await page.getByRole('heading', { name: 'Barang (3)' }).waitFor();
    await periksa('keranjang-belum-bayar');

    langkah('bayar DP');
    const ringkasan = page.locator('[data-ringkasan-keranjang]');
    await page.getByRole('button', { name: 'Catat pembayaran' }).click();
    let bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
    await bayar.waitFor();
    catatan.inputmode.push(...(await cekInputmode(page, { Nominal: { inputmode: 'numeric', type: 'text' } })));
    await bayar.getByRole('button', { name: 'Isi DP Rp1.468.000' }).click();
    await bayar.getByLabel('Tanggal').fill('2026-10-28');
    await periksa('sheet-pembayaran');
    await bayar.getByRole('button', { name: 'Simpan Rp1.468.000' }).click();
    await tungguToast(page, 'Pembayaran Rp1.468.000 dicatat.');
    await ringkasan.and(page.locator('[data-ringkasan-keranjang="dp"]')).waitFor();

    langkah('pelunasan');
    await page.getByRole('button', { name: 'Catat pembayaran' }).click();
    bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
    await bayar.getByLabel('Nominal').fill('1467000');
    await bayar.getByLabel('Tanggal').fill('2026-10-30');
    await bayar.getByRole('button', { name: 'Simpan Rp1.467.000' }).click();
    await tungguToast(page, 'Pembayaran Rp1.467.000 dicatat.');
    await page.locator('[data-ringkasan-keranjang="lunas"]').waitFor();

    langkah('tandai Kosong');
    await aksiBaris('Barang B', 'Tandai Kosong', 'actionsheet');
    await tungguToast(page, 'Barang B ditandai Kosong. Status: Lebih bayar.');
    await cekToast();
    await page.locator('[data-ringkasan-keranjang="lebih_bayar"]').waitFor();
    await periksa('keranjang-lebih-bayar');
    // Barang C juga Kosong → kelebihan Rp2.217.000, lebih besar dari tiap pembayaran, supaya
    // hapus pembayaran nanti diblokir (scope: Σ pembayaran < Σ pengembalian).
    await aksiBaris('Barang C', 'Tandai Kosong');
    await tungguToast(page, 'Barang C ditandai Kosong.');

    langkah('pengembalian dana');
    await page.locator('[data-ringkasan-keranjang]').getByRole('button', { name: 'Catat pengembalian dana' }).click();
    const kembali = page.getByRole('dialog', { name: 'Catat pengembalian dana' });
    await kembali.waitFor();
    await kembali.getByRole('button', { name: 'Isi Rp2.217.000' }).click();
    await kembali.getByLabel('Tanggal').fill('2026-10-31');
    await kembali.getByLabel('Catatan (opsional)').fill('transfer BCA 31 Okt');
    await periksa('sheet-pengembalian');
    await kembali.getByRole('button', { name: 'Simpan Rp2.217.000' }).click();
    await tungguToast(page, 'Pengembalian dana Rp2.217.000 dicatat.');
    await page.locator('[data-ringkasan-keranjang="lunas"]').waitFor();

    langkah('hapus pembayaran diblokir');
    await page.getByRole('button', { name: 'Hapus pembayaran Rp1.468.000, 28 Okt 2026' }).click();
    const info = page.getByRole('dialog', { name: 'Hapus pengembalian dana dulu' });
    await info.waitFor();
    await periksa('dialog-hapus-pengembalian-dulu');
    await info.getByRole('button', { name: 'Mengerti' }).click();
    await info.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Hapus pengembalian dana Rp2.217.000, 31 Okt 2026' }).click();
    const dK = page.getByRole('alertdialog', { name: 'Hapus pengembalian dana Rp2.217.000?' });
    await dK.waitFor();
    await periksa('dialog-hapus-pengembalian');
    await dK.getByRole('button', { name: 'Hapus', exact: true }).click();
    await tungguToast(page, 'Pengembalian dana Rp2.217.000 dihapus. Status: Lebih bayar.');
    await page.getByRole('button', { name: 'Hapus pembayaran Rp1.467.000, 30 Okt 2026' }).click();
    const dB = page.getByRole('alertdialog', { name: 'Hapus pembayaran Rp1.467.000?' });
    await dB.getByRole('button', { name: 'Hapus pembayaran' }).click();
    await tungguToast(page, 'Pembayaran Rp1.467.000 dihapus.');
    await aksiBaris('Barang C', 'Lepas tanda Kosong');
    await tungguToast(page, 'Tanda Kosong Barang C dilepas. Status: DP.');
    await page.locator('[data-ringkasan-keranjang="dp"]').waitFor();

    langkah('salin rekap');
    const tSalin = page.locator('[data-salin-rekap]:visible');
    await tSalin.click();
    const tersalin = page.locator('[data-salin-rekap][data-tersalin]');
    const manualSheet = page.getByRole('dialog', { name: 'Salin manual' });
    await tersalin.or(manualSheet).first().waitFor({ timeout: TUNGGU });
    if (await manualSheet.count()) {
      const teks = await manualSheet.locator('textarea').inputValue();
      catatan.salin = `Sheet "Salin manual" (${teks.split('\n').length} baris)`;
      await periksa('sheet-salin-manual');
      await page.keyboard.press('Escape');
      await manualSheet.waitFor({ state: 'detached' });
    } else {
      await tungguToast(page, `Rekap ${namaCust} tersalin. Tempel di chat WA.`);
      await cekToast();
      let isiClip = null;
      if (namaBrowser === 'chromium') isiClip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `gagal baca: ${e.message}`);
      catatan.salin = `Tersalin${isiClip ? ` (${isiClip.split('\n')[0]})` : ''}`;
    }
    await periksa('keranjang', { fotoNama: 'keranjang' });

    langkah('detail PO');
    await page.getByRole('link', { name: 'Kembali', exact: true }).click();
    await page.waitForURL(new RegExp(`/po\\.html\\?id=${idPo}`));
    await page.locator(`[data-customer-id="${idC}"]`).filter({ visible: true }).first().waitFor();
    await periksa('po-detail', { fotoNama: 'po-detail' });

    langkah('pengaturan');
    await page.getByRole('link', { name: 'Kembali', exact: true }).click();
    await page.waitForURL((u) => /\/(index\.html)?$/.test(u.pathname));
    await page.locator('nav[aria-label="Navigasi utama"] a[data-nav="pengaturan"]').filter({ visible: true }).click();
    await page.waitForURL(/pengaturan\.html/);
    await page.getByLabel('Default markup').waitFor();
    catatan.inputmode.push(...(await cekInputmode(page, {
      'Default markup': { inputmode: 'decimal', type: 'text' }, 'Buffer kurs AUD': { inputmode: 'decimal', type: 'text' }, DP: { inputmode: 'decimal', type: 'text' },
    })));
    await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
    await tungguToast(page, 'Pengaturan disimpan.');
    await cekToast();
    await periksa('pengaturan', { fotoNama: 'pengaturan' });

    langkah('customer');
    await page.locator('nav[aria-label="Navigasi utama"] a[data-nav="customer"]').filter({ visible: true }).click();
    await page.waitForURL(/customer\.html/);
    await page.locator('#daftar [data-customer-id]').filter({ visible: true }).first().waitFor();
    await periksa('customer-list');

    langkah('keluar');
    await page.locator('nav[aria-label="Navigasi utama"] a[data-nav="pengaturan"]').filter({ visible: true }).click();
    await page.getByLabel('Default markup').waitFor();
    await page.locator('[data-keluar]:visible').click();
    await page.waitForURL(/login\.html/);
    catatan.alur = true;
  } catch (e) {
    catatan.error = `${catatan.langkah}: ${e.message.split('\n').slice(0, 3).join(' ').slice(0, 400)}`;
    await foto(page, `matriks/temuan/${kunci}-gagal-${catatan.langkah.replace(/\W+/g, '-')}`);
  }

  // ---------- Data panjang ----------
  if (fase === 'panjang') try {
    langkah('panjang: login');
    await masukApi(ctx);
    langkah('panjang: beranda');
    await page.goto('/');
    await page.locator(`[data-po-id="${poP.id}"]`).waitFor();
    await periksa('beranda-panjang', { panjang: true });
    langkah('panjang: detail PO');
    await page.goto(`/po.html?id=${poP.id}`);
    await page.locator(`[data-customer-id="${cP.id}"]`).filter({ visible: true }).first().waitFor();
    await periksa('po-detail-panjang', { panjang: true });
    langkah('panjang: keranjang');
    await page.goto(`/keranjang.html?po=${poP.id}&customer=${cP.id}`);
    await page.getByRole('heading', { name: 'Barang (2)' }).waitFor();
    await periksa('keranjang-panjang', { panjang: true, fotoNama: 'keranjang-panjang' });
    langkah('panjang: keranjang ekstrem');
    await page.goto(`/keranjang.html?po=${poP.id}&customer=${cE.id}`);
    await page.getByRole('heading', { name: 'Barang (1)' }).waitFor();
    await periksa('keranjang-ekstrem', { panjang: true });
    await page.goto(`/keranjang.html?po=${poP.id}&customer=${cP.id}`);
    await page.getByRole('heading', { name: 'Barang (2)' }).waitFor();
    langkah('panjang: sheet pembayaran');
    await page.locator('[data-ringkasan-keranjang]').getByRole('button', { name: 'Catat pembayaran' }).click();
    const bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
    await bayar.getByRole('button', { name: /^Isi sisa/ }).waitFor();
    await bayar.getByRole('button', { name: /^Isi sisa/ }).click();
    await periksa('sheet-pembayaran-panjang', { panjang: true });
    await page.keyboard.press('Escape');
    const tutupTanpa = page.getByRole('alertdialog', { name: 'Tutup tanpa menyimpan?' });
    await tutupTanpa.waitFor();
    await periksa('dialog-tutup-tanpa-menyimpan', { panjang: true });
    await tutupTanpa.getByRole('button', { name: 'Tutup' }).click();
    await bayar.waitFor({ state: 'detached' });
    langkah('panjang: aksi barang');
    if (lgW(layar)) {
      await page.getByRole('button', { name: `Hapus ${PANJANG.barang1}`, exact: true }).click();
    } else {
      await page.locator('#daftar-barang button:visible', { hasText: PANJANG.barang1 }).click();
      const as = page.getByRole('dialog', { name: PANJANG.barang1 });
      await as.waitFor();
      await periksa('actionsheet-panjang', { panjang: true });
      await as.getByRole('button', { name: 'Hapus' }).click();
    }
    const dH = page.getByRole('alertdialog', { name: `Hapus ${PANJANG.barang1}?` });
    await dH.waitFor();
    await periksa('dialog-hapus-panjang', { panjang: true });
    await dH.getByRole('button', { name: 'Batal' }).click();
    await dH.waitFor({ state: 'detached' });
    langkah('panjang: toast');
    if (lgW(layar)) await page.getByRole('button', { name: `Tandai Kosong ${PANJANG.barang1}`, exact: true }).click();
    else {
      await page.locator('#daftar-barang button:visible', { hasText: PANJANG.barang1 }).click();
      await page.getByRole('dialog', { name: PANJANG.barang1 }).getByRole('button', { name: /^Tandai Kosong/ }).click();
    }
    await tungguToast(page, 'ditandai Kosong');
    await cekToast('panjang: ');
    const rt = await page.locator('[data-toast]').boundingBox();
    if (rt && (rt.x < 0 || rt.x + rt.width > layar.w + 1)) catatan.toast.push(`panjang: toast ${Math.round(rt.x)}+${Math.round(rt.width)} melebihi ${layar.w}`);
    await foto(page, `matriks/temuan/${kunci}-toast-panjang`);
    // kembalikan
    await tutupToast(page);
    if (lgW(layar)) await page.getByRole('button', { name: `Lepas tanda Kosong ${PANJANG.barang1}`, exact: true }).click();
    else {
      await page.locator('#daftar-barang button:visible', { hasText: PANJANG.barang1 }).click();
      await page.getByRole('dialog', { name: PANJANG.barang1 }).getByRole('button', { name: 'Lepas tanda Kosong' }).click();
    }
    await tungguToast(page, 'dilepas');
    langkah('panjang: saran');
    let form;
    if (lgW(layar)) form = page.locator('#kartu-form-barang');
    else {
      await page.locator('#tambah-barang').click();
      form = page.getByRole('dialog', { name: 'Tambah barang' });
    }
    await form.getByLabel('Nama barang', { exact: true }).click();
    await form.getByLabel('Nama barang', { exact: true }).pressSequentially('Tas', { delay: 20 });
    await form.getByRole('listbox', { name: 'Saran nama barang' }).waitFor();
    await periksa('saran-panjang', { panjang: true, opsi: { cekTertutup: false } });
    await form.getByLabel('Nama barang', { exact: true }).fill('');
    if (!lgW(layar)) {
      await page.keyboard.press('Escape');
      await form.waitFor({ state: 'detached' });
    }
    langkah('panjang: customer');
    await page.goto(`/customer.html#q=${encodeURIComponent(PANJANG.customer.slice(0, 10))}`);
    await page.locator(`[data-customer-id="${cP.id}"]`).filter({ visible: true }).first().waitFor();
    await periksa('customer-list-panjang', { panjang: true });
    await page.goto(`/customer-form.html?id=${cP.id}`);
    await page.getByLabel('Nama', { exact: true }).waitFor();
    await page.locator('#tombol-arsip:not([hidden])').waitFor();
    await periksa('customer-form-panjang', { panjang: true });
    catatan.panjang = true;
  } catch (e) {
    catatan.errorPanjang = `${catatan.langkah}: ${e.message.split('\n').slice(0, 3).join(' ').slice(0, 400)}`;
    await foto(page, `matriks/temuan/${kunci}-gagal-${catatan.langkah.replace(/\W+/g, '-')}`);
  }
  catatan.masalah.push(...m.masalah.map((x) => `${fase}: ${x}`));
  catatan.csp.push(...m.csp);
  catatan.dialogJs.push(...m.dialog);
  await ctx.close();
  return catatan;
}

// ---------- Jalankan matriks ----------
const KATEGORI = [
  ['hscroll', /^scroll horizontal/],
  ['keluar-meluber', /^(keluar|terpotong):/],
  ['tumpang', /^tumpang:/],
  ['tertutup', /^tertutup:/],
  ['sentuh', /^kecil:/],
  ['modal', /^modal/],
];

const versi = {};
const durasi = {};
async function fase(nama) {
  for (const namaBrowser of BROWSER) {
    let browser;
    try {
      browser = await luncurkan(namaBrowser);
    } catch (e) {
      versi[namaBrowser] = { gagal: e.message.split('\n').slice(0, 3).join(' ') };
      continue;
    }
    versi[namaBrowser] = browser.version();
    for (const layar of LAYAR) {
      const t0 = Date.now();
      console.log(`  ${nama}: ${namaBrowser} ${layar.w}×${layar.h}`);
      await kombinasi(browser, namaBrowser, layar, nama);
      durasi[`${nama}-${namaBrowser}-${layar.w}`] = Math.round((Date.now() - t0) / 1000);
    }
    await browser.close();
  }
}

bagian('Fase 1: alur utama');
// Satu customer lama supaya sheet "Tambah customer" selalu mulai dari langkah cari
// (DB kosong = langsung ke langkah 2, ui-spec §7.5).
await a.ok('POST', '/customer', { nama: 'Rini Lama', no_wa: noWaUnik() });
await fase('alur');
bagian('Fase 2: data panjang');
await seedPanjang();
await fase('panjang');

bagian('Hasil per browser × layar');
for (const namaBrowser of BROWSER) {
  if (versi[namaBrowser]?.gagal) {
    await cek(`MTX-${namaBrowser}`, `${namaBrowser} bisa diluncurkan`, () => {
      throw new Error(versi[namaBrowser].gagal);
    });
    continue;
  }
  for (const layar of LAYAR) {
    const c = catatanPer.get(`${namaBrowser}-${layar.w}`);
    const label = `${namaBrowser} ${versi[namaBrowser]} ${layar.w}×${layar.h}`;
    const id = `MTX-${namaBrowser}-${layar.w}`;
    await cek(`${id}-alur`, `${label}: alur utama selesai lewat UI`, () => {
      harap(!c.error, c.error);
      return `${durasi[`alur-${namaBrowser}-${layar.w}`]} dtk; salin rekap: ${c.salin}${c.info.length ? `; ${c.info.join('; ')}` : ''}`;
    });
    await cek(`${id}-panjang`, `${label}: semua layar data panjang bisa dibuka dan dipakai`, () => harap(!c.errorPanjang, c.errorPanjang));
    for (const [kat, re] of KATEGORI) {
      for (const panjang of [false, true]) {
        if (kat === 'sentuh' && layar.w >= 1024) continue;
        const label2 = panjang ? 'data panjang' : 'alur';
        const st = c.state.filter((s) => s.panjang === panjang);
        const temuan = st.flatMap((s) => s.temuan.filter((t) => re.test(t)).map((t) => `[${s.state}] ${t}`));
        await cek(`${id}-${panjang ? 'panjang' : 'alur'}-${kat}`, `${label}: ${kat} (${label2}, ${st.length} state)`, () => {
          harap(st.length > 0, 'tidak ada state yang diperiksa');
          if (kat === 'sentuh' && !mobileW(layar)) return temuan.length ? `info tablet (tidak dinilai): ${temuan.join(' | ').slice(0, 900)}` : null;
          harap(!temuan.length, temuan.join('\n'));
        });
      }
    }
    await cek(`${id}-toast`, `${label}: toast tidak menutupi sticky bar / FAB / bottom nav / isi dialog, tidak keluar layar`, () => harap(!c.toast.length, [...new Set(c.toast)].join('\n')));
    await cek(`${id}-inputmode`, `${label}: inputmode / type keyboard sesuai ui-spec §12.2`, () => harap(!c.inputmode.length, [...new Set(c.inputmode)].join('; ')));
    await cek(`${id}-konsol`, `${label}: tanpa error JS, aset gagal, pelanggaran CSP, dialog JS`, () => {
      const semua = [...c.masalah, ...c.csp.map((x) => `CSP: ${x}`), ...c.dialogJs.map((x) => `dialog: ${x}`)];
      harap(!semua.length, [...new Set(semua)].slice(0, 10).join('\n'));
    });
  }
}

writeFileSync(new URL('../hasil/matriks-detail.json', import.meta.url), `${JSON.stringify({ waktu: new Date().toISOString(), detail }, null, 2)}\n`);
process.exitCode = selesai('matriks');
