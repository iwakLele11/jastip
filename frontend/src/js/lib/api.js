// Klien API satu modul untuk /api/v1 (kontrak: docs/api/api-contract.md).
// - Sesi memakai cookie HttpOnly dari server; fetch selalu credentials: 'same-origin'.
//   Tidak ada token di JavaScript maupun di localStorage/sessionStorage.
// - Request yang mengubah data (POST/PATCH/DELETE) selalu memakai Content-Type: application/json.
// - Error dibaca dari format kontrak: { error: { kode, pesan, field } }.
// - 401 BELUM_MASUK / SESI_BERAKHIR → arahkan ke login.html?next=<rute saat ini>.
// - Tantangan "browser security system" hosting (InfinityFree): lihat bagian "Tantangan hosting".
import { keLogin } from './rute.js';

const BASE = '/api/v1';
const BATAS_WAKTU_MS = 20000;

export const PESAN = {
  muatGagal: 'Data tidak bisa dimuat. Periksa koneksi, lalu coba lagi.',
  simpanGagal: 'Gagal menyimpan. Isi form tidak hilang, coba lagi.',
  server: 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.',
  tidakTerhubung: 'Tidak dapat terhubung ke server. Periksa koneksi, lalu coba lagi.',
  sesiBerakhir: 'Sesi berakhir. Silakan masuk lagi.',
  perluMuatUlang: 'Koneksi ke server perlu diperbarui. Muat ulang halaman, lalu coba lagi.',
};

export class ApiError extends Error {
  /**
   * @param {{status: number, kode: string, pesan: string, field?: Record<string, string>}} p
   */
  constructor({ status, kode, pesan, field = {} }) {
    super(pesan);
    this.name = 'ApiError';
    this.status = status;
    this.kode = kode;
    this.pesan = pesan;
    this.field = field;
  }

  /** Tidak ada respons dari server (offline, DNS, timeout). */
  get jaringan() {
    return this.kode === 'JARINGAN';
  }

  /** Tantangan hosting tidak bisa diselesaikan otomatis: pengguna perlu memuat ulang halaman. */
  get perluMuatUlang() {
    return this.kode === 'PERLU_MUAT_ULANG';
  }
}

/** Gabungan sinyal batal dari pemanggil + batas waktu, tanpa AbortSignal.any (Safari lama). */
function sinyalDenganBatasWaktu(sinyalLuar) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new DOMException('Batas waktu habis', 'TimeoutError')), BATAS_WAKTU_MS);
  if (sinyalLuar) {
    if (sinyalLuar.aborted) c.abort(sinyalLuar.reason);
    else sinyalLuar.addEventListener('abort', () => c.abort(sinyalLuar.reason), { once: true });
  }
  return { signal: c.signal, selesai: () => clearTimeout(t) };
}

// ---------- Tantangan hosting ----------
// InfinityFree (paket gratis) menjawab request tanpa cookie `__test` yang valid dengan halaman
// HTML berisi JavaScript yang memasang cookie lalu redirect ke URL yang sama + ?i=N. Kunci cookie
// diputar berkala, jadi fetch() bisa menerima HTML itu (fetch tidak menjalankan JS-nya). Request
// yang kena tantangan belum sampai ke PHP, jadi aman diulang, termasuk POST/PATCH/DELETE.
// Pemulihan: muat segarkan.html (statis, tanpa JS) di iframe tersembunyi. Browser menjalankan
// tantangan di iframe itu sampai segarkan.html asli tampil (penanda data-segar="ok"); setelah itu
// cookie sudah baru dan request asli diulang satu kali.

const HALAMAN_SEGAR = 'segarkan.html';
const BATAS_PEMULIHAN_MS = 15000;

