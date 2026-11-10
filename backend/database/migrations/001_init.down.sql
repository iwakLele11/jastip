-- Rollback 001_init: MENGHAPUS SEMUA TABEL DAN DATA aplikasi.
-- Hanya dijalankan lewat `bin/migrate.php down --yes` (ditolak di production
-- kecuali dengan --allow-production). Backup database lebih dulu.

DROP TABLE IF EXISTS pengembalian_dana;
DROP TABLE IF EXISTS pembayaran;
DROP TABLE IF EXISTS baris_pesanan;
DROP TABLE IF EXISTS keranjang;
DROP TABLE IF EXISTS customer;
DROP TABLE IF EXISTS open_po;
DROP TABLE IF EXISTS pengaturan;
DROP TABLE IF EXISTS percobaan_login;
DROP TABLE IF EXISTS sesi_login;
DROP TABLE IF EXISTS admin;
