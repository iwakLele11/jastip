// Pengaturan: default ongkos berat & fee jastip (AUD), buffer kurs AUD, DP. Keluar ada di bawah
// (mobile); di md ke atas lewat TopNav.
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { isi, wajib } from '../lib/dom.js';
import { audUntukInput, persenUntukInput } from '../lib/format.js';
import { parseDesimal } from '../lib/parse.js';
import { setErrorField, terapkanError } from '../ui/field.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { aksiCobaLagi, emptyState, setBanner, skeletonField, tombolMemuat } from '../ui/komponen.js';
import { toast } from '../ui/toast.js';

mulaiHalaman();

const form = wajib('#form-pengaturan');
const memuat = wajib('#memuat');
const bannerForm = wajib('[data-banner-form]');
const tombolSimpan = wajib('#tombol-simpan');

const MAX_AUD_SEN = 10_000_000n; // AUD 100.000,00

/** field API → input + label untuk pesan error (sama dengan server). `aud: true` = nominal AUD. */
const FIELD = {
  default_ongkos_berat: { el: wajib('#ongkos'), label: 'Ongkos berat', aud: true },
  default_fee_jastip: { el: wajib('#fee'), label: 'Fee jastip', aud: true },
  buffer_aud_persen: { el: wajib('#buffer'), label: 'Buffer' },
  dp_persen: { el: wajib('#dp'), label: 'DP' },
};
const peta = Object.fromEntries(Object.entries(FIELD).map(([k, v]) => [k, v.el]));

function validasi(label, nilai, aud) {
  const r = parseDesimal(nilai, 2);
  const dp = label === 'DP';
  if (!r.ok) {
    if (r.alasan === 'kosong') return `${label} wajib diisi.`;
    if (r.alasan === 'desimal') return 'Maksimal 2 angka di belakang koma.';
    if (r.alasan === 'negatif') return dp ? 'DP harus antara 0 dan 100%.' : `${label} tidak boleh negatif.`;
    return aud ? 'Isi angka saja, mis. 5.' : 'Isi angka, mis. 10.';
  }
  if (aud) return r.nilai > MAX_AUD_SEN ? `${label} maksimal AUD 100.000,00.` : null;
  if (r.nilai > 10000n) return dp ? 'DP harus antara 0 dan 100%.' : `${label} maksimal 100%.`;
  return null;
}

function isiForm(data) {
  for (const [k, { el, aud }] of Object.entries(FIELD)) el.value = aud ? audUntukInput(data[k]) : persenUntukInput(data[k]);
}

for (const { el } of Object.values(FIELD)) el.addEventListener('input', () => setErrorField(el, null));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (tombolSimpan.disabled) return;
  setBanner(bannerForm, null);
  const errors = {};
  const body = {};
  for (const [k, { el, label, aud }] of Object.entries(FIELD)) {
    const pesan = validasi(label, el.value, aud);
    if (pesan) errors[k] = pesan;
    else body[k] = el.value.trim();
  }
  terapkanError(peta, errors, { bannerWadah: bannerForm });
  if (Object.keys(errors).length) return;

  const pulihkan = tombolMemuat(tombolSimpan, 'Menyimpan…');
  try {
    const { data } = await Api.ubahPengaturan(body);
    pulihkan();
    isiForm(data);
    toast('Pengaturan disimpan.');
  } catch (err) {
    catatJikaBug(err);
    pulihkan();
    if (err instanceof ApiError && err.kode === 'VALIDASI') terapkanError(peta, err.field, { bannerWadah: bannerForm });
    else setBanner(bannerForm, { jenis: 'error', pesan: pesanError(err, 'simpan') });
  }
});

async function muat() {
  form.hidden = true;
  memuat.hidden = false;
  isi(memuat, skeletonField(4));
  try {
    const { data } = await Api.pengaturan();
    isiForm(data);
    memuat.hidden = true;
    form.hidden = false;
  } catch (err) {
    catatJikaBug(err);
    isi(memuat, emptyState({ jenis: 'error', pesan: pesanError(err, 'muat'), aksi: aksiCobaLagi(err, muat, { varian: 'secondary' }) }));
  }
}

muat();