/**
 * Apakah respons /api ini halaman tantangan hosting (atau redirect), bukan jawaban API?
 * - redirect: `redirect: 'manual'` → type 'opaqueredirect'; `redirected` untuk berjaga-jaga.
 * - 2xx yang bukan JSON: API selalu menjawab JSON (atau 204 tanpa isi). Non-2xx yang bukan JSON
 *   (mis. 500/503 HTML dari hosting) tetap dianggap error server: request itu mungkin sudah
 *   diproses, jadi tidak boleh diulang otomatis.
 * @param {{type?: string, redirected?: boolean, status: number, headers: {get(n: string): string|null}}} res
 */
export function tampakTantangan(res) {
  if (res.type === 'opaqueredirect' || res.redirected) return true;
  if (res.status < 200 || res.status > 299 || res.status === 204) return false;
  const jenis = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  return !/^application\/([\w.-]+\+)?json$/.test(jenis);
}

let pemulihanBerjalan = null;
let jumlahPulih = 0;

/**
 * Memuat segarkan.html di iframe tersembunyi sampai dokumennya berisi penanda, maks. 15 detik.
 * Halaman tantangan muat lebih dulu lalu redirect, jadi yang ditunggu penandanya, bukan `load`
 * pertama. Selalu resolve (true = penanda tercapai); iframe selalu dihapus.
 */
function muatHalamanSegar() {
  return new Promise((selesai) => {
    const iframe = document.createElement('iframe');
    let timer;
    const akhiri = (ok) => {
      clearTimeout(timer);
      iframe.remove();
      selesai(ok);
    };
    iframe.addEventListener('load', () => {
      try {
        if (iframe.contentDocument?.documentElement?.dataset.segar === 'ok') akhiri(true);
      } catch {
        // Dokumen lain origin (mis. redirect ke http): belum selesai, tunggu batas waktu.
      }
    });
    timer = setTimeout(() => akhiri(false), BATAS_PEMULIHAN_MS);
    iframe.hidden = true;
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.dataset.segarkan = '';
    // Query unik: jangan pernah dilayani dari cache, request harus melewati tantangan.
    iframe.src = new URL(`${HALAMAN_SEGAR}?t=${Date.now()}`, document.baseURI).href;
    document.body.append(iframe);
  });
}

/**
 * Satu pemulihan dipakai bersama oleh semua request yang kena tantangan bersamaan. Kalau
 * pemulihan lain sudah selesai setelah request ini dikirim (`sejak`), tidak perlu memulai lagi.
 */
function pulihkanKoneksi(sejak) {
  if (jumlahPulih > sejak) return Promise.resolve(true);
  pemulihanBerjalan ??= muatHalamanSegar()
    .catch(() => false)
    .then((ok) => {
      pemulihanBerjalan = null;
      if (ok) jumlahPulih += 1;
      return ok;
    });
  return pemulihanBerjalan;
}

/** Menunggu janji, tapi berhenti lebih dulu kalau pemanggil membatalkan. */
function tungguAtauBatal(janji, signal) {
  if (!signal) return janji;
  return new Promise((ok, gagal) => {
    if (signal.aborted) {
      gagal(signal.reason);
      return;
    }
    const batal = () => gagal(signal.reason);
    signal.addEventListener('abort', batal, { once: true });
    janji.then(ok, gagal).finally(() => signal.removeEventListener('abort', batal));
  });
}

const errorPerluMuatUlang = () => new ApiError({ status: 0, kode: 'PERLU_MUAT_ULANG', pesan: PESAN.perluMuatUlang });

// ---------- Request ----------

/**
 * Satu kali kirim. Mengembalikan { tantangan: true } untuk halaman tantangan hosting, atau
 * { res, json }. Melempar ApiError JARINGAN (atau error batal pemanggil).
 */
