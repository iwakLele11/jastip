// OrderLineForm + PricePreview (ui-spec §6.5, §7.6, §12.2, §12.3). Satu komponen untuk Sheet
// tambah/ubah barang (mobile) dan kartu "Tambah barang" yang selalu terbuka (lg).
// - Nama barang: combobox ARIA, saran dari GET /open-po/{id}/barang-unik (diambil sekali,
//   difilter di perangkat, maks. 6). Memilih saran mengisi nama + harga AUD; markup tidak berubah.
// - Pratinjau dihitung di perangkat dengan harga.js (BigInt, rumus sama dengan server). Tampilan
//   langsung diperbarui; live region untuk pembaca layar diperbarui 500 ms setelah ketikan terakhir.
import { ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { debounce, h, idUnik } from '../lib/dom.js';
import { audUntukInput, formatAud, formatPersenBp, formatRupiah, formatRupiahSen, persenUntukInput } from '../lib/format.js';
import { pratinjauHarga } from '../lib/harga.js';
import { ikon } from '../lib/ikon.js';
import { parseBulat } from '../lib/parse.js';
import { MAX_NAMA_BARANG, validasiBarang } from '../lib/validasi.js';
import { setErrorField, terapkanError } from './field.js';
import { KELAS } from './kelas.js';
import { banner, setBanner, tombolMemuat } from './komponen.js';

const PETUNJUK = 'Isi harga dan qty untuk melihat harga jual.';
const MAKS_SARAN = 6;
const JEDA_LIVE_MS = 500;
const FIELD_HARGA = ['harga_aud', 'qty', 'markup_persen'];

const audDariSen = (sen) => formatAud(`${sen / 100n}.${(sen % 100n).toString().padStart(2, '0')}`);
const kecil = (s) => s.toLocaleLowerCase('id');

/**
 * @param {{
 *   varian: 'sheet'|'kartu',
 *   konteks: {kurs: number, kursTerkunci: boolean, defaultMarkup: string|null},
 *   saran: () => Promise<Array<{nama_barang: string, harga_aud: string}>>,
 *   simpan: (body: object, ctx: {mode: 'tambah'|'ubah', baris: object|null, tambahLagi: boolean,
 *            pratinjau: object|null}) => Promise<unknown>,
 *   sesudahSimpan: (hasil: unknown, ctx: {mode: 'tambah'|'ubah', baris: object|null, tambahLagi: boolean}) => void,
 *   onBatal?: () => void,
 *   onModeBerubah?: (mode: 'tambah'|'ubah') => void,
 * }} p
 */
export function buatFormBarang({ varian, konteks, saran, simpan, sesudahSimpan, onBatal, onModeBerubah }) {
  const id = idUnik('barang');
  let ktx = { ...konteks };
  let mode = 'tambah';
  let baris = null;
  let awal = null;
  let menyimpan = false;

  // ---------- Field ----------
  const inputNama = h('input', {
    id: `${id}-nama`, type: 'text', class: KELAS.input, maxlength: MAX_NAMA_BARANG, autocomplete: 'off',
    spellcheck: 'false', enterkeyhint: 'next', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': `${id}-saran`,
  });
  const listSaran = h('ul', {
    id: `${id}-saran`, role: 'listbox', 'aria-label': 'Saran nama barang', hidden: true,
    class: 'mt-1 divide-y divide-line overflow-hidden rounded-lg border border-line-strong bg-surface',
  });
  const inputHarga = h('input', { id: `${id}-harga`, type: 'text', inputmode: 'decimal', class: KELAS.inputDalamGrup, autocomplete: 'off', enterkeyhint: 'next' });
  const inputQty = h('input', { id: `${id}-qty`, type: 'text', inputmode: 'numeric', class: `${KELAS.inputDalamGrup} px-1 text-center tabular-nums`, autocomplete: 'off', enterkeyhint: 'next' });
  const inputMarkup = h('input', { id: `${id}-markup`, type: 'text', inputmode: 'decimal', class: KELAS.inputDalamGrup, autocomplete: 'off', enterkeyhint: 'done' });
  const kelasStepper = `inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-page aria-disabled:cursor-not-allowed aria-disabled:text-ink-subtle aria-disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`;
  const tombolKurang = h('button', { type: 'button', class: kelasStepper, 'aria-label': 'Kurangi qty', 'aria-controls': inputQty.id, onClick: () => ubahQty(-1) }, ikon('minus', 24, 'size-5'));
  const tombolTambah = h('button', { type: 'button', class: kelasStepper, 'aria-label': 'Tambah qty', 'aria-controls': inputQty.id, onClick: () => ubahQty(1) }, ikon('plus', 24, 'size-5'));
  const peta = { nama_barang: inputNama, harga_aud: inputHarga, qty: inputQty, markup_persen: inputMarkup };

  const judulKartu = varian === 'kartu' ? h('h2', { id: `${id}-judul`, class: KELAS.judulBagian, tabindex: '-1' }, 'Tambah barang') : null;
  const bannerKurs = h('div', { hidden: true, dataset: { bannerKurs: '' } });
  const bannerForm = h('div', { hidden: true, dataset: { bannerForm: '' } });

  // ---------- PricePreview ----------
  const pratinjauKosong = h('p', { class: 'text-ink-subtle' }, PETUNJUK);
  const ddUnit = h('dd', { class: 'tabular-nums' });
  const ddSubtotal = h('dd', { class: 'tabular-nums' });
  const keterangan = h('p', { class: 'mt-1 text-sm text-ink-muted tabular-nums' });
  const idRincian = `${id}-rincian`;
  const panahRincian = ikon('chevron-down', 24, 'size-5 motion-safe:transition-transform');
  const tombolRincian = h(
    'button',
    { type: 'button', class: `${KELAS.tombolGhost} -mb-2 -ml-3 mt-1`, 'aria-expanded': 'false', 'aria-controls': idRincian, onClick: () => bukaRincian(tombolRincian.getAttribute('aria-expanded') !== 'true') },
    'Rincian hitungan',
    panahRincian,
  );
  const rincian = h('dl', { id: idRincian, hidden: true, class: 'mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-line pt-3 text-sm tabular-nums', dataset: { rincian: '' } });
  const pratinjauTerisi = h(
    'div',
    { hidden: true },
    h(
      'dl',
      { class: 'space-y-1' },
      h('div', { class: 'flex items-baseline justify-between gap-4' }, h('dt', { class: 'text-ink-muted' }, 'Harga/unit'), ddUnit),
      h('div', { class: 'flex items-baseline justify-between gap-4 font-semibold' }, h('dt', {}, 'Subtotal'), ddSubtotal),
    ),
    keterangan,
    tombolRincian,
    rincian,
  );
  const liveRegion = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true', dataset: { pratinjauLive: '' } });
  const pratinjau = h(
    'section',
    { class: 'rounded-xl border border-line bg-page p-4', 'aria-label': 'Pratinjau harga', dataset: { pratinjau: 'kosong' } },
    pratinjauKosong,
    pratinjauTerisi,
    liveRegion,
  );

  // ---------- Tombol ----------
  const tombolSimpan = h('button', { type: 'submit', class: `${KELAS.tombolPrimary} min-w-0 flex-1 md:flex-none` });
  const tombolKedua = h('button', { type: 'button', class: `${KELAS.tombolSecondary} md:flex-none`, onClick: () => (mode === 'ubah' ? onBatal?.() : kirim(true)) });

  const form = h(
    'form',
    { class: 'space-y-4', novalidate: true, dataset: { formBarang: varian } },
    judulKartu,
    bannerKurs,
    h('div', {}, h('label', { for: inputNama.id, class: KELAS.label }, 'Nama barang'), inputNama, listSaran),
    h(
      'div',
      {},
      h('label', { for: inputHarga.id, class: KELAS.label }, 'Harga (AUD)'),
      h('div', { class: KELAS.inputGrup, dataset: { inputGrup: '' } }, h('span', { class: KELAS.imbuhan, 'aria-hidden': 'true' }, 'AUD'), inputHarga),
    ),
    h(
      'div',
      { class: 'grid grid-cols-2 gap-3' },
      h(
        'div',
        { class: 'min-w-0' },
        h('label', { for: inputQty.id, class: KELAS.label }, 'Qty'),
        h(
          'div',
          {
            class: 'mt-1 flex h-11 w-full items-center rounded-lg border border-line-strong bg-surface text-base has-[input:focus]:border-primary has-[input:focus]:outline-2 has-[input:focus]:outline-primary has-[[aria-invalid=true]]:border-danger',
            dataset: { inputGrup: '' },
          },
          tombolKurang,
          inputQty,
          tombolTambah,
        ),
      ),
      h(
        'div',
        { class: 'min-w-0' },
        h('label', { for: inputMarkup.id, class: KELAS.label }, 'Markup'),
        h('div', { class: KELAS.inputGrup, dataset: { inputGrup: '' } }, inputMarkup, h('span', { class: KELAS.imbuhan, 'aria-hidden': 'true' }, '%')),
      ),
    ),
    pratinjau,
    bannerForm,
    h('div', { class: 'flex gap-2 md:justify-end md:gap-3' }, tombolKedua, tombolSimpan),
  );

  // ---------- Pratinjau ----------
  const kursAktif = () => (mode === 'ubah' && baris ? baris.kurs_jastip : ktx.kurs);

  function hitung() {
    return pratinjauHarga({ harga: inputHarga.value, qty: inputQty.value, markup: inputMarkup.value, kurs: kursAktif() });
  }

  const umumkan = debounce((teks) => {
    liveRegion.textContent = teks;
  }, JEDA_LIVE_MS);

  function renderPratinjau({ paksaKosong = false, umumkanPerubahan = true } = {}) {
    const p = paksaKosong ? null : hitung();
    pratinjau.dataset.pratinjau = p ? 'terisi' : 'kosong';
    pratinjauKosong.hidden = Boolean(p);
    pratinjauTerisi.hidden = !p;
    if (p) {
      ddUnit.textContent = formatRupiah(p.hargaJualUnit);
      ddSubtotal.textContent = formatRupiah(p.subtotal);
      keterangan.textContent = `Kurs ${formatRupiah(p.kurs)} · markup ${formatPersenBp(p.markupBp)}`;
      const baris2 = [
        [`${audDariSen(p.hargaSen)} × ${formatRupiah(p.kurs)}`, formatRupiahSen(p.senSebelumMarkup)],
        [`+ markup ${formatPersenBp(p.markupBp)}`, formatRupiahSen(p.sen)],
        ['Dibulatkan ke atas ke ribuan', formatRupiah(p.hargaJualUnit)],
        [`× ${p.qty}`, formatRupiah(p.subtotal)],
      ];
      rincian.replaceChildren(...baris2.flatMap(([dt, dd]) => [h('dt', { class: 'text-ink-muted' }, dt), h('dd', { class: 'text-right whitespace-nowrap' }, `= ${dd}`)]));
    }
    if (umumkanPerubahan) umumkan(p ? `Harga/unit ${formatRupiah(p.hargaJualUnit)}. Subtotal ${formatRupiah(p.subtotal)}.` : PETUNJUK);
    renderStepper();
  }

  function bukaRincian(buka) {
    tombolRincian.setAttribute('aria-expanded', String(buka));
    rincian.hidden = !buka;
    panahRincian.classList.toggle('rotate-180', buka);
  }

  function renderStepper() {
    const q = parseBulat(inputQty.value);
    const minimal = !q.ok || q.nilai <= 1n;
    const maksimal = q.ok && q.nilai >= 999n;
    if (minimal) tombolKurang.setAttribute('aria-disabled', 'true');
    else tombolKurang.removeAttribute('aria-disabled');
    if (maksimal) tombolTambah.setAttribute('aria-disabled', 'true');
    else tombolTambah.removeAttribute('aria-disabled');
  }

  function ubahQty(arah) {
    const tombol = arah < 0 ? tombolKurang : tombolTambah;
    if (tombol.getAttribute('aria-disabled') === 'true') return;
    const q = parseBulat(inputQty.value);
    const sekarang = q.ok ? Number(q.nilai) : 0;
    inputQty.value = String(Math.min(999, Math.max(1, sekarang + arah)));
    setErrorField(inputQty, null);
    renderPratinjau();
  }

  for (const el of [inputHarga, inputQty, inputMarkup]) {
    el.addEventListener('input', () => {
      setErrorField(el, null);
      renderPratinjau();
    });
  }

  // ---------- Combobox nama barang ----------
  let dataSaran = null;
  let memuatSaran = null;
  let cocok = [];
  let aktif = -1;

  const kunciSaran = (s) => `${kecil(s.nama_barang)}\0${s.harga_aud}`;

  /** Gabung tanpa duplikat (nama tidak peka huruf besar/kecil + harga, sama dengan API), urut A–Z. */
  function gabungSaran(tambahan) {
    const peta2 = new Map((dataSaran ?? []).map((s) => [kunciSaran(s), s]));
    for (const s of tambahan) if (!peta2.has(kunciSaran(s))) peta2.set(kunciSaran(s), s);
    dataSaran = [...peta2.values()].sort((a, b) => a.nama_barang.localeCompare(b.nama_barang, 'id'));
  }

  // Daftar saran hanya dibuka karena ketikan (atau panah bawah), bukan karena data selesai dimuat
  // saat field berisi nilai lama, supaya tata letak tidak bergeser tiba-tiba.
  let menungguSaran = false;

  function muatSaran() {
    memuatSaran ??= saran()
      .then((d) => {
        gabungSaran(d);
        if (menungguSaran && document.activeElement === inputNama) tampilkanSaran();
        menungguSaran = false;
      })
      .catch((err) => {
        catatJikaBug(err); // saran hanya bantuan: kalau gagal, form tetap bisa dipakai
        memuatSaran = null;
      });
  }

  function tutupSaran() {
    listSaran.hidden = true;
    listSaran.replaceChildren();
    inputNama.setAttribute('aria-expanded', 'false');
    inputNama.removeAttribute('aria-activedescendant');
    cocok = [];
    aktif = -1;
  }

  function tampilkanSaran() {
    const q = kecil(inputNama.value.trim());
    cocok = q && dataSaran ? dataSaran.filter((s) => kecil(s.nama_barang).includes(q)).slice(0, MAKS_SARAN) : [];
    if (!cocok.length) {
      tutupSaran();
      return;
    }
    aktif = -1;
    listSaran.replaceChildren(
      ...cocok.map((s, i) =>
        h(
          'li',
          {
            id: `${id}-saran-${i}`,
            role: 'option',
            'aria-selected': 'false',
            class: 'flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-page aria-selected:bg-primary-soft',
            onMousedown: (e) => e.preventDefault(), // fokus tetap di input
            onClick: () => pilihSaran(i),
          },
          h('span', { class: 'min-w-0 break-words' }, s.nama_barang),
          ' ', // pemisah untuk nama aksesibel ("Barang A AUD 24,95"); tidak tampil di flex
          h('span', { class: 'shrink-0 text-ink-muted tabular-nums' }, formatAud(s.harga_aud)),
        ),
      ),
    );
    listSaran.hidden = false;
    inputNama.setAttribute('aria-expanded', 'true');
    inputNama.removeAttribute('aria-activedescendant');
  }

  function aturAktif(i) {
    aktif = i;
    [...listSaran.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) {
      inputNama.setAttribute('aria-activedescendant', `${id}-saran-${i}`);
      listSaran.children[i].scrollIntoView({ block: 'nearest' });
    } else inputNama.removeAttribute('aria-activedescendant');
  }

  function pilihSaran(i) {
    const s = cocok[i];
    if (!s) return;
    inputNama.value = s.nama_barang;
    inputHarga.value = audUntukInput(s.harga_aud);
    setErrorField(inputNama, null);
    setErrorField(inputHarga, null);
    tutupSaran();
    renderPratinjau();
  }

  inputNama.addEventListener('focus', muatSaran);
  inputNama.addEventListener('input', () => {
    setErrorField(inputNama, null);
    menungguSaran = dataSaran === null;
    tampilkanSaran();
  });
  inputNama.addEventListener('blur', () => {
    menungguSaran = false;
    tutupSaran();
  });
  inputNama.addEventListener('keydown', (e) => {
    const terbuka = !listSaran.hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!terbuka) tampilkanSaran();
      if (cocok.length) aturAktif((aktif + 1) % cocok.length);
    } else if (e.key === 'ArrowUp') {
      if (!terbuka) return;
      e.preventDefault();
      aturAktif(aktif <= 0 ? cocok.length - 1 : aktif - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (terbuka && aktif >= 0) pilihSaran(aktif);
      else {
        tutupSaran();
        inputHarga.focus();
      }
    } else if (e.key === 'Escape' && terbuka) {
      // Esc menutup daftar saran saja, bukan sheet.
      e.preventDefault();
      e.stopPropagation();
      tutupSaran();
    } else if (e.key === 'Tab') {
      tutupSaran();
    }
  });

  // Enter di field berurutan pindah ke field berikutnya; Enter di Markup (terakhir) = Simpan.
  for (const [el, berikut] of [[inputHarga, inputQty], [inputQty, inputMarkup]]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        berikut.focus();
      }
    });
  }

  // ---------- Simpan ----------
  const nilai = () => ({ nama: inputNama.value, harga: inputHarga.value, qty: inputQty.value, markup: inputMarkup.value });

  async function kirim(tambahLagi) {
    if (menyimpan) return;
    setBanner(bannerForm, null);
    tutupSaran();
    const { errors, body } = validasiBarang(nilai());
    if (!body) {
      terapkanError(peta, errors, { bannerWadah: bannerForm });
      if (FIELD_HARGA.some((k) => k in errors)) renderPratinjau({ paksaKosong: true });
      return;
    }
    terapkanError(peta, {}, { bannerWadah: bannerForm, fokus: false });
    const ctx = { mode, baris, tambahLagi };
    const p = hitung();
    menyimpan = true;
    const [tombol, lain] = tambahLagi ? [tombolKedua, tombolSimpan] : [tombolSimpan, tombolKedua];
    lain.disabled = true;
    const pulihkan = tombolMemuat(tombol, 'Menyimpan…');
    let hasil;
    try {
      hasil = await simpan(body, { ...ctx, pratinjau: p });
    } catch (err) {
      catatJikaBug(err);
      pulihkan();
      lain.disabled = false;
      menyimpan = false;
      if (err instanceof ApiError && err.kode === 'VALIDASI') {
        const { tidakDikenal } = terapkanError(peta, err.field, { bannerWadah: bannerForm });
        if (FIELD_HARGA.some((k) => k in err.field)) renderPratinjau({ paksaKosong: true });
        if (!Object.keys(err.field).length && !tidakDikenal.length) setBanner(bannerForm, { jenis: 'error', pesan: err.pesan });
      } else {
        setBanner(bannerForm, { jenis: 'error', pesan: pesanError(err, 'simpan') });
      }
      return;
    }
    pulihkan();
    lain.disabled = false;
    menyimpan = false;
    sesudahSimpan(hasil, ctx);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    kirim(false);
  });

  // ---------- Mode, reset, perubahan ----------

  function renderBannerKurs() {
    const tampil = mode === 'tambah' && !ktx.kursTerkunci;
    bannerKurs.hidden = !tampil;
    bannerKurs.replaceChildren(tampil ? banner({ jenis: 'info', pesan: `Kurs ${formatRupiah(ktx.kurs)} akan terkunci setelah barang pertama disimpan.` }) : '');
  }

  function isi({ nama = '', harga = '', qty = '1', markup = ktx.defaultMarkup ?? '' }) {
    inputNama.value = nama;
    inputHarga.value = harga;
    inputQty.value = qty;
    inputMarkup.value = markup;
    for (const el of Object.values(peta)) setErrorField(el, null);
    setBanner(bannerForm, null);
    tutupSaran();
    bukaRincian(false);
    awal = nilai();
    renderPratinjau({ umumkanPerubahan: false });
  }

  /** @param {'tambah'|'ubah'} m @param {object|null} b baris dari objek keranjang (mode ubah) */
  function aturMode(m, b = null) {
    mode = m;
    baris = m === 'ubah' ? b : null;
    const ubah = mode === 'ubah';
    if (judulKartu) judulKartu.textContent = ubah ? 'Ubah barang' : 'Tambah barang';
    tombolSimpan.textContent = ubah ? 'Simpan perubahan' : 'Simpan';
    tombolKedua.textContent = ubah ? 'Batal' : 'Simpan & tambah lagi';
    form.dataset.mode = mode;
    renderBannerKurs();
    if (ubah) {
      isi({ nama: b.nama_barang, harga: audUntukInput(b.harga_aud), qty: String(b.qty), markup: persenUntukInput(b.markup_persen) });
    } else {
      isi({});
    }
    onModeBerubah?.(mode);
  }

  function adaPerubahan() {
    const n = nilai();
    return Object.keys(n).some((k) => n[k].trim() !== awal[k].trim());
  }

  aturMode('tambah');

  return {
    el: form,
    judul: judulKartu,
    inputNama,
    get mode() {
      return mode;
    },
    get baris() {
      return baris;
    },
    aturMode,
    reset: () => aturMode('tambah'),
    adaPerubahan,
    fokus: () => inputNama.focus(),
    /** Kurs PO + status terkunci terbaru dari objek keranjang (setelah setiap aksi). */
    setKonteks(baru) {
      ktx = { ...ktx, ...baru };
      renderBannerKurs();
      renderPratinjau({ umumkanPerubahan: false });
    },
    /** Barang yang baru disimpan langsung ikut jadi saran, tanpa mengambil ulang daftar. */
    tambahSaran(item) {
      gabungSaran([{ nama_barang: item.nama_barang, harga_aud: item.harga_aud }]);
    },
  };
}
