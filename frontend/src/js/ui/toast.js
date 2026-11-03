// Toast hanya untuk konfirmasi sukses (ui-spec §4.5). bg-ink text-surface, tengah bawah,
// di atas bottom nav / FAB, hilang setelah 4 detik, bisa ditutup, role="status".
// Error tidak pernah memakai toast.
import { h } from '../lib/dom.js';
import { ikon } from '../lib/ikon.js';
import { KELAS } from './kelas.js';

const DURASI_MS = 4000;

/** Pesan sukses yang dibawa lintas halaman lewat ?pesan=<kode> (tanpa data customer). */
export const PESAN_FLASH = {
  'po-dibuat': 'Open PO dibuat.',
  'po-diubah': 'Perubahan disimpan.',
  'customer-disimpan': 'Customer disimpan.',
  'customer-diarsipkan': 'Customer diarsipkan.',
  'customer-dihapus': 'Customer dihapus.',
};

/**
 * Wilayah toast halaman, atau milik dialog modal teratas yang sedang terbuka (sheet). Konten di
 * luar dialog modal inert dan tertutup backdrop, jadi toast saat sheet masih terbuka (mis.
 * "Simpan & tambah lagi") tampil di dalam sheet, di atas layar supaya tidak menutupi form.
 */
function wilayah() {
  const modal = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1);
  const diDialog = modal?.querySelector(':scope > [data-toast-wilayah]');
  if (diDialog) return { r: diDialog, diDialog: true };
  let r = document.getElementById('toast');
  if (!r) {
    r = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite', class: 'pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4' });
    document.body.append(r);
  }
  return { r, diDialog: false };
}

/** Jarak dari bawah: di atas elemen fixed paling atas di bagian bawah layar (bottom nav, FAB, sticky bar). */
function aturPosisi(r) {
  let atas = window.innerHeight;
  for (const el of document.querySelectorAll('[data-bottom-nav], [data-fab], [data-sticky-bar]')) {
    const box = el.getBoundingClientRect();
    if (box.height > 0 && box.bottom >= window.innerHeight - 1 - 120) atas = Math.min(atas, box.top);
  }
  r.style.bottom = `${Math.max(16, window.innerHeight - atas + 12)}px`;
}

export function toast(pesan) {
  const { r, diDialog } = wilayah();
  if (!diDialog) aturPosisi(r);
  // Satu toast pada satu waktu, termasuk toast di sheet yang sedang ditutup.
  for (const lama of document.querySelectorAll('[data-toast]')) lama.remove();
  let timer;
  const tutup = () => {
    clearTimeout(timer);
    item.remove();
  };
  const item = h(
    'div',
    {
      class: 'pointer-events-auto flex max-w-md items-center gap-2 rounded-lg bg-ink py-1 pr-1 pl-4 text-surface shadow-lg motion-safe:transition motion-safe:duration-150 motion-safe:starting:translate-y-2 motion-safe:starting:opacity-0',
      dataset: { toast: '' },
    },
    h('p', { class: 'py-2' }, pesan),
    h(
      'button',
      {
        type: 'button',
        class: `inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-ink-muted ${KELAS.fokus} focus-visible:outline-surface`,
        'aria-label': 'Tutup pesan',
        onClick: () => tutup(),
      },
      ikon('x-mark', 24, 'size-5'),
    ),
  );
  r.append(item);
  // FAB / bottom nav bisa baru tampil setelah data dimuat: posisi diperbarui selama toast tampil.
  const ikuti = () => {
    if (!item.isConnected) return;
    aturPosisi(r);
    requestAnimationFrame(ikuti);
  };
  if (!diDialog) requestAnimationFrame(ikuti);
  timer = setTimeout(tutup, DURASI_MS);
}

/** Membaca ?pesan=<kode>, menampilkan toast, lalu membuang parameter dari URL. */
export function tampilkanPesanFlash() {
  const url = new URL(location.href);
  const kode = url.searchParams.get('pesan');
  if (kode === null) return;
  url.searchParams.delete('pesan');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  const pesan = PESAN_FLASH[kode];
  if (pesan) toast(pesan);
}
