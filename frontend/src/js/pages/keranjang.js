// Keranjang customer dalam Open PO (ui-spec §6.5–§6.8, §7.6): ringkasan + StatusBadge, daftar
// barang (variant Kosong) dengan ActionSheet (mobile) atau tombol langsung + kartu form (lg),
// riwayat pembayaran, pembayaran, pengembalian dana, salin rekap WA.
// Semua angka ringkasan, status, dan teks rekap dari API. Setiap aksi mengembalikan objek
// keranjang lengkap, dan layar selalu dirender ulang dari objek itu (tidak dihitung di sini).
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { $, h, idUnik, isi, wajib } from '../lib/dom.js';
import { formatPersen, formatRupiah, formatRupiahPengembalian, formatTanggal, persenUntukInput } from '../lib/format.js';
import { ikon } from '../lib/ikon.js';
import { idDariQuery, rute } from '../lib/rute.js';
import { bukaSheet, konfirmasi, pilihAksi } from '../ui/dialog.js';
import { buatFormBarang } from '../ui/form-barang.js';
import { bukaSheetUang } from '../ui/form-uang.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { KELAS } from '../ui/kelas.js';
import {
  STATUS_BAYAR, aksiCobaLagi, badgeNetral, badgeStatus, banner, barisUang, emptyState, setBanner, skeletonBaris,
  skeletonRingkasan, tombolMemuat,
} from '../ui/komponen.js';
import { toast } from '../ui/toast.js';

mulaiHalaman();

const TERSALIN_MS = 2000;
const params = new URLSearchParams(location.search);
const idPo = idDariQuery(params.get('po'));
const idCustomer = idDariQuery(params.get('customer'));

const judul = wajib('#judul');
const subjudul = wajib('#subjudul');
const bannerHalaman = wajib('[data-banner-halaman]');
const bannerArsip = wajib('#banner-arsip');
const memuat = wajib('#memuat');
const isiKeranjang = wajib('#isi-keranjang');
const kartuForm = wajib('#kartu-form-barang');
const judulBarang = wajib('#judul-barang');
const bannerBarang = wajib('#banner-barang');
const daftarBarang = wajib('#daftar-barang');
const elRingkasan = wajib('#ringkasan');
const blokPengembalian = wajib('#blok-pengembalian');
const judulRiwayat = wajib('#judul-riwayat');
const bannerRiwayat = wajib('#banner-riwayat');
const daftarRiwayat = wajib('#daftar-riwayat');
const stickyBar = wajib('#sticky-bar');
const tombolTambah = wajib('#tambah-barang');
const tombolSalin = [...document.querySelectorAll('[data-salin-rekap]')];
const lg = matchMedia('(min-width: 1024px)');

if (idPo !== null) wajib('#tautan-kembali').href = rute.poDetail(idPo);

/** Objek keranjang terakhir dari API (kontrak §10). */
let k = null;
let defaultMarkup = null;
let formKartu = null;
let formSheet = null;

const rp = (n) => formatRupiah(n);
const labelStatus = (s) => STATUS_BAYAR[s]?.label ?? s;
const denganStatus = (pesan, lama) => (k.ringkasan.status !== lama ? `${pesan} Status: ${labelStatus(k.ringkasan.status)}.` : pesan);
/** Customer diarsipkan tanpa keranjang di PO ini: server menolak barang/pembayaran baru (409). */
const arsipTanpaKeranjang = () => k.customer.diarsipkan && k.barang.length === 0 && k.riwayat.length === 0;

// ---------- Saran nama barang: diambil sekali per halaman, difilter di perangkat ----------

let saranData = null;
let saranJanji = null;
function saran() {
  if (saranData) return Promise.resolve(saranData);
  saranJanji ??= Api.barangUnik(idPo).then(
    ({ data }) => (saranData = data),
    (err) => {
      saranJanji = null;
      throw err;
    },
  );
  return saranJanji;
}
function catatSaran(b) {
  if (!b) return;
  const item = { nama_barang: b.nama_barang, harga_aud: b.harga_aud };
  if (saranData) saranData = [...saranData, item];
  formKartu?.tambahSaran(item);
  formSheet?.tambahSaran(item);
}

// ---------- Render ----------

/**
 * Render ulang seluruh layar dari objek keranjang. Fokus yang hilang karena elemennya diganti
 * dipindah ke elemen pengganti (data-fokus sama), atau ke `fokusCadangan` (mis. baris dihapus).
 */
