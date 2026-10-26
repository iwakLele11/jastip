// Konkurensi dasar dari luar: request HTTP paralel ke server (php -S dengan
// PHP_CLI_SERVER_WORKERS=4 di dev-stack, atau PHP-FPM 4 worker di paket Apache).
// Setiap skenario diulang beberapa putaran karena urutan eksekusi acak.
// Hasil: qa/hasil/konkurensi[-…].json
import { Klien, kursManual, noWaUnik } from '../lib/klien.mjs';
import { bagian, cek, harap, selesai } from '../lib/uji.mjs';

const admin = new Klien();
await admin.login();
await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '10', buffer_aud_persen: '3', dp_persen: '50' });
const PUTARAN = Number(process.env.QA_PUTARAN ?? 10);
// Barang Rp10.000 di PO berkurs manual 10.000 (1 AUD × 10.000, markup 0).
const barang = { nama_barang: 'Barang', harga_aud: '1', qty: 1, markup_persen: '0' };
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
/** Jalankan dua request dengan pola urutan bergantian: bersamaan, A lalu B (+jeda), B lalu A (+jeda). */
async function paralel(i, fA, fB) {
  const jeda = 3 + (i % 4) * 4;
  if (i % 3 === 0) return Promise.all([fA(), fB()]);
  if (i % 3 === 1) { const a = fA(); await tidur(jeda); return Promise.all([a, fB()]); }
  const b = fB(); await tidur(jeda); return Promise.all([fA(), b]);
}
const custBaru = (nama) => admin.ok('POST', '/customer', { nama, no_wa: noWaUnik() });
const status = (rs) => rs.map((r) => r.status).join('/');
const ada500 = (rs) => rs.some((r) => r.status >= 500);