async function kirim(url, { method, body, signal }) {
  const mengubah = method !== 'GET' && method !== 'HEAD';
  const headers = { Accept: 'application/json' };
  if (mengubah) headers['Content-Type'] = 'application/json';
  const kirimBody = method === 'POST' || method === 'PATCH' || method === 'PUT';

  const { signal: s, selesai } = sinyalDenganBatasWaktu(signal);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: kirimBody ? JSON.stringify(body ?? {}) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      signal: s,
    });
  } catch (e) {
    selesai();
    if (signal?.aborted) throw e; // dibatalkan pemanggil, bukan error jaringan
    throw new ApiError({ status: 0, kode: 'JARINGAN', pesan: PESAN.tidakTerhubung });
  }

  if (tampakTantangan(res)) {
    selesai();
    res.body?.cancel().catch(() => {});
    return { tantangan: true };
  }

  let json = null;
  if (res.status !== 204) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }
  selesai();
  return { res, json };
}

/**
 * Memanggil API. Mengembalikan { data, meta, status }. Melempar ApiError untuk semua
 * kegagalan, kecuali 401 sesi (halaman langsung berpindah ke login dan promise tidak selesai).
 * Tantangan hosting dipulihkan otomatis lalu request diulang satu kali; kalau masih gagal,
 * ApiError PERLU_MUAT_ULANG.
 *
 * @param {string} path mis. '/open-po/1'
 * @param {{method?: string, body?: unknown, query?: Record<string, unknown>, signal?: AbortSignal,
 *          alihkanSaat401?: boolean}} [opsi]
 */
