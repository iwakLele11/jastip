#!/usr/bin/env bash
# Menjalankan test back-end (backend/bin/test.sh) terhadap MySQL 8.4 LTS, bukan MariaDB.
# MySQL dinyalakan dan dimatikan di perintah yang sama (proses latar belakang sandbox
# mati saat perintah shell selesai).
#
# Prasyarat (sekali): qa/mysql8/setup-mysql8.sh  (unduh tarball minimal + libaio/libnuma)
# Pakai:             qa/mysql8/test-backend-mysql8.sh [argumen phpunit...]
set -uo pipefail
T=/projects/sandbox/.tools
M="$T/mysql8"
DATA="${MYSQL8_DATA:-$T/mysql8-data}"
SOCK="$T/mysql8.sock"
PORT="${MYSQL8_PORT:-3308}"
export LD_LIBRARY_PATH="$T/mysql8-libs/usr/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

[ -x "$M/bin/mysqld" ] || { echo "MySQL 8 belum dipasang. Jalankan qa/mysql8/setup-mysql8.sh"; exit 2; }

if [ ! -d "$DATA/mysql" ]; then
  mkdir -p "$DATA"
  "$M/bin/mysqld" --no-defaults --initialize-insecure --basedir="$M" --datadir="$DATA" --user=root \
    >"$T/mysql8-init.log" 2>&1 || { echo "initialize gagal, lihat $T/mysql8-init.log"; exit 1; }
fi

# Konfigurasi bawaan MySQL 8.4 (sql_mode default, collation server utf8mb4_0900_ai_ci) supaya
# mirip hosting MySQL 8 pada umumnya.
"$M/bin/mysqld" --no-defaults --basedir="$M" --datadir="$DATA" --user=root \
  --socket="$SOCK" --port="$PORT" --bind-address=127.0.0.1 --mysqlx=OFF \
  --pid-file="$T/mysql8.pid" --log-error="$T/mysql8.err" >/dev/null 2>&1 &
PID=$!
for _ in $(seq 1 60); do
  "$M/bin/mysqladmin" --socket="$SOCK" -uroot ping >/dev/null 2>&1 && break
  sleep 1
done
if ! "$M/bin/mysqladmin" --socket="$SOCK" -uroot ping >/dev/null 2>&1; then
  echo "MySQL 8 gagal start, lihat $T/mysql8.err"; kill "$PID" 2>/dev/null; exit 1
fi
"$M/bin/mysql" --socket="$SOCK" -uroot -N -e "SELECT CONCAT('server: ', VERSION(), ' | sql_mode: ', @@GLOBAL.sql_mode, ' | collation: ', @@collation_server)"

cd /projects/sandbox/backend
PHP_BIN="$T/php/php" DB_SH= TEST_DB_HOST=127.0.0.1 TEST_DB_PORT="$PORT" TEST_DB_USER=root TEST_DB_PASSWORD= \
  bin/test.sh "$@"
STATUS=$?

"$M/bin/mysqladmin" --socket="$SOCK" -uroot shutdown >/dev/null 2>&1
wait "$PID" 2>/dev/null
exit $STATUS
