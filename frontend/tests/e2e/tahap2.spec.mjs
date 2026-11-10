// Alur tahap 2 (ui-spec §6.4–§6.8, §7.5–§7.6, §9) di 360×740 (mobile) dan 1280×800 (desktop):
// keranjang, barang + PricePreview, Kosong, pembayaran, pengembalian dana, rekap WA,
// sheet Tambah customer ke Open PO. Angka acuan: contoh QA di scope-mvp.md (kurs 13.054).
import {
  akhiran, apiJson, bacaClipboard, expect, foto, isMobile, izinkanClipboard, masukLewatApi, test, toast, tolakClipboard,
} from './bantu.mjs';

const KURS_OTOMATIS = { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' };
const BARANG = {
  A: { nama_barang: 'Barang A', harga_aud: '24,95', qty: 2, markup_persen: '10' },
  B: { nama_barang: 'Barang B', harga_aud: '8,50', qty: 3, markup_persen: '15' },
  C: { nama_barang: 'Barang C', harga_aud: '129,99', qty: 1, markup_persen: '8' },
};

/** Teks rekap WA persis ui-spec §9.6. */
const rekap = ({ po, customer, wa, barang, bawah }) =>
  [`*REKAP JASTIP - ${po}*`, `Customer: ${customer} (${wa})`, '', ...barang, '', ...bawah].join('\n');

const ringkasan = (page) => page.locator('[data-ringkasan-keranjang]');

/**
 * Screenshot layar Keranjang: toast ditutup dulu, halaman di posisi atas. Mobile: satu layar
 * (elemen fixed seperti StickyActionBar di posisi aslinya); `bawah` = tambahan satu layar di
 * bagian bawah halaman. Desktop: satu halaman penuh (dua kolom).
 */
async function fotoKeranjang(page, testInfo, nama, { bawah = false } = {}) {
  for (const t of await page.getByRole('button', { name: 'Tutup pesan' }).all()) await t.click();
  await expect(toast(page)).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await foto(page, testInfo, nama);
  if (bawah && isMobile(testInfo)) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await foto(page, testInfo, `${nama}-bawah`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

/** Form barang: Sheet "Tambah barang" (mobile) atau kartu yang selalu terbuka (lg). */
async function formTambahBarang(page, testInfo) {
  if (!isMobile(testInfo)) {
    const kartu = page.locator('#kartu-form-barang');
    await expect(kartu.getByRole('heading', { name: 'Tambah barang' })).toBeVisible();
    return kartu;
  }
  await page.getByRole('button', { name: '+ Tambah barang' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tambah barang' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Nama barang', { exact: true })).toBeFocused();
  return sheet;
}

const field = (form) => ({
  nama: form.getByLabel('Nama barang', { exact: true }),
  harga: form.getByLabel('Harga (AUD)', { exact: true }),
  qty: form.getByLabel('Qty', { exact: true }),
  markup: form.getByLabel('Markup', { exact: true }),
});

async function harapPetunjuk(form) {
  await expect(form.locator('[data-pratinjau]')).toHaveAttribute('data-pratinjau', 'kosong');
  await expect(form.getByText('Isi harga dan qty untuk melihat harga jual.', { exact: true })).toBeVisible();
  await expect(form.getByText('Harga/unit')).toBeHidden();
}

async function harapPratinjau(form, { unit, subtotal, keterangan }) {
  const p = form.locator('[data-pratinjau]');
  await expect(p).toHaveAttribute('data-pratinjau', 'terisi');
  await expect(p).toContainText(`Harga/unit${unit}`);
  await expect(p).toContainText(`Subtotal${subtotal}`);
  await expect(p).toContainText(keterangan);
}

/** Aksi baris barang: ActionSheet (mobile) atau tombol langsung di baris (lg). */
async function aksiBaris(page, testInfo, nama, aksi, { foto: namaFoto } = {}) {
  if (isMobile(testInfo)) {
    await page.locator('#daftar-barang button:visible', { hasText: nama }).click();
    const as = page.getByRole('dialog', { name: nama });
    await expect(as).toBeVisible();
    await expect(as.getByRole('button', { name: 'Ubah' })).toBeFocused();
    if (namaFoto) await foto(page, testInfo, namaFoto);
    await as.getByRole('button', { name: new RegExp(`^${aksi}`) }).click();
    await expect(as).toHaveCount(0);
  } else {
    await page.getByRole('button', { name: `${aksi} ${nama}`, exact: true }).click();
  }
}

async function salinRekap(page, testInfo) {
  const tombol = page.locator('[data-salin-rekap]:visible');
  await expect(tombol).toHaveText('Salin rekap WA');
  await tombol.click();
  await expect(tombol).toHaveText('Tersalin');
  await expect(tombol).toHaveText('Salin rekap WA', { timeout: 4000 }); // kembali setelah 2 detik
  return bacaClipboard(page);
}

test('QA scope lewat UI: A+B+C, DP, Lunas, Kosong → Lebih bayar, pengembalian dana → Lunas, rekap WA', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await masukLewatApi(page);
  await izinkanClipboard(page);
  const m = isMobile(testInfo);
  const wa = m ? '081234567890' : '081234567891';
  const namaPo = 'Open PO Australia Nov 2026';
  // Customer lain bernama mirip, supaya langkah cari selalu ada (database e2e bisa masih kosong).
  await apiJson(page.request, 'POST', '/customer', { nama: `Rini ${akhiran(testInfo)}`, no_wa: m ? '081377712345' : '081377712346' });

  // Open PO baru dengan kurs otomatis 13.054.
  await page.goto('/');
  await page.getByRole('link', { name: m ? '+ Open PO' : '+ Open PO baru', exact: true }).click();
  await expect(page.locator('#panel-otomatis').getByText('1 AUD = Rp13.054')).toBeVisible();
  await page.getByLabel('Nama Open PO').fill(namaPo);
  await page.getByRole('button', { name: 'Simpan Open PO' }).click();
  await expect(page).toHaveURL(/\/po\.html\?id=\d+$/);
  const idPo = Number(new URL(page.url()).searchParams.get('id'));

  // Sheet Tambah customer → Buat customer baru "Rina" → Keranjang kosong.
  await page.getByRole('button', { name: m ? '+ Customer' : '+ Tambah customer', exact: true }).click();
  const sheetC = page.getByRole('dialog', { name: 'Tambah customer' });
  await expect(sheetC.getByLabel('Cari nama atau no WA')).toBeFocused();
  await sheetC.getByLabel('Cari nama atau no WA').fill('Rin');
  await expect(sheetC.getByRole('list', { name: 'Hasil pencarian' })).toContainText(`Rini ${akhiran(testInfo)}`);
  await sheetC.getByLabel('Cari nama atau no WA').fill('Rina');
  await sheetC.getByRole('button', { name: '+ Buat customer baru "Rina"' }).click();
  const sheetBaru = page.getByRole('dialog', { name: 'Customer baru' });
  await expect(sheetBaru.getByLabel('Nama')).toHaveValue('Rina');
  await sheetBaru.getByLabel('No WA').fill(wa);
  await sheetBaru.getByRole('button', { name: 'Simpan & buka keranjang' }).click();
  await expect(page).toHaveURL(new RegExp(`/keranjang\\.html\\?po=${idPo}&customer=\\d+$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Rina' })).toBeVisible();
  await expect(page.getByText(`${namaPo} · ${wa}`)).toBeVisible();
  await expect(toast(page)).toHaveText('Customer disimpan.');
  const idCustomer = Number(new URL(page.url()).searchParams.get('customer'));
  await expect(page.getByText('Belum ada barang untuk Rina.')).toBeVisible();
  await expect(page.getByText('Belum ada pembayaran.')).toBeVisible();
  await expect(ringkasan(page)).toContainText('TotalRp0');
  await expect(ringkasan(page)).toContainText('Sisa pelunasanRp0');
  await expect(page.getByRole('heading', { name: 'Barang (0)' })).toBeVisible();
  await fotoKeranjang(page, testInfo, 'keranjang-kosong');

  // Barang A: banner "akan terkunci", markup default 10%, qty dengan tombol +, pratinjau + rincian.
  let form = await formTambahBarang(page, testInfo);
  let f = field(form);
  await expect(form.locator('[data-banner-kurs]')).toHaveText('Kurs Rp13.054 akan terkunci setelah barang pertama disimpan.');
  await expect(f.markup).toHaveValue('10');
  await expect(f.qty).toHaveValue('1');
  await expect(form.getByRole('button', { name: 'Kurangi qty' })).toHaveAttribute('aria-disabled', 'true');
  await harapPetunjuk(form);
  await expect(f.harga).toHaveAttribute('inputmode', 'decimal');
  await expect(f.qty).toHaveAttribute('inputmode', 'numeric');
  await f.nama.fill('Barang A');
  await f.harga.fill('24,95');
  await form.getByRole('button', { name: 'Tambah qty' }).click();
  await expect(f.qty).toHaveValue('2');
  await expect(form.getByRole('button', { name: 'Kurangi qty' })).not.toHaveAttribute('aria-disabled', 'true');
  await harapPratinjau(form, { unit: 'Rp359.000', subtotal: 'Rp718.000', keterangan: 'Kurs Rp13.054 · markup 10%' });
  const live = form.locator('[data-pratinjau-live]');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveText('Harga/unit Rp359.000. Subtotal Rp718.000.');
  const tombolRincian = form.getByRole('button', { name: 'Rincian hitungan' });
  await expect(tombolRincian).toHaveAttribute('aria-expanded', 'false');
  await expect(form.locator('[data-rincian]')).toBeHidden();
  await tombolRincian.click();
  await expect(tombolRincian).toHaveAttribute('aria-expanded', 'true');
  const rincian = form.locator('[data-rincian]');
  await expect(rincian).toContainText('AUD 24,95 × Rp13.054= Rp325.697,30');
  await expect(rincian).toContainText('+ markup 10%= Rp358.267,03');
  await expect(rincian).toContainText('Dibulatkan ke atas ke ribuan= Rp359.000');
  await expect(rincian).toContainText('× 2= Rp718.000');
  await foto(page, testInfo, 'barang-pratinjau-rincian', { fullPage: false });
  await form.getByRole('button', { name: 'Simpan & tambah lagi' }).click();
  await expect(toast(page)).toHaveText('Barang A disimpan.');
  if (m) await foto(page, testInfo, 'barang-simpan-tambah-lagi'); // toast di dalam sheet, di atas
  // Form dikosongkan, fokus ke Nama barang, banner kurs hilang karena kurs sudah terkunci.
  await expect(f.nama).toHaveValue('');
  await expect(f.nama).toBeFocused();
  await expect(f.markup).toHaveValue('10');
  await expect(form.locator('[data-banner-kurs]')).toBeHidden();
  await expect(page.locator('#daftar-barang')).toContainText('Barang A');

  // Barang B: qty diketik, markup 15%.
  await f.nama.fill('Barang B');
  await f.harga.fill('8,50');
  await f.qty.fill('3');
  await f.markup.fill('15');
  await harapPratinjau(form, { unit: 'Rp128.000', subtotal: 'Rp384.000', keterangan: 'Kurs Rp13.054 · markup 15%' });
  await form.getByRole('button', { name: 'Simpan & tambah lagi' }).click();
  await expect(toast(page)).toHaveText('Barang B disimpan.');
  await expect(f.nama).toHaveValue('');

  // Barang C: Enter di Markup (field terakhir) = Simpan. Sheet tertutup (mobile).
  await f.nama.fill('Barang C');
  await f.harga.fill('129,99');
  await f.markup.fill('8');
  await harapPratinjau(form, { unit: 'Rp1.833.000', subtotal: 'Rp1.833.000', keterangan: 'Kurs Rp13.054 · markup 8%' });
  await f.markup.press('Enter');
  await expect(toast(page)).toHaveText('Barang C disimpan.');
  if (m) {
    await expect(page.getByRole('dialog', { name: 'Tambah barang' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Tambah barang' })).toBeFocused();
  }

  // Hasil simpan (angka server) sama dengan pratinjau.
  const barang = page.locator('#daftar-barang li');
  await expect(page.getByRole('heading', { name: 'Barang (3)' })).toBeVisible();
  await expect(barang).toHaveCount(3);
  await expect(barang.nth(0).filter({ visible: true })).toBeDefined();
  for (const [i, teks] of [['2 × Rp359.000', 'Rp718.000'], ['3 × Rp128.000', 'Rp384.000'], ['1 × Rp1.833.000', 'Rp1.833.000']].entries()) {
    await expect(barang.nth(i)).toContainText(teks[0]);
    await expect(barang.nth(i)).toContainText(teks[1]);
  }
  const server = await apiJson(page.request, 'GET', `/open-po/${idPo}/keranjang/${idCustomer}`);
  expect(server.barang.map((b) => [b.harga_jual_unit, b.subtotal])).toEqual([[359000, 718000], [128000, 384000], [1833000, 1833000]]);
  expect(server.open_po.kurs_terkunci).toBe(true);
  const r0 = ringkasan(page);
  await expect(r0).toContainText('Belum bayar');
  await expect(r0).toContainText('TotalRp2.935.000');
  await expect(r0).toContainText('DP 50%Rp1.468.000');
  await expect(r0).toContainText('Dana diterimaRp0');
  await expect(r0).toContainText('Sisa pelunasanRp2.935.000');
  await expect(page.getByRole('button', { name: 'Catat pengembalian dana' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Aktif saat status Lebih bayar.')).toBeVisible();
  await fotoKeranjang(page, testInfo, 'keranjang-belum-bayar');
  const bawahBelum = ['*Total: Rp2.935.000*', 'DP 50%: Rp1.468.000', '*Mohon transfer DP: Rp1.468.000*', 'Status: BELUM BAYAR'];
  const barangRekap = ['1. Barang A', '   2 x Rp359.000 = Rp718.000', '2. Barang B', '   3 x Rp128.000 = Rp384.000', '3. Barang C', '   1 x Rp1.833.000 = Rp1.833.000'];
  expect(await salinRekap(page, testInfo)).toBe(rekap({ po: namaPo, customer: 'Rina', wa, barang: barangRekap, bawah: bawahBelum }));
  await expect(toast(page)).toHaveText('Rekap Rina tersalin. Tempel di chat WA.');

  // QA 2: bayar DP Rp1.468.000 lewat chip "Isi DP" → status DP, sisa Rp1.467.000.
  await page.getByRole('button', { name: 'Catat pembayaran' }).click();
  let bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
  await expect(bayar.getByLabel('Nominal')).toBeFocused();
  await expect(bayar.getByLabel('Nominal')).toHaveAttribute('inputmode', 'numeric');
  await expect(bayar.getByLabel('Tanggal')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(bayar.getByRole('button', { name: 'Simpan pembayaran' })).toBeVisible();
  await expect(bayar.getByRole('button', { name: 'Isi sisa Rp2.935.000' })).toBeVisible();
  await bayar.getByRole('button', { name: 'Isi DP Rp1.468.000' }).click();
  await expect(bayar.getByLabel('Nominal')).toHaveValue('1.468.000');
  await bayar.getByLabel('Tanggal').fill('2026-10-28');
  await foto(page, testInfo, 'sheet-pembayaran', { fullPage: false });
  await bayar.getByRole('button', { name: 'Simpan Rp1.468.000' }).click();
  await expect(bayar).toHaveCount(0);
  await expect(toast(page)).toHaveText('Pembayaran Rp1.468.000 dicatat.');
  await expect(ringkasan(page)).toHaveAttribute('data-ringkasan-keranjang', 'dp');
  await expect(ringkasan(page)).toContainText('DP');
  await expect(ringkasan(page)).toContainText('Dana diterimaRp1.468.000');
  await expect(ringkasan(page)).toContainText('Sisa pelunasanRp1.467.000');
  const riwayat = page.locator('#daftar-riwayat li');
  await expect(riwayat).toHaveCount(1);
  await expect(riwayat.first()).toContainText('28 Okt 2026');
  await expect(riwayat.first()).toContainText('Rp1.468.000');
  await expect(riwayat.first()).toContainText('Pembayaran');
  await fotoKeranjang(page, testInfo, 'keranjang-dp');
  const bawahDp = ['*Total: Rp2.935.000*', 'DP 50%: Rp1.468.000', 'Sudah dibayar: Rp1.468.000', '*Sisa pelunasan: Rp1.467.000*', 'Status: DP DITERIMA ✅'];
  expect(await salinRekap(page, testInfo)).toBe(rekap({ po: namaPo, customer: 'Rina', wa, barang: barangRekap, bawah: bawahDp }));

  // QA 3: pelunasan Rp1.467.000 (diketik, titik ribuan saat blur) → Lunas.
  await page.getByRole('button', { name: 'Catat pembayaran' }).click();
  bayar = page.getByRole('dialog', { name: 'Catat pembayaran' });
  await expect(bayar.getByRole('button', { name: /^Isi DP/ })).toHaveCount(0); // sudah ada pembayaran
  await bayar.getByLabel('Nominal').fill('1467000');
  await expect(bayar.getByRole('button', { name: 'Simpan Rp1.467.000' })).toBeVisible();
  await bayar.getByLabel('Tanggal').fill('2026-10-30');
  await bayar.getByLabel('Tanggal').focus();
  await expect(bayar.getByLabel('Nominal')).toHaveValue('1.467.000');
  await bayar.getByRole('button', { name: 'Simpan Rp1.467.000' }).click();
  await expect(toast(page)).toHaveText('Pembayaran Rp1.467.000 dicatat.');
  await expect(ringkasan(page)).toHaveAttribute('data-ringkasan-keranjang', 'lunas');
  await expect(ringkasan(page)).toContainText('Lunas');
  await expect(ringkasan(page)).toContainText('Dana diterimaRp2.935.000');
  await expect(ringkasan(page)).toContainText('Sisa pelunasanRp0');
  await expect(riwayat).toHaveCount(2);
  await expect(riwayat.first()).toContainText('30 Okt 2026'); // terbaru di atas
  await fotoKeranjang(page, testInfo, 'keranjang-lunas');
  const bawahLunas = ['*Total: Rp2.935.000*', 'DP 50%: Rp1.468.000', 'Sudah dibayar: Rp2.935.000', '*Sisa pelunasan: Rp0*', 'Status: LUNAS ✅'];
  expect(await salinRekap(page, testInfo)).toBe(rekap({ po: namaPo, customer: 'Rina', wa, barang: barangRekap, bawah: bawahLunas }));

  // QA 4: Barang B Kosong → total Rp2.551.000, Lebih bayar Rp384.000 (tanpa dialog).
  await aksiBaris(page, testInfo, 'Barang B', 'Tandai Kosong', { foto: 'keranjang-actionsheet' });
  await expect(toast(page)).toHaveText('Barang B ditandai Kosong. Status: Lebih bayar.');
  const barisB = page.locator('#daftar-barang li[data-kosong]');
  await expect(barisB).toHaveCount(1);
  await expect(barisB).toContainText('Barang B');
  await expect(barisB).toContainText('Kosong');
  await expect(barisB).toContainText('tidak dihitung');
  await expect(barisB.locator('s').filter({ visible: true })).toHaveText('3 × Rp128.000');
  const r4 = ringkasan(page);
  await expect(r4).toHaveAttribute('data-ringkasan-keranjang', 'lebih_bayar');
  await expect(r4).toContainText('Lebih bayar');
  await expect(r4).toContainText('TotalRp2.551.000');
  await expect(r4).toContainText('DP 50%Rp1.276.000');
  await expect(r4).toContainText('Dana diterimaRp2.935.000');
  await expect(r4).toContainText('Kelebihan bayarRp384.000');
  await expect(r4).not.toContainText('Sisa pelunasan');
  await expect(r4).toContainText('Kembalikan Rp384.000 ke customer di luar aplikasi, lalu catat di sini.');
  await expect(page.getByText('Aktif saat status Lebih bayar.')).toBeHidden();
  await fotoKeranjang(page, testInfo, 'keranjang-lebih-bayar');

  // QA 5: pengembalian dana Rp384.000 → Lunas. Validasi batas kelebihan bayar dulu.
  await r4.getByRole('button', { name: 'Catat pengembalian dana' }).click();
  const kembali = page.getByRole('dialog', { name: 'Catat pengembalian dana' });
  await expect(kembali).toContainText('Kelebihan bayar Rp384.000. Transfer ke customer di luar aplikasi, lalu catat di sini.');
  await kembali.getByLabel('Nominal').fill('400000');
  await kembali.getByRole('button', { name: 'Simpan Rp400.000' }).click();
  await expect(kembali.getByText('Nominal maksimal Rp384.000 (kelebihan bayar).')).toBeVisible();
  await expect(kembali.getByLabel('Nominal')).toBeFocused();
  await kembali.getByRole('button', { name: 'Isi Rp384.000' }).click();
  await expect(kembali.getByText('Nominal maksimal Rp384.000 (kelebihan bayar).')).toHaveCount(0);
  await kembali.getByLabel('Tanggal').fill('2026-10-31');
  await kembali.getByLabel('Catatan (opsional)').fill('transfer BCA 31 Okt');
  await foto(page, testInfo, 'sheet-pengembalian', { fullPage: false });
  await kembali.getByRole('button', { name: 'Simpan Rp384.000' }).click();
  await expect(toast(page)).toHaveText('Pengembalian dana Rp384.000 dicatat.');
  const r5 = ringkasan(page);
  await expect(r5).toHaveAttribute('data-ringkasan-keranjang', 'lunas');
  await expect(r5).toContainText('TotalRp2.551.000');
  await expect(r5).toContainText('DP 50%Rp1.276.000');
  await expect(r5).toContainText('Dana diterimaRp2.551.000');
  await expect(r5.locator('[data-rincian-dana]')).toHaveText('Sudah dibayar Rp2.935.000 · Dikembalikan Rp384.000');
  await expect(r5).toContainText('Sisa pelunasanRp0');
  await expect(riwayat).toHaveCount(3);
  await expect(riwayat.first()).toContainText('Pengembalian dana');
  await expect(riwayat.first()).toContainText('−Rp384.000');
  await expect(riwayat.first()).toContainText('transfer BCA 31 Okt');
  await expect(page.getByRole('button', { name: 'Catat pengembalian dana' })).toHaveAttribute('aria-disabled', 'true');
  await fotoKeranjang(page, testInfo, 'keranjang-lunas-pengembalian', { bawah: true });
  const barangRekapKosong = ['1. Barang A', '   2 x Rp359.000 = Rp718.000', '2. Barang B (Kosong, tidak ditagih)', '3. Barang C', '   1 x Rp1.833.000 = Rp1.833.000'];
  const bawahLunasKembali = ['*Total: Rp2.551.000*', 'DP 50%: Rp1.276.000', 'Sudah dibayar: Rp2.935.000', 'Dikembalikan: Rp384.000', '*Sisa pelunasan: Rp0*', 'Status: LUNAS ✅'];
  expect(await salinRekap(page, testInfo)).toBe(rekap({ po: namaPo, customer: 'Rina', wa, barang: barangRekapKosong, bawah: bawahLunasKembali }));

  // Detail Open PO: kurs terkunci setelah barang pertama, customer tampil Lunas.
  await page.getByRole('link', { name: 'Kembali', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/po\\.html\\?id=${idPo}$`));
  const kurs = page.locator('[data-kurs-card]');
  await expect(kurs.getByText('Terkunci', { exact: true })).toBeVisible();
  await expect(kurs.getByRole('link', { name: 'Ubah kurs' })).toHaveCount(0);
  await expect(page.locator('[data-ringkasan-po]')).toContainText('Total pesananRp2.551.000');
  const baris = page.locator('#daftar-customer').locator(`[data-customer-id="${idCustomer}"]`).filter({ visible: true });
  await expect(baris).toContainText('Rina');
  await expect(baris).toContainText('Lunas');
});

test('hapus pembayaran diblokir → hapus pengembalian dana → hapus pembayaran', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const r = page.request;
  const po = await apiJson(r, 'POST', '/open-po', { nama: `Hapus bayar ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(r, 'POST', '/customer', { nama: `Wati ${sfx}`, no_wa: sfx === 'M' ? '081366610001' : '081366610002' });
  const base = `/open-po/${po.id}/keranjang/${c.id}`;
  let k;
  for (const b of Object.values(BARANG)) k = await apiJson(r, 'POST', `${base}/baris-pesanan`, b);
  await apiJson(r, 'POST', `${base}/pembayaran`, { nominal: 2935000, tanggal: '2026-10-28' });
  await apiJson(r, 'POST', `/baris-pesanan/${k.barang[1].id}/kosong`);
  await apiJson(r, 'POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-29', catatan: 'transfer BCA 29 Okt' });

  await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
  await expect(ringkasan(page)).toHaveAttribute('data-ringkasan-keranjang', 'lunas');
  const riwayat = page.locator('#daftar-riwayat li');
  await expect(riwayat).toHaveCount(2);
  await expect(riwayat.first()).toContainText('Pengembalian dana');

  // Pembayaran Rp2.935.000 tidak bisa dihapus (dana diterima jadi negatif) → dialog info.
  const hapusBayar = page.getByRole('button', { name: 'Hapus pembayaran Rp2.935.000, 28 Okt 2026' });
  await hapusBayar.click();
  const info = page.getByRole('dialog', { name: 'Hapus pengembalian dana dulu' });
  await expect(info).toContainText('Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana Rp384.000. Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini.');
  await expect(info.getByRole('button', { name: 'Mengerti' })).toBeFocused();
  await expect(info.getByRole('button', { name: 'Batal' })).toHaveCount(0);
  await foto(page, testInfo, 'dialog-hapus-pengembalian-dulu', { fullPage: false });
  await info.getByRole('button', { name: 'Mengerti' }).click();
  await expect(info).toHaveCount(0);
  await expect(hapusBayar).toBeFocused();
  await expect(riwayat).toHaveCount(2);

  // Hapus pengembalian dana → status kembali Lebih bayar.
  await page.getByRole('button', { name: 'Hapus pengembalian dana Rp384.000, 29 Okt 2026' }).click();
  const dKembali = page.getByRole('alertdialog', { name: 'Hapus pengembalian dana Rp384.000?' });
  await expect(dKembali).toContainText('Pengembalian dana tanggal 29 Okt 2026 akan dihapus dan status dihitung ulang.');
  await expect(dKembali.getByRole('button', { name: 'Batal' })).toBeFocused();
  await dKembali.getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect(toast(page)).toHaveText('Pengembalian dana Rp384.000 dihapus. Status: Lebih bayar.');
  await expect(ringkasan(page)).toHaveAttribute('data-ringkasan-keranjang', 'lebih_bayar');
  await expect(riwayat).toHaveCount(1);

  // Sekarang pembayaran bisa dihapus → Belum bayar.
  await hapusBayar.click();
  const dBayar = page.getByRole('alertdialog', { name: 'Hapus pembayaran Rp2.935.000?' });
  await expect(dBayar).toContainText('Pembayaran tanggal 28 Okt 2026 akan dihapus dan status dihitung ulang. Kalau nominalnya salah, catat ulang nominal yang benar setelah ini.');
  await foto(page, testInfo, 'dialog-hapus-pembayaran', { fullPage: false });
  await dBayar.getByRole('button', { name: 'Hapus pembayaran' }).click();
  await expect(toast(page)).toHaveText('Pembayaran Rp2.935.000 dihapus. Status: Belum bayar.');
  await expect(ringkasan(page)).toHaveAttribute('data-ringkasan-keranjang', 'belum_bayar');
  await expect(ringkasan(page)).toContainText('Dana diterimaRp0');
  await expect(page.getByText('Belum ada pembayaran.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Riwayat pembayaran' })).toBeFocused(); // baris hilang
  const server = await apiJson(r, 'GET', base);
  expect(server.riwayat).toEqual([]);
});

test('ubah barang, hapus barang (ConfirmDialog), saran nama barang', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const m = isMobile(testInfo);
  const r = page.request;
  const po = await apiJson(r, 'POST', '/open-po', { nama: `Ubah barang ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(r, 'POST', '/customer', { nama: `Yuni ${sfx}`, no_wa: sfx === 'M' ? '081377720001' : '081377720002' });
  const lain = await apiJson(r, 'POST', '/customer', { nama: `Zara ${sfx}`, no_wa: sfx === 'M' ? '081377730001' : '081377730002' });
  await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, BARANG.A);
  await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, BARANG.B);
  await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${lain.id}/baris-pesanan`, { nama_barang: 'Barang AB', harga_aud: '12', qty: 1, markup_persen: '10' });

  await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
  await expect(page.getByRole('heading', { name: 'Barang (2)' })).toBeVisible();
  await expect(ringkasan(page)).toContainText('TotalRp1.102.000');

  // Ubah Barang A: qty 2 → 3. Banner "akan terkunci" tidak muncul di mode ubah.
  await aksiBaris(page, testInfo, 'Barang A', 'Ubah');
  const form = m ? page.getByRole('dialog', { name: 'Ubah barang' }) : page.locator('#kartu-form-barang');
  if (!m) await expect(form.getByRole('heading', { name: 'Ubah barang' })).toBeVisible();
  const f = field(form);
  await expect(f.nama).toBeFocused();
  await expect(f.nama).toHaveValue('Barang A');
  await expect(f.harga).toHaveValue('24,95');
  await expect(f.qty).toHaveValue('2');
  await expect(f.markup).toHaveValue('10');
  await expect(form.locator('[data-banner-kurs]')).toBeHidden();
  await expect(form.getByRole('button', { name: 'Simpan & tambah lagi' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Tambah qty' }).click();
  await expect(f.qty).toHaveValue('3');
  await harapPratinjau(form, { unit: 'Rp359.000', subtotal: 'Rp1.077.000', keterangan: 'Kurs Rp13.054 · markup 10%' });
  if (!m) await foto(page, testInfo, 'keranjang-dua-kolom-ubah', { fullPage: false });
  await form.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(toast(page)).toHaveText('Perubahan disimpan.');
  const barisA = page.locator('#daftar-barang li', { hasText: 'Barang A' });
  await expect(barisA).toContainText('3 × Rp359.000');
  await expect(barisA).toContainText('Rp1.077.000');
  await expect(ringkasan(page)).toContainText('TotalRp1.461.000');
  if (m) await expect(page.getByRole('dialog', { name: 'Ubah barang' })).toHaveCount(0);
  else {
    await expect(form.getByRole('heading', { name: 'Tambah barang' })).toBeVisible(); // kartu kembali ke mode tambah
    await expect(page.getByRole('button', { name: 'Ubah Barang A' })).toBeFocused();
  }

  // Hapus Barang B lewat ConfirmDialog.
  await aksiBaris(page, testInfo, 'Barang B', 'Hapus');
  const dialog = page.getByRole('alertdialog', { name: 'Hapus Barang B?' });
  await expect(dialog).toContainText('Hapus hanya untuk salah input. Kalau barang tidak tersedia, pilih Tandai Kosong supaya tetap tercatat di rekap.');
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeFocused();
  await foto(page, testInfo, 'dialog-hapus-barang', { fullPage: false });
  await dialog.getByRole('button', { name: 'Hapus barang' }).click();
  await expect(toast(page)).toHaveText('Barang B dihapus.');
  await expect(page.getByRole('heading', { name: 'Barang (1)' })).toBeVisible();
  await expect(page.locator('#daftar-barang li', { hasText: 'Barang B' })).toHaveCount(0);
  await expect(ringkasan(page)).toContainText('TotalRp1.077.000');

  // Saran nama barang (barang unik di PO, maks. 6): memilih saran mengisi harga, markup tetap.
  const tambah = await formTambahBarang(page, testInfo);
  const t = field(tambah);
  await t.markup.fill('12');
  await t.nama.fill('barang a');
  const saran = tambah.getByRole('listbox', { name: 'Saran nama barang' });
  await expect(saran.getByRole('option')).toHaveText(['Barang A AUD 24,95', 'Barang AB AUD 12,00']);
  await expect(t.nama).toHaveAttribute('aria-expanded', 'true');
  await t.nama.press('ArrowDown');
  await t.nama.press('ArrowDown');
  await expect(saran.getByRole('option', { name: /Barang AB/ })).toHaveAttribute('aria-selected', 'true');
  await expect(t.nama).toHaveAttribute('aria-activedescendant', /saran-1$/);
  await foto(page, testInfo, 'barang-saran', { fullPage: false });
  await t.nama.press('Enter');
  await expect(t.nama).toHaveValue('Barang AB');
  await expect(t.harga).toHaveValue('12,00');
  await expect(t.markup).toHaveValue('12');
  await expect(saran).toBeHidden();
  await harapPratinjau(tambah, { unit: 'Rp176.000', subtotal: 'Rp176.000', keterangan: 'Kurs Rp13.054 · markup 12%' });
  // Klik saran juga bisa; Esc menutup daftar saran saja.
  await t.nama.fill('Barang');
  await saran.getByRole('option', { name: /^Barang A AUD/ }).click();
  await expect(t.harga).toHaveValue('24,95');
  await t.nama.fill('Bar');
  await expect(saran).toBeVisible();
  await t.nama.press('Escape');
  await expect(saran).toBeHidden();
  if (m) {
    await expect(tambah).toBeVisible();
    // Menutup sheet yang sudah diisi → "Tutup tanpa menyimpan?".
    await tambah.getByRole('button', { name: 'Tutup', exact: true }).click();
    const tutup = page.getByRole('alertdialog', { name: 'Tutup tanpa menyimpan?' });
    await expect(tutup).toContainText('Isian di form ini akan hilang.');
    await tutup.getByRole('button', { name: 'Kembali ke form' }).click();
    await expect(t.nama).toHaveValue('Bar');
    await page.keyboard.press('Escape');
    await page.getByRole('alertdialog', { name: 'Tutup tanpa menyimpan?' }).getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(tambah).toHaveCount(0);
  }
});

test('tambah customer dari Detail Open PO: daftar terakhir, Sudah di PO ini, no WA ganda, customer baru', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const m = isMobile(testInfo);
  const r = page.request;
  const no = (i) => `0813999${sfx === 'M' ? '1' : '2'}${String(i).padStart(4, '0')}`;
  const po = await apiJson(r, 'POST', '/open-po', { nama: `Tambah customer ${sfx}`, kurs: KURS_OTOMATIS });
  // Minimal 10 customer lain supaya daftar "10 terakhir diubah" selalu penuh.
  for (let i = 10; i < 20; i += 1) await apiJson(r, 'POST', '/customer', { nama: `Isi ${i} ${sfx}`, no_wa: no(i) });
  const tari = await apiJson(r, 'POST', '/customer', { nama: `Tari ${sfx}`, no_wa: no(1) });
  await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${tari.id}/baris-pesanan`, BARANG.A);
  const sinta = await apiJson(r, 'POST', '/customer', { nama: `Sinta ${sfx}`, no_wa: no(2) });

  await page.goto(`/po.html?id=${po.id}`);
  const buka = async () => {
    await page.getByRole('button', { name: m ? '+ Customer' : '+ Tambah customer', exact: true }).click();
    const s = page.getByRole('dialog', { name: 'Tambah customer' });
    await expect(s).toBeVisible();
    return s;
  };
  let sheet = await buka();
  const cari = sheet.getByLabel('Cari nama atau no WA');
  await expect(cari).toBeFocused();
  // Belum mengetik: 10 customer yang terakhir diubah (Sinta paling baru).
  const daftar = sheet.getByRole('list', { name: 'Customer yang terakhir diubah' });
  await expect(daftar.getByRole('listitem')).toHaveCount(10);
  await expect(daftar.getByRole('listitem').first()).toContainText(`Sinta ${sfx}`);
  await expect(daftar.getByRole('listitem').nth(1)).toContainText(`Tari ${sfx}`);
  await expect(daftar.getByRole('listitem').nth(1)).toContainText('Sudah di PO ini');
  await expect(daftar.getByRole('listitem').first()).not.toContainText('Sudah di PO ini');
  await foto(page, testInfo, 'sheet-tambah-customer', { fullPage: false });

  // Cari: tidak ada hasil → tombol buat baru membawa teks pencarian.
  await cari.fill(`Dewi Baru ${sfx}`);
  await expect(sheet.getByText(`Tidak ada customer dengan nama atau no WA "Dewi Baru ${sfx}".`)).toBeVisible();
  await sheet.getByRole('button', { name: `+ Buat customer baru "Dewi Baru ${sfx}"` }).click();
  sheet = page.getByRole('dialog', { name: 'Customer baru' });
  await expect(sheet.getByLabel('Nama')).toHaveValue(`Dewi Baru ${sfx}`);
  await expect(sheet.getByLabel('No WA')).toBeFocused();
  await expect(sheet.getByLabel('No WA')).toHaveAttribute('type', 'tel');

  // No WA milik Sinta (format +62 dengan spasi) → peringatan + "Pakai Sinta", simpan tetap boleh.
  await sheet.getByLabel('No WA').fill(`+62 ${no(2).slice(1, 4)} ${no(2).slice(4)}`);
  await sheet.getByLabel('Alamat (opsional)').focus();
  await expect(sheet.getByLabel('No WA')).toHaveValue(`+62${no(2).slice(1)}`);
  await expect(sheet.locator('[data-peringatan-field]')).toContainText(`No WA ini sudah terdaftar atas nama Sinta ${sfx}.`);
  await expect(sheet.getByLabel('No WA')).not.toHaveAttribute('aria-invalid', 'true');
  await foto(page, testInfo, 'sheet-customer-baru-duplikat', { fullPage: false });

  // Kembali ke langkah 1: teks pencarian tetap.
  await sheet.getByRole('button', { name: 'Kembali ke pencarian' }).click();
  sheet = page.getByRole('dialog', { name: 'Tambah customer' });
  await expect(cari).toHaveValue(`Dewi Baru ${sfx}`);
  await expect(cari).toBeFocused();
  await sheet.getByRole('button', { name: `+ Buat customer baru "Dewi Baru ${sfx}"` }).click();
  sheet = page.getByRole('dialog', { name: 'Customer baru' });
  await sheet.getByLabel('No WA').fill(no(2));
  await sheet.getByLabel('No WA').blur();
  await sheet.getByRole('link', { name: `Pakai Sinta ${sfx}` }).click();
  await expect(page).toHaveURL(new RegExp(`/keranjang\\.html\\?po=${po.id}&customer=${sinta.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Sinta ${sfx}` })).toBeVisible();
  await expect(page.getByText(`Belum ada barang untuk Sinta ${sfx}.`)).toBeVisible();

  // Customer yang sudah di PO: ketuk → keranjangnya yang sudah ada.
  await page.goto(`/po.html?id=${po.id}`);
  sheet = await buka();
  await sheet.getByLabel('Cari nama atau no WA').fill(`tari ${sfx.toLowerCase()}`);
  const hasilTari = sheet.getByRole('list', { name: 'Hasil pencarian' }).getByRole('link', { name: new RegExp(`Tari ${sfx}`) });
  await expect(hasilTari).toContainText('Sudah di PO ini');
  await hasilTari.click();
  await expect(page).toHaveURL(new RegExp(`customer=${tari.id}$`));
  await expect(page.getByRole('heading', { name: 'Barang (1)' })).toBeVisible();

  // Customer baru dari pencarian nomor: No WA terisi, Nama kosong → Simpan & buka keranjang.
  await page.goto(`/po.html?id=${po.id}`);
  sheet = await buka();
  await sheet.getByLabel('Cari nama atau no WA').fill(no(3));
  await sheet.getByRole('button', { name: `+ Buat customer baru "${no(3)}"` }).click();
  sheet = page.getByRole('dialog', { name: 'Customer baru' });
  await expect(sheet.getByLabel('No WA')).toHaveValue(no(3));
  await expect(sheet.getByLabel('Nama')).toBeFocused();
  await sheet.getByRole('button', { name: 'Simpan & buka keranjang' }).click();
  await expect(sheet.getByText('Nama wajib diisi.')).toBeVisible();
  await sheet.getByLabel('Nama').fill(`Umi ${sfx}`);
  await sheet.getByRole('button', { name: 'Simpan & buka keranjang' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Umi ${sfx}` })).toBeVisible();
  await expect(toast(page)).toHaveText('Customer disimpan.');
  await expect(page.getByText(`Belum ada barang untuk Umi ${sfx}.`)).toBeVisible();
  // Tombol kembali → Detail Open PO. Umi belum muncul (belum ada barang/pembayaran, ui-spec §13 P1).
  await page.getByRole('link', { name: 'Kembali', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();
  await expect(page.locator('#daftar-customer')).not.toContainText(`Umi ${sfx}`);
});

test('validasi form barang: harga 3 desimal, qty 0, markup > 100', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const po = await apiJson(page.request, 'POST', '/open-po', { nama: `Validasi ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(page.request, 'POST', '/customer', { nama: `Vina ${sfx}`, no_wa: sfx === 'M' ? '081377740001' : '081377740002' });
  await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
  const form = await formTambahBarang(page, testInfo);
  const f = field(form);

  await form.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(form.getByText('Nama barang wajib diisi.')).toBeVisible();
  await expect(form.getByText('Harga wajib diisi.')).toBeVisible();
  await expect(f.nama).toBeFocused();

  await f.nama.fill('Barang X');
  await f.harga.fill('1.299');
  await f.qty.fill('0');
  await f.markup.fill('101');
  await harapPetunjuk(form);
  await form.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(form.getByText('Maksimal 2 angka di belakang koma.')).toBeVisible();
  await expect(form.getByText('Qty minimal 1.')).toBeVisible();
  await expect(form.getByText('Markup maksimal 100%.')).toBeVisible();
  await expect(form.getByRole('alert').filter({ hasText: 'Periksa 3 isian yang ditandai.' })).toBeVisible();
  for (const el of [f.harga, f.qty, f.markup]) await expect(el).toHaveAttribute('aria-invalid', 'true');
  await expect(f.harga).toBeFocused();
  await foto(page, testInfo, 'barang-validasi', { fullPage: false });

  // Diperbaiki → pratinjau kembali, error hilang saat diketik.
  await f.harga.fill('12,99');
  await expect(form.getByText('Maksimal 2 angka di belakang koma.')).toHaveCount(0);
  await f.qty.fill('1');
  await f.markup.fill('10');
  await harapPratinjau(form, { unit: 'Rp187.000', subtotal: 'Rp187.000', keterangan: 'Kurs Rp13.054 · markup 10%' });
  const server = await apiJson(page.request, 'GET', `/open-po/${po.id}/keranjang/${c.id}`);
  expect(server.barang).toEqual([]); // belum ada yang terkirim
});

test('angka server berbeda dari pratinjau → console.warn, layar memakai angka server', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const po = await apiJson(page.request, 'POST', '/open-po', { nama: `Selisih ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(page.request, 'POST', '/customer', { nama: `Sela ${sfx}`, no_wa: sfx === 'M' ? '081377770001' : '081377770002' });
  const peringatan = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') peringatan.push(msg.text());
  });
  // Simulasi server yang menghitung lain (mis. rumus berubah di satu sisi): respons diubah.
  await page.route(`**/api/v1/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const b = body.data.barang.at(-1);
    b.harga_jual_unit += 1000;
    b.subtotal = b.harga_jual_unit * b.qty;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
  const form = await formTambahBarang(page, testInfo);
  const f = field(form);
  await f.nama.fill('Barang A');
  await f.harga.fill('24,95');
  await harapPratinjau(form, { unit: 'Rp359.000', subtotal: 'Rp359.000', keterangan: 'Kurs Rp13.054 · markup 10%' });
  await form.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(toast(page)).toHaveText('Barang A disimpan.');
  await expect(page.locator('#daftar-barang li')).toContainText('1 × Rp360.000');
  await expect.poll(() => peringatan.join('\n')).toContain('Pratinjau harga berbeda dari server');
});

test('salin rekap WA: clipboard ditolak → Sheet "Salin manual"', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await tolakClipboard(page);
  const sfx = akhiran(testInfo);
  const po = await apiJson(page.request, 'POST', '/open-po', { nama: `Salin manual ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(page.request, 'POST', '/customer', { nama: `Mira ${sfx}`, no_wa: sfx === 'M' ? '081377750001' : '081377750002' });
  await apiJson(page.request, 'POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, BARANG.A);
  const { teks } = await apiJson(page.request, 'GET', `/open-po/${po.id}/keranjang/${c.id}/rekap`);

  await page.goto(`/keranjang.html?po=${po.id}&customer=${c.id}`);
  await page.locator('[data-salin-rekap]:visible').click();
  const sheet = page.getByRole('dialog', { name: 'Salin manual' });
  await expect(sheet).toContainText('Rekap tidak bisa disalin otomatis. Tekan lama teks di bawah, lalu pilih Salin.');
  const area = sheet.getByLabel('Teks rekap WA');
  await expect(area).toHaveValue(teks);
  await expect(area).toHaveAttribute('readonly', '');
  await expect(area).toBeFocused();
  const sel = await area.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  expect(sel).toEqual([0, teks.length, teks.length]);
  await expect(page.locator('[data-salin-rekap]:visible')).toHaveText('Salin rekap WA'); // bukan "Tersalin"
  await foto(page, testInfo, 'sheet-salin-manual', { fullPage: false });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('keranjang: memuat, error jaringan, tidak ditemukan, customer diarsipkan (409)', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const m = isMobile(testInfo);
  const r = page.request;
  const po = await apiJson(r, 'POST', '/open-po', { nama: `State ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(r, 'POST', '/customer', { nama: `Nia ${sfx}`, no_wa: sfx === 'M' ? '081377760001' : '081377760002' });
  const url = `/keranjang.html?po=${po.id}&customer=${c.id}`;

  // Loading: skeleton ringkasan + 3 baris. Lalu error jaringan → EmptyState + Coba lagi.
  let lepas;
  const tahan = new Promise((ok) => (lepas = ok));
  await page.route(`**/api/v1/open-po/${po.id}/keranjang/${c.id}`, async (route) => {
    await tahan;
    await route.abort('internetdisconnected');
  });
  await page.goto(url);
  await expect(page.locator('#memuat [data-skeleton]').first()).toBeVisible();
  await expect(page.locator('#memuat [data-skeleton]')).toHaveCount(2);
  await foto(page, testInfo, 'keranjang-memuat');
  lepas();
  await expect(page.getByText('Data tidak bisa dimuat. Periksa koneksi, lalu coba lagi.')).toBeVisible();
  await expect(page.locator('#sticky-bar')).toBeHidden();
  await foto(page, testInfo, 'keranjang-error');
  await page.unroute(`**/api/v1/open-po/${po.id}/keranjang/${c.id}`);
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Nia ${sfx}` })).toBeVisible();

  // Customer diarsipkan saat sheet terbuka → simpan barang ditolak 409, isi form tetap.
  const form = await formTambahBarang(page, testInfo);
  const f = field(form);
  await f.nama.fill('Barang A');
  await f.harga.fill('24,95');
  await apiJson(r, 'POST', `/customer/${c.id}/arsip`);
  await form.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(form.getByRole('alert').filter({ hasText: 'Customer ini sudah diarsipkan.' })).toBeVisible();
  await expect(f.nama).toHaveValue('Barang A');
  if (m) {
    await form.getByRole('button', { name: 'Tutup', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Tutup', exact: true }).click();
  }
  // Keranjang dimuat ulang: banner arsip, tombol tambah barang & catat pembayaran disembunyikan.
  const bannerArsip = page.locator('#banner-arsip');
  await expect(bannerArsip).toHaveText('Customer ini sudah diarsipkan. Barang dan pembayaran baru tidak bisa dicatat.');
  await expect(page.getByRole('button', { name: '+ Tambah barang' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Catat pembayaran' })).toHaveCount(0);
  await expect(page.getByText(`Belum ada barang untuk Nia ${sfx}.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tambah barang', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-salin-rekap]:visible')).toBeVisible(); // rekap tetap bisa
  await page.reload();
  await expect(bannerArsip).toBeVisible();
  await expect(page.locator('#kartu-form-barang')).toBeHidden();
  await fotoKeranjang(page, testInfo, 'keranjang-arsip');

  // Open PO / customer tidak ada.
  await page.goto('/keranjang.html?po=999999&customer=1');
  await expect(page.getByText('Open PO tidak ditemukan.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lihat daftar Open PO' })).toBeVisible();
  await page.goto(`/keranjang.html?po=${po.id}&customer=999999`);
  await expect(page.getByText('Customer tidak ditemukan.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke Open PO' })).toHaveAttribute('href', `po.html?id=${po.id}`);
});
