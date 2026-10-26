// ConfirmDialog, Sheet, dan ActionSheet (ui-spec §4.5, §12.5) memakai <dialog> bawaan dengan
// showModal(): konten di luar dialog otomatis inert (fokus terkunci di dalam), Esc menutup,
// fokus dikembalikan ke tombol pemicu.
import { h, idUnik } from '../lib/dom.js';
import { ikon } from '../lib/ikon.js';
import { KELAS } from './kelas.js';

/**
 * Mengembalikan fokus ke pemicu. Kalau pemicu sudah diganti karena layar dirender ulang dari
 * respons API (mis. baris barang), cari elemen pengganti lewat `data-fokus` yang sama.
 */
export function kembalikanFokus(el) {
  let target = el;
  if (target && !target.isConnected && target.dataset?.fokus) {
    target = document.querySelector(`[data-fokus="${CSS.escape(target.dataset.fokus)}"]`);
  }
  if (target && target.isConnected && typeof target.focus === 'function') target.focus();
}

// Bottom sheet di bawah md (maks. max-w-lg di sm), dialog tengah di md ke atas.
const KELAS_SHEET =
  'mx-auto mt-auto mb-0 flex max-h-[90dvh] w-full max-w-none flex-col rounded-t-2xl bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40 sm:max-w-lg md:m-auto md:max-h-[85dvh] md:w-[calc(100%-3rem)] md:rounded-xl motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:starting:open:translate-y-full md:motion-safe:starting:open:translate-y-0 [&:not([open])]:hidden';

/**
 * Wilayah toast milik sebuah dialog modal. Konten di luar dialog modal inert (tidak terlihat
 * pembaca layar dan tertutup backdrop), jadi toast yang muncul saat sheet masih terbuka
 * (mis. "Simpan & tambah lagi") ditampilkan di dalam dialog. Dibuat saat dialog dibuka supaya
 * live region sudah ada sebelum isinya berubah.
 */
function wilayahToastDialog() {
  return h('div', {
    role: 'status',
    'aria-live': 'polite',
    class: 'pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4',
    dataset: { toastWilayah: '' },
  });
}

/**
 * ConfirmDialog: judul berupa pertanyaan, 1–2 kalimat, "Batal" (kiri, fokus awal) + aksi.
 * role="alertdialog". Esc = Batal. Klik di luar tidak menutup.
 *
 * @param {{judul: string, isi: string, labelAksi: string, nada?: 'danger'|'primary',
 *          labelBatal?: string|null}} p labelBatal null = dialog info satu tombol (role="dialog")
 * @returns {Promise<boolean>}
 */
export function konfirmasi({ judul, isi, labelAksi, nada = 'danger', labelBatal = 'Batal' }) {
  const pemicu = document.activeElement;
  const idJudul = idUnik('dialog-judul');
  const idIsi = idUnik('dialog-isi');
  return new Promise((selesai) => {
    let hasil = false;
    const tombolBatal = labelBatal
      ? h('button', { type: 'button', class: `${KELAS.tombolSecondary} flex-1 md:flex-none`, autofocus: true, onClick: () => tutup(false) }, labelBatal)
      : null;
    const tombolAksi = h(
      'button',
      {
        type: 'button',
        class: `${nada === 'danger' ? KELAS.tombolDanger : KELAS.tombolPrimary} flex-1 md:flex-none`,
        autofocus: labelBatal ? null : true,
        onClick: () => tutup(true),
      },
      labelAksi,
    );
    const dialog = h(
      'dialog',
      {
        class: 'm-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:starting:open:opacity-0',
        role: labelBatal ? 'alertdialog' : 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': idJudul,
        'aria-describedby': idIsi,
        dataset: { confirmDialog: '' },
      },
      h(
        'div',
        { class: 'space-y-2 p-5' },
        h('h2', { id: idJudul, class: 'text-lg font-semibold' }, judul),
        h('p', { id: idIsi, class: 'text-ink-muted' }, isi),
      ),
      h('div', { class: 'flex gap-2 px-5 pb-5 md:justify-end md:gap-3' }, tombolBatal, tombolAksi),
    );
    function tutup(nilai) {
      hasil = nilai;
      dialog.close();
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      tutup(false);
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      kembalikanFokus(pemicu);
      selesai(hasil);
    });
    document.body.append(dialog);
    dialog.showModal();
    (tombolBatal ?? tombolAksi).focus();
  });
}

/**
 * Sheet: bottom sheet di bawah md (maks. max-w-lg di sm), dialog tengah di md ke atas.
 * Header berisi judul + tombol tutup 44px (opsional tombol kembali di kiri), isi bisa
 * di-scroll, tinggi maks. 90dvh. Esc / × / klik backdrop menutup; jika `adaPerubahan()` true,
 * minta konfirmasi dulu.
 *
 * @param {{judul: string, isi: Node, adaPerubahan?: () => boolean, onTutup?: () => void,
 *          fokusAwal?: () => HTMLElement|null}} p
 * @returns {{dialog: HTMLDialogElement, tutup: (paksa?: boolean) => Promise<boolean>,
 *            setJudul: (t: string) => void,
 *            setKembali: (p: {label: string, onClick: () => void}|null) => void}}
 */
