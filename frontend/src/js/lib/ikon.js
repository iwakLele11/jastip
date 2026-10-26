// Ikon Heroicons v2 (MIT) sebagai SVG inline. Data path disalin ke ikon-data.js oleh
// scripts/salin-ikon.mjs. Ikon selalu aria-hidden dan didampingi teks (ui-spec §3.4).
import { IKON } from './ikon-data.js';

const NS = 'http://www.w3.org/2000/svg';

function data(nama, ukuran) {
  const d = IKON[`${nama}/${ukuran}`];
  if (!d) throw new Error(`Ikon ${nama}/${ukuran} belum disalin (scripts/salin-ikon.mjs).`);
  return d;
}

function atributSvg(d, kelas) {
  const a = {
    xmlns: NS,
    viewBox: `0 0 ${d.size} ${d.size}`,
    'aria-hidden': 'true',
    focusable: 'false',
    class: kelas,
  };
  if (d.outline) Object.assign(a, { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' });
  else a.fill = 'currentColor';
  return a;
}

function atributPath(p, outline) {
  const a = { d: p.d };
  if (outline) Object.assign(a, { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (p.fillRule) a['fill-rule'] = p.fillRule;
  if (p.clipRule) a['clip-rule'] = p.clipRule;
  return a;
}

/** Elemen SVG (browser). `kelas` wajib memuat ukuran, mis. "size-6". */
export function ikon(nama, ukuran = 24, kelas = 'size-6') {
  const d = data(nama, ukuran);
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries(atributSvg(d, kelas))) if (k !== 'xmlns') svg.setAttribute(k, v);
  for (const p of d.paths) {
    const path = document.createElementNS(NS, 'path');
    for (const [k, v] of Object.entries(atributPath(p, d.outline))) path.setAttribute(k, v);
    svg.append(path);
  }
  return svg;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

/** String SVG untuk disisipkan ke HTML statis saat build (data statis, bukan data API). */
export function ikonSvg(nama, ukuran = 24, kelas = 'size-6') {
  const d = data(nama, ukuran);
  const paths = d.paths.map((p) => `<path ${attrs(atributPath(p, d.outline))}/>`).join('');
  return `<svg ${attrs(atributSvg(d, kelas))}>${paths}</svg>`;
}
