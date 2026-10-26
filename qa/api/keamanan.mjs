// Uji keamanan API dan pengiriman form (target: aplikasi lokal di sandbox, APP_URL).
// Dijalankan lewat qa/run.sh (dev-stack, QA_TARGET=dev) atau qa/paket/uji-paket.sh
// (Apache + paket htdocs, QA_TARGET=paket). Hasil: qa/hasil/keamanan[-paket-…].json
//
// Isolasi: tabel percobaan_login dikosongkan (lewat DB lokal) sebelum setiap uji yang
// membutuhkan login baru, karena batas 20 login gagal / IP / 15 menit berlaku untuk semua uji
// dari 127.0.0.1. Itu bukan perilaku aplikasi yang diuji, hanya pembersihan data uji.
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  ADMIN_PASSWORD, ADMIN_USER, APP_URL, KURS_OTOMATIS, Klien, ORIGIN, PHP, QA_TARGET, buatAdmin, kursManual, noWaUnik,
  resetIp, resetPercobaanLogin, sql, tidur,
} from '../lib/klien.mjs';
import { bagian, cek, harap, sama, selesai } from '../lib/uji.mjs';

resetPercobaanLogin();
const admin = new Klien();
await admin.login();

// Data dasar untuk endpoint ber-ID.
const po = await admin.ok('POST', '/open-po', { nama: 'QA keamanan', kurs: KURS_OTOMATIS });
const cust = await admin.ok('POST', '/customer', { nama: 'QA Keamanan', no_wa: noWaUnik() });
const kr = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'Barang X', harga_aud: '10', qty: 1, markup_persen: '10' });
const idBaris = kr.barang[0].id;
const krBayar = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/pembayaran`, { nominal: 1000, tanggal: '2026-10-28' });
const idBayar = krBayar.riwayat[0].id;
const BASE = `/open-po/${po.id}/keranjang/${cust.id}`;

// Semua nilai rahasia / data pribadi yang dipakai uji ini, untuk cek isi log aplikasi (SEC-J3).
const rahasia = { kata_sandi: [ADMIN_PASSWORD], token: [], customer: ['QA Keamanan'] };

const ENDPOINT = [
  ['GET', '/auth/sesi'], ['POST', '/auth/logout'],
  ['GET', '/pengaturan'], ['PATCH', '/pengaturan'],
  ['GET', '/kurs/aud-idr'],
  ['GET', '/open-po'], ['POST', '/open-po'], ['GET', `/open-po/${po.id}`], ['PATCH', `/open-po/${po.id}`],
  ['GET', '/customer'], ['POST', '/customer'], ['GET', '/customer/cek-no-wa?no_wa=081234567890'],
  ['GET', `/customer/${cust.id}`], ['PATCH', `/customer/${cust.id}`], ['DELETE', `/customer/${cust.id}`],
  ['POST', `/customer/${cust.id}/arsip`],
  ['GET', `/open-po/${po.id}/customer`], ['GET', `/open-po/${po.id}/barang-unik`],
  ['GET', BASE],
  ['POST', `${BASE}/baris-pesanan`],
  ['PATCH', `/baris-pesanan/${idBaris}`], ['DELETE', `/baris-pesanan/${idBaris}`],
  ['POST', `/baris-pesanan/${idBaris}/kosong`], ['DELETE', `/baris-pesanan/${idBaris}/kosong`],
  ['POST', `${BASE}/pembayaran`], ['DELETE', `/pembayaran/${idBayar}`],
  ['POST', `${BASE}/pengembalian-dana`], ['DELETE', '/pengembalian-dana/1'],
  ['GET', `${BASE}/rekap`],
];

bagian('A. Akses tanpa login');
const anon = new Klien();
await cek('SEC-A1', `Semua ${ENDPOINT.length} endpoint selain login/health menolak tanpa sesi (401 BELUM_MASUK, tanpa data)`, async () => {
  const salah = [];
  for (const [m, p] of ENDPOINT) {
    const r = await anon.req(m, p, { body: {} });
    if (r.status !== 401 || r.json?.error?.kode !== 'BELUM_MASUK' || r.json?.data !== undefined) salah.push(`${m} ${p} -> ${r.status} ${r.json?.error?.kode}`);
  }
  const k = await admin.ok('GET', BASE);
  harap(k.riwayat.some((x) => x.id === idBayar) && k.barang.some((b) => b.id === idBaris), 'data berubah oleh request tanpa sesi');
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-A2', 'Token palsu (cookie acak, path traversal, Bearer acak/rusak, Basic) ditolak 401', async () => {
  const salah = [];
  const variasi = [
    { cookie: `jastip_sesi=${'a'.repeat(64)}` },
    { cookie: 'jastip_sesi=../../etc/passwd' },
    { cookie: "jastip_sesi=' OR '1'='1" },
    { headers: { Authorization: `Bearer ${'0'.repeat(64)}` } },
    { headers: { Authorization: 'Bearer' } },
    { headers: { Authorization: "Bearer ' OR 1=1 --" } },
    { headers: { Authorization: 'Basic cGVtaWxpazpsb2thbA==' } },
  ];
  for (const v of variasi) {
    const r = await anon.req('GET', '/open-po', v);
    if (r.status !== 401) salah.push(`${JSON.stringify(v)} -> ${r.status}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-A3', 'Health publik tidak membocorkan data aplikasi', async () => {
  const r = await anon.req('GET', '/health');
  sama(r.json, { data: { status: 'ok', database: 'ok' } });
});

bagian('B. Cookie sesi');
await cek('SEC-B1', 'Cookie lokal: HttpOnly; SameSite=Strict; Path=/; Max-Age=43200 (tanpa Secure karena http lokal), token tidak di body', async () => {
  const k = new Klien();
  const r = await k.login();
  const sc = r.setCookie.join(' | ');
  for (const a of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) harap(sc.includes(a), `atribut ${a} tidak ada: ${sc}`);
  harap(!/Domain=/i.test(sc), `cookie memakai Domain: ${sc}`);
  harap(!JSON.stringify(r.json).match(/[0-9a-f]{64}/), 'token sesi ikut di body login web');
  rahasia.token.push(k.cookie.split('=')[1]);
  return sc.replace(/=[0-9a-f]{64}/, '=<token>');
});
await cek('SEC-B2', 'Token sesi 64 hex acak dan berbeda per login', async () => {
  const a = new Klien(); await a.login();
  const b = new Klien(); await b.login();
  harap(/^jastip_sesi=[0-9a-f]{64}$/.test(a.cookie), a.cookie);
  harap(a.cookie !== b.cookie, 'token sama');
  rahasia.token.push(a.cookie.split('=')[1], b.cookie.split('=')[1]);
});
await cek('SEC-B3', 'Sliding: cookie dikirim ulang paling sering sekali per menit (langsung: tidak; setelah 2 menit: Max-Age=43200)', async () => {
  const k = new Klien(); await k.login();
  const r1 = await k.req('GET', '/auth/sesi');
  harap(r1.setCookie.length === 0, `cookie dikirim ulang langsung setelah login: ${r1.setCookie}`);
  const tok = k.cookie.split('=')[1];
  sql(`UPDATE sesi_login SET terakhir_aktif_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE WHERE token_hash = SHA2('${tok}', 256);`);
  const r2 = await k.req('GET', '/auth/sesi');
  harap(r2.setCookie.some((c) => c.startsWith(`jastip_sesi=${tok};`) && /Max-Age=43200/.test(c)), `setelah 2 menit: ${r2.setCookie}`);
  const r3 = await k.req('GET', '/auth/sesi');
  harap(r3.setCookie.length === 0, `dikirim ulang lagi < 1 menit: ${r3.setCookie}`);
});
await cek('SEC-B4', 'Session fixation: cookie pilihan penyerang saat login diganti token baru dan tetap tidak berlaku', async () => {
  const k = new Klien();
  const palsu = `jastip_sesi=${'b'.repeat(64)}`;
  k.cookie = palsu;
  const r = await k.login();
  sama(r.status, 200, 'login');
  harap(k.cookie && k.cookie !== palsu, `token tidak diganti: ${k.cookie}`);
  sama((await anon.req('GET', '/auth/sesi', { cookie: palsu })).status, 401, 'token pilihan penyerang');
});

