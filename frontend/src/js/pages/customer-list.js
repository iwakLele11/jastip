// Daftar customer (ui-spec §7.7): cari nama / no WA (debounce 300 ms), urut A–Z,
// tabel di md. Teks pencarian disimpan di hash URL (#q=...), bukan query string,
// supaya tidak terkirim ke server lewat request halaman statis.
import { Api, catatJikaBug, pesanError } from '../lib/api.js';
import { debounce, h, isi, wajib } from '../lib/dom.js';
import { ikon } from '../lib/ikon.js';
import { tampakSepertiNoWa } from '../lib/parse.js';
import { rute } from '../lib/rute.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { KELAS } from '../ui/kelas.js';
import { emptyState, skeletonBaris, tombolMemuat } from '../ui/komponen.js';

mulaiHalaman();

const PER_HALAMAN = 100;
const formCari = wajib('#form-cari');
const cari = wajib('#cari');
const hapusCari = wajib('#hapus-cari');
const daftar = wajib('#daftar');

let items = [];
let meta = null;
let pengendali = null;

cari.value = new URLSearchParams(location.hash.slice(1)).get('q') ?? '';
hapusCari.hidden = cari.value === '';

function simpanCariDiHash(q) {
  const hash = q ? `#${new URLSearchParams({ q })}` : '';
  history.replaceState(history.state, '', location.pathname + location.search + hash);
}

function barisMobile(c) {
  return h(
    'li',
    {},
    h(
      'a',
      { href: rute.customerUbah(c.id), class: `flex min-h-16 items-center justify-between gap-3 ${KELAS.barisTautan}`, dataset: { customerId: c.id } },
      h('span', { class: 'min-w-0' }, h('span', { class: 'block font-semibold break-words' }, c.nama), h('span', { class: 'block text-sm text-ink-muted tabular-nums' }, c.no_wa_tampil)),
      ikon('chevron-right', 24, 'size-5 shrink-0 text-ink-muted'),
    ),
  );
}

function barisTabel(c) {
  return h(
    'tr',
    { class: 'relative border-t border-line hover:bg-page', dataset: { customerId: c.id } },
    h('td', { class: KELAS.td }, h('a', { href: rute.customerUbah(c.id), class: `font-semibold after:absolute after:inset-0 ${KELAS.fokus} rounded` }, c.nama)),
    h('td', { class: `${KELAS.td} text-ink-muted tabular-nums` }, c.no_wa_tampil),
    h('td', { class: `${KELAS.td} max-w-64 truncate text-ink-muted` }, c.alamat ?? ''),
  );
}

function render(q) {
  if (items.length === 0) {
    if (q) {
      const prefill = new URLSearchParams(tampakSepertiNoWa(q) ? { no_wa: q } : { nama: q });
      isi(
        daftar,
        emptyState({
          pesan: `Tidak ada customer dengan nama atau no WA "${q}".`,
          aksi: { label: `Buat customer "${q}"`, href: `${rute.customerBaru()}#${prefill}`, varian: 'secondary' },
        }),
      );
    } else {
      isi(
        daftar,
        emptyState({
          pesan: 'Belum ada customer. Customer juga bisa dibuat langsung dari Open PO.',
          aksi: { label: 'Tambah customer', href: rute.customerBaru() },
        }),
      );
    }
    return;
  }
  const lagi =
    meta.halaman < meta.total_halaman
      ? h('button', { type: 'button', class: `${KELAS.tombolSecondary} mt-3 w-full md:w-auto`, onClick: (e) => muat({ tambah: true, tombol: e.currentTarget }) }, 'Muat lebih banyak')
      : null;
  isi(
    daftar,
    h('ul', { class: `${KELAS.kartuDaftar} md:hidden` }, items.map(barisMobile)),
    h(
      'div',
      { class: 'hidden overflow-hidden rounded-xl border border-line bg-surface md:block' },
      h(
        'table',
        { class: `${KELAS.tabel} table-fixed` },
        h('caption', { class: 'sr-only' }, 'Daftar customer'),
        h('colgroup', {}, h('col', { class: 'w-1/3' }), h('col', { class: 'w-1/4' }), h('col')),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: KELAS.th }, 'Nama'), h('th', { scope: 'col', class: KELAS.th }, 'No WA'), h('th', { scope: 'col', class: KELAS.th }, 'Alamat'))),
        h('tbody', {}, items.map(barisTabel)),
      ),
    ),
    lagi,
  );
}

async function muat({ tambah = false, tombol = null } = {}) {
  const q = cari.value.trim();
  pengendali?.abort();
  pengendali = new AbortController();
  const { signal } = pengendali;
  const pulihkan = tombol ? tombolMemuat(tombol, 'Memuat…') : null;
  if (!tambah) isi(daftar, skeletonBaris(5));
  try {
    const res = await Api.daftarCustomer({ q: q || undefined, urut: 'nama', halaman: tambah ? meta.halaman + 1 : 1, per_halaman: PER_HALAMAN }, signal);
    meta = res.meta;
    items = tambah ? [...items, ...res.data] : res.data;
    render(q);
  } catch (err) {
    if (signal.aborted) return;
    catatJikaBug(err);
    pulihkan?.();
    isi(daftar, emptyState({ jenis: 'error', pesan: pesanError(err, 'muat'), aksi: { label: 'Coba lagi', varian: 'secondary', onClick: () => muat() } }));
  }
}

const muatTertunda = debounce(() => muat(), 300);

cari.addEventListener('input', () => {
  hapusCari.hidden = cari.value === '';
  simpanCariDiHash(cari.value.trim());
  muatTertunda();
});
formCari.addEventListener('submit', (e) => {
  e.preventDefault();
  muatTertunda.batal();
  muat();
});
hapusCari.addEventListener('click', () => {
  cari.value = '';
  hapusCari.hidden = true;
  simpanCariDiHash('');
  muatTertunda.batal();
  muat();
  cari.focus();
});

muat();