function render(baru, { fokusCadangan = null, asal = document.activeElement } = {}) {
  // `asal` = elemen yang fokus saat aksi dimulai (tombol yang dinonaktifkan saat memuat bisa
  // sudah kehilangan fokus ketika respons datang).
  const kunci = asal?.dataset?.fokus ?? null;
  k = baru;
  renderJudul();
  renderRingkasan();
  renderBarang();
  renderRiwayat();
  renderPengembalian();
  renderAksi();
  formKartu?.setKonteks(konteksForm());
  const sekarang = document.activeElement;
  const fokusHilang = !sekarang || sekarang === document.body || !sekarang.isConnected;
  if (asal && asal !== document.body && !asal.isConnected && fokusHilang) {
    const ganti = kunci ? $(`[data-fokus="${CSS.escape(kunci)}"]`) : null;
    (ganti?.checkVisibility() ? ganti : fokusCadangan)?.focus();
  }
}

function renderJudul() {
  judul.textContent = k.customer.nama;
  subjudul.textContent = `${k.open_po.nama} · ${k.customer.no_wa_tampil}`;
  subjudul.hidden = false;
  document.title = `${k.customer.nama} · ${k.open_po.nama} · Jastip Admin`;
}

/** "Dana diterima" + rincian "Sudah dibayar … · Dikembalikan …" jika ada pengembalian dana. */
function barisDana(r) {
  if (r.total_pengembalian === 0) return barisUang('Dana diterima', rp(r.dana_diterima));
  return h(
    'div',
    { class: 'flex flex-wrap items-baseline justify-between gap-x-4 py-1' },
    h('dt', { class: 'text-ink-muted' }, 'Dana diterima'),
    h('dd', { class: 'tabular-nums text-ink' }, rp(r.dana_diterima)),
    h(
      'dd',
      { class: 'basis-full pl-3 text-sm text-ink-muted tabular-nums', dataset: { rincianDana: '' } },
      // Label dan nominal tidak dipisah saat baris turun (ui-spec §7.6: dua baris di 360px).
      h('span', { class: 'whitespace-nowrap' }, `Sudah dibayar ${rp(r.total_pembayaran)}`),
      ' · ',
      h('span', { class: 'whitespace-nowrap' }, `Dikembalikan ${rp(r.total_pengembalian)}`),
    ),
  );
}

function tombolCatatPembayaran(kelas) {
  return h('button', { type: 'button', class: `${kelas} w-full`, 'aria-haspopup': 'dialog', dataset: { fokus: 'catat-pembayaran' }, onClick: catatPembayaran }, 'Catat pembayaran');
}

function renderRingkasan() {
  const r = k.ringkasan;
  const lebih = r.status === 'lebih_bayar';
  const arsip = arsipTanpaKeranjang();
  let aksi = null;
  if (lebih) {
    aksi = h(
      'div',
      { class: 'mt-4 space-y-3' },
      banner({ jenis: 'info', pesan: `Kembalikan ${rp(r.kelebihan_bayar)} ke customer di luar aplikasi, lalu catat di sini.` }),
      h('button', { type: 'button', class: `${KELAS.tombolPrimary} w-full`, 'aria-haspopup': 'dialog', dataset: { fokus: 'catat-pengembalian' }, onClick: catatPengembalian }, 'Catat pengembalian dana'),
      tombolCatatPembayaran(KELAS.tombolSecondary),
    );
  } else if (!arsip) {
    aksi = h('div', { class: 'mt-4' }, tombolCatatPembayaran(KELAS.tombolSecondary));
  }
  isi(
    elRingkasan,
    h(
      'div',
      { class: KELAS.kartu, dataset: { ringkasanKeranjang: r.status } },
      h('h2', { id: 'judul-ringkasan', class: 'sr-only' }, 'Ringkasan'),
      badgeStatus(r.status),
      h(
        'dl',
        { class: 'mt-3' },
        barisUang('Total', rp(r.total)),
        barisUang(`DP ${formatPersen(r.dp_persen)}`, rp(r.dp)),
        barisDana(r),
        // Tidak pernah rupiah negatif: sisa < 0 tampil sebagai Kelebihan bayar (ui-spec §7.6).
        lebih ? barisUang('Kelebihan bayar', rp(r.kelebihan_bayar), { kuat: true }) : barisUang('Sisa pelunasan', rp(r.sisa), { kuat: true }),
      ),
      aksi,
    ),
  );
}

