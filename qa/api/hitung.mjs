// Verifikasi perhitungan harga jual & DP untuk banyak kombinasi acak + nilai batas.
// Tiga sumber dibandingkan: oracle Python decimal, pratinjau front-end (harga.js),
// dan hasil server (POST baris-pesanan dengan kurs manual yang disetel).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Klien, kursManual, noWaUnik } from '../lib/klien.mjs';
import { bagian, cek, harap, selesai } from '../lib/uji.mjs';
import { pratinjauHarga } from '../../frontend/src/js/lib/harga.js';

const admin = new Klien();
await admin.login();

const ORACLE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../hitung/oracle.py');
function oracle(kasus) {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'qa-oracle-')), 'kasus.json');
  writeFileSync(f, JSON.stringify(kasus));
  return JSON.parse(execFileSync('python3', [ORACLE, f], { encoding: 'utf8' }));
}

// Generator acak deterministik (mulberry32) supaya regresi bisa diulang.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hargaAudAcak(r) {
  const sen = 1 + Math.floor(r() * 10_000_000); // 0,01 .. 100.000,00
  return (sen / 100).toFixed(2);
}
function markupAcak(r) {
  const bp = Math.floor(r() * 10_001); // 0 .. 100,00 %
  return (bp / 100).toFixed(r() < 0.5 ? 2 : 0).replace(/\.00$/, r() < 0.5 ? '.00' : '');
}

// ---- Kumpulan kasus harga ----
const kasusHarga = [];
const batas = [
  // harga, kurs, markup, qty, keterangan
  ['0.01', 1, '0', 1, 'minimum absolut'],
  ['0.01', 1000000, '100', 999, 'kecil × kurs & markup maksimum'],
  ['100000.00', 1000000, '100', 999, 'maksimum absolut (uji batas BigInt)'],
  ['100000.00', 13054, '10', 1, 'harga maksimum'],
  ['24.95', 13054, '10', 2, 'QA Barang A → 359.000'],
  ['8.50', 13054, '15', 3, 'QA Barang B → 128.000'],
  ['129.99', 13054, '8', 1, 'QA Barang C → 1.833.000'],
  ['35.90', 10000, '0', 1, 'tepat kelipatan Rp1.000 (tidak naik)'],
  ['3.02', 13054, '4', 1, 'bulat 2 desimal dulu (41.000,0032)'],
  ['56.66', 13054, '11', 1, 'bulat 2 desimal dulu (821.000,0004)'],
  ['0.50', 13054, '0.5', 1, 'half-up (6.559,635 → 7.000)'],
  ['1.00', 1, '0', 1, 'hasil Rp1 → dibulatkan ke Rp1.000'],
  ['999.99', 999999, '99.99', 999, 'hampir maksimum di semua dimensi'],
  ['50.00', 20000, '0', 1, 'tepat 1.000.000'],
  ['0.07', 13054, '0', 1, 'pembulatan kecil'],
];
batas.forEach((b, i) => kasusHarga.push({ id: `B${i}`, harga_aud: b[0], kurs: b[1], markup: b[2], qty: b[3], ket: b[4] }));

const r = rng(20261126);
const kursPilihan = [1, 13, 137, 1000, 10000, 13054, 99999, 500000, 1000000];
for (let i = 0; i < 400; i++) {
  kasusHarga.push({
    id: `R${i}`,
    harga_aud: hargaAudAcak(r),
    kurs: kursPilihan[Math.floor(r() * kursPilihan.length)],
    markup: markupAcak(r),
    qty: 1 + Math.floor(r() * 999),
  });
}

