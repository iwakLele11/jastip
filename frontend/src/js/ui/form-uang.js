// Sheet "Catat pembayaran" dan "Catat pengembalian dana" (ui-spec §6.7, §7.6).
// - Nominal: keyboard angka, titik ribuan saat field kehilangan fokus, chip isi cepat dari API.
// - Tombol simpan menulis nominalnya ("Simpan Rp1.467.000") sebagai pemeriksaan terakhir.
// - Tombol nonaktif sejak diketuk sampai respons datang (mencegah tercatat dua kali).
import { ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { h, idUnik } from '../lib/dom.js';
import { formatAngkaRibuan, formatRupiah, tanggalLokalHariIni } from '../lib/format.js';
import { parseRupiah } from '../lib/parse.js';
import { MAX_CATATAN, validasiNominal, validasiTanggal } from '../lib/validasi.js';
import { bukaSheet } from './dialog.js';
import { setErrorField, terapkanError } from './field.js';
import { KELAS } from './kelas.js';
import { banner, setBanner, tombolMemuat } from './komponen.js';

/**
 * @param {{
 *   jenis: 'pembayaran'|'pengembalian',
 *   ringkasan: object, ringkasan keranjang terbaru (sumber chip isi cepat dan batas pengembalian)
 *   simpan: (body: {nominal: number, tanggal: string, catatan?: string|null}) => Promise<unknown>,
 *   sesudahSimpan: (hasil: unknown, nominal: bigint, sheet: {tutup: (paksa?: boolean) => Promise<boolean>}) => void,
 *   onKonflik?: (err: ApiError) => void, dipanggil untuk 404/409 (data berubah di tempat lain)
 * }} p
 */
export function bukaSheetUang({ jenis, ringkasan, simpan, sesudahSimpan, onKonflik }) {
  const kembali = jenis === 'pengembalian';
  const id = idUnik('uang');
  const hariIni = tanggalLokalHariIni();
  const maks = kembali ? ringkasan.kelebihan_bayar : undefined;

  const inputNominal = h('input', {
    id: `${id}-nominal`, type: 'text', inputmode: 'numeric', class: KELAS.inputDalamGrup, autocomplete: 'off', enterkeyhint: 'done',
  });
  const inputTanggal = h('input', { id: `${id}-tanggal`, type: 'date', class: KELAS.input, value: hariIni, required: true });
  const inputCatatan = kembali
    ? h('input', { id: `${id}-catatan`, type: 'text', class: KELAS.input, maxlength: MAX_CATATAN, autocomplete: 'off', placeholder: 'mis. transfer BCA 28 Okt', enterkeyhint: 'done' })
    : null;
  const peta = { nominal: inputNominal, tanggal: inputTanggal, ...(inputCatatan ? { catatan: inputCatatan } : {}) };
  const bannerForm = h('div', { hidden: true, dataset: { bannerForm: '' } });
  const labelKosong = kembali ? 'Simpan pengembalian dana' : 'Simpan pembayaran';
  const tombolSimpan = h('button', { type: 'submit', class: `${KELAS.tombolPrimary} min-w-0 flex-1 md:flex-none` }, labelKosong);

  // Chip isi cepat, nilai dari API (kontrak §10): "Isi DP" hanya jika belum ada pembayaran.
  const chip = [];
  if (kembali) {
    if (ringkasan.kelebihan_bayar > 0) chip.push(['Isi', ringkasan.kelebihan_bayar]);
  } else {
    if (ringkasan.total_pembayaran === 0 && ringkasan.dp > 0) chip.push(['Isi DP', ringkasan.dp]);
    if (ringkasan.sisa > 0) chip.push(['Isi sisa', ringkasan.sisa]);
  }

  function renderTombol() {
    const v = validasiNominal(inputNominal.value);
    tombolSimpan.textContent = v.ok ? `Simpan ${formatRupiah(v.nilai)}` : labelKosong;
  }

  function isiNominal(n) {
    inputNominal.value = formatAngkaRibuan(n);
    setErrorField(inputNominal, null);
    renderTombol();
  }

  // Saat diketik hanya angka; titik ribuan ditambahkan saat field kehilangan fokus.
  inputNominal.addEventListener('focus', () => {
    const r = parseRupiah(inputNominal.value);
    if (r.ok) inputNominal.value = r.nilai.toString();
  });
  inputNominal.addEventListener('blur', () => {
    const r = parseRupiah(inputNominal.value);
    if (r.ok) inputNominal.value = formatAngkaRibuan(r.nilai);
  });
  inputNominal.addEventListener('input', () => {
    setErrorField(inputNominal, null);
    renderTombol();
  });
  inputTanggal.addEventListener('input', () => setErrorField(inputTanggal, null));
  inputCatatan?.addEventListener('input', () => setErrorField(inputCatatan, null));

  const form = h(
    'form',
    { class: 'space-y-4', novalidate: true, dataset: { formUang: jenis } },
    kembali
      ? banner({ jenis: 'info', pesan: `Kelebihan bayar ${formatRupiah(ringkasan.kelebihan_bayar)}. Transfer ke customer di luar aplikasi, lalu catat di sini.` })
      : null,
    h(
      'div',
      {},
      h('label', { for: inputNominal.id, class: KELAS.label }, 'Nominal'),
      h('div', { class: KELAS.inputGrup, dataset: { inputGrup: '' } }, h('span', { class: KELAS.imbuhan, 'aria-hidden': 'true' }, 'Rp'), inputNominal),
      chip.length
        ? h(
            'div',
            { class: 'mt-2 flex flex-wrap gap-2' },
            chip.map(([label, n]) => h('button', { type: 'button', class: KELAS.chipIsi, onClick: () => isiNominal(n) }, `${label} ${formatRupiah(n)}`)),
          )
        : null,
    ),
    h('div', {}, h('label', { for: inputTanggal.id, class: KELAS.label }, 'Tanggal'), inputTanggal),
    inputCatatan ? h('div', {}, h('label', { for: inputCatatan.id, class: KELAS.label }, 'Catatan (opsional)'), inputCatatan) : null,
    bannerForm,
    h(
      'div',
      { class: 'flex gap-2 md:justify-end md:gap-3' },
      h('button', { type: 'button', class: KELAS.tombolSecondary, onClick: () => sheet.tutup() }, 'Batal'),
      tombolSimpan,
    ),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (tombolSimpan.disabled) return;
    setBanner(bannerForm, null);
    const errors = {};
    const v = validasiNominal(inputNominal.value, { maks });
    if (!v.ok) errors.nominal = v.pesan;
    const et = validasiTanggal(inputTanggal.value);
    if (et) errors.tanggal = et;
    terapkanError(peta, errors, { bannerWadah: bannerForm });
    if (Object.keys(errors).length) return;

    const body = { nominal: Number(v.nilai), tanggal: inputTanggal.value };
    if (inputCatatan) body.catatan = inputCatatan.value.trim() || null;
    const pulihkan = tombolMemuat(tombolSimpan, 'Menyimpan…');
    let hasil;
    try {
      hasil = await simpan(body);
    } catch (err) {
      catatJikaBug(err);
      pulihkan();
      if (err instanceof ApiError && err.kode === 'VALIDASI') {
        terapkanError(peta, err.field, { bannerWadah: bannerForm });
      } else {
        setBanner(bannerForm, { jenis: 'error', pesan: pesanError(err, 'simpan') });
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) onKonflik?.(err);
      }
      return;
    }
    pulihkan();
    sesudahSimpan(hasil, v.nilai, sheet);
  });

  const sheet = bukaSheet({
    judul: kembali ? 'Catat pengembalian dana' : 'Catat pembayaran',
    isi: form,
    fokusAwal: () => inputNominal,
    adaPerubahan: () => inputNominal.value.trim() !== '' || inputTanggal.value !== hariIni || Boolean(inputCatatan?.value.trim()),
  });
  return sheet;
}