const teksQtyHarga = (b) => `${b.qty} × ${rp(b.harga_jual_unit)}`;

/** Isi baris barang (OrderLineRow). Dibuat ulang untuk varian mobile dan lg (node tidak bisa dipakai dua kali). */
function kontenBaris(b, kanan = null) {
  return [
    h(
      'span',
      { class: 'flex items-start justify-between gap-3' },
      h(
        'span',
        { class: 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1' },
        h('span', { class: `font-semibold break-words ${b.kosong ? 'text-ink-muted' : ''}` }, b.nama_barang),
        b.kosong ? badgeNetral('Kosong', 'no-symbol') : null,
      ),
      kanan,
    ),
    h(
      'span',
      { class: 'mt-1 flex items-baseline justify-between gap-3 tabular-nums' },
      b.kosong
        ? [h('s', { class: 'text-ink-muted' }, teksQtyHarga(b)), h('span', { class: 'text-ink-muted' }, 'tidak dihitung')]
        : [h('span', { class: 'text-ink-muted' }, teksQtyHarga(b)), h('span', { class: 'font-semibold' }, rp(b.subtotal))],
    ),
  ];
}

function barisBarang(b) {
  const nama = b.nama_barang;
  const mobile = h(
    'button',
    {
      type: 'button',
      class: 'block w-full px-4 py-3 text-left hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary lg:hidden',
      'aria-haspopup': 'dialog',
      dataset: { fokus: `baris-${b.id}-menu` },
      onClick: (e) => menuBaris(b, e.currentTarget),
    },
    kontenBaris(b, ikon('ellipsis-horizontal', 24, 'size-6 shrink-0 text-ink-muted')),
  );
  const tombolKosong = h(
    'button',
    {
      type: 'button',
      class: KELAS.tombolBaris,
      'aria-label': `${b.kosong ? 'Lepas tanda Kosong' : 'Tandai Kosong'} ${nama}`,
      title: b.kosong ? null : 'Barang tidak tersedia, tidak ditagih',
      dataset: { fokus: `baris-${b.id}-kosong` },
      onClick: (e) => aturKosong(b, !b.kosong, e.currentTarget),
    },
    b.kosong ? 'Lepas tanda Kosong' : 'Tandai Kosong',
  );
  const desktop = h(
    'div',
    { class: 'hidden items-center gap-4 px-4 py-3 lg:flex' },
    h('div', { class: 'min-w-0 flex-1' }, kontenBaris(b)),
    h(
      'div',
      // Lebar tetap supaya kolom subtotal rata walau label "Lepas tanda Kosong" lebih panjang.
      { class: 'flex w-84 shrink-0 justify-end gap-1' },
      h('button', { type: 'button', class: KELAS.tombolBaris, 'aria-label': `Ubah ${nama}`, dataset: { fokus: `baris-${b.id}-ubah` }, onClick: () => ubahBaris(b) }, 'Ubah'),
      tombolKosong,
      h('button', { type: 'button', class: KELAS.tombolBarisDanger, 'aria-label': `Hapus ${nama}`, dataset: { fokus: `baris-${b.id}-hapus` }, onClick: () => hapusBaris(b) }, 'Hapus'),
    ),
  );
  return h('li', { dataset: b.kosong ? { barisId: b.id, kosong: '' } : { barisId: b.id } }, mobile, desktop);
}

function renderBarang() {
  judulBarang.textContent = `Barang (${k.barang.length})`;
  if (!k.barang.length) {
    const kosong = emptyState({
      pesan: `Belum ada barang untuk ${k.customer.nama}.`,
      aksi: arsipTanpaKeranjang() ? null : { label: 'Tambah barang', onClick: bukaTambahBarang },
    });
    const t = kosong.querySelector('button');
    if (t) t.dataset.fokus = 'tambah-barang';
    isi(daftarBarang, kosong);
    return;
  }
  isi(daftarBarang, h('ul', { class: KELAS.kartuDaftar }, k.barang.map(barisBarang)));
}

function barisRiwayat(r) {
  const kembali = r.jenis === 'pengembalian_dana';
  const jenis = kembali ? 'Pengembalian dana' : 'Pembayaran';
  const tgl = formatTanggal(r.tanggal);
  return h(
    'li',
    { class: 'flex items-start gap-2 py-3 pr-1 pl-4', dataset: { riwayat: `${r.jenis}-${r.id}` } },
    h(
      'div',
      { class: 'min-w-0 flex-1 pt-2.5' },
      h('div', { class: 'flex items-baseline justify-between gap-3' }, h('span', { class: 'tabular-nums' }, tgl), h('span', { class: 'font-semibold tabular-nums' }, kembali ? formatRupiahPengembalian(r.nominal) : rp(r.nominal))),
      h('p', { class: 'text-sm text-ink-muted' }, jenis),
      r.catatan ? h('p', { class: 'text-sm text-ink-muted break-words' }, r.catatan) : null,
    ),
    h(
      'button',
      {
        type: 'button',
        class: `${KELAS.tombolIkon} text-ink-muted hover:text-danger focus-visible:text-danger`,
        'aria-label': `Hapus ${jenis.toLowerCase()} ${rp(r.nominal)}, ${tgl}`,
        dataset: { fokus: `riwayat-${r.jenis}-${r.id}` },
        onClick: (e) => hapusRiwayat(r, e.currentTarget),
      },
      ikon('trash', 24, 'size-6'),
    ),
  );
}

function renderRiwayat() {
  // Riwayat: terbaru di atas (urutan dari API).
  isi(daftarRiwayat, k.riwayat.length ? h('ul', { class: KELAS.kartuDaftar }, k.riwayat.map(barisRiwayat)) : emptyState({ pesan: 'Belum ada pembayaran.' }));
}

/** Di luar status Lebih bayar, tombol pengembalian dana nonaktif + teks penjelas (ui-spec §6.7). */
function renderPengembalian() {
  const lebih = k.ringkasan.status === 'lebih_bayar';
  blokPengembalian.hidden = lebih;
  if (lebih) {
    isi(blokPengembalian);
    return;
  }
  isi(
    blokPengembalian,
    h('button', { type: 'button', class: `${KELAS.tombolSecondary} w-full`, 'aria-disabled': 'true', 'aria-describedby': 'bantuan-pengembalian', dataset: { fokus: 'catat-pengembalian' } }, 'Catat pengembalian dana'),
    h('p', { id: 'bantuan-pengembalian', class: 'mt-1 text-sm text-ink-muted' }, 'Aktif saat status Lebih bayar.'),
  );
}

function renderAksi() {
  const arsip = arsipTanpaKeranjang();
  setBanner(bannerArsip, arsip ? { jenis: 'warning', pesan: 'Customer ini sudah diarsipkan. Barang dan pembayaran baru tidak bisa dicatat.' } : null);
  tombolTambah.hidden = arsip;
  // Kartu form lg disembunyikan, kecuali masih berisi isian (mis. baru saja ditolak 409):
  // isian dan pesan error tetap terlihat sampai halaman dimuat ulang.
  if (!arsip || !formKartu?.adaPerubahan()) kartuForm.classList.toggle('lg:block', !arsip);
}

const konteksForm = () => ({ kurs: k.open_po.kurs_jastip, kursTerkunci: k.open_po.kurs_terkunci, defaultMarkup });

// ---------- Barang: tambah / ubah ----------

/** Simpan lewat API. Angka respons dibandingkan dengan pratinjau (ui-spec §12.3). */
async function simpanBarang(body, { mode, baris, pratinjau }) {
  let res;
  try {
    res = mode === 'ubah' ? await Api.ubahBarang(baris.id, body) : await Api.tambahBarang(idPo, idCustomer, body);
  } catch (err) {
    // Data berubah di tempat lain (baris dihapus, customer diarsipkan): muat ulang di belakang sheet.
    if (err instanceof ApiError && (err.status === 404 || err.status === 409)) muatUlang();
    throw err;
  }
  const idBaris = mode === 'ubah' ? baris.id : res.meta?.dibuat?.id;
  const hasil = res.data.barang.find((x) => x.id === idBaris) ?? null;
  if (hasil && pratinjau && (BigInt(hasil.harga_jual_unit) !== pratinjau.hargaJualUnit || BigInt(hasil.subtotal) !== pratinjau.subtotal)) {
    console.warn('Pratinjau harga berbeda dari server', {
      barang: hasil.nama_barang,
      pratinjau: { harga_jual_unit: String(pratinjau.hargaJualUnit), subtotal: String(pratinjau.subtotal) },
      server: { harga_jual_unit: hasil.harga_jual_unit, subtotal: hasil.subtotal },
    });
  }
  return { keranjang: res.data, baris: hasil, nama: hasil?.nama_barang ?? body.nama_barang };
}

const pesanSimpan = (hasil, mode) => (mode === 'ubah' ? 'Perubahan disimpan.' : `${hasil.nama} disimpan.`);

function bukaSheetBarang(mode, b = null) {
  let sheet = null;
  const form = buatFormBarang({
    varian: 'sheet',
    konteks: konteksForm(),
    saran,
    simpan: simpanBarang,
    sesudahSimpan: async (hasil, ctx) => {
      render(hasil.keranjang);
      catatSaran(hasil.baris);
      if (ctx.tambahLagi) {
        // Form dikosongkan (markup kembali ke default), fokus ke Nama barang (ui-spec §6.5).
        form.setKonteks(konteksForm());
        form.reset();
        form.fokus();
      } else {
        await sheet.tutup(true);
      }
      toast(pesanSimpan(hasil, ctx.mode));
    },
    onBatal: () => sheet.tutup(),
  });
  if (mode === 'ubah') form.aturMode('ubah', b);
  formSheet = form;
  sheet = bukaSheet({
    judul: mode === 'ubah' ? 'Ubah barang' : 'Tambah barang',
    isi: form.el,
    adaPerubahan: form.adaPerubahan,
    fokusAwal: () => form.inputNama,
    onTutup: () => {
      if (formSheet === form) formSheet = null;
    },
  });
}

const konfirmasiBuangIsian = () =>
  konfirmasi({ judul: 'Tutup tanpa menyimpan?', isi: 'Isian di form ini akan hilang.', labelBatal: 'Kembali ke form', labelAksi: 'Tutup', nada: 'danger' });

function gulirKeKartu() {
  kartuForm.scrollIntoView({ block: 'start' });
  formKartu.inputNama.focus({ preventScroll: true });
}

function fokusBaris(idBaris) {
  const el = $(`[data-fokus="baris-${idBaris}-ubah"]`);
  if (el) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }
}

