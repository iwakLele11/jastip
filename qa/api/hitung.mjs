// Verifikasi perhitungan: harga jual, kurs jastip, DP, status, pengembalian dana, kurs terkunci,
// snapshot pengaturan, ringkasan PO, dan skenario QA scope. Tiga sumber dibandingkan:
// oracle Python decimal (qa/hitung/oracle.py), pratinjau front-end (frontend/src/js/lib/harga.js),
// dan hasil server (API). Hasil: qa/hasil/hitung[-…].json
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { APP_URL, Klien, QA_TARGET, kursManual, noWaUnik } from '../lib/klien.mjs';
import { bagian, cek, harap, sama, selesai } from '../lib/uji.mjs';
import { pratinjauHarga } from '../../frontend/src/js/lib/harga.js';

const admin = new Klien();
await admin.login();
const PENGATURAN_AWAL = { default_markup_persen: '10', buffer_aud_persen: '3', dp_persen: '50' };
await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);

const ORACLE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../hitung/oracle.py');
function oracle(kasus) {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'qa-oracle-')), 'kasus.json');
  writeFileSync(f, JSON.stringify(kasus));
  return JSON.parse(execFileSync('python3', [ORACLE, f], { encoding: 'utf8' }));
}

// Generator acak deterministik (mulberry32) supaya regresi bisa diulang. Seed bisa diganti: QA_SEED.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.QA_SEED ?? 20261126);
const r = rng(SEED);
const acak = (n) => Math.floor(r() * n);

function hargaAudAcak() {
  const sen = 1 + acak(10_000_000); // 0,01 .. 100.000,00
  const s = (sen / 100).toFixed(2);
  return r() < 0.5 ? s.replace('.', ',') : s; // koma atau titik
}
function markupAcak() {
  const bp = acak(10_001); // 0 .. 100,00 %
  const s = (bp / 100).toFixed(2);
  return r() < 0.5 ? s.replace(/\.?0+$/, '') || '0' : s;
}
const persenBp = (s) => Math.round(Number(String(s).replace(',', '.')) * 100);
const fmtPersen = (bp) => String(bp / 100); // "37.5", "50", "0"

// ---- Kumpulan kasus harga ----
const kasusHarga = [];
const batas = [
  // harga, kurs, markup, qty, keterangan
  ['0.01', 1, '0', 1, 'minimum absolut'],
  ['0.01', 1000000, '100', 999, 'kecil × kurs & markup maksimum'],
  ['100000.00', 1000000, '100', 999, 'maksimum absolut (uji batas BigInt / PHP int)'],
  ['100000.00', 1, '0', 1, 'harga maksimum, kurs minimum'],
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
  ['10', 100, '0', 1, 'tepat Rp1.000'],
  ['10.01', 100, '0', 1, 'Rp1.001 → Rp2.000'],
  ['9.99', 100, '0.11', 1, '999,99 × 1,0011 = 1.000,09 → Rp2.000'],
  ['1', 999, '0.1', 1, '999 × 1,001 = 999,999 → 1.000,00 (half-up) → Rp1.000'],
  ['1', 999, '0.09', 1, '999 × 1,0009 = 999,8991 → 999,90 → Rp1.000'],
  ['0,01', 99950, '0.05', 1, '999,4997… half-up 2 desimal'],
  ['1', 1000, '0.01', 1, '1.000,1 → Rp2.000'],
];
batas.forEach((b, i) => kasusHarga.push({ id: `B${i}`, harga_aud: b[0], kurs: b[1], markup: b[2], qty: b[3], ket: b[4] }));
const kursPilihan = [1, 7, 13, 137, 999, 1000, 1001, 10000, 13054, 99999, 500000, 999999, 1000000];
for (let i = 0; i < 400; i++) {
  kasusHarga.push({ id: `R${i}`, harga_aud: hargaAudAcak(), kurs: kursPilihan[acak(kursPilihan.length)], markup: markupAcak(), qty: 1 + acak(999) });
}
// Kasus khusus: hasil 2 desimal tepat kelipatan Rp1.000 dengan markup desimal (kelipatan tidak boleh naik).
for (let i = 0; i < 20; i++) {
  const unitRibu = 1 + acak(5000);
  kasusHarga.push({ id: `T${i}`, harga_aud: (unitRibu * 10).toFixed(2), kurs: 100, markup: '0', qty: 1 + acak(999), ket: 'tepat kelipatan' });
}

bagian('A. Harga jual: oracle Python vs pratinjau front-end');
const hasilOracle = oracle({ harga: kasusHarga });
const petaOracle = Object.fromEntries(hasilOracle.harga.map((h) => [h.id, h]));
await cek('CALC-A1', `Pratinjau front-end (harga.js) == oracle decimal untuk ${kasusHarga.length} kasus (acak seed ${SEED} + batas)`, () => {
  const beda = [];
  for (const c of kasusHarga) {
    const p = pratinjauHarga({ harga: c.harga_aud, qty: String(c.qty), markup: c.markup, kurs: c.kurs });
    harap(p !== null, `${c.id}: pratinjau null untuk ${JSON.stringify(c)}`);
    const o = petaOracle[c.id];
    if (Number(p.hargaJualUnit) !== o.harga_jual_unit || Number(p.subtotal) !== o.subtotal || Number(p.sen) !== o.sen || Number(p.senSebelumMarkup) !== o.sen_sebelum_markup) {
      beda.push(`${c.id} (${c.harga_aud}×${c.kurs}×(1+${c.markup}%)×${c.qty}): front-end ${p.hargaJualUnit}/${p.subtotal}/sen ${p.sen} vs oracle ${o.harga_jual_unit}/${o.subtotal}/sen ${o.sen}`);
    }
  }
  harap(!beda.length, beda.slice(0, 20).join('\n'));
  return `${kasusHarga.length} kasus cocok (unit, subtotal, rincian sen)`;
});
await cek('CALC-A2', 'Pratinjau front-end kosong (null) tepat untuk input yang ditolak server (batas di luar rentang)', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Pratinjau vs validasi', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Pratinjau', no_wa: noWaUnik() });
  const salah = [];
  const kasus = [
    ['0', '1', '0'], ['100000.01', '1', '0'], ['1.299', '1', '0'], ['-1', '1', '0'], ['abc', '1', '0'], ['1', '0', '0'], ['1', '1000', '0'],
    ['1', '1,5', '0'], ['1', '1', '100.01'], ['1', '1', '-1'], ['1', '1', '1.234'], ['', '1', '0'], ['1', '', '0'], ['1', '1', ''],
    ['0,01', '1', '0'], ['100000', '999', '100'], ['24,95', '2', '10'],
  ];
  for (const [h, q, m] of kasus) {
    const p = pratinjauHarga({ harga: h, qty: q, markup: m, kurs: 13054 });
    const rs = await admin.req('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { body: { nama_barang: 'x', harga_aud: h, qty: /^\d+$/.test(q) ? Number(q) : q, markup_persen: m } });
    const serverOk = rs.status === 201;
    if ((p !== null) !== serverOk) salah.push(`harga "${h}" qty "${q}" markup "${m}": pratinjau ${p ? p.hargaJualUnit : 'null'}, server ${rs.status}`);
    if (p && serverOk && Number(p.hargaJualUnit) !== rs.json.data.barang.at(-1).harga_jual_unit) salah.push(`angka beda untuk ${h}/${q}/${m}`);
  }
  harap(!salah.length, salah.join('\n'));
  return `${kasus.length} kasus`;
});

