// Form buat / ubah Open PO (ui-spec §6.3, §7.3): kurs otomatis, manual, gagal diambil,
// terkunci, dan konflik 409 KURS_TERKUNCI. Kurs jastip otomatis selalu dihitung API.
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { $$, h, isi, wajib } from '../lib/dom.js';
import { formatKursJastip, formatPersen } from '../lib/format.js';
import { ikon } from '../lib/ikon.js';
import { parseRupiah } from '../lib/parse.js';
import { idDariQuery, rute } from '../lib/rute.js';
import { setErrorField, terapkanError } from '../ui/field.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { KELAS } from '../ui/kelas.js';
import { badgeTerkunci, emptyState, setBanner, skeletonField, tombolMemuat } from '../ui/komponen.js';
import { TEKS_TERKUNCI, teksBuffer, teksKursPasar } from '../ui/kurs.js';

mulaiHalaman();

const KURS_WAJIB = 'Kurs wajib diisi. Ambil kurs otomatis atau isi manual.';
const KURS_GAGAL = 'Kurs otomatis gagal diambil. Isi kurs manual, atau coba lagi.';
const MAX_KURS = 1_000_000n;

const form = wajib('#form-po');
const judul = wajib('#judul');
const inputNama = wajib('#nama');
const grupStatus = wajib('#status-grup');
const grupKurs = wajib('#kurs-grup');
const kursBanner = wajib('#kurs-banner');
const panelOtomatis = wajib('#panel-otomatis');
const isiOtomatis = wajib('#kurs-otomatis-isi');
const tombolAmbil = wajib('#ambil-kurs');
const panelManual = wajib('#panel-manual');
const inputManual = wajib('#kurs-manual');
const bagianTerkunci = wajib('#kurs-terkunci');
const bannerForm = wajib('[data-banner-form]');
const tombolSimpan = wajib('#tombol-simpan');
const memuat = wajib('#memuat');
const radioMode = $$('input[name="kurs_mode"]', form);
const radioStatus = $$('input[name="status"]', form);

const paramId = new URLSearchParams(location.search).get('id');
const idPo = idDariQuery(paramId);
const modeUbah = paramId !== null;

/** Data kurs otomatis yang sedang ditampilkan. `dariPratinjau` = hasil GET /kurs/aud-idr di layar ini. */
const otomatis = { status: 'kosong', data: null, dariPratinjau: false };
let po = null; // objek Open PO (mode ubah)
let urutPermintaanKurs = 0;

const peta = {
  nama: inputNama,
  status: grupStatus,
  kurs: grupKurs,
  'kurs.mode': grupKurs,
  'kurs.kurs_pasar': grupKurs,
  'kurs.tanggal_kurs': grupKurs,
  'kurs.kurs_jastip': inputManual,
};

const modeKurs = () => radioMode.find((r) => r.checked)?.value ?? 'otomatis';

function setModeKurs(mode) {
  for (const r of radioMode) r.checked = r.value === mode;
  tampilkanPanel();
}

function tampilkanPanel() {
  const manual = modeKurs() === 'manual';
  panelOtomatis.hidden = manual;
  panelManual.hidden = !manual;
  setErrorField(grupKurs, null);
  if (manual && inputManual.value.trim() === '') {
    // Titik awal: nilai kurs jastip otomatis terakhir, kalau ada (ui-spec §6.3 langkah 4).
    const awal = otomatis.data?.kurs_jastip ?? po?.kurs.kurs_jastip;
    if (awal) inputManual.value = String(awal);
  }
}

function renderOtomatis() {
  if (otomatis.status === 'memuat') {
    isi(
      isiOtomatis,
      h(
        'div',
        { 'aria-busy': 'true', class: 'space-y-2' },
        h('p', { class: 'text-sm text-ink-muted', role: 'status' }, 'Mengambil kurs…'),
        h('span', { class: 'block h-8 w-3/5 rounded bg-kosong-bg motion-safe:animate-pulse' }),
        h('span', { class: 'block h-4 w-4/5 rounded bg-kosong-bg motion-safe:animate-pulse' }),
      ),
    );
    return;
  }
  if (otomatis.status !== 'ok') {
    isi(isiOtomatis);
    tombolAmbil.classList.remove('mt-3');
    return;
  }
  tombolAmbil.classList.add('mt-3');
  const k = otomatis.data;
  const pasar = teksKursPasar(k);
  isi(
    isiOtomatis,
    h('p', { class: 'text-sm text-ink-muted' }, 'Kurs jastip'),
    h('p', { class: 'text-2xl font-semibold tabular-nums', dataset: { kursJastip: k.kurs_jastip } }, formatKursJastip(k.kurs_jastip)),
    pasar ? h('p', { class: 'mt-1 text-sm text-ink-muted tabular-nums' }, `Kurs pasar ${pasar}`) : null,
    k.buffer_persen !== null && k.buffer_persen !== undefined
      ? h('p', { class: 'text-sm text-ink-muted' }, `+ buffer ${formatPersen(k.buffer_persen)}`)
      : null,
    k.sumber ? h('p', { class: 'text-sm text-ink-muted' }, `Sumber: ${k.sumber}`) : null,
  );
}