/** Kartu "Tambah barang" yang selalu terbuka di lg (ui-spec §7.6 Desktop). */
function siapkanKartuForm() {
  formKartu = buatFormBarang({
    varian: 'kartu',
    konteks: konteksForm(),
    saran,
    simpan: simpanBarang,
    sesudahSimpan: (hasil, ctx) => {
      render(hasil.keranjang);
      catatSaran(hasil.baris);
      formKartu.reset();
      if (ctx.tambahLagi) formKartu.fokus();
      else if (hasil.baris) fokusBaris(hasil.baris.id);
      toast(pesanSimpan(hasil, ctx.mode));
    },
    onBatal: async () => {
      const b = formKartu.baris;
      if (formKartu.adaPerubahan() && !(await konfirmasiBuangIsian())) return;
      formKartu.reset();
      if (b) fokusBaris(b.id);
    },
  });
  kartuForm.setAttribute('aria-labelledby', formKartu.judul.id);
  isi(kartuForm, formKartu.el);
}

function bukaTambahBarang() {
  if (arsipTanpaKeranjang()) return;
  if (lg.matches && formKartu) {
    gulirKeKartu();
    return;
  }
  bukaSheetBarang('tambah');
}

async function ubahBaris(b) {
  if (!lg.matches || !formKartu) {
    bukaSheetBarang('ubah', b);
    return;
  }
  const sedangBaris = formKartu.mode === 'ubah' && formKartu.baris?.id === b.id;
  if (!sedangBaris && formKartu.adaPerubahan() && !(await konfirmasiBuangIsian())) return;
  if (!sedangBaris) formKartu.aturMode('ubah', b);
  gulirKeKartu();
}

