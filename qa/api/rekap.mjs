// Uji teks rekap WA (GET /open-po/{id}/keranjang/{customer_id}/rekap) terhadap ui-spec §9.6.
// Contoh per status diambil langsung dari blok kode di docs/design/ui-spec.md, jadi uji ini
// mengikuti dokumen sumber kebenaran. Hasil: qa/hasil/rekap[-…].json
import { readFileSync } from 'node:fs';
import { Klien, kursManual, noWaUnik } from '../lib/klien.mjs';
import { bagian, cek, harap, sama, selesai } from '../lib/uji.mjs';

const admin = new Klien();
await admin.login();
await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '10', buffer_aud_persen: '3', dp_persen: '50' });

// ---- Contoh dari ui-spec §9.6 ----
const spec = readFileSync(new URL('../../docs/design/ui-spec.md', import.meta.url), 'utf8');
const s96 = spec.slice(spec.indexOf('### 9.6 Teks rekap WA'), spec.indexOf('## 10. Format angka'));
const blok = [...s96.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
// blok[0] = struktur; lalu Belum bayar, Kurang DP, DP, Lunas, Lebih bayar, Lunas setelah refund.
if (blok.length !== 7) throw new Error(`ui-spec §9.6: harap 7 blok kode, ada ${blok.length}`);
const [, belum, kurangBawah, dpBawah, lunasBawah, lebih, lunasRefundBawah] = blok;
const kepala = (contoh) => contoh.slice(0, contoh.indexOf('*Total:'));
const CONTOH = {
  belum_bayar: belum,
  kurang_dp: kepala(belum) + kurangBawah,
  dp: kepala(belum) + dpBawah,
  lunas: kepala(belum) + lunasBawah,
  lebih_bayar: lebih,
  lunas_refund: kepala(lebih) + lunasRefundBawah,
};

const rupiah = (n) => `Rp${Number(n).toLocaleString('id-ID')}`;
const rekap = async (po, c) => (await admin.ok('GET', `/open-po/${po}/keranjang/${c}/rekap`)).teks;

/** Aturan format umum ui-spec §9.6 untuk satu teks rekap. Mengembalikan daftar pelanggaran. */
function aturanUmum(teks) {
  const salah = [];
  const baris = teks.split('\n');
  if (/\r/.test(teks)) salah.push('memuat \\r');
  baris.forEach((b, i) => {
    if (/[ \t]$/.test(b)) salah.push(`baris ${i + 1} berakhir spasi: ${JSON.stringify(b)}`);
    if (((b.match(/\*/g) ?? []).length) % 2 !== 0) salah.push(`baris ${i + 1} jumlah * ganjil: ${JSON.stringify(b)}`);
  });
  // Baris tebal yang diwajibkan format: judul, Total, baris penentu. Isi di antara * tidak boleh
  // memuat * lagi dan tidak boleh diawali/diakhiri spasi (aturan WA: * menempel ke teks).
  const tebal = baris.filter((b) => /^\*(REKAP JASTIP - |Total: |Mohon transfer DP: |Sisa pelunasan: |Kelebihan bayar \(akan dikembalikan\): )/.test(b));
  if (tebal.length !== 3) salah.push(`harap 3 baris tebal, ada ${tebal.length}`);
  for (const b of tebal) if (!/^\*[^*\s](?:[^*]*[^*\s])?\*$/.test(b)) salah.push(`baris tebal rusak (WA tidak menebalkan utuh): ${JSON.stringify(b)}`);
  if (/AUD|[Kk]urs|[Mm]arkup/.test(teks)) salah.push('memuat AUD/kurs/markup');
  return salah;
}

bagian('A. Contoh per status persis ui-spec §9.6 (skenario QA scope)');
const po = await admin.ok('POST', '/open-po', { nama: 'Open PO Australia Nov 2026', kurs: kursManual(13054) });
const rina = await admin.ok('POST', '/customer', { nama: 'Rina', no_wa: '081234567890' });
const base = `/open-po/${po.id}/keranjang/${rina.id}`;
for (const b of [['Barang A', '24,95', 2, '10'], ['Barang B', '8,50', 3, '15'], ['Barang C', '129,99', 1, '8']]) {
  await admin.ok('POST', `${base}/baris-pesanan`, { nama_barang: b[0], harga_aud: b[1], qty: b[2], markup_persen: b[3] });
}
const langkah = [];
async function cekLangkah(id, status, judul, aksi) {
  await cek(id, judul, async () => {
    await aksi();
    const t = await rekap(po.id, rina.id);
    const k = await admin.ok('GET', base);
    langkah.push([status, t, k]);
    const salah = aturanUmum(t);
    if (t !== CONTOH[status]) salah.unshift(`teks beda dari ui-spec:\n--- harap\n${CONTOH[status]}\n--- aktual\n${t}`);
    harap(!salah.length, salah.join('\n'));
  });
}
let idBayar = [];
await cekLangkah('RKP-01', 'belum_bayar', 'Belum bayar: teks lengkap = contoh ui-spec', async () => {});
await cekLangkah('RKP-02', 'kurang_dp', 'Kurang DP (bayar Rp500.000) = contoh ui-spec', async () => {
  idBayar.push((await admin.ok('POST', `${base}/pembayaran`, { nominal: 500000, tanggal: '2026-10-27' })).riwayat[0].id);
});
await cekLangkah('RKP-03', 'dp', 'DP (QA langkah 2, total bayar Rp1.468.000) = contoh ui-spec', async () => {
  idBayar.push((await admin.ok('POST', `${base}/pembayaran`, { nominal: 968000, tanggal: '2026-10-28' })).riwayat[0].id);
});
await cekLangkah('RKP-04', 'lunas', 'Lunas tanpa pengembalian (QA langkah 3) = contoh ui-spec', async () => {
  await admin.ok('POST', `${base}/pembayaran`, { nominal: 1467000, tanggal: '2026-10-30' });
});
let idBarangB;
await cekLangkah('RKP-05', 'lebih_bayar', 'Lebih bayar (QA langkah 4, Barang B Kosong) = contoh ui-spec', async () => {
  const k = await admin.ok('GET', base);
  idBarangB = k.barang[1].id;
  await admin.ok('POST', `/baris-pesanan/${idBarangB}/kosong`);
});
let idRefund;
await cekLangkah('RKP-06', 'lunas_refund', 'Lunas setelah pengembalian dana (QA langkah 5) = contoh ui-spec', async () => {
  const k = await admin.ok('POST', `${base}/pengembalian-dana`, { nominal: 384000, tanggal: '2026-10-31', catatan: 'transfer BCA' });
  idRefund = k.riwayat.find((x) => x.jenis === 'pengembalian_dana').id;
});
await cek('RKP-07', 'Angka rekap identik dengan ringkasan keranjang di setiap langkah (Total, DP, Sudah dibayar, Dikembalikan, baris penentu, barang)', () => {
  const salah = [];
  for (const [status, t, k] of langkah) {
    const rk = k.ringkasan;
    const ada = (s) => t.split('\n').includes(s);
    const harus = [`*Total: ${rupiah(rk.total)}*`, `DP ${rk.dp_persen.replace('.', ',')}%: ${rupiah(rk.dp)}`, `Status: ${{ belum_bayar: 'BELUM BAYAR', kurang_dp: 'KURANG DP', dp: 'DP DITERIMA ✅', lunas: 'LUNAS ✅', lebih_bayar: 'LEBIH BAYAR' }[rk.status]}`];
    if (rk.total_pembayaran > 0 || rk.total_pengembalian > 0) harus.push(`Sudah dibayar: ${rupiah(rk.total_pembayaran)}`);
    if (rk.total_pengembalian > 0) harus.push(`Dikembalikan: ${rupiah(rk.total_pengembalian)}`);
    harus.push({ belum_bayar: `*Mohon transfer DP: ${rupiah(rk.dp)}*`, lebih_bayar: `*Kelebihan bayar (akan dikembalikan): ${rupiah(rk.kelebihan_bayar)}*` }[rk.status] ?? `*Sisa pelunasan: ${rupiah(rk.sisa)}*`);
    k.barang.forEach((b, i) => {
      if (b.kosong) harus.push(`${i + 1}. ${b.nama_barang} (Kosong, tidak ditagih)`);
      else harus.push(`${i + 1}. ${b.nama_barang}`, `   ${b.qty} x ${rupiah(b.harga_jual_unit)} = ${rupiah(b.subtotal)}`);
    });
    for (const h of harus) if (!ada(h)) salah.push(`${status}: baris "${h}" tidak ada`);
    if (rk.total_pembayaran === 0 && rk.total_pengembalian === 0 && /Sudah dibayar/.test(t)) salah.push(`${status}: Sudah dibayar muncul tanpa pembayaran`);
    if (rk.total_pengembalian === 0 && /Dikembalikan/.test(t)) salah.push(`${status}: Dikembalikan muncul tanpa refund`);
  }
  harap(!salah.length, salah.join('\n'));
  return `${langkah.length} langkah`;
});
await cek('RKP-08', 'Hapus refund dan lepas Kosong mengubah rekap kembali (Lebih bayar → Lunas tanpa baris Dikembalikan); hapus pembayaran → Kurang DP', async () => {
  await admin.ok('DELETE', `/pengembalian-dana/${idRefund}`);
  sama(await rekap(po.id, rina.id), CONTOH.lebih_bayar, 'setelah refund dihapus');
  await admin.ok('DELETE', `/baris-pesanan/${idBarangB}/kosong`);
  sama(await rekap(po.id, rina.id), CONTOH.lunas, 'setelah Kosong dilepas');
  const k = await admin.ok('GET', base);
  for (const x of k.riwayat.filter((r) => r.jenis === 'pembayaran' && !idBayar.includes(r.id))) await admin.ok('DELETE', `/pembayaran/${x.id}`);
  await admin.ok('DELETE', `/pembayaran/${idBayar[1]}`);
  sama(await rekap(po.id, rina.id), CONTOH.kurang_dp, 'kembali ke Kurang DP');
});

bagian('B. Variasi format');
await cek('RKP-09', 'DP % desimal memakai koma ("DP 37,5%") dan DP 0% / 100%', async () => {
  const hasil = [];
  for (const [dp, label] of [['37.5', 'DP 37,5%: Rp1.101.000'], ['12,34', 'DP 12,34%: Rp363.000'], ['0', 'DP 0%: Rp0'], ['100', 'DP 100%: Rp2.935.000']]) {
    await admin.ok('PATCH', '/pengaturan', { dp_persen: dp });
    const p = await admin.ok('POST', '/open-po', { nama: `DP ${dp}`, kurs: kursManual(13054) });
    for (const b of [['Barang A', '24,95', 2, '10'], ['Barang B', '8,50', 3, '15'], ['Barang C', '129,99', 1, '8']]) {
      await admin.ok('POST', `/open-po/${p.id}/keranjang/${rina.id}/baris-pesanan`, { nama_barang: b[0], harga_aud: b[1], qty: b[2], markup_persen: b[3] });
    }
    const t = await rekap(p.id, rina.id);
    harap(t.split('\n').includes(label), `DP ${dp}: ${t.split('\n').find((l) => l.startsWith('DP '))}`);
    hasil.push(t.split('\n').filter((l) => /^DP |Mohon/.test(l)).join(' / '));
  }
  await admin.ok('PATCH', '/pengaturan', { dp_persen: '50' });
  return hasil.join(' | ');
});
await cek('RKP-10', 'Keranjang tanpa barang (hanya pembayaran) langsung ke *Total: Rp0*; keranjang belum ada → rekap angka nol', async () => {
  const p = await admin.ok('POST', '/open-po', { nama: 'Tanpa barang', kurs: kursManual(13054) });
  const c = await admin.ok('POST', '/customer', { nama: 'Tono', no_wa: '0812-1111-2222' });
  sama(await rekap(p.id, c.id), '*REKAP JASTIP - Tanpa barang*\nCustomer: Tono (081211112222)\n\n*Total: Rp0*\nDP 50%: Rp0\n*Sisa pelunasan: Rp0*\nStatus: LUNAS ✅', 'belum ada keranjang');
  await admin.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/pembayaran`, { nominal: 50000, tanggal: '2026-10-28' });
  sama(await rekap(p.id, c.id), '*REKAP JASTIP - Tanpa barang*\nCustomer: Tono (081211112222)\n\n*Total: Rp0*\nDP 50%: Rp0\nSudah dibayar: Rp50.000\n*Kelebihan bayar (akan dikembalikan): Rp50.000*\nStatus: LEBIH BAYAR', 'hanya pembayaran');
  const r404a = await admin.req('GET', `/open-po/999999/keranjang/${c.id}/rekap`);
  const r404b = await admin.req('GET', `/open-po/${p.id}/keranjang/999999/rekap`);
  sama([r404a.status, r404a.json?.error?.pesan, r404b.status, r404b.json?.error?.pesan], [404, 'Open PO tidak ditemukan.', 404, 'Customer tidak ditemukan.']);
});
await cek('RKP-11', 'Format rupiah angka besar (Rp1.000.000.000.000) dan semua barang Kosong', async () => {
  const p = await admin.ok('POST', '/open-po', { nama: 'Besar', kurs: kursManual(1000000) });
  const c = await admin.ok('POST', '/customer', { nama: 'Besar', no_wa: noWaUnik() });
  const b = `/open-po/${p.id}/keranjang/${c.id}`;
  const k = await admin.ok('POST', `${b}/baris-pesanan`, { nama_barang: 'Mahal', harga_aud: '100000', qty: 999, markup_persen: '100' });
  await admin.ok('POST', `${b}/pembayaran`, { nominal: 1000000000000, tanggal: '2026-10-28' });
  const t = await rekap(p.id, c.id);
  harap(t.includes('   999 x Rp200.000.000.000 = Rp199.800.000.000.000') && t.includes('Sudah dibayar: Rp1.000.000.000.000')
    && t.includes('*Sisa pelunasan: Rp198.800.000.000.000*') && t.includes('Status: KURANG DP'), t);
  await admin.ok('POST', `/baris-pesanan/${k.barang[0].id}/kosong`);
  const t2 = await rekap(p.id, c.id);
  harap(t2.includes('1. Mahal (Kosong, tidak ditagih)\n\n*Total: Rp0*') && t2.includes('*Kelebihan bayar (akan dikembalikan): Rp1.000.000.000.000*'), t2);
  harap(!aturanUmum(t).length && !aturanUmum(t2).length, [...aturanUmum(t), ...aturanUmum(t2)].join('\n'));
});
await cek('RKP-12', 'Customer diarsipkan: rekap PO lama tetap bisa dibuat', async () => {
  const p = await admin.ok('POST', '/open-po', { nama: 'Arsip rekap', kurs: kursManual(10000) });
  const c = await admin.ok('POST', '/customer', { nama: 'Arsip', no_wa: noWaUnik() });
  await admin.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' });
  await admin.ok('POST', `/customer/${c.id}/arsip`);
  harap((await rekap(p.id, c.id)).includes('*Total: Rp10.000*'), 'rekap customer arsip');
});

bagian('C. Nama dengan karakter khusus (judul tebal WA, baris baru, panjang)');
await cek('RKP-13', 'Baris baru, tab, CR, U+2028, spasi ganda di nama PO/customer/barang diringkas menjadi satu spasi; aturan format tetap berlaku', async () => {
  const p = await admin.ok('POST', '/open-po', { nama: 'PO\nBaris\t2\r\n  Nov\u20282026', kurs: kursManual(10000) });
  const c = await admin.ok('POST', '/customer', { nama: 'Rina\nSari  \tDewi', no_wa: noWaUnik() });
  await admin.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'Tas\n\nKulit\u2029Asli', harga_aud: '1', qty: 1, markup_persen: '0' });
  const t = await rekap(p.id, c.id);
  const b = t.split('\n');
  sama([b[0], b[1].replace(/ \(.*\)$/, ''), b[3]], ['*REKAP JASTIP - PO Baris 2 Nov 2026*', 'Customer: Rina Sari Dewi', '1. Tas Kulit Asli']);
  const s = aturanUmum(t);
  harap(!s.length, s.join('\n'));
});
await cek('RKP-14', 'Nama sangat panjang (PO 100, customer 100, barang 150 karakter, emoji) tetap satu baris per elemen dan lolos aturan format', async () => {
  // Dipotong per code point (bukan UTF-16), supaya tidak ada surrogate tunggal.
  const cp = (s, n) => [...s].slice(0, n).join('').trim();
  const namaPo = cp('Open PO 🇦🇺 '.repeat(12), 100);
  const namaCust = cp('👩‍👩‍👧'.repeat(30), 100);
  const namaBarang = cp('Barang 😀 '.repeat(20), 150);
  sama([[...namaPo].length, [...namaCust].length, [...namaBarang].length], [100, 100, 150], 'panjang uji');
  const p = await admin.ok('POST', '/open-po', { nama: namaPo, kurs: kursManual(10000) });
  const c = await admin.ok('POST', '/customer', { nama: namaCust, no_wa: noWaUnik() });
  await admin.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: namaBarang, harga_aud: '1', qty: 1, markup_persen: '0' });
  const t = await rekap(p.id, c.id);
  const s = aturanUmum(t);
  harap(t.split('\n').length === 10 && !s.length, `${t}\n${s.join('\n')}`);
});
// Karakter format WA: * (tebal), _ (miring), ~ (coret), ``` (monospace), ` (kode).
const VARIASI = [
  ['tanda * di tengah', 'PO *Spesial* Nov'],
  ['tanda * di akhir', 'PO Nov 2026*'],
  ['tanda * di awal', '*PO Nov 2026'],
  ['satu tanda *', 'PO 5* Nov'],
  ['garis bawah', 'PO _Nov_ 2026'],
  ['tilde', 'PO ~Nov~ 2026'],
  ['backtick', 'PO `Nov` ```2026```'],
  ['emoji', 'PO 🇦🇺 Nov 2026 ✈️'],
  ['NBSP saja (lihat SEC-M4)', '\u00A0'],
];
await cek('RKP-15', 'Judul tebal *REKAP JASTIP - {nama PO}* tetap utuh untuk nama PO dengan *, _, ~, `, emoji', async () => {
  const c = await admin.ok('POST', '/customer', { nama: 'Wati', no_wa: noWaUnik() });
  const rusak = [];
  const ok = [];
  for (const [label, nama] of VARIASI) {
    const p = await admin.ok('POST', '/open-po', { nama, kurs: kursManual(10000) });
    await admin.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' });
    const judul = (await rekap(p.id, c.id)).split('\n')[0];
    if (!/^\*[^*\s](?:[^*]*[^*\s])?\*$/.test(judul)) rusak.push(`${label}: ${JSON.stringify(judul)}`);
    else ok.push(label);
  }
  harap(!rusak.length, `Judul tebal rusak (WA menutup/membuka tebal di tempat yang salah atau tidak menebalkan):\n${rusak.join('\n')}\nUtuh: ${ok.join(', ')}`);
});
await cek('RKP-16', 'Nama customer/barang dengan *…*, _…_, ~…~ tidak menimbulkan format WA yang tidak diminta di baris Customer/barang', async () => {
  const p = await admin.ok('POST', '/open-po', { nama: 'Format nama', kurs: kursManual(10000) });
  const c = await admin.ok('POST', '/customer', { nama: 'Rina *VIP*', no_wa: noWaUnik() });
  for (const nm of ['Tas *Promo*', 'Sepatu _Nike_', 'Jaket ~Diskon~', 'Kaos ```XL```']) {
    await admin.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: nm, harga_aud: '1', qty: 1, markup_persen: '0' });
  }
  const t = await rekap(p.id, c.id);
  const baris = t.split('\n').filter((b) => /^(Customer: |\d+\. )/.test(b));
  // Pasangan penanda WA yang menempel ke teks: *x*, _x_, ~x~, ```x```
  const berformat = baris.filter((b) => /(^|[\s(])([*_~])[^\s*_~](?:[^\n]*?[^\s])?\2(?=$|[\s).,!?:;])|```[^`]+```/.test(b));
  harap(!berformat.length, `Baris yang akan berformat di WA karena isi nama:\n${berformat.join('\n')}`);
});

await admin.ok('PATCH', '/pengaturan', { default_markup_persen: '10', buffer_aud_persen: '3', dp_persen: '50' });
process.exit(selesai('rekap'));
