// Tulis bukti reproduksi bug bagian A ke docs/qa/bukti/*.txt (request + respons apa adanya).
// Pakai: .tools/dev-stack.sh node qa/tools/bukti.mjs
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { Klien, buatAdmin, kursManual, noWaUnik, resetPercobaanLogin } from '../lib/klien.mjs';
import { nextAman } from '../../frontend/src/js/lib/rute.js';

const DIR = new URL('../../docs/qa/bukti/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const tulis = (f, isi) => { writeFileSync(`${DIR}${f}`, `${isi.trimEnd()}\n`); console.log(`  ${f}`); };
const kepala = (judul) => `# ${judul}\n# Dibuat qa/tools/bukti.mjs, ${new Date().toISOString()}, target ${process.env.APP_URL} (dev-stack)\n\n`;
const a = new Klien();
await a.login();

// QA-A-01 open redirect
{
  let t = kepala('QA-A-01: nextAman() (frontend/src/js/lib/rute.js) mengembalikan URL relatif-protokol');
  for (const p of ['/..//evil.example/index.html', '/.//evil.example/index.html', '/%2e%2e//evil.example/po.html', '//evil.example/index.html (kontrol, ditolak)']) {
    const v = p.split(' ')[0];
    const r = nextAman(v, 'https://jastipku.rf.gd');
    t += `nextAman(${JSON.stringify(v)}, "https://jastipku.rf.gd") = ${JSON.stringify(r)}${r ? `  → location.replace() membuka ${new URL(r, 'https://jastipku.rf.gd').href}` : ''}\n`;
  }
  const red = JSON.parse(readFileSync(new URL('../hasil/redirect.json', import.meta.url), 'utf8')).hasil.find((h) => h.id === 'RED-04');
  t += `\nChromium (qa/frontend/next-redirect.mjs, RED-04): ${red?.catatan ?? '-'}\nScreenshot: docs/qa/bukti/open-redirect-next.png\n`;
  tulis('QA-A-01-open-redirect.txt', t);
}

// QA-A-02 throttle paralel
{
  let t = kepala('QA-A-02: login gagal paralel melewati batas 5 / nama pengguna dan 20 / IP');
  resetPercobaanLogin();
  buatAdmin('qabukti', randomBytes(15).toString('base64url'));
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => new Klien().login('qabukti', `tebakan-${i}-xxxxxx`)));
  t += `30 POST /api/v1/auth/login bersamaan untuk "qabukti" (sandi salah):\n  status: ${rs.map((r) => r.status).join(' ')}\n`;
  t += `  diperiksa (401): ${rs.filter((r) => r.status === 401).length}, ditolak (429): ${rs.filter((r) => r.status === 429).length}  (kontrak §4: maks. 5)\n\n`;
  resetPercobaanLogin();
  const ip = await Promise.all(Array.from({ length: 40 }, (_, i) => new Klien().login(`qa-bukti-ip-${i}`, 'salah-salah-salah')));
  t += `40 login gagal bersamaan dengan 40 nama berbeda dari 127.0.0.1:\n  diperiksa (401): ${ip.filter((r) => r.status === 401).length}, ditolak (429): ${ip.filter((r) => r.status === 429).length}  (kontrak §4: maks. 20)\n\n`;
  resetPercobaanLogin();
  for (const f of ['keamanan.json', 'keamanan-paket-10.11.json', 'keamanan-paket-11.4.json']) {
    const p = new URL(`../hasil/${f}`, import.meta.url);
    if (existsSync(p)) t += `${f} SEC-D9: ${JSON.parse(readFileSync(p, 'utf8')).hasil.find((h) => h.id === 'SEC-D9')?.catatan}\n`;
  }
  tulis('QA-A-02-login-paralel.txt', t);
}

// QA-A-03 rekap WA: tanda * di nama PO
{
  let t = kepala('QA-A-03: tanda * di nama Open PO merusak judul tebal rekap WA; nama customer/barang memicu format WA');
  const c = await a.ok('POST', '/customer', { nama: 'Rina *VIP*', no_wa: '081234567890' });
  for (const nama of ['PO *Spesial* Nov', 'PO Nov 2026*', '*PO Nov 2026', 'PO 5* Nov']) {
    const p = await a.ok('POST', '/open-po', { nama, kurs: kursManual(10000) });
    await a.ok('POST', `/open-po/${p.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'Tas *Promo*', harga_aud: '1', qty: 1, markup_persen: '0' });
    const r = await a.ok('GET', `/open-po/${p.id}/keranjang/${c.id}/rekap`);
    t += `POST /api/v1/open-po {"nama": ${JSON.stringify(nama)}} → GET …/rekap:\n${r.teks.split('\n').map((l) => `  | ${l}`).join('\n')}\n\n`;
  }
  tulis('QA-A-03-rekap-tanda-bintang.txt', t);
}

// QA-A-04 nama tak terlihat
{
  let t = kepala('QA-A-04: nama wajib yang hanya berisi spasi Unicode / karakter tak terlihat diterima server');
  for (const [label, v] of [['NBSP U+00A0', '\u00A0'], ['spasi ideografis U+3000', '\u3000'], ['zero-width space U+200B', '\u200B']]) {
    const r = await a.req('POST', '/customer', { body: { nama: v, no_wa: noWaUnik() } });
    t += `POST /api/v1/customer {"nama": "${label}"} → ${r.status} ${r.teks.slice(0, 110)}…\n`;
    const p = await a.req('POST', '/open-po', { body: { nama: v, kurs: kursManual(10000) } });
    t += `POST /api/v1/open-po {"nama": "${label}"} → ${p.status} nama=${JSON.stringify(p.json?.data?.nama)}\n`;
    if (p.status === 201) {
      await a.ok('POST', `/open-po/${p.json.data.id}/keranjang/${r.json.data.id}/baris-pesanan`, { nama_barang: v, harga_aud: '1', qty: 1, markup_persen: '0' });
      const rk = await a.ok('GET', `/open-po/${p.json.data.id}/keranjang/${r.json.data.id}/rekap`);
      t += `  rekap: ${JSON.stringify(rk.teks.split('\n').slice(0, 4))}\n`;
    }
    const kosong = await a.req('POST', '/customer', { body: { nama: '   ', no_wa: noWaUnik() } });
    t += `  kontrol "   " (spasi ASCII) → ${kosong.status} ${kosong.json?.error?.field?.nama}\n\n`;
  }
  tulis('QA-A-04-nama-tak-terlihat.txt', t);
}

// QA-A-05 body []
{
  let t = kepala('QA-A-05: body JSON "[]" diperlakukan sebagai objek kosong');
  for (const raw of ['[]', '[1,2]', '"x"']) {
    const r = await a.req('POST', '/customer', { raw, headers: { 'Content-Type': 'application/json' } });
    t += `POST /api/v1/customer body ${raw} → ${r.status} ${r.teks}\n`;
  }
  tulis('QA-A-05-body-array-kosong.txt', t);
}
