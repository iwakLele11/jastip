// Pembantu browser untuk uji UI bagian B (qa/ui/*.mjs): peluncuran Chromium / WebKit / Firefox
// di sandbox, profil perangkat per lebar layar, pemantauan error halaman, login, dan audit
// tata letak yang dijalankan di dalam halaman.
//
// Env (diisi .tools/dev-stack.sh): APP_URL, ADMIN_USER, ADMIN_PASSWORD, PLAYWRIGHT_BROWSERS_PATH, NODE_PATH
// Env opsional: QA_WEBKIT_EXEC, QA_FIREFOX_EXEC (wrapper, lihat qa/tools/setup-*.{py,sh}),
//               QA_BROWSER (mis. "chromium,webkit"), QA_LAYAR (mis. "360,1440")
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(`${process.env.NODE_PATH ?? '/projects/sandbox/.tools/pw/node_modules'}/`);
export const pw = require('playwright');
export const { devices } = pw;
export const T = '/projects/sandbox/.tools';
export const APP_URL = process.env.APP_URL;
export const ORIGIN = APP_URL ? new URL(APP_URL).origin : null;
export const FOLDER_FOTO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/qa/screenshots');

const EXEC = {
  webkit: process.env.QA_WEBKIT_EXEC ?? `${T}/webkit-wpe/run.sh`,
  firefox: process.env.QA_FIREFOX_EXEC ?? `${T}/firefox-run/run.sh`,
};

/** Browser yang diuji. "chromium" mewakili Chrome dan Edge (mesin Blink yang sama). */
export const BROWSER = (process.env.QA_BROWSER ?? 'chromium,webkit,firefox').split(',').map((s) => s.trim()).filter(Boolean);

/** Lebar × tinggi layar. 320×568 (iPhone SE 1) dan 360×640 = layar pendek untuk cek sheet. */
export const LAYAR_SEMUA = [
  { w: 320, h: 568 }, { w: 360, h: 640 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 },
];
export const LAYAR = process.env.QA_LAYAR
  ? LAYAR_SEMUA.filter((l) => process.env.QA_LAYAR.split(',').map(Number).includes(l.w))
  : LAYAR_SEMUA;

export async function luncurkan(nama) {
  const opsi = { headless: true, timeout: 60000 };
  if (nama === 'chromium') opsi.args = ['--no-sandbox'];
  if (nama === 'webkit' || nama === 'firefox') opsi.executablePath = EXEC[nama];
  return pw[nama].launch(opsi);
}

/**
 * Opsi context per browser × layar.
 * - chromium: < 768 = HP Android (isMobile, sentuh, UA Pixel 7); 768 = tablet sentuh; ≥ 1024 = laptop.
 * - webkit: < 768 = iPhone (UA + isMobile dari devices['iPhone 15'] / ['iPhone SE']), 768/1024 = iPad,
 *   1440 = Safari desktop.
 * - firefox: isMobile tidak didukung Playwright; viewport + sentuh saja.
 */
export function profil(browser, { w, h }) {
  const viewport = { width: w, height: h };
  const dasar = { viewport, locale: 'id-ID', timezoneId: 'Asia/Jakarta', deviceScaleFactor: 1, baseURL: APP_URL };
  const hp = w < 768;
  const tablet = w >= 768 && w < 1024;
  if (browser === 'chromium') {
    if (hp || tablet) return { ...dasar, isMobile: true, hasTouch: true, userAgent: devices[hp ? 'Pixel 7' : 'Galaxy Tab S4'].userAgent };
    return dasar;
  }
  if (browser === 'webkit') {
    if (hp) return { ...dasar, isMobile: true, hasTouch: true, userAgent: devices[w <= 320 ? 'iPhone SE' : 'iPhone 15'].userAgent };
    if (w <= 1024) return { ...dasar, isMobile: true, hasTouch: true, userAgent: devices['iPad (gen 7)'].userAgent };
    return { ...dasar, userAgent: devices['Desktop Safari'].userAgent };
  }
  return { ...dasar, hasTouch: hp || tablet };
}

export const labelProfil = (browser, { w, h }) => `${browser} ${w}×${h}`;
/** Layar yang dipakai dengan jari (HP, tablet): target sentuh 44 px diperiksa. */
export const layarSentuh = ({ w }) => w < 1024;

// ---------- Pemantauan halaman ----------

