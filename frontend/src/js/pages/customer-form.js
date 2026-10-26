// Form customer buat / ubah (ui-spec §7.8): cek duplikat no WA saat blur (peringatan,
// bukan blokir), Arsipkan (punya pesanan) atau Hapus (belum punya pesanan).
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { h, isi, wajib } from '../lib/dom.js';
import { bersihkanNoWa, validasiNoWa } from '../lib/parse.js';
import { idDariQuery, rute } from '../lib/rute.js';
import { konfirmasi } from '../ui/dialog.js';
import { setErrorField, terapkanError } from '../ui/field.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { emptyState, setBanner, skeletonField, tombolMemuat } from '../ui/komponen.js';
import { pasangFieldNoWa } from '../ui/no-wa.js';

mulaiHalaman();

const form = wajib('#form-customer');
const judul = wajib('#judul');
const inputNama = wajib('#nama');
const inputNoWa = wajib('#no-wa');
const inputAlamat = wajib('#alamat');
const bannerForm = wajib('[data-banner-form]');
const tombolSimpan = wajib('#tombol-simpan');
const memuat = wajib('#memuat');
const bagianArsip = wajib('#bagian-arsip');
const bannerArsip = wajib('[data-banner-arsip]');
const tombolArsip = wajib('#tombol-arsip');
const bantuanArsip = wajib('#bantuan-arsip');
const peta = { nama: inputNama, no_wa: inputNoWa, alamat: inputAlamat };

const paramId = new URLSearchParams(location.search).get('id');
const idCustomer = idDariQuery(paramId);
const modeUbah = paramId !== null;
let customer = null;

// ---------- No WA: bersihkan, validasi, cek duplikat (saat kehilangan fokus) ----------

pasangFieldNoWa(inputNoWa, {
  kecualiId: modeUbah ? idCustomer : undefined,
  aksi: (lain) =>
    h('a', { href: rute.customerUbah(lain.id), class: 'font-semibold underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' }, `Lihat ${lain.nama}`),
});
inputNama.addEventListener('input', () => setErrorField(inputNama, null));
inputAlamat.addEventListener('input', () => setErrorField(inputAlamat, null));
for (const el of [inputNama, inputNoWa]) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (el === inputNama ? inputNoWa : inputAlamat).focus();
    }
  });
}

// ---------- Simpan ----------

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (tombolSimpan.disabled) return;
  setBanner(bannerForm, null);
  inputNoWa.value = bersihkanNoWa(inputNoWa.value);

  const errors = {};
  const nama = inputNama.value.trim();
  if (nama === '') errors.nama = 'Nama wajib diisi.';
  const wa = validasiNoWa(inputNoWa.value);
  if (!wa.ok) errors.no_wa = wa.pesan;
  terapkanError(peta, errors, { bannerWadah: bannerForm });
  if (Object.keys(errors).length) return;

  const alamat = inputAlamat.value.trim();
  const body = { nama, no_wa: inputNoWa.value, alamat: alamat === '' ? null : alamat };
  const pulihkan = tombolMemuat(tombolSimpan, 'Menyimpan…');
  try {
    if (modeUbah) await Api.ubahCustomer(customer.id, body);
    else await Api.buatCustomer(body);
    location.replace(`${rute.customer()}?pesan=customer-disimpan`);
  } catch (err) {
    catatJikaBug(err);
    pulihkan();
    if (err instanceof ApiError && err.kode === 'VALIDASI') terapkanError(peta, err.field, { bannerWadah: bannerForm });
    else setBanner(bannerForm, { jenis: 'error', pesan: pesanError(err, 'simpan') });
  }
});

// ---------- Arsipkan / hapus (mode ubah) ----------

