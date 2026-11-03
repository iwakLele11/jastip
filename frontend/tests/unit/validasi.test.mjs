import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audUntukInput, formatPersenBp } from '../../src/js/lib/format.js';
import { validasiBarang, validasiNominal, validasiTanggal } from '../../src/js/lib/validasi.js';

// Pesan sama dengan server (kontrak API §10, backend BarisPesananController / PembayaranController).

test('validasiBarang: isian → body (qty integer JSON; harga, ongkos, fee string)', () => {
  const r = validasiBarang({ nama: '  Swisse ', harga: '35', qty: '33', ongkos: '5', fee: '3' });
  assert.deepEqual(r, {
    errors: {},
    body: { nama_barang: 'Swisse', harga_aud: '35', qty: 33, ongkos_berat: '5', fee_jastip: '3' },
  });
});

test('validasiBarang: harga 3 desimal, qty 0, ongkos negatif (skenario gabungan)', () => {
  const r = validasiBarang({ nama: 'Barang A', harga: '1.299', qty: '0', ongkos: '-1', fee: '3' });
  assert.equal(r.body, null);
  assert.deepEqual(r.errors, {
    harga_aud: 'Maksimal 2 angka di belakang koma.',
    qty: 'Qty minimal 1.',
    ongkos_berat: 'Ongkos berat tidak boleh negatif.',
  });
});

test('validasiBarang: pesan per kondisi', () => {
  const e = (isian) => validasiBarang({ nama: 'A', harga: '1', qty: '1', ongkos: '5', fee: '3', ...isian }).errors;
  assert.deepEqual(e({ nama: '   ' }), { nama_barang: 'Nama barang wajib diisi.' });
  assert.deepEqual(e({ nama: 'x'.repeat(151) }), { nama_barang: 'Nama barang maksimal 150 karakter.' });
  assert.deepEqual(e({ nama: '🧴'.repeat(150) }), {}); // dihitung per karakter, bukan UTF-16
  assert.deepEqual(e({ harga: '' }), { harga_aud: 'Harga wajib diisi.' });
  assert.deepEqual(e({ harga: '0' }), { harga_aud: 'Harga harus lebih dari 0.' });
  assert.deepEqual(e({ harga: '100000' }), {});
  assert.deepEqual(e({ qty: '' }), { qty: 'Qty minimal 1.' });
  assert.deepEqual(e({ qty: '1,5' }), { qty: 'Qty harus bilangan bulat.' });
  assert.deepEqual(e({ ongkos: '' }), { ongkos_berat: 'Ongkos berat wajib diisi.' });
  assert.deepEqual(e({ ongkos: '-1' }), { ongkos_berat: 'Ongkos berat tidak boleh negatif.' });
  assert.deepEqual(e({ ongkos: '5,555' }), { ongkos_berat: 'Maksimal 2 angka di belakang koma.' });
  assert.deepEqual(e({ ongkos: 'lima' }), { ongkos_berat: 'Isi angka saja, mis. 5.' });
  assert.deepEqual(e({ ongkos: '100000,01' }), { ongkos_berat: 'Ongkos berat maksimal AUD 100.000,00.' });
  assert.deepEqual(e({ ongkos: '0' }), {}); // 0 diperbolehkan
  assert.deepEqual(e({ fee: '' }), { fee_jastip: 'Fee jastip wajib diisi.' });
  assert.deepEqual(e({ fee: '-1' }), { fee_jastip: 'Fee jastip tidak boleh negatif.' });
  assert.deepEqual(e({ fee: '0' }), {}); // 0 diperbolehkan
});

test('validasiNominal: pembayaran dan batas pengembalian dana', () => {
  assert.deepEqual(validasiNominal('1.467.000'), { ok: true, nilai: 1467000n });
  assert.deepEqual(validasiNominal('Rp1468000'), { ok: true, nilai: 1468000n });
  assert.equal(validasiNominal('').pesan, 'Nominal wajib diisi.');
  assert.equal(validasiNominal('0').pesan, 'Nominal harus lebih dari Rp0.');
  assert.equal(validasiNominal('12,5').pesan, 'Isi angka saja, mis. 1468000.');
  assert.equal(validasiNominal('1000000000001').pesan, 'Nominal terlalu besar.');
  assert.deepEqual(validasiNominal('384000', { maks: 384000 }), { ok: true, nilai: 384000n });
  assert.equal(validasiNominal('384001', { maks: 384000 }).pesan, 'Nominal maksimal Rp384.000 (kelebihan bayar).');
});

test('validasiTanggal', () => {
  assert.equal(validasiTanggal('2026-10-28'), null);
  assert.equal(validasiTanggal(''), 'Tanggal wajib diisi.');
  assert.equal(validasiTanggal('28/10/2026'), 'Tanggal tidak valid.');
});

test('formatPersenBp dan audUntukInput (pratinjau & isi form ubah)', () => {
  assert.equal(formatPersenBp(1000n), '10%');
  assert.equal(formatPersenBp(750n), '7,5%');
  assert.equal(formatPersenBp(1225n), '12,25%');
  assert.equal(formatPersenBp(0n), '0%');
  assert.equal(audUntukInput('24.95'), '24,95');
  assert.equal(audUntukInput('8.50'), '8,50');
  assert.equal(audUntukInput('1299'), '1299,00');
});