bagian('B. Harga jual: hasil server == oracle');
const perKurs = new Map();
for (const c of kasusHarga) {
  if (!perKurs.has(c.kurs)) perKurs.set(c.kurs, []);
  perKurs.get(c.kurs).push(c);
}
await cek('CALC-B1', `Server (POST baris-pesanan, kurs manual 1 … 1.000.000) == oracle untuk ${kasusHarga.length} kasus`, async () => {
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
      if (baris.harga_jual_unit !== o.harga_jual_unit || baris.subtotal !== o.subtotal || baris.kurs_jastip !== kurs) {
        beda.push(`${c.id} (${c.harga_aud}×${kurs}×(1+${c.markup}%)×${c.qty}): server ${baris.harga_jual_unit}/${baris.subtotal} vs oracle ${o.harga_jual_unit}/${o.subtotal}`);
      }
      const hargaNormal = (Number(c.harga_aud.replace(',', '.'))).toFixed(2);
      if (baris.harga_aud !== hargaNormal) beda.push(`${c.id}: harga_aud respons "${baris.harga_aud}" != "${hargaNormal}"`);
      if (baris.markup_persen !== fmtPersen(persenBp(c.markup))) beda.push(`${c.id}: markup respons "${baris.markup_persen}" != "${fmtPersen(persenBp(c.markup))}"`);
    }
    // Total keranjang = Σ subtotal (tanpa Kosong); dihitung ulang dari baris respons.
    const k = await admin.ok('GET', `/open-po/${po.id}/keranjang/${cust.id}`);
    const total = list.reduce((s, c) => s + petaOracle[c.id].subtotal, 0);
    if (k.ringkasan.total !== total) beda.push(`kurs ${kurs}: total keranjang ${k.ringkasan.total} != ${total}`);
  }
  harap(!beda.length, beda.slice(0, 20).join('\n'));
  return `${dipakai} baris server cocok; total keranjang per kurs cocok`;
});
await cek('CALC-B2', 'PATCH baris (harga/qty/markup) dihitung ulang dengan kurs snapshot baris == oracle', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'PATCH baris', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'PATCH', no_wa: noWaUnik() });
  const k = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '24,95', qty: 2, markup_persen: '10' });
  const id = k.barang[0].id;
  const ubah = [];
  for (let i = 0; i < 25; i++) {
    const body = {};
    if (r() < 0.6) body.harga_aud = hargaAudAcak();
    if (r() < 0.6) body.qty = 1 + acak(999);
    if (r() < 0.6) body.markup_persen = markupAcak();
    ubah.push(body);
  }
  const state = { harga_aud: '24,95', qty: 2, markup: '10' };
  const kasus = [];
  const hasil = [];
  for (const [i, body] of ubah.entries()) {
    const d = await admin.ok('PATCH', `/baris-pesanan/${id}`, body);
    if (body.harga_aud) state.harga_aud = body.harga_aud;
    if (body.qty) state.qty = body.qty;
    if (body.markup_persen) state.markup = body.markup_persen;
    kasus.push({ id: `P${i}`, harga_aud: state.harga_aud, kurs: 13054, markup: state.markup, qty: state.qty });
    hasil.push(d.barang[0]);
  }
  const o = oracle({ harga: kasus }).harga;
  const beda = o.filter((x, i) => hasil[i].harga_jual_unit !== x.harga_jual_unit || hasil[i].subtotal !== x.subtotal || hasil[i].kurs_jastip !== 13054);
  harap(!beda.length, beda.map((x) => `${x.id}: ${JSON.stringify(kasus.find((c) => c.id === x.id))} oracle ${x.harga_jual_unit}`).join('\n'));
  const kosong = await admin.ok('PATCH', `/baris-pesanan/${id}`, {});
  sama(kosong.barang[0].subtotal, hasil.at(-1).subtotal, 'body {} tidak mengubah');
  return `${ubah.length} PATCH cocok`;
});