export async function api(path, { method = 'GET', body, query, signal, alihkanSaat401 = true } = {}) {
  // awal.js sedang mengalihkan halaman ke https: jangan kirim apa pun lewat http.
  if (document.documentElement.hasAttribute('data-pindah-https')) return new Promise(() => {});

  const url = new URL(BASE + path, location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const sejak = jumlahPulih;
  let hasil = await kirim(url, { method, body, signal });
  if (hasil.tantangan) {
    // Diulang juga kalau penanda tidak tercapai dalam batas waktu: cookie bisa saja sudah
    // terpasang, dan request yang kena tantangan tidak pernah diproses server.
    await tungguAtauBatal(pulihkanKoneksi(sejak), signal);
    hasil = await kirim(url, { method, body, signal });
    if (hasil.tantangan) throw errorPerluMuatUlang();
  }
  const { res, json } = hasil;

  if (res.ok) {
    if (res.status === 204) return { data: null, meta: null, status: 204 };
    if (json && typeof json === 'object' && 'data' in json) {
      return { data: json.data, meta: json.meta ?? null, status: res.status };
    }
    throw new ApiError({ status: res.status, kode: 'RESPON_TIDAK_VALID', pesan: PESAN.server });
  }

  const e = json && typeof json === 'object' ? json.error : null;
  const err = new ApiError({
    status: res.status,
    kode: typeof e?.kode === 'string' ? e.kode : res.status >= 500 ? 'KESALAHAN_SERVER' : 'RESPON_TIDAK_VALID',
    pesan: typeof e?.pesan === 'string' && e.pesan ? e.pesan : PESAN.server,
    field: e?.field && typeof e.field === 'object' ? e.field : {},
  });

  if (res.status === 401 && alihkanSaat401 && (err.kode === 'BELUM_MASUK' || err.kode === 'SESI_BERAKHIR')) {
    keLogin({ sesiBerakhir: err.kode === 'SESI_BERAKHIR' });
    return new Promise(() => {}); // halaman sedang berpindah; jangan render state error
  }
  throw err;
}

/**
 * Pesan yang ditampilkan untuk sebuah error (ui-spec §9.4).
 * `aksi` = tombol tanpa form (hapus, Tandai Kosong): tidak ada isian yang perlu disebut.
 * PERLU_MUAT_ULANG memakai pesannya sendiri di semua konteks.
 * @param {unknown} err
 * @param {'muat'|'simpan'|'login'|'aksi'} konteks
 */
export function pesanError(err, konteks) {
  if (!(err instanceof ApiError)) return PESAN.server;
  if (err.jaringan) {
    if (konteks === 'simpan') return PESAN.simpanGagal;
    if (konteks === 'login' || konteks === 'aksi') return PESAN.tidakTerhubung;
    return PESAN.muatGagal;
  }
  return err.pesan || PESAN.server;
}

/** Error tak terduga (bug) dicatat ke console supaya ketahuan saat UAT; error API tidak. */
export function catatJikaBug(err) {
  if (!(err instanceof ApiError) && err?.name !== 'AbortError') console.error(err);
}

const keranjangPath = (poId, customerId) => `/open-po/${poId}/keranjang/${customerId}`;

/** Pembungkus endpoint. Semua aksi keranjang mengembalikan objek keranjang lengkap (kontrak §10). */
export const Api = {
  login: (nama_pengguna, kata_sandi) =>
    api('/auth/login', { method: 'POST', body: { nama_pengguna, kata_sandi, klien: 'web' }, alihkanSaat401: false }),
  logout: () => api('/auth/logout', { method: 'POST', alihkanSaat401: false }),
  sesi: () => api('/auth/sesi'),

  pengaturan: () => api('/pengaturan'),
  ubahPengaturan: (body) => api('/pengaturan', { method: 'PATCH', body }),

  kursAudIdr: () => api('/kurs/aud-idr'),

  daftarOpenPo: (query) => api('/open-po', { query }),
  openPo: (id) => api(`/open-po/${id}`),
  buatOpenPo: (body) => api('/open-po', { method: 'POST', body }),
  ubahOpenPo: (id, body) => api(`/open-po/${id}`, { method: 'PATCH', body }),
  customerOpenPo: (id, query) => api(`/open-po/${id}/customer`, { query }),

  daftarCustomer: (query, signal) => api('/customer', { query, signal }),
  customer: (id) => api(`/customer/${id}`),
  buatCustomer: (body) => api('/customer', { method: 'POST', body }),
  ubahCustomer: (id, body) => api(`/customer/${id}`, { method: 'PATCH', body }),
  cekNoWa: (no_wa, kecuali_id, signal) => api('/customer/cek-no-wa', { query: { no_wa, kecuali_id }, signal }),
  hapusCustomer: (id) => api(`/customer/${id}`, { method: 'DELETE' }),
  arsipkanCustomer: (id) => api(`/customer/${id}/arsip`, { method: 'POST' }),

  // Tahap 2: keranjang, barang, pembayaran, pengembalian dana, rekap.
  barangUnik: (poId) => api(`/open-po/${poId}/barang-unik`),
  keranjang: (poId, customerId) => api(keranjangPath(poId, customerId)),
  tambahBarang: (poId, customerId, body) => api(`${keranjangPath(poId, customerId)}/baris-pesanan`, { method: 'POST', body }),
  ubahBarang: (id, body) => api(`/baris-pesanan/${id}`, { method: 'PATCH', body }),
  hapusBarang: (id) => api(`/baris-pesanan/${id}`, { method: 'DELETE' }),
  tandaiKosong: (id) => api(`/baris-pesanan/${id}/kosong`, { method: 'POST' }),
  lepasKosong: (id) => api(`/baris-pesanan/${id}/kosong`, { method: 'DELETE' }),
  catatPembayaran: (poId, customerId, body) => api(`${keranjangPath(poId, customerId)}/pembayaran`, { method: 'POST', body }),
  hapusPembayaran: (id) => api(`/pembayaran/${id}`, { method: 'DELETE' }),
  catatPengembalian: (poId, customerId, body) => api(`${keranjangPath(poId, customerId)}/pengembalian-dana`, { method: 'POST', body }),
  hapusPengembalian: (id) => api(`/pengembalian-dana/${id}`, { method: 'DELETE' }),
  rekap: (poId, customerId) => api(`${keranjangPath(poId, customerId)}/rekap`),
};
