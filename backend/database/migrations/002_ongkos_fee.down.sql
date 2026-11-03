-- Rollback model ongkos + fee. Menghapus kolom baru. Baris baru (markup_bp NULL) akan
-- melanggar NOT NULL saat markup_bp dikembalikan; backup dulu sebelum rollback di production.

ALTER TABLE pengaturan DROP COLUMN default_fee_jastip_sen;
ALTER TABLE pengaturan DROP COLUMN default_ongkos_berat_sen;

ALTER TABLE baris_pesanan DROP CONSTRAINT chk_baris_pesanan_model;
ALTER TABLE baris_pesanan DROP COLUMN fee_jastip_sen;
ALTER TABLE baris_pesanan DROP COLUMN ongkos_berat_sen;
ALTER TABLE baris_pesanan MODIFY markup_bp INT UNSIGNED NOT NULL;