bagian('Keranjang dibuat bersamaan');
const po = await admin.ok('POST', '/open-po', { nama: 'QA konkurensi', kurs: kursManual(10000) });
await cek('KON-01', `Dua pembayaran pertama bersamaan untuk customer tanpa keranjang (${PUTARAN} putaran): keduanya 201, satu keranjang, Σ benar`, async () => {
  const salah = [];
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon bayar ${i}`);
    const b = `/open-po/${po.id}/keranjang/${c.id}`;
    const rs = await Promise.all([10000, 20000].map((n) => admin.req('POST', `${b}/pembayaran`, { body: { nominal: n, tanggal: '2026-10-28' } })));
    const k = await admin.ok('GET', b);
    if (status(rs) !== '201/201' || k.ringkasan.total_pembayaran !== 30000 || k.riwayat.length !== 2) salah.push(`putaran ${i}: ${status(rs)} Σ ${k.ringkasan.total_pembayaran} ${rs.map((r) => r.json?.error?.kode ?? '').join(' ')}`);
  }
  const daftar = await admin.ok('GET', `/open-po/${po.id}/customer?per_halaman=100`);
  const dobel = daftar.length !== new Set(daftar.map((x) => x.customer.id)).size;
  harap(!salah.length && !dobel, `${salah.join('\n')}${dobel ? '\ncustomer dobel di daftar PO' : ''}`);
});
await cek('KON-02', `Dua barang pertama bersamaan (membuat keranjang + mengunci kurs) dan barang vs pembayaran pertama bersamaan (${PUTARAN} putaran)`, async () => {
  const salah = [];
  for (let i = 0; i < PUTARAN; i++) {
    const p = await admin.ok('POST', '/open-po', { nama: `Kon barang ${i}`, kurs: kursManual(10000) });
    const c = await custBaru(`Kon barang ${i}`);
    const b = `/open-po/${p.id}/keranjang/${c.id}`;
    const rs = await Promise.all([admin.req('POST', `${b}/baris-pesanan`, { body: barang }), admin.req('POST', `${b}/baris-pesanan`, { body: barang })]);
    const k = await admin.ok('GET', b);
    if (status(rs) !== '201/201' || k.barang.length !== 2 || k.ringkasan.total !== 20000 || !k.open_po.kurs_terkunci) salah.push(`2 barang putaran ${i}: ${status(rs)} barang ${k.barang.length}`);
    const c2 = await custBaru(`Kon campur ${i}`);
    const b2 = `/open-po/${p.id}/keranjang/${c2.id}`;
    const rs2 = await Promise.all([admin.req('POST', `${b2}/baris-pesanan`, { body: barang }), admin.req('POST', `${b2}/pembayaran`, { body: { nominal: 4000, tanggal: '2026-10-28' } })]);
    const k2 = await admin.ok('GET', b2);
    if (status(rs2) !== '201/201' || k2.barang.length !== 1 || k2.ringkasan.total_pembayaran !== 4000 || k2.ringkasan.status !== 'kurang_dp') salah.push(`barang+bayar putaran ${i}: ${status(rs2)} ${k2.ringkasan.status}`);
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('Uang: pengembalian dana dan hapus pembayaran');
await cek('KON-03', `Dua pengembalian dana bersamaan (60.000 + 60.000, kelebihan 100.000; ${PUTARAN} putaran) → tepat satu 201, satu 422`, async () => {
  const salah = [];
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon refund ${i}`);
    const b = `/open-po/${po.id}/keranjang/${c.id}`;
    await admin.ok('POST', `${b}/pembayaran`, { nominal: 100000, tanggal: '2026-10-28' });
    const rs = await Promise.all([1, 2].map(() => admin.req('POST', `${b}/pengembalian-dana`, { body: { nominal: 60000, tanggal: '2026-10-29' } })));
    const k = await admin.ok('GET', b);
    const st = rs.map((r) => r.status).sort().join('/');
    if (st !== '201/422' || k.ringkasan.total_pengembalian !== 60000 || k.ringkasan.kelebihan_bayar !== 40000) salah.push(`putaran ${i}: ${st}, Σ kembali ${k.ringkasan.total_pengembalian}`);
  }
  // 4 refund paralel 30.000 dengan kelebihan 100.000 → tepat 3 sukses.
  const c = await custBaru('Kon refund 4');
  const b = `/open-po/${po.id}/keranjang/${c.id}`;
  await admin.ok('POST', `${b}/pembayaran`, { nominal: 100000, tanggal: '2026-10-28' });
  const rs = await Promise.all([1, 2, 3, 4].map(() => admin.req('POST', `${b}/pengembalian-dana`, { body: { nominal: 30000, tanggal: '2026-10-29' } })));
  const k = await admin.ok('GET', b);
  if (rs.filter((r) => r.status === 201).length !== 3 || k.ringkasan.total_pengembalian !== 90000) salah.push(`4 paralel: ${status(rs)}, Σ ${k.ringkasan.total_pengembalian}`);
  harap(!salah.length, salah.join('\n'));
});
await cek('KON-04', `Hapus pembayaran bersamaan dengan catat pengembalian (${PUTARAN} putaran): dana diterima tidak pernah negatif, tepat satu sukses`, async () => {
  const salah = [];
  const hasil = {};
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon hapus ${i}`);
    const b = `/open-po/${po.id}/keranjang/${c.id}`;
    const k1 = await admin.ok('POST', `${b}/pembayaran`, { nominal: 50000, tanggal: '2026-10-28' });
    const [a, d] = await paralel(i,
      () => admin.req('POST', `${b}/pengembalian-dana`, { body: { nominal: 50000, tanggal: '2026-10-29' } }),
      () => admin.req('DELETE', `/pembayaran/${k1.riwayat[0].id}`));
    const k = await admin.ok('GET', b);
    const key = `refund ${a.status}, hapus ${d.status}`;
    hasil[key] = (hasil[key] ?? 0) + 1;
    if (k.ringkasan.dana_diterima < 0 || k.ringkasan.total_pembayaran < k.ringkasan.total_pengembalian || [a.status, d.status].filter((s) => s < 300).length !== 1) {
      salah.push(`putaran ${i}: ${key}, ${JSON.stringify(k.ringkasan)}`);
    }
  }
  harap(!salah.length, salah.join('\n'));
  return JSON.stringify(hasil);
});
await cek('KON-05', `Dua hapus pembayaran bersamaan saat ada pengembalian (bayar 50.000 + 50.000, refund 60.000; ${PUTARAN} putaran) → maks. satu terhapus`, async () => {
  const salah = [];
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon hapus2 ${i}`);
    const b = `/open-po/${po.id}/keranjang/${c.id}`;
    const p1 = (await admin.ok('POST', `${b}/pembayaran`, { nominal: 50000, tanggal: '2026-10-28' })).riwayat[0].id;
    const p2 = (await admin.ok('POST', `${b}/pembayaran`, { nominal: 50000, tanggal: '2026-10-28' })).riwayat[0].id;
    await admin.ok('POST', `${b}/pengembalian-dana`, { nominal: 60000, tanggal: '2026-10-29' });
    const rs = await Promise.all([p1, p2].map((id) => admin.req('DELETE', `/pembayaran/${id}`)));
    const k = await admin.ok('GET', b);
    if (rs.filter((r) => r.status === 200).length > 1 || k.ringkasan.dana_diterima < 0 || ada500(rs)) salah.push(`putaran ${i}: ${status(rs)} dana ${k.ringkasan.dana_diterima}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('KON-06', `Lepas tanda Kosong bersamaan dengan pengembalian penuh kelebihan (${PUTARAN} putaran): tidak ada 500, dana ≥ 0, refund tidak melebihi kelebihan saat dicatat`, async () => {
  const salah = [];
  const hasil = {};
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon kosong ${i}`);
    const b = `/open-po/${po.id}/keranjang/${c.id}`;
    await admin.ok('POST', `${b}/baris-pesanan`, barang); // Rp10.000
    const k = await admin.ok('POST', `${b}/baris-pesanan`, barang); // Rp10.000
    await admin.ok('POST', `${b}/pembayaran`, { nominal: 20000, tanggal: '2026-10-28' });
    await admin.ok('POST', `/baris-pesanan/${k.barang[1].id}/kosong`); // total 10.000, kelebihan 10.000
    const [lepas, refund] = await paralel(i,
      () => admin.req('DELETE', `/baris-pesanan/${k.barang[1].id}/kosong`),
      () => admin.req('POST', `${b}/pengembalian-dana`, { body: { nominal: 10000, tanggal: '2026-10-29' } }));
    const akhir = await admin.ok('GET', b);
    const key = `lepas ${lepas.status}, refund ${refund.status}`;
    hasil[key] = (hasil[key] ?? 0) + 1;
    // Refund sukses hanya sah kalau dicatat sebelum Kosong dilepas: akhirnya total 20.000, dana 10.000 (kurang_dp/dp).
    const sah = (refund.status === 201 && akhir.ringkasan.dana_diterima === 10000) || (refund.status !== 201 && akhir.ringkasan.dana_diterima === 20000);
    if (ada500([lepas, refund]) || lepas.status !== 200 || !sah) salah.push(`putaran ${i}: ${key} ${JSON.stringify(akhir.ringkasan)}`);
  }
  harap(!salah.length, salah.join('\n'));
  return JSON.stringify(hasil);
});

