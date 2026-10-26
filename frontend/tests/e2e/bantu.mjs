// Fixture dan helper E2E: pemeriksaan console browser, login, seed data lewat API, screenshot.
import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };

export const ADMIN_USER = process.env.ADMIN_USER;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const FOLDER_FOTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/design/screenshots');

const apiPath = (url) => {
  try {
    return new URL(url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

// Status API yang memang diuji dan ditangani UI: 401 (login gagal / belum masuk),
// 404 (data tidak ada), 409 (konflik kurs), 422 (validasi), 502 (kurs gagal).
// Selain itu (400, 403, 415, 5xx) berarti klien API salah kirim → test gagal.
const STATUS_API_DIHARAPKAN = new Set([401, 404, 409, 422, 502]);

export const test = base.extend({
  page: async ({ page }, use) => {
    const masalah = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const url = msg.location()?.url ?? '';
      // Chrome menulis "Failed to load resource" untuk setiap respons HTTP ≥ 400. Untuk /api/*
      // itu respons yang sengaja diuji (lihat STATUS_API_DIHARAPKAN), bukan error aplikasi.
      if (/^Failed to load resource/.test(msg.text()) && apiPath(url)) return;
      masalah.push(`console.error: ${msg.text()} (${url})`);
    });
    page.on('pageerror', (e) => masalah.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText ?? '';
      if (apiPath(r.url()) || err === 'net::ERR_ABORTED') return;
      masalah.push(`requestfailed: ${r.url()} ${err}`);
    });
    page.on('response', (r) => {
      if (r.status() < 400) return;
      if (apiPath(r.url()) && STATUS_API_DIHARAPKAN.has(r.status())) return;
      masalah.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    });
    await use(page);
    expect(masalah, 'Tidak boleh ada error di console browser / request gagal').toEqual([]);
  },
});

export const isMobile = (testInfo) => testInfo.project.name === 'mobile';
/** Akhiran unik per viewport supaya data dua project tidak bertabrakan di DB yang sama. */
export const akhiran = (testInfo) => (isMobile(testInfo) ? 'M' : 'D');

/**
 * Screenshot ke docs/design/screenshots/{m|d}-{nama}.png. Mobile: satu layar 360×740 (bottom nav,
 * FAB, dan toast tampil di posisi aslinya). Desktop: satu halaman penuh.
 */
export async function foto(page, testInfo, nama, { fullPage = !isMobile(testInfo) } = {}) {
  const file = path.join(FOLDER_FOTO, `${isMobile(testInfo) ? 'm' : 'd'}-${nama}.png`);
  await page.screenshot({ path: file, fullPage, animations: 'disabled', caret: 'hide' });
}

/** Login lewat API; cookie sesi tersimpan di context browser (page.request berbagi cookie). */
export async function masukLewatApi(page) {
  const res = await page.request.post('/api/v1/auth/login', { data: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD } });
  expect(res.status()).toBe(200);
}

/** Request JSON ke API dengan sesi context yang sama; mengembalikan `data`. */
export async function apiJson(request, method, url, data) {
  const res = await request.fetch(`/api/v1${url}`, { method, data: data ?? (method === 'GET' ? undefined : {}) });
  const body = res.status() === 204 ? null : await res.json();
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${JSON.stringify(body)}`);
  return body?.data ?? null;
}

export async function setModeKurs(request, mode) {
  const res = await request.get(`/__dev/kurs-mode?set=${mode}`);
  expect(await res.text()).toBe(mode);
}

export const toast = (page) => page.locator('[data-toast]');

/** Izin clipboard untuk origin aplikasi (Salin rekap WA + membaca hasilnya di test). */
export async function izinkanClipboard(page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(process.env.APP_URL).origin });
}

export const bacaClipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

/**
 * Simulasi browser yang menolak Clipboard API (mis. izin ditolak / bukan HTTPS): semua
 * penulisan clipboard gagal dengan NotAllowedError. Dipasang sebelum halaman dimuat.
 */
export async function tolakClipboard(page) {
  await page.addInitScript(() => {
    const tolak = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
    if (navigator.clipboard) {
      navigator.clipboard.write = tolak;
      navigator.clipboard.writeText = tolak;
    }
  });
}