async function menuBaris(b, tombol) {
  const pilihan = await pilihAksi({
    judul: b.nama_barang,
    subjudul: b.kosong ? h('span', {}, h('s', {}, teksQtyHarga(b)), ' · tidak dihitung') : `${teksQtyHarga(b)} · ${rp(b.subtotal)}`,
    aksi: [
      { nilai: 'ubah', label: 'Ubah', ikon: 'pencil-square' },
      b.kosong
        ? { nilai: 'lepas', label: 'Lepas tanda Kosong', ikon: 'arrow-uturn-left' }
        : { nilai: 'kosong', label: 'Tandai Kosong', bantuan: 'Barang tidak tersedia, tidak ditagih', ikon: 'no-symbol' },
      { nilai: 'hapus', label: 'Hapus', ikon: 'trash', nada: 'danger' },
    ],
  });
  if (pilihan === 'ubah') bukaSheetBarang('ubah', b);
  else if (pilihan === 'kosong' || pilihan === 'lepas') aturKosong(b, pilihan === 'kosong', tombol);
  else if (pilihan === 'hapus') hapusBaris(b);
}

/** Tombol baris saat memuat: nonaktif + spinner, tanpa mengganti isi baris. */
function barisMemuat(tombol) {
  if (!tombol?.isConnected) return () => {};
  if (tombol.classList.contains('lg:hidden')) {
    tombol.disabled = true;
    tombol.setAttribute('aria-busy', 'true');
    return () => {
      tombol.disabled = false;
      tombol.removeAttribute('aria-busy');
    };
  }
  return tombolMemuat(tombol, 'Menyimpan…');
}