bagian('C. Logout dan masa sesi');
await cek('SEC-C1', 'Logout 204, cookie Max-Age=0, token lama tidak bisa dipakai lagi', async () => {
  const k = new Klien(); await k.login();
  const lama = k.cookie;
  const r = await k.req('POST', '/auth/logout');
  sama(r.status, 204, 'status logout');
  harap(r.setCookie.some((c) => /Max-Age=0/.test(c)), `cookie tidak dihapus: ${r.setCookie}`);
  const r2 = await k.req('GET', '/open-po', { cookie: lama });
  sama([r2.status, r2.json?.error?.kode], [401, 'BELUM_MASUK'], 'token lama');
  sama((await k.req('POST', '/auth/logout', { cookie: lama })).status, 401, 'logout kedua');
});
await cek('SEC-C2', 'Login mobile: token di body tanpa cookie; logout Bearer mengakhiri token itu', async () => {
  const k = new Klien();
  const r = await k.login(ADMIN_USER, ADMIN_PASSWORD, { klien: 'mobile' });
  const tok = r.json.data.token;
  harap(/^[0-9a-f]{64}$/.test(tok) && r.json.data.jenis_token === 'Bearer', 'token mobile tidak ada');
  harap(r.setCookie.length === 0, 'login mobile tetap mengirim cookie');
  rahasia.token.push(tok);
  const h = { headers: { Authorization: `Bearer ${tok}` }, cookie: null };
  sama((await k.req('GET', '/auth/sesi', h)).status, 200, 'sebelum logout');
  sama((await k.req('POST', '/auth/logout', h)).status, 204, 'logout');
  sama((await k.req('GET', '/auth/sesi', h)).status, 401, 'sesudah logout');
});
await cek('SEC-C3', 'Sesi berakhir setelah 12 jam tidak aktif (721 menit → 401 SESI_BERAKHIR; 719 menit → masih aktif, diperpanjang)', async () => {
  const a = new Klien(); await a.login();
  const b = new Klien(); await b.login();
  const tA = a.cookie.split('=')[1];
  const tB = b.cookie.split('=')[1];
  sql(`UPDATE sesi_login SET terakhir_aktif_at = UTC_TIMESTAMP() - INTERVAL 721 MINUTE WHERE token_hash = SHA2('${tA}', 256);`
    + ` UPDATE sesi_login SET terakhir_aktif_at = UTC_TIMESTAMP() - INTERVAL 719 MINUTE WHERE token_hash = SHA2('${tB}', 256);`);
  const ra = await a.req('GET', '/open-po');
  sama([ra.status, ra.json?.error?.kode, ra.json?.error?.pesan], [401, 'SESI_BERAKHIR', 'Sesi berakhir. Silakan masuk lagi.'], '721 menit');
  const rb = await b.req('GET', '/open-po');
  sama(rb.status, 200, '719 menit');
  harap(rb.setCookie.some((c) => /Max-Age=43200/.test(c)), 'cookie tidak diperpanjang (sliding)');
  const sisa = sql(`SELECT TIMESTAMPDIFF(MINUTE, terakhir_aktif_at, UTC_TIMESTAMP()) FROM sesi_login WHERE token_hash = SHA2('${tB}', 256);`);
  harap(/\n0\s*$/.test(sisa), `terakhir_aktif_at tidak diperbarui: ${sisa}`);
});

bagian('D. Login: batas percobaan dan pesan');
// Akun uji tambahan dengan kata sandi acak per run (tidak ada kata sandi tertulis di repo).
const sandiAcak = () => randomBytes(15).toString('base64url');
const QA_USER = 'qathrottle';
const QA_PASS = sandiAcak();
const SANDI_BRUTE = sandiAcak();
buatAdmin(QA_USER, QA_PASS);
buatAdmin('qawaktu', sandiAcak());
buatAdmin('qabrute', SANDI_BRUTE);
buatAdmin('qaparalel', sandiAcak());
rahasia.kata_sandi.push(QA_PASS, SANDI_BRUTE);
const PESAN_GAGAL = { error: { kode: 'LOGIN_GAGAL', pesan: 'Nama pengguna atau kata sandi salah.' } };

