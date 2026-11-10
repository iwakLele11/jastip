// Alur tahap 1 (ui-spec §6.2, §6.3, §6.9, §7.1–§7.9) di 360×740 (mobile) dan 1280×800 (desktop).
import {
  ADMIN_PASSWORD, ADMIN_USER, akhiran, apiJson, expect, foto, isMobile, masukLewatApi, setModeKurs, test, toast,
} from './bantu.mjs';

const KURS_OTOMATIS = { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' };

async function bukaFormPoBaru(page, testInfo) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Open PO' })).toBeVisible();
  const nama = isMobile(testInfo) ? '+ Open PO' : '+ Open PO baru';
  await page.getByRole('link', { name: nama, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Open PO baru' })).toBeVisible();
}

test('login gagal lalu sukses', async ({ page }, testInfo) => {
  await page.goto('/login.html');
  await expect(page.getByRole('heading', { level: 1, name: 'Jastip Admin' })).toBeVisible();
  await foto(page, testInfo, 'login');

  const nama = page.getByLabel('Nama pengguna');
  const sandi = page.getByLabel('Kata sandi', { exact: true });

  // Validasi klien: field kosong.
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByText('Isi nama pengguna.')).toBeVisible();
  await expect(page.getByText('Isi kata sandi.')).toBeVisible();
  await expect(nama).toHaveAttribute('aria-invalid', 'true');
  await expect(nama).toBeFocused();

  // Kata sandi salah → banner umum, kata sandi dikosongkan, fokus ke kata sandi.
  await nama.fill(ADMIN_USER);
  await sandi.fill('kata-sandi-salah');
  await page.getByRole('button', { name: 'Tampilkan kata sandi' }).click();
  await expect(sandi).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sembunyikan kata sandi' }).click();
  await expect(sandi).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nama pengguna atau kata sandi salah.');
  await expect(sandi).toHaveValue('');
  await expect(sandi).toBeFocused();
  await foto(page, testInfo, 'login-gagal');

  // Sukses (Enter di kata sandi = Masuk) → Daftar Open PO.
  await sandi.fill(ADMIN_PASSWORD);
  await sandi.press('Enter');
  await expect(page).toHaveURL(/\/(index\.html)?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Open PO' })).toBeVisible();
  const navAktif = page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Open PO' });
  await expect(navAktif).toHaveAttribute('aria-current', 'page');
  // Database e2e baru dibuat: run pertama melihat EmptyState daftar Open PO.
  const kosong = page.getByText('Belum ada Open PO. Buat Open PO pertama untuk mulai mencatat pesanan.');
  await expect(kosong.or(page.getByRole('heading', { level: 2, name: /^Buka/ }))).toBeVisible();
  if (await kosong.isVisible()) await foto(page, testInfo, 'open-po-kosong');
});

test('buat Open PO dengan kurs otomatis (13.054)', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await bukaFormPoBaru(page, testInfo);

  const kartu = page.locator('#panel-otomatis');
  await expect(kartu.getByText('1 AUD = Rp13.054')).toBeVisible();
  await expect(kartu.getByText('Kurs pasar Rp12.673 (25 Okt 2026)')).toBeVisible();
  await expect(kartu.getByText('+ buffer 3%')).toBeVisible();
  await expect(kartu.getByText('Sumber: Frankfurter')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Otomatis' })).toBeChecked();
  await expect(page.getByText('AUD (Dolar Australia)')).toBeVisible();
  await foto(page, testInfo, 'open-po-form-otomatis');

  // Nama kosong → error di bawah field + fokus.
  await page.getByRole('button', { name: 'Simpan Open PO' }).click();
  await expect(page.getByText('Nama Open PO wajib diisi.')).toBeVisible();
  await expect(page.getByLabel('Nama Open PO')).toBeFocused();

  const namaPo = `Australia Nov 2026 ${akhiran(testInfo)}`;
  await page.getByLabel('Nama Open PO').fill(namaPo);
  await page.getByRole('button', { name: 'Simpan Open PO' }).click();

  await expect(page).toHaveURL(/\/po\.html\?id=\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: namaPo })).toBeVisible();
  await expect(toast(page)).toHaveText('Open PO dibuat.');
  const kurs = page.locator('[data-kurs-card]');
  await expect(kurs.getByText('1 AUD = Rp13.054')).toBeVisible();
  await expect(kurs.getByText('Pasar Rp12.673 (25 Okt 2026)')).toBeVisible();
  await expect(kurs.getByText('+ buffer 3%')).toBeVisible();
  await expect(kurs.getByText('Otomatis')).toBeVisible();
  await expect(kurs.getByRole('link', { name: 'Ubah kurs' })).toBeVisible();
  await expect(page.getByText('Belum ada customer di Open PO ini.')).toBeVisible();
  await foto(page, testInfo, 'open-po-detail-kosong');

  // Refresh tetap di layar yang sama; tombol kembali browser ke daftar.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: namaPo })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Open PO' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(namaPo) })).toBeVisible();
});

