// Kumpulan kelas Tailwind untuk komponen dasar (ui-spec §4). Satu sumber untuk HTML
// (dipakai build lewat token {{nama}}) dan JavaScript. Tulis kelas lengkap, jangan
// disusun dari potongan string, supaya terdeteksi oleh pemindai Tailwind.

const FOKUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const DASAR_TOMBOL = `inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold whitespace-nowrap ${FOKUS} disabled:cursor-not-allowed data-memuat:cursor-wait`;

export const KELAS = {
  fokus: FOKUS,

  // Button/Primary, Secondary, Danger, Ghost, Icon (ui-spec §4.1). Saat nonaktif: kosong-bg +
  // ink-subtle. Saat memuat (data-memuat) tombol tetap berwarna aslinya walau disabled.
  tombolPrimary: `${DASAR_TOMBOL} bg-primary text-white hover:bg-primary-hover disabled:bg-kosong-bg disabled:text-ink-subtle data-memuat:disabled:bg-primary data-memuat:disabled:text-white`,
  tombolSecondary: `${DASAR_TOMBOL} border border-line-strong bg-surface text-ink hover:bg-page disabled:border-transparent disabled:bg-kosong-bg disabled:text-ink-subtle aria-disabled:border-transparent aria-disabled:bg-kosong-bg aria-disabled:text-ink-subtle aria-disabled:cursor-not-allowed data-memuat:disabled:border-line-strong data-memuat:disabled:bg-surface data-memuat:disabled:text-ink`,
  tombolDanger: `${DASAR_TOMBOL} bg-danger text-white hover:bg-danger-hover disabled:bg-kosong-bg disabled:text-ink-subtle data-memuat:disabled:bg-danger data-memuat:disabled:text-white`,
  tombolGhost: `${DASAR_TOMBOL} px-3 text-primary hover:bg-primary-soft disabled:text-ink-subtle`,
  tombolGhostDanger: `${DASAR_TOMBOL} px-3 text-danger hover:bg-kosong-bg disabled:text-ink-subtle data-memuat:disabled:text-danger`,
  tombolIkon: `inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-kosong-bg ${FOKUS}`,
  // Tombol aksi langsung di baris barang (lg, ghost 36px, ui-spec §7.6 Desktop).
  tombolBaris: `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold whitespace-nowrap text-primary hover:bg-primary-soft disabled:cursor-wait ${FOKUS}`,
  tombolBarisDanger: `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold whitespace-nowrap text-danger hover:bg-kosong-bg disabled:cursor-wait ${FOKUS}`,
  // Chip isi cepat ("Isi DP Rp…", "Isi sisa Rp…"): tampilan FilterChip, perilaku tombol biasa.
  chipIsi: `inline-flex h-11 items-center rounded-full border border-line-strong bg-surface px-3 text-sm text-ink tabular-nums hover:bg-page md:h-9 ${FOKUS}`,
  fab: `fixed right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-white shadow-md hover:bg-primary-hover md:hidden ${FOKUS}`,
  spinner: 'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none',

  // Input (ui-spec §4.2)
  label: 'block text-sm font-medium text-ink',
  input: 'mt-1 block h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-2 focus:outline-primary aria-invalid:border-danger disabled:bg-kosong-bg disabled:text-ink-subtle',
  textarea: 'mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-2 focus:outline-primary aria-invalid:border-danger',
  // Input/Prefix dan Input/Suffix: bingkai di pembungkus, input di dalamnya tanpa bingkai.
  inputGrup: 'mt-1 flex h-11 w-full items-center rounded-lg border border-line-strong bg-surface text-base focus-within:border-primary focus-within:outline-2 focus-within:outline-primary has-[[aria-invalid=true]]:border-danger',
  inputDalamGrup: 'h-full w-full min-w-0 flex-1 bg-transparent px-3 text-base text-ink placeholder:text-ink-subtle focus:outline-none',
  imbuhan: 'shrink-0 px-3 text-ink-muted select-none',
  bantuan: 'mt-1 text-sm text-ink-subtle',
  errorField: 'mt-1 flex items-start gap-1 text-sm text-danger',
  peringatanField: 'mt-2 rounded-lg bg-kurang-dp-bg px-3 py-2 text-sm text-kurang-dp-fg',

  // Segmented (radio group 2 pilihan, tinggi 44px)
  segmented: 'mt-1 grid grid-cols-2 rounded-lg border border-line-strong bg-surface',
  segmentedOpsi: 'relative flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] text-base font-medium text-ink hover:bg-page has-checked:bg-primary has-checked:font-semibold has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
  segmentedRadio: 'absolute inset-0 size-full cursor-pointer appearance-none opacity-0',

  // Kartu dan baris
  kartu: 'rounded-xl border border-line bg-surface p-4',
  kartuDaftar: 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface',
  barisTautan: `block px-4 py-3 hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`,
  judulBagian: 'text-lg font-semibold text-ink',

  // Badge (ui-spec §4.4)
  badge: 'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-medium whitespace-nowrap',
  badgeNetral: 'bg-kosong-bg text-kosong-fg',
  badgeBuka: 'bg-primary-soft text-primary',

  // Tabel desktop
  tabel: 'w-full border-collapse text-left text-base',
  th: 'px-3 py-3 text-sm font-medium whitespace-nowrap text-ink-muted first:pl-4 last:pr-4',
  td: 'px-3 py-3 align-middle first:pl-4 last:pr-4',

  srOnly: 'sr-only',
};