const apiPath = (url) => {
  try {
    return new URL(url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

/**
 * Catat masalah di halaman: console.error (selain "Failed to load resource" untuk API yang
 * memang diuji), pageerror, aset gagal / ≥ 400, pelanggaran CSP, dialog JavaScript.
 * Mengembalikan objek { masalah: string[], csp: string[], dialog: string[], reset() }.
 */
export function pantau(page, { statusApiBoleh = [401, 404, 409, 422, 502] } = {}) {
  const m = { masalah: [], csp: [], dialog: [], asetGagal: [] };
  m.reset = () => {
    m.masalah.length = 0;
    m.csp.length = 0;
    m.dialog.length = 0;
    m.asetGagal.length = 0;
  };
  page.__qa = m;
  m.diam = false;
  m.diabaikan = 0;
  page.on('console', (msg) => {
    const teks = msg.text();
    // Screenshot Playwright di WebKit menyisipkan <style> yang ditolak CSP halaman: artefak alat uji.
    if (m.diam && /Refused to apply a stylesheet/.test(teks)) {
      m.diabaikan += 1;
      return;
    }
    if (/Content[- ]Security[- ]Policy|Refused to (load|execute|apply|connect|frame)/i.test(teks)) m.csp.push(teks.slice(0, 300));
    if (msg.type() !== 'error') return;
    const url = msg.location()?.url ?? '';
    if (/Failed to load resource/i.test(teks) && apiPath(url)) return;
    // WebKit menulis error untuk respons API ≥ 400 tanpa URL lokasi; Firefox tidak menulisnya.
    if (/Failed to load resource: the server responded with a status of (401|404|409|422|502)/.test(teks)) return;
    m.masalah.push(`console.error: ${teks.slice(0, 300)} (${url})`);
  });
  page.on('pageerror', (e) => m.masalah.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText ?? '';
    if (apiPath(r.url())) return;
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load request cancelled/i.test(err)) return;
    m.asetGagal.push(`${r.url()} ${err}`);
    m.masalah.push(`requestfailed: ${r.url()} ${err}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (apiPath(r.url()) && statusApiBoleh.includes(r.status())) return;
    if (!apiPath(r.url())) m.asetGagal.push(`HTTP ${r.status()} ${r.url()}`);
    m.masalah.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('dialog', async (d) => {
    m.dialog.push(`${d.type()}: ${d.message().slice(0, 200)}`);
    await d.dismiss().catch(() => {});
  });
  return m;
}

/** Init script: tangkap event securitypolicyviolation (lebih andal dari pesan console lintas browser). */
export async function pasangPenangkapCsp(context) {
  await context.addInitScript(() => {
    window.__qaCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__qaCsp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ''}:${e.lineNumber ?? ''}`);
    });
  });
}

// ---------- Sesi ----------

/** Login lewat API di context (cookie tersimpan di context). */
export async function masukApi(context, user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASSWORD) {
  const res = await context.request.post(`${APP_URL}/api/v1/auth/login`, {
    data: { nama_pengguna: user, kata_sandi: pass, klien: 'web' },
    headers: { Origin: ORIGIN },
  });
  if (res.status() !== 200) throw new Error(`login API ${res.status()} ${await res.text()}`);
}

/** Login lewat form login (seperti pengguna). */
export async function masukUi(page, user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASSWORD) {
  await page.goto('/login.html');
  await page.fill('#nama-pengguna', user);
  await page.fill('#kata-sandi', pass);
  await page.click('#tombol-masuk');
  await page.waitForURL((u) => !u.pathname.endsWith('/login.html'), { timeout: 15000 });
}

export async function apiJson(context, method, url, data) {
  const res = await context.request.fetch(`${APP_URL}/api/v1${url}`, {
    method,
    data: data ?? (method === 'GET' ? undefined : {}),
    headers: method === 'GET' ? {} : { Origin: ORIGIN },
  });
  const body = res.status() === 204 ? null : await res.json().catch(() => null);
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${JSON.stringify(body)}`);
  return body?.data ?? null;
}

export async function foto(page, nama, opsi = {}) {
  const file = path.join(FOLDER_FOTO, `${nama}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  const m = page.__qa;
  if (m) m.diam = true;
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', ...opsi }).catch(() => {});
  if (m) {
    await tidur(150);
    m.diam = false;
  }
  return path.relative(path.resolve(FOLDER_FOTO, '../..'), file);
}

export const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Audit tata letak (dijalankan di halaman) ----------