test('buat Open PO saat kurs gagal diambil → kurs manual', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await setModeKurs(page.request, 'gagal');
  try {
    await bukaFormPoBaru(page, testInfo);
    const banner = page.getByRole('alert').filter({ hasText: 'Kurs otomatis gagal diambil' });
    await expect(banner).toHaveText(/Kurs otomatis gagal diambil\. Isi kurs manual, atau coba lagi\./);
    await expect(page.getByRole('radio', { name: 'Manual' })).toBeChecked();
    await expect(page.getByLabel('Kurs jastip (Rp per 1 AUD)')).toBeVisible();
    await expect(page.getByLabel('Kurs jastip (Rp per 1 AUD)')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByText('Angka ini dipakai apa adanya, tanpa buffer.')).toBeVisible();

    const namaPo = `Australia Des 2026 ${akhiran(testInfo)}`;
    await page.getByLabel('Nama Open PO').fill(namaPo);
    await page.getByRole('button', { name: 'Simpan Open PO' }).click();
    await expect(page.getByText('Kurs wajib diisi. Ambil kurs otomatis atau isi manual.')).toBeVisible();
    await expect(page.getByLabel('Kurs jastip (Rp per 1 AUD)')).toBeFocused();
    await foto(page, testInfo, 'open-po-form-kurs-gagal');

    await page.getByLabel('Kurs jastip (Rp per 1 AUD)').fill('13054,5');
    await page.getByRole('button', { name: 'Simpan Open PO' }).click();
    await expect(page.getByText('Isi angka saja, mis. 13054.')).toBeVisible();

    await page.getByLabel('Kurs jastip (Rp per 1 AUD)').fill('13100');
    await page.getByRole('button', { name: 'Simpan Open PO' }).click();
    await expect(page).toHaveURL(/\/po\.html\?id=\d+$/);
    const kurs = page.locator('[data-kurs-card]');
    await expect(kurs.getByText('1 AUD = Rp13.100')).toBeVisible();
    await expect(kurs.getByText('Manual', { exact: true })).toBeVisible();
    await expect(kurs.getByText('Diisi manual, tanpa buffer')).toBeVisible();
    await expect(kurs.getByText('Kurs pasar tidak tersedia')).toBeVisible();

    // "Coba lagi" setelah layanan kurs pulih → kembali ke Otomatis. Pilih Manual → terisi 13054.
    await bukaFormPoBaru(page, testInfo);
    await expect(page.getByRole('radio', { name: 'Manual' })).toBeChecked();
    await setModeKurs(page.request, 'ok');
    await page.getByRole('button', { name: 'Coba lagi' }).click();
    await expect(page.locator('#panel-otomatis').getByText('1 AUD = Rp13.054')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Otomatis' })).toBeChecked();
    await expect(page.getByText('Kurs otomatis gagal diambil')).toHaveCount(0);
    await page.getByText('Manual', { exact: true }).click();
    await expect(page.getByLabel('Kurs jastip (Rp per 1 AUD)')).toHaveValue('13054');
    await foto(page, testInfo, 'open-po-form-manual');
  } finally {
    await setModeKurs(page.request, 'ok');
  }
});