/** Tandai / lepas Kosong: langsung tersimpan tanpa dialog (bisa dibatalkan), ui-spec §6.6. */
async function aturKosong(b, tandai, tombol) {
  if (tombol?.disabled) return;
  setBanner(bannerBarang, null);
  const lama = k.ringkasan.status;
  const asal = document.activeElement;
  const pulihkan = barisMemuat(tombol);
  try {
    const { data } = tandai ? await Api.tandaiKosong(b.id) : await Api.lepasKosong(b.id);
    render(data, { fokusCadangan: judulBarang, asal });
    toast(denganStatus(tandai ? `${b.nama_barang} ditandai Kosong.` : `Tanda Kosong ${b.nama_barang} dilepas.`, lama));
  } catch (err) {
    gagalAksi(err, bannerBarang, pulihkan);
  }
}

async function hapusBaris(b) {
  const ya = await konfirmasi({
    judul: `Hapus ${b.nama_barang}?`,
    isi: 'Hapus hanya untuk salah input. Kalau barang tidak tersedia, pilih Tandai Kosong supaya tetap tercatat di rekap.',
    labelAksi: 'Hapus barang',
    nada: 'danger',
  });
  if (!ya) return;
  setBanner(bannerBarang, null);
  const asal = document.activeElement;
  const pulihkan = barisMemuat(asal instanceof HTMLButtonElement ? asal : null);
  try {
    const { data } = await Api.hapusBarang(b.id);
    if (formKartu?.mode === 'ubah' && formKartu.baris?.id === b.id) formKartu.reset();
    render(data, { fokusCadangan: judulBarang, asal });
    toast(`${b.nama_barang} dihapus.`);
  } catch (err) {
    gagalAksi(err, bannerBarang, pulihkan);
  }
}

/** Error aksi tanpa form: banner di bagian terkait; 404/409 = data berubah di tempat lain → muat ulang. */
function gagalAksi(err, wadah, pulihkan) {
  catatJikaBug(err);
  pulihkan?.();
  setBanner(wadah, { jenis: 'error', pesan: pesanError(err, 'aksi') });
  if (err instanceof ApiError && (err.status === 404 || err.status === 409)) muatUlang();
}

// ---------- Pembayaran dan pengembalian dana ----------

function catatPembayaran() {
  if (arsipTanpaKeranjang()) return;
  bukaSheetUang({
    jenis: 'pembayaran',
    ringkasan: k.ringkasan,
    simpan: async (body) => (await Api.catatPembayaran(idPo, idCustomer, body)).data,
    sesudahSimpan: async (data, nominal, sheet) => {
      render(data);
      await sheet.tutup(true);
      toast(`Pembayaran ${rp(nominal)} dicatat.`);
    },
    onKonflik: muatUlang,
  });
}

function catatPengembalian() {
  if (k.ringkasan.status !== 'lebih_bayar') return;
  bukaSheetUang({
    jenis: 'pengembalian',
    ringkasan: k.ringkasan,
    simpan: async (body) => (await Api.catatPengembalian(idPo, idCustomer, body)).data,
    sesudahSimpan: async (data, nominal, sheet) => {
      render(data);
      await sheet.tutup(true);
      toast(`Pengembalian dana ${rp(nominal)} dicatat.`);
    },
    onKonflik: muatUlang,
  });
}

const infoHapusPengembalianDulu = (pesan) =>
  konfirmasi({
    judul: 'Hapus pengembalian dana dulu',
    isi:
      pesan ??
      `Pembayaran ini tidak bisa dihapus karena sudah ada pengembalian dana ${rp(k.ringkasan.total_pengembalian)}. Hapus pengembalian dana tersebut dulu, lalu hapus pembayaran ini.`,
    labelAksi: 'Mengerti',
    nada: 'primary',
    labelBatal: null,
  });