/** Mengambil pratinjau kurs otomatis. Gagal → banner + pindah ke Manual (ui-spec §6.3). */
async function ambilKurs({ pindahKeOtomatis = false } = {}) {
  const urut = ++urutPermintaanKurs;
  otomatis.status = 'memuat';
  renderOtomatis();
  const pulihkan = tombolMemuat(tombolAmbil, 'Mengambil kurs…');
  try {
    const { data } = await Api.kursAudIdr();
    if (urut !== urutPermintaanKurs) return;
    Object.assign(otomatis, { status: 'ok', data, dariPratinjau: true });
    setBanner(kursBanner, null);
    if (pindahKeOtomatis) setModeKurs('otomatis');
    else if (modeKurs() === 'manual' && inputManual.value.trim() === '') inputManual.value = String(data.kurs_jastip);
    setErrorField(grupKurs, null);
  } catch (err) {
    if (urut !== urutPermintaanKurs) return;
    catatJikaBug(err);
    Object.assign(otomatis, { status: 'gagal', data: null, dariPratinjau: false });
    const pesan = err instanceof ApiError && err.kode === 'KURS_GAGAL' ? err.pesan : KURS_GAGAL;
    setBanner(kursBanner, { jenis: 'warning', pesan, aksi: { label: 'Coba lagi', onClick: () => ambilKurs({ pindahKeOtomatis: true }) } });
    setModeKurs('manual');
  } finally {
    pulihkan();
    if (urut === urutPermintaanKurs) renderOtomatis();
  }
}

/** Kurs sebagai teks read-only + badge Terkunci (ui-spec §4.2 Read-only, §7.3). */
function renderTerkunci() {
  grupKurs.hidden = true;
  bagianTerkunci.hidden = false;
  const k = po.kurs;
  const pasar = teksKursPasar(k);
  isi(
    bagianTerkunci,
    h('div', { class: 'flex items-center justify-between gap-2' }, h('p', { id: 'kurs-terkunci-label', class: KELAS.label }, 'Kurs'), badgeTerkunci()),
    h('div', { id: 'kurs-terkunci-banner', hidden: true, class: 'mt-3' }),
    h('p', { class: 'mt-2 text-2xl font-semibold tabular-nums', dataset: { kursJastip: k.kurs_jastip } }, formatKursJastip(k.kurs_jastip)),
    h('p', { class: 'mt-1 text-sm text-ink-muted tabular-nums' }, pasar ? `Kurs pasar ${pasar}` : 'Kurs pasar tidak tersedia'),
    h('p', { class: 'text-sm text-ink-muted' }, teksBuffer(k, { denganMode: true })),
    h('p', { id: 'teks-terkunci', class: 'mt-2 text-sm text-ink-muted' }, TEKS_TERKUNCI),
    h(
      'button',
      { type: 'button', class: `${KELAS.tombolSecondary} mt-3 w-full md:w-auto`, 'aria-disabled': 'true', 'aria-describedby': 'teks-terkunci' },
      ikon('arrow-path', 24, 'size-5'),
      'Ambil kurs terbaru',
    ),
  );
}

function isiDariPo() {
  judul.textContent = 'Ubah Open PO';
  document.title = 'Ubah Open PO · Jastip Admin';
  tombolSimpan.textContent = 'Simpan perubahan';
  wajib('#tautan-kembali').href = rute.poDetail(po.id);
  inputNama.value = po.nama;
  grupStatus.hidden = false;
  for (const r of radioStatus) r.checked = r.value === po.status;
  if (po.kurs_terkunci) {
    renderTerkunci();
    return;
  }
  if (po.kurs.mode === 'otomatis') Object.assign(otomatis, { status: 'ok', data: po.kurs, dariPratinjau: false });
  else inputManual.value = String(po.kurs.kurs_jastip);
  setModeKurs(po.kurs.mode);
  renderOtomatis();
}

// ---------- Validasi dan simpan ----------

function bacaKursManual() {
  const r = parseRupiah(inputManual.value);
  if (!r.ok) return { error: r.alasan === 'kosong' ? KURS_WAJIB : 'Isi angka saja, mis. 13054.' };
  if (r.nilai <= 0n) return { error: 'Kurs harus lebih dari 0.' };
  if (r.nilai > MAX_KURS) return { error: 'Kurs maksimal Rp1.000.000.' };
  return { nilai: Number(r.nilai) };
}

/** Pembanding kurs pasar untuk kurs manual (opsional di API): dari pratinjau, atau yang sudah tersimpan. */
function pembandingPasar() {
  const sumber = otomatis.dariPratinjau ? otomatis.data : po?.kurs;
  return sumber?.kurs_pasar && sumber?.tanggal_kurs ? { kurs_pasar: sumber.kurs_pasar, tanggal_kurs: sumber.tanggal_kurs } : {};
}

