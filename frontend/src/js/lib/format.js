// Format angka dan tanggal untuk tampilan (ui-spec §10). Murni, tanpa Intl, supaya hasil
// sama persis di semua browser dan di Node (unit test).

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MINUS = '\u2212';

/** "1234567" → "1.234.567". Hanya digit. */
function kelompokRibuan(digit) {
  return digit.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function keBigInt(nilai) {
  if (typeof nilai === 'bigint') return nilai;
  if (typeof nilai === 'number') {
    if (!Number.isSafeInteger(nilai)) throw new RangeError(`Bukan bilangan bulat aman: ${nilai}`);
    return BigInt(nilai);
  }
  if (typeof nilai === 'string' && /^-?[0-9]+$/.test(nilai)) return BigInt(nilai);
  throw new TypeError(`Nilai rupiah tidak valid: ${String(nilai)}`);
}

/**
 * Rupiah bulat: 1234567 → "Rp1.234.567", 0 → "Rp0". Ringkasan tidak pernah
 * menampilkan angka negatif, jadi nilai negatif dianggap bug pemanggil.
 */
export function formatRupiah(nilai) {
  const n = keBigInt(nilai);
  if (n < 0n) throw new RangeError('Rupiah negatif tidak ditampilkan; pakai formatRupiahPengembalian.');
  return `Rp${kelompokRibuan(n.toString())}`;
}

/** Baris pengembalian dana di Riwayat: 384000 → "−Rp384.000" (U+2212). */
export function formatRupiahPengembalian(nilai) {
  return `${MINUS}${formatRupiah(nilai)}`;
}

/** Rupiah 2 desimal dari satuan sen (rincian hitungan): 35826703n → "Rp358.267,03". */
export function formatRupiahSen(sen) {
  const n = keBigInt(sen);
  const bulat = n / 100n;
  const pecahan = (n % 100n).toString().padStart(2, '0');
  return `Rp${kelompokRibuan(bulat.toString())},${pecahan}`;
}

/** Memecah string desimal API ("24.95", "12673.45", "10") menjadi bagian bulat dan pecahan. */
function pecahDesimal(s) {
  const m = /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(String(s ?? '').trim());
  if (!m) throw new TypeError(`Desimal API tidak valid: ${String(s)}`);
  return { minus: m[1], bulat: m[2], pecahan: m[3] ?? '' };
}

/** "24.95" → "AUD 24,95", "1299" → "AUD 1.299,00". Selalu 2 desimal. */
export function formatAud(s) {
  const { bulat, pecahan } = pecahDesimal(s);
  return `AUD ${kelompokRibuan(bulat)},${pecahan.padEnd(2, '0').slice(0, 2)}`;
}

/** Desimal dengan koma, nol di belakang dibuang: "3.50" → "3,5", "10" → "10", "1299.5" → "1.299,5". */
function desimalIndonesia(s, { ribuan = true } = {}) {
  const { minus, bulat, pecahan } = pecahDesimal(s);
  const p = pecahan.replace(/0+$/, '');
  const b = ribuan ? kelompokRibuan(bulat) : bulat;
  return `${minus}${b}${p ? `,${p}` : ''}`;
}

/** Persen: "10" → "10%", "3.5" → "3,5%". */
export function formatPersen(s) {
  return `${desimalIndonesia(s, { ribuan: false })}%`;
}

/** Nilai persen untuk diisikan ke input: "12.5" → "12,5". */
export function persenUntukInput(s) {
  return desimalIndonesia(s, { ribuan: false });
}

/** Persen dari basis point (hasil parse input): 1000n → "10%", 750n → "7,5%", 1225n → "12,25%". */
export function formatPersenBp(bp) {
  const n = keBigInt(bp);
  return formatPersen(`${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`);
}

/** Harga AUD dari API untuk diisikan ke input: "24.95" → "24,95", "1299.00" → "1299,00". */
export function audUntukInput(s) {
  const { bulat, pecahan } = pecahDesimal(s);
  return `${bulat},${pecahan.padEnd(2, '0').slice(0, 2)}`;
}

/** Kurs pasar: "12673" → "Rp12.673", "12673.450000" → "Rp12.673,45". */
export function formatKursPasar(s) {
  return `Rp${desimalIndonesia(s)}`;
}

/** Kurs jastip: 13054 → "1 AUD = Rp13.054". */
export function formatKursJastip(kurs) {
  return `1 AUD = ${formatRupiah(kurs)}`;
}

/** Tanggal "YYYY-MM-DD" → "25 Okt 2026". Dibaca langsung dari teks, tanpa zona waktu. */
export function formatTanggal(s) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(s ?? ''));
  if (!m) throw new TypeError(`Tanggal tidak valid: ${String(s)}`);
  const bulan = Number(m[2]);
  if (bulan < 1 || bulan > 12) throw new TypeError(`Bulan tidak valid: ${String(s)}`);
  return `${Number(m[3])} ${BULAN[bulan - 1]} ${m[1]}`;
}

/** Tanggal lokal perangkat sebagai "YYYY-MM-DD" (nilai awal date picker, ui-spec §10). */
export function tanggalLokalHariIni(sekarang = new Date()) {
  const y = sekarang.getFullYear();
  const mo = String(sekarang.getMonth() + 1).padStart(2, '0');
  const d = String(sekarang.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Rupiah bulat untuk isi field saat blur: 1467000 → "1.467.000". */
export function formatAngkaRibuan(nilai) {
  return kelompokRibuan(keBigInt(nilai).toString());
}
