// Sheet "Tambah customer ke Open PO" (ui-spec §6.4, §7.5).
// Langkah 1: cari (GET /customer?q=…&open_po_id=…, debounce 300 ms). Belum mengetik = 10 customer
// yang terakhir diubah. Customer yang sudah punya keranjang di PO ini berlabel "Sudah di PO ini"
// dan tetap membuka keranjangnya. Langkah 2: buat customer baru di sheet yang sama, dengan
// peringatan no WA ganda + "Pakai {nama}". Setelah itu langsung ke Keranjang.
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { debounce, h, idUnik, isi } from '../lib/dom.js';
import { ikon } from '../lib/ikon.js';
import { bersihkanNoWa, tampakSepertiNoWa, validasiNoWa } from '../lib/parse.js';
import { rute } from '../lib/rute.js';
import { bukaSheet } from './dialog.js';
import { setErrorField, terapkanError } from './field.js';
import { KELAS } from './kelas.js';
import { emptyState, setBanner, skeletonBaris, tombolMemuat } from './komponen.js';
import { pasangFieldNoWa } from './no-wa.js';

const PER_HALAMAN_CARI = 20;
const JUMLAH_TERAKHIR = 10;

/** @param {{id: number}} po */
export function bukaSheetTambahCustomer(po) {
  const id = idUnik('tambah-customer');
  const keKeranjang = (customerId, pesan) => `${rute.keranjang(po.id, customerId)}${pesan ? `&pesan=${pesan}` : ''}`;

  // ---------- Langkah 1: cari ----------
  const inputCari = h('input', {
    id: `${id}-cari`, type: 'search', class: `${KELAS.inputDalamGrup} [&::-webkit-search-cancel-button]:appearance-none`,
    autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', maxlength: 100,
  });
  const hapusCari = h(
    'button',
    { type: 'button', class: `${KELAS.tombolIkon} text-ink-muted`, 'aria-label': 'Hapus pencarian', hidden: true, onClick: () => {
      inputCari.value = '';
      hapusCari.hidden = true;
      muatTertunda.batal();
      cari();
      inputCari.focus();
    } },
    ikon('x-mark', 24, 'size-5'),
  );
  const bannerCari = h('div', { hidden: true, class: 'mt-3' });
  const hasil = h('div', { class: 'mt-3', 'aria-busy': 'false' });
  const tombolBaru = h('button', { type: 'button', class: `${KELAS.tombolSecondary} mt-4 w-full whitespace-normal`, onClick: () => keLangkahBaru(inputCari.value.trim()) }, '+ Buat customer baru');
  const formCari = h(
    'form',
    { role: 'search', novalidate: true, onSubmit: (e) => {
      e.preventDefault();
      muatTertunda.batal();
      cari();
    } },
    h('label', { for: inputCari.id, class: KELAS.label }, 'Cari nama atau no WA'),
    h(
      'div',
      { class: KELAS.inputGrup, dataset: { inputGrup: '' } },
      h('span', { class: 'shrink-0 pl-3 text-ink-muted' }, ikon('magnifying-glass', 24, 'size-5')),
      inputCari,
      hapusCari,
    ),
  );
  const langkahCari = h('div', { dataset: { langkah: 'cari' } }, formCari, bannerCari, hasil, tombolBaru);

  let pengendali = null;
  let items = [];
  let meta = null;

  function baris(c) {
    return h(
      'li',
      {},
      h(
        'a',
        { href: keKeranjang(c.id), class: `flex min-h-16 items-center justify-between gap-3 ${KELAS.barisTautan}`, dataset: { customerId: c.id } },
        h('span', { class: 'min-w-0' }, h('span', { class: 'block font-semibold break-words' }, c.nama), h('span', { class: 'block text-sm text-ink-muted tabular-nums' }, c.no_wa_tampil)),
        c.sudah_di_po
          ? h('span', { class: 'shrink-0 text-sm text-ink-muted' }, 'Sudah di PO ini')
          : ikon('chevron-right', 24, 'size-5 shrink-0 text-ink-muted'),
      ),
    );
  }

  function renderHasil(q) {
    tombolBaru.textContent = q ? `+ Buat customer baru "${q}"` : '+ Buat customer baru';
    if (!items.length) {
      isi(hasil, q ? emptyState({ pesan: `Tidak ada customer dengan nama atau no WA "${q}".` }) : null);
      return;
    }
    const lagi =
      q && meta.halaman < meta.total_halaman
        ? h('button', { type: 'button', class: `${KELAS.tombolSecondary} mt-3 w-full`, onClick: (e) => cari({ tambah: true, tombol: e.currentTarget }) }, 'Muat lebih banyak')
        : null;
    isi(hasil, h('ul', { class: KELAS.kartuDaftar, 'aria-label': q ? 'Hasil pencarian' : 'Customer yang terakhir diubah' }, items.map(baris)), lagi);
  }

  async function cari({ tambah = false, tombol = null, awal = false } = {}) {
    const q = inputCari.value.trim();
    pengendali?.abort();
    pengendali = new AbortController();
    const { signal } = pengendali;
    const pulihkan = tombol ? tombolMemuat(tombol, 'Memuat…') : null;
    if (!tambah) isi(hasil, skeletonBaris(3));
    hasil.setAttribute('aria-busy', 'true');
    setBanner(bannerCari, null);
    try {
      const query = q
        ? { q, open_po_id: po.id, urut: 'nama', halaman: tambah ? meta.halaman + 1 : 1, per_halaman: PER_HALAMAN_CARI }
        : { open_po_id: po.id, urut: 'terakhir_diubah', per_halaman: JUMLAH_TERAKHIR };
      const res = await Api.daftarCustomer(query, signal);
      meta = res.meta;
      items = tambah ? [...items, ...res.data] : res.data;
      hasil.setAttribute('aria-busy', 'false');
      // Belum ada customer sama sekali: langsung ke langkah 2 (ui-spec §7.5).
      if (awal && !q && meta.total === 0) {
        keLangkahBaru('', { tanpaKembali: true });
        return;
      }
      renderHasil(q);
    } catch (err) {
      if (signal.aborted) return;
      catatJikaBug(err);
      pulihkan?.();
      hasil.setAttribute('aria-busy', 'false');
      if (!tambah) isi(hasil);
      setBanner(bannerCari, { jenis: 'error', pesan: pesanError(err, 'muat'), aksi: { label: 'Coba lagi', onClick: () => cari({ tambah }) } });
    }
  }

  const muatTertunda = debounce(() => cari(), 300);
  inputCari.addEventListener('input', () => {
    hapusCari.hidden = inputCari.value === '';
    tombolBaru.textContent = inputCari.value.trim() ? `+ Buat customer baru "${inputCari.value.trim()}"` : '+ Buat customer baru';
    muatTertunda();
  });

  // ---------- Langkah 2: customer baru ----------
  const inputNama = h('input', { id: `${id}-nama`, type: 'text', class: KELAS.input, maxlength: 100, autocomplete: 'off', enterkeyhint: 'next' });
  const inputNoWa = h('input', { id: `${id}-no-wa`, type: 'tel', class: KELAS.input, autocomplete: 'off', enterkeyhint: 'next', 'aria-describedby': `${id}-no-wa-bantuan` });
  const inputAlamat = h('textarea', { id: `${id}-alamat`, rows: 3, maxlength: 500, class: KELAS.textarea, autocomplete: 'off' });
  const bannerBaru = h('div', { hidden: true, dataset: { bannerForm: '' } });
  const tombolSimpan = h('button', { type: 'submit', class: `${KELAS.tombolPrimary} w-full` }, 'Simpan & buka keranjang');
  const peta = { nama: inputNama, no_wa: inputNoWa, alamat: inputAlamat };
  const formBaru = h(
    'form',
    { class: 'space-y-4', novalidate: true, dataset: { langkah: 'baru' } },
    h('div', {}, h('label', { for: inputNama.id, class: KELAS.label }, 'Nama'), inputNama),
    h(
      'div',
      {},
      h('label', { for: inputNoWa.id, class: KELAS.label }, 'No WA'),
      inputNoWa,
      h('p', { id: `${id}-no-wa-bantuan`, class: KELAS.bantuan }, 'Contoh: 081234567890'),
    ),
    h('div', {}, h('label', { for: inputAlamat.id, class: KELAS.label }, 'Alamat (opsional)'), inputAlamat),
    bannerBaru,
    tombolSimpan,
  );
  let isianAwal = { nama: '', no_wa: '' };

  pasangFieldNoWa(inputNoWa, {
    aksi: (lain) => h('a', { href: keKeranjang(lain.id), class: `${KELAS.tombolSecondary} mt-2 flex w-fit`, dataset: { pakaiCustomer: lain.id } }, `Pakai ${lain.nama}`),
  });
  inputNama.addEventListener('input', () => setErrorField(inputNama, null));
  inputAlamat.addEventListener('input', () => setErrorField(inputAlamat, null));
  for (const [el, berikut] of [[inputNama, inputNoWa], [inputNoWa, inputAlamat]]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        berikut.focus();
      }
    });
  }

  formBaru.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (tombolSimpan.disabled) return;
    setBanner(bannerBaru, null);
    inputNoWa.value = bersihkanNoWa(inputNoWa.value);
    const errors = {};
    const nama = inputNama.value.trim();
    if (nama === '') errors.nama = 'Nama wajib diisi.';
    const wa = validasiNoWa(inputNoWa.value);
    if (!wa.ok) errors.no_wa = wa.pesan;
    terapkanError(peta, errors, { bannerWadah: bannerBaru });
    if (Object.keys(errors).length) return;

    const alamat = inputAlamat.value.trim();
    const pulihkan = tombolMemuat(tombolSimpan, 'Menyimpan…');
    try {
      const { data } = await Api.buatCustomer({ nama, no_wa: inputNoWa.value, alamat: alamat === '' ? null : alamat });
      location.assign(keKeranjang(data.id, 'customer-disimpan'));
    } catch (err) {
      catatJikaBug(err);
      pulihkan();
      if (err instanceof ApiError && err.kode === 'VALIDASI') terapkanError(peta, err.field, { bannerWadah: bannerBaru });
      else setBanner(bannerBaru, { jenis: 'error', pesan: pesanError(err, 'simpan') });
    }
  });

  // ---------- Pergantian langkah ----------
  const wadah = h('div', {}, langkahCari);
  let langkah = 'cari';

  function keLangkahBaru(teks, { tanpaKembali = false } = {}) {
    langkah = 'baru';
    // Nama terisi dari teks pencarian, atau no WA kalau yang diketik angka (ui-spec §6.4).
    const noWa = tampakSepertiNoWa(teks);
    inputNama.value = noWa ? '' : teks.slice(0, 100);
    inputNoWa.value = noWa ? bersihkanNoWa(teks) : '';
    inputAlamat.value = '';
    for (const el of Object.values(peta)) setErrorField(el, null);
    setBanner(bannerBaru, null);
    isianAwal = { nama: inputNama.value, no_wa: inputNoWa.value };
    isi(wadah, formBaru);
    sheet.setJudul('Customer baru');
    sheet.setKembali(tanpaKembali ? null : { label: 'Kembali ke pencarian', onClick: keLangkahCari });
    (inputNama.value === '' ? inputNama : inputNoWa).focus();
  }

  function keLangkahCari() {
    langkah = 'cari';
    isi(wadah, langkahCari);
    sheet.setJudul('Tambah customer');
    sheet.setKembali(null);
    inputCari.focus();
  }

  const adaPerubahan = () =>
    langkah === 'baru' &&
    (inputNama.value.trim() !== isianAwal.nama.trim() || bersihkanNoWa(inputNoWa.value) !== isianAwal.no_wa || inputAlamat.value.trim() !== '');

  const sheet = bukaSheet({ judul: 'Tambah customer', isi: wadah, adaPerubahan, fokusAwal: () => inputCari });
  cari({ awal: true });
  return sheet;
}
