// Komponen dasar (ui-spec §4): StatusBadge, Banner, EmptyState, Skeleton, Button loading,
// MoneyRow. Semua dibuat lewat DOM (h()), teks dari API tidak pernah masuk sebagai HTML.
import { ApiError } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { ikon } from '../lib/ikon.js';
import { KELAS } from './kelas.js';

// ---------- StatusBadge ----------

/** Status pembayaran keranjang (nilai API → label layar, ikon, warna). ui-spec §2.2, §9.2. */
export const STATUS_BAYAR = {
  belum_bayar: { label: 'Belum bayar', ikon: 'clock', warna: 'bg-belum-bayar-bg text-belum-bayar-fg' },
  kurang_dp: { label: 'Kurang DP', ikon: 'exclamation-triangle', warna: 'bg-kurang-dp-bg text-kurang-dp-fg' },
  dp: { label: 'DP', ikon: 'banknotes', warna: 'bg-dp-bg text-dp-fg' },
  lunas: { label: 'Lunas', ikon: 'check-circle', warna: 'bg-lunas-bg text-lunas-fg' },
  lebih_bayar: { label: 'Lebih bayar', ikon: 'arrow-uturn-left', warna: 'bg-lebih-bayar-bg text-lebih-bayar-fg' },
};
export const URUTAN_STATUS = ['belum_bayar', 'kurang_dp', 'dp', 'lunas', 'lebih_bayar'];

export function badgeStatus(status) {
  const s = STATUS_BAYAR[status];
  if (!s) return badgeNetral(String(status));
  return h('span', { class: `${KELAS.badge} ${s.warna}`, dataset: { status } }, ikon(s.ikon, 16, 'size-4'), s.label);
}

/** Badge netral: "Terkunci" (ikon gembok), "Otomatis", "Manual", "Selesai", "Kosong". */
export function badgeNetral(label, namaIkon = null) {
  return h('span', { class: `${KELAS.badge} ${KELAS.badgeNetral}` }, namaIkon ? ikon(namaIkon, 16, 'size-4') : null, label);
}

export const badgeTerkunci = () => badgeNetral('Terkunci', 'lock-closed');

// ---------- Banner ----------

const BANNER = {
  info: { warna: 'bg-dp-bg text-dp-fg', ikon: 'information-circle', role: 'status' },
  warning: { warna: 'bg-kurang-dp-bg text-kurang-dp-fg', ikon: 'exclamation-triangle', role: 'alert' },
  error: { warna: 'border border-danger bg-surface text-danger', ikon: 'exclamation-circle', role: 'alert' },
  success: { warna: 'bg-lunas-bg text-lunas-fg', ikon: 'check-circle', role: 'status' },
};

/**
 * @param {{jenis: 'info'|'warning'|'error'|'success', pesan: string|Node,
 *          aksi?: {label: string, onClick: () => void}}} p
 */
export function banner({ jenis, pesan, aksi }) {
  const b = BANNER[jenis];
  return h(
    'div',
    { class: `flex items-start gap-3 rounded-lg px-4 py-3 ${b.warna}`, role: b.role, dataset: { banner: jenis } },
    ikon(b.ikon, 20, 'mt-0.5 size-5 shrink-0'),
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      h('p', {}, pesan),
      aksi
        ? h(
            'button',
            {
              type: 'button',
              class: `-ml-3 mt-1 inline-flex h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-2 hover:bg-surface/60 ${KELAS.fokus}`,
              onClick: aksi.onClick,
            },
            aksi.label,
          )
        : null,
    ),
  );
}

/**
 * Aksi Banner / EmptyState setelah gagal memuat: "Coba lagi", atau "Muat ulang" (muat ulang
 * halaman) untuk PERLU_MUAT_ULANG, karena mencoba lagi tanpa memuat ulang tidak akan berhasil.
 * Banner form tidak memakai ini: form tetap terisi, dan Simpan bisa dicoba lagi.
 * @param {unknown} err
 * @param {() => void} cobaLagi
 * @param {{varian?: 'primary'|'secondary'}} [lain] properti tambahan, mis. varian EmptyState
 */
export function aksiCobaLagi(err, cobaLagi, lain = {}) {
  if (err instanceof ApiError && err.perluMuatUlang) return { ...lain, label: 'Muat ulang', onClick: () => location.reload() };
  return { ...lain, label: 'Coba lagi', onClick: cobaLagi };
}

/** Menampilkan banner di wadah (mengganti banner sebelumnya), atau mengosongkan jika p null. */
export function setBanner(wadah, p) {
  wadah.replaceChildren();
  wadah.hidden = !p;
  if (p) wadah.append(banner(p));
}

// ---------- EmptyState ----------