export function bukaSheet({ judul, isi, adaPerubahan = () => false, onTutup, fokusAwal }) {
  const pemicu = document.activeElement;
  const idJudul = idUnik('sheet-judul');
  const elJudul = h('h2', { id: idJudul, class: 'min-w-0 flex-1 truncate text-lg font-semibold' }, judul);
  let aksiKembali = null;
  const tombolKembali = h(
    'button',
    { type: 'button', class: `${KELAS.tombolIkon} -ml-3`, hidden: true, onClick: () => aksiKembali?.() },
    ikon('chevron-left', 24, 'size-6'),
  );
  const badan = h('div', { class: 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]' }, isi);
  const dialog = h(
    'dialog',
    { class: KELAS_SHEET, 'aria-labelledby': idJudul, 'aria-modal': 'true', dataset: { sheet: '' } },
    h(
      'div',
      { class: 'flex shrink-0 items-center gap-2 border-b border-line py-1 pr-1 pl-4' },
      tombolKembali,
      elJudul,
      h('button', { type: 'button', class: KELAS.tombolIkon, 'aria-label': 'Tutup', onClick: () => tutup() }, ikon('x-mark', 24, 'size-6')),
    ),
    badan,
    wilayahToastDialog(),
  );

  let menutup = false;
  async function tutup(paksa = false) {
    if (menutup) return false;
    if (!paksa && adaPerubahan()) {
      const ya = await konfirmasi({
        judul: 'Tutup tanpa menyimpan?',
        isi: 'Isian di form ini akan hilang.',
        labelBatal: 'Kembali ke form',
        labelAksi: 'Tutup',
        nada: 'danger',
      });
      if (!ya) return false;
    }
    menutup = true;
    dialog.close();
    return true;
  }

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    tutup();
  });
  // Klik di backdrop: target adalah elemen dialog itu sendiri (bukan isinya).
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) tutup();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    kembalikanFokus(pemicu);
    onTutup?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  // Fokus awal ke field pertama di isi sheet (bukan tombol tutup di header).
  (fokusAwal?.() ?? badan.querySelector('input:not([type=hidden]), select, textarea, button'))?.focus();
  return {
    dialog,
    tutup,
    setJudul: (t) => {
      elJudul.textContent = t;
    },
    setKembali: (p) => {
      aksiKembali = p?.onClick ?? null;
      tombolKembali.hidden = !p;
      if (p) tombolKembali.setAttribute('aria-label', p.label);
    },
  };
}

/**
 * ActionSheet (ui-spec §4.5, §7.6): daftar aksi untuk satu baris, item 52px dengan ikon + teks,
 * aksi berbahaya berwarna danger, "Batal" di bawah. Esc / Batal / backdrop = null.
 *
 * @param {{judul: string, subjudul?: Node|string, aksi: Array<{nilai: string, label: string,
 *          ikon: string, bantuan?: string, nada?: 'danger'}>}} p
 * @returns {Promise<string|null>} nilai aksi yang dipilih
 */
export function pilihAksi({ judul, subjudul, aksi }) {
  const pemicu = document.activeElement;
  const idJudul = idUnik('aksi-judul');
  return new Promise((selesai) => {
    let hasil = null;
    const tutup = (nilai) => {
      hasil = nilai;
      dialog.close();
    };
    const item = (a) => {
      const idBantuan = a.bantuan ? idUnik('aksi-bantuan') : null;
      return h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left text-base hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${a.nada === 'danger' ? 'text-danger' : 'text-ink'}`,
            'aria-describedby': idBantuan,
            dataset: { aksi: a.nilai },
            onClick: () => tutup(a.nilai),
          },
          ikon(a.ikon, 24, 'size-6 shrink-0'),
          h(
            'span',
            { class: 'min-w-0' },
            h('span', { class: 'block font-medium' }, a.label),
            a.bantuan ? h('span', { id: idBantuan, class: 'block text-sm text-ink-muted' }, a.bantuan) : null,
          ),
        ),
      );
    };
    const daftar = h('ul', { class: 'py-1' }, aksi.map(item));
    const dialog = h(
      'dialog',
      { class: KELAS_SHEET, 'aria-labelledby': idJudul, 'aria-modal': 'true', dataset: { actionSheet: '' } },
      h(
        'div',
        { class: 'shrink-0 border-b border-line px-4 py-3' },
        h('h2', { id: idJudul, class: 'font-semibold break-words' }, judul),
        subjudul ? h('p', { class: 'text-sm text-ink-muted tabular-nums' }, subjudul) : null,
      ),
      h('div', { class: 'min-h-0 flex-1 overflow-y-auto overscroll-contain' }, daftar),
      h(
        'div',
        { class: 'shrink-0 border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]' },
        h('button', { type: 'button', class: `${KELAS.tombolSecondary} w-full`, onClick: () => tutup(null) }, 'Batal'),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      tutup(null);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) tutup(null);
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      kembalikanFokus(pemicu);
      selesai(hasil);
    });
    document.body.append(dialog);
    dialog.showModal();
    daftar.querySelector('button')?.focus();
  });
}
