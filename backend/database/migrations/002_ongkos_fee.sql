-- Model harga baru: ongkos berat + fee jastip (AUD), menggantikan markup persen untuk
-- baris pesanan BARU. Baris lama tetap memakai markup_bp (dibiarkan apa adanya; kalau perlu
-- diubah, dihapus lalu dibuat ulang). Satuan sen AUD, sama dengan harga_aud_sen.
--
--   harga_jual_unit = bulat_ke_atas_Rp1000( (harga_aud_sen + ongkos_berat_sen + fee_jastip_sen) × kurs / 100 )
--
-- Baris baru: markup_bp NULL, ongkos_berat_sen + fee_jastip_sen terisi.
-- Baris lama: markup_bp terisi, ongkos_berat_sen + fee_jastip_sen NULL.

ALTER TABLE baris_pesanan MODIFY markup_bp INT UNSIGNED NULL;
ALTER TABLE baris_pesanan ADD COLUMN ongkos_berat_sen INT UNSIGNED NULL AFTER markup_bp;
ALTER TABLE baris_pesanan ADD COLUMN fee_jastip_sen INT UNSIGNED NULL AFTER ongkos_berat_sen;

-- Tiap baris memakai tepat satu model: markup (lama) ATAU ongkos+fee (baru).
ALTER TABLE baris_pesanan ADD CONSTRAINT chk_baris_pesanan_model CHECK (
    (markup_bp IS NOT NULL AND ongkos_berat_sen IS NULL AND fee_jastip_sen IS NULL)
    OR (markup_bp IS NULL AND ongkos_berat_sen IS NOT NULL AND fee_jastip_sen IS NOT NULL)
);

-- Pengaturan: default ongkos berat dan fee jastip (sen AUD). Default ongkos 500 (AUD 5,00),
-- fee 300 (AUD 3,00). Kolom default_markup_bp dibiarkan (tidak dipakai form barang lagi).
ALTER TABLE pengaturan ADD COLUMN default_ongkos_berat_sen INT UNSIGNED NOT NULL DEFAULT 500 AFTER default_markup_bp;
ALTER TABLE pengaturan ADD COLUMN default_fee_jastip_sen INT UNSIGNED NOT NULL DEFAULT 300 AFTER default_ongkos_berat_sen;
