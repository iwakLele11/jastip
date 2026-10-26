// Uji keamanan API dan pengiriman form (target: aplikasi lokal di sandbox, APP_URL).
// Dijalankan di dalam .tools/dev-stack.sh (lihat qa/run.sh). Hasil: qa/hasil/keamanan.json
import { spawn } from 'node:child_process';
import {
  ADMIN_PASSWORD, ADMIN_USER, APP_URL, KURS_OTOMATIS, Klien, ORIGIN, PHP, buatAdmin, noWaUnik, sql,
} from '../lib/klien.mjs';
import { bagian, cek, harap, sama, selesai } from '../lib/uji.mjs';

const admin = new Klien();
await admin.login();

// Data dasar untuk endpoint ber-ID.
const po = await admin.ok('POST', '/open-po', { nama: 'QA keamanan', kurs: KURS_OTOMATIS });
const cust = await admin.ok('POST', '/customer', { nama: 'QA Keamanan', no_wa: noWaUnik() });
const kr = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'Barang X', harga_aud: '10', qty: 1, markup_persen: '10' });
const idBaris = kr.barang[0].id;
const krBayar = await admin.ok('POST', `/open-po/${po.id}/keranjang/${cust.id}/pembayaran`, { nominal: 1000, tanggal: '2026-10-28' });
const idBayar = krBayar.riwayat[0].id;

const ENDPOINT = [
  ['GET', '/auth/sesi'], ['POST', '/auth/logout'],
  ['GET', '/pengaturan'], ['PATCH', '/pengaturan'],
  ['GET', '/kurs/aud-idr'],
  ['GET', '/open-po'], ['POST', '/open-po'], ['GET', `/open-po/${po.id}`], ['PATCH', `/open-po/${po.id}`],
  ['GET', '/customer'], ['POST', '/customer'], ['GET', '/customer/cek-no-wa?no_wa=081234567890'],
  ['GET', `/customer/${cust.id}`], ['PATCH', `/customer/${cust.id}`], ['DELETE', `/customer/${cust.id}`],
  ['POST', `/customer/${cust.id}/arsip`],
  ['GET', `/open-po/${po.id}/customer`], ['GET', `/open-po/${po.id}/barang-unik`],
  ['GET', `/open-po/${po.id}/keranjang/${cust.id}`],
  ['POST', `/open-po/${po.id}/keranjang/${cust.id}/baris-pesanan`],
  ['PATCH', `/baris-pesanan/${idBaris}`], ['DELETE', `/baris-pesanan/${idBaris}`],
  ['POST', `/baris-pesanan/${idBaris}/kosong`], ['DELETE', `/baris-pesanan/${idBaris}/kosong`],
  ['POST', `/open-po/${po.id}/keranjang/${cust.id}/pembayaran`], ['DELETE', `/pembayaran/${idBayar}`],
  ['POST', `/open-po/${po.id}/keranjang/${cust.id}/pengembalian-dana`], ['DELETE', '/pengembalian-dana/1'],
  ['GET', `/open-po/${po.id}/keranjang/${cust.id}/rekap`],
];

