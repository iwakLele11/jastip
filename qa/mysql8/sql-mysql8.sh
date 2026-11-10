#!/usr/bin/env bash
# QA bagian A: SQL paket (install.sql, upgrade SQL, SQL create-admin) di MySQL 8.4 LTS bawaan
# (sql_mode default, collation server utf8mb4_0900_ai_ci). Tidak menyentuh MariaDB sandbox.
# Prasyarat: qa/mysql8/setup-mysql8.sh. Hasil: qa/hasil/mysql8-sql.json
set -uo pipefail
QA=/projects/sandbox/qa
T=/projects/sandbox/.tools
PHP="$T/php/php"
M="$T/mysql8"
DATA="${MYSQL8_DATA:-$T/mysql8-data}"
SOCK="$T/mysql8.sock"
PORT="${MYSQL8_PORT:-3308}"
ZIP="${QA_ZIP:-/projects/sandbox/build/jastip-htdocs.zip}"
export LD_LIBRARY_PATH="$T/mysql8-libs/usr/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
[ -x "$M/bin/mysqld" ] || { echo "MySQL 8 belum dipasang. Jalankan qa/mysql8/setup-mysql8.sh"; exit 2; }
[ -f "$ZIP" ] || { echo "zip belum ada: jalankan deploy/build-htdocs.sh"; exit 1; }

DIR="$(mktemp -d "$T/tmp/qa-mysql8-sql-XXXX")"
QA_TSV="$DIR/hasil.tsv"
# shellcheck source=../lib/hasil.sh
source "$QA/lib/hasil.sh"

if [ ! -d "$DATA/mysql" ]; then
  mkdir -p "$DATA"
  "$M/bin/mysqld" --no-defaults --initialize-insecure --basedir="$M" --datadir="$DATA" --user=root >"$T/mysql8-init.log" 2>&1 \
    || { echo "initialize gagal, lihat $T/mysql8-init.log"; exit 1; }
fi
"$M/bin/mysqld" --no-defaults --basedir="$M" --datadir="$DATA" --user=root --socket="$SOCK" --port="$PORT" --bind-address=127.0.0.1 \
  --mysqlx=OFF --pid-file="$T/mysql8.pid" --log-error="$T/mysql8.err" >/dev/null 2>&1 &
PID=$!
trap '"$M/bin/mysqladmin" --socket="$SOCK" -uroot shutdown >/dev/null 2>&1; wait "$PID" 2>/dev/null' EXIT
for _ in $(seq 1 60); do "$M/bin/mysqladmin" --socket="$SOCK" -uroot ping >/dev/null 2>&1 && break; sleep 1; done
my() { "$M/bin/mysql" --socket="$SOCK" -uroot "$@"; }
DB=jastip_qa_mysql8
cek "M8-00" "server MySQL 8.4" "8.4" "$(my -N -e 'SELECT VERSION()' | cut -d. -f1-2)"

unzip -q "$ZIP" "app/*" -d "$DIR"
my -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
OUT="$(my "$DB" < "$DIR/app/install.sql" 2>&1)"; RC=$?
cek "M8-01" "install.sql paket diimpor ke DB kosong" "0 " "$RC $OUT"
cek "M8-02" "11 tabel, schema_migrations = 001_init" "11 001_init" \
  "$(my -N "$DB" -e "SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()), (SELECT GROUP_CONCAT(version) FROM schema_migrations)" | tr '\t' ' ')"
OUT2="$(my "$DB" < "$DIR/app/install.sql" 2>&1)"
cek_cocok "M8-03" "impor kedua berhenti di pernyataan pertama (1050)" "^ERROR 1050 \(42S01\) at line [0-9]+: Table 'schema_migrations' already exists$" "$OUT2"
cek_cocok "M8-04" "CHECK constraint ditegakkan MySQL 8 (pengaturan id=2 ditolak, error 3819 SQLSTATE HY000)" "ERROR 3819 \(HY000\)" \
  "$(my "$DB" -e 'INSERT INTO pengaturan (id, default_markup_bp, buffer_aud_bp, dp_bp) VALUES (2, 1, 1, 1)' 2>&1)"

