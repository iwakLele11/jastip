#!/usr/bin/env bash
# Menjalankan semua test dengan satu perintah:
#   1. start MariaDB lokal (kalau DB_SH tersedia),
#   2. PHPUnit (unit + integrasi; database test jastip_test dibuat ulang otomatis),
#   3. cek gaya kode PSR-12 (phpcs),
#   4. stop MariaDB.
#
# Default memakai alat di sandbox (/projects/sandbox/.tools). Di mesin lain:
#   PHP_BIN=php DB_SH= TEST_DB_PORT=3306 TEST_DB_USER=... TEST_DB_PASSWORD=... bin/test.sh
# Argumen tambahan diteruskan ke PHPUnit, mis. bin/test.sh --filter CustomerTest
set -uo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$(cd "$BACKEND_DIR/.." && pwd)/.tools"
PHP_BIN="${PHP_BIN-$TOOLS_DIR/php/php}"
DB_SH="${DB_SH-$TOOLS_DIR/db.sh}"
COMPOSER_PHAR="${COMPOSER_PHAR-$TOOLS_DIR/composer.phar}"

cd "$BACKEND_DIR" || exit 1

if [ ! -d vendor ]; then
  echo "== composer install"
  "$PHP_BIN" "$COMPOSER_PHAR" install --no-interaction --no-progress || exit 1
fi

if [ -n "$DB_SH" ]; then
  echo "== start database"
  "$DB_SH" start || exit 1
  trap '"$DB_SH" stop >/dev/null 2>&1' EXIT
fi

echo "== phpunit"
"$PHP_BIN" vendor/bin/phpunit "$@"
phpunit_status=$?

echo "== phpcs (PSR-12)"
"$PHP_BIN" vendor/bin/phpcs -q
phpcs_status=$?

if [ $phpunit_status -ne 0 ] || [ $phpcs_status -ne 0 ]; then
  echo "GAGAL (phpunit=$phpunit_status, phpcs=$phpcs_status)"
  exit 1
fi
echo "SEMUA LULUS"