/**
 * Satu kalimat + satu tombol aksi, tanpa ilustrasi (ui-spec §4.3).
 * @param {{pesan: string, jenis?: 'kosong'|'error', aksi?: {label: string, href?: string,
 *          onClick?: () => void, varian?: 'primary'|'secondary'}}} p
 */
export function emptyState({ pesan, jenis = 'kosong', aksi }) {
  let tombol = null;
  if (aksi) {
    const kelas = aksi.varian === 'secondary' ? KELAS.tombolSecondary : KELAS.tombolPrimary;
    tombol = aksi.href
      ? h('a', { class: `${kelas} mt-4`, href: aksi.href }, aksi.label)
      : h('button', { type: 'button', class: `${kelas} mt-4`, onClick: aksi.onClick }, aksi.label);
  }
  return h(
    'div',
    {
      class: 'rounded-xl border border-line bg-surface px-4 py-8 text-center',
      role: jenis === 'error' ? 'alert' : null,
      dataset: { emptyState: jenis },
    },
    h('p', { class: jenis === 'error' ? 'text-ink' : 'text-ink-muted' }, pesan),
    tombol,
  );
}

// ---------- Skeleton ----------

const balok = (kelas) => h('span', { class: `block rounded bg-kosong-bg motion-safe:animate-pulse ${kelas}` });

function bungkusSkeleton(...anak) {
  return h('div', { 'aria-busy': 'true', dataset: { skeleton: '' } }, h('span', { class: 'sr-only', role: 'status' }, 'Memuat…'), anak);
}

/** n kartu skeleton (daftar Open PO). */
export function skeletonKartu(n = 3) {
  return bungkusSkeleton(
    h('div', { class: 'grid gap-3 lg:grid-cols-2' }, Array.from({ length: n }, () =>
      h('div', { class: `${KELAS.kartu} space-y-3` }, balok('h-5 w-3/5'), balok('h-4 w-2/5'), balok('h-4 w-1/2')))),
  );
}

/** n baris skeleton di dalam kartu daftar. */
export function skeletonBaris(n = 4) {
  return bungkusSkeleton(
    h('div', { class: KELAS.kartuDaftar }, Array.from({ length: n }, () =>
      h('div', { class: 'flex min-h-16 items-center justify-between gap-4 px-4 py-3' },
        h('div', { class: 'flex-1 space-y-2' }, balok('h-4 w-2/5'), balok('h-4 w-1/3')),
        balok('h-6 w-20')))),
  );
}

/** n field skeleton (form). */
export function skeletonField(n = 3) {
  return bungkusSkeleton(
    h('div', { class: `${KELAS.kartu} space-y-5` }, Array.from({ length: n }, () =>
      h('div', { class: 'space-y-2' }, balok('h-4 w-1/3'), balok('h-11 w-full')))),
  );
}

/** Skeleton ringkasan keranjang: badge + 4 MoneyRow + tombol. */
export function skeletonRingkasan() {
  return bungkusSkeleton(
    h(
      'div',
      { class: `${KELAS.kartu} space-y-3` },
      balok('h-6 w-20 rounded-full'),
      Array.from({ length: 4 }, () => h('div', { class: 'flex justify-between gap-4' }, balok('h-4 w-1/3'), balok('h-4 w-1/4'))),
      balok('h-11 w-full'),
    ),
  );
}

/** Skeleton KursCard. */
export function skeletonKursCard() {
  return bungkusSkeleton(h('div', { class: `${KELAS.kartu} space-y-3` }, balok('h-4 w-1/3'), balok('h-8 w-3/5'), balok('h-4 w-1/2')));
}

// ---------- Button loading ----------

/**
 * State loading tombol (ui-spec §4.1): label berganti + spinner 16px di kiri, tombol nonaktif
 * sampai respons datang (mencegah kirim ganda). Mengembalikan fungsi untuk memulihkan.
 */
export function tombolMemuat(tombol, label) {
  const asli = [...tombol.childNodes];
  const disabledAsli = tombol.disabled;
  tombol.disabled = true;
  tombol.dataset.memuat = '';
  tombol.setAttribute('aria-busy', 'true');
  tombol.replaceChildren(h('span', { class: KELAS.spinner, 'aria-hidden': 'true' }), label);
  return () => {
    tombol.replaceChildren(...asli);
    tombol.disabled = disabledAsli;
    delete tombol.dataset.memuat;
    tombol.removeAttribute('aria-busy');
  };
}

// ---------- MoneyRow ----------

export function barisUang(label, nilai, { kuat = false } = {}) {
  return h(
    'div',
    { class: `flex items-baseline justify-between gap-4 ${kuat ? 'border-t border-line pt-3' : 'py-1'}` },
    h('dt', { class: 'text-ink-muted' }, label),
    h('dd', { class: `tabular-nums text-ink ${kuat ? 'text-2xl font-semibold' : ''}` }, nilai),
  );
}