bagian('A. Akses tanpa login');
const anon = new Klien();
await cek('SEC-A1', `Semua ${ENDPOINT.length} endpoint selain login/health menolak tanpa sesi (401 BELUM_MASUK)`, async () => {
  const salah = [];
  for (const [m, p] of ENDPOINT) {
    const r = await anon.req(m, p, { body: {} });
    if (r.status !== 401 || r.json?.error?.kode !== 'BELUM_MASUK') salah.push(`${m} ${p} -> ${r.status} ${r.json?.error?.kode}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-A2', 'Token palsu (cookie acak, Bearer acak, Bearer rusak) ditolak 401', async () => {
  const salah = [];
  const variasi = [
    { cookie: `jastip_sesi=${'a'.repeat(64)}` },
    { cookie: 'jastip_sesi=../../etc/passwd' },
    { headers: { Authorization: `Bearer ${'0'.repeat(64)}` } },
    { headers: { Authorization: 'Bearer' } },
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
await cek('SEC-B1', 'Cookie lokal: HttpOnly; SameSite=Strict; Path=/; Max-Age=43200 (tanpa Secure karena http lokal)', async () => {
  const k = new Klien();
  const r = await k.login();
  const sc = r.setCookie.join(' | ');
  for (const a of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) harap(sc.includes(a), `atribut ${a} tidak ada: ${sc}`);
  harap(!/Domain=/i.test(sc), `cookie memakai Domain: ${sc}`);
  harap(!JSON.stringify(r.json).match(/[0-9a-f]{64}/), 'token sesi ikut di body login web');
  return sc.replace(/=[0-9a-f]{64}/, '=<token>');
});
await cek('SEC-B2', 'Token sesi 64 hex acak dan berbeda per login', async () => {
  const a = new Klien(); await a.login();
  const b = new Klien(); await b.login();
  harap(/^jastip_sesi=[0-9a-f]{64}$/.test(a.cookie), a.cookie);
  harap(a.cookie !== b.cookie, 'token sama');
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
});
await cek('SEC-C2', 'Logout token mobile (Bearer) mengakhiri token itu', async () => {
  const k = new Klien();
  const r = await k.login(ADMIN_USER, ADMIN_PASSWORD, { klien: 'mobile' });
  const tok = r.json.data.token;
  harap(/^[0-9a-f]{64}$/.test(tok), 'token mobile tidak ada');
  harap(r.setCookie.length === 0, 'login mobile tetap mengirim cookie');
  const h = { headers: { Authorization: `Bearer ${tok}` }, cookie: null };
  sama((await k.req('GET', '/auth/sesi', h)).status, 200, 'sebelum logout');
  sama((await k.req('POST', '/auth/logout', h)).status, 204, 'logout');
  sama((await k.req('GET', '/auth/sesi', h)).status, 401, 'sesudah logout');
});
await cek('SEC-C3', 'Sesi berakhir setelah 12 jam tidak aktif (721 menit → 401 SESI_BERAKHIR; 719 menit → masih aktif)', async () => {
  const a = new Klien(); await a.login();
  const b = new Klien(); await b.login();
  const hashA = a.cookie.split('=')[1];
  const hashB = b.cookie.split('=')[1];
  sql(`UPDATE sesi_login SET terakhir_aktif_at = UTC_TIMESTAMP() - INTERVAL 721 MINUTE WHERE token_hash = SHA2('${hashA}', 256);`
    + ` UPDATE sesi_login SET terakhir_aktif_at = UTC_TIMESTAMP() - INTERVAL 719 MINUTE WHERE token_hash = SHA2('${hashB}', 256);`);
  const ra = await a.req('GET', '/open-po');
  sama([ra.status, ra.json?.error?.kode], [401, 'SESI_BERAKHIR'], '721 menit');
  const rb = await b.req('GET', '/open-po');
  sama(rb.status, 200, '719 menit');
  harap(rb.setCookie.some((c) => /Max-Age=43200/.test(c)), 'cookie tidak diperpanjang (sliding)');
});

bagian('D. Login: batas percobaan dan pesan');
const QA_USER = 'qathrottle';
const QA_PASS = 'qa-throttle-sandi-123';
buatAdmin(QA_USER, QA_PASS);
await cek('SEC-D1', 'Pesan login gagal sama untuk pengguna tidak ada dan kata sandi salah', async () => {
  const k = new Klien();
  const r1 = await k.login('tidak-ada-orangnya', 'salah-salah-salah');
  const r2 = await k.login('qaumum', 'salah-salah-salah');
  sama([r1.status, r1.json], [401, { error: { kode: 'LOGIN_GAGAL', pesan: 'Nama pengguna atau kata sandi salah.' } }], 'pengguna tidak ada');
  sama(r2.json, r1.json, 'body sama');
});
await cek('SEC-D2', 'Waktu respons pengguna tidak ada ≈ pengguna ada (anti enumerasi)', async () => {
  buatAdmin('qawaktu', 'qa-waktu-sandi-123');
  const k = new Klien();
  const ukur = async (u) => {
    const t = [];
    for (let i = 0; i < 4; i++) t.push((await k.login(u, `salah-${i}-xxxxxxxx`)).ms);
    t.sort((x, y) => x - y);
    return t[1];
  };
  const ada = await ukur('qawaktu');
  const tidak = await ukur('qa-tidak-ada-xyz');
  harap(Math.abs(ada - tidak) < Math.max(80, ada * 0.5), `median ada ${ada.toFixed(0)} ms vs tidak ada ${tidak.toFixed(0)} ms`);
  return `ada ${ada.toFixed(0)} ms, tidak ada ${tidak.toFixed(0)} ms`;
});
await cek('SEC-D3', '5 gagal → percobaan ke-6 (sandi benar) ditolak 429 + Retry-After', async () => {
  const k = new Klien();
  for (let i = 0; i < 5; i++) sama((await k.login(QA_USER, `salah-${i}-xxxxxxxx`)).status, 401, `gagal ke-${i + 1}`);
  const r = await k.login(QA_USER, QA_PASS);
  sama([r.status, r.json?.error?.kode], [429, 'TERLALU_BANYAK_PERCOBAAN']);
  const ra = Number(r.headers.get('retry-after'));
  harap(ra > 800 && ra <= 900, `Retry-After ${ra}`);
  return r.json.error.pesan;
});
await cek('SEC-D4', 'Blokir berlaku untuk variasi huruf besar dan spasi (QATHROTTLE, " qathrottle ")', async () => {
  const k = new Klien();
  for (const u of ['QATHROTTLE', ' qathrottle ', 'QaThRoTtLe']) {
    const r = await k.login(u, QA_PASS);
    sama(r.status, 429, `"${u}"`);
  }
});
await cek('SEC-D5', 'Blokir tidak bisa dilewati dengan variasi aksen/Unicode yang dianggap sama oleh collation DB', async () => {
  const k = new Klien();
  const lolos = [];
  for (const u of ['qáthrottle', 'qathröttle', 'ｑａｔｈｒｏｔｔｌｅ', 'qathrottle\u00AD']) {
    const r = await k.login(u, QA_PASS);
    if (r.status === 200) lolos.push(`"${u}" (${[...u].map((c) => c.codePointAt(0).toString(16)).join(' ')}) -> 200, login BERHASIL saat akun terkunci`);
  }
  harap(!lolos.length, lolos.join('\n'));
});
await cek('SEC-D6', 'Percobaan sandi dengan variasi nama pengguna dihitung terpisah (brute force > 5 kali / 15 menit)', async () => {
  buatAdmin('qabrute', 'qa-brute-sandi-12345');
  const k = new Klien();
  const variasi = ['qabrute', 'qábrute', 'qàbrute', 'qâbrute', 'qäbrute', 'qãbrute', 'qåbrute', 'qābrute'];
  let ditolak429 = 0;
  let dicoba = 0;
  for (const u of variasi) {
    for (let i = 0; i < 5; i++) {
      const r = await k.login(u, `tebakan-${u}-${i}`);
      dicoba++;
      if (r.status === 429) ditolak429++;
    }
  }
  const akhir = await k.login('qăbrute', 'qa-brute-sandi-12345');
  harap(dicoba - ditolak429 <= 5 && akhir.status !== 200,
    `${dicoba} tebakan sandi untuk akun "qabrute" dalam 1 jendela 15 menit, hanya ${ditolak429} ditolak 429 `
    + `(${dicoba - ditolak429} benar-benar diperiksa). Login dengan sandi benar sesudahnya ("qăbrute") -> ${akhir.status}`);
});
await cek('SEC-D7', 'Validasi login: field kosong 422 dengan pesan per field; tipe salah ditolak', async () => {
  const k = new Klien();
  const r = await k.req('POST', '/auth/login', { body: {} });
  sama([r.status, r.json?.error?.field], [422, { nama_pengguna: 'Isi nama pengguna.', kata_sandi: 'Isi kata sandi.' }]);
  const r2 = await k.req('POST', '/auth/login', { body: { nama_pengguna: ['pemilik'], kata_sandi: 123 } });
  harap(r2.status === 422 || r2.status === 401, `tipe salah -> ${r2.status}`);
  const r3 = await k.req('POST', '/auth/login', { body: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD, klien: 'evil' } });
  sama(r3.status, 422, 'klien tidak dikenal');
});

bagian('E. CSRF');
await cek('SEC-E1', 'POST/PATCH/DELETE dengan Origin asing → 403 ORIGIN_DITOLAK (termasuk login)', async () => {
  const salah = [];
  const origins = ['http://evil.example', 'null', `${ORIGIN}.evil.example`, 'http://localhost:8091', 'https://127.0.0.1:8090'];
  for (const o of origins) {
    for (const [m, p] of [['POST', '/open-po'], ['PATCH', '/pengaturan'], ['DELETE', `/pembayaran/${idBayar}`], ['POST', '/auth/login']]) {
      const r = await admin.req(m, p, { headers: { Origin: o }, body: {} });
      if (r.status !== 403 || r.json?.error?.kode !== 'ORIGIN_DITOLAK') salah.push(`${o} ${m} ${p} -> ${r.status}`);
    }
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-E2', 'Content-Type form/text/multipart → 415 (form HTML lintas situs tidak bisa mengubah data)', async () => {
  const salah = [];
  for (const ct of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x', 'application/json-patch+json', 'text/json']) {
    const r = await admin.req('POST', `/open-po/${po.id}/keranjang/${cust.id}/pembayaran`, {
      headers: { 'Content-Type': ct }, raw: JSON.stringify({ nominal: 5000, tanggal: '2026-10-28' }), origin: false,
    });
    if (r.status !== 415) salah.push(`${ct} -> ${r.status}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-E3', 'Method override (X-HTTP-Method-Override, _method) tidak didukung', async () => {
  const r1 = await admin.req('POST', `/pembayaran/${idBayar}`, { headers: { 'X-HTTP-Method-Override': 'DELETE' } });
  const r2 = await admin.req('POST', `/pembayaran/${idBayar}?_method=DELETE`);
  const r3 = await admin.req('GET', `/pembayaran/${idBayar}?_method=DELETE`);
  sama([r1.status, r2.status, r3.status], [405, 405, 405]);
  sama(r1.headers.get('allow'), 'DELETE', 'header Allow');
  const k = await admin.ok('GET', `/open-po/${po.id}/keranjang/${cust.id}`);
  harap(k.riwayat.some((x) => x.id === idBayar), 'pembayaran terhapus lewat override');
});
await cek('SEC-E4', 'Tanpa CORS: preflight OPTIONS dan GET lintas origin tidak memberi Access-Control-Allow-Origin', async () => {
  const r1 = await admin.req('OPTIONS', '/open-po', { headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' } });
  const r2 = await admin.req('GET', '/open-po', { headers: { Origin: 'http://evil.example' } });
  harap(!r1.headers.get('access-control-allow-origin') && !r2.headers.get('access-control-allow-origin'), 'ACAO ada');
  return `OPTIONS -> ${r1.status}`;
});

bagian('F. SQL injection dan parameter aneh');
await cek('SEC-F1', 'Pencarian customer dengan payload SQL/LIKE tidak error dan tidak mengembalikan semua data', async () => {
  await admin.ok('POST', '/customer', { nama: 'Zeta Unik', no_wa: noWaUnik() });
  const salah = [];
  for (const q of ["' OR 1=1 -- ", "' OR '1'='1", '%', '_', '%%', '!', '\\', "'; DROP TABLE customer; --", '" OR ""="', '1) OR (1=1', 'Zeta%']) {
    const r = await admin.req('GET', `/customer?q=${encodeURIComponent(q)}`);
    if (r.status !== 200) salah.push(`q=${q} -> ${r.status}`);
    else if (r.json.meta.total > 0 && !(q === 'Zeta%' ? false : r.json.data.every((c) => c.nama.includes(q)))) salah.push(`q=${q} -> ${r.json.meta.total} hasil (${r.json.data.slice(0, 3).map((c) => c.nama).join(', ')})`);
  }
  const masih = await admin.ok('GET', '/customer?q=Zeta');
  harap(masih.length >= 1, 'tabel customer hilang?');
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-F2', 'Parameter query tipe/isi aneh → 422/404, tidak pernah 500', async () => {
  const kasus = [
    '/customer?q[]=a', '/customer?urut=nama;DROP', '/customer?urut[]=nama', '/customer?halaman=1%20OR%201=1',
    '/customer?halaman=0', '/customer?per_halaman=101', '/customer?per_halaman=1e2', '/customer?halaman=99999999999999999999',
    '/customer?open_po_id=abc', '/customer?open_po_id[]=1', '/customer?q=' + 'x'.repeat(101),
    '/customer/cek-no-wa', '/customer/cek-no-wa?no_wa[]=1', '/customer/cek-no-wa?no_wa=0812&kecuali_id=abc',
    `/open-po?status=buka'%20OR%20'1'='1`, '/open-po?status[]=buka', `/open-po/${po.id}/customer?status=lunas'--`,
    `/open-po/${po.id}/customer?status[]=lunas`, '/open-po/1%20OR%201=1', '/open-po/0', '/open-po/-1', '/open-po/abc',
    '/open-po/999999999999999999', '/open-po/4294967296', `/open-po/${po.id}/keranjang/999999999999999999`,
    `/open-po/999999999999999999/keranjang/${cust.id}/rekap`, '/baris-pesanan/4294967297', '/open-po/1.5',
  ];
  const lima = [];
  const hasil = [];
  for (const p of kasus) {
    const r = await admin.req('GET', p);
    hasil.push(`${p} -> ${r.status}`);
    if (r.status >= 500) lima.push(`${p} -> ${r.status} ${r.teks.slice(0, 120)}`);
  }
  harap(!lima.length, lima.join('\n'));
  return `selain 404/422: ${hasil.filter((h) => !/-> (404|422)$/.test(h)).join('; ')}`;
});
await cek('SEC-F3', 'Aksi tulis dengan ID di luar rentang INT → 404, bukan 500', async () => {
  const salah = [];
  const big = '999999999999999999';
  for (const [m, p, b] of [
    ['POST', `/open-po/${po.id}/keranjang/${big}/pembayaran`, { nominal: 1000, tanggal: '2026-10-28' }],
    ['POST', `/open-po/${big}/keranjang/${cust.id}/baris-pesanan`, { nama_barang: 'x', harga_aud: '1', qty: 1, markup_persen: '0' }],
    ['POST', `/open-po/${po.id}/keranjang/${big}/pengembalian-dana`, { nominal: 1000, tanggal: '2026-10-28' }],
    ['DELETE', `/pembayaran/${big}`], ['DELETE', `/pengembalian-dana/${big}`], ['PATCH', `/baris-pesanan/${big}`, {}],
    ['POST', `/customer/${big}/arsip`], ['DELETE', `/customer/${big}`], ['PATCH', `/open-po/${big}`, { nama: 'x' }],
  ]) {
    const r = await admin.req(m, p, { body: b });
    if (r.status !== 404 && r.status !== 409) salah.push(`${m} ${p} -> ${r.status} ${r.teks.slice(0, 150)}`);
  }
  harap(!salah.length, salah.join('\n'));
});
await cek('SEC-F4', 'Payload SQL di field tersimpan apa adanya (prepared statement)', async () => {
  const nama = "Robert'); DROP TABLE customer;--";
  const c = await admin.ok('POST', '/customer', { nama, no_wa: noWaUnik(), alamat: "1' OR '1'='1" });
  const g = await admin.ok('GET', `/customer/${c.id}`);
  sama([g.nama, g.alamat], [nama, "1' OR '1'='1"]);
});

bagian('G. Body dan JSON');
await cek('SEC-G1', 'Body > 64 KB → 413; JSON rusak/array/terlalu dalam → 400', async () => {
  const big = await admin.req('POST', '/customer', { raw: JSON.stringify({ nama: 'x'.repeat(70000), no_wa: '081234567890' }), headers: { 'Content-Type': 'application/json' } });
  sama(big.status, 413, 'body besar');
  const rusak = await admin.req('POST', '/customer', { raw: '{"nama":', headers: { 'Content-Type': 'application/json' } });
  const arr = await admin.req('POST', '/customer', { raw: '[1,2]', headers: { 'Content-Type': 'application/json' } });
  const dalam = await admin.req('POST', '/customer', { raw: '{"a":' + '['.repeat(40) + ']'.repeat(40) + '}', headers: { 'Content-Type': 'application/json' } });
  sama([rusak.status, arr.status, dalam.status], [400, 400, 400]);
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
  return 'Server tidak menolak duplikat (sesuai kontrak: pencegahan hanya di UI). Lihat uji UI QA-UI double submit.';
});
await cek('SEC-H2', 'Pengembalian dana bersamaan tidak bisa melebihi kelebihan bayar (kunci baris)', async () => {
  const c = await admin.ok('POST', '/customer', { nama: 'QA Refund Paralel', no_wa: noWaUnik() });
  await admin.ok('POST', `/open-po/${po.id}/keranjang/${c.id}/pembayaran`, { nominal: 100000, tanggal: '2026-10-28' });
  const rs = await Promise.all(Array.from({ length: 4 }, () => admin.req('POST', `/open-po/${po.id}/keranjang/${c.id}/pengembalian-dana`, { body: { nominal: 60000, tanggal: '2026-10-29' } })));
  const ok = rs.filter((r) => r.status === 201).length;
  const k = await admin.ok('GET', `/open-po/${po.id}/keranjang/${c.id}`);
  harap(ok === 1 && k.ringkasan.total_pengembalian === 60000, `${ok} sukses, total pengembalian ${k.ringkasan.total_pengembalian}; status ${rs.map((r) => r.status)}`);
});
await cek('SEC-H3', 'Hapus pembayaran bersamaan dengan catat pengembalian tidak membuat dana diterima negatif', async () => {
  const c = await admin.ok('POST', '/customer', { nama: 'QA Hapus Paralel', no_wa: noWaUnik() });
  const k1 = await admin.ok('POST', `/open-po/${po.id}/keranjang/${c.id}/pembayaran`, { nominal: 50000, tanggal: '2026-10-28' });
  const id = k1.riwayat[0].id;
  const [a, b] = await Promise.all([
    admin.req('POST', `/open-po/${po.id}/keranjang/${c.id}/pengembalian-dana`, { body: { nominal: 50000, tanggal: '2026-10-29' } }),
    admin.req('DELETE', `/pembayaran/${id}`),
  ]);
  const k = await admin.ok('GET', `/open-po/${po.id}/keranjang/${c.id}`);
  harap(k.ringkasan.dana_diterima >= 0 && k.ringkasan.total_pembayaran >= k.ringkasan.total_pengembalian,
    `refund ${a.status}, hapus ${b.status}, ringkasan ${JSON.stringify(k.ringkasan)}`);
  return `refund ${a.status}, hapus ${b.status}`;
});

bagian('I. Header keamanan HTTP');
const htmlRes = await fetch(`${APP_URL}/index.html`);
const apiRes = await fetch(`${APP_URL}/api/v1/health`);
await cek('SEC-I1', 'API: X-Content-Type-Options nosniff, Cache-Control no-store, Referrer-Policy, Content-Type JSON', async () => {
  sama([apiRes.headers.get('x-content-type-options'), apiRes.headers.get('cache-control'), apiRes.headers.get('referrer-policy')], ['nosniff', 'no-store', 'no-referrer']);
  harap(/^application\/json/.test(apiRes.headers.get('content-type')), apiRes.headers.get('content-type'));
});
await cek('SEC-I2', 'API tidak mengirim X-Powered-By (versi PHP)', async () => {
  const xp = apiRes.headers.get('x-powered-by');
  harap(!xp, `X-Powered-By: ${xp}`);
});
await cek('SEC-I3', 'HTML: CSP (meta) default-src self tanpa inline script', async () => {
  const t = await (await fetch(`${APP_URL}/index.html`)).text();
  const m = t.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  harap(m && /default-src 'self'/.test(m[1]) && !/unsafe-inline|unsafe-eval/.test(m[1]), m?.[1] ?? 'CSP tidak ada');
  return m[1];
});
await cek('SEC-I4', 'HTML: perlindungan clickjacking (X-Frame-Options / CSP frame-ancestors di header HTTP)', async () => {
  const xfo = htmlRes.headers.get('x-frame-options');
  const csp = htmlRes.headers.get('content-security-policy');
  harap(xfo || /frame-ancestors/.test(csp ?? ''), `tidak ada X-Frame-Options maupun header CSP frame-ancestors (meta CSP tidak bisa memuat frame-ancestors). Header: ${[...htmlRes.headers.keys()].join(', ')}`);
});
await cek('SEC-I5', 'HTML: X-Content-Type-Options dan Referrer-Policy di header HTTP', async () => {
  harap(htmlRes.headers.get('x-content-type-options') === 'nosniff' && htmlRes.headers.get('referrer-policy'),
    `nosniff=${htmlRes.headers.get('x-content-type-options')}, referrer-policy=${htmlRes.headers.get('referrer-policy')}`);
});

bagian('J. Kebocoran detail error');
await cek('SEC-J1', 'Error 404/405/415/422 tidak memuat path file, SQL, atau stack trace', async () => {
  const rs = await Promise.all([
    admin.req('GET', '/tidak-ada'), admin.req('PUT', '/open-po'), admin.req('POST', '/open-po', { raw: 'x', headers: { 'Content-Type': 'text/plain' } }),
    admin.req('POST', '/open-po', { body: { nama: 1, kurs: 'x' } }), admin.req('POST', '/customer', { raw: '{bad', headers: { 'Content-Type': 'application/json' } }),
  ]);
  const bocor = rs.filter((r) => /\/projects|\.php|SQLSTATE|Stack|#0 |PDO/i.test(r.teks));
  harap(!bocor.length, bocor.map((r) => r.teks).join('\n'));
  return rs.map((r) => r.status).join(', ');
});

bagian('K. File sensitif lewat web (dev server)');
await cek('SEC-K1', 'File sensitif tidak bisa diakses dari web server lokal', async () => {
  const salah = [];
  for (const p of ['/.env', '/composer.json', '/composer.lock', '/vendor/autoload.php', '/.htaccess', '/backend/.env', '/../backend/.env',
    '/%2e%2e/backend/.env', '/api/../../backend/.env', '/.git/config', '/storage/logs/app.log', '/package.json', '/src/js/lib/api.js', '/phpunit.xml.dist']) {
    const r = await fetch(`${APP_URL}${p}`);
    const t = await r.text();
    if (r.status === 200 && !/<!doctype html>/i.test(t.slice(0, 50))) salah.push(`${p} -> 200 (${t.slice(0, 60).replace(/\s+/g, ' ')})`);
  }
  harap(!salah.length, salah.join('\n'));
});

bagian('L. Mode produksi (php -S dengan APP_ENV=production)');
async function serverProduksi(env, port) {
  const p = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', '/projects/sandbox/backend/public', '/projects/sandbox/backend/public/index.php'], {
    env: { ...process.env, ...env }, stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${port}/api/v1/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  return p;
}
await cek('SEC-L1', 'Produksi: cookie __Host-jastip_sesi dengan Secure; HttpOnly; SameSite=Strict', async () => {
  const srv = await serverProduksi({ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'true', APP_ALLOWED_ORIGINS: 'https://jastip.example' }, 8095);
  try {
    const k = new Klien('http://127.0.0.1:8095');
    const r = await k.req('POST', '/auth/login', { body: { nama_pengguna: ADMIN_USER, kata_sandi: ADMIN_PASSWORD }, headers: { Origin: 'https://jastip.example' } });
    sama(r.status, 200, 'login');
    const sc = r.setCookie.join(' | ');
    harap(/^__Host-jastip_sesi=[0-9a-f]{64}; Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict; Secure$/.test(sc), sc);
    const r2 = await k.req('POST', '/open-po', { body: {}, headers: { Origin: ORIGIN } });
    sama(r2.status, 403, 'origin http lokal ditolak di produksi');
    return sc.replace(/=[0-9a-f]{64}/, '=<token>');
  } finally { srv.kill(); }
});
await cek('SEC-L2', 'Produksi menolak start jika cookie tidak Secure atau origin bukan https (500 generik tanpa detail)', async () => {
  const hasil = [];
  for (const [env, port] of [[{ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'false', APP_ALLOWED_ORIGINS: 'https://a.example' }, 8096],
    [{ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'true', APP_ALLOWED_ORIGINS: 'http://a.example' }, 8097]]) {
    const srv = await serverProduksi(env, port);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      const t = await r.text();
      hasil.push(r.status);
      harap(r.status === 500 && !/SESSION|ORIGIN|https|Secure/i.test(t), `${r.status} ${t}`);
    } finally { srv.kill(); }
  }
  return hasil.join(', ');
});
await cek('SEC-L3', 'Produksi: database tidak bisa dihubungi → health 503 tanpa detail koneksi', async () => {
  const srv = await serverProduksi({ APP_ENV: 'production', SESSION_COOKIE_SECURE: 'true', APP_ALLOWED_ORIGINS: 'https://jastip.example', DB_PORT: '3999' }, 8098);
  try {
    const r = await fetch('http://127.0.0.1:8098/api/v1/health');
    const t = await r.text();
    harap(r.status === 503 && !/3999|127\.0\.0\.1|SQLSTATE|refused/i.test(t), `${r.status} ${t}`);
    const r2 = await fetch('http://127.0.0.1:8098/api/v1/open-po');
    const t2 = await r2.text();
    harap(!/3999|SQLSTATE|refused|PDO/i.test(t2), `${r2.status} ${t2}`);
    return `health ${r.status}; /open-po ${r2.status} ${t2.slice(0, 100)}`;
  } finally { srv.kill(); }
});

process.exit(selesai('keamanan'));
