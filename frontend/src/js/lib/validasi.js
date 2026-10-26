// Validasi klien untuk form barang, pembayaran, dan pengembalian dana. Pesan dan urutan
// pengecekan sama dengan server (kontrak API §10, ui-spec §9.3), supaya umpan balik cepat
// tidak bertentangan dengan respons 422. Server tetap sumber kebenaran.
// Murni (tanpa DOM), dites dengan `node --test`.
import { formatRupiah } from './format.js';
import { parseBulat, parseDesimal, parseRupiah } from './parse.js';

export const MAX_NAMA_BARANG = 150;
export const MAX_CATATAN = 255;
const MAX_HARGA_SEN = 10_000_000n; // AUD 100.000,00
const MAX_MARKUP_BP = 10_000n; // 100%
const MAX_QTY = 999n;
const MAX_NOMINAL = 1_000_000_000_000n;

const panjang = (s) => [...s].length; // jumlah karakter (code point), sama dengan mb_strlen

function pesanHarga(input) {
  const r = parseDesimal(input, 2);
  if (!r.ok) {
    return {
      kosong: 'Harga wajib diisi.',
      bukan_angka: 'Isi angka saja, mis. 24,95.',
      desimal: 'Maksimal 2 angka di belakang koma.',
      negatif: 'Harga harus lebih dari 0.',
    }[r.alasan];
  }
  if (r.nilai <= 0n) return 'Harga harus lebih dari 0.';
  if (r.nilai > MAX_HARGA_SEN) return 'Harga maksimal AUD 100.000,00.';
  return null;
}

function pesanQty(input) {
  const s = String(input ?? '').trim();
  if (/^-[0-9]+$/.test(s)) return 'Qty minimal 1.';
  const r = parseBulat(s);
  if (!r.ok) return r.alasan === 'kosong' ? 'Qty minimal 1.' : 'Qty harus bilangan bulat.';
  if (r.nilai < 1n) return 'Qty minimal 1.';
  if (r.nilai > MAX_QTY) return 'Qty maksimal 999.';
  return null;
}

function pesanMarkup(input) {
  const r = parseDesimal(input, 2);
  if (!r.ok) {
    return {
      kosong: 'Markup wajib diisi.',
      bukan_angka: 'Isi angka, mis. 10.',
      desimal: 'Maksimal 2 angka di belakang koma.',
      negatif: 'Markup tidak boleh negatif.',
    }[r.alasan];
  }
  if (r.nilai > MAX_MARKUP_BP) return 'Markup maksimal 100%.';
  return null;
}

/**
 * Isi form barang (string) → error per field (kunci = nama field API) atau body request.
 * `qty` dikirim sebagai integer JSON (server menolak string), harga dan markup sebagai string.
 *
 * @param {{nama: string, harga: string, qty: string, markup: string}} isian
 * @returns {{errors: Record<string, string>, body: null} |
 *           {errors: {}, body: {nama_barang: string, harga_aud: string, qty: number, markup_persen: string}}}
 */
export function validasiBarang({ nama, harga, qty, markup }) {
  const errors = {};
  const n = String(nama ?? '').trim();
  if (n === '') errors.nama_barang = 'Nama barang wajib diisi.';
  else if (panjang(n) > MAX_NAMA_BARANG) errors.nama_barang = 'Nama barang maksimal 150 karakter.';
  const eh = pesanHarga(harga);
  if (eh) errors.harga_aud = eh;
  const eq = pesanQty(qty);
  if (eq) errors.qty = eq;
  const em = pesanMarkup(markup);
  if (em) errors.markup_persen = em;
  if (Object.keys(errors).length) return { errors, body: null };
  return {
    errors: {},
    body: {
      nama_barang: n,
      harga_aud: String(harga).trim(),
      qty: Number(String(qty).trim()),
      markup_persen: String(markup).trim(),
    },
  };
}

/**
 * Nominal rupiah pembayaran / pengembalian dana. `maks` = batas atas (kelebihan bayar untuk
 * pengembalian dana), dengan pesan "Nominal maksimal Rp384.000 (kelebihan bayar)."
 *
 * @param {string} input
 * @param {{maks?: number|bigint}} [opsi]
 * @returns {{ok: true, nilai: bigint} | {ok: false, pesan: string}}
 */
export function validasiNominal(input, { maks } = {}) {
  const r = parseRupiah(input);
  if (!r.ok) return { ok: false, pesan: r.alasan === 'kosong' ? 'Nominal wajib diisi.' : 'Isi angka saja, mis. 1468000.' };
  if (r.nilai <= 0n) return { ok: false, pesan: 'Nominal harus lebih dari Rp0.' };
  if (r.nilai > MAX_NOMINAL) return { ok: false, pesan: 'Nominal terlalu besar.' };
  if (maks !== undefined && r.nilai > BigInt(maks)) {
    return { ok: false, pesan: `Nominal maksimal ${formatRupiah(maks)} (kelebihan bayar).` };
  }
  return { ok: true, nilai: r.nilai };
}

/** Tanggal dari <input type="date"> ("YYYY-MM-DD", atau "" jika kosong / tidak lengkap). */
export function validasiTanggal(input) {
  const s = String(input ?? '').trim();
  if (s === '') return 'Tanggal wajib diisi.';
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return 'Tanggal tidak valid.';
  return null;
}
