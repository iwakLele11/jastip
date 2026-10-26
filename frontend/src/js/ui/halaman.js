// Inisialisasi bersama setiap halaman terautentikasi: tombol Keluar (TopNav dan Pengaturan),
// tombol Kembali di AppBar, toast flash, dan muat ulang saat halaman dipulihkan dari bfcache
// (supaya data tidak basi dan halaman tidak tampil lagi setelah Keluar).
import { Api, ApiError, PESAN, catatJikaBug } from '../lib/api.js';
import { $, $$ } from '../lib/dom.js';
import { rute } from '../lib/rute.js';
import { setBanner, tombolMemuat } from './komponen.js';
import { tampilkanPesanFlash } from './toast.js';

export function mulaiHalaman() {
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });
  for (const t of $$('[data-keluar]')) t.addEventListener('click', () => keluar(t));
  for (const a of $$('a[data-kembali]')) a.addEventListener('click', (e) => kembali(e, a));
  tampilkanPesanFlash();
}

/** Keluar tanpa dialog konfirmasi (ui-spec §6.2). */
async function keluar(tombol) {
  const pulihkan = tombolMemuat(tombol, 'Keluar…');
  try {
    await Api.logout();
  } catch (err) {
    // 401 berarti sesi sudah tidak ada: tetap dianggap keluar.
    if (!(err instanceof ApiError && err.status === 401)) {
      pulihkan();
      catatJikaBug(err);
      const wadah = $('[data-banner-halaman]');
      if (wadah) setBanner(wadah, { jenis: 'error', pesan: err instanceof ApiError && !err.jaringan ? err.pesan : PESAN.tidakTerhubung });
      return;
    }
  }
  location.replace(rute.login());
}

/**
 * Tombol ‹ di AppBar adalah tautan ke halaman induk. Kalau halaman sebelumnya memang
 * halaman induk itu, pakai history.back() supaya posisi scroll dan filter di sana tetap.
 */
function kembali(e, a) {
  if (!document.referrer || history.length < 2) return;
  let asal;
  try {
    asal = new URL(document.referrer);
  } catch {
    return;
  }
  const tujuan = new URL(a.href);
  asal.searchParams.delete('pesan');
  if (asal.origin !== location.origin) return;
  // `status` = filter chip; `i` = tambahan tantangan hosting (InfinityFree ?i=N).
  const sama = (u) => `${u.pathname.replace(/\/index\.html$/, '/')}?${[...u.searchParams].filter(([k]) => k !== 'status' && k !== 'i').sort().join('&')}`;
  if (sama(asal) === sama(tujuan)) {
    e.preventDefault();
    history.back();
  }
}
