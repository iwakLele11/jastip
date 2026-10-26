// Hosting InfinityFree (paket gratis): simulasi "browser security system" di dev-router
// (/__dev/tantangan-mode) dan pengalihan http → https. Lihat README "Hosting InfinityFree".
// Mode tantangan bersifat global di server: selalu dimatikan di `finally`.
import {
  ADMIN_PASSWORD, ADMIN_USER, akhiran, apiJson, bacaClipboard, expect, foto, izinkanClipboard, masukLewatApi,
  pantauTantangan, setModeTantangan, test, toast,
} from './bantu.mjs';

const KURS_OTOMATIS = { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' };
const BARANG_A = { nama_barang: 'Barang A', harga_aud: '24,95', qty: 2, markup_persen: '10' }; // Rp718.000
const PESAN_MUAT_ULANG = 'Koneksi ke server perlu diperbarui. Muat ulang halaman, lalu coba lagi.';

const url = (p) => new URL(p, process.env.APP_URL).href;
const noWa = (testInfo, i) => `0813999${akhiran(testInfo) === 'M' ? '1' : '2'}${String(i).padStart(3, '0')}`;
const adaI = (u) => /[?&]i=\d+(&|$)/.test(new URL(u).search);
const daftarCustomer = (page, nama) => page.locator('#daftar-customer').getByText(nama).filter({ visible: true });

/** Open PO + customer + Barang A (+ pembayaran) lewat API, sebelum mode tantangan aktif. */
async function seed(request, testInfo, nama, customer) {
  const po = await apiJson(request, 'POST', '/open-po', { nama: `${nama} ${akhiran(testInfo)}`, kurs: KURS_OTOMATIS });
  const hasil = [];
  for (const [i, c] of customer.entries()) {
    const cust = await apiJson(request, 'POST', '/customer', { nama: `${c.nama} ${akhiran(testInfo)}`, no_wa: noWa(testInfo, c.wa ?? i) });
    await apiJson(request, 'POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, BARANG_A);
    if (c.bayar) await apiJson(request, 'POST', `/open-po/${po.id}/keranjang/${cust.id}/pembayaran`, { nominal: c.bayar, tanggal: '2026-10-28' });
    hasil.push(cust);
  }
  return { po, customer: hasil };
}

test('tantangan saat membuka halaman: selesai sendiri, ?i=N dibuang, next/filter/pesan/tautan tetap benar', async ({ page, request }, testInfo) => {
  // Data lewat context API terpisah (sesi sendiri); browser belum login.
  await request.post('/api/v1/auth/login', { data: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD } });
  const { po, customer: [lani] } = await seed(request, testInfo, 'Hosting halaman', [
    { nama: 'Lani', bayar: 718000, wa: 1 },
    { nama: 'Sari', wa: 2 },
  ]);
  const sfx = akhiran(testInfo);
  const jejak = pantauTantangan(page);
  const grup = page.getByRole('group', { name: 'Filter status' });
  const tujuan = `/po.html?id=${po.id}&status=lunas`;
  const halamanLogin = url(`/login.html?next=${encodeURIComponent(tujuan)}`);

  try {
    await setModeTantangan(page.request, 'on');

    // Tantangan top-level → ?i=1 → belum login → login.html?next=… (tanpa i).
    await page.goto(tujuan);
    await expect(page).toHaveURL(halamanLogin);
    expect(jejak.navigasi).toContain(url(`${tujuan}&i=1`));

    // Kunci diputar: halaman login dengan next ditantang lagi; i dibuang, next tetap.
    await setModeTantangan(page.request, 'putar');
    await page.reload();
    await expect(page).toHaveURL(halamanLogin);
    expect(jejak.navigasi).toContain(`${halamanLogin}&i=1`);
    await page.getByLabel('Nama pengguna').fill(ADMIN_USER);
    await page.getByLabel('Kata sandi', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Masuk' }).click();

    // Filter dari URL terbaca, chip menyimpan status di URL tanpa i.
    await expect(page).toHaveURL(url(tujuan));
    await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();
    await expect(grup.getByRole('radio', { name: 'Lunas 1' })).toBeChecked();
    await expect(daftarCustomer(page, `Lani ${sfx}`)).toBeVisible();
    await expect(daftarCustomer(page, `Sari ${sfx}`)).toHaveCount(0);
    await grup.getByText('Belum bayar').click();
    await expect(page).toHaveURL(url(`/po.html?id=${po.id}&status=belum_bayar`));
    await expect(daftarCustomer(page, `Sari ${sfx}`)).toBeVisible();

    // Toast lintas halaman (?pesan=) setelah tantangan: tampil, pesan dan i dibuang.
    await setModeTantangan(page.request, 'putar');
    await page.goto(`/po.html?id=${po.id}&pesan=po-dibuat`);
    await expect(toast(page)).toHaveText('Open PO dibuat.');
    await expect(page).toHaveURL(url(`/po.html?id=${po.id}`));
    expect(jejak.navigasi).toContain(url(`/po.html?id=${po.id}&pesan=po-dibuat&i=1`));
    await expect(grup.getByRole('radio', { name: 'Semua 2' })).toBeChecked();

    // Keranjang (po + customer dari URL) setelah tantangan; tautan Kembali dibangun dari URL.
    await setModeTantangan(page.request, 'putar');
    await page.locator('#daftar-customer').getByRole('link', { name: new RegExp(`Lani ${sfx}`) }).filter({ visible: true }).click();
    await expect(page).toHaveURL(url(`/keranjang.html?po=${po.id}&customer=${lani.id}`));
    await expect(page.getByRole('heading', { level: 1, name: `Lani ${sfx}` })).toBeVisible();
    await expect(page.locator('[data-ringkasan-keranjang]')).toHaveAttribute('data-ringkasan-keranjang', 'lunas');
    expect(jejak.navigasi).toContain(url(`/keranjang.html?po=${po.id}&customer=${lani.id}&i=1`));
    await expect(page.getByRole('link', { name: 'Kembali', exact: true })).toHaveAttribute('href', `po.html?id=${po.id}`);
    await page.getByRole('link', { name: 'Kembali', exact: true }).click();
    await expect(page).toHaveURL(url(`/po.html?id=${po.id}`));
    await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();

    // Halaman top-level tidak pernah memakai pemulihan iframe, dan URL akhir tidak pernah berisi i.
    expect(jejak.pemulihan).toBe(0);
    expect(jejak.api).toEqual([]);
    expect(adaI(page.url())).toBe(false);
  } finally {
    await setModeTantangan(page.request, 'off');
  }
});

test('kunci diputar saat halaman terbuka: GET dan POST dipulihkan tanpa terlihat, pembayaran tercatat tepat sekali', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const { po, customer: [bima] } = await seed(page.request, testInfo, 'Hosting putar', [
    { nama: 'Bima', wa: 3 },
    { nama: 'Cici', bayar: 718000, wa: 4 },
  ]);
  const jejak = pantauTantangan(page);
  const grup = page.getByRole('group', { name: 'Filter status' });
  const pathBayar = `/api/v1/open-po/${po.id}/keranjang/${bima.id}/pembayaran`;
  let postBayar = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === pathBayar) postBayar += 1;
  });

  try {
    await setModeTantangan(page.request, 'on');
    await page.goto(`/po.html?id=${po.id}`);
    await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();
    await expect(daftarCustomer(page, `Cici ${sfx}`)).toBeVisible();

    // GET (chip filter) setelah kunci diputar.
    await setModeTantangan(page.request, 'putar');
    await grup.getByText('Belum bayar').click();
    await expect(page).toHaveURL(url(`/po.html?id=${po.id}&status=belum_bayar`));
    await expect(daftarCustomer(page, `Cici ${sfx}`)).toHaveCount(0);
    await expect(daftarCustomer(page, `Bima ${sfx}`)).toBeVisible();
    await expect(page.locator('#banner-customer')).toBeHidden();
    expect(jejak.api).toEqual([`GET /api/v1/open-po/${po.id}/customer`]);
    expect(jejak.pemulihan).toBe(1);

    // POST (Catat pembayaran) setelah kunci diputar.
    await page.locator('#daftar-customer').getByRole('link', { name: new RegExp(`Bima ${sfx}`) }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: `Bima ${sfx}` })).toBeVisible();
    await setModeTantangan(page.request, 'putar');
    await page.getByRole('button', { name: 'Catat pembayaran' }).click();
    const bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
    await bayar.getByLabel('Nominal').fill('718000');
    await bayar.getByRole('button', { name: 'Simpan Rp718.000' }).click();
    await expect(toast(page)).toHaveText('Pembayaran Rp718.000 dicatat.');
    await expect(bayar).toHaveCount(0);
    await expect(page.locator('[data-ringkasan-keranjang]')).toHaveAttribute('data-ringkasan-keranjang', 'lunas');
    await expect(page.locator('[data-banner="error"]')).toHaveCount(0);
    expect(jejak.api).toContain(`POST ${pathBayar}`);
    expect(postBayar).toBe(2); // ditantang, lalu diulang satu kali
    expect(jejak.pemulihan).toBe(2);

    // Beberapa request bersamaan kena tantangan → satu pemulihan bersama.
    await setModeTantangan(page.request, 'putar');
    const jumlah = await page.evaluate(async () => {
      const { Api } = await import(document.querySelector('link[rel="modulepreload"][href*="lib/api.js"]').href);
      return (await Promise.all([Api.sesi(), Api.pengaturan(), Api.daftarOpenPo()])).length;
    });
    expect(jumlah).toBe(3);
    expect(jejak.api.filter((a) => a.startsWith('GET /api/v1/auth/sesi') || a.startsWith('GET /api/v1/pengaturan') || a === 'GET /api/v1/open-po')).toHaveLength(3);
    expect(jejak.pemulihan).toBe(3);
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(adaI(page.url())).toBe(false);
  } finally {
    await setModeTantangan(page.request, 'off');
  }

  const k = await apiJson(page.request, 'GET', `/open-po/${po.id}/keranjang/${bima.id}`);
  expect(k.riwayat.map((r) => [r.jenis, r.nominal])).toEqual([['pembayaran', 718000]]);
});

