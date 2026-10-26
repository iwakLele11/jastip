import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAngkaRibuan, formatAud, formatKursJastip, formatKursPasar, formatPersen, formatRupiah,
  formatRupiahPengembalian, formatRupiahSen, formatTanggal, persenUntukInput, tanggalLokalHariIni,
} from '../../src/js/lib/format.js';
import {
  bersihkanNoWa, parseBulat, parseDesimal, parseRupiah, tampakSepertiNoWa, validasiNoWa,
} from '../../src/js/lib/parse.js';

test('formatRupiah', () => {
  assert.equal(formatRupiah(0), 'Rp0');
  assert.equal(formatRupiah(999), 'Rp999');
  assert.equal(formatRupiah(1000), 'Rp1.000');
  assert.equal(formatRupiah(1234567), 'Rp1.234.567');
  assert.equal(formatRupiah(24380000), 'Rp24.380.000');
  assert.equal(formatRupiah(199800000000000n), 'Rp199.800.000.000.000');
  assert.throws(() => formatRupiah(-1), RangeError);
  assert.throws(() => formatRupiah(1.5), RangeError);
});

test('formatRupiahPengembalian memakai tanda minus U+2212', () => {
  assert.equal(formatRupiahPengembalian(384000), '\u2212Rp384.000');
});

test('formatRupiahSen (rincian hitungan)', () => {
  assert.equal(formatRupiahSen(32569730n), 'Rp325.697,30');
  assert.equal(formatRupiahSen(35826703n), 'Rp358.267,03');
  assert.equal(formatRupiahSen(5n), 'Rp0,05');
});

test('formatAud', () => {
  assert.equal(formatAud('24.95'), 'AUD 24,95');
  assert.equal(formatAud('8.50'), 'AUD 8,50');
  assert.equal(formatAud('1299.00'), 'AUD 1.299,00');
  assert.equal(formatAud('129.99'), 'AUD 129,99');
  assert.equal(formatAud('7'), 'AUD 7,00');
});

test('formatPersen dan persenUntukInput', () => {
  assert.equal(formatPersen('10'), '10%');
  assert.equal(formatPersen('3.5'), '3,5%');
  assert.equal(formatPersen('37.50'), '37,5%');
  assert.equal(formatPersen('0'), '0%');
  assert.equal(persenUntukInput('12.5'), '12,5');
  assert.equal(persenUntukInput('3'), '3');
});

test('formatKursPasar membuang nol di belakang', () => {
  assert.equal(formatKursPasar('12673'), 'Rp12.673');
  assert.equal(formatKursPasar('12673.45'), 'Rp12.673,45');
  assert.equal(formatKursPasar('12673.450000'), 'Rp12.673,45');
  assert.equal(formatKursPasar('12673.000000'), 'Rp12.673');
});

test('formatKursJastip', () => {
  assert.equal(formatKursJastip(13054), '1 AUD = Rp13.054');
});

test('formatTanggal', () => {
  assert.equal(formatTanggal('2026-10-25'), '25 Okt 2026');
  assert.equal(formatTanggal('2026-01-05'), '5 Jan 2026');
  assert.equal(formatTanggal('2026-08-31'), '31 Agu 2026');
  assert.equal(formatTanggal('2026-05-01'), '1 Mei 2026');
  assert.throws(() => formatTanggal('25/10/2026'), TypeError);
  assert.throws(() => formatTanggal('2026-13-01'), TypeError);
});

