// Error dan peringatan per field (ui-spec §4.2 state Error, §8, §12.6):
// pesan di bawah input (danger + ikon), aria-invalid="true", dihubungkan lewat aria-describedby,
// fokus ke field error pertama saat submit, banner ringkas jika lebih dari 2 error.
import { h } from '../lib/dom.js';
import { ikon } from '../lib/ikon.js';
import { KELAS } from './kelas.js';
import { setBanner } from './komponen.js';

function tambahDescribedby(el, id) {
  const ids = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  ids.add(id);
  el.setAttribute('aria-describedby', [...ids].join(' '));
}

function hapusDescribedby(el, id) {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

/** Elemen tempat pesan disisipkan: setelah grup input (prefix/suffix) atau setelah input. */
function jangkar(el) {
  if (el.tagName === 'FIELDSET') return el.querySelector('[data-jangkar-error]') ?? el;
  return el.closest('[data-input-grup]') ?? el;
}

/**
 * Menampilkan pesan error untuk sebuah kontrol (input, textarea, atau fieldset).
 * Untuk fieldset/grup radio, `fokus` adalah elemen yang difokuskan saat submit gagal.
 */
export function setErrorField(el, pesan) {
  const id = `${el.id}-error`;
  let p = document.getElementById(id);
  if (!pesan) {
    p?.remove();
    el.removeAttribute('aria-invalid');
    hapusDescribedby(el, id);
    return;
  }
  if (!p) {
    p = h('p', { id, class: KELAS.errorField, dataset: { errorField: '' } });
    jangkar(el).after(p);
  }
  p.replaceChildren(ikon('exclamation-circle', 16, 'mt-0.5 size-4 shrink-0'), h('span', {}, pesan));
  if (el.tagName !== 'FIELDSET') el.setAttribute('aria-invalid', 'true');
  tambahDescribedby(el, id);
}

/**
 * Peringatan yang tidak memblokir simpan (mis. no WA ganda). Live region polite supaya
 * terbaca pembaca layar, tanpa aria-invalid.
 * @param {HTMLElement} el
 * @param {Node|string|null} isi
 */
export function setPeringatanField(el, isi) {
  const id = `${el.id}-peringatan`;
  let p = document.getElementById(id);
  if (!isi) {
    p?.remove();
    hapusDescribedby(el, id);
    return;
  }
  if (!p) {
    p = h('div', { id, class: KELAS.peringatanField, role: 'status', dataset: { peringatanField: '' } });
    const err = document.getElementById(`${el.id}-error`);
    (err ?? jangkar(el)).after(p);
  }
  p.replaceChildren(isi);
  tambahDescribedby(el, id);
}

/**
 * Menerapkan sekumpulan error ke form. `peta` = { namaField: elemen }.
 * `errors` = { namaField: pesan } (dari validasi klien atau `error.field` API).
 * Field yang tidak dikenal dikembalikan supaya pemanggil bisa menampilkannya di banner.
 *
 * @returns {{jumlah: number, tidakDikenal: string[]}}
 */
export function terapkanError(peta, errors, { bannerWadah, fokus = true } = {}) {
  for (const el of Object.values(peta)) setErrorField(el, null);
  const tidakDikenal = [];
  let pertama = null;
  let jumlah = 0;
  for (const [nama, pesan] of Object.entries(errors)) {
    const el = peta[nama];
    if (!el) {
      tidakDikenal.push(pesan);
      continue;
    }
    if (document.getElementById(`${el.id}-error`)) continue; // satu pesan per kontrol
    setErrorField(el, pesan);
    jumlah += 1;
    pertama ??= el;
  }
  if (bannerWadah) {
    const total = jumlah + tidakDikenal.length;
    if (tidakDikenal.length) setBanner(bannerWadah, { jenis: 'error', pesan: tidakDikenal.join(' ') });
    else if (total > 2) setBanner(bannerWadah, { jenis: 'error', pesan: `Periksa ${total} isian yang ditandai.` });
    else setBanner(bannerWadah, null);
  }
  if (fokus && pertama) {
    const target = pertama.tagName === 'FIELDSET' ? pertama.querySelector('input:checked, input, button') : pertama;
    target?.focus();
  }
  return { jumlah, tidakDikenal };
}