bagian('C. Vektor uji dokumen');
await cek('CALC-C1', 'Vektor uji kontrak §12.1 dan tabel scope (harga × kurs, × (1+markup) 2 desimal, harga/unit, subtotal) cocok di oracle dan front-end', () => {
  const harapan = {
    B5: [32569730, 35826703, 359000, 718000], B6: [11095900, 12760285, 128000, 384000], B7: [169688946, 183264062, 1833000, 1833000],
    B8: [null, 35900000, 359000, 359000], B9: [null, 4100000, 41000, 41000], B10: [null, 82100000, 821000, 821000], B11: [null, 655964, 7000, 7000],
  };
  const salah = [];
  for (const [id, [sebelum, sen, unit, sub]] of Object.entries(harapan)) {
    const o = petaOracle[id];
    const c = kasusHarga.find((x) => x.id === id);
    const p = pratinjauHarga({ harga: c.harga_aud, qty: String(c.qty), markup: c.markup, kurs: c.kurs });
    for (const [label, x] of [['oracle', [o.sen_sebelum_markup, o.sen, o.harga_jual_unit, o.subtotal]], ['front-end', [Number(p.senSebelumMarkup), Number(p.sen), Number(p.hargaJualUnit), Number(p.subtotal)]]]) {
      if ((sebelum !== null && x[0] !== sebelum) || x[1] !== sen || x[2] !== unit || x[3] !== sub) salah.push(`${id} ${label}: ${x} != ${[sebelum, sen, unit, sub]}`);
    }
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('K. Kurs jastip (otomatis + buffer)');
await cek('CALC-K1', 'Kurs jastip otomatis = ceil(kurs_pasar × (1 + buffer%)) == oracle (vektor kontrak §12.3 + 60 acak, buffer 0–100% desimal)', async () => {
  const kasus = [
    { id: 'V1', kurs_pasar: '12673', buffer: '3', harap: 13054 }, { id: 'V2', kurs_pasar: '10000', buffer: '3', harap: 10300 },
    { id: 'V3', kurs_pasar: '12673.45', buffer: '3.5', harap: 13118 }, { id: 'V4', kurs_pasar: '500000', buffer: '100', harap: 1000000 },
    { id: 'V5', kurs_pasar: '0.000001', buffer: '0', harap: 1 }, { id: 'V6', kurs_pasar: '12673.000001', buffer: '0', harap: 12674 },
    { id: 'V7', kurs_pasar: '9999.99', buffer: '0.01', harap: null },
  ];
  for (let i = 0; i < 60; i++) {
    const bulat = 1 + acak(499_999);
    const des = r() < 0.7 ? `.${String(acak(1_000_000)).padStart(6, '0').replace(/0+$/, '') || '0'}` : '';
    kasus.push({ id: `K${i}`, kurs_pasar: `${bulat}${des}`, buffer: (acak(10_001) / 100).toString() });
  }
  const o = Object.fromEntries(oracle({ kurs: kasus }).kurs.map((x) => [x.id, x.kurs_jastip]));
  const salah = [];
  const perBuffer = new Map();
  for (const c of kasus) {
    if (!perBuffer.has(c.buffer)) perBuffer.set(c.buffer, []);
    perBuffer.get(c.buffer).push(c);
  }
  for (const [buffer, list] of perBuffer) {
    await admin.ok('PATCH', '/pengaturan', { buffer_aud_persen: buffer });
    for (const c of list) {
      if (c.harap != null && o[c.id] !== c.harap) salah.push(`${c.id}: oracle ${o[c.id]} != dokumen ${c.harap}`);
      const harapKurs = o[c.id];
      const rs = await admin.req('POST', '/open-po', { body: { nama: `Kurs ${c.id}`, kurs: { mode: 'otomatis', kurs_pasar: c.kurs_pasar, tanggal_kurs: '2026-10-25', kurs_jastip: 1 } } });
      if (harapKurs > 1_000_000) {
        if (rs.status !== 422) salah.push(`${c.id}: kurs ${harapKurs} > 1.000.000 tapi status ${rs.status}`);
        continue;
      }
      if (rs.status !== 201) { salah.push(`${c.id}: ${rs.status} ${rs.teks.slice(0, 150)}`); continue; }
      const k = rs.json.data.kurs;
      const pasarNormal = c.kurs_pasar.includes('.') ? c.kurs_pasar.replace(/0+$/, '').replace(/\.$/, '') : c.kurs_pasar;
      if (k.kurs_jastip !== harapKurs || k.mode !== 'otomatis' || k.buffer_persen !== String(Number(buffer)) || k.kurs_pasar !== pasarNormal || k.tanggal_kurs !== '2026-10-25' || k.sumber !== 'Frankfurter') {
        salah.push(`${c.id} (${c.kurs_pasar} × ${buffer}%): ${JSON.stringify(k)} vs kurs ${harapKurs}`);
      }
    }
  }
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  harap(!salah.length, salah.slice(0, 20).join('\n'));
  return `${kasus.length} kasus; kurs_jastip dari klien diabaikan pada mode otomatis`;
});
await cek('CALC-K2', 'GET /kurs/aud-idr memakai buffer pengaturan saat ini (stub 12673: 3% → 13.054, 3,5% → 13.117); Frankfurter gagal → 502', async () => {
  if (QA_TARGET !== 'dev') return 'dilewati (paket memanggil Frankfurter sungguhan)';
  const a = await admin.ok('GET', '/kurs/aud-idr');
  sama(a, { mata_uang: 'AUD', kurs_pasar: '12673', tanggal_kurs: '2026-10-25', buffer_persen: '3', kurs_jastip: 13054, sumber: 'Frankfurter' }, 'buffer 3');
  await admin.ok('PATCH', '/pengaturan', { buffer_aud_persen: '3,5' });
  const b = await admin.ok('GET', '/kurs/aud-idr');
  sama([b.buffer_persen, b.kurs_jastip], ['3.5', 13117], 'buffer 3,5');
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  await fetch(`${APP_URL}/__dev/kurs-mode?set=gagal`);
  try {
    const g = await admin.req('GET', '/kurs/aud-idr');
    sama([g.status, g.json?.error?.kode], [502, 'KURS_GAGAL'], 'gagal');
  } finally { await fetch(`${APP_URL}/__dev/kurs-mode?set=ok`); }
});
await cek('CALC-K3', 'Kurs manual tanpa buffer; kurs_pasar + tanggal opsional berdua sebagai pembanding', async () => {
  const a = await admin.ok('POST', '/open-po', { nama: 'Manual', kurs: kursManual(13100) });
  sama([a.kurs.mode, a.kurs.kurs_jastip, a.kurs.buffer_persen, a.kurs.kurs_pasar, a.kurs.tanggal_kurs, a.kurs.sumber], ['manual', 13100, null, null, null, null]);
  const b = await admin.ok('POST', '/open-po', { nama: 'Manual + pembanding', kurs: { mode: 'manual', kurs_jastip: 13054, kurs_pasar: '12673', tanggal_kurs: '2026-10-25' } });
  sama([b.kurs.kurs_jastip, b.kurs.buffer_persen, b.kurs.kurs_pasar, b.kurs.tanggal_kurs], [13054, null, '12673', '2026-10-25']);
  const c = await admin.req('POST', '/open-po', { body: { nama: 'Manual tanggal saja', kurs: { mode: 'manual', kurs_jastip: 13054, tanggal_kurs: '2026-10-25' } } });
  harap(c.status === 422, `kurs_pasar tanpa tanggal / sebaliknya diterima: ${c.status} ${c.teks.slice(0, 120)}`);
});

bagian('D. DP (termasuk DP% desimal) & status: oracle vs server');
const kasusDp = [];
const dpBps = [0, 1, 4999, 5000, 5001, 10000, 3750, 1234, 10, 9999, 3333];
let n = 0;
for (const dpBp of dpBps) {
  for (let i = 0; i < 6; i++) kasusDp.push({ id: `DP${n++}`, total: (1 + acak(3000)) * 1000, dp_bp: dpBp });
}
kasusDp.push({ id: 'DP-nol', total: 0, dp_bp: 5000 });
kasusDp.push({ id: 'DP-kecil', total: 1000, dp_bp: 5000 });
kasusDp.push({ id: 'DP-1', total: 1000, dp_bp: 1 });
kasusDp.push({ id: 'DP-besar', total: 999999000, dp_bp: 3333 });
const oracleDp = Object.fromEntries(oracle({ dp: kasusDp }).dp.map((d) => [d.id, d.dp]));
await cek('CALC-D1', `DP server (keranjang nyata, DP% 0–100 termasuk desimal) == oracle decimal (${kasusDp.length} kasus)`, async () => {
  const beda = [];
  const perDp = new Map();
  for (const c of kasusDp) {
    if (!perDp.has(c.dp_bp)) perDp.set(c.dp_bp, []);
    perDp.get(c.dp_bp).push(c);
  }
  for (const [dpBp, list] of perDp) {
    await admin.ok('PATCH', '/pengaturan', { dp_persen: fmtPersen(dpBp) });
    const po = await admin.ok('POST', '/open-po', { nama: `DP ${dpBp}`, kurs: kursManual(100000) });
    if (po.dp_persen !== fmtPersen(dpBp)) beda.push(`PO dp_persen ${po.dp_persen} != ${fmtPersen(dpBp)}`);
    for (const c of list) {
      // Keranjang dengan total persis c.total: kurs 100.000, markup 0, qty 1, harga = total / 100.000.
      const cust = await admin.ok('POST', '/customer', { nama: `DP ${c.id}`, no_wa: noWaUnik() });
      const harga = ((c.total || 1000) / 100000).toFixed(2);
      let k = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: harga, qty: 1, markup_persen: '0' });
      if (c.total === 0) k = await admin.ok('POST', `/baris-pesanan/${k.barang[0].id}/kosong`);
      if (k.ringkasan.total !== c.total) { beda.push(`${c.id}: total server ${k.ringkasan.total} != ${c.total}`); continue; }
      if (k.ringkasan.dp !== oracleDp[c.id] || k.ringkasan.dp_persen !== fmtPersen(dpBp)) beda.push(`${c.id} (total ${c.total}, dp_bp ${dpBp}): server dp ${k.ringkasan.dp} (${k.ringkasan.dp_persen}%) != oracle ${oracleDp[c.id]}`);
    }
  }
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  harap(!beda.length, beda.slice(0, 20).join('\n'));
  return `${kasusDp.length} kasus DP cocok`;
});

bagian('E. Lima status & transisi (server) sesuai tabel kontrak §12.2');
async function keranjangQa(nama, kurs = kursManual(13054)) {
  const po = await admin.ok('POST', '/open-po', { nama, kurs });
  const cust = await admin.ok('POST', '/customer', { nama, no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  for (const b of [['Barang A', '24,95', 2, '10'], ['Barang B', '8,50', 3, '15'], ['Barang C', '129,99', 1, '8']]) {
    await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: b[0], harga_aud: b[1], qty: b[2], markup_persen: b[3] });
  }
  return { po, cust, base };
}
const ringkas = (rk) => [rk.status, rk.total, rk.dp, rk.total_pembayaran, rk.total_pengembalian, rk.dana_diterima, rk.sisa, rk.kelebihan_bayar];
await cek('CALC-E1', 'Transisi maju belum_bayar → kurang_dp → dp → lunas → lebih_bayar (B Kosong) → lunas (refund) sesuai vektor kontrak §12.2', async () => {
  const { base } = await keranjangQa('Status maju');
  const langkah = [['awal', (await admin.ok('GET', base)).ringkasan]];
  langkah.push(['bayar 500.000', (await admin.ok('POST', `${base}/pembayaran`, { nominal: 500000, tanggal: '2026-10-28' })).ringkasan]);
  langkah.push(['bayar s/d DP', (await admin.ok('POST', `${base}/pembayaran`, { nominal: 968000, tanggal: '2026-10-28' })).ringkasan]);
  langkah.push(['pelunasan', (await admin.ok('POST', `${base}/pembayaran`, { nominal: 1467000, tanggal: '2026-10-30' })).ringkasan]);
  const kk = await admin.ok('GET', base);
  langkah.push(['B kosong', (await admin.ok('POST', `/baris-pesanan/${kk.barang[1].id}/kosong`)).ringkasan]);
  langkah.push(['refund 384.000', (await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-31' })).ringkasan]);
  const harapan = [
    ['belum_bayar', 2935000, 1468000, 0, 0, 0, 2935000, 0],
    ['kurang_dp', 2935000, 1468000, 500000, 0, 500000, 2435000, 0],
    ['dp', 2935000, 1468000, 1468000, 0, 1468000, 1467000, 0],
    ['lunas', 2935000, 1468000, 2935000, 0, 2935000, 0, 0],
    ['lebih_bayar', 2551000, 1276000, 2935000, 0, 2935000, 0, 384000],
    ['lunas', 2551000, 1276000, 2935000, 384000, 2551000, 0, 0],
  ];
  const salah = langkah.filter(([, rk], i) => JSON.stringify(ringkas(rk)) !== JSON.stringify(harapan[i])).map(([nm, rk]) => `${nm}: ${ringkas(rk)}`);
  harap(!salah.length, salah.join('\n'));
  return langkah.map(([nm, rk]) => `${nm}=${rk.status}`).join(' → ');
});
await cek('CALC-E2', 'Transisi mundur: hapus refund → lebih_bayar; lepas Kosong → lunas; hapus pembayaran → dp → kurang_dp → belum_bayar; batas tepat dana = DP → dp, DP − 1.000 → kurang_dp', async () => {
  const { base } = await keranjangQa('Status mundur');
  const p1 = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1468000, tanggal: '2026-10-28' });
  const idP1 = p1.riwayat[0].id;
  sama(p1.ringkasan.status, 'dp', 'dana = DP tepat');
  const p2 = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1467000, tanggal: '2026-10-29' });
  const idP2 = p2.riwayat[0].id;
  const kk = await admin.ok('GET', base);
  await admin.ok('POST', `/baris-pesanan/${kk.barang[1].id}/kosong`);
  const rf = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-31', catatan: '  ' });
  const idRf = rf.riwayat.find((x) => x.jenis === 'pengembalian_dana').id;
  sama(rf.riwayat.find((x) => x.jenis === 'pengembalian_dana').catatan, null, 'catatan spasi → null');
  const a = await admin.ok('DELETE', `/pengembalian-dana/${idRf}`);
  sama(ringkas(a.ringkasan), ['lebih_bayar', 2551000, 1276000, 2935000, 0, 2935000, 0, 384000], 'hapus refund');
  const b = await admin.ok('DELETE', `/baris-pesanan/${kk.barang[1].id}/kosong`);
  sama(ringkas(b.ringkasan), ['lunas', 2935000, 1468000, 2935000, 0, 2935000, 0, 0], 'lepas Kosong');
  const c = await admin.ok('DELETE', `/pembayaran/${idP2}`);
  sama(c.ringkasan.status, 'dp', 'hapus pelunasan');
  const d = await admin.ok('DELETE', `/pembayaran/${idP1}`);
  sama(ringkas(d.ringkasan), ['belum_bayar', 2935000, 1468000, 0, 0, 0, 2935000, 0], 'hapus semua');
  const e = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1467000, tanggal: '2026-10-28' });
  sama(e.ringkasan.status, 'kurang_dp', 'DP − 1.000');
  const f = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1, tanggal: '2026-10-28' });
  sama(f.ringkasan.status, 'kurang_dp', 'DP − 999 (dana 1.467.001 < 1.468.000)');
});
await cek('CALC-E3', 'Total Rp0: semua Kosong + dana 0 → lunas; hanya pembayaran tanpa barang → lebih_bayar; refund penuh → lunas 0 = 0', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Total nol', kurs: kursManual(13054) });
  const c1 = await admin.ok('POST', '/customer', { nama: 'Nol 1', no_wa: noWaUnik() });
  const k1 = await admin.ok('POST', `/open-po/${po.id}/keranjang/${c1.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' });
  const k1b = await admin.ok('POST', `/baris-pesanan/${k1.barang[0].id}/kosong`);
  sama(ringkas(k1b.ringkasan), ['lunas', 0, 0, 0, 0, 0, 0, 0], 'semua Kosong');
  const c2 = await admin.ok('POST', '/customer', { nama: 'Nol 2', no_wa: noWaUnik() });
  const k2 = await admin.ok('POST', `/open-po/${po.id}/keranjang/${c2.id}/pembayaran`, { nominal: 50000, tanggal: '2026-10-28' });
  sama(ringkas(k2.ringkasan), ['lebih_bayar', 0, 0, 50000, 0, 50000, 0, 50000], 'bayar tanpa barang');
  const k2b = await admin.ok('POST', `/open-po/${po.id}/keranjang/${c2.id}/pengembalian-dana`, { nominal: 50000, tanggal: '2026-10-28' });
  sama(ringkas(k2b.ringkasan), ['lunas', 0, 0, 50000, 50000, 0, 0, 0], 'refund penuh');
  const c3 = await admin.ok('POST', '/customer', { nama: 'Nol 3', no_wa: noWaUnik() });
  const k3 = await admin.ok('GET', `/open-po/${po.id}/keranjang/${c3.id}`);
  sama([k3.ringkasan.status, k3.barang.length, k3.riwayat.length], ['lunas', 0, 0], 'keranjang belum ada: 200 angka nol');
  const daftar = await admin.ok('GET', `/open-po/${po.id}/customer`);
  sama(daftar.map((x) => x.customer.nama).sort(), ['Nol 1', 'Nol 2'], 'keranjang kosong (Nol 3) tidak tampil di daftar PO');
});
await cek('CALC-E4', 'Jalan acak 6 keranjang × 30 aksi (barang, Kosong, ubah, hapus, bayar, hapus bayar, refund, hapus refund): ringkasan, status, bisa_dihapus, kode error == oracle', async () => {
  const salah = [];
  const langkahStatus = [];
  const barisHarga = [];
  let aksi = 0;
  for (let ke = 0; ke < 6; ke++) {
    const dpBp = [5000, 3750, 0, 10000, 1234, 5001][ke];
    await admin.ok('PATCH', '/pengaturan', { dp_persen: fmtPersen(dpBp) });
    const kurs = [13054, 1, 1000000, 9999, 100000, 777][ke];
    const po = await admin.ok('POST', '/open-po', { nama: `Acak ${ke}`, kurs: kursManual(kurs) });
    const cust = await admin.ok('POST', '/customer', { nama: `Acak ${ke}`, no_wa: noWaUnik() });
    const base = `/open-po/${po.id}/keranjang/${cust.id}`;
    let k = await admin.ok('GET', base);
    for (let i = 0; i < 30; i++) {
      const pilih = acak(8);
      const bayar = k.riwayat.filter((x) => x.jenis === 'pembayaran');
      const kembali = k.riwayat.filter((x) => x.jenis === 'pengembalian_dana');
      let res;
      let label;
      if (pilih === 0 || k.barang.length === 0) {
        const b = { nama_barang: `b${i}`, harga_aud: kurs >= 100000 ? ((1 + acak(5000)) / 100).toFixed(2) : hargaAudAcak(), qty: 1 + acak(5), markup_persen: markupAcak() };
        label = `tambah ${JSON.stringify(b)}`;
        res = await admin.req('POST', `${base}/baris-pesanan`, { body: b });
      } else if (pilih === 1) {
        const b = k.barang[acak(k.barang.length)];
        label = `${b.kosong ? 'lepas' : 'tandai'} Kosong ${b.id}`;
        res = await admin.req(b.kosong ? 'DELETE' : 'POST', `/baris-pesanan/${b.id}/kosong`);
      } else if (pilih === 2) {
        const b = k.barang[acak(k.barang.length)];
        label = `ubah ${b.id}`;
        res = await admin.req('PATCH', `/baris-pesanan/${b.id}`, { body: { qty: 1 + acak(5), markup_persen: markupAcak() } });
      } else if (pilih === 3 && k.barang.length > 1) {
        const b = k.barang[acak(k.barang.length)];
        label = `hapus barang ${b.id}`;
        res = await admin.req('DELETE', `/baris-pesanan/${b.id}`);
      } else if (pilih <= 4) {
        const nominal = 1000 * (1 + acak(Math.max(1, Math.ceil((k.ringkasan.sisa || 100000) / 1000) + 50)));
        label = `bayar ${nominal}`;
        res = await admin.req('POST', `${base}/pembayaran`, { body: { nominal, tanggal: `2026-10-${String(10 + acak(20)).padStart(2, '0')}` } });
      } else if (pilih === 5 && bayar.length) {
        const p = bayar[acak(bayar.length)];
        const sB = bayar.reduce((s, x) => s + x.nominal, 0);
        const sK = kembali.reduce((s, x) => s + x.nominal, 0);
        const boleh = sB - p.nominal >= sK;
        if (p.bisa_dihapus !== boleh) salah.push(`keranjang ${ke} langkah ${i}: bisa_dihapus pembayaran ${p.id} = ${p.bisa_dihapus}, harap ${boleh}`);
        label = `hapus bayar ${p.id} (boleh ${boleh})`;
        res = await admin.req('DELETE', `/pembayaran/${p.id}`);
        if ((res.status === 200) !== boleh || (!boleh && res.json?.error?.kode !== 'HAPUS_PENGEMBALIAN_DULU')) salah.push(`keranjang ${ke} langkah ${i}: ${label} -> ${res.status}`);
      } else if (pilih === 6) {
        const lebih = k.ringkasan.kelebihan_bayar;
        const nominal = lebih > 0 ? 1 + acak(lebih + 1000) : 1000;
        label = `refund ${nominal} (kelebihan ${lebih})`;
        res = await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal, tanggal: '2026-10-30' } });
        const harapStatus = lebih === 0 ? 409 : (nominal > lebih ? 422 : 201);
        if (res.status !== harapStatus) salah.push(`keranjang ${ke} langkah ${i}: ${label} -> ${res.status}, harap ${harapStatus}`);
        if (res.status === 422 && res.json?.error?.field?.nominal !== `Nominal maksimal Rp${lebih.toLocaleString('id-ID')} (kelebihan bayar).`) salah.push(`pesan refund: ${res.json?.error?.field?.nominal}`);
      } else if (kembali.length) {
        const x = kembali[acak(kembali.length)];
        label = `hapus refund ${x.id}`;
        res = await admin.req('DELETE', `/pengembalian-dana/${x.id}`);
        if (res.status !== 200) salah.push(`keranjang ${ke} langkah ${i}: ${label} -> ${res.status}`);
      } else {
        continue;
      }
      aksi++;
      if (res.status >= 500) salah.push(`keranjang ${ke} langkah ${i}: ${label} -> ${res.status}`);
      if (res.status < 300) k = res.json.data;
      if (k.ringkasan.dp_persen !== fmtPersen(dpBp)) salah.push(`dp_persen ${k.ringkasan.dp_persen}`);
      for (const b of k.barang) barisHarga.push({ id: `k${ke}-${b.id}-${i}`, harga_aud: b.harga_aud, kurs, markup: b.markup_persen, qty: b.qty, server: [b.harga_jual_unit, b.subtotal] });
      const total = k.barang.filter((b) => !b.kosong).reduce((s, b) => s + b.subtotal, 0);
      const sB = k.riwayat.filter((x) => x.jenis === 'pembayaran').reduce((s, x) => s + x.nominal, 0);
      const sK = k.riwayat.filter((x) => x.jenis === 'pengembalian_dana').reduce((s, x) => s + x.nominal, 0);
      langkahStatus.push({ id: `k${ke}-${i}`, total, dp_bp: dpBp, bayar: sB, kembali: sK, server: k.ringkasan, label });
    }
  }
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  const o = oracle({ status: langkahStatus, harga: barisHarga });
  o.status.forEach((x, i) => {
    const s = langkahStatus[i];
    const sv = s.server;
    const hrp = [s.total, x.dp, s.bayar, s.kembali, x.dana_diterima, x.sisa, x.kelebihan_bayar, x.status];
    const akt = [sv.total, sv.dp, sv.total_pembayaran, sv.total_pengembalian, sv.dana_diterima, sv.sisa, sv.kelebihan_bayar, sv.status];
    if (JSON.stringify(hrp) !== JSON.stringify(akt)) salah.push(`${s.id} setelah "${s.label}": server ${akt} != oracle ${hrp}`);
  });
  o.harga.forEach((x, i) => {
    if (x.harga_jual_unit !== barisHarga[i].server[0] || x.subtotal !== barisHarga[i].server[1]) salah.push(`baris ${x.id}: server ${barisHarga[i].server} oracle ${x.harga_jual_unit}/${x.subtotal}`);
  });
  harap(!salah.length, salah.slice(0, 20).join('\n'));
  const jumlah = langkahStatus.reduce((m, s) => ({ ...m, [s.server.status]: (m[s.server.status] ?? 0) + 1 }), {});
  return `${aksi} aksi; status dikunjungi ${JSON.stringify(jumlah)}`;
});

bagian('F. Pengembalian dana: batas, status, hapus pembayaran diblokir');
await cek('CALC-F1', 'Refund saat bukan lebih bayar → 409; > kelebihan → 422 (pesan nominal); = kelebihan → 201 lunas; 0/negatif → 422', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Refund batas', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Refund', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '100', qty: 1, markup_persen: '0' });
  const total = (await admin.ok('GET', base)).ringkasan.total;
  sama(total, 1306000, 'total (100 × 13.054 = 1.305.400 → 1.306.000)');
  const r409 = await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: 1000, tanggal: '2026-10-28' } });
  sama([r409.status, r409.json?.error?.kode, r409.json?.error?.pesan], [409, 'PENGEMBALIAN_TIDAK_AKTIF', 'Pengembalian dana hanya bisa dicatat saat status Lebih bayar.']);
  await admin.ok('POST', `${base}/pembayaran`, { nominal: total, tanggal: '2026-10-28' });
  sama((await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: 1, tanggal: '2026-10-28' } })).status, 409, 'lunas tepat → 409');
  await admin.ok('POST', `${base}/pembayaran`, { nominal: 1384000, tanggal: '2026-10-28' });
  const r422 = await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: 1384001, tanggal: '2026-10-28' } });
  sama([r422.status, r422.json?.error?.field?.nominal], [422, 'Nominal maksimal Rp1.384.000 (kelebihan bayar).']);
  for (const v of [0, -1]) sama((await admin.req('POST', `${base}/pengembalian-dana`, { body: { nominal: v, tanggal: '2026-10-28' } })).json?.error?.field?.nominal, 'Nominal harus lebih dari Rp0.', `nominal ${v}`);
  const sebagian = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 1000000, tanggal: '2026-10-28', catatan: 'transfer BCA' });
  sama([sebagian.ringkasan.status, sebagian.ringkasan.kelebihan_bayar], ['lebih_bayar', 384000], 'refund sebagian');
  const ok = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-29' });
  sama([ok.ringkasan.status, ok.ringkasan.dana_diterima, ok.ringkasan.total_pengembalian], ['lunas', total, 1384000], 'refund tepat');
});
await cek('CALC-F2', 'Hapus pembayaran yang membuat dana negatif → 409 HAPUS_PENGEMBALIAN_DULU (pesan nominal); setelah refund dihapus → bisa', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Hapus blok', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'HapusBlok', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '100', qty: 1, markup_persen: '0' });
  const k = await admin.ok('GET', base);
  const kb = await admin.ok('POST', `${base}/pembayaran`, { nominal: k.ringkasan.total + 384000, tanggal: '2026-10-28' });
  const idBayar = kb.riwayat[0].id;
  const kr = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-29' });
  sama(kr.riwayat.find((x) => x.id === idBayar && x.jenis === 'pembayaran').bisa_dihapus, false, 'bisa_dihapus');
  const r = await admin.req('DELETE', `/pembayaran/${idBayar}`);
  sama([r.status, r.json?.error?.kode, r.json?.error?.pesan], [409, 'HAPUS_PENGEMBALIAN_DULU',
    'Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana Rp384.000. Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini.']);
  const idRefund = kr.riwayat.find((x) => x.jenis === 'pengembalian_dana').id;
  const setelah = await admin.ok('DELETE', `/pengembalian-dana/${idRefund}`);
  sama(setelah.riwayat.find((x) => x.id === idBayar).bisa_dihapus, true, 'bisa_dihapus setelah refund dihapus');
  sama((await admin.req('DELETE', `/pembayaran/${idBayar}`)).status, 200, 'hapus pembayaran');
  sama((await admin.req('DELETE', `/pembayaran/${idBayar}`)).status, 404, 'hapus kedua kali');
});
await cek('CALC-F3', 'Refund untuk customer tanpa keranjang di PO → 409 dan keranjang tidak dibuat', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Refund tanpa keranjang', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Tanpa keranjang', no_wa: noWaUnik() });
  const r1 = await admin.req('POST', `/open-po/${po.id}/keranjang/${cust.id}/pengembalian-dana`, { body: { nominal: 1000, tanggal: '2026-10-28' } });
  sama([r1.status, r1.json?.error?.kode], [409, 'PENGEMBALIAN_TIDAK_AKTIF']);
  sama((await admin.ok('GET', `/open-po/${po.id}/customer`)).length, 0, 'tidak muncul di daftar PO');
  sama((await admin.ok('GET', `/customer/${cust.id}`)).punya_pesanan, false, 'punya_pesanan');
});

bagian('G. Kurs terkunci');
await cek('CALC-G1', 'Kurs terkunci sejak barang pertama; tetap terkunci walau semua barang dihapus; nama/status tetap bisa diubah; konflik membatalkan seluruh PATCH', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Kurs lock', kurs: kursManual(13054) });
  harap(po.kurs_terkunci === false && po.kurs_terkunci_pada === null, 'baru dibuat sudah terkunci');
  const cust = await admin.ok('POST', '/customer', { nama: 'Lock', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  const k = await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '10', qty: 1, markup_persen: '0' });
  harap(k.open_po.kurs_terkunci === true, 'tidak terkunci setelah barang pertama');
  const r = await admin.req('PATCH', `/open-po/${po.id}`, { body: { nama: 'tidak boleh tersimpan', kurs: kursManual(14000) } });
  sama([r.status, r.json?.error?.kode], [409, 'KURS_TERKUNCI'], 'ubah kurs');
  const poA = await admin.ok('GET', `/open-po/${po.id}`);
  sama([poA.nama, poA.kurs.kurs_jastip], ['Kurs lock', 13054], 'nama ikut dibatalkan');
  harap(typeof poA.kurs_terkunci_pada === 'string', `kurs_terkunci_pada ${poA.kurs_terkunci_pada}`);
  await admin.ok('DELETE', `/baris-pesanan/${k.barang[0].id}`);
  const po2 = await admin.ok('GET', `/open-po/${po.id}`);
  harap(po2.kurs_terkunci === true && po2.kurs_terkunci_pada === poA.kurs_terkunci_pada, 'kurs lepas / waktu berubah setelah barang dihapus');
  sama((await admin.req('PATCH', `/open-po/${po.id}`, { body: { kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' } } })).status, 409, 'ambil kurs terbaru setelah hapus');
  const r3 = await admin.ok('PATCH', `/open-po/${po.id}`, { nama: 'Kurs lock (diubah)', status: 'selesai' });
  sama([r3.nama, r3.status, r3.kurs.kurs_jastip], ['Kurs lock (diubah)', 'selesai', 13054], 'ubah nama/status');
});
await cek('CALC-G2', 'Tambah barang yang gagal (422, 404 customer, 409 customer arsip) tidak mengunci kurs; pembayaran saja tidak mengunci kurs', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Lock gagal', kurs: kursManual(13054) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Lock arsip', no_wa: noWaUnik() });
  await admin.ok('POST', `/customer/${cust.id}/arsip`);
  const hasil = [];
  hasil.push((await admin.req('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { body: { nama_barang: '', harga_aud: '1', qty: 1, markup_persen: '0' } })).status);
  hasil.push((await admin.req('POST', `/open-po/${po.id}/keranjang/999999/baris-pesanan`, { body: { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' } })).status);
  const r409 = await admin.req('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { body: { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' } });
  hasil.push(r409.status);
  sama([hasil, r409.json?.error?.kode], [[422, 404, 409], 'CUSTOMER_DIARSIPKAN']);
  sama((await admin.ok('GET', `/open-po/${po.id}`)).kurs_terkunci, false, 'kurs terkunci oleh request gagal');
  const c2 = await admin.ok('POST', '/customer', { nama: 'Lock bayar', no_wa: noWaUnik() });
  await admin.ok('POST', `/open-po/${po.id}/keranjang/${c2.id}/pembayaran`, { nominal: 1000, tanggal: '2026-10-28' });
  const po2 = await admin.ok('GET', `/open-po/${po.id}`);
  sama(po2.kurs_terkunci, false, 'terkunci oleh pembayaran');
  const u = await admin.ok('PATCH', `/open-po/${po.id}`, { kurs: kursManual(14000) });
  sama(u.kurs.kurs_jastip, 14000, 'kurs masih bisa diubah setelah pembayaran saja');
  const k = await admin.ok('POST', `/open-po/${po.id}/keranjang/${c2.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' });
  sama([k.barang[0].kurs_jastip, k.barang[0].harga_jual_unit, k.open_po.kurs_terkunci], [14000, 14000, true], 'barang memakai kurs baru');
});
await cek('CALC-G3', 'Sebelum terkunci: PATCH kurs otomatis memakai buffer pengaturan saat ini; manual → buffer null; DP % tidak ikut berubah', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Ubah kurs', kurs: kursManual(13000) });
  await admin.ok('PATCH', '/pengaturan', { buffer_aud_persen: '5', dp_persen: '30' });
  const a = await admin.ok('PATCH', `/open-po/${po.id}`, { kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-26' } });
  sama([a.kurs.mode, a.kurs.kurs_jastip, a.kurs.buffer_persen, a.dp_persen], ['otomatis', Math.ceil(12673 * 1.05), '5', '50']);
  const b = await admin.ok('PATCH', `/open-po/${po.id}`, { kurs: kursManual(13500) });
  sama([b.kurs.mode, b.kurs.kurs_jastip, b.kurs.buffer_persen, b.kurs.kurs_pasar, b.dp_persen], ['manual', 13500, null, null, '50'], 'manual');
  const c = await admin.req('PATCH', `/open-po/${po.id}`, { body: { dp_persen: '10' } });
  const dpSetelah = (await admin.ok('GET', `/open-po/${po.id}`)).dp_persen;
  harap((c.status === 200 || c.status === 422) && dpSetelah === '50', `PATCH dp_persen -> ${c.status}, dp_persen ${dpSetelah}`);
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  return `PATCH dp_persen -> ${c.status} (diabaikan)`;
});

bagian('H. Perubahan pengaturan tidak memengaruhi PO/baris lama');
await cek('CALC-H1', 'Ubah markup/buffer/DP% di Pengaturan tidak mengubah PO, baris, DP keranjang, dan PATCH baris lama; PO baru memakai nilai baru', async () => {
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  const po = await admin.ok('POST', '/open-po', { nama: 'Snapshot', kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' } });
  sama([po.dp_persen, po.kurs.kurs_jastip, po.kurs.buffer_persen], ['50', 13054, '3']);
  const cust = await admin.ok('POST', '/customer', { nama: 'Snap', no_wa: noWaUnik() });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  const k = await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'A', harga_aud: '24,95', qty: 2, markup_persen: '10' });
  const unitLama = k.barang[0].harga_jual_unit;
  const dpLama = k.ringkasan.dp;
  await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '99', buffer_aud_persen: '50', dp_persen: '10' });
  const k2 = await admin.ok('GET', base);
  sama([k2.barang[0].harga_jual_unit, k2.barang[0].markup_persen, k2.barang[0].kurs_jastip, k2.ringkasan.dp, k2.ringkasan.dp_persen], [unitLama, '10', 13054, dpLama, '50'], 'keranjang lama');
  const k3 = await admin.ok('PATCH', `/baris-pesanan/${k.barang[0].id}`, { qty: 3 });
  sama([k3.barang[0].harga_jual_unit, k3.barang[0].markup_persen, k3.barang[0].subtotal], [unitLama, '10', unitLama * 3], 'PATCH qty tidak memakai markup/kurs baru');
  const k4 = await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'B', harga_aud: '8,50', qty: 3, markup_persen: '15' });
  sama([k4.barang[1].kurs_jastip, k4.barang[1].harga_jual_unit, k4.ringkasan.dp_persen], [13054, 128000, '50'], 'baris baru di PO lama memakai kurs PO');
  const po2 = await admin.ok('GET', `/open-po/${po.id}`);
  sama([po2.kurs.kurs_jastip, po2.kurs.buffer_persen, po2.dp_persen], [13054, '3', '50'], 'PO lama');
  const poBaru = await admin.ok('POST', '/open-po', { nama: 'Snapshot baru', kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' } });
  sama([poBaru.dp_persen, poBaru.kurs.kurs_jastip, poBaru.kurs.buffer_persen], ['10', Math.ceil(12673 * 1.5), '50'], 'PO baru');
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
});

