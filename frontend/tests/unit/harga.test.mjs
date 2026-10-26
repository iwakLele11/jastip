import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungHargaJual, pratinjauHarga } from '../../src/js/lib/harga.js';

// Kontrak API §12.1 (sama dengan backend tests/Unit/Domain/PricingTest.php) dan scope-mvp.md.
const VEKTOR = [
  { kasus: 'QA Barang A', hargaSen: 2495, kurs: 13054, markupBp: 1000, n: 358267030000n, sen: 35826703n, unit: 359000n, qty: 2, subtotal: 718000n },
  { kasus: 'QA Barang B', hargaSen: 850, kurs: 13054, markupBp: 1500, n: 127602850000n, sen: 12760285n, unit: 128000n, qty: 3, subtotal: 384000n },
  { kasus: 'QA Barang C', hargaSen: 12999, kurs: 13054, markupBp: 800, n: 1832640616800n, sen: 183264062n, unit: 1833000n, qty: 1, subtotal: 1833000n },
  { kasus: 'Tepat kelipatan Rp1.000 tidak naik', hargaSen: 3590, kurs: 10000, markupBp: 0, n: 359000000000n, sen: 35900000n, unit: 359000n, qty: 1, subtotal: 359000n },
  { kasus: 'Bulat 2 desimal dulu (41.000,0032)', hargaSen: 302, kurs: 13054, markupBp: 400, n: 41000003200n, sen: 4100000n, unit: 41000n, qty: 1, subtotal: 41000n },
  { kasus: 'Bulat 2 desimal dulu (821.000,0004)', hargaSen: 5666, kurs: 13054, markupBp: 1100, n: 821000000400n, sen: 82100000n, unit: 821000n, qty: 1, subtotal: 821000n },
  { kasus: 'Half-up (6.559,635)', hargaSen: 50, kurs: 13054, markupBp: 50, n: 6559635000n, sen: 655964n, unit: 7000n, qty: 1, subtotal: 7000n },
];

for (const v of VEKTOR) {
  test(`hitungHargaJual: ${v.kasus}`, () => {
    const r = hitungHargaJual(v);
    assert.equal(r.n, v.n);
    assert.equal(r.sen, v.sen);
    assert.equal(r.hargaJualUnit, v.unit);
    assert.equal(r.subtotal, v.subtotal);
  });
}

test('rincian hitungan Barang A: harga × kurs = 32.569.730 sen (Rp325.697,30)', () => {
  const r = hitungHargaJual({ hargaSen: 2495, kurs: 13054, markupBp: 1000, qty: 2 });
  assert.equal(r.senSebelumMarkup, 32569730n);
});

test('pratinjauHarga dari isi form: A/B/C scope dengan kurs 13.054', () => {
  const kurs = 13054;
  const a = pratinjauHarga({ harga: '24,95', qty: '2', markup: '10', kurs });
  const b = pratinjauHarga({ harga: '8.50', qty: '3', markup: '15', kurs });
  const c = pratinjauHarga({ harga: '129,99', qty: '1', markup: '8', kurs });
  assert.deepEqual([a.hargaJualUnit, a.subtotal], [359000n, 718000n]);
  assert.deepEqual([b.hargaJualUnit, b.subtotal], [128000n, 384000n]);
  assert.deepEqual([c.hargaJualUnit, c.subtotal], [1833000n, 1833000n]);
  assert.equal(a.subtotal + b.subtotal + c.subtotal, 2935000n);
});

test('pratinjauHarga kasus tepi: AUD 3,02 markup 4% → 41.000; AUD 56,66 markup 11% → 821.000', () => {
  assert.equal(pratinjauHarga({ harga: '3,02', qty: '1', markup: '4', kurs: 13054 }).hargaJualUnit, 41000n);
  assert.equal(pratinjauHarga({ harga: '56.66', qty: '1', markup: '11', kurs: 13054 }).hargaJualUnit, 821000n);
});

test('pratinjauHarga markup desimal (7,5% → 750 bp)', () => {
  const r = pratinjauHarga({ harga: '10', qty: '1', markup: '7,5', kurs: 13054 });
  assert.equal(r.markupBp, 750n);
  // 1000 × 13054 × 10750 = 140.330.500.000 → sen 14.033.050 → Rp141.000
  assert.equal(r.hargaJualUnit, 141000n);
});

test('pratinjauHarga input maksimum tetap presisi (BigInt, di atas 2^53)', () => {
  const r = pratinjauHarga({ harga: '100000', qty: '999', markup: '100', kurs: 1000000 });
  assert.equal(r.n, 200000000000000000n);
  assert.ok(r.n > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(r.hargaJualUnit, 200000000000n);
  assert.equal(r.subtotal, 199800000000000n);
});

test('pratinjauHarga mengembalikan null untuk input tidak valid', () => {
  const dasar = { harga: '24,95', qty: '2', markup: '10', kurs: 13054 };
  const salah = [
    { harga: '' }, { harga: '0' }, { harga: '1.299' }, { harga: 'abc' }, { harga: '-1' },
    { harga: '100000,01' }, { qty: '' }, { qty: '0' }, { qty: '1,5' }, { qty: '1000' },
    { markup: '' }, { markup: '-1' }, { markup: '100,01' }, { markup: '10,555' }, { kurs: 0 },
  ];
  for (const ubah of salah) {
    assert.equal(pratinjauHarga({ ...dasar, ...ubah }), null, JSON.stringify(ubah));
  }
});

test('hitungHargaJual menolak nilai di luar rentang', () => {
  assert.throws(() => hitungHargaJual({ hargaSen: 0, kurs: 13054, markupBp: 0, qty: 1 }), RangeError);
  assert.throws(() => hitungHargaJual({ hargaSen: 1, kurs: 13054, markupBp: 10001, qty: 1 }), RangeError);
  assert.throws(() => hitungHargaJual({ hargaSen: 1, kurs: 13054, markupBp: 0, qty: 0 }), RangeError);
});
