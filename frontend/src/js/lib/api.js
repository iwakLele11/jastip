// Klien API satu modul untuk /api/v1 (kontrak: docs/api/api-contract.md).
// - Sesi memakai cookie HttpOnly dari server; fetch selalu credentials: 'same-origin'.
//   Tidak ada token di JavaScript maupun di localStorage/sessionStorage.
// - Request yang mengubah data (POST/PATCH/DELETE) selalu memakai Content-Type: application/json.
// - Error dibaca dari format kontrak: { error: { kode, pesan, field } }.
// - 401 BELUM_MASUK / SESI_BERAKHIR → arahkan ke login.html?next=<rute saat ini>.
import { keLogin } from './rute.js';

const BASE = '/api/v1';
const BATAS_WAKTU_MS = 20000;

export const PESAN = {
  muatGagal: 'Data tidak bisa dimuat. Periksa koneksi, lalu coba lagi.',
  simpanGagal: 'Gagal menyimpan. Isi form tidak hilang, coba lagi.',
  server: 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.',
  tidakTerhubung: 'Tidak dapat terhubung ke server. Periksa koneksi, lalu coba lagi.',
  sesiBerakhir: 'Sesi berakhir. Silakan masuk lagi.',
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

/**
 * Memanggil API. Mengembalikan { data, meta, status }. Melempar ApiError untuk semua
 * kegagalan, kecuali 401 sesi (halaman langsung berpindah ke login dan promise tidak selesai).
 *
 * @param {string} path mis. '/open-po/1'
 * @param {{method?: string, body?: unknown, query?: Record<string, unknown>, signal?: AbortSignal,
 *          alihkanSaat401?: boolean}} [opsi]
 */
export async function api(path, { method = 'GET', body, query, signal, alihkanSaat401 = true } = {}) {
  const url = new URL(BASE + path, location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

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
      redirect: 'error',
      signal: s,
    });
  } catch (e) {
    selesai();
    if (signal?.aborted) throw e; // dibatalkan pemanggil, bukan error jaringan
    throw new ApiError({ status: 0, kode: 'JARINGAN', pesan: PESAN.tidakTerhubung });
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