bagian('I. Customer diarsipkan');
await cek('CALC-I1', 'Customer diarsipkan: tetap tampil di PO lama, keranjang lama tetap bisa diubah/dibayar, PO baru → 409, hilang dari daftar/cari/cek-no-wa, hapus → 409, arsip idempoten', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Arsip lama', kurs: kursManual(10000) });
  const noWa = noWaUnik();
  const cust = await admin.ok('POST', '/customer', { nama: 'Arsip Ani', no_wa: noWa });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' });
  const del = await admin.req('DELETE', `/customer/${cust.id}`);
  sama([del.status, del.json?.error?.kode, del.json?.error?.pesan], [409, 'CUSTOMER_PUNYA_PESANAN', 'Arsip Ani sudah punya pesanan, jadi tidak bisa dihapus. Arsipkan customer ini.']);
  const a1 = await admin.ok('POST', `/customer/${cust.id}/arsip`);
  const a2 = await admin.ok('POST', `/customer/${cust.id}/arsip`);
  harap(a1.diarsipkan === true && a2.diarsipkan_pada === a1.diarsipkan_pada, 'arsip tidak idempoten');
  const daftarPo = await admin.ok('GET', `/open-po/${po.id}/customer`);
  sama(daftarPo.map((x) => [x.customer.id, x.customer.diarsipkan]), [[cust.id, true]], 'tetap di PO lama');
  sama((await admin.req('POST', `${base}/baris-pesanan`, { body: { nama_barang: 'y', harga_aud: '1', qty: 1, markup_persen: '0' } })).status, 201, 'barang di keranjang lama');
  sama((await admin.req('POST', `${base}/pembayaran`, { body: { nominal: 1000, tanggal: '2026-10-28' } })).status, 201, 'bayar di keranjang lama');
  const poBaru = await admin.ok('POST', '/open-po', { nama: 'Arsip baru', kurs: kursManual(10000) });
  const p409 = await admin.req('POST', `/open-po/${poBaru.id}/keranjang/${cust.id}/pembayaran`, { body: { nominal: 1000, tanggal: '2026-10-28' } });
  sama([p409.status, p409.json?.error?.kode, p409.json?.error?.pesan], [409, 'CUSTOMER_DIARSIPKAN', 'Customer ini sudah diarsipkan.'], 'bayar di PO baru');
  const cari = await admin.ok('GET', `/customer?q=${encodeURIComponent('Arsip Ani')}`);
  sama(cari.length, 0, 'muncul di pencarian');
  const cekWa = await admin.ok('GET', `/customer/cek-no-wa?no_wa=${noWa}`);
  sama(cekWa.terdaftar, false, 'cek-no-wa menghitung customer arsip');
  const detail = await admin.ok('GET', `/customer/${cust.id}`);
  sama([detail.diarsipkan, detail.punya_pesanan], [true, true], 'detail');
});
await cek('CALC-I2', 'Customer tanpa pesanan bisa dihapus (204); keranjang yang dikosongkan lagi (barang dihapus) membuat punya_pesanan false', async () => {
  const po = await admin.ok('POST', '/open-po', { nama: 'Hapus customer', kurs: kursManual(10000) });
  const cust = await admin.ok('POST', '/customer', { nama: 'Hapus Budi', no_wa: noWaUnik() });
  const k = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' });
  sama((await admin.ok('GET', `/customer/${cust.id}`)).punya_pesanan, true, 'punya_pesanan setelah barang');
  await admin.ok('DELETE', `/baris-pesanan/${k.barang[0].id}`);
  sama((await admin.ok('GET', `/customer/${cust.id}`)).punya_pesanan, false, 'punya_pesanan setelah barang dihapus');
  sama((await admin.ok('GET', `/open-po/${po.id}/customer`)).length, 0, 'masih di daftar PO');
  sama((await admin.req('DELETE', `/customer/${cust.id}`)).status, 204, 'hapus');
  sama((await admin.req('GET', `/customer/${cust.id}`)).status, 404, 'setelah dihapus');
});