bagian('A. Harga jual: oracle Python vs pratinjau front-end');
const hasilOracle = oracle({ harga: kasusHarga });
const petaOracle = Object.fromEntries(hasilOracle.harga.map((h) => [h.id, h]));
await cek('CALC-A1', `Pratinjau front-end (harga.js) == oracle decimal untuk ${kasusHarga.length} kasus`, () => {
  const beda = [];
  for (const c of kasusHarga) {
    const p = pratinjauHarga({ harga: c.harga_aud, qty: String(c.qty), markup: c.markup, kurs: c.kurs });
    harap(p !== null, `${c.id}: pratinjau null untuk ${JSON.stringify(c)}`);
    const o = petaOracle[c.id];
    if (Number(p.hargaJualUnit) !== o.harga_jual_unit || Number(p.subtotal) !== o.subtotal) {
      beda.push(`${c.id} (${c.harga_aud}×${c.kurs}×(1+${c.markup}%)×${c.qty}): front-end unit ${p.hargaJualUnit}/sub ${p.subtotal} vs oracle ${o.harga_jual_unit}/${o.subtotal}`);
    }
  }
  harap(!beda.length, beda.slice(0, 20).join('\n'));
  return `${kasusHarga.length} kasus cocok`;
});

bagian('B. Harga jual: hasil server == oracle');
// Dikelompokkan per kurs: satu PO manual per kurs, lalu banyak baris di dalamnya.
const perKurs = new Map();
for (const c of kasusHarga) {
  if (!perKurs.has(c.kurs)) perKurs.set(c.kurs, []);
  perKurs.get(c.kurs).push(c);
}
await cek('CALC-B1', `Server (POST baris-pesanan, kurs manual) == oracle untuk ${kasusHarga.length} kasus`, async () => {
  const beda = [];
  let dipakai = 0;
  for (const [kurs, list] of perKurs) {
    const po = await admin.ok('POST', '/open-po', { nama: `Hitung kurs ${kurs}`, kurs: kursManual(kurs) });
    const cust = await admin.ok('POST', '/customer', { nama: `Hitung ${kurs}`, no_wa: noWaUnik() });
    for (const c of list) {
      const data = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, {
        nama_barang: c.id, harga_aud: c.harga_aud, qty: c.qty, markup_persen: c.markup,
      });
      const baris = data.barang[data.barang.length - 1];
      const o = petaOracle[c.id];
      dipakai++;
      if (baris.harga_jual_unit !== o.harga_jual_unit || baris.subtotal !== o.subtotal) {
        beda.push(`${c.id} (${c.harga_aud}×${kurs}×(1+${c.markup}%)×${c.qty}): server ${baris.harga_jual_unit}/${baris.subtotal} vs oracle ${o.harga_jual_unit}/${o.subtotal}`);
      }
    }
  }
  harap(!beda.length, beda.slice(0, 20).join('\n'));
  return `${dipakai} baris server cocok`;
});

