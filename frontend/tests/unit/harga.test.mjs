import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungHargaJual, hitungHargaJualTambahan, pratinjauHarga } from '../../src/js/lib/harga.js';

// Model BARU: harga_jual_unit = bulat_ke_atas_Rp1000( (harga + ongkos + fee) × kurs / 100 ).
// Mirror backend Pricing::hargaJualUnitTambahan.
const VEKTOR = [
  // Swisse: (35 + 5 + 3) = $43 × Rp12.900 = Rp554.700 → Rp555.000; × 33 = Rp18.315.000.
  { kasus: 'Swisse 43 AUD', hargaSen: 3500, ongkosSen: 500, feeSen: 300, kurs: 12900, qty: 33, unit: 555000n, subtotal: 18315000n },
  // (24,95 + 5 + 3) = 32,95 × 13.054 = Rp430.129,30 → Rp431.000.
  { kasus: 'Barang kecil', hargaSen: 2495, ongkosSen: 500, feeSen: 300, kurs: 13054, qty: 2, unit: 431000n, subtotal: 862000n },
  // Tepat kelipatan Rp1.000 tidak naik: (35 + 0 + 0) × 10.000 = Rp350.000.
  { kasus: 'Tepat ribuan', hargaSen: 3500, ongkosSen: 0, feeSen: 0, kurs: 10000, qty: 1, unit: 350000n, subtotal: 350000n },
];

for (const v of VEKTOR) {
  test(`hitungHargaJualTambahan: ${v.kasus}`, () => {
    const r = hitungHargaJualTambahan(v);
    assert.equal(r.hargaJualUnit, v.unit);
    assert.equal(r.subtotal, v.subtotal);
  });
}

test('pratinjauHarga dari isi form (model baru)', () => {
  const r = pratinjauHarga({ harga: '35', qty: '33', ongkos: '5', fee: '3', kurs: 12900 });
  assert.equal(r.hargaJualUnit, 555000n);
  assert.equal(r.subtotal, 18315000n);
  assert.equal(r.ongkosSen, 500n);
  assert.equal(r.feeSen, 300n);
});

test('pratinjauHarga ongkos/fee 0 diperbolehkan', () => {
  const r = pratinjauHarga({ harga: '35', qty: '1', ongkos: '0', fee: '0', kurs: 10000 });
  assert.equal(r.hargaJualUnit, 350000n);
});

test('pratinjauHarga input maksimum tetap presisi (BigInt)', () => {
  // (10.000.000 × 3) sen × 1.000.000 / 100 = 300.000.000.000 per unit; subtotal ×999 > 2^53.
  const r = pratinjauHarga({ harga: '100000', qty: '999', ongkos: '100000', fee: '100000', kurs: 1000000 });
  assert.equal(r.hargaJualUnit, 300000000000n);
  assert.equal(r.subtotal, 299700000000000n); // presisi penuh (BigInt), tanpa pembulatan float
});

test('pratinjauHarga mengembalikan null untuk input tidak valid', () => {
  const dasar = { harga: '35', qty: '2', ongkos: '5', fee: '3', kurs: 12900 };
  const salah = [
    { harga: '' }, { harga: '0' }, { harga: '1.299' }, { harga: 'abc' }, { harga: '-1' },
    { harga: '100000,01' }, { qty: '' }, { qty: '0' }, { qty: '1,5' }, { qty: '1000' },
    { ongkos: '' }, { ongkos: '-1' }, { ongkos: '5,555' }, { ongkos: 'x' }, { ongkos: '100000,01' },
    { fee: '' }, { fee: '-1' }, { fee: '3,555' }, { kurs: 0 },
  ];
  for (const ubah of salah) {
    assert.equal(pratinjauHarga({ ...dasar, ...ubah }), null, JSON.stringify(ubah));
  }
});

test('hitungHargaJualTambahan menolak nilai di luar rentang', () => {
  assert.throws(() => hitungHargaJualTambahan({ hargaSen: 0, ongkosSen: 0, feeSen: 0, kurs: 12900, qty: 1 }), RangeError);
  assert.throws(() => hitungHargaJualTambahan({ hargaSen: 1, ongkosSen: -1, feeSen: 0, kurs: 12900, qty: 1 }), RangeError);
  assert.throws(() => hitungHargaJualTambahan({ hargaSen: 1, ongkosSen: 0, feeSen: 0, kurs: 12900, qty: 0 }), RangeError);
});

// Model LAMA (markup) masih ada untuk membaca baris pesanan lama.
test('hitungHargaJual (model lama markup) tetap berfungsi: QA Barang A', () => {
  const r = hitungHargaJual({ hargaSen: 2495, kurs: 13054, markupBp: 1000, qty: 2 });
  assert.equal(r.hargaJualUnit, 359000n);
  assert.equal(r.subtotal, 718000n);
});