/** Tombol ikon 44px saat memuat: spinner menggantikan ikon, label aksesibel tetap. */
function ikonMemuat(tombol) {
  const asli = [...tombol.childNodes];
  tombol.disabled = true;
  tombol.setAttribute('aria-busy', 'true');
  tombol.replaceChildren(h('span', { class: KELAS.spinner, 'aria-hidden': 'true' }));
  return () => {
    tombol.replaceChildren(...asli);
    tombol.disabled = false;
    tombol.removeAttribute('aria-busy');
  };
}

async function hapusRiwayat(r, tombol) {
  if (tombol.disabled) return;
  const bayar = r.jenis === 'pembayaran';
  const nominal = rp(r.nominal);
  const tgl = formatTanggal(r.tanggal);
  if (bayar && !r.bisa_dihapus) {
    await infoHapusPengembalianDulu();
    return;
  }
  const ya = await konfirmasi(
    bayar
      ? {
          judul: `Hapus pembayaran ${nominal}?`,
          isi: `Pembayaran tanggal ${tgl} akan dihapus dan status dihitung ulang. Kalau nominalnya salah, catat ulang nominal yang benar setelah ini.`,
          labelAksi: 'Hapus pembayaran',
        }
      : {
          judul: `Hapus pengembalian dana ${nominal}?`,
          isi: `Pengembalian dana tanggal ${tgl} akan dihapus dan status dihitung ulang.`,
          labelAksi: 'Hapus',
        },
  );
  if (!ya) return;
  setBanner(bannerRiwayat, null);
  const lama = k.ringkasan.status;
  const pulihkan = ikonMemuat(tombol);
  try {
    const { data } = bayar ? await Api.hapusPembayaran(r.id) : await Api.hapusPengembalian(r.id);
    render(data, { fokusCadangan: judulRiwayat, asal: tombol });
    toast(denganStatus(`${bayar ? 'Pembayaran' : 'Pengembalian dana'} ${nominal} dihapus.`, lama));
  } catch (err) {
    if (err instanceof ApiError && err.kode === 'HAPUS_PENGEMBALIAN_DULU') {
      // Pengembalian dana baru dicatat di tempat lain: tampilkan dialog info dari server.
      pulihkan();
      await infoHapusPengembalianDulu(err.pesan);
      muatUlang();
      return;
    }
    gagalAksi(err, bannerRiwayat, pulihkan);
  }
}

// ---------- Salin rekap WA ----------

/**
 * Salin teks rekap dari API ke clipboard. Kalau tersedia, ClipboardItem diberi promise teks
 * supaya penulisan tetap dianggap bagian dari ketukan pengguna di Safari (yang menolak
 * writeText setelah await fetch). Mengembalikan teks, atau melempar {jenis: 'muat'|'clipboard'}.
 */
async function salinKeClipboard() {
  const janjiTeks = Api.rekap(idPo, idCustomer).then(({ data }) => data.teks);
  janjiTeks.catch(() => {}); // ditangani di bawah
  const clip = navigator.clipboard;
  if (clip?.write && typeof ClipboardItem === 'function') {
    // Teks bisa datang beberapa detik kemudian (mis. pemulihan tantangan hosting di api.js).
    // Kalau browser menolak write() lebih dulu, janji blob ini tidak boleh jadi unhandled rejection.
    const janjiBlob = janjiTeks.then((t) => new Blob([t], { type: 'text/plain' }));
    janjiBlob.catch(() => {});
    try {
      await clip.write([new ClipboardItem({ 'text/plain': janjiBlob })]);
      return await janjiTeks;
    } catch (err) {
      const teks = await janjiTeks.catch((e) => Promise.reject({ jenis: 'muat', err: e }));
      throw { jenis: 'clipboard', teks, err };
    }
  }
  const teks = await janjiTeks.catch((e) => Promise.reject({ jenis: 'muat', err: e }));
  try {
    if (!clip?.writeText) throw new Error('Clipboard API tidak tersedia');
    await clip.writeText(teks);
  } catch (err) {
    throw { jenis: 'clipboard', teks, err };
  }
  return teks;
}