/**
 * Menyusun body. Di mode ubah, `kurs` hanya dikirim kalau admin mengubahnya, supaya kurs
 * tidak dihitung ulang diam-diam dengan buffer pengaturan terbaru.
 */
function susunBody() {
  const errors = {};
  const body = {};
  const nama = inputNama.value.trim();
  if (nama === '') errors.nama = 'Nama Open PO wajib diisi.';
  else if (nama.length > 100) errors.nama = 'Nama Open PO maksimal 100 karakter.';
  else if (!modeUbah || nama !== po.nama) body.nama = nama;

  if (modeUbah) {
    const status = radioStatus.find((r) => r.checked)?.value;
    if (status && status !== po.status) body.status = status;
  }

  if (!(modeUbah && po.kurs_terkunci)) {
    if (modeKurs() === 'otomatis') {
      if (otomatis.status !== 'ok') errors.kurs = KURS_WAJIB;
      else if (!modeUbah || po.kurs.mode !== 'otomatis' || otomatis.dariPratinjau) {
        body.kurs = { mode: 'otomatis', kurs_pasar: otomatis.data.kurs_pasar, tanggal_kurs: otomatis.data.tanggal_kurs };
      }
    } else {
      const m = bacaKursManual();
      if (m.error) errors['kurs.kurs_jastip'] = m.error;
      else if (!modeUbah || po.kurs.mode !== 'manual' || m.nilai !== po.kurs.kurs_jastip || otomatis.dariPratinjau) {
        body.kurs = { mode: 'manual', kurs_jastip: m.nilai, ...pembandingPasar() };
      }
    }
  }
  return { errors, body };
}

async function tanganiKonflikKurs(err) {
  // 409: kurs terkunci di tab lain. Seluruh perubahan dibatalkan server; muat ulang data kurs.
  try {
    const { data } = await Api.openPo(po.id);
    po = { ...data, nama: po.nama, status: po.status };
  } catch (e) {
    catatJikaBug(e);
    po = { ...po, kurs_terkunci: true };
  }
  renderTerkunci();
  const b = wajib('#kurs-terkunci-banner');
  setBanner(b, { jenis: 'warning', pesan: err.pesan });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (tombolSimpan.disabled) return;
  setBanner(bannerForm, null);
  const { errors, body } = susunBody();
  terapkanError(peta, errors, { bannerWadah: bannerForm });
  if (Object.keys(errors).length) return;

  const pulihkan = tombolMemuat(tombolSimpan, 'Menyimpan…');
  try {
    if (modeUbah) {
      await Api.ubahOpenPo(po.id, body);
      location.replace(`${rute.poDetail(po.id)}&pesan=po-diubah`);
    } else {
      const { data } = await Api.buatOpenPo(body);
      location.replace(`${rute.poDetail(data.id)}&pesan=po-dibuat`);
    }
  } catch (err) {
    catatJikaBug(err);
    pulihkan();
    if (err instanceof ApiError && err.kode === 'VALIDASI') {
      terapkanError(peta, err.field, { bannerWadah: bannerForm });
    } else if (err instanceof ApiError && err.kode === 'KURS_TERKUNCI' && modeUbah) {
      await tanganiKonflikKurs(err);
    } else {
      setBanner(bannerForm, { jenis: 'error', pesan: pesanError(err, 'simpan') });
    }
  }
});

for (const r of radioMode) r.addEventListener('change', tampilkanPanel);
tombolAmbil.addEventListener('click', () => ambilKurs({ pindahKeOtomatis: true }));
inputNama.addEventListener('input', () => setErrorField(inputNama, null));
inputManual.addEventListener('input', () => setErrorField(inputManual, null));

// ---------- Mulai ----------

async function mulaiUbah() {
  form.hidden = true;
  memuat.hidden = false;
  isi(memuat, skeletonField(3));
  const tampilkanGagal = (pesan, aksi) => {
    isi(memuat, emptyState({ jenis: 'error', pesan, aksi }));
  };
  if (idPo === null) {
    tampilkanGagal('Open PO tidak ditemukan.', { label: 'Lihat daftar Open PO', href: rute.beranda(), varian: 'secondary' });
    return;
  }
  try {
    po = (await Api.openPo(idPo)).data;
  } catch (err) {
    catatJikaBug(err);
    if (err instanceof ApiError && err.status === 404) {
      tampilkanGagal(err.pesan, { label: 'Lihat daftar Open PO', href: rute.beranda(), varian: 'secondary' });
    } else {
      tampilkanGagal(pesanError(err, 'muat'), { label: 'Coba lagi', varian: 'secondary', onClick: mulaiUbah });
    }
    return;
  }
  memuat.hidden = true;
  form.hidden = false;
  isiDariPo();
}

if (modeUbah) {
  mulaiUbah();
} else {
  // Mode buat: kurs langsung diambil tanpa perlu ketuk apa pun (ui-spec §6.3 langkah 2).
  tampilkanPanel();
  ambilKurs();
}
