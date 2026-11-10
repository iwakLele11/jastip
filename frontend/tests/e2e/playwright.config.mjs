// E2E Playwright. Dijalankan lewat dev-stack (npm run test:e2e), yang menyediakan APP_URL,
// ADMIN_USER, ADMIN_PASSWORD, dan PLAYWRIGHT_BROWSERS_PATH. Browser: chromium headless shell
// yang sudah terunduh (jangan menjalankan `playwright install`).
import { defineConfig } from '@playwright/test';

if (!process.env.APP_URL) {
  throw new Error('APP_URL tidak ada. Jalankan lewat: npm run test:e2e (memakai .tools/dev-stack.sh).');
}

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  outputDir: '.hasil',
  // Satu worker, berurutan: mode kurs stub (ok/gagal) dan batas login gagal bersifat global.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: process.env.APP_URL,
    browserName: 'chromium',
    headless: true,
    launchOptions: { args: ['--no-sandbox'] },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
});