# Upgrade SQL: migrasi contoh 002 di folder sementara, SQL dibuat dengan MigrationSqlExport yang sama
# dengan bin/export-sql.php (deploy/build-htdocs.sh → app/upgrade/NNN_*.sql).
mkdir -p "$DIR/mig"
cp /projects/sandbox/backend/database/migrations/001_init.sql /projects/sandbox/backend/database/migrations/001_init.down.sql "$DIR/mig/"
printf 'CREATE TABLE qa_contoh (id INT NOT NULL PRIMARY KEY);\n' > "$DIR/mig/002_qa_contoh.sql"
printf 'DROP TABLE qa_contoh;\n' > "$DIR/mig/002_qa_contoh.down.sql"
"$PHP" -r 'require "/projects/sandbox/backend/vendor/autoload.php"; echo (new Jastip\Infrastructure\MigrationSqlExport($argv[1]))->upgrade("002_qa_contoh");' -- "$DIR/mig" > "$DIR/upgrade-002.sql"
cek_cocok "M8-05" "upgrade SQL dibuat; pernyataan pertama = INSERT … (SELECT … FROM schema_migrations …)" \
  "^INSERT INTO schema_migrations \(version, applied_at\) VALUES \('002_qa_contoh', \(SELECT UTC_TIMESTAMP\(\) FROM schema_migrations WHERE version = '001_init'\)\);$" \
  "$(grep '^INSERT INTO schema_migrations' "$DIR/upgrade-002.sql")"
OUT3="$(my "$DB" < "$DIR/upgrade-002.sql" 2>&1)"
cek "M8-06" "upgrade 002 ke DB yang sudah berisi 001_init (kasus normal) berhasil" "berhasil" \
  "$( [ -z "$OUT3" ] && echo berhasil || echo "$OUT3")"
cek "M8-07" "setelah upgrade: schema_migrations 001_init,002_qa_contoh dan tabel qa_contoh ada" "001_init,002_qa_contoh 1" \
  "$(my -N "$DB" -e "SELECT (SELECT GROUP_CONCAT(version ORDER BY version) FROM schema_migrations), (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qa_contoh')" | tr '\t' ' ')"
tanpa_efek() {
  [ -z "$OUT3" ] && { echo ya; return; }
  local n; n="$(my -N "$DB" -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qa_contoh'")"
  [ "$n" = 0 ] && echo ya || echo tidak
}
cek "M8-08" "kalau pengaman gagal, tidak ada yang berubah (qa_contoh tidak dibuat)" "ya" "$(tanpa_efek)"
printf '%s\n' "$OUT3" > "$DIR/upgrade-002.out"

# SQL create-admin --sql dan --sql --reset (DELETE … IN (SELECT id FROM admin …): tabel lain, aman dari 1093).
PASS="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
OUT4="$(printf '%s\n' "$PASS" | "$PHP" "$DIR/app/bin/create-admin.php" pemilik --sql 2>/dev/null | my "$DB" 2>&1)"
my "$DB" -e "INSERT INTO sesi_login (admin_id, token_hash, terakhir_aktif_at) SELECT id, REPEAT('a', 64), UTC_TIMESTAMP() FROM admin"
OUT5="$(printf '%s\n' "$PASS" | "$PHP" "$DIR/app/bin/create-admin.php" PEMILIK --sql --reset 2>/dev/null | my -vvv "$DB" 2>&1)"
cek "M8-09" "SQL create-admin --sql dan --sql --reset jalan di MySQL 8 (UPDATE 1 baris, sesi terhapus)" " 1 0" \
  "$OUT4 $(echo "$OUT5" | grep -A5 '^UPDATE' | grep -o 'Rows matched: [0-9]*' | grep -o '[0-9]*') $(my -N "$DB" -e 'SELECT COUNT(*) FROM sesi_login')"

cp "$DIR/upgrade-002.sql" "$DIR/upgrade-002.out" "$QA/tmp/" 2>/dev/null
hasil_tulis mysql8-sql "MySQL $(my -N -e 'SELECT VERSION()') (default sql_mode, collation server utf8mb4_0900_ai_ci)"
