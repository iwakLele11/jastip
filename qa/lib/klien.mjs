// Klien HTTP kecil untuk uji API QA (Node 22, fetch bawaan). Menyimpan cookie sesi sendiri.
import { execFileSync } from 'node:child_process';

export const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:8090';
export const ADMIN_USER = process.env.ADMIN_USER ?? 'pemilik';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'lokal-dev-saja-123';
export const ORIGIN = new URL(APP_URL).origin;
export const T = '/projects/sandbox/.tools';
export const PHP = `${T}/php/php`;

export class Klien {
  constructor(base = APP_URL) {
    this.base = base;
    this.cookie = null;
  }

  /**
   * @param {string} method
   * @param {string} path path lengkap (mis. '/api/v1/open-po') atau relatif API ('/open-po')
   * @param {{body?: unknown, raw?: string, headers?: Record<string,string>, json?: boolean, cookie?: string|null}} o
   */
  async req(method, path, o = {}) {
    const url = (path.startsWith('/api/') || path.startsWith('/__dev') || !path.startsWith('/') || o.mentah)
      ? new URL(path, this.base).toString()
      : new URL(`/api/v1${path}`, this.base).toString();
    const headers = { Accept: 'application/json', ...(o.headers ?? {}) };
    const mengubah = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (mengubah && !('Origin' in headers) && o.origin !== false) headers.Origin = ORIGIN;
    let body;
    if (o.raw !== undefined) body = o.raw;
    else if (['POST', 'PATCH', 'PUT'].includes(method)) {
      body = JSON.stringify(o.body ?? {});
      if (!('Content-Type' in headers)) headers['Content-Type'] = 'application/json';
    }
    const cookie = o.cookie !== undefined ? o.cookie : this.cookie;
    if (cookie) headers.Cookie = cookie;
    const t0 = performance.now();
    const res = await fetch(url, { method, headers, body, redirect: 'manual' });
    const ms = performance.now() - t0;
    const teks = await res.text();
    let json = null;
    try { json = teks ? JSON.parse(teks) : null; } catch { json = null; }
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const [nama, nilai] = pair.split('=');
      if (/jastip_sesi$/.test(nama)) this.cookie = nilai ? `${nama}=${nilai}` : null;
    }
    return { status: res.status, headers: res.headers, json, teks, ms, setCookie: res.headers.getSetCookie() };
  }

  async login(user = ADMIN_USER, pass = ADMIN_PASSWORD, extra = {}) {
    const r = await this.req('POST', '/auth/login', { body: { nama_pengguna: user, kata_sandi: pass, ...extra } });
    return r;
  }

  /** Request yang wajib sukses; mengembalikan `data`. */
  async ok(method, path, body) {
    const r = await this.req(method, path, { body });
    if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${r.teks.slice(0, 300)}`);
    return r.json?.data ?? null;
  }
}

/** SQL ke database e2e lokal (MariaDB sandbox, jastip_e2e). Hanya untuk QA lokal. */
export function sql(query) {
  const db = process.env.DB_NAME ?? 'jastip_e2e';
  return execFileSync(`${T}/db.sh`, ['sql', `USE ${db}; ${query}`], { encoding: 'utf8' });
}

/** Buat admin tambahan (untuk uji batas login tanpa mengunci admin utama). */
export function buatAdmin(nama, sandi) {
  execFileSync(PHP, ['bin/create-admin.php', nama], {
    cwd: '/projects/sandbox/backend', input: `${sandi}\n${sandi}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export const KURS_OTOMATIS = { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' };
export const kursManual = (k) => ({ mode: 'manual', kurs_jastip: k });

let seq = 0;
/** No WA unik 08… (12 digit) untuk data uji. */
export function noWaUnik() {
  seq += 1;
  const n = (Date.now() % 1e6) * 100 + seq;
  return `0812${String(n).padStart(8, '0').slice(-8)}`;
}