test('salin rekap WA setelah kunci diputar: ClipboardItem tetap terisi teks rekap', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await izinkanClipboard(page);
  const sfx = akhiran(testInfo);
  const { po, customer: [c] } = await seed(page.request, testInfo, 'Hosting rekap', [{ nama: 'Rara', wa: 5 }]);
  const { teks } = await apiJson(page.request, 'GET', `/open-po/${po.id}/keranjang/${c.id}/rekap`);
  const jejak = pantauTantangan(page);

  try {
    await setModeTantangan(page.request, 'on');
    await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
    await expect(page.getByRole('heading', { level: 1, name: `Rara ${sfx}` })).toBeVisible();
    await setModeTantangan(page.request, 'putar');
    const tombol = page.locator('[data-salin-rekap]:visible');
    await tombol.click();
    await expect(tombol).toHaveText('Tersalin');
    await expect(toast(page)).toHaveText(`Rekap Rara ${sfx} tersalin. Tempel di chat WA.`);
    expect(await bacaClipboard(page)).toBe(teks);
    expect(jejak.api).toEqual([`GET /api/v1/open-po/${po.id}/keranjang/${c.id}/rekap`]);
    expect(jejak.pemulihan).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Salin manual' })).toHaveCount(0);
  } finally {
    await setModeTantangan(page.request, 'off');
  }
});

