// Pengaturan (ui-spec §6.9, §7.9): default markup, buffer kurs AUD, DP. Keluar ada di bawah
// (mobile); di md ke atas lewat TopNav.
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { isi, wajib } from '../lib/dom.js';
import { persenUntukInput } from '../lib/format.js';
import { parseDesimal } from '../lib/parse.js';
import { setErrorField, terapkanError } from '../ui/field.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { emptyState, setBanner, skeletonField, tombolMemuat } from '../ui/komponen.js';
import { toast } from '../ui/toast.js';

mulaiHalaman();

const form = wajib('#form-pengaturan');
const memuat = wajib('#memuat');
const bannerForm = wajib('[data-banner-form]');
const tombolSimpan = wajib('#tombol-simpan');

/** field API → input + label untuk pesan error (sama dengan server). */
const FIELD = {
  default_markup_persen: { el: wajib('#markup'), label: 'Markup' },
  buffer_aud_persen: { el: wajib('#buffer'), label: 'Buffer' },
  dp_persen: { el: wajib('#dp'), label: 'DP' },
};
const peta = Object.fromEntries(Object.entries(FIELD).map(([k, v]) => [k, v.el]));

function validasi(label, nilai) {
  const r = parseDesimal(nilai, 2);
  const dp = label === 'DP';
  if (!r.ok) {
    if (r.alasan === 'kosong') return `${label} wajib diisi.`;
    if (r.alasan === 'desimal') return 'Maksimal 2 angka di belakang koma.';
    if (r.alasan === 'negatif') return dp ? 'DP harus antara 0 dan 100%.' : `${label} tidak boleh negatif.`;
    return 'Isi angka, mis. 10.';
  }
  if (r.nilai > 10000n) return dp ? 'DP harus antara 0 dan 100%.' : `${label} maksimal 100%.`;
  return null;
}

function isiForm(data) {
  for (const [k, { el }] of Object.entries(FIELD)) el.value = persenUntukInput(data[k]);
}

for (const { el } of Object.values(FIELD)) el.addEventListener('input', () => setErrorField(el, null));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (tombolSimpan.disabled) return;
  setBanner(bannerForm, null);
  const errors = {};
  const body = {};
  for (const [k, { el, label }] of Object.entries(FIELD)) {
    const pesan = validasi(label, el.value);
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
  isi(memuat, skeletonField(3));
  try {
    const { data } = await Api.pengaturan();
    isiForm(data);
    memuat.hidden = true;
    form.hidden = false;
  } catch (err) {
    catatJikaBug(err);
    isi(memuat, emptyState({ jenis: 'error', pesan: pesanError(err, 'muat'), aksi: { label: 'Coba lagi', varian: 'secondary', onClick: muat } }));
  }
}

muat();
