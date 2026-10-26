// Daftar Open PO / beranda (ui-spec §7.2).
import { Api, catatJikaBug, pesanError } from '../lib/api.js';
import { h, isi, wajib } from '../lib/dom.js';
import { formatKursJastip, formatRupiah } from '../lib/format.js';
import { ikon } from '../lib/ikon.js';
import { rute } from '../lib/rute.js';
import { mulaiHalaman } from '../ui/halaman.js';
import { KELAS } from '../ui/kelas.js';
import { badgeTerkunci, emptyState, skeletonKartu, tombolMemuat } from '../ui/komponen.js';

mulaiHalaman();

const wadah = wajib('#daftar-po');
const PER_HALAMAN = 100;
let halaman = 1;
let semua = [];
let meta = null;

function kartuPo(po) {
  const r = po.ringkasan;
  return h(
    'li',
    {},
    h(
      'a',
      {
        href: rute.poDetail(po.id),
        class: `block h-full rounded-xl border border-line bg-surface p-4 hover:bg-page ${KELAS.fokus}`,
        dataset: { poId: po.id },
      },
      h(
        'span',
        { class: 'flex items-start justify-between gap-2' },
        h('span', { class: 'min-w-0 font-semibold break-words' }, po.nama),
        ikon('chevron-right', 24, 'mt-0.5 size-5 shrink-0 text-ink-muted'),
      ),
      h(
        'span',
        { class: 'mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted tabular-nums' },
        formatKursJastip(po.kurs.kurs_jastip),
        po.kurs_terkunci ? badgeTerkunci() : null,
      ),
      h('span', { class: 'mt-1 block text-sm text-ink-muted tabular-nums' }, `${r.jumlah_customer} customer · ${formatRupiah(r.total_pesanan)}`),
    ),
  );
}

function bagian(id, judul, jumlah, items) {
  if (items.length === 0) return null;
  return h(
    'section',
    { 'aria-labelledby': id, class: 'space-y-3' },
    h('h2', { id, class: KELAS.judulBagian }, `${judul} (${jumlah})`),
    h('ul', { class: 'grid gap-3 lg:grid-cols-2' }, items.map(kartuPo)),
  );
}

function render() {
  if (semua.length === 0) {
    isi(
      wadah,
      emptyState({
        pesan: 'Belum ada Open PO. Buat Open PO pertama untuk mulai mencatat pesanan.',
        aksi: { label: 'Buat Open PO', href: rute.poBaru() },
      }),
    );
    return;
  }
  const per = meta.jumlah_per_status ?? {};
  const buka = semua.filter((p) => p.status === 'buka');
  const selesai = semua.filter((p) => p.status === 'selesai');
  const lagi =
    meta.halaman < meta.total_halaman
      ? h('button', { type: 'button', class: `${KELAS.tombolSecondary} w-full md:w-auto`, onClick: (e) => muat({ tambah: true, tombol: e.currentTarget }) }, 'Muat lebih banyak')
      : null;
  isi(wadah, bagian('judul-buka', 'Buka', per.buka ?? buka.length, buka), bagian('judul-selesai', 'Selesai', per.selesai ?? selesai.length, selesai), lagi);
}

async function muat({ tambah = false, tombol = null } = {}) {
  const pulihkan = tombol ? tombolMemuat(tombol, 'Memuat…') : null;
  if (!tambah) isi(wadah, skeletonKartu(3));
  try {
    const res = await Api.daftarOpenPo({ halaman: tambah ? halaman + 1 : 1, per_halaman: PER_HALAMAN });
    halaman = res.meta.halaman;
    meta = res.meta;
    semua = tambah ? [...semua, ...res.data] : res.data;
    render();
  } catch (err) {
    catatJikaBug(err);
    pulihkan?.();
    const pesan = pesanError(err, 'muat');
    if (tambah) {
      wadah.append(emptyState({ jenis: 'error', pesan, aksi: { label: 'Coba lagi', varian: 'secondary', onClick: () => { wadah.lastChild.remove(); muat({ tambah: true }); } } }));
      return;
    }
    isi(
      wadah,
      emptyState({
        jenis: 'error',
        pesan: err?.jaringan ? 'Daftar Open PO tidak bisa dimuat. Periksa koneksi, lalu coba lagi.' : pesan,
        aksi: { label: 'Coba lagi', varian: 'secondary', onClick: () => muat() },
      }),
    );
  }
}

muat();