function renderArsip() {
  if (customer.diarsipkan) {
    bagianArsip.hidden = true;
    return;
  }
  bagianArsip.hidden = false;
  tombolArsip.textContent = customer.punya_pesanan ? 'Arsipkan customer' : 'Hapus customer';
  bantuanArsip.hidden = !customer.punya_pesanan;
  if (customer.punya_pesanan) tombolArsip.setAttribute('aria-describedby', 'bantuan-arsip');
  else tombolArsip.removeAttribute('aria-describedby');
}

tombolArsip.addEventListener('click', async () => {
  if (tombolArsip.disabled) return;
  const { nama } = customer;
  const arsip = customer.punya_pesanan;
  const ya = await konfirmasi(
    arsip
      ? {
          judul: `Arsipkan ${nama}?`,
          isi: `${nama} sudah punya pesanan, jadi tidak bisa dihapus. Customer yang diarsipkan tidak muncul di daftar customer. Pesanannya tetap ada.`,
          labelAksi: 'Arsipkan',
          nada: 'primary',
        }
      : { judul: `Hapus ${nama}?`, isi: 'Customer ini belum punya pesanan dan akan dihapus permanen.', labelAksi: 'Hapus', nada: 'danger' },
  );
  if (!ya) return;
  setBanner(bannerArsip, null);
  const pulihkan = tombolMemuat(tombolArsip, arsip ? 'Mengarsipkan…' : 'Menghapus…');
  try {
    if (arsip) await Api.arsipkanCustomer(customer.id);
    else await Api.hapusCustomer(customer.id);
    location.replace(`${rute.customer()}?pesan=${arsip ? 'customer-diarsipkan' : 'customer-dihapus'}`);
  } catch (err) {
    catatJikaBug(err);
    pulihkan();
    setBanner(bannerArsip, { jenis: 'error', pesan: pesanError(err, 'simpan') });
    if (err instanceof ApiError && err.kode === 'CUSTOMER_PUNYA_PESANAN') {
      // Ternyata sudah punya pesanan (mis. dari tab lain): tombol berganti ke Arsipkan.
      customer = { ...customer, punya_pesanan: true };
      renderArsip();
    }
  }
});

// ---------- Mulai ----------

function isiDariCustomer() {
  judul.textContent = customer.nama;
  document.title = `${customer.nama} · Customer · Jastip Admin`;
  inputNama.value = customer.nama;
  inputNoWa.value = customer.no_wa_tampil;
  inputAlamat.value = customer.alamat ?? '';
  renderArsip();
}

async function mulaiUbah() {
  form.hidden = true;
  memuat.hidden = false;
  isi(memuat, skeletonField(3));
  const gagal = (pesan, aksi) => isi(memuat, emptyState({ jenis: 'error', pesan, aksi }));
  if (idCustomer === null) {
    gagal('Customer tidak ditemukan.', { label: 'Lihat daftar customer', href: rute.customer(), varian: 'secondary' });
    return;
  }
  try {
    customer = (await Api.customer(idCustomer)).data;
  } catch (err) {
    catatJikaBug(err);
    if (err instanceof ApiError && err.status === 404) gagal(err.pesan, { label: 'Lihat daftar customer', href: rute.customer(), varian: 'secondary' });
    else gagal(pesanError(err, 'muat'), { label: 'Coba lagi', varian: 'secondary', onClick: mulaiUbah });
    return;
  }
  memuat.hidden = true;
  form.hidden = false;
  isiDariCustomer();
}

if (modeUbah) {
  mulaiUbah();
} else {
  // Isian awal dari "Buat customer "Dewi"" di daftar customer (#nama=… / #no_wa=…).
  // Hash langsung dibuang dari URL supaya teks itu tidak tertinggal di alamat halaman.
  const awal = new URLSearchParams(location.hash.slice(1));
  if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
  inputNama.value = (awal.get('nama') ?? '').slice(0, 100);
  inputNoWa.value = bersihkanNoWa(awal.get('no_wa') ?? '');
  // Halaman ini tidak memuat data, jadi sesi dicek langsung (semua rute selain login wajib sesi).
  Api.sesi().catch(catatJikaBug);
}