test('tantangan tidak bisa diselesaikan: pesan PERLU_MUAT_ULANG, isi form tetap, tidak ada data tercatat', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await masukLewatApi(page);
  await izinkanClipboard(page);
  const sfx = akhiran(testInfo);
  const { po, customer: [c] } = await seed(page.request, testInfo, 'Hosting rusak', [{ nama: 'Dodi', wa: 6 }]);
  const jejak = pantauTantangan(page);
  const bannerHalaman = page.locator('[data-banner-halaman]');
  const tombolSalin = page.locator('[data-salin-rekap]:visible');

  try {
    await setModeTantangan(page.request, 'on');
    await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
    await expect(page.getByRole('heading', { level: 1, name: `Dodi ${sfx}` })).toBeVisible();
    await setModeTantangan(page.request, 'rusak');

    // Salin rekap (GET) lalu Catat pembayaran (POST) selagi pemulihan berjalan: satu pemulihan
    // bersama, keduanya gagal setelah ±15 detik.
    await tombolSalin.click();
    await expect(tombolSalin).toHaveText('Menyalin…');
    await page.getByRole('button', { name: 'Catat pembayaran' }).click();
    const bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
    await bayar.getByLabel('Nominal').fill('718000');
    await bayar.getByRole('button', { name: 'Simpan Rp718.000' }).click();
    await expect(bayar.getByRole('alert')).toHaveText(PESAN_MUAT_ULANG, { timeout: 25_000 });
    await expect(bayar.getByLabel('Nominal')).toHaveValue('718.000');
    await expect(bayar.getByRole('button', { name: 'Simpan Rp718.000' })).toBeEnabled();
    await foto(page, testInfo, 'hosting-perlu-muat-ulang', { fullPage: false });
    expect(jejak.pemulihan).toBe(1);
    await expect(page.locator('iframe')).toHaveCount(0);

    await bayar.getByRole('button', { name: 'Batal' }).click();
    await page.getByRole('alertdialog', { name: 'Tutup tanpa menyimpan?' }).getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(bayar).toHaveCount(0);
    await expect(bannerHalaman.getByRole('alert')).toContainText(PESAN_MUAT_ULANG);
    await expect(bannerHalaman.getByRole('button', { name: 'Muat ulang' })).toBeVisible();
    await expect(tombolSalin).toHaveText('Salin rekap WA');
    await expect(page.getByRole('dialog', { name: 'Salin manual' })).toHaveCount(0);
  } finally {
    await setModeTantangan(page.request, 'off');
  }

  // Tidak ada yang tercatat; "Muat ulang" memuat ulang halaman setelah hosting normal lagi.
  const k = await apiJson(page.request, 'GET', `/open-po/${po.id}/keranjang/${c.id}`);
  expect(k.riwayat).toEqual([]);
  await bannerHalaman.getByRole('button', { name: 'Muat ulang' }).click();
  await expect(bannerHalaman).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: `Dodi ${sfx}` })).toBeVisible();
  await expect(page.locator('[data-ringkasan-keranjang]')).toHaveAttribute('data-ringkasan-keranjang', 'belum_bayar');
});

test('http di host publik dialihkan ke https sebelum modul halaman mengirim request', async ({ page }) => {
  // Host publik palsu: semua request ke jastip.example (http dan https) dilayani dev-stack.
  const http = [];
  await page.route(/^https?:\/\/jastip\.example\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'http:') http.push(u.pathname);
    await route.fulfill({ response: await route.fetch({ url: url(u.pathname + u.search) }) });
  });
  await page.goto('http://jastip.example/po.html?id=1&i=1');
  // https, i dibuang; belum ada sesi di host ini → login dengan next.
  await expect(page).toHaveURL(`https://jastip.example/login.html?next=${encodeURIComponent('/po.html?id=1')}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Jastip Admin' })).toBeVisible();
  expect(http).toContain('/po.html');
  expect(http.filter((p) => p.startsWith('/api/'))).toEqual([]);
});
