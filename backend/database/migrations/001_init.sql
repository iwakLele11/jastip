-- 001_init: skema awal aplikasi jastip, mencakup semua fitur Must (tahap 1 dan 2).
-- Target: MySQL 8.0.16+ dan MariaDB 10.6+ (CHECK constraint ditegakkan di keduanya).
--
-- Konvensi satuan (tanpa float):
--   * rupiah            : BIGINT, Rp bulat
--   * harga AUD         : INT, sen (AUD 24,95 = 2495)
--   * persen            : INT, basis point (1% = 100, 3,5% = 350)
--   * kurs jastip       : INT, rupiah bulat per 1 AUD
--   * kurs pasar        : DECIMAL(14,6), apa adanya dari Frankfurter
-- Semua DATETIME disimpan dalam UTC (koneksi memakai time_zone '+00:00').
-- Kolom uang memakai BIGINT signed + CHECK > 0 supaya selisih di SQL tidak
-- memicu error "BIGINT UNSIGNED value is out of range".

CREATE TABLE admin (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nama_pengguna VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_nama_pengguna (nama_pengguna)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Token sesi hanya disimpan sebagai hash SHA-256 (hex). terakhir_aktif_at dipakai
-- untuk batas 12 jam tidak aktif (sliding), dan berfungsi sebagai updated_at.
CREATE TABLE sesi_login (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    terakhir_aktif_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sesi_login_token_hash (token_hash),
    KEY idx_sesi_login_terakhir_aktif (terakhir_aktif_at),
    KEY idx_sesi_login_admin (admin_id),
    CONSTRAINT fk_sesi_login_admin FOREIGN KEY (admin_id) REFERENCES admin (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Log percobaan login gagal untuk pembatasan (5 kali / 15 menit per nama pengguna).
-- kunci_hash = SHA-256 dari nama pengguna (lowercase, trim), supaya teks yang
-- diketik (bisa saja kata sandi yang salah kolom) tidak tersimpan apa adanya.
-- Tabel log, baris tidak pernah diubah, jadi tanpa updated_at.
CREATE TABLE percobaan_login (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    kunci_hash CHAR(64) NOT NULL,
    dicoba_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_percobaan_login_kunci_waktu (kunci_hash, dicoba_at),
    KEY idx_percobaan_login_waktu (dicoba_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pengaturan global, selalu tepat satu baris (id = 1).
CREATE TABLE pengaturan (
    id TINYINT UNSIGNED NOT NULL,
    default_markup_bp INT UNSIGNED NOT NULL,
    buffer_aud_bp INT UNSIGNED NOT NULL,
    dp_bp INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_pengaturan_satu_baris CHECK (id = 1),
    CONSTRAINT chk_pengaturan_markup CHECK (default_markup_bp <= 10000),
    CONSTRAINT chk_pengaturan_buffer CHECK (buffer_aud_bp <= 10000),
    CONSTRAINT chk_pengaturan_dp CHECK (dp_bp <= 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pengaturan (id, default_markup_bp, buffer_aud_bp, dp_bp) VALUES (1, 1000, 300, 5000);

-- Open PO. Kurs dan DP % adalah snapshot saat PO dibuat (scope + ui-spec §13 P4).
-- kurs_terkunci_at diisi di transaksi yang sama dengan insert baris pesanan pertama,
-- dan tidak pernah dikosongkan lagi.
CREATE TABLE open_po (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nama VARCHAR(100) NOT NULL,
    mata_uang CHAR(3) NOT NULL DEFAULT 'AUD',
    status ENUM('buka', 'selesai') NOT NULL DEFAULT 'buka',
    kurs_mode ENUM('otomatis', 'manual') NOT NULL,
    kurs_pasar DECIMAL(14, 6) NULL,
    kurs_tanggal DATE NULL,
    kurs_buffer_bp INT UNSIGNED NULL,
    kurs_jastip INT UNSIGNED NOT NULL,
    dp_bp INT UNSIGNED NOT NULL,
    kurs_terkunci_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_open_po_status_created (status, created_at),
    CONSTRAINT chk_open_po_mata_uang CHECK (mata_uang = 'AUD'),
    CONSTRAINT chk_open_po_kurs_jastip CHECK (kurs_jastip > 0),
    CONSTRAINT chk_open_po_kurs_pasar CHECK (kurs_pasar IS NULL OR kurs_pasar > 0),
    CONSTRAINT chk_open_po_kurs_pasar_tanggal CHECK ((kurs_pasar IS NULL) = (kurs_tanggal IS NULL)),
    CONSTRAINT chk_open_po_buffer CHECK (kurs_buffer_bp IS NULL OR kurs_buffer_bp <= 10000),
    CONSTRAINT chk_open_po_otomatis CHECK (kurs_mode = 'manual' OR (kurs_pasar IS NOT NULL AND kurs_buffer_bp IS NOT NULL)),
    CONSTRAINT chk_open_po_manual CHECK (kurs_mode = 'otomatis' OR kurs_buffer_bp IS NULL),
    CONSTRAINT chk_open_po_dp CHECK (dp_bp <= 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer. no_wa disimpan kanonik: digit saja, diawali 62 (contoh 6281234567890).
-- Tidak UNIQUE: no WA ganda hanya peringatan (scope M4).
-- Customer yang sudah punya pesanan diarsipkan (diarsipkan_at), bukan dihapus.
CREATE TABLE customer (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nama VARCHAR(100) NOT NULL,
    no_wa VARCHAR(15) NOT NULL,
    alamat VARCHAR(500) NULL,
    diarsipkan_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_customer_nama (nama),
    KEY idx_customer_no_wa (no_wa),
    KEY idx_customer_arsip_updated (diarsipkan_at, updated_at),
    CONSTRAINT chk_customer_no_wa CHECK (no_wa LIKE '62%' AND CHAR_LENGTH(no_wa) BETWEEN 11 AND 15)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Keranjang = pesanan satu customer dalam satu Open PO. Dibuat saat baris pesanan
-- atau pembayaran pertama disimpan (ui-spec §13 P1).
CREATE TABLE keranjang (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    open_po_id INT UNSIGNED NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_keranjang_po_customer (open_po_id, customer_id),
    KEY idx_keranjang_customer (customer_id),
    CONSTRAINT fk_keranjang_open_po FOREIGN KEY (open_po_id) REFERENCES open_po (id) ON DELETE RESTRICT,
    CONSTRAINT fk_keranjang_customer FOREIGN KEY (customer_id) REFERENCES customer (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Baris pesanan dengan snapshot harga. Hard delete hanya untuk salah input;
-- barang tidak tersedia ditandai kosong = 1 (tidak dihitung ke total).
CREATE TABLE baris_pesanan (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    keranjang_id INT UNSIGNED NOT NULL,
    nama_barang VARCHAR(150) NOT NULL,
    harga_aud_sen INT UNSIGNED NOT NULL,
    qty INT UNSIGNED NOT NULL,
    markup_bp INT UNSIGNED NOT NULL,
    kurs_jastip INT UNSIGNED NOT NULL,
    harga_jual_unit BIGINT NOT NULL,
    subtotal BIGINT NOT NULL,
    kosong TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_baris_pesanan_keranjang_nama (keranjang_id, nama_barang),
    CONSTRAINT fk_baris_pesanan_keranjang FOREIGN KEY (keranjang_id) REFERENCES keranjang (id) ON DELETE RESTRICT,
    CONSTRAINT chk_baris_pesanan_harga CHECK (harga_aud_sen > 0),
    CONSTRAINT chk_baris_pesanan_qty CHECK (qty >= 1),
    CONSTRAINT chk_baris_pesanan_markup CHECK (markup_bp <= 10000),
    CONSTRAINT chk_baris_pesanan_kurs CHECK (kurs_jastip > 0),
    CONSTRAINT chk_baris_pesanan_harga_jual CHECK (harga_jual_unit > 0 AND harga_jual_unit % 1000 = 0),
    CONSTRAINT chk_baris_pesanan_subtotal CHECK (subtotal = harga_jual_unit * qty),
    CONSTRAINT chk_baris_pesanan_kosong CHECK (kosong IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pembayaran dan pengembalian dana. Tidak ada fitur ubah; salah input dihapus
-- (hard delete) lalu dicatat ulang. Penghapusan dicatat di log aplikasi.
CREATE TABLE pembayaran (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    keranjang_id INT UNSIGNED NOT NULL,
    nominal BIGINT NOT NULL,
    tanggal DATE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pembayaran_keranjang_tanggal (keranjang_id, tanggal),
    CONSTRAINT fk_pembayaran_keranjang FOREIGN KEY (keranjang_id) REFERENCES keranjang (id) ON DELETE RESTRICT,
    CONSTRAINT chk_pembayaran_nominal CHECK (nominal > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pengembalian_dana (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    keranjang_id INT UNSIGNED NOT NULL,
    nominal BIGINT NOT NULL,
    tanggal DATE NOT NULL,
    catatan VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pengembalian_dana_keranjang_tanggal (keranjang_id, tanggal),
    CONSTRAINT fk_pengembalian_dana_keranjang FOREIGN KEY (keranjang_id) REFERENCES keranjang (id) ON DELETE RESTRICT,
    CONSTRAINT chk_pengembalian_dana_nominal CHECK (nominal > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
