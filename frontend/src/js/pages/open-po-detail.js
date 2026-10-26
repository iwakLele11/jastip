// Detail Open PO (ui-spec §7.4): KursCard, ringkasan PO, daftar customer + chip filter
// status (radio group) + tabel desktop. Semua angka dan jumlah per chip dari API.
import { Api, ApiError, catatJikaBug, pesanError } from '../lib/api.js';
import { h, isi, wajib } from '../lib/dom.js';
import { formatRupiah } from '../lib/format.js';
import { ikon } from '../lib/ikon.js';
import { idDariQuery, rute } from '../lib/rute.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { KELAS } from '../ui/kelas.js';
import {
  STATUS_BAYAR, URUTAN_STATUS, aksiCobaLagi, badgeStatus, barisUang, emptyState, setBanner, skeletonBaris,
  skeletonKursCard, tombolMemuat,
} from '../ui/komponen.js';
import { kartuKurs } from '../ui/kurs.js';
import { bukaSheetTambahCustomer } from '../ui/sheet-customer.js';

mulaiHalaman();

const PER_HALAMAN = 100;
const judul = wajib('#judul');
const memuat = wajib('#memuat');
const isiPo = wajib('#isi-po');
const kolomKiri = wajib('#kolom-kiri');
const bannerCustomer = wajib('#banner-customer');
const filterStatus = wajib('#filter-status');
const chipStatus = wajib('#chip-status');
const daftar = wajib('#daftar-customer');
const tautanUbah = wajib('#tautan-ubah');
const tambahHeader = wajib('#tambah-customer-header');
const fab = wajib('#fab-customer');

const params = new URLSearchParams(location.search);
const idPo = idDariQuery(params.get('id'));
let filter = URUTAN_STATUS.includes(params.get('status')) ? params.get('status') : 'semua';
let po = null;
let items = [];
let meta = null;
let urutPermintaan = 0;

// ---------- Render ----------

function renderKiri() {
  const r = po.ringkasan;
  isi(
    kolomKiri,
    kartuKurs(po),
    h(
      'section',
      { class: KELAS.kartu, 'aria-labelledby': 'ringkasan-judul', dataset: { ringkasanPo: '' } },
      h('h2', { id: 'ringkasan-judul', class: 'sr-only' }, 'Ringkasan Open PO'),
      h('dl', {}, barisUang('Customer', String(r.jumlah_customer)), barisUang('Total pesanan', formatRupiah(r.total_pesanan)), barisUang('Dana diterima', formatRupiah(r.dana_diterima))),
    ),
  );
}

function chip(nilai, label, jumlah) {
  return h(
    'label',
    {
      class: `group relative inline-flex h-11 cursor-pointer items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-page has-checked:border-primary has-checked:bg-primary has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary md:h-9`,
    },
    h('input', {
      type: 'radio',
      name: 'filter-status',
      value: nilai,
      class: 'absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0',
      checked: filter === nilai,
      onChange: () => gantiFilter(nilai),
    }),
    ikon('check', 16, 'hidden size-4 group-has-checked:block'),
    `${label} `,
    h('span', { class: 'tabular-nums' }, String(jumlah)),
  );
}

let chipTerakhir = '';

/** Chip hanya dirender ulang kalau jumlahnya berubah, supaya fokus keyboard tidak hilang. */
function renderChip() {
  const per = meta?.jumlah_per_status ?? {};
  const kunci = JSON.stringify(per);
  if (kunci === chipTerakhir) return;
  chipTerakhir = kunci;
  const fokus = chipStatus.contains(document.activeElement) ? document.activeElement.value : null;
  isi(chipStatus, chip('semua', 'Semua', per.semua ?? 0), URUTAN_STATUS.map((s) => chip(s, STATUS_BAYAR[s].label, per[s] ?? 0)));
  if (fokus) chipStatus.querySelector(`input[value="${fokus}"]`)?.focus();
}

function teksSisa(item) {
  return item.status === 'lebih_bayar' ? `Lebih ${formatRupiah(item.kelebihan_bayar)}` : formatRupiah(item.sisa);
}

