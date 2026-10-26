// Klien HTTP kecil untuk uji API QA (Node 22, fetch bawaan). Menyimpan cookie sesi sendiri.
//
// Env wajib (diisi .tools/dev-stack.sh atau qa/paket/uji-paket.sh):
//   APP_URL, ADMIN_USER, ADMIN_PASSWORD
// Env opsional:
//   QA_DB_SH   skrip DB untuk sql() (default .tools/db.sh = MariaDB 11.4 port 3307)
//   DB_NAME    database aplikasi untuk sql() (default jastip_e2e)
//   QA_APP_DIR folder back-end untuk buatAdmin() (default backend/; paket: <htdocs>/app)
//   QA_IP      IP klien seperti dilihat server (default 127.0.0.1), untuk resetIp()
import { execFileSync } from 'node:child_process';

function wajibEnv(nama) {
  const v = process.env[nama];
  if (v === undefined || v === '') {
    console.error(`Env ${nama} wajib diisi. Jalankan lewat qa/run.sh (dev-stack) atau qa/paket/uji-paket.sh.`);
    process.exit(2);
  }
  return v;
}

export const APP_URL = wajibEnv('APP_URL');
export const ADMIN_USER = wajibEnv('ADMIN_USER');
export const ADMIN_PASSWORD = wajibEnv('ADMIN_PASSWORD');
export const ORIGIN = new URL(APP_URL).origin;
export const T = '/projects/sandbox/.tools';
export const PHP = `${T}/php/php`;
export const QA_TARGET = process.env.QA_TARGET ?? 'dev'; // dev = php -S dev-stack, paket = Apache + paket htdocs

export class Klien {
  constructor(base = APP_URL) {
    this.base = base;
    this.cookie = null;
  }

  /**
   * @param {string} method
   * @param {string} path path lengkap (mis. '/api/v1/open-po') atau relatif API ('/open-po')
   * @param {{body?: unknown, raw?: string|Buffer, headers?: Record<string,string>, cookie?: string|null, origin?: false, mentah?: boolean}} o
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
    const teks = await res.text();
    const ms = performance.now() - t0;
    let json = null;
    try { json = teks ? JSON.parse(teks) : null; } catch { json = null; }
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      const nama = pair.slice(0, i);
      const nilai = pair.slice(i + 1);
      if (/jastip_sesi$/.test(nama)) this.cookie = nilai ? `${nama}=${nilai}` : null;
    }
    return { status: res.status, headers: res.headers, json, teks, ms, setCookie: res.headers.getSetCookie() };
  }

  async login(user = ADMIN_USER, pass = ADMIN_PASSWORD, extra = {}) {
    return this.req('POST', '/auth/login', { body: { nama_pengguna: user, kata_sandi: pass, ...extra } });
  }

  /** Request yang wajib sukses; mengembalikan `data`. */
  async ok(method, path, body) {
    const r = await this.req(method, path, { body });
    if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${r.teks.slice(0, 300)}`);
    return r.json?.data ?? null;
  }
}

/** SQL ke database aplikasi lokal (MariaDB sandbox). Hanya untuk QA lokal, tidak pernah production. */
export function sql(query) {
  const db = process.env.DB_NAME ?? 'jastip_e2e';
  const dbSh = process.env.QA_DB_SH ?? `${T}/db.sh`;
  return execFileSync(dbSh, ['sql', `USE \`${db}\`; ${query}`], { encoding: 'utf8' });
}

/** Kosongkan hitungan login gagal (isolasi antar-uji; bukan bagian aplikasi). */
export function resetPercobaanLogin() {
  sql('DELETE FROM percobaan_login;');
}

/** Hapus hanya hitungan per IP (kunci = SHA-256 dari "ip:<IP>", lihat Auth/AuthService). */
export function resetIp(ip = process.env.QA_IP ?? '127.0.0.1') {
  sql(`DELETE FROM percobaan_login WHERE kunci_hash = SHA2('ip:${ip.replace(/[^0-9a-fA-F.:]/g, '')}', 256);`);
}

/** Buat admin tambahan (untuk uji batas login tanpa mengunci admin utama). */
export function buatAdmin(nama, sandi) {
  const dir = process.env.QA_APP_DIR ?? '/projects/sandbox/backend';
  execFileSync(PHP, ['bin/create-admin.php', nama], {
    cwd: dir, input: `${sandi}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
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

export const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
