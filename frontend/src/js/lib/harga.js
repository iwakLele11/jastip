// Pratinjau harga jual per baris pesanan. Harus identik dengan server
// (ui-spec §12.3, kontrak API §12.1, backend src/Domain/Pricing.php). Hanya bilangan bulat (BigInt).
import { parseBulat, parseDesimal } from './parse.js';

export const MAX_HARGA_SEN = 10_000_000n; // AUD 100.000,00
export const MAX_KURS = 1_000_000n;
export const MAX_MARKUP_BP = 10_000n; // 100%
export const MAX_TAMBAHAN_SEN = 10_000_000n; // AUD 100.000,00 (ongkos berat, fee jastip)
export const MAX_QTY = 999n;

const ceilDiv = (a, b) => (a + b - 1n) / b; // a ≥ 0, b > 0

/**
 * Model BARU (ongkos berat + fee jastip, sen AUD). Mirror Pricing::hargaJualUnitTambahan.
 *   harga_jual_unit = bulat_ke_atas_Rp1000( (harga + ongkos + fee) × kurs / 100 )
 *
 * @returns {{hargaJualUnit: bigint, subtotal: bigint, totalSen: bigint, kurs: bigint, qty: bigint}}
 */
export function hitungHargaJualTambahan({ hargaSen, ongkosSen, feeSen, kurs, qty }) {
  const h = BigInt(hargaSen);
  const o = BigInt(ongkosSen);
  const f = BigInt(feeSen);
  const k = BigInt(kurs);
  const q = BigInt(qty);
  if (h <= 0n || h > MAX_HARGA_SEN) throw new RangeError('Harga AUD di luar rentang.');
  if (o < 0n || o > MAX_TAMBAHAN_SEN) throw new RangeError('Ongkos berat di luar rentang.');
  if (f < 0n || f > MAX_TAMBAHAN_SEN) throw new RangeError('Fee jastip di luar rentang.');
  if (k <= 0n || k > MAX_KURS) throw new RangeError('Kurs di luar rentang.');
  if (q < 1n || q > MAX_QTY) throw new RangeError('Qty di luar rentang.');

  const totalSen = h + o + f;
  const rupiah = (totalSen * k) / 100n; // floor; sen × kurs selalu kelipatan... dibagi 100
  const hargaJualUnit = ceilDiv(rupiah, 1000n) * 1000n;
  return { hargaJualUnit, subtotal: hargaJualUnit * q, totalSen, kurs: k, qty: q };
}

/**
 * Hitungan inti. Semua argumen bilangan bulat (number atau bigint).
 *
 *   N               = harga_sen × kurs × (10000 + markup_bp)    // 1/10.000 sen rupiah
 *   sen             = floor((2N + 10000) / 20000)               // bulat 2 desimal, half-up
 *   harga_jual_unit = ceil(sen / 100000) × 1000                 // ke atas ke Rp1.000
 *   subtotal        = harga_jual_unit × qty
 *
 * @returns {{n: bigint, senSebelumMarkup: bigint, sen: bigint, hargaJualUnit: bigint, subtotal: bigint}}
 */
export function hitungHargaJual({ hargaSen, kurs, markupBp, qty }) {
  const h = BigInt(hargaSen);
  const k = BigInt(kurs);
  const m = BigInt(markupBp);
  const q = BigInt(qty);
  if (h <= 0n || h > MAX_HARGA_SEN) throw new RangeError('Harga AUD di luar rentang.');
  if (k <= 0n || k > MAX_KURS) throw new RangeError('Kurs di luar rentang.');
  if (m < 0n || m > MAX_MARKUP_BP) throw new RangeError('Markup di luar rentang.');
  if (q < 1n || q > MAX_QTY) throw new RangeError('Qty di luar rentang.');

  const n = h * k * (10000n + m);
  const sen = (2n * n + 10000n) / 20000n;
  const hargaJualUnit = ceilDiv(sen, 100000n) * 1000n;
  return {
    n,
    // "AUD 24,95 × Rp13.054 = Rp325.697,30" di Rincian hitungan: harga_sen × kurs, dalam sen.
    senSebelumMarkup: h * k,
    sen,
    hargaJualUnit,
    subtotal: hargaJualUnit * q,
  };
}

/**
 * Pratinjau dari isi form (string). Model baru: harga + ongkos berat + fee jastip (semua AUD).
 * Mengembalikan null jika ada input yang tidak valid, supaya layar kembali ke teks petunjuk.
 *
 * @param {{harga: string, qty: string, ongkos: string, fee: string, kurs: number|bigint}} input
 */
export function pratinjauHarga({ harga, qty, ongkos, fee, kurs }) {
  const h = parseDesimal(harga, 2);
  const q = parseBulat(qty);
  const o = parseDesimal(ongkos, 2);
  const f = parseDesimal(fee, 2);
  if (!h.ok || !q.ok || !o.ok || !f.ok) return null;
  if (h.nilai <= 0n || h.nilai > MAX_HARGA_SEN) return null;
  if (q.nilai < 1n || q.nilai > MAX_QTY) return null;
  if (o.nilai > MAX_TAMBAHAN_SEN || f.nilai > MAX_TAMBAHAN_SEN) return null;
  const k = BigInt(kurs);
  if (k <= 0n || k > MAX_KURS) return null;
  return {
    hargaSen: h.nilai,
    ongkosSen: o.nilai,
    feeSen: f.nilai,
    qty: q.nilai,
    kurs: k,
    ...hitungHargaJualTambahan({ hargaSen: h.nilai, ongkosSen: o.nilai, feeSen: f.nilai, kurs: k, qty: q.nilai }),
  };
}