function barisMobile(item) {
  const c = item.customer;
  return h(
    'li',
    {},
    h(
      'a',
      {
        href: rute.keranjang(po.id, c.id),
        class: `flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`,
        dataset: { customerId: c.id },
      },
      h('span', { class: 'min-w-0' }, h('span', { class: 'block font-semibold break-words' }, c.nama), h('span', { class: 'block text-sm text-ink-muted tabular-nums' }, c.no_wa_tampil)),
      h('span', { class: 'flex shrink-0 flex-col items-end gap-1' }, h('span', { class: 'tabular-nums' }, formatRupiah(item.total)), badgeStatus(item.status)),
    ),
  );
}

function barisTabel(item) {
  const c = item.customer;
  return h(
    'tr',
    { class: 'relative border-t border-line hover:bg-page', dataset: { customerId: c.id } },
    h(
      'td',
      { class: KELAS.td },
      h('a', { href: rute.keranjang(po.id, c.id), class: `font-semibold after:absolute after:inset-0 ${KELAS.fokus} rounded` }, c.nama),
    ),
    h('td', { class: `${KELAS.td} whitespace-nowrap text-ink-muted` }, c.no_wa_tampil),
    h('td', { class: `${KELAS.td} text-right whitespace-nowrap` }, formatRupiah(item.total)),
    h('td', { class: `${KELAS.td} text-right whitespace-nowrap` }, formatRupiah(item.dana_diterima)),
    h('td', { class: `${KELAS.td} text-right whitespace-nowrap` }, teksSisa(item)),
    h('td', { class: KELAS.td }, badgeStatus(item.status)),
  );
}

function renderDaftar() {
  const totalSemua = meta?.jumlah_per_status?.semua ?? 0;
  filterStatus.hidden = totalSemua === 0;
  if (totalSemua === 0) {
    isi(daftar, emptyState({ pesan: 'Belum ada customer di Open PO ini.', aksi: { label: 'Tambah customer', onClick: tambahCustomer } }));
    return;
  }
  renderChip();
  if (items.length === 0) {
    isi(
      daftar,
      emptyState({
        pesan: `Tidak ada customer berstatus ${STATUS_BAYAR[filter]?.label ?? filter}.`,
        aksi: { label: 'Tampilkan semua', varian: 'secondary', onClick: () => gantiFilter('semua', { fokusChip: true }) },
      }),
    );
    return;
  }
  const lagi =
    meta.halaman < meta.total_halaman
      ? h('button', { type: 'button', class: `${KELAS.tombolSecondary} mt-3 w-full md:w-auto`, onClick: (e) => muatCustomer({ tambah: true, tombol: e.currentTarget }) }, 'Muat lebih banyak')
      : null;
  isi(
    daftar,
    h('ul', { class: `${KELAS.kartuDaftar} md:hidden` }, items.map(barisMobile)),
    h(
      'div',
      { class: 'hidden overflow-x-auto rounded-xl border border-line bg-surface md:block' },
      h(
        'table',
        { class: KELAS.tabel },
        h('caption', { class: 'sr-only' }, 'Customer di Open PO ini'),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col', class: KELAS.th }, 'Customer'),
            h('th', { scope: 'col', class: KELAS.th }, 'No WA'),
            h('th', { scope: 'col', class: `${KELAS.th} text-right` }, 'Total'),
            h('th', { scope: 'col', class: `${KELAS.th} text-right` }, 'Dana diterima'),
            h('th', { scope: 'col', class: `${KELAS.th} text-right` }, 'Sisa'),
            h('th', { scope: 'col', class: KELAS.th }, 'Status'),
          ),
        ),
        h('tbody', {}, items.map(barisTabel)),
      ),
    ),
    lagi,
  );
}

/** Sheet "Tambah customer ke Open PO" (ui-spec §7.5), dari FAB, header, atau EmptyState. */
function tambahCustomer() {
  if (po) bukaSheetTambahCustomer(po);
}
fab.addEventListener('click', tambahCustomer);
tambahHeader.addEventListener('click', tambahCustomer);

