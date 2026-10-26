// Kerangka uji minimal untuk skrip QA non-browser: cek(id, judul, fn) + ringkasan JSON.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const hasil = [];

export class Gagal extends Error {}

/** Kumpulkan hasil satu pemeriksaan. fn melempar Gagal/Error = gagal. Mengembalikan nilai fn. */
export async function cek(id, judul, fn) {
  const t0 = Date.now();
  try {
    const catatan = await fn();
    hasil.push({ id, judul, lulus: true, catatan: catatan ?? null, ms: Date.now() - t0 });
    console.log(`  LULUS  ${id}  ${judul}${catatan ? `  (${String(catatan).slice(0, 160)})` : ''}`);
    return catatan;
  } catch (e) {
    hasil.push({ id, judul, lulus: false, catatan: e.message, ms: Date.now() - t0 });
    console.log(`  GAGAL  ${id}  ${judul}\n         ${e.message.split('\n').join('\n         ')}`);
    return undefined;
  }
}

export function harap(kondisi, pesan) {
  if (!kondisi) throw new Gagal(pesan);
}

export function sama(aktual, harapan, label = '') {
  const a = JSON.stringify(aktual);
  const h = JSON.stringify(harapan);
  if (a !== h) throw new Gagal(`${label ? `${label}: ` : ''}harapan ${h}, aktual ${a}`);
}

export function bagian(judul) {
  console.log(`\n== ${judul}`);
}

/** Tulis qa/hasil/<nama>.json dan kembalikan kode keluar (1 jika ada yang gagal). */
export function selesai(nama) {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../hasil');
  mkdirSync(dir, { recursive: true });
  const gagal = hasil.filter((h) => !h.lulus);
  writeFileSync(path.join(dir, `${nama}.json`), JSON.stringify({ waktu: new Date().toISOString(), total: hasil.length, gagal: gagal.length, hasil }, null, 2));
  console.log(`\n${nama}: ${hasil.length - gagal.length}/${hasil.length} lulus. Gagal: ${gagal.map((g) => g.id).join(', ') || '-'}`);
  return gagal.length ? 1 : 0;
}