test('ubah nama Open PO', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const po = await apiJson(page.request, 'POST', '/open-po', { nama: `Australia Jan 2027 ${akhiran(testInfo)}`, kurs: KURS_OTOMATIS });

  await page.goto(`/po.html?id=${po.id}`);
  await page.getByRole('link', { name: 'Ubah', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ubah Open PO' })).toBeVisible();
  await expect(page.getByLabel('Nama Open PO')).toHaveValue(po.nama);
  await expect(page.getByRole('radio', { name: 'Buka' })).toBeChecked();
  await expect(page.locator('#panel-otomatis').getByText('1 AUD = Rp13.054')).toBeVisible();
  await foto(page, testInfo, 'open-po-form-ubah');

  const namaBaru = `Australia Feb 2027 ${akhiran(testInfo)}`;
  await page.getByLabel('Nama Open PO').fill(namaBaru);
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page).toHaveURL(new RegExp(`/po\\.html\\?id=${po.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: namaBaru })).toBeVisible();
  await expect(toast(page)).toHaveText('Perubahan disimpan.');

  // Kurs tidak ikut dikirim karena tidak diubah: masih otomatis 13.054.
  const sesudah = await apiJson(page.request, 'GET', `/open-po/${po.id}`);
  expect(sesudah.nama).toBe(namaBaru);
  expect(sesudah.kurs).toMatchObject({ mode: 'otomatis', kurs_jastip: 13054 });
});

test('kurs terkunci dari tab lain → konflik 409, tampilan terkunci', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const po = await apiJson(page.request, 'POST', '/open-po', { nama: `Australia Mar 2027 ${sfx}`, kurs: KURS_OTOMATIS });
  await page.goto(`/po-form.html?id=${po.id}`);
  await expect(page.getByRole('radio', { name: 'Otomatis' })).toBeChecked();

  // Tab lain: barang pertama disimpan → kurs terkunci.
  const c = await apiJson(page.request, 'POST', '/customer', { nama: `Kunci ${sfx}`, no_wa: sfx === 'M' ? '081299990001' : '081299990002' });
  await apiJson(page.request, 'POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'Barang A', harga_aud: '24,95', qty: 2, markup_persen: '10' });

  await page.getByText('Manual', { exact: true }).click();
  await page.getByLabel('Kurs jastip (Rp per 1 AUD)').fill('14000');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('alert')).toHaveText('Kurs sudah terkunci karena ada pesanan. Data kurs terbaru sudah dimuat.');
  const terkunci = page.locator('#kurs-terkunci');
  await expect(terkunci.getByText('Terkunci', { exact: true })).toBeVisible();
  await expect(terkunci.getByText('1 AUD = Rp13.054')).toBeVisible();
  await expect(terkunci.getByText('+ buffer 3% · Otomatis')).toBeVisible();
  await expect(terkunci.getByRole('button', { name: 'Ambil kurs terbaru' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('radio', { name: 'Manual' })).toBeHidden();
  await foto(page, testInfo, 'open-po-form-terkunci');

  // Simpan lagi tanpa kurs → berhasil. Detail: badge Terkunci, tautan "Ubah kurs" hilang.
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page).toHaveURL(new RegExp(`/po\\.html\\?id=${po.id}$`));
  const kurs = page.locator('[data-kurs-card]');
  await expect(kurs.getByText('Terkunci', { exact: true })).toBeVisible();
  await expect(kurs.getByRole('link', { name: 'Ubah kurs' })).toHaveCount(0);
  await expect(kurs.getByText('+ buffer 3% · Otomatis')).toBeVisible();
});

test('detail Open PO: daftar customer, chip filter status, tabel desktop', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const r = page.request;
  const po = await apiJson(r, 'POST', '/open-po', { nama: `Australia Nov 2026 QA ${sfx}`, kurs: KURS_OTOMATIS });
  const no = (i) => `08134567${sfx === 'M' ? '1' : '2'}${String(i).padStart(3, '0')}`;
  const barang = {
    A: { nama_barang: 'Barang A', harga_aud: '24,95', qty: 2, markup_persen: '10' },
    B: { nama_barang: 'Barang B', harga_aud: '8,50', qty: 3, markup_persen: '15' },
    C: { nama_barang: 'Barang C', harga_aud: '129,99', qty: 1, markup_persen: '8' },
  };
  const seed = [
    { nama: 'Rina', isi: ['A', 'B', 'C'], bayar: [1468000] }, // DP, sisa 1.467.000
    { nama: 'Sari', isi: ['A'], bayar: [] }, // Belum bayar
    { nama: 'Budi', isi: ['A'], bayar: [100000] }, // Kurang DP
    { nama: 'Dewi', isi: ['C'], bayar: [1833000] }, // Lunas
    { nama: 'Tono', isi: ['B'], bayar: [500000] }, // Lebih bayar 116.000
  ];
  for (const [i, s] of seed.entries()) {
    const c = await apiJson(r, 'POST', '/customer', { nama: `${s.nama} ${sfx}`, no_wa: no(i) });
    for (const k of s.isi) await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, barang[k]);
    for (const n of s.bayar) await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${c.id}/pembayaran`, { nominal: n, tanggal: '2026-10-28' });
  }

  await page.goto(`/po.html?id=${po.id}`);
  await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();
  const ringkasan = page.locator('[data-ringkasan-po]');
  // Total = 2.935.000 + 718.000 + 718.000 + 1.833.000 + 384.000; dana = 1.468.000 + 100.000 + 1.833.000 + 500.000
  await expect(ringkasan).toContainText('Customer5');
  await expect(ringkasan).toContainText('Total pesananRp6.588.000');
  await expect(ringkasan).toContainText('Dana diterimaRp3.901.000');
  await expect(page.locator('[data-kurs-card]').getByText('Terkunci', { exact: true })).toBeVisible();

  const grup = page.getByRole('group', { name: 'Filter status' });
  await expect(grup.getByRole('radio')).toHaveCount(6);
  for (const [label, n] of [['Semua', 5], ['Belum bayar', 1], ['Kurang DP', 1], ['DP', 1], ['Lunas', 1], ['Lebih bayar', 1]]) {
    await expect(grup.getByRole('radio', { name: `${label} ${n}`, exact: true })).toBeAttached();
  }
  await expect(grup.getByRole('radio', { name: 'Semua 5' })).toBeChecked();

  const daftar = isMobile(testInfo) ? page.locator('#daftar-customer ul') : page.locator('#daftar-customer table');
  await expect(daftar).toBeVisible();
  if (isMobile(testInfo)) {
    await expect(daftar.locator('li')).toHaveCount(5);
    await expect(daftar.locator('li').first()).toContainText(`Budi ${sfx}`); // urut A–Z
  } else {
    await expect(daftar.locator('tbody tr')).toHaveCount(5);
    await expect(daftar.getByRole('columnheader')).toHaveText(['Customer', 'No WA', 'Total', 'Dana diterima', 'Sisa', 'Status']);
    const tono = daftar.locator('tr', { hasText: `Tono ${sfx}` });
    await expect(tono).toContainText('Lebih Rp116.000');
    await expect(tono).toContainText('Lebih bayar');
    await expect(daftar.locator('tr', { hasText: `Rina ${sfx}` })).toContainText('Rp1.467.000');
  }
  await foto(page, testInfo, 'open-po-detail');

  // Filter Lunas: hanya Dewi; filter tersimpan di URL dan bertahan setelah refresh.
  await grup.getByText('Lunas').click();
  await expect(page).toHaveURL(/status=lunas/);
  await expect(page.locator('#daftar-customer').getByText(`Dewi ${sfx}`).filter({ visible: true })).toBeVisible();
  await expect(page.locator('#daftar-customer').getByText(`Rina ${sfx}`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Lunas 1' })).toBeChecked();
  await expect(page.locator('#daftar-customer').getByText(`Rina ${sfx}`)).toHaveCount(0);
  await foto(page, testInfo, 'open-po-detail-filter');

  // Ketuk baris → Keranjang customer tersebut → kembali (filter tetap).
  await page.locator('#daftar-customer').getByRole('link', { name: new RegExp(`Dewi ${sfx}`) }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/keranjang\\.html\\?po=${po.id}&customer=\\d+`));
  await expect(page.getByRole('heading', { level: 1, name: `Dewi ${sfx}` })).toBeVisible();
  await expect(page.locator('[data-ringkasan-keranjang]')).toContainText('Lunas');
  await page.getByRole('link', { name: 'Kembali', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Lunas 1' })).toBeChecked();
});

test('detail Open PO: filter tanpa hasil → Tampilkan semua', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const po = await apiJson(page.request, 'POST', '/open-po', { nama: `Filter kosong ${sfx}`, kurs: KURS_OTOMATIS });
  const c = await apiJson(page.request, 'POST', '/customer', { nama: `Lia ${sfx}`, no_wa: sfx === 'M' ? '081377710001' : '081377710002' });
  await apiJson(page.request, 'POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'Barang A', harga_aud: '24,95', qty: 1, markup_persen: '10' });

  await page.goto(`/po.html?id=${po.id}&status=lunas`);
  await expect(page.getByText('Tidak ada customer berstatus Lunas.')).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan semua' }).click();
  await expect(page.getByRole('radio', { name: 'Semua 1' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Semua 1' })).toBeFocused();
  await expect(page.locator('#daftar-customer').getByText(`Lia ${sfx}`).filter({ visible: true })).toBeVisible();
  await expect(page).not.toHaveURL(/status=/);
});

test('buat customer + peringatan no WA ganda', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const noWa = sfx === 'M' ? '081234567801' : '081234567802';

  await page.goto('/customer.html');
  await expect(page.getByRole('heading', { level: 1, name: 'Customer' })).toBeVisible();
  await page.getByRole('link', { name: isMobile(testInfo) ? '+ Customer' : '+ Customer baru', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Customer baru' })).toBeVisible();

  // Validasi klien.
  await page.getByRole('button', { name: 'Simpan customer' }).click();
  await expect(page.getByText('Nama wajib diisi.')).toBeVisible();
  await expect(page.getByText('No WA wajib diisi.')).toBeVisible();
  await page.getByLabel('No WA').fill('0812abc');
  await page.getByLabel('No WA').blur();
  await expect(page.getByText('No WA hanya boleh berisi angka.')).toBeVisible();

  await page.getByLabel('Nama').fill(`Mega ${sfx}`);
  await page.getByLabel('No WA').fill(`${noWa.slice(0, 4)}-${noWa.slice(4, 8)}-${noWa.slice(8)}`);
  await page.getByLabel('No WA').blur();
  await expect(page.getByLabel('No WA')).toHaveValue(noWa); // tanda hubung dibuang saat blur
  await page.getByLabel('Alamat (opsional)').fill('Jl. Melati 1, Bandung');
  await page.getByRole('button', { name: 'Simpan customer' }).click();
  await expect(page).toHaveURL(/\/customer\.html$/);
  await expect(toast(page)).toHaveText('Customer disimpan.');
  await expect(page.locator('#daftar').getByText(`Mega ${sfx}`).filter({ visible: true })).toBeVisible();

  // Customer kedua dengan no WA yang sama (format +62) → peringatan, simpan tetap boleh.
  await page.goto('/customer-form.html');
  await page.getByLabel('Nama').fill(`Mega Kedua ${sfx}`);
  await page.getByLabel('No WA').fill(`+62 ${noWa.slice(1, 4)} ${noWa.slice(4, 8)} ${noWa.slice(8)}`);
  await page.getByLabel('No WA').press('Tab');
  const peringatan = page.locator('#no-wa-peringatan');
  await expect(peringatan).toContainText(`No WA ini sudah terdaftar atas nama Mega ${sfx}.`);
  await expect(peringatan.getByRole('link', { name: `Lihat Mega ${sfx}` })).toBeVisible();
  await expect(page.getByLabel('No WA')).not.toHaveAttribute('aria-invalid', 'true');
  await foto(page, testInfo, 'customer-form-duplikat');
  await page.getByRole('button', { name: 'Simpan customer' }).click();
  await expect(toast(page)).toHaveText('Customer disimpan.');

  // Pencarian nama (tidak peka huruf besar/kecil) dan no WA (awalan 62 = 08).
  const cari = page.getByLabel('Cari nama atau no WA');
  await cari.fill(`mega kedua ${sfx.toLowerCase()}`);
  await expect(page.locator('#daftar').getByText(`Mega Kedua ${sfx}`).filter({ visible: true })).toBeVisible();
  await expect(page.locator('#daftar').getByText(`Mega ${sfx}`, { exact: true })).toHaveCount(0);
  await cari.fill(`62${noWa.slice(1)}`);
  await expect(page.locator('#daftar').getByText(`Mega ${sfx}`, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.locator('#daftar').getByText(`Mega Kedua ${sfx}`).filter({ visible: true })).toBeVisible();
  await page.reload(); // teks pencarian bertahan (disimpan di hash URL)
  await expect(cari).toHaveValue(`62${noWa.slice(1)}`);
  await cari.fill('zzz tidak ada');
  await expect(page.getByText('Tidak ada customer dengan nama atau no WA "zzz tidak ada".')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buat customer "zzz tidak ada"' })).toBeVisible();
  await page.getByRole('button', { name: 'Hapus pencarian' }).click();
  await expect(cari).toHaveValue('');
  await expect(page.locator('#daftar').getByText(`Mega ${sfx}`, { exact: true }).filter({ visible: true })).toBeVisible();
  await foto(page, testInfo, 'customer-list');
});

test('customer: hapus (tanpa pesanan) dan arsipkan (punya pesanan)', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  const sfx = akhiran(testInfo);
  const r = page.request;
  const kosong = await apiJson(r, 'POST', '/customer', { nama: `Hapus Saya ${sfx}`, no_wa: sfx === 'M' ? '081355510001' : '081355510002' });
  const berisi = await apiJson(r, 'POST', '/customer', { nama: `Arsip Saya ${sfx}`, no_wa: sfx === 'M' ? '081355520001' : '081355520002' });
  const po = await apiJson(r, 'POST', '/open-po', { nama: `PO arsip ${sfx}`, kurs: KURS_OTOMATIS });
  await apiJson(r, 'POST', `/open-po/${po.id}/keranjang/${berisi.id}/baris-pesanan`, { nama_barang: 'Barang A', harga_aud: '24,95', qty: 1, markup_persen: '10' });

  await page.goto(`/customer-form.html?id=${kosong.id}`);
  await expect(page.getByRole('heading', { level: 1, name: kosong.nama })).toBeVisible();
  await page.getByRole('button', { name: 'Hapus customer' }).click();
  const dialog = page.getByRole('alertdialog', { name: `Hapus ${kosong.nama}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeFocused();
  await foto(page, testInfo, 'customer-dialog-hapus', { fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hapus customer' })).toBeFocused();
  await page.getByRole('button', { name: 'Hapus customer' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect(page).toHaveURL(/\/customer\.html$/);
  await expect(toast(page)).toHaveText('Customer dihapus.');
  await expect(page.locator('#daftar').getByText(kosong.nama)).toHaveCount(0);

  await page.goto(`/customer-form.html?id=${berisi.id}`);
  await expect(page.getByText('Customer dengan pesanan diarsipkan, tidak dihapus.')).toBeVisible();
  await page.getByRole('button', { name: 'Arsipkan customer' }).click();
  const dArsip = page.getByRole('alertdialog', { name: `Arsipkan ${berisi.nama}?` });
  await expect(dArsip).toContainText('sudah punya pesanan, jadi tidak bisa dihapus.');
  await dArsip.getByRole('button', { name: 'Arsipkan' }).click();
  await expect(toast(page)).toHaveText('Customer diarsipkan.');
  await expect(page.locator('#daftar').getByText(berisi.nama)).toHaveCount(0);
});

test('ubah pengaturan', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await page.goto('/pengaturan.html');
  const markup = page.getByLabel('Default markup');
  const buffer = page.getByLabel('Buffer kurs AUD');
  const dp = page.getByLabel('DP', { exact: true });
  await expect(markup).toHaveValue('10');
  await expect(buffer).toHaveValue('3');
  await expect(dp).toHaveValue('50');
  await expect(markup).toHaveAttribute('inputmode', 'decimal');
  await foto(page, testInfo, 'pengaturan');

  await markup.fill('-1');
  await buffer.fill('3,555');
  await dp.fill('101');
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(page.getByText('Markup tidak boleh negatif.')).toBeVisible();
  await expect(page.getByText('Maksimal 2 angka di belakang koma.')).toBeVisible();
  await expect(page.getByText('DP harus antara 0 dan 100%.')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Periksa 3 isian yang ditandai.' })).toBeVisible();
  await expect(markup).toBeFocused();
  await foto(page, testInfo, 'pengaturan-error');

  await markup.fill('12,5');
  await buffer.fill('3');
  await dp.fill('50');
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(toast(page)).toHaveText('Pengaturan disimpan.');
  await expect(page.getByText('Periksa 3 isian yang ditandai.')).toHaveCount(0);
  await page.reload();
  await expect(markup).toHaveValue('12,5');
  const s = await apiJson(page.request, 'GET', '/pengaturan');
  expect(s).toMatchObject({ default_markup_persen: '12.5', buffer_aud_persen: '3', dp_persen: '50' });

  await apiJson(page.request, 'PATCH', '/pengaturan', { default_markup_persen: '10' });
});

test('logout', async ({ page }) => {
  await masukLewatApi(page);
  await page.goto('/index.html');
  await expect(page.getByRole('heading', { level: 1, name: 'Open PO' })).toBeVisible();
  await page.getByRole('link', { name: 'Pengaturan' }).filter({ visible: true }).click();
  await expect(page.getByLabel('Default markup')).toBeVisible();
  // Mobile: tombol Keluar di bawah Pengaturan. Desktop: di TopNav (tombol di Pengaturan disembunyikan).
  await expect(page.getByRole('button', { name: 'Keluar' }).filter({ visible: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Keluar' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login\.html$/);

  // Sesi sudah berakhir: tombol kembali browser dan halaman lain diarahkan ke login.
  await page.goBack();
  await expect(page).toHaveURL(/\/login\.html\?next=%2Findex\.html$/);
  await page.goto('/customer.html');
  await expect(page).toHaveURL(/\/login\.html\?next=%2Fcustomer\.html$/);
  await expect(page.getByText('Sesi berakhir.')).toHaveCount(0);
});

test('akses tanpa login → login → kembali ke halaman tujuan', async ({ page, request }, testInfo) => {
  // Data dibuat lewat context API terpisah (sesi sendiri); browser belum login.
  await request.post('/api/v1/auth/login', { data: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD } });
  const po = await apiJson(request, 'POST', '/open-po', { nama: `Tujuan ${akhiran(testInfo)}`, kurs: KURS_OTOMATIS });

  await page.goto(`/po.html?id=${po.id}&status=lunas`);
  await expect(page).toHaveURL(new RegExp(`/login\\.html\\?next=${encodeURIComponent(`/po.html?id=${po.id}&status=lunas`).replace(/[.?]/g, '\\$&')}$`));
  await page.getByLabel('Nama pengguna').fill(ADMIN_USER);
  await page.getByLabel('Kata sandi', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(new RegExp(`/po\\.html\\?id=${po.id}&status=lunas$`));
  await expect(page.getByRole('heading', { level: 1, name: po.nama })).toBeVisible();

  // `next` eksternal ditolak (open redirect) → beranda.
  await page.goto('/login.html?next=%2F%2Fevil.example%2F');
  await page.getByLabel('Nama pengguna').fill(ADMIN_USER);
  await page.getByLabel('Kata sandi', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/(index\.html)?$/);

  // Banner sesi berakhir.
  await page.goto('/login.html?alasan=sesi-berakhir');
  await expect(page.getByRole('status').filter({ hasText: 'Sesi berakhir. Silakan masuk lagi.' })).toBeVisible();
});

test('daftar Open PO', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: /^Buka \(\d+\)$/ })).toBeVisible();
  const kartuTerkunci = page.getByRole('link', { name: new RegExp(`Australia Nov 2026 QA ${akhiran(testInfo)}`) });
  await expect(kartuTerkunci).toContainText('Terkunci');
  await expect(kartuTerkunci).toContainText('5 customer · Rp6.588.000');
  await foto(page, testInfo, 'open-po-list');
});
