// Parsing input pengguna ke bilangan bulat, tanpa parseFloat (ui-spec §12.2, kontrak API §1.2).
// Semua fungsi murni: tidak menyentuh DOM, bisa dites dengan `node --test`.

const RE_DESIMAL = /^(-?)([0-9]+)(?:[.,]([0-9]+))?$/;

/**
 * String desimal → bilangan bulat berskala (BigInt). Aturan sama dengan server
 * (backend DecimalParser): pemisah desimal titik atau koma, tepat satu, tanpa pemisah ribuan.
 * "24,95" (skala 2) → 2495n, "8.5" → 850n, "1.299" → ditolak karena 3 desimal.
 *
 * @param {unknown} input
 * @param {number} skala jumlah desimal maksimum
 * @returns {{ok: true, nilai: bigint} | {ok: false, alasan: 'kosong'|'bukan_angka'|'desimal'|'negatif'}}
 */
export function parseDesimal(input, skala) {
  const s = String(input ?? '').trim();
  if (s === '') return { ok: false, alasan: 'kosong' };
  const m = RE_DESIMAL.exec(s);
  if (!m) return { ok: false, alasan: 'bukan_angka' };
  const [, minus, bulat, pecahan = ''] = m;
  if (pecahan.length > skala) return { ok: false, alasan: 'desimal' };
  const nilai = BigInt(bulat) * 10n ** BigInt(skala) + BigInt(pecahan.padEnd(skala, '0') || '0');
  if (minus === '-' && nilai !== 0n) return { ok: false, alasan: 'negatif' };
  return { ok: true, nilai };
}

/**
 * Bilangan bulat tanpa tanda, mis. qty. "2" → 2n, "1,5" → bukan_bulat.
 *
 * @returns {{ok: true, nilai: bigint} | {ok: false, alasan: 'kosong'|'bukan_bulat'}}
 */
export function parseBulat(input) {
  const s = String(input ?? '').trim();
  if (s === '') return { ok: false, alasan: 'kosong' };
  if (!/^[0-9]+$/.test(s)) return { ok: false, alasan: 'bukan_bulat' };
  return { ok: true, nilai: BigInt(s) };
}

/**
 * Nominal rupiah bulat dari input. Menerima "1467000", "1.467.000" (titik ribuan hasil
 * format saat blur), dan awalan "Rp". Koma atau desimal ditolak.
 *
 * @returns {{ok: true, nilai: bigint} | {ok: false, alasan: 'kosong'|'bukan_angka'}}
 */
export function parseRupiah(input) {
  const s = String(input ?? '').replace(/\s+/g, '').replace(/^rp/i, '');
  if (s === '') return { ok: false, alasan: 'kosong' };
  if (/^[0-9]+$/.test(s)) return { ok: true, nilai: BigInt(s) };
  if (/^[0-9]{1,3}(?:\.[0-9]{3})+$/.test(s)) return { ok: true, nilai: BigInt(s.replaceAll('.', '')) };
  return { ok: false, alasan: 'bukan_angka' };
}

/** Membuang spasi, tanda hubung, dan kurung dari no WA hasil tempel (ui-spec §7.8). */
export function bersihkanNoWa(input) {
  return String(input ?? '').trim().replace(/[\s\-()]+/gu, '');
}

const PESAN_NO_WA = {
  kosong: 'No WA wajib diisi.',
  bukan_angka: 'No WA hanya boleh berisi angka.',
  awalan: 'No WA harus diawali 08, 62, atau +62.',
  panjang: 'No WA harus 10–14 digit (format 08…).',
};

/**
 * Validasi no WA di sisi klien untuk umpan balik cepat. Urutan dan pesan sama dengan
 * server (kontrak API §1.7); server tetap sumber kebenaran.
 *
 * @returns {{ok: true, kanonik: string, tampil: string} | {ok: false, alasan: string, pesan: string}}
 */
export function validasiNoWa(input) {
  const v = bersihkanNoWa(input);
  const gagal = (alasan) => ({ ok: false, alasan, pesan: PESAN_NO_WA[alasan] });
  if (v === '') return gagal('kosong');
  if (!/^\+?[0-9]+$/.test(v)) return gagal('bukan_angka');
  let kanonik = null;
  if (v.startsWith('+62')) kanonik = `62${v.slice(3)}`;
  else if (v.startsWith('+')) kanonik = null;
  else if (v.startsWith('62')) kanonik = v;
  else if (v.startsWith('08')) kanonik = `62${v.slice(1)}`;
  if (kanonik === null) return gagal('awalan');
  if (kanonik.length < 11 || kanonik.length > 15) return gagal('panjang');
  return { ok: true, kanonik, tampil: `0${kanonik.slice(2)}` };
}

/** True jika teks pencarian berbentuk nomor (untuk mengisi field No WA, bukan Nama). */
export function tampakSepertiNoWa(input) {
  return /^\+?[0-9]{3,}$/.test(bersihkanNoWa(input));
}