bagian('J. Ringkasan PO dan jumlah_per_status');
await cek('CALC-J1', 'Ringkasan PO, daftar customer per PO (urut nama, filter, jumlah_per_status, pagination) dengan 8 keranjang di 5 status', async () => {
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  const po = await admin.ok('POST', '/open-po', { nama: 'Ringkasan PO', kurs: kursManual(1000) });
  const buat = async (nama) => admin.ok('POST', '/customer', { nama, no_wa: noWaUnik() });
  const tambah = (c, qty = 10) => admin.ok('POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty, markup_persen: '0' });
  const bayar = (c, nominal) => admin.ok('POST', `/open-po/${po.id}/keranjang/${c.id}/pembayaran`, { nominal, tanggal: '2026-10-28' });
  const urut = ['Ring Ani', 'Ring Budi', 'Ring Cici', 'Ring Dedi', 'Ring Eka', 'Ring Fani', 'Ring Gina', 'Ring Hadi'];
  const c = {};
  for (const nm of [...urut].reverse()) c[nm] = await buat(nm); // dibuat terbalik, supaya urutan A–Z tidak kebetulan
  await tambah(c['Ring Ani']);
  await tambah(c['Ring Budi']); await bayar(c['Ring Budi'], 2000);
  await tambah(c['Ring Cici']); await bayar(c['Ring Cici'], 5000);
  await tambah(c['Ring Dedi']); await bayar(c['Ring Dedi'], 10000);
  await tambah(c['Ring Eka']); await bayar(c['Ring Eka'], 15000);
  const kf = await tambah(c['Ring Fani']); await admin.ok('POST', `/baris-pesanan/${kf.barang[0].id}/kosong`);
  const kg = await tambah(c['Ring Gina']); await admin.ok('DELETE', `/baris-pesanan/${kg.barang[0].id}`);
  await bayar(c['Ring Hadi'], 3000);
  await admin.ok('POST', `/customer/${c['Ring Ani'].id}/arsip`);
  const p1 = await admin.ok('GET', `/open-po/${po.id}`);
  sama(p1.ringkasan, { jumlah_customer: 7, total_pesanan: 50000, dana_diterima: 35000 }, 'ringkasan PO');
  const r1 = await admin.req('GET', `/open-po/${po.id}/customer`);
  const harapStatus = { 'Ring Ani': 'belum_bayar', 'Ring Budi': 'kurang_dp', 'Ring Cici': 'dp', 'Ring Dedi': 'lunas', 'Ring Eka': 'lebih_bayar', 'Ring Fani': 'lunas', 'Ring Hadi': 'lebih_bayar' };
  sama(r1.json.data.map((x) => [x.customer.nama, x.status]), Object.entries(harapStatus), 'urut A–Z + status');
  sama(r1.json.data.map((x) => [x.total, x.dana_diterima, x.sisa, x.kelebihan_bayar]),
    [[10000, 0, 10000, 0], [10000, 2000, 8000, 0], [10000, 5000, 5000, 0], [10000, 10000, 0, 0], [10000, 15000, 0, 5000], [0, 0, 0, 0], [0, 3000, 0, 3000]], 'angka per customer');
  const jps = { semua: 7, belum_bayar: 1, kurang_dp: 1, dp: 1, lunas: 2, lebih_bayar: 2 };
  sama(r1.json.meta.jumlah_per_status, jps, 'jumlah_per_status');
  sama(r1.json.data[0].customer.diarsipkan, true, 'Ani diarsipkan tetap tampil');
  const r2 = await admin.req('GET', `/open-po/${po.id}/customer?status=lunas`);
  sama([r2.json.meta.total, r2.json.data.map((x) => x.customer.nama), r2.json.meta.jumlah_per_status], [2, ['Ring Dedi', 'Ring Fani'], jps], 'filter lunas');
  const r3 = await admin.req('GET', `/open-po/${po.id}/customer?per_halaman=2&halaman=4`);
  sama([r3.json.meta.total, r3.json.meta.total_halaman, r3.json.data.map((x) => x.customer.nama)], [7, 4, ['Ring Hadi']], 'pagination');
  // Refund Eka 5.000 → lunas; ringkasan dana_diterima turun.
  await admin.ok('POST', `/open-po/${po.id}/keranjang/${c['Ring Eka'].id}/pengembalian-dana`, { nominal: 5000, tanggal: '2026-10-29' });
  const p2 = await admin.ok('GET', `/open-po/${po.id}`);
  sama(p2.ringkasan, { jumlah_customer: 7, total_pesanan: 50000, dana_diterima: 30000 }, 'ringkasan setelah refund');
  sama((await admin.req('GET', `/open-po/${po.id}/customer`)).json.meta.jumlah_per_status, { ...jps, lunas: 3, lebih_bayar: 1 }, 'jumlah_per_status setelah refund');
  // Daftar Open PO: jumlah_per_status dari semua PO; buka dulu lalu selesai, terbaru di atas.
  const semua = async (q = '') => {
    const out = [];
    for (let h = 1; ; h++) {
      const x = await admin.req('GET', `/open-po?per_halaman=100&halaman=${h}${q}`);
      out.push(...x.json.data);
      if (h >= x.json.meta.total_halaman) return { data: out, meta: x.json.meta };
    }
  };
  const d1 = await semua();
  const hitungStatus = (list) => ({ buka: list.filter((p) => p.status === 'buka').length, selesai: list.filter((p) => p.status === 'selesai').length });
  sama(d1.meta.jumlah_per_status, hitungStatus(d1.data), 'jumlah_per_status Open PO');
  await admin.ok('PATCH', `/open-po/${po.id}`, { status: 'selesai' });
  const d2 = await semua('&status=buka');
  sama([d2.meta.jumlah_per_status.selesai, d2.data.some((p) => p.id === po.id)], [d1.meta.jumlah_per_status.selesai + 1, false], 'filter buka');
  const d3 = await semua();
  const idxSelesai = d3.data.findIndex((p) => p.status === 'selesai');
  harap(d3.data.slice(idxSelesai).every((p) => p.status === 'selesai'), 'urutan: buka dulu lalu selesai');
  const buka = d3.data.filter((p) => p.status === 'buka');
  harap(buka.every((p, i) => i === 0 || p.dibuat_pada <= buka[i - 1].dibuat_pada), 'urutan terbaru di atas');
  const listPo = d3.data.find((p) => p.id === po.id);
  sama(listPo.ringkasan, p2.ringkasan, 'ringkasan di daftar == detail');
});

bagian('S. Skenario QA scope (A/B/C) lengkap, kurs otomatis');
await cek('CALC-S1', 'Scope "Contoh hitungan": kurs 12.673 + 3% → 13.054; rincian A/B/C; langkah 1–5 (DP, Lunas, B Kosong → Lebih bayar 384.000, refund → Lunas)', async () => {
  await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
  let kurs = { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '2026-10-25' };
  if (QA_TARGET === 'dev') {
    const k = await admin.ok('GET', '/kurs/aud-idr');
    sama(k.kurs_jastip, 13054, 'pratinjau kurs');
    kurs = { mode: 'otomatis', kurs_pasar: k.kurs_pasar, tanggal_kurs: k.tanggal_kurs };
  }
  const po = await admin.ok('POST', '/open-po', { nama: 'Open PO Australia Nov 2026', kurs });
  sama([po.kurs.kurs_jastip, po.kurs.buffer_persen, po.dp_persen], [13054, '3', '50'], 'PO');
  const cust = await admin.ok('POST', '/customer', { nama: 'Rina', no_wa: '0812-3456-7890' });
  const base = `/open-po/${po.id}/keranjang/${cust.id}`;
  const tabel = [['Barang A', '24,95', '10', 2, 32569730, 35826703, 359000, 718000], ['Barang B', '8,50', '15', 3, 11095900, 12760285, 128000, 384000], ['Barang C', '129,99', '8', 1, 169688946, 183264062, 1833000, 1833000]];
  let k;
  for (const [nama, harga, markup, qty, sebelum, sen, unit, sub] of tabel) {
    const p = pratinjauHarga({ harga, qty: String(qty), markup, kurs: po.kurs.kurs_jastip });
    sama([Number(p.senSebelumMarkup), Number(p.sen), Number(p.hargaJualUnit), Number(p.subtotal)], [sebelum, sen, unit, sub], `pratinjau ${nama}`);
    k = await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: nama, harga_aud: harga, qty, markup_persen: markup });
    const b = k.barang.at(-1);
    sama([b.harga_jual_unit, b.subtotal], [unit, sub], `server ${nama}`);
  }
  sama([k.ringkasan.total, k.ringkasan.dp, k.ringkasan.status], [2935000, 1468000, 'belum_bayar'], 'langkah 1');
  k = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1468000, tanggal: '2026-10-28' });
  sama([k.ringkasan.status, k.ringkasan.sisa], ['dp', 1467000], 'langkah 2');
  k = await admin.ok('POST', `${base}/pembayaran`, { nominal: 1467000, tanggal: '2026-10-30' });
  sama([k.ringkasan.status, k.ringkasan.sisa], ['lunas', 0], 'langkah 3');
  k = await admin.ok('POST', `/baris-pesanan/${k.barang[1].id}/kosong`);
  sama([k.ringkasan.total, k.ringkasan.dana_diterima, k.ringkasan.status, k.ringkasan.kelebihan_bayar, k.ringkasan.dp], [2551000, 2935000, 'lebih_bayar', 384000, 1276000], 'langkah 4');
  k = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-29', catatan: 'transfer BCA 29 Okt' });
  sama([k.ringkasan.status, k.ringkasan.dana_diterima, k.ringkasan.sisa, k.ringkasan.kelebihan_bayar], ['lunas', 2551000, 0, 0], 'langkah 5');
  sama(k.riwayat.map((x) => [x.jenis, x.nominal, x.tanggal]), [['pembayaran', 1467000, '2026-10-30'], ['pengembalian_dana', 384000, '2026-10-29'], ['pembayaran', 1468000, '2026-10-28']], 'urutan riwayat (tanggal terbaru di atas)');
});

await admin.ok('PATCH', '/pengaturan', PENGATURAN_AWAL);
process.exit(selesai('hitung'));
