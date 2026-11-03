// Tampilan kurs Open PO: KursCard (Detail Open PO) dan blok kurs terkunci (Form ubah).
// Semua angka kurs berasal dari API; front-end hanya memformat (ui-spec §7.3, §7.4, §10).
import { formatKursJastip, formatKursPasar, formatPersen, formatTanggal } from '../lib/format.js';
import { h } from '../lib/dom.js';
import { rute } from '../lib/rute.js';
import { badgeNetral, badgeTerkunci } from './komponen.js';
import { KELAS } from './kelas.js';

export const TEKS_TERKUNCI =
  'Kurs terkunci karena Open PO ini sudah punya pesanan. Kurs tidak bisa diubah lagi, walaupun pesanan dihapus.';

/** "Rp12.673 (25 Okt 2026)" atau null jika kurs pasar tidak ada. */
export function teksKursPasar(kurs) {
  if (!kurs.kurs_pasar) return null;
  const tgl = kurs.tanggal_kurs ? ` (${formatTanggal(kurs.tanggal_kurs)})` : '';
  return `${formatKursPasar(kurs.kurs_pasar)}${tgl}`;
}

/** "+ buffer 3%" (otomatis) atau "Diisi manual, tanpa buffer"; ditambah " · Otomatis"/" · Manual" saat terkunci. */
export function teksBuffer(kurs, { denganMode = false } = {}) {
  const otomatis = kurs.mode === 'otomatis';
  const dasar = otomatis && kurs.buffer_persen !== null ? `+ buffer ${formatPersen(kurs.buffer_persen)}` : 'Diisi manual, tanpa buffer';
  return denganMode ? `${dasar} · ${otomatis ? 'Otomatis' : 'Manual'}` : dasar;
}

export const badgeMode = (mode) => badgeNetral(mode === 'otomatis' ? 'Otomatis' : 'Manual');

/**
 * KursCard Detail Open PO. Sebelum terkunci: badge Otomatis/Manual + tautan "Ubah kurs".
 * Terkunci: badge "Terkunci", tautan hilang.
 */
export function kartuKurs(po) {
  const { kurs } = po;
  const pasar = teksKursPasar(kurs);
  return h(
    'section',
    { class: KELAS.kartu, 'aria-labelledby': 'kurs-judul', dataset: { kursCard: po.kurs_terkunci ? 'terkunci' : kurs.mode } },
    h(
      'div',
      { class: 'flex items-center justify-between gap-2' },
      h('h2', { id: 'kurs-judul', class: 'text-ink-muted' }, 'Kurs jastip'),
      po.kurs_terkunci ? badgeTerkunci() : badgeMode(kurs.mode),
    ),
    h('p', { class: 'mt-1 text-2xl font-semibold tabular-nums' }, formatKursJastip(kurs.kurs_jastip)),
    h('p', { class: 'mt-1 text-sm text-ink-muted tabular-nums' }, pasar ? `Pasar ${pasar}` : 'Kurs pasar tidak tersedia'),
    h('p', { class: 'text-sm text-ink-muted' }, teksBuffer(kurs, { denganMode: po.kurs_terkunci })),
    po.kurs_terkunci
      ? h('p', { class: 'sr-only' }, TEKS_TERKUNCI)
      : h('a', { href: rute.poUbah(po.id), class: `${KELAS.tombolGhost} -mb-2 -ml-3 mt-1` }, 'Ubah kurs'),
  );
}
