// Smoke test komponen yang belum dipakai layar tahap 1 (Sheet dipakai di tahap 2):
// fokus terkunci, Esc + konfirmasi "Tutup tanpa menyimpan?", fokus kembali ke pemicu,
// bottom sheet di mobile dan dialog tengah di desktop (ui-spec §4.5, §12.5).
import { expect, isMobile, masukLewatApi, test } from './bantu.mjs';

test('Sheet: fokus, Esc dengan konfirmasi, fokus kembali ke pemicu', async ({ page }, testInfo) => {
  await masukLewatApi(page);
  await page.goto('/pengaturan.html');
  await expect(page.getByLabel('Default markup')).toBeVisible();

  await page.evaluate(async () => {
    const { bukaSheet } = await import('/js/ui/dialog.js');
    const { h } = await import('/js/lib/dom.js');
    const pemicu = h('button', { type: 'button', id: 'pemicu-uji' }, 'Pemicu');
    document.body.append(pemicu);
    pemicu.addEventListener('click', () => {
      const input = h('input', { id: 'isi-uji', 'aria-label': 'Isian uji' });
      bukaSheet({ judul: 'Sheet uji', isi: h('div', {}, input), adaPerubahan: () => input.value !== '' });
    });
  });
  await page.locator('#pemicu-uji').focus();
  await page.keyboard.press('Enter');

  const sheet = page.getByRole('dialog', { name: 'Sheet uji' });
  await expect(sheet).toBeVisible();
  await expect(page.getByLabel('Isian uji')).toBeFocused();
  const vp = page.viewportSize();
  // Tunggu animasi naik dari bawah (200 ms) selesai sebelum mengukur posisi.
  await expect.poll(async () => {
    const b = await sheet.boundingBox();
    return Math.round(isMobile(testInfo) ? b.y + b.height : b.x + b.width / 2);
  }).toBe(isMobile(testInfo) ? vp.height : vp.width / 2);
  const kotak = await sheet.boundingBox();
  if (isMobile(testInfo)) {
    expect(Math.round(kotak.width)).toBe(vp.width); // bottom sheet selebar layar, menempel di bawah
  } else {
    expect(Math.abs(kotak.x + kotak.width / 2 - vp.width / 2)).toBeLessThan(2); // tengah
    expect(kotak.width).toBeLessThanOrEqual(512);
  }

  await page.keyboard.type('abc');
  await page.keyboard.press('Escape');
  const konfirmasi = page.getByRole('alertdialog', { name: 'Tutup tanpa menyimpan?' });
  await expect(konfirmasi).toBeVisible();
  await expect(konfirmasi.getByRole('button', { name: 'Kembali ke form' })).toBeFocused();
  await konfirmasi.getByRole('button', { name: 'Kembali ke form' }).click();
  await expect(konfirmasi).toHaveCount(0);
  await expect(sheet).toBeVisible();

  await sheet.getByRole('button', { name: 'Tutup' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('#pemicu-uji')).toBeFocused();
});