/**
 * Audit satu state layar. Mengembalikan:
 *   hscroll    : null atau {scrollWidth, clientWidth, pelaku[]}
 *   keluar     : elemen terlihat yang keluar dari viewport secara horizontal (di luar wadah scroll)
 *   terpotong  : teks yang meluber dari kotaknya / terpotong tanpa elipsis
 *   elipsis    : teks yang sengaja dipotong (truncate), untuk dicatat
 *   tumpang    : pasangan elemen interaktif yang saling bertumpuk
 *   tertutup   : elemen interaktif yang tetap tertutup elemen lain setelah di-scroll ke tengah
 *                (mis. tertutup sticky bar / FAB di posisi scroll paling bawah)
 *   kecil      : target sentuh < 44×44 px (hanya jika opsi.sentuh)
 *   modal      : untuk dialog terbuka: muat di viewport? isi bisa di-scroll sampai tombol terakhir?
 */
export async function audit(page, opsi = {}) {
  return page.evaluate(async ({ sentuh: cekSentuh, cekTertutup = true }) => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const nama = (el) => {
      const t = (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      const id = el.id ? `#${el.id}` : '';
      return `${el.tagName.toLowerCase()}${id}${t ? ` "${t}"` : ''}`;
    };
    const terlihat = (el) => {
      if (!el.isConnected) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (el.closest('.sr-only, [hidden], [aria-hidden="true"]')) return false;
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
      return true;
    };
    // Konten di luar dialog modal tidak bisa disentuh: hanya periksa isi modal teratas kalau ada.
    const modal = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1) ?? null;
    const akar = modal ?? document.body;
    const dalamScrollX = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    const posisiTetap = (el) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === 'fixed' || pos === 'sticky') return p;
        if (p.tagName === 'DIALOG') return p;
      }
      return null;
    };
    const hasil = { hscroll: null, keluar: [], terpotong: [], elipsis: [], tumpang: [], tertutup: [], kecil: [], modal: null };

    const de = document.documentElement;
    const semua = [...akar.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'svg', 'path', 'TEMPLATE'].includes(el.tagName));
    const vis = semua.filter(terlihat);
    if (modal) {
      // Dialog modal yang isinya lebih lebar dari kotaknya (bisa di-scroll ke samping / terpotong).
      const lebar = [modal, ...modal.querySelectorAll('*')].find((e) => e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX));
      if (lebar) hasil.hscroll = { scrollWidth: lebar.scrollWidth, clientWidth: lebar.clientWidth, pelaku: [`di dalam dialog: ${nama(lebar)}`] };
    } else if (de.scrollWidth > de.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1) {
      const pelaku = vis.filter((el) => el.getBoundingClientRect().right > vw + 1 && !dalamScrollX(el)).map(nama);
      hasil.hscroll = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, pelaku: [...new Set(pelaku)].slice(0, 6) };
    }
    for (const el of vis) {
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !dalamScrollX(el) && !posisiTetap(el)?.matches?.('[data-toast-wilayah], #toast')) {
        hasil.keluar.push(`${nama(el)} [${Math.round(r.left)}–${Math.round(r.right)} dari ${vw}]`);
      }
      const adaTeks = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!adaTeks) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline') continue;
      const lebih = el.scrollWidth - el.clientWidth;
      if (lebih > 1 && el.clientWidth > 0) {
        if (cs.textOverflow === 'ellipsis') hasil.elipsis.push(nama(el));
        else if (['hidden', 'clip'].includes(cs.overflowX)) hasil.terpotong.push(`${nama(el)} terpotong ${lebih}px`);
        else if (cs.overflowX === 'visible') hasil.terpotong.push(`${nama(el)} meluber ${lebih}px`);
      }
    }
    // Elemen interaktif
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=option], [role=button], [tabindex]:not([tabindex="-1"])';
    const inter = [...akar.querySelectorAll(sel)].filter((el) => {
      if (!terlihat(el)) return false;
      // Radio segmented/chip: input transparan menutupi label (target = label).
      return true;
    });
    const kotak = inter.map((el) => ({ el, r: el.getBoundingClientRect(), tetap: modal ? null : posisiTetap(el) }));
    for (let i = 0; i < kotak.length; i++) {
      for (let j = i + 1; j < kotak.length; j++) {
        const a = kotak[i];
        const b = kotak[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // Konten yang di-scroll di bawah bar tetap (sticky/fixed) bukan tumpang; itu diperiksa "tertutup".
        if (a.tetap !== b.tetap) continue;
        // label pembungkus radio (input menutupi label) bukan tumpang
        if (a.el.closest('label') && a.el.closest('label') === b.el.closest('label')) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 2 && y > 2) hasil.tumpang.push(`${nama(a.el)} ⟂ ${nama(b.el)} (${Math.round(x)}×${Math.round(y)}px)`);
      }
    }
    if (cekSentuh) {
      for (const { el, r } of kotak) {
        if (el.matches('input[type=radio], input[type=checkbox]')) {
          const l = el.closest('label');
          const rl = l ? l.getBoundingClientRect() : r;
          if (rl.width >= 44 && rl.height >= 44) continue;
        }
        // Input di dalam grup berbingkai (prefix/suffix, stepper): targetnya grup 44 px.
        if (el.matches('input') && el.parentElement) {
          const p = el.parentElement;
          const rp = p.getBoundingClientRect();
          if (getComputedStyle(p).borderTopWidth !== '0px' && rp.height >= 43.5 && r.width >= 44) continue;
        }
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
          const sebaris = el.closest('p') && el.matches('a');
          hasil.kecil.push(`${nama(el)} ${Math.round(r.width)}×${Math.round(r.height)}${sebaris ? ' (tautan dalam kalimat)' : ''}`);
        }
      }
    }
    // Tertutup: scroll setiap elemen interaktif (bukan di bar tetap) ke tengah, lalu hit-test.
    if (cekTertutup) {
      const scrollAwal = [window.scrollX, window.scrollY];
      const wadahModal = modal ? [...modal.querySelectorAll('*')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight) : null;
      const scrollModalAwal = wadahModal?.scrollTop ?? 0;
      for (const { el } of kotak) {
        if (!modal && posisiTetap(el)) continue;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
        const cy = r.top + Math.min(r.height / 2, 20);
        if (cy < 0 || cy > vh) {
          hasil.tertutup.push(`${nama(el)} tidak bisa di-scroll ke layar (y=${Math.round(cy)})`);
          continue;
        }
        const atas = document.elementFromPoint(cx, cy);
        const label = el.closest('label');
        if (atas && !(el === atas || el.contains(atas) || atas.contains(el) || (label && label.contains(atas)))) {
          const penutup = posisiTetap(atas) ?? atas;
          hasil.tertutup.push(`${nama(el)} tertutup ${nama(penutup).slice(0, 60)}`);
        }
      }
      window.scrollTo({ left: scrollAwal[0], top: scrollAwal[1], behavior: 'instant' });
      if (wadahModal) wadahModal.scrollTop = scrollModalAwal;
    }
    if (modal) {
      const r = modal.getBoundingClientRect();
      const wadah = [...modal.querySelectorAll('*')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const tombol = [...modal.querySelectorAll('button')].filter(terlihat);
      const terakhir = tombol.at(-1);
      let terakhirTerjangkau = null;
      if (terakhir) {
        terakhir.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        const rt = terakhir.getBoundingClientRect();
        const atas = document.elementFromPoint(rt.left + rt.width / 2, rt.top + rt.height / 2);
        terakhirTerjangkau = rt.top >= 0 && rt.bottom <= vh + 1 && Boolean(atas && (terakhir === atas || terakhir.contains(atas)));
      }
      hasil.modal = {
        judul: modal.querySelector('h2')?.textContent?.trim().slice(0, 60) ?? null,
        atas: Math.round(r.top), bawah: Math.round(r.bottom), tinggi: Math.round(r.height), vh,
        muat: r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1,
        bisaScroll: wadah ? wadah.scrollHeight > wadah.clientHeight : false,
        scrollHeight: wadah?.scrollHeight ?? null, clientHeight: wadah?.clientHeight ?? null,
        tombolTerakhir: terakhir ? nama(terakhir) : null, terakhirTerjangkau,
      };
      if (wadah) wadah.scrollTop = 0;
    }
    const uniq = (a) => [...new Set(a)];
    for (const k of ['keluar', 'terpotong', 'elipsis', 'tumpang', 'tertutup', 'kecil']) hasil[k] = uniq(hasil[k]).slice(0, 12);
    return hasil;
  }, { sentuh: Boolean(opsi.sentuh), cekTertutup: opsi.cekTertutup !== false });
}

/** Ringkas hasil audit jadi daftar temuan (string), kosong = bersih. `abaikan` = regex per jenis. */
export function temuanAudit(a, { abaikan = {} } = {}) {
  const t = [];
  const saring = (jenis, daftar) => daftar.filter((x) => !(abaikan[jenis] && abaikan[jenis].test(x)));
  if (a.hscroll) t.push(`scroll horizontal ${a.hscroll.scrollWidth}>${a.hscroll.clientWidth}: ${a.hscroll.pelaku.join('; ')}`);
  for (const jenis of ['keluar', 'terpotong', 'tumpang', 'tertutup', 'kecil']) {
    const d = saring(jenis, a[jenis]);
    if (d.length) t.push(`${jenis}: ${d.join('; ')}`);
  }
  if (a.modal && (!a.modal.muat || a.modal.terakhirTerjangkau === false)) t.push(`modal "${a.modal.judul}": ${JSON.stringify(a.modal)}`);
  return t;
}
