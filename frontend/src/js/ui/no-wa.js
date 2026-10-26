// Field No WA (ui-spec §7.8, §6.4): saat kehilangan fokus, spasi/tanda hubung/kurung dibuang,
// format divalidasi, lalu duplikat dicek ke API. Duplikat hanya peringatan, simpan tetap boleh.
// Dipakai Form customer dan Sheet "Tambah customer ke Open PO".
import { Api, ApiError, catatJikaBug } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { bersihkanNoWa, validasiNoWa } from '../lib/parse.js';
import { setErrorField, setPeringatanField } from './field.js';

/**
 * @param {HTMLInputElement} input
 * @param {{kecualiId?: number, aksi: (lain: {id: number, nama: string}) => Node}} opsi
 *        `aksi` = tautan/tombol di belakang pesan, mis. "Lihat Rina" atau "Pakai Rina".
 */
export function pasangFieldNoWa(input, { kecualiId, aksi }) {
  let pengendali = null;

  async function cekDuplikat() {
    pengendali?.abort();
    setPeringatanField(input, null);
    if (!validasiNoWa(input.value).ok) return;
    pengendali = new AbortController();
    const { signal } = pengendali;
    try {
      const { data } = await Api.cekNoWa(input.value, kecualiId, signal);
      if (signal.aborted || !data.terdaftar || !data.customer.length) return;
      const lain = data.customer[0];
      setPeringatanField(
        input,
        h('span', {}, h('span', {}, data.pesan ?? `No WA ini sudah terdaftar atas nama ${lain.nama}.`), ' ', aksi(lain)),
      );
    } catch (err) {
      if (signal.aborted) return;
      // Cek duplikat hanya peringatan: kalau gagal karena jaringan, simpan tetap bisa.
      if (err instanceof ApiError && err.kode === 'VALIDASI' && err.field.no_wa) setErrorField(input, err.field.no_wa);
      else catatJikaBug(err);
    }
  }

  input.addEventListener('blur', () => {
    const bersih = bersihkanNoWa(input.value);
    if (bersih !== input.value) input.value = bersih;
    if (bersih === '') {
      setPeringatanField(input, null);
      return;
    }
    const v = validasiNoWa(bersih);
    setErrorField(input, v.ok ? null : v.pesan);
    if (v.ok) cekDuplikat();
  });
  input.addEventListener('input', () => {
    pengendali?.abort();
    setErrorField(input, null);
    setPeringatanField(input, null);
  });
}