bagian('Kurs vs barang pertama');
await cek('KON-07', `Ubah kurs (PATCH) bersamaan dengan barang pertama (${PUTARAN * 2} putaran): kurs PO akhir == kurs snapshot barang; tidak pernah PATCH 200 sesudah terkunci`, async () => {
  const salah = [];
  const hasil = {};
  for (let i = 0; i < PUTARAN * 2; i++) {
    const p = await admin.ok('POST', '/open-po', { nama: `Kon kurs ${i}`, kurs: kursManual(10000) });
    const c = await custBaru(`Kon kurs ${i}`);
    const b = `/open-po/${p.id}/keranjang/${c.id}`;
    const [patch, tambah] = await paralel(i,
      () => admin.req('PATCH', `/open-po/${p.id}`, { body: { kurs: kursManual(20000) } }),
      () => admin.req('POST', `${b}/baris-pesanan`, { body: barang }));
    const akhir = await admin.ok('GET', `/open-po/${p.id}`);
    const k = await admin.ok('GET', b);
    const kursBarang = k.barang[0]?.kurs_jastip;
    const key = `patch ${patch.status} → barang kurs ${kursBarang}`;
    hasil[key] = (hasil[key] ?? 0) + 1;
    const konsisten = tambah.status === 201 && akhir.kurs_terkunci && akhir.kurs.kurs_jastip === kursBarang
      && ((patch.status === 200 && kursBarang === 20000 && k.barang[0].harga_jual_unit === 20000)
        || (patch.status === 409 && kursBarang === 10000 && k.barang[0].harga_jual_unit === 10000 && patch.json?.error?.kode === 'KURS_TERKUNCI'));
    if (!konsisten) salah.push(`putaran ${i}: patch ${patch.status}, barang ${tambah.status}, kurs PO ${akhir.kurs.kurs_jastip}, kurs barang ${kursBarang}, harga ${k.barang[0]?.harga_jual_unit}`);
  }
  harap(!salah.length, salah.join('\n'));
  return JSON.stringify(hasil);
});
await cek('KON-08', `Dua PATCH kurs + dua barang pertama bersamaan (${PUTARAN} putaran): semua barang memakai kurs PO akhir`, async () => {
  const salah = [];
  for (let i = 0; i < PUTARAN; i++) {
    const p = await admin.ok('POST', '/open-po', { nama: `Kon kurs2 ${i}`, kurs: kursManual(10000) });
    const c1 = await custBaru(`Kon kurs2a ${i}`);
    const c2 = await custBaru(`Kon kurs2b ${i}`);
    const rs = await Promise.all([
      admin.req('PATCH', `/open-po/${p.id}`, { body: { kurs: kursManual(20000) } }),
      admin.req('POST', `/open-po/${p.id}/keranjang/${c1.id}/baris-pesanan`, { body: barang }),
      admin.req('PATCH', `/open-po/${p.id}`, { body: { kurs: kursManual(30000) } }),
      admin.req('POST', `/open-po/${p.id}/keranjang/${c2.id}/baris-pesanan`, { body: barang }),
    ]);
    const akhir = await admin.ok('GET', `/open-po/${p.id}`);
    const k1 = await admin.ok('GET', `/open-po/${p.id}/keranjang/${c1.id}`);
    const k2 = await admin.ok('GET', `/open-po/${p.id}/keranjang/${c2.id}`);
    const kurs = [k1.barang[0]?.kurs_jastip, k2.barang[0]?.kurs_jastip];
    if (ada500(rs) || kurs.some((x) => x !== akhir.kurs.kurs_jastip)) salah.push(`putaran ${i}: ${status(rs)} kurs PO ${akhir.kurs.kurs_jastip}, barang ${kurs}`);
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('Customer vs keranjang');
await cek('KON-09', `Hapus customer (tanpa pesanan) bersamaan dengan barang/pembayaran pertama (${PUTARAN} putaran): tidak ada 500, tidak ada keranjang yatim`, async () => {
  const salah = [];
  const hasil = {};
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon hapus cust ${i}`);
    const b = `/open-po/${po.id}/keranjang/${c.id}`;
    const aksi = () => (i % 2 === 0 ? admin.req('POST', `${b}/baris-pesanan`, { body: barang }) : admin.req('POST', `${b}/pembayaran`, { body: { nominal: 1000, tanggal: '2026-10-28' } }));
    const [hapus, tambah] = await paralel(i, () => admin.req('DELETE', `/customer/${c.id}`), aksi);
    const g = await admin.req('GET', `/customer/${c.id}`);
    const key = `hapus ${hapus.status}, ${i % 2 === 0 ? 'barang' : 'bayar'} ${tambah.status}`;
    hasil[key] = (hasil[key] ?? 0) + 1;
    const sah = (hapus.status === 204 && tambah.status === 404 && g.status === 404) || (hapus.status === 409 && tambah.status === 201 && g.status === 200 && g.json.data.punya_pesanan);
    if (!sah) salah.push(`putaran ${i}: ${key}, GET customer ${g.status} ${tambah.teks.slice(0, 100)}`);
  }
  harap(!salah.length, salah.join('\n'));
  return JSON.stringify(hasil);
});
await cek('KON-10', `Arsipkan customer bersamaan dengan barang pertama di PO baru (${PUTARAN} putaran): tidak ada 500; barang ditolak 409 atau tersimpan sebelum arsip`, async () => {
  const salah = [];
  const hasil = {};
  for (let i = 0; i < PUTARAN; i++) {
    const c = await custBaru(`Kon arsip ${i}`);
    const p = await admin.ok('POST', '/open-po', { nama: `Kon arsip ${i}`, kurs: kursManual(10000) });
    const [arsip, tambah] = await paralel(i, () => admin.req('POST', `/customer/${c.id}/arsip`), () => admin.req('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { body: barang }));
    const akhir = await admin.ok('GET', `/open-po/${p.id}`);
    const key = `arsip ${arsip.status}, barang ${tambah.status}`;
    hasil[key] = (hasil[key] ?? 0) + 1;
    const sah = arsip.status === 200 && ((tambah.status === 201 && akhir.kurs_terkunci) || (tambah.status === 409 && tambah.json?.error?.kode === 'CUSTOMER_DIARSIPKAN' && !akhir.kurs_terkunci));
    if (!sah) salah.push(`putaran ${i}: ${key}, kurs terkunci ${akhir.kurs_terkunci}`);
  }
  harap(!salah.length, salah.join('\n'));
  return JSON.stringify(hasil);
});

process.exit(selesai('konkurensi'));
