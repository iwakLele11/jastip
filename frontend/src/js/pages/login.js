// Layar Login (ui-spec §6.2, §7.1).
import { Api, ApiError, PESAN, catatJikaBug, pesanError } from '../lib/api.js';
import { wajib } from '../lib/dom.js';
import { nextAman, rute } from '../lib/rute.js';
import { setBanner, tombolMemuat } from '../ui/komponen.js';
import { setErrorField, terapkanError } from '../ui/field.js';

const form = wajib('#form-login');
const nama = wajib('#nama-pengguna');
const sandi = wajib('#kata-sandi');
const tombol = wajib('#tombol-masuk');
const lihat = wajib('#lihat-sandi');
const wadahBanner = wajib('[data-banner-form]');
const peta = { nama_pengguna: nama, kata_sandi: sandi };

const params = new URLSearchParams(location.search);
const tujuan = nextAman(params.get('next'), location.origin) ?? rute.beranda();

if (params.get('alasan') === 'sesi-berakhir') {
  setBanner(wadahBanner, { jenis: 'info', pesan: PESAN.sesiBerakhir });
}

// bfcache: jangan tampilkan isi form lama saat kembali ke halaman ini.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

lihat.addEventListener('click', () => {
  const tampil = sandi.type === 'password';
  sandi.type = tampil ? 'text' : 'password';
  lihat.setAttribute('aria-label', tampil ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
  wajib('[data-ikon-lihat]', lihat).hidden = tampil;
  wajib('[data-ikon-sembunyi]', lihat).hidden = !tampil;
});

for (const el of [nama, sandi]) el.addEventListener('input', () => setErrorField(el, null));

nama.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sandi.focus();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (tombol.disabled) return;

  const errors = {};
  if (nama.value.trim() === '') errors.nama_pengguna = 'Isi nama pengguna.';
  if (sandi.value === '') errors.kata_sandi = 'Isi kata sandi.';
  terapkanError(peta, errors);
  if (Object.keys(errors).length) {
    setBanner(wadahBanner, null);
    return;
  }

  const pulihkan = tombolMemuat(tombol, 'Memeriksa…');
  nama.disabled = true;
  sandi.disabled = true;
  try {
    await Api.login(nama.value, sandi.value);
    location.replace(tujuan);
  } catch (err) {
    catatJikaBug(err);
    pulihkan();
    nama.disabled = false;
    sandi.disabled = false;
    if (err instanceof ApiError && err.kode === 'VALIDASI') {
      setBanner(wadahBanner, null);
      terapkanError(peta, err.field);
      return;
    }
    setBanner(wadahBanner, { jenis: 'error', pesan: pesanError(err, 'login') });
    if (err instanceof ApiError && err.kode === 'LOGIN_GAGAL') {
      // Pesan umum, tidak menyebut field mana yang salah. Kata sandi dikosongkan.
      sandi.value = '';
      sandi.focus();
    }
  }
});