resetPercobaanLogin();
await cek('SEC-D1', 'Pesan login gagal sama untuk pengguna tidak ada, nama di luar pola, dan kata sandi salah', async () => {
  const k = new Klien();
  const r1 = await k.login('tidak-ada-orangnya', 'salah-salah-salah');
  const r2 = await k.login('qawaktu', 'salah-salah-salah');
  const r3 = await k.login('ab', 'salah-salah-salah');
  const r4 = await k.login('nama dengan spasi', 'salah-salah-salah');
  for (const [l, r] of [['tidak ada', r1], ['sandi salah', r2], ['terlalu pendek', r3], ['di luar pola', r4]]) sama([r.status, r.json], [401, PESAN_GAGAL], l);
});
resetPercobaanLogin();
await cek('SEC-D2', 'Waktu respons pengguna tidak ada ≈ pengguna ada (anti enumerasi)', async () => {
  const k = new Klien();
  const ukur = async (u) => {
    const t = [];
    for (let i = 0; i < 4; i++) t.push((await k.login(u, `salah-${i}-xxxxxxxx`)).ms);
    t.sort((x, y) => x - y);
    return t[1];
  };
  const ada = await ukur('qawaktu');
  const tidak = await ukur('qa-tidak-ada-xyz');
  const luar = await ukur('qáwaktu');
  harap(Math.abs(ada - tidak) < Math.max(80, ada * 0.5) && Math.abs(ada - luar) < Math.max(80, ada * 0.5),
    `median ada ${ada.toFixed(0)} ms, tidak ada ${tidak.toFixed(0)} ms, di luar pola ${luar.toFixed(0)} ms`);
  return `ada ${ada.toFixed(0)} ms, tidak ada ${tidak.toFixed(0)} ms, di luar pola ${luar.toFixed(0)} ms`;
});
resetPercobaanLogin();
await cek('SEC-D3', '5 gagal / nama pengguna → percobaan ke-6 (sandi benar) ditolak 429 + Retry-After ≈ 900', async () => {
  const k = new Klien();
  for (let i = 0; i < 5; i++) sama((await k.login(QA_USER, `salah-${i}-xxxxxxxx`)).status, 401, `gagal ke-${i + 1}`);
  const r = await k.login(QA_USER, QA_PASS);
  sama([r.status, r.json?.error?.kode], [429, 'TERLALU_BANYAK_PERCOBAAN']);
  const ra = Number(r.headers.get('retry-after'));
  harap(ra > 800 && ra <= 900, `Retry-After ${ra}`);
  sama(r.json.error.pesan, `Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.ceil(ra / 60)} menit.`, 'pesan');
  return r.json.error.pesan;
});
await cek('SEC-D4', 'Blokir berlaku untuk variasi huruf besar dan spasi (QATHROTTLE, " qathrottle ", QaThRoTtLe)', async () => {
  const k = new Klien();
  for (const u of ['QATHROTTLE', ' qathrottle ', 'QaThRoTtLe']) sama((await k.login(u, QA_PASS)).status, 429, `"${u}"`);
});
await cek('SEC-D5', 'Blokir tidak bisa dilewati dengan variasi aksen/fullwidth/karakter tak terlihat (sandi benar → tidak pernah 200)', async () => {
  const k = new Klien();
  const lolos = [];
  for (const u of ['qáthrottle', 'qathröttle', 'ｑａｔｈｒｏｔｔｌｅ', 'qathrottle\u00AD', 'qathrottle\u200B', 'qathrottle\u0000', 'qa\u0301throttle']) {
    const r = await k.login(u, QA_PASS);
    if (r.status === 200) lolos.push(`"${u}" (${[...u].map((c) => c.codePointAt(0).toString(16)).join(' ')}) -> 200`);
  }
  harap(!lolos.length, lolos.join('\n'));
});
resetPercobaanLogin();
await cek('SEC-D6', 'Variasi Unicode nama pengguna dengan sandi BENAR tidak pernah login (akun belum terkunci), jadi tidak bisa dipakai untuk brute force', async () => {
  const k = new Klien();
  const hasil = [];
  for (const u of ['qábrute', 'qàbrute', 'qâbrute', 'qäbrute', 'qãbrute', 'qåbrute', 'qābrute', 'ｑａｂｒｕｔｅ']) {
    const r = await k.login(u, SANDI_BRUTE);
    hasil.push(r.status);
  }
  harap(hasil.every((s) => s === 401), `status: ${hasil}`);
  sama((await k.login('QABRUTE', SANDI_BRUTE)).status, 200, 'kontrol: nama ASCII huruf besar');
});
resetPercobaanLogin();
await cek('SEC-D7', 'Validasi login: field kosong 422 per field; tipe salah 422/401; klien tidak dikenal 422', async () => {
  const k = new Klien();
  const r = await k.req('POST', '/auth/login', { body: {} });
  sama([r.status, r.json?.error?.field], [422, { nama_pengguna: 'Isi nama pengguna.', kata_sandi: 'Isi kata sandi.' }]);
  const r2 = await k.req('POST', '/auth/login', { body: { nama_pengguna: ['pemilik'], kata_sandi: 123 } });
  harap(r2.status === 422 || r2.status === 401, `tipe salah -> ${r2.status}`);
  const r3 = await k.req('POST', '/auth/login', { body: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD, klien: 'evil' } });
  sama([r3.status, r3.json?.error?.field], [422, { klien: 'klien harus web atau mobile.' }], 'klien tidak dikenal');
  const r4 = await k.req('POST', '/auth/login', { body: { nama_pengguna: ADMIN_USER, kata_sandi: 'x'.repeat(60000) } });
  sama(r4.status, 401, 'kata sandi 60 KB');
});
resetPercobaanLogin();
await cek('SEC-D8', 'Batas per IP: 20 gagal (20 nama berbeda) → login ke-21 dengan sandi benar ditolak 429; login sukses tidak menghapus hitungan IP', async () => {
  const k = new Klien();
  for (let i = 0; i < 19; i++) sama((await k.login(`qa-ip-${i}`, 'salah-salah-salah')).status, 401, `gagal ke-${i + 1}`);
  sama((await k.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200, 'login sukses setelah 19 gagal');
  sama((await k.login('qa-ip-19', 'salah-salah-salah')).status, 401, 'gagal ke-20');
  const r = await k.login(ADMIN_USER, ADMIN_PASSWORD);
  sama([r.status, r.json?.error?.kode], [429, 'TERLALU_BANYAK_PERCOBAAN'], 'ke-21 (sandi benar)');
  const ra = Number(r.headers.get('retry-after'));
  harap(ra > 0 && ra <= 900, `Retry-After ${ra}`);
  resetIp();
  sama((await k.login(ADMIN_USER, ADMIN_PASSWORD)).status, 200, 'setelah hitungan IP dihapus');
  return `Retry-After ${ra}`;
});
resetPercobaanLogin();
await cek('SEC-D9', 'Request login paralel: maks. 5 tebakan sandi per nama pengguna dan 20 per IP per 15 menit (3 putaran × 30/40 request bersamaan)', async () => {
  const perNama = [];
  const perIp = [];
  for (let putaran = 0; putaran < 3; putaran++) {
    resetPercobaanLogin();
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => new Klien().login('qaparalel', `tebakan-${putaran}-${i}-xxxxxx`)));
    perNama.push(rs.filter((r) => r.status === 401).length);
    resetPercobaanLogin();
    const rsIp = await Promise.all(Array.from({ length: 40 }, (_, i) => new Klien().login(`qa-par-ip-${putaran}-${i}`, 'salah-salah-salah')));
    perIp.push(rsIp.filter((r) => r.status === 401).length);
  }
  harap(Math.max(...perNama) <= 5 && Math.max(...perIp) <= 20,
    `Tebakan yang benar-benar diperiksa (401, bukan 429) per putaran: nama "qaparalel" ${perNama.join('/')} (batas 5), `
    + `per IP ${perIp.join('/')} (batas 20). Cek batas dan pencatatan percobaan tidak atomik.`);
  return `per nama ${perNama.join('/')}, per IP ${perIp.join('/')}`;
});
resetPercobaanLogin();

