// Menyalin ikon Heroicons v2 (MIT, Tailwind Labs) yang dipakai aplikasi ke
// src/js/lib/ikon-data.js. Hanya dijalankan saat daftar ikon berubah (`npm run icons`);
// hasilnya di-commit, jadi build dan runtime tidak bergantung pada paket heroicons.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = path.join(root, 'node_modules', 'heroicons');

const DAFTAR = {
  '24/outline': [
    'shopping-bag', 'users', 'cog-6-tooth', 'chevron-left', 'chevron-right', 'plus', 'arrow-path',
    'eye', 'eye-slash', 'x-mark', 'magnifying-glass', 'arrow-right-start-on-rectangle',
    // Untuk tahap 2 (ActionSheet barang, Riwayat pembayaran):
    'trash', 'pencil-square', 'ellipsis-horizontal', 'clipboard-document', 'check',
    'minus', 'chevron-down', 'no-symbol', 'arrow-uturn-left',
  ],
  '20/solid': ['exclamation-triangle', 'information-circle', 'exclamation-circle', 'check-circle'],
  '16/solid': [
    'clock', 'exclamation-triangle', 'banknotes', 'check-circle', 'arrow-uturn-left', 'no-symbol',
    'lock-closed', 'check', 'exclamation-circle',
  ],
};

const data = {};
for (const [set, names] of Object.entries(DAFTAR)) {
  const [size, style] = set.split('/');
  for (const name of names) {
    const svg = readFileSync(path.join(pkg, size, style, `${name}.svg`), 'utf8');
    const paths = [...svg.matchAll(/<path([^>]*)\/>/g)].map(([, attrs]) => {
      const get = (a) => attrs.match(new RegExp(`${a}="([^"]*)"`))?.[1];
      const p = { d: get('d') };
      if (get('fill-rule')) p.fillRule = get('fill-rule');
      if (get('clip-rule')) p.clipRule = get('clip-rule');
      return p;
    });
    data[`${name}/${size}`] = { outline: style === 'outline', size: Number(size), paths };
  }
}

const header = `// Dibuat oleh scripts/salin-ikon.mjs dari Heroicons v2.2.0. Jangan diubah manual.
// Heroicons: MIT License, Copyright (c) Tailwind Labs, Inc. https://github.com/tailwindlabs/heroicons
`;
writeFileSync(
  path.join(root, 'src', 'js', 'lib', 'ikon-data.js'),
  `${header}export const IKON = {\n${Object.entries(data)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')}\n};\n`,
);
console.log(`${Object.keys(data).length} ikon disalin.`);
