// Pembuat elemen DOM yang aman: teks selalu masuk sebagai text node, tidak pernah lewat
// innerHTML. Semua data dari API (nama customer, nama PO, alamat, dll.) dirender lewat sini.

/**
 * h('a', { class: '...', href: 'po.html?id=1', onClick: fn }, 'teks', anak, [anak lain])
 * - `class` → className, `text` → textContent, `dataset` → data-*
 * - `onXxx` (fungsi) → addEventListener('xxx')
 * - nilai true → atribut kosong; false/null/undefined → dilewati
 * - anak berupa string/number → text node; Node → di-append; array → diratakan
 */
export function h(tag, props = {}, ...anak) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  tambahkan(el, anak);
  return el;
}

/** Menambahkan anak ke elemen. String menjadi text node (aman dari injeksi HTML). */
export function tambahkan(el, anak) {
  for (const a of [anak].flat(Infinity)) {
    if (a === null || a === undefined || a === false) continue;
    el.append(a instanceof Node ? a : String(a));
  }
  return el;
}

/** Ganti seluruh isi elemen. */
export function isi(el, ...anak) {
  el.replaceChildren();
  return tambahkan(el, anak);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Elemen wajib ada di HTML statis halaman; error jelas kalau markup berubah. */
export function wajib(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Elemen ${sel} tidak ditemukan.`);
  return el;
}

let urutId = 0;
export function idUnik(awalan = 'el') {
  urutId += 1;
  return `${awalan}-${urutId}`;
}

/** Menunda pemanggilan fungsi sampai `ms` setelah panggilan terakhir. */
export function debounce(fn, ms) {
  let t;
  const f = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  f.batal = () => clearTimeout(t);
  return f;
}