bagian('C. Nilai batas harga jual bernilai sesuai contoh QA');
await cek('CALC-C1', 'Vektor uji ui-spec §12.1 menghasilkan angka yang didokumentasikan', () => {
  const harapan = { B4: 359000, B5: 128000, B6: 1833000, B7: 359000, B8: 41000, B9: 821000, B10: 7000 };
  const subQA = { B4: 718000, B5: 384000, B6: 1833000 };
  const salah = [];
  for (const [id, unit] of Object.entries(harapan)) {
    const o = petaOracle[id];
    if (o.harga_jual_unit !== unit) salah.push(`${id}: ${o.harga_jual_unit} != ${unit}`);
    if (subQA[id] && o.subtotal !== subQA[id]) salah.push(`${id} subtotal: ${o.subtotal} != ${subQA[id]}`);
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('D. DP (termasuk DP% desimal) & status: oracle vs server');
// DP% hanya bisa 0..100 di pengaturan; disalin ke PO saat dibuat. Uji lewat keranjang nyata.
const kasusDp = [];
const dpBps = [0, 1, 4999, 5000, 5001, 10000, 3750, 1234, 10, 9999];
let n = 0;
for (const dpBp of dpBps) {
  for (let i = 0; i < 6; i++) {
    const totalUnit = 1 + Math.floor(r() * 3000); // kelipatan 1000 (karena harga_jual_unit kelipatan 1000)
    kasusDp.push({ id: `DP${n++}`, total: totalUnit * 1000, dp_bp: dpBp });
  }
}
// Tambah batas: total 0, total 1000, total besar.
kasusDp.push({ id: 'DP-nol', total: 0, dp_bp: 5000 });
kasusDp.push({ id: 'DP-kecil', total: 1000, dp_bp: 5000 });
kasusDp.push({ id: 'DP-besar', total: 999999000, dp_bp: 3333 });
const oracleDp = Object.fromEntries(oracle({ dp: kasusDp }).dp.map((d) => [d.id, d.dp]));

await cek('CALC-D1', 'DP server (keranjang nyata, DP% desimal & batas) == oracle decimal', async () => {
  const beda = [];
  // Kelompokkan per dp_bp (dp% per PO = pengaturan saat PO dibuat). Set pengaturan, buat PO, isi 1 barang bernilai total.
  const perDp = new Map();
  for (const c of kasusDp) {
    if (!perDp.has(c.dp_bp)) perDp.set(c.dp_bp, []);
    perDp.get(c.dp_bp).push(c);
  }
  for (const [dpBp, list] of perDp) {
    await admin.ok('PATCH', '/pengaturan', { dp_persen: (dpBp / 100).toString() });
    for (const c of list) {
      // Keranjang dengan total persis = c.total (kelipatan 1000). Kurs manual 100.000, markup 0,
      // qty 1, harga_aud = total / 100.000 → harga_jual_unit = (total/1000) × 1000 = total.
      const po = await admin.ok('POST', '/open-po', { nama: `DP ${dpBp} ${c.id}`, kurs: kursManual(100000) });
      const cust = await admin.ok('POST', '/customer', { nama: `DP ${c.id}`, no_wa: noWaUnik() });
      const harga = ((c.total || 1000) / 100000).toFixed(2);
      let k = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: harga, qty: 1, markup_persen: '0' });
      if (c.total === 0) {
        await admin.ok('POST', `/baris-pesanan/${k.barang[0].id}/kosong`);
        k = await admin.ok('GET', `/open-po/${po.id}/keranjang/${cust.id}`);
      }
      if (k.ringkasan.total !== c.total) { beda.push(`${c.id}: total server ${k.ringkasan.total} != ${c.total} (lewati)`); continue; }
      if (k.ringkasan.dp !== oracleDp[c.id]) beda.push(`${c.id} (total ${c.total}, dp_bp ${dpBp}): server dp ${k.ringkasan.dp} != oracle ${oracleDp[c.id]}`);
    }
  }
  await admin.ok('PATCH', '/pengaturan', { dp_persen: '50' });
  harap(!beda.length, beda.slice(0, 20).join('\n'));
  return `${kasusDp.length} kasus DP cocok`;
});

bagian('E. Lima status & transisi (server) sesuai tabel ui-spec §12.2');
await cek('CALC-E1', 'Transisi belum_bayar→kurang_dp→dp→lunas→lebih_bayar→(refund)→lunas sesuai oracle', async () => {
  await admin.ok('PATCH', '/pengaturan', { dp_persen: '50' });
  const po = await admin.ok('POST', '/open-po', { nama: 'Status transisi', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Status', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  for (const b of [['Barang A', '24,95', 2, '10'], ['Barang B', '8,50', 3, '15'], ['Barang C', '129,99', 1, '8']]) {
    await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: b[0], harga_aud: b[1], qty: b[2], markup_persen: b[3] });
  }
  const langkah = [];
  const lihat = async () => (await admin.ok('GET', base)).ringkasan;
  langkah.push(['awal', await lihat(), null]);
  const k1 = await admin.ok('POST', `${base}/pembayaran`, { nominal: 500000, tanggal: '2026-10-28' });
  langkah.push(['bayar 500.000', k1.ringkasan, null]);
  const k2 = await admin.ok('POST', `${base}/pembayaran`, { nominal: 968000, tanggal: '2026-10-28' }); // total 1.468.000
  langkah.push(['bayar s/d DP', k2.ringkasan, null]);
  const k3 = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1467000, tanggal: '2026-10-30' }); // lunas
  langkah.push(['pelunasan', k3.ringkasan, null]);
  // Kosongkan Barang B → total 2.551.000, dana 2.935.000 → lebih bayar 384.000
  const kk = await admin.ok('GET', base);
  await admin.ok('POST', `/baris-pesanan/${kk.barang[1].id}/kosong`);
  langkah.push(['B kosong', (await lihat()), null]);
  const k5 = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-31' });
  langkah.push(['refund 384.000', k5.ringkasan, null]);

  const harapan = [
    ['awal', 'belum_bayar', 2935000, 1468000, 0, 2935000, 0],
    ['bayar 500.000', 'kurang_dp', 2935000, 1468000, 500000, 2435000, 0],
    ['bayar s/d DP', 'dp', 2935000, 1468000, 1468000, 1467000, 0],
    ['pelunasan', 'lunas', 2935000, 1468000, 2935000, 0, 0],
    ['B kosong', 'lebih_bayar', 2551000, 1276000, 2935000, 0, 384000],
    ['refund 384.000', 'lunas', 2551000, 1276000, 2551000, 0, 0],
  ];
  const salah = [];
  langkah.forEach(([nama, rk], i) => {
    const [, st, total, dp, dana, sisa, lebih] = harapan[i];
    const akt = [rk.status, rk.total, rk.dp, rk.dana_diterima, rk.sisa, rk.kelebihan_bayar];
    const hrp = [st, total, dp, dana, sisa, lebih];
    if (JSON.stringify(akt) !== JSON.stringify(hrp)) salah.push(`${nama}: ${JSON.stringify(akt)} != ${JSON.stringify(hrp)}`);
  });
  harap(!salah.length, salah.join('\n'));
  return harapan.map((h) => `${h[0]}=${h[1]}`).join(' → ');
});