test('tanggalLokalHariIni memakai tanggal lokal', () => {
  assert.equal(tanggalLokalHariIni(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
});

test('formatAngkaRibuan', () => {
  assert.equal(formatAngkaRibuan(1467000), '1.467.000');
  assert.equal(formatAngkaRibuan(13054n), '13.054');
});

test('parseDesimal: koma atau titik, tanpa parseFloat', () => {
  assert.deepEqual(parseDesimal('24,95', 2), { ok: true, nilai: 2495n });
  assert.deepEqual(parseDesimal('24.95', 2), { ok: true, nilai: 2495n });
  assert.deepEqual(parseDesimal(' 8.5 ', 2), { ok: true, nilai: 850n });
  assert.deepEqual(parseDesimal('10', 2), { ok: true, nilai: 1000n });
  assert.deepEqual(parseDesimal('7,5', 2), { ok: true, nilai: 750n });
  assert.deepEqual(parseDesimal('0', 2), { ok: true, nilai: 0n });
  assert.deepEqual(parseDesimal('-0', 2), { ok: true, nilai: 0n });
  assert.deepEqual(parseDesimal('12673.45', 6), { ok: true, nilai: 12673450000n });
  // 0,1 + 0,2 klasik float: tetap tepat.
  assert.deepEqual(parseDesimal('0,30', 2), { ok: true, nilai: 30n });
});

test('parseDesimal: alasan penolakan', () => {
  assert.equal(parseDesimal('', 2).alasan, 'kosong');
  assert.equal(parseDesimal('   ', 2).alasan, 'kosong');
  assert.equal(parseDesimal(null, 2).alasan, 'kosong');
  assert.equal(parseDesimal('1.299', 2).alasan, 'desimal');
  assert.equal(parseDesimal('10,555', 2).alasan, 'desimal');
  assert.equal(parseDesimal('-1', 2).alasan, 'negatif');
  assert.equal(parseDesimal('abc', 2).alasan, 'bukan_angka');
  assert.equal(parseDesimal('1.2.3', 2).alasan, 'bukan_angka');
  assert.equal(parseDesimal('1,2,3', 2).alasan, 'bukan_angka');
  assert.equal(parseDesimal('.5', 2).alasan, 'bukan_angka');
  assert.equal(parseDesimal('1e3', 2).alasan, 'bukan_angka');
  assert.equal(parseDesimal('Rp10', 2).alasan, 'bukan_angka');
});

test('parseBulat', () => {
  assert.deepEqual(parseBulat('2'), { ok: true, nilai: 2n });
  assert.equal(parseBulat('').alasan, 'kosong');
  assert.equal(parseBulat('1,5').alasan, 'bukan_bulat');
  assert.equal(parseBulat('-1').alasan, 'bukan_bulat');
});

test('parseRupiah menerima titik ribuan dan awalan Rp', () => {
  assert.deepEqual(parseRupiah('13054'), { ok: true, nilai: 13054n });
  assert.deepEqual(parseRupiah('13.054'), { ok: true, nilai: 13054n });
  assert.deepEqual(parseRupiah('1.467.000'), { ok: true, nilai: 1467000n });
  assert.deepEqual(parseRupiah('Rp 1.467.000'), { ok: true, nilai: 1467000n });
  assert.deepEqual(parseRupiah('0'), { ok: true, nilai: 0n });
  assert.equal(parseRupiah('').alasan, 'kosong');
  assert.equal(parseRupiah('13054,5').alasan, 'bukan_angka');
  assert.equal(parseRupiah('13.05').alasan, 'bukan_angka');
  assert.equal(parseRupiah('1.4670.00').alasan, 'bukan_angka');
  assert.equal(parseRupiah('-5').alasan, 'bukan_angka');
});

test('bersihkanNoWa dan validasiNoWa (urutan pesan sama dengan server)', () => {
  assert.equal(bersihkanNoWa(' 0812-3456 (7890) '), '081234567890');
  assert.deepEqual(validasiNoWa('0812-3456-7890'), { ok: true, kanonik: '6281234567890', tampil: '081234567890' });
  assert.deepEqual(validasiNoWa('+62 812 3456 7890'), { ok: true, kanonik: '6281234567890', tampil: '081234567890' });
  assert.deepEqual(validasiNoWa('6281234567890'), { ok: true, kanonik: '6281234567890', tampil: '081234567890' });
  assert.equal(validasiNoWa('').pesan, 'No WA wajib diisi.');
  assert.equal(validasiNoWa('0812abc').pesan, 'No WA hanya boleh berisi angka.');
  assert.equal(validasiNoWa('+6512345678').pesan, 'No WA harus diawali 08, 62, atau +62.');
  assert.equal(validasiNoWa('0712345678').pesan, 'No WA harus diawali 08, 62, atau +62.');
  assert.equal(validasiNoWa('08123').pesan, 'No WA harus 10–14 digit (format 08…).');
  assert.equal(validasiNoWa('081234567890123').pesan, 'No WA harus 10–14 digit (format 08…).');
  assert.equal(validasiNoWa('0812345678').ok, true); // 10 digit
  assert.equal(validasiNoWa('08123456789012').ok, true); // 14 digit
});

test('tampakSepertiNoWa', () => {
  assert.equal(tampakSepertiNoWa('0812'), true);
  assert.equal(tampakSepertiNoWa('+62 812'), true);
  assert.equal(tampakSepertiNoWa('Rin'), false);
  assert.equal(tampakSepertiNoWa('08'), false);
});