bagian('E. CSRF');
await cek('SEC-E1', 'POST/PATCH/DELETE dengan Origin asing → 403 ORIGIN_DITOLAK (termasuk login), data tidak berubah', async () => {
  const salah = [];
  const origins = ['http://evil.example', 'null', `${ORIGIN}.evil.example`, `${ORIGIN}@evil.example`, 'http://localhost:8091', `https://${new URL(ORIGIN).host}`, `${ORIGIN}/../`];
  for (const o of origins) {
    for (const [m, p, b] of [['POST', '/open-po', { nama: 'csrf', kurs: KURS_OTOMATIS }], ['PATCH', '/pengaturan', { dp_persen: '1' }],
      ['DELETE', `/pembayaran/${idBayar}`], ['POST', '/auth/login', { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD }]]) {
      const r = await admin.req(m, p, { headers: { Origin: o }, body: b });
      if (r.status !== 403 || r.json?.error?.kode !== 'ORIGIN_DITOLAK') salah.push(`${o} ${m} ${p} -> ${r.status}`);
    }
  }
  const s = await admin.ok('GET', '/pengaturan');
  harap(s.dp_persen === '50', `pengaturan berubah: ${s.dp_persen}`);
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-E2', 'Content-Type form/text/multipart/varian JSON palsu → 415 (form HTML lintas situs tidak bisa mengubah data)', async () => {
  const salah = [];
  for (const ct of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x', 'application/json-patch+json',
    'text/json', 'application/jsonp', 'text/plain; application/json', '']) {
    const r = await admin.req('POST', `${BASE}/pembayaran`, {
      headers: ct ? { 'Content-Type': ct } : {}, raw: JSON.stringify({ nominal: 5000, tanggal: '2026-10-28' }), origin: false,
    });
    if (r.status !== 415) salah.push(`"${ct}" -> ${r.status}`);
  }
  for (const ct of ['application/json; charset=utf-8', 'APPLICATION/JSON']) {
    const r = await admin.req('PATCH', `/baris-pesanan/${idBaris}`, { headers: { 'Content-Type': ct }, raw: '{}' });
    if (r.status !== 200) salah.push(`"${ct}" (sah) -> ${r.status}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-E3', 'Method override (X-HTTP-Method-Override, X-HTTP-Method, _method) tidak didukung', async () => {
  const r1 = await admin.req('POST', `/pembayaran/${idBayar}`, { headers: { 'X-HTTP-Method-Override': 'DELETE' } });
  const r2 = await admin.req('POST', `/pembayaran/${idBayar}?_method=DELETE`);
  const r3 = await admin.req('GET', `/pembayaran/${idBayar}?_method=DELETE`);
  const r4 = await admin.req('POST', `/pembayaran/${idBayar}`, { headers: { 'X-HTTP-Method': 'DELETE' } });
  sama([r1.status, r2.status, r3.status, r4.status], [405, 405, 405, 405]);
  sama(r1.headers.get('allow'), 'DELETE', 'header Allow');
  const k = await admin.ok('GET', BASE);
  harap(k.riwayat.some((x) => x.id === idBayar), 'pembayaran terhapus lewat override');
});
await cek('SEC-E4', 'Tanpa CORS: preflight OPTIONS dan GET lintas origin tidak memberi Access-Control-Allow-Origin/Credentials', async () => {
  const r1 = await admin.req('OPTIONS', '/open-po', { headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' } });
  const r2 = await admin.req('GET', '/open-po', { headers: { Origin: 'http://evil.example' } });
  for (const r of [r1, r2]) harap(!r.headers.get('access-control-allow-origin') && !r.headers.get('access-control-allow-credentials'), 'header CORS ada');
  return `OPTIONS -> ${r1.status}`;
});
await cek('SEC-E5', 'Origin sah (huruf besar, garis miring akhir) diterima; request tanpa Origin diterima (sesuai kontrak §1.4)', async () => {
  const r1 = await admin.req('PATCH', `/baris-pesanan/${idBaris}`, { headers: { Origin: `${ORIGIN.toUpperCase()}/` }, body: {} });
  const r2 = await admin.req('PATCH', `/baris-pesanan/${idBaris}`, { body: {}, origin: false });
  sama([r1.status, r2.status], [200, 200]);
});

bagian('F. SQL injection dan parameter aneh');
await cek('SEC-F1', 'Pencarian customer dengan payload SQL/LIKE tidak error dan tidak mengembalikan semua data', async () => {
  await admin.ok('POST', '/customer', { nama: 'Zeta Unik', no_wa: noWaUnik() });
  const salah = [];
  for (const q of ["' OR 1=1 -- ", "' OR '1'='1", '%', '_', '%%', '!', '\\', "'; DROP TABLE customer; --", '" OR ""="', '1) OR (1=1',
    "Zeta' UNION SELECT nama_pengguna, password_hash FROM admin -- ", '0812%', '62_']) {
    const r = await admin.req('GET', `/customer?q=${encodeURIComponent(q)}`);
    if (r.status !== 200) salah.push(`q=${q} -> ${r.status}`);
    else if (r.json.meta.total > 0 && !r.json.data.every((c) => c.nama.toLowerCase().includes(q.toLowerCase()))) salah.push(`q=${q} -> ${r.json.meta.total} hasil (${r.json.data.slice(0, 3).map((c) => c.nama).join(', ')})`);
  }
  const masih = await admin.ok('GET', '/customer?q=Zeta');
  harap(masih.length >= 1, 'tabel customer hilang?');
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-F2', 'Parameter query tipe/isi aneh → 422/404, tidak pernah 500', async () => {
  const kasus = [
    '/customer?q[]=a', '/customer?urut=nama;DROP', "/customer?urut=nama'--", '/customer?urut[]=nama', '/customer?halaman=1%20OR%201=1',
    '/customer?halaman=0', '/customer?per_halaman=101', '/customer?per_halaman=1e2', '/customer?halaman=99999999999999999999',
    '/customer?open_po_id=abc', '/customer?open_po_id[]=1', `/customer?q=${'x'.repeat(101)}`, '/customer?open_po_id=1%20OR%201=1',
    '/customer/cek-no-wa', '/customer/cek-no-wa?no_wa[]=1', '/customer/cek-no-wa?no_wa=0812&kecuali_id=abc',
    "/customer/cek-no-wa?no_wa=081234567890&kecuali_id=1%20OR%201=1",
    `/open-po?status=buka'%20OR%20'1'='1`, '/open-po?status[]=buka', `/open-po/${po.id}/customer?status=lunas'--`,
    `/open-po/${po.id}/customer?status[]=lunas`, '/open-po/1%20OR%201=1', '/open-po/0', '/open-po/-1', '/open-po/abc',
    '/open-po/999999999999999999', '/open-po/4294967296', `/open-po/${po.id}/keranjang/999999999999999999`,
    `/open-po/999999999999999999/keranjang/${cust.id}/rekap`, '/open-po/1.5', '/open-po/1e3', '/open-po/0x1', '/open-po/%2531',
  ];
  const lima = [];
  const hasil = [];
  for (const p of kasus) {
    const r = await admin.req('GET', p);
    hasil.push(`${p} -> ${r.status}`);
    if (r.status >= 500) lima.push(`${p} -> ${r.status} ${r.teks.slice(0, 120)}`);
  }
  harap(!lima.length, lima.join('\n'));
  return `selain 404/422: ${hasil.filter((h) => !/-> (404|422)$/.test(h)).join('; ') || '-'}`;
});
await cek('SEC-F3', 'Aksi tulis dengan ID di luar rentang INT → 404/409, bukan 500', async () => {
  const salah = [];
  const big = '999999999999999999';
  for (const [m, p, b] of [
    ['POST', `/open-po/${po.id}/keranjang/${big}/pembayaran`, { nominal: 1000, tanggal: '2026-10-28' }],
    ['POST', `/open-po/${big}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' }],
    ['POST', `/open-po/${po.id}/keranjang/${big}/pengembalian-dana`, { nominal: 1000, tanggal: '2026-10-28' }],
    ['DELETE', `/pembayaran/${big}`], ['DELETE', `/pengembalian-dana/${big}`], ['PATCH', `/baris-pesanan/${big}`, {}],
    ['POST', `/baris-pesanan/${big}/kosong`], ['POST', `/customer/${big}/arsip`], ['DELETE', `/customer/${big}`], ['PATCH', `/open-po/${big}`, { nama: 'x' }],
    ['PATCH', '/customer/4294967296', { nama: 'x' }],
  ]) {
    const r = await admin.req(m, p, { body: b });
    if (r.status !== 404 && r.status !== 409) salah.push(`${m} ${p} -> ${r.status} ${r.teks.slice(0, 150)}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-F4', 'Payload SQL di semua field teks tersimpan apa adanya (prepared statement), tabel utuh', async () => {
  const p1 = "Robert'); DROP TABLE customer;--";
  const p2 = "1' OR '1'='1";
  const p3 = "x\\'; UPDATE admin SET password_hash='x' WHERE 1=1; --";
  const c = await admin.ok('POST', '/customer', { nama: p1, no_wa: noWaUnik(), alamat: p3 });
  const g = await admin.ok('GET', `/customer/${c.id}`);
  sama([g.nama, g.alamat], [p1, p3], 'customer');
  const o = await admin.ok('POST', '/open-po', { nama: p2, kurs: kursManual(10000) });
  const k = await admin.ok('POST', `/open-po/${o.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: p3, harga_aud: '1', qty: 1, markup_persen: '0' });
  sama([k.open_po.nama, k.barang[0].nama_barang], [p2, p3], 'PO + barang');
  await admin.ok('POST', `/open-po/${o.id}/keranjang/${c.id}/pembayaran`, { nominal: 20000, tanggal: '2026-10-28' });
  const kr2 = await admin.ok('POST', `/open-po/${o.id}/keranjang/${c.id}/pengembalian-dana`, { nominal: 1000, tanggal: '2026-10-28', catatan: p1 });
  sama(kr2.riwayat.find((x) => x.jenis === 'pengembalian_dana').catatan, p1, 'catatan');
  const unik = await admin.ok('GET', `/open-po/${o.id}/barang-unik`);
  sama(unik[0].nama_barang, p3, 'barang-unik');
  const login = await new Klien().login();
  sama(login.status, 200, 'admin masih bisa login (tabel admin utuh)');
  rahasia.customer.push(p1);
});

bagian('G. Body dan JSON');
await cek('SEC-G1', 'Body > 64 KB → 413; JSON rusak / terlalu dalam / UTF-8 rusak / surrogate tunggal / BOM / skalar → 400', async () => {
  const ct = { 'Content-Type': 'application/json' };
  const big = await admin.req('POST', '/customer', { raw: JSON.stringify({ nama: 'x'.repeat(70000), no_wa: '081234567890' }), headers: ct });
  sama([big.status, big.json?.error?.kode], [413, 'BODY_TERLALU_BESAR'], 'body besar');
  const kasus = {
    rusak: '{"nama":', array: '[1,2]', dalam: `{"a":${'['.repeat(40)}${']'.repeat(40)}}`, string: '"x"', angka: '123', null: 'null', true: 'true',
    utf8_rusak: Buffer.concat([Buffer.from('{"nama":"'), Buffer.from([0xff, 0xfe]), Buffer.from('","no_wa":"081234567890"}')]),
    surrogate: '{"nama":"\\ud800","no_wa":"081234567890"}', bom: '\uFEFF{"nama":"x","no_wa":"081234567890"}', dua_objek: '{}{}',
  };
  const salah = [];
  for (const [n, raw] of Object.entries(kasus)) {
    const r = await admin.req('POST', '/customer', { raw, headers: ct });
    if (r.status !== 400 || r.json?.error?.kode !== 'JSON_TIDAK_VALID') salah.push(`${n} -> ${r.status} ${r.teks.slice(0, 100)}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-G2', 'Batas 64 KB tepat: 65.536 byte diproses (422 karena panjang nama), 65.537 byte → 413', async () => {
  const kosong = JSON.stringify({ nama: '', no_wa: '081234567890' }).length;
  const body = (n) => `{"nama":"${'x'.repeat(n - kosong)}","no_wa":"081234567890"}`;
  const r1 = await admin.req('POST', '/customer', { raw: body(65536), headers: { 'Content-Type': 'application/json' } });
  const r2 = await admin.req('POST', '/customer', { raw: body(65537), headers: { 'Content-Type': 'application/json' } });
  sama([r1.status, r1.json?.error?.field?.nama, r2.status], [422, 'Nama maksimal 100 karakter.', 413]);
});
await cek('SEC-G3', 'Body JSON array kosong "[]" ditolak 400 "Body harus berupa objek JSON." (kontrak §1.5)', async () => {
  const r = await admin.req('POST', '/customer', { raw: '[]', headers: { 'Content-Type': 'application/json' } });
  sama([r.status, r.json?.error?.kode], [400, 'JSON_TIDAK_VALID'], `"[]" -> ${r.teks.slice(0, 160)}`);
});
await cek('SEC-G4', 'Angka JSON (float) untuk field desimal ditolak; angka besar/eksponen untuk integer ditolak', async () => {
  const ct = { 'Content-Type': 'application/json' };
  const kasus = [
    [`${BASE}/baris-pesanan`, '{"nama_barang":"n","harga_aud":24.95,"qty":1,"markup_persen":"0"}', 'harga_aud', 'Isi angka saja, mis. 24,95.'],
    [`${BASE}/baris-pesanan`, '{"nama_barang":"n","harga_aud":"1","qty":1,"markup_persen":10}', 'markup_persen', 'Isi angka, mis. 10.'],
    [`${BASE}/baris-pesanan`, '{"nama_barang":"n","harga_aud":"1","qty":2.0,"markup_persen":"0"}', 'qty', 'Qty harus bilangan bulat.'],
    [`${BASE}/baris-pesanan`, '{"nama_barang":"n","harga_aud":"1","qty":1E2,"markup_persen":"0"}', 'qty', 'Qty harus bilangan bulat.'],
    [`${BASE}/pembayaran`, '{"nominal":1000.0,"tanggal":"2026-10-28"}', 'nominal', 'Isi angka saja, mis. 1468000.'],
    [`${BASE}/pembayaran`, '{"nominal":9223372036854775808,"tanggal":"2026-10-28"}', 'nominal', 'Isi angka saja, mis. 1468000.'],
    [`${BASE}/pembayaran`, '{"nominal":1e400,"tanggal":"2026-10-28"}', 'nominal', 'Isi angka saja, mis. 1468000.'],
    [`${BASE}/pembayaran`, '{"nominal":"5000","tanggal":"2026-10-28"}', 'nominal', 'Isi angka saja, mis. 1468000.'],
    [`${BASE}/pembayaran`, '{"nominal":true,"tanggal":"2026-10-28"}', 'nominal', 'Isi angka saja, mis. 1468000.'],
  ];
  const salah = [];
  for (const [p, raw, f, pesan] of kasus) {
    const r = await admin.req('POST', p, { raw, headers: ct });
    if (r.status !== 422 || r.json?.error?.field?.[f] !== pesan) salah.push(`${raw} -> ${r.status} ${JSON.stringify(r.json?.error?.field)}`);
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('H. Kirim ganda (double submit) pembayaran');
await cek('SEC-H1', '5 request pembayaran identik bersamaan → semuanya tercatat konsisten (tanpa deadlock/500)', async () => {
  const c = await admin.ok('POST', '/customer', { nama: 'QA Ganda', no_wa: noWaUnik() });
  await admin.ok('POST', `/open-po/${po.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: 'Y', harga_aud: '100', qty: 1, markup_persen: '0' });
  const rs = await Promise.all(Array.from({ length: 5 }, () => admin.req('POST', `/open-po/${po.id}/keranjang/${c.id}/pembayaran`, { body: { nominal: 100000, tanggal: '2026-10-28' } })));
  const st = rs.map((r) => r.status);
  harap(st.every((s) => s === 201), `status: ${st}`);
  const k = await admin.ok('GET', `/open-po/${po.id}/keranjang/${c.id}`);
  sama([k.riwayat.length, k.ringkasan.total_pembayaran], [5, 500000]);
  return 'Server mencatat kelima pembayaran. Kontrak tidak meminta idempotensi; pencegahan kirim ganda hanya di UI (ui-spec §12.7, diuji di bagian B).';
});

bagian('I. Header keamanan HTTP (API)');
const apiRes = await fetch(`${APP_URL}/api/v1/health`);
const api401 = await fetch(`${APP_URL}/api/v1/pengaturan`);
const api404 = await fetch(`${APP_URL}/api/v1/tidak-ada`);
await cek('SEC-I1', 'API (200/401/404): X-Content-Type-Options nosniff, Cache-Control no-store, Referrer-Policy no-referrer, JSON UTF-8', async () => {
  for (const [n, r] of [['200', apiRes], ['401', api401], ['404', api404]]) {
    sama([r.headers.get('x-content-type-options'), r.headers.get('cache-control'), r.headers.get('referrer-policy')], ['nosniff', 'no-store', 'no-referrer'], n);
    harap(/^application\/json; charset=utf-8$/i.test(r.headers.get('content-type')), `${n}: ${r.headers.get('content-type')}`);
  }
});
await cek('SEC-I2', 'API tidak mengirim X-Powered-By (versi PHP)', async () => {
  const xp = [apiRes, api401, api404].map((r) => r.headers.get('x-powered-by')).filter(Boolean);
  harap(!xp.length, `X-Powered-By: ${xp}`);
});

bagian('J. Kebocoran detail error');
await cek('SEC-J1', 'Error 400/404/405/413/415/422 tidak memuat path file, SQL, atau stack trace dan tidak memantulkan input', async () => {
  const rs = await Promise.all([
    admin.req('GET', '/tidak-ada<script>'), admin.req('PUT', '/open-po'), admin.req('POST', '/open-po', { raw: 'x', headers: { 'Content-Type': 'text/plain' } }),
    admin.req('POST', '/open-po', { body: { nama: 1, kurs: 'x' } }), admin.req('POST', '/customer', { raw: '{bad<script>', headers: { 'Content-Type': 'application/json' } }),
    admin.req('POST', '/customer', { raw: JSON.stringify({ nama: 'y'.repeat(70000) }), headers: { 'Content-Type': 'application/json' } }),
    admin.req('GET', "/customer?urut=nama'<script>"),
  ]);
  const bocor = rs.filter((r) => /\/projects|\.php|SQLSTATE|Stack|#0 |PDO|<script>|backend|vendor/i.test(r.teks));
  harap(!bocor.length, bocor.map((r) => r.teks).join('\n'));
  return rs.map((r) => r.status).join(', ');
});
await cek('SEC-J2', 'Pesan error jaringan kurs (502) generik, tanpa URL/host Frankfurter', async () => {
  if (QA_TARGET !== 'dev') return 'dilewati (hanya dev-stack punya stub kurs)';
  await fetch(`${APP_URL}/__dev/kurs-mode?set=gagal`);
  try {
    const r = await admin.req('GET', '/kurs/aud-idr');
    sama([r.status, r.json], [502, { error: { kode: 'KURS_GAGAL', pesan: 'Kurs otomatis gagal diambil. Isi kurs manual, atau coba lagi.' } }]);
  } finally { await fetch(`${APP_URL}/__dev/kurs-mode?set=ok`); }
});

bagian('K. File sensitif lewat web (dev server)');
await cek('SEC-K1', 'File sensitif tidak bisa diakses dari web server lokal (php -S dev-stack)', async () => {
  if (QA_TARGET !== 'dev') return 'dilewati (paket diuji di qa/paket/uji-paket.sh)';
  const salah = [];
  for (const p of ['/.env', '/composer.json', '/composer.lock', '/vendor/autoload.php', '/.htaccess', '/backend/.env', '/../backend/.env',
    '/%2e%2e/backend/.env', '/api/../../backend/.env', '/.git/config', '/storage/logs/app.log', '/package.json', '/src/js/lib/api.js', '/phpunit.xml.dist']) {
    const r = await fetch(`${APP_URL}${p}`);
    const t = await r.text();
    if (r.status === 200 && !/<!doctype html>/i.test(t.slice(0, 50))) salah.push(`${p} -> 200 (${t.slice(0, 60).replace(/\s+/g, ' ')})`);
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('X. XSS tersimpan (API dan rekap; render di UI diuji di bagian B)');
const XSS = [
  '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'><svg onload=alert(1)>", 'javascript:alert(1)',
  '</textarea><script>alert(1)</script>', '{{7*7}}${7*7}', '<a href="javascript:alert(1)">x</a>', '&lt;b&gt;&amp;',
];
await cek('SEC-X1', `${XSS.length} payload XSS di semua field teks (PO, customer nama/alamat, barang, catatan) tersimpan dan dikembalikan apa adanya sebagai JSON`, async () => {
  const salah = [];
  for (const [i, x] of XSS.entries()) {
    const c = await admin.ok('POST', '/customer', { nama: x.slice(0, 100), no_wa: noWaUnik(), alamat: x });
    const o = await admin.ok('POST', '/open-po', { nama: x.slice(0, 100), kurs: kursManual(10000) });
    const b = `/open-po/${o.id}/keranjang/${c.id}`;
    await admin.ok('POST', `${b}/baris-pesanan`, { nama_barang: x, harga_aud: '1', qty: 1, markup_persen: '0' });
    await admin.ok('POST', `${b}/pembayaran`, { nominal: 20000, tanggal: '2026-10-28' });
    const k = await admin.ok('POST', `${b}/pengembalian-dana`, { nominal: 1000, tanggal: '2026-10-28', catatan: x });
    const cust2 = await admin.ok('GET', `/customer/${c.id}`);
    const unik = await admin.ok('GET', `/open-po/${o.id}/barang-unik`);
    const daftar = await admin.ok('GET', `/open-po/${o.id}/customer`);
    const cari = await admin.req('GET', `/customer?q=${encodeURIComponent(x.slice(0, 100))}`);
    const cekWa = await admin.ok('GET', `/customer/cek-no-wa?no_wa=${cust2.no_wa}`);
    const nilai = [k.open_po.nama, k.customer.nama, cust2.alamat, k.barang[0].nama_barang, k.riwayat.find((r) => r.jenis === 'pengembalian_dana').catatan,
      unik[0].nama_barang, daftar[0].customer.nama, cari.json.data.find((d) => d.id === c.id)?.nama];
    const harapan = [x.slice(0, 100), x.slice(0, 100), x, x, x, x, x.slice(0, 100), x.slice(0, 100)];
    if (JSON.stringify(nilai) !== JSON.stringify(harapan)) salah.push(`#${i}: ${JSON.stringify(nilai)}`);
    if (!cekWa.pesan.includes(x.slice(0, 100))) salah.push(`#${i} cek-no-wa pesan: ${cekWa.pesan}`);
    if (!/^application\/json/.test(cari.headers.get('content-type')) || cari.headers.get('x-content-type-options') !== 'nosniff') salah.push(`#${i} header ${cari.headers.get('content-type')}`);
  }
  harap(!salah.length, salah.join('\n'));
  return 'API tidak meng-escape HTML (benar untuk JSON); front-end wajib merender sebagai teks (bagian B).';
});
await cek('SEC-X2', 'Rekap WA memuat payload sebagai teks polos di JSON (front-end hanya menyalin)', async () => {
  const x = XSS[1];
  const c = await admin.ok('POST', '/customer', { nama: x, no_wa: noWaUnik() });
  const o = await admin.ok('POST', '/open-po', { nama: x, kurs: kursManual(10000) });
  await admin.ok('POST', `/open-po/${o.id}/keranjang/${c.id}/baris-pesanan`, { nama_barang: x, harga_aud: '1', qty: 1, markup_persen: '0' });
  const r = await admin.req('GET', `/open-po/${o.id}/keranjang/${c.id}/rekap`);
  harap(/^application\/json/.test(r.headers.get('content-type')), r.headers.get('content-type'));
  const t = r.json.data.teks;
  harap(t.startsWith(`*REKAP JASTIP - ${x}*\nCustomer: ${x} (`) && t.includes(`\n1. ${x}\n`), t);
});

bagian('M. Input berlebihan dan nilai batas validasi');
const CT = { 'Content-Type': 'application/json' };
await cek('SEC-M1', 'Panjang maksimum tiap field teks (ASCII dan emoji 4 byte): batas diterima utuh, batas+1 → 422 dengan pesan kontrak', async () => {
  const salah = [];
  const emo = (n) => '😀'.repeat(n);
  const asc = (n) => 'a'.repeat(n);
  const o = await admin.ok('POST', '/open-po', { nama: 'panjang', kurs: kursManual(10000) });
  const c = await admin.ok('POST', '/customer', { nama: 'panjang', no_wa: noWaUnik() });
  const b = `/open-po/${o.id}/keranjang/${c.id}`;
  await admin.ok('POST', `${b}/pembayaran`, { nominal: 1000000, tanggal: '2026-10-28' });
  const uji = [
    ['PO nama', 100, 'Nama Open PO maksimal 100 karakter.', (v) => admin.req('POST', '/open-po', { body: { nama: v, kurs: kursManual(10000) } }), (d) => d.nama, 'nama'],
    ['customer nama', 100, 'Nama maksimal 100 karakter.', (v) => admin.req('POST', '/customer', { body: { nama: v, no_wa: noWaUnik() } }), (d) => d.nama, 'nama'],
    ['customer alamat', 500, 'Alamat maksimal 500 karakter.', (v) => admin.req('POST', '/customer', { body: { nama: 'x', no_wa: noWaUnik(), alamat: v } }), (d) => d.alamat, 'alamat'],
    ['nama barang', 150, 'Nama barang maksimal 150 karakter.', (v) => admin.req('POST', `${b}/baris-pesanan`, { body: { nama_barang: v, harga_aud: '1', qty: 1, markup_persen: '0' } }), (d) => d.barang.at(-1).nama_barang, 'nama_barang'],
    ['catatan pengembalian', 255, 'Catatan maksimal 255 karakter.', (v) => admin.req('POST', `${b}/pengembalian-dana`, { body: { nominal: 1000, tanggal: '2026-10-28', catatan: v } }), (d) => d.riwayat.find((r) => r.jenis === 'pengembalian_dana').catatan, 'catatan'],
  ];
  for (const [label, max, pesan, kirim, ambil, field] of uji) {
    for (const [jenis, gen] of [['ASCII', asc], ['emoji', emo]]) {
      const ok = await kirim(gen(max));
      if (ok.status !== 201 || ambil(ok.json.data) !== gen(max)) salah.push(`${label} ${jenis} ${max}: ${ok.status} ${ok.teks.slice(0, 120)}`);
      const lebih = await kirim(gen(max + 1));
      if (lebih.status !== 422 || lebih.json?.error?.field?.[field] !== pesan) salah.push(`${label} ${jenis} ${max + 1}: ${lebih.status} ${JSON.stringify(lebih.json?.error)}`);
    }
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-M2', 'Nilai angka di luar rentang / format aneh (negatif, nol, desimal berlebih, eksponen, digit non-ASCII) → 422 dengan pesan kontrak', async () => {
  const o = await admin.ok('POST', '/open-po', { nama: 'angka', kurs: kursManual(10000) });
  const c = await admin.ok('POST', '/customer', { nama: 'angka', no_wa: noWaUnik() });
  const b = `/open-po/${o.id}/keranjang/${c.id}`;
  const barang = (f) => ({ nama_barang: 'n', harga_aud: '1', qty: 1, markup_persen: '0', ...f });
  const kasus = [
    // [path, method, body, field, pesan]
    ...[['', 'Harga wajib diisi.'], ['0', 'Harga harus lebih dari 0.'], ['0,00', 'Harga harus lebih dari 0.'], ['-0', 'Harga harus lebih dari 0.'],
      ['-1', 'Harga harus lebih dari 0.'], ['1.299', 'Maksimal 2 angka di belakang koma.'], ['100000.01', 'Harga maksimal AUD 100.000,00.'],
      ['999999999999999999', 'Harga maksimal AUD 100.000,00.'], ['1e3', 'Isi angka saja, mis. 24,95.'], ['+5', 'Isi angka saja, mis. 24,95.'],
      ['٥', 'Isi angka saja, mis. 24,95.'], ['２４', 'Isi angka saja, mis. 24,95.'], ['24.', 'Isi angka saja, mis. 24,95.'], ['.5', 'Isi angka saja, mis. 24,95.'],
      ['1.2.3', 'Isi angka saja, mis. 24,95.'], ['0x1F', 'Isi angka saja, mis. 24,95.'], ['NaN', 'Isi angka saja, mis. 24,95.'], ['Infinity', 'Isi angka saja, mis. 24,95.'],
      ['1 000', 'Isi angka saja, mis. 24,95.']]
      .map(([v, p]) => [`${b}/baris-pesanan`, 'POST', barang({ harga_aud: v }), 'harga_aud', p]),
    ...[[undefined, 'Markup wajib diisi.'], ['-0,5', 'Markup tidak boleh negatif.'], ['100.01', 'Markup maksimal 100%.'], ['10.555', 'Maksimal 2 angka di belakang koma.'], ['abc', 'Isi angka, mis. 10.']]
      .map(([v, p]) => [`${b}/baris-pesanan`, 'POST', barang({ markup_persen: v }), 'markup_persen', p]),
    ...[[0, 'Qty minimal 1.'], [-1, 'Qty minimal 1.'], [null, 'Qty minimal 1.'], [1000, 'Qty maksimal 999.'], [1.5, 'Qty harus bilangan bulat.'], ['2', 'Qty harus bilangan bulat.'], [true, 'Qty harus bilangan bulat.']]
      .map(([v, p]) => [`${b}/baris-pesanan`, 'POST', barang({ qty: v }), 'qty', p]),
    ...[[undefined, 'Nominal wajib diisi.'], [0, 'Nominal harus lebih dari Rp0.'], [-5, 'Nominal harus lebih dari Rp0.'], [1000000000001, 'Nominal terlalu besar.'],
      [9223372036854775807n, 'Nominal terlalu besar.'], [1.5, 'Isi angka saja, mis. 1468000.']]
      .map(([v, p]) => [`${b}/pembayaran`, 'POST', { nominal: v, tanggal: '2026-10-28' }, 'nominal', p]),
    ...[[undefined, 'Tanggal wajib diisi.'], ['2026-02-29', 'Tanggal tidak valid.'], ['2026-13-01', 'Tanggal tidak valid.'], ['26-10-28', 'Tanggal tidak valid.'],
      ['2026-10-28T00:00:00Z', 'Tanggal tidak valid.'], ['2026-1-5', 'Tanggal tidak valid.'], ['10000-01-01', 'Tanggal tidak valid.'], [20261028, 'Tanggal tidak valid.']]
      .map(([v, p]) => [`${b}/pembayaran`, 'POST', { nominal: 1000, tanggal: v }, 'tanggal', p]),
    ...[[undefined, 'Kurs wajib diisi. Ambil kurs otomatis atau isi manual.'], [0, 'Kurs harus lebih dari 0.'], [-1, 'Kurs harus lebih dari 0.'],
      [1000001, 'Kurs maksimal Rp1.000.000.'], [13054.5, 'Isi angka saja, mis. 13054.'], ['13054', 'Isi angka saja, mis. 13054.']]
      .map(([v, p]) => ['/open-po', 'POST', { nama: 'k', kurs: { mode: 'manual', kurs_jastip: v } }, 'kurs.kurs_jastip', p]),
    ...[['0', 'Kurs pasar tidak valid. Ambil kurs terbaru.'], ['500000.000001', 'Kurs pasar tidak valid. Ambil kurs terbaru.'], ['1.1234567', 'Kurs pasar tidak valid. Ambil kurs terbaru.'],
      ['-12673', 'Kurs pasar tidak valid. Ambil kurs terbaru.'], [undefined, 'Kurs wajib diisi. Ambil kurs otomatis atau isi manual.']]
      .map(([v, p]) => ['/open-po', 'POST', { nama: 'k', kurs: { mode: 'otomatis', kurs_pasar: v, tanggal_kurs: '2026-10-25' } }, 'kurs.kurs_pasar', p]),
    ['/open-po', 'POST', { nama: 'k', kurs: { mode: 'otomatis', kurs_pasar: '12673', tanggal_kurs: '25-10-2026' } }, 'kurs.tanggal_kurs', 'Tanggal kurs tidak valid.'],
    ['/open-po', 'POST', { nama: 'k', kurs: { mode: 'x' } }, 'kurs.mode', 'Pilih kurs Otomatis atau Manual.'],
    ['/open-po', 'POST', { nama: 'k' }, 'kurs', 'Kurs wajib diisi. Ambil kurs otomatis atau isi manual.'],
    ['/open-po', 'POST', { nama: '   ', kurs: kursManual(1) }, 'nama', 'Nama Open PO wajib diisi.'],
    [`/open-po/${o.id}`, 'PATCH', { status: 'tutup' }, 'status', 'Status harus buka atau selesai.'],
    ...[['-1', 'Markup tidak boleh negatif.'], ['100.5', 'Markup maksimal 100%.'], ['', 'Markup wajib diisi.'], [10, 'Isi angka, mis. 10.'], ['1,234', 'Maksimal 2 angka di belakang koma.']]
      .map(([v, p]) => ['/pengaturan', 'PATCH', { default_markup_persen: v }, 'default_markup_persen', p]),
    ...[['-1', 'Buffer tidak boleh negatif.'], ['101', 'Buffer maksimal 100%.']].map(([v, p]) => ['/pengaturan', 'PATCH', { buffer_aud_persen: v }, 'buffer_aud_persen', p]),
    ...[['-1', 'DP harus antara 0 dan 100%.'], ['100.01', 'DP harus antara 0 dan 100%.'], [null, 'DP wajib diisi.']].map(([v, p]) => ['/pengaturan', 'PATCH', { dp_persen: v }, 'dp_persen', p]),
    ...[['', 'No WA wajib diisi.'], ['0812-3456-789a', 'No WA hanya boleh berisi angka.'], ['0812.3456.7890', 'No WA hanya boleh berisi angka.'],
      ['０８１２３４５６７８９０', 'No WA hanya boleh berisi angka.'], ['+6081234567890', 'No WA harus diawali 08, 62, atau +62.'], ['8123456789', 'No WA harus diawali 08, 62, atau +62.'],
      ['081234567', 'No WA harus 10–14 digit (format 08…).'], ['081234567890123', 'No WA harus 10–14 digit (format 08…).']]
      .map(([v, p]) => ['/customer', 'POST', { nama: 'w', no_wa: v }, 'no_wa', p]),
  ];
  const salah = [];
  for (const [p, m, body, field, pesan] of kasus) {
    const raw = JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? `__BIG${v}__` : v)).replace(/"__BIG(\d+)__"/g, '$1');
    const r = await admin.req(m, p, { raw, headers: CT });
    if (r.status !== 422 || r.json?.error?.field?.[field] !== pesan) salah.push(`${m} ${p} ${raw} -> ${r.status} ${JSON.stringify(r.json?.error?.field ?? r.json)}`);
  }
  const s = await admin.ok('GET', '/pengaturan');
  sama([s.default_markup_persen, s.buffer_aud_persen, s.dp_persen], ['10', '3', '50'], 'pengaturan tidak boleh berubah');
  harap(!salah.length, salah.join('\n'));
  return `${kasus.length} kasus`;
});
await cek('SEC-M3', 'Nilai batas yang sah diterima: harga 0,01 / 100.000,00, qty 1 / 999, markup 0 / 100 / 12,5, nominal 1 / 1.000.000.000.000, no WA 10 / 14 digit, spasi di tepi dibuang', async () => {
  const o = await admin.ok('POST', '/open-po', { nama: '  batas  ', kurs: kursManual(1000000) });
  sama(o.nama, 'batas', 'nama PO di-trim');
  const c = await admin.ok('POST', '/customer', { nama: ' Batas ', no_wa: '+62 812-3456-78' });
  sama([c.nama, c.no_wa, c.no_wa_tampil], ['Batas', '62812345678', '0812345678'], 'customer, no WA 10 digit');
  const c14 = await admin.ok('POST', '/customer', { nama: 'b', no_wa: '(0812) 3456 7890 12' });
  sama([c14.no_wa, c14.no_wa_tampil], ['628123456789012', '08123456789012'], 'no WA 14 digit');
  const b = `/open-po/${o.id}/keranjang/${c.id}`;
  for (const [h, q, m] of [['0,01', 1, '0'], ['100000.00', 999, '100'], [' 24.95 ', 1, '12,5']]) {
    const r = await admin.req('POST', `${b}/baris-pesanan`, { body: { nama_barang: 'n', harga_aud: h, qty: q, markup_persen: m } });
    sama(r.status, 201, `harga ${h} qty ${q} markup ${m}: ${r.teks.slice(0, 150)}`);
  }
  for (const n of [1, 1000000000000]) sama((await admin.req('POST', `${b}/pembayaran`, { body: { nominal: n, tanggal: '2026-10-28' } })).status, 201, `nominal ${n}`);
});
await cek('SEC-M4', 'Nama wajib tidak boleh hanya berisi spasi Unicode / karakter tak terlihat (NBSP, U+3000, U+200B)', async () => {
  const lolos = [];
  for (const [label, v] of [['NBSP', '\u00A0'], ['spasi ideografis', '\u3000'], ['zero-width space', '\u200B'], ['NBSP+ZWSP', '\u00A0\u200B\u00A0']]) {
    const r1 = await admin.req('POST', '/customer', { body: { nama: v, no_wa: noWaUnik() } });
    const r2 = await admin.req('POST', '/open-po', { body: { nama: v, kurs: kursManual(10000) } });
    const r3 = await admin.req('POST', `${BASE}/baris-pesanan`, { body: { nama_barang: v, harga_aud: '1', qty: 1, markup_persen: '0' } });
    for (const [f, r] of [['customer.nama', r1], ['open_po.nama', r2], ['nama_barang', r3]]) if (r.status !== 422) lolos.push(`${f} = ${label} -> ${r.status}`);
  }
  harap(!lolos.length, `Diterima server (tampil kosong di layar/rekap):\n${lolos.join('\n')}`);
});
await cek('SEC-M5', 'Unicode/emoji/RTL di nama tersimpan utuh (round trip) dan pencarian tidak error', async () => {
  const nama = 'Rina 😀👩‍👩‍👧 ‏مرحبا‏ 名字 e\u0301';
  const c = await admin.ok('POST', '/customer', { nama, no_wa: noWaUnik(), alamat: 'Jl. 🌸\nBaris 2' });
  const g = await admin.ok('GET', `/customer/${c.id}`);
  sama([g.nama, g.alamat], [nama, 'Jl. 🌸\nBaris 2']);
  const r = await admin.req('GET', `/customer?q=${encodeURIComponent('😀👩')}`);
  harap(r.status === 200 && r.json.data.some((x) => x.id === c.id), `cari emoji -> ${r.status} ${r.json?.meta?.total}`);
});

if (QA_TARGET === 'dev') {
  bagian('L. Mode produksi (php -S dengan APP_ENV=production)');
  const serverProduksi = async (env, port) => {
    const p = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', '/projects/sandbox/backend/public', '/projects/sandbox/backend/public/index.php'], {
      env: { ...process.env, ...env }, stdio: 'ignore',
    });
    for (let i = 0; i < 40; i++) {
      try { await fetch(`http://127.0.0.1:${port}/api/v1/health`); break; } catch { await tidur(100); }
    }
    return p;
  };
  resetPercobaanLogin();
  await cek('SEC-L1', 'Produksi: cookie __Host-jastip_sesi; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict; Secure, logout Max-Age=0 dengan atribut sama', async () => {
    const srv = await serverProduksi({ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'true', APP_ALLOWED_ORIGINS: 'https://jastip.example' }, 8095);
    try {
      const k = new Klien('http://127.0.0.1:8095');
      const r = await k.req('POST', '/auth/login', { body: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD }, headers: { Origin: 'https://jastip.example' } });
      sama(r.status, 200, 'login');
      const sc = r.setCookie.join(' | ');
      harap(/^__Host-jastip_sesi=[0-9a-f]{64}; Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict; Secure$/.test(sc), sc);
      rahasia.token.push(k.cookie.split('=')[1]);
      const r2 = await k.req('POST', '/open-po', { body: {}, headers: { Origin: ORIGIN } });
      sama(r2.status, 403, 'origin http lokal ditolak di produksi');
      const r3 = await k.req('GET', '/auth/sesi', { cookie: k.cookie.replace('__Host-', '') });
      sama(r3.status, 401, 'nama cookie tanpa awalan __Host- tidak dipakai di produksi');
      const r4 = await k.req('POST', '/auth/logout', { headers: { Origin: 'https://jastip.example' } });
      harap(r4.status === 204 && /^__Host-jastip_sesi=; Path=\/; Max-Age=0; HttpOnly; SameSite=Strict; Secure$/.test(r4.setCookie.join('')), `${r4.status} ${r4.setCookie}`);
      return sc.replace(/=[0-9a-f]{64}/, '=<token>');
    } finally { srv.kill(); }
  });
  await cek('SEC-L2', 'Produksi menolak start jika cookie tidak Secure atau origin bukan https (500 generik tanpa detail)', async () => {
    const hasil = [];
    for (const [env, port] of [[{ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'false', APP_ALLOWED_ORIGINS: 'https://a.example' }, 8096],
      [{ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'true', APP_ALLOWED_ORIGINS: 'https://a.example,http://b.example' }, 8097]]) {
      const srv = await serverProduksi(env, port);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
        const t = await r.text();
        hasil.push(r.status);
        sama([r.status, JSON.parse(t)], [500, { error: { kode: 'KESALAHAN_SERVER', pesan: 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.' } }], JSON.stringify(env));
      } finally { srv.kill(); }
    }
    return hasil.join(', ');
  });
  await cek('SEC-L3', 'Produksi: database mati → health 503 dan request bersesi 500/503 generik, tanpa detail koneksi', async () => {
    const srv = await serverProduksi({ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'true', APP_ALLOWED_ORIGINS: 'https://jastip.example', DB_PORT: '3999' }, 8098);
    try {
      const r = await fetch('http://127.0.0.1:8098/api/v1/health');
      const t = await r.text();
      harap(r.status === 503 && !/3999|127\.0\.0\.1|SQLSTATE|refused/i.test(t), `${r.status} ${t}`);
      const r2 = await fetch('http://127.0.0.1:8098/api/v1/open-po', { headers: { Cookie: `__Host-jastip_sesi=${'c'.repeat(64)}` } });
      const t2 = await r2.text();
      harap(r2.status >= 500 && !/3999|SQLSTATE|refused|PDO|\.php/i.test(t2), `${r2.status} ${t2}`);
      return `health ${r.status}; /open-po bersesi ${r2.status} ${t2.slice(0, 100)}`;
    } finally { srv.kill(); }
  });
}

bagian('J3. Isi log aplikasi');
await cek('SEC-J3', 'Log aplikasi tidak memuat kata sandi, token sesi, atau nama customer', async () => {
  const f = process.env.QA_LOG_PATH ?? process.env.LOG_PATH;
  if (!f || !existsSync(f)) return `dilewati: log tidak ditemukan (${f})`;
  const log = readFileSync(f, 'utf8');
  const bocor = [];
  for (const [jenis, list] of Object.entries(rahasia)) for (const v of list) if (v && log.includes(v)) bocor.push(`${jenis}: ${v.slice(0, 12)}…`);
  harap(!bocor.length, bocor.join('\n'));
  return `${log.split('\n').length - 1} baris log diperiksa`;
});

resetPercobaanLogin();
process.exit(selesai('keamanan'));