bagian('F. Pengembalian: batas, status nonaktif, hapus pembayaran diblokir');
await cek('CALC-F1', 'Refund > kelebihan bayar → 422; refund saat bukan lebih bayar → 409 PENGEMBALIAN_TIDAK_AKTIF', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Refund batas', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Refund', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '100', qty: 1, markup_persen: '0' });
  // total 1.000.000 (100 × 13054 × 1 = 1.305.400 → ceil = 1.306.000). Hitung sebenarnya:
  const k = await admin.ok('GET', base);
  const total = k.ringkasan.total;
  // belum lebih bayar → refund 409
  const r409 = await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: 1000, tanggal: '2026-10-28' } });
  harap(r409.status === 409 && r409.json.error.kode === 'PENGEMBALIAN_TIDAK_AKTIF', `status ${r409.status} ${r409.json?.error?.kode}`);
  // bayar lebih → lebih bayar
  await admin.ok('POST', `${base}/pembayaran`, { nominal: total + 500000, tanggal: '2026-10-28' });
  const r422 = await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: 500001, tanggal: '2026-10-28' } });
  harap(r422.status === 422 && r422.json.error.field.nominal === `Nominal maksimal Rp${(500000).toLocaleString('id-ID').replace(/,/g, '.')} (kelebihan bayar).`, `${r422.status} ${JSON.stringify(r422.json?.error)}`);
  const ok = await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: 500000, tanggal: '2026-10-28' } });
  harap(ok.status === 201 && ok.json.data.ringkasan.status === 'lunas', `refund tepat: ${ok.status} ${ok.json?.data?.ringkasan?.status}`);
  return `total ${total}, kelebihan 500.000`;
});
await cek('CALC-F2', 'Hapus pembayaran yang membuat dana negatif → 409 HAPUS_PENGEMBALIAN_DULU', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Hapus blok', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'HapusBlok', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '100', qty: 1, markup_persen: '0' });
  const k = await admin.ok('GET', base);
  const kb = await admin.ok('POST', `${base}/pembayaran`, { nominal: k.ringkasan.total + 384000, tanggal: '2026-10-28' });
  const idBayar = kb.riwayat[0].id;
  await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-29' });
  const r = await admin.req('DELETE', `/pembayaran/${idBayar}`);
  harap(r.status === 409 && r.json.error.kode === 'HAPUS_PENGEMBALIAN_DULU', `${r.status} ${r.json?.error?.kode}`);
  harap(/Rp384\.000/.test(r.json.error.pesan), r.json.error.pesan);
});