// ---------- Data ----------

function simpanFilterDiUrl() {
  const url = new URL(location.href);
  if (filter === 'semua') url.searchParams.delete('status');
  else url.searchParams.set('status', filter);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

function gantiFilter(nilai, { fokusChip = false } = {}) {
  filter = nilai;
  const radio = chipStatus.querySelector(`input[value="${nilai}"]`);
  if (radio) radio.checked = true;
  simpanFilterDiUrl();
  muatCustomer();
  if (fokusChip) radio?.focus();
}

async function muatCustomer({ tambah = false, tombol = null } = {}) {
  const urut = ++urutPermintaan;
  const pulihkan = tombol ? tombolMemuat(tombol, 'Memuat…') : null;
  if (!tambah && meta === null) isi(daftar, skeletonBaris(4));
  daftar.setAttribute('aria-busy', 'true');
  try {
    const res = await Api.customerOpenPo(po.id, {
      status: filter === 'semua' ? undefined : filter,
      halaman: tambah ? meta.halaman + 1 : 1,
      per_halaman: PER_HALAMAN,
    });
    if (urut !== urutPermintaan) return;
    meta = res.meta;
    items = tambah ? [...items, ...res.data] : res.data;
    setBanner(bannerCustomer, null);
    renderDaftar();
  } catch (err) {
    if (urut !== urutPermintaan) return;
    catatJikaBug(err);
    pulihkan?.();
    // Data yang sudah tampil tetap ada; banner di atas daftar + Coba lagi (ui-spec §7.4).
    setBanner(bannerCustomer, { jenis: 'error', pesan: pesanError(err, 'muat'), aksi: aksiCobaLagi(err, () => muatCustomer({ tambah })) });
    if (meta === null) isi(daftar);
  } finally {
    if (urut === urutPermintaan) daftar.removeAttribute('aria-busy');
  }
}

async function muat() {
  isiPo.hidden = true;
  memuat.hidden = false;
  isi(memuat, h('div', { class: 'space-y-4' }, skeletonKursCard(), skeletonBaris(4)));
  if (idPo === null) {
    isi(memuat, emptyState({ jenis: 'error', pesan: 'Open PO tidak ditemukan.', aksi: { label: 'Lihat daftar Open PO', href: rute.beranda(), varian: 'secondary' } }));
    return;
  }
  try {
    const [resPo, resCust] = await Promise.allSettled([
      Api.openPo(idPo),
      Api.customerOpenPo(idPo, { status: filter === 'semua' ? undefined : filter, per_halaman: PER_HALAMAN }),
    ]);
    if (resPo.status === 'rejected') throw resPo.reason;
    po = resPo.value.data;
    judul.textContent = po.nama;
    document.title = `${po.nama} · Jastip Admin`;
    tautanUbah.href = rute.poUbah(po.id);
    tautanUbah.hidden = false;
    tambahHeader.hidden = false;
    fab.hidden = false;
    renderKiri();
    memuat.hidden = true;
    isiPo.hidden = false;
    if (resCust.status === 'fulfilled') {
      meta = resCust.value.meta;
      items = resCust.value.data;
      renderDaftar();
    } else {
      catatJikaBug(resCust.reason);
      setBanner(bannerCustomer, { jenis: 'error', pesan: pesanError(resCust.reason, 'muat'), aksi: aksiCobaLagi(resCust.reason, () => muatCustomer()) });
    }
  } catch (err) {
    catatJikaBug(err);
    const tidakAda = err instanceof ApiError && err.status === 404;
    isi(
      memuat,
      emptyState({
        jenis: 'error',
        pesan: tidakAda ? err.pesan : pesanError(err, 'muat'),
        aksi: tidakAda
          ? { label: 'Lihat daftar Open PO', href: rute.beranda(), varian: 'secondary' }
          : aksiCobaLagi(err, muat, { varian: 'secondary' }),
      }),
    );
  }
}

muat();
