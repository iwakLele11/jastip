// Build front-end tanpa bundler:
//   1. HTML: src/pages/*.html + partial (<!-- @include nama aktif=... -->), ikon inline
//      (<!-- @ikon nama ukuran kelas -->), dan token kelas komponen ({{tombolPrimary}}).
//   2. JavaScript: src/js disalin apa adanya (ES module), specifier impor relatif diberi
//      ?v=<build> supaya cache browser aman setelah deploy.
//   3. <link rel="modulepreload"> untuk seluruh graf impor tiap halaman (menghindari waterfall).
//   4. CSS: Tailwind CLI v4, diminify, hanya kelas yang dipakai.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KELAS } from '../src/js/ui/kelas.js';
import { ikonSvg } from '../src/js/lib/ikon.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function semuaFile(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? semuaFile(p) : [p];
  });
}

const buildId = createHash('sha256')
  .update(semuaFile(SRC).sort().map((f) => `${path.relative(SRC, f)}\0${readFileSync(f, 'utf8')}`).join('\0'))
  .digest('hex')
  .slice(0, 10);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(path.join(DIST, 'css'), { recursive: true });

// ---------- JavaScript ----------
const RE_IMPOR = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+?\.js)\2/g;

function versikanImpor(kode) {
  return kode.replace(RE_IMPOR, (_, awal, kutip, spec) => `${awal}${kutip}${spec}?v=${buildId}${kutip}`);
}

for (const f of semuaFile(path.join(SRC, 'js'))) {
  const tujuan = path.join(DIST, path.relative(SRC, f));
  mkdirSync(path.dirname(tujuan), { recursive: true });
  writeFileSync(tujuan, versikanImpor(readFileSync(f, 'utf8')));
}

/** Graf impor statis sebuah modul (path relatif terhadap dist), termasuk modul itu sendiri. */
function grafImpor(entri, terlihat = new Set()) {
  if (terlihat.has(entri)) return terlihat;
  terlihat.add(entri);
  const kode = readFileSync(path.join(SRC, entri), 'utf8');
  for (const m of kode.matchAll(/\b(?:from\s*|import\s+)(['"])(\.{1,2}\/[^'"]+?\.js)\1/g)) {
    grafImpor(path.posix.join(path.posix.dirname(entri), m[2]), terlihat);
  }
  return terlihat;
}

// ---------- HTML ----------
function sisipkanPartial(html) {
  return html.replace(/<!--\s*@include\s+([\w-]+)((?:\s+[\w-]+=[\w-]+)*)\s*-->/g, (_, nama, argStr) => {
    const file = path.join(SRC, 'partials', `${nama}.html`);
    if (!existsSync(file)) throw new Error(`Partial tidak ditemukan: ${nama}`);
    let isi = readFileSync(file, 'utf8').trimEnd();
    const args = Object.fromEntries([...argStr.matchAll(/([\w-]+)=([\w-]+)/g)].map((m) => [m[1], m[2]]));
    if (args.aktif) {
      isi = isi.replaceAll(`data-nav="${args.aktif}"`, `data-nav="${args.aktif}" aria-current="page"`);
    }
    return isi;
  });
}

function sisipkanIkon(html) {
  return html.replace(/<!--\s*@ikon\s+([\w-]+)\s+(\d+)\s+([^>]*?)\s*-->/g, (_, nama, ukuran, kelas) =>
    ikonSvg(nama, Number(ukuran), kelas.trim()),
  );
}

function sisipkanKelas(html) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, nama) => {
    if (!(nama in KELAS)) throw new Error(`Token kelas tidak dikenal: {{${nama}}}`);
    return KELAS[nama];
  });
}

const halaman = readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html'));
for (const f of halaman) {
  let html = readFileSync(path.join(SRC, 'pages', f), 'utf8');
  html = sisipkanKelas(sisipkanIkon(sisipkanPartial(html)));

  html = html.replace('href="css/app.css"', `href="css/app.css?v=${buildId}"`);
  const entri = html.match(/<script type="module" src="(js\/pages\/[\w-]+\.js)"><\/script>/);
  if (!entri) throw new Error(`${f}: script modul halaman tidak ditemukan`);
  html = html.replace(entri[0], `<script type="module" src="${entri[1]}?v=${buildId}"></script>`);
  const preload = [...grafImpor(entri[1])]
    .filter((m) => m !== entri[1])
    .sort()
    .map((m) => `<link rel="modulepreload" href="${m}?v=${buildId}">`)
    .join('\n');
  html = html.replace('</head>', `${preload}\n</head>`);

  for (const sisa of [/\{\{\w+\}\}/, /<!--\s*@(include|ikon)/]) {
    if (sisa.test(html)) throw new Error(`${f}: masih ada direktif build yang tidak diproses (${sisa})`);
  }
  writeFileSync(path.join(DIST, f), html);
}

cpSync(path.join(SRC, 'assets'), DIST, { recursive: true });

// ---------- CSS (Tailwind v4) ----------
const tw = spawnSync(
  path.join(ROOT, 'node_modules', '.bin', 'tailwindcss'),
  ['-i', path.join(SRC, 'styles', 'app.css'), '-o', path.join(DIST, 'css', 'app.css'), '--minify'],
  { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
);
if (tw.status !== 0) {
  console.error('Tailwind gagal.');
  process.exit(tw.status ?? 1);
}

const ukuran = (p) => `${(statSync(p).size / 1024).toFixed(1)} KB`;
console.log(`Build ${buildId}: ${halaman.length} halaman, css ${ukuran(path.join(DIST, 'css', 'app.css'))}.`);