bagian('G. Kurs terkunci (termasuk setelah semua barang dihapus)');
await cek('CALC-G1', 'Kurs terkunci sejak barang pertama; tetap terkunci walau semua barang dihapus', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Kurs lock', kurs: kursManual(13054) });
  harap(po.kurs_terkunci === false, 'baru dibuat sudah terkunci');
  const cust = await admin.ok('POST', '/customer', { nama: 'Lock', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  const k = await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '10', qty: 1, markup_persen: '0' });
  harap(k.open_po.kurs_terkunci === true, 'tidak terkunci setelah barang pertama');
  // Ubah kurs ditolak
  const r = await admin.req('PATCH', `/open-po/${po.id}`, { body: { kurs: kursManual(14000) } });
  harap(r.status === 409 && r.json.error.kode === 'KURS_TERKUNCI', `ubah kurs: ${r.status} ${r.json?.error?.kode}`);
  // Hapus semua barang
  await admin.ok('DELETE', `/baris-pesanan/${k.barang[0].id}`);
  const po2 = await admin.ok('GET', `/open-po/${po.id}`);
  harap(po2.kurs_terkunci === true, 'kurs lepas setelah barang dihapus');
  const r2 = await admin.req('PATCH', `/open-po/${po.id}`, { body: { kurs: kursManual(14000) } });
  harap(r2.status === 409, `ubah kurs setelah hapus: ${r2.status}`);
  // Nama masih bisa diubah
  const r3 = await admin.req('PATCH', `/open-po/${po.id}`, { body: { nama: 'Kurs lock (diubah)' } });
  harap(r3.status === 200 && r3.json.data.nama === 'Kurs lock (diubah)', `ubah nama: ${r3.status}`);
});

bagian('H. Perubahan pengaturan tidak memengaruhi PO/baris lama');
await cek('CALC-H1', 'Ubah markup/buffer/DP% di Pengaturan tidak mengubah PO & baris yang sudah ada', async () => {
  await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '10', buffer_aud_persen: '3', dp_persen: '50' });
  const po = await admin.ok('POST', '/open-po', { nama: 'Snapshot', kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' } });
  harap(po.dp_persen === '50', `dp PO ${po.dp_persen}`);
  harap(po.kurs.kurs_jastip === 13054, `kurs ${po.kurs.kurs_jastip}`);
  const cust = await admin.ok('POST', '/customer', { nama: 'Snap', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  const k = await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'A', harga_aud: '24,95', qty: 2, markup_persen: '10' });
  const unitLama = k.barang[0].harga_jual_unit;
  const dpLama = k.ringkasan.dp;
  // Ubah semua pengaturan drastis
  await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '99', buffer_aud_persen: '50', dp_persen: '10' });
  const k2 = await admin.ok('GET', base);
  harap(k2.barang[0].harga_jual_unit === unitLama, `baris lama berubah: ${k2.barang[0].harga_jual_unit} != ${unitLama}`);
  harap(k2.barang[0].markup_persen === '10', `markup snapshot berubah: ${k2.barang[0].markup_persen}`);
  harap(k2.ringkasan.dp === dpLama && k2.ringkasan.dp_persen === '50', `DP PO lama berubah: ${k2.ringkasan.dp}/${k2.ringkasan.dp_persen}`);
  const po2 = await admin.ok('GET', `/open-po/${po.id}`);
  harap(po2.kurs.kurs_jastip === 13054, `kurs PO lama berubah: ${po2.kurs.kurs_jastip}`);
  // PO baru memakai pengaturan baru
  const poBaru = await admin.ok('POST', '/open-po', { nama: 'Snapshot baru', kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' } });
  harap(poBaru.dp_persen === '10', `PO baru dp ${poBaru.dp_persen}`);
  harap(poBaru.kurs.kurs_jastip === Math.ceil(12673 * 1.5), `PO baru kurs ${poBaru.kurs.kurs_jastip}`);
  await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '10', buffer_aud_persen: '3', dp_persen: '50' });
});

process.exit(selesai('hitung'));