function tandaiTersalin(tombol) {
  const asli = [...tombol.childNodes];
  tombol.dataset.tersalin = '';
  tombol.replaceChildren(ikon('check', 24, 'size-5'), 'Tersalin');
  setTimeout(() => {
    tombol.replaceChildren(...asli);
    delete tombol.dataset.tersalin;
  }, TERSALIN_MS);
}

function bukaSalinManual(teks) {
  const id = idUnik('salin');
  const area = h('textarea', { id, readonly: true, rows: 14, class: `${KELAS.textarea} text-base`, 'aria-describedby': `${id}-petunjuk`, spellcheck: 'false' });
  area.value = teks;
  bukaSheet({
    judul: 'Salin manual',
    isi: h(
      'div',
      { class: 'space-y-3' },
      h('p', { id: `${id}-petunjuk`, class: 'text-ink-muted' }, 'Rekap tidak bisa disalin otomatis. Tekan lama teks di bawah, lalu pilih Salin.'),
      h('label', { for: id, class: KELAS.label }, 'Teks rekap WA'),
      area,
    ),
    fokusAwal: () => area,
  });
  area.setSelectionRange(0, area.value.length);
  area.select();
}

async function salinRekap(tombol) {
  if (tombol.disabled || 'tersalin' in tombol.dataset) return;
  setBanner(bannerHalaman, null);
  const pulihkan = tombolMemuat(tombol, 'Menyalin…');
  try {
    await salinKeClipboard();
  } catch (e) {
    pulihkan();
    if (e?.jenis === 'clipboard') {
      bukaSalinManual(e.teks);
      return;
    }
    const err = e?.err ?? e;
    catatJikaBug(err);
    setBanner(bannerHalaman, { jenis: 'error', pesan: pesanError(err, 'muat'), aksi: aksiCobaLagi(err, () => salinRekap(tombol)) });
    bannerHalaman.scrollIntoView({ block: 'nearest' });
    return;
  }
  pulihkan();
  tandaiTersalin(tombol);
  toast(`Rekap ${k.customer.nama} tersalin. Tempel di chat WA.`);
}

for (const t of tombolSalin) t.addEventListener('click', () => salinRekap(t));
tombolTambah.addEventListener('click', bukaTambahBarang);

// ---------- Muat ----------

async function muatUlang() {
  try {
    const { data } = await Api.keranjang(idPo, idCustomer);
    render(data);
  } catch (err) {
    catatJikaBug(err);
    setBanner(bannerHalaman, { jenis: 'error', pesan: pesanError(err, 'muat'), aksi: aksiCobaLagi(err, muatUlang) });
  }
}

function gagalMuat(pesan, aksi) {
  isi(memuat, emptyState({ jenis: 'error', pesan, aksi }));
}

async function muat() {
  isiKeranjang.hidden = true;
  stickyBar.hidden = true;
  memuat.hidden = false;
  isi(memuat, h('div', { class: 'space-y-6 lg:max-w-96' }, skeletonRingkasan(), skeletonBaris(3)));
  const kePo = idPo !== null ? { label: 'Kembali ke Open PO', href: rute.poDetail(idPo), varian: 'secondary' } : { label: 'Lihat daftar Open PO', href: rute.beranda(), varian: 'secondary' };
  if (idPo === null || idCustomer === null) {
    gagalMuat(idPo === null ? 'Open PO tidak ditemukan.' : 'Customer tidak ditemukan.', kePo);
    return;
  }
  const [resK, resP] = await Promise.allSettled([Api.keranjang(idPo, idCustomer), Api.pengaturan()]);
  if (resK.status === 'rejected') {
    const err = resK.reason;
    catatJikaBug(err);
    if (err instanceof ApiError && err.status === 404) {
      gagalMuat(err.pesan, err.pesan === 'Open PO tidak ditemukan.' ? { label: 'Lihat daftar Open PO', href: rute.beranda(), varian: 'secondary' } : kePo);
    } else {
      gagalMuat(pesanError(err, 'muat'), aksiCobaLagi(err, muat, { varian: 'secondary' }));
    }
    return;
  }
  // Default markup dari Pengaturan; kalau gagal dimuat, field Markup kosong dan wajib diisi.
  if (resP.status === 'fulfilled') defaultMarkup = persenUntukInput(resP.value.data.default_markup_persen);
  else catatJikaBug(resP.reason);

  k = resK.value.data;
  if (!formKartu) siapkanKartuForm();
  render(k);
  memuat.hidden = true;
  isiKeranjang.hidden = false;
  stickyBar.hidden = false;
}

muat();
