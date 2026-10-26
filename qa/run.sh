#!/usr/bin/env bash
# Menjalankan uji QA (sandbox). Semua hasil JSON ditulis ke qa/hasil/.
#
#   qa/run.sh bagian-a            semua uji bagian A (API, keamanan, perhitungan, rekap WA,
#                                 konkurensi, open redirect, paket htdocs di Apache dengan MariaDB
#                                 10.11 dan 11.4, MySQL 8.4), lalu ringkasan
#   qa/run.sh keamanan|hitung|rekap|konkurensi|redirect
#                                 satu suite Node di .tools/dev-stack.sh (DB jastip_e2e baru tiap suite)
#   qa/run.sh paket [10.11|11.4|11.4-sendiri]   paket htdocs di Apache + PHP-FPM (default: 10.11 dan 11.4)
#   qa/run.sh mysql8              bin/test.sh back-end terhadap MySQL 8.4 (hasil per test) + SQL paket di MySQL 8.4
#   qa/run.sh ringkasan           tabel ringkasan dari qa/hasil/*.json
#
# Semua langkah memakai MariaDB bersama di port 3307 (dev-stack, paket 11.4) secara BERURUTAN.
# Jangan menjalankan dua perintah qa/run.sh atau dev-stack sekaligus.
# Env opsional: QA_SEED (seed acak perhitungan), QA_PUTARAN (putaran konkurensi, default 10).
set -uo pipefail
ROOT=/projects/sandbox
QA="$ROOT/qa"
T="$ROOT/.tools"
cd "$ROOT" || exit 1
mkdir -p "$QA/hasil" "$QA/tmp" "$T/tmp"
GAGAL=0

prasyarat() {
  [ -f "$ROOT/frontend/dist/index.html" ] || { echo "frontend/dist belum ada: cd frontend && npm run build"; exit 1; }
  local baru
  baru="$(find "$ROOT/frontend/src" -newer "$ROOT/frontend/dist/index.html" -type f | head -3)"
  [ -z "$baru" ] || echo "PERINGATAN: frontend/src lebih baru dari frontend/dist (npm run build dulu):"$'\n'"$baru"
}
prasyarat_paket() {
  [ -f "$ROOT/build/jastip-htdocs.zip" ] || { echo "build/jastip-htdocs.zip belum ada: deploy/build-htdocs.sh"; exit 1; }
  local baru
  baru="$(find "$ROOT/backend/src" "$ROOT/backend/bin" "$ROOT/backend/database" "$ROOT/deploy" "$ROOT/frontend/src" -newer "$ROOT/build/jastip-htdocs.zip" -type f | head -3)"
  [ -z "$baru" ] || echo "PERINGATAN: sumber lebih baru dari build/jastip-htdocs.zip (jalankan deploy/build-htdocs.sh):"$'\n'"$baru"
}

suite_dev() { # nama-suite
  local file
  case "$1" in
    redirect) file="$QA/frontend/next-redirect.mjs" ;;
    *) file="$QA/api/$1.mjs" ;;
  esac
  echo; echo "######## $1 (dev-stack: php -S + MariaDB 11.4, DB jastip_e2e baru)"
  "$T/dev-stack.sh" node "$file" || GAGAL=1
}

paket() { # varian
  prasyarat_paket
  echo; echo "######## paket htdocs, MariaDB $1 (Apache + PHP-FPM)"
  "$QA/paket/uji-paket.sh" "$1" | grep -v '^  LULUS' || true
  python3 -c "import json,sys; sys.exit(1 if json.load(open('$QA/hasil/paket-$1.json'))['gagal'] else 0)" || GAGAL=1
}

mysql8() {
  prasyarat_paket
  echo; echo "######## MySQL 8.4: backend/bin/test.sh (PHPUnit + phpcs)"
  rm -f "$QA/tmp/mysql8-junit.xml"
  "$QA/mysql8/test-backend-mysql8.sh" --log-junit "$QA/tmp/mysql8-junit.xml" | tail -40
  if [ -f "$QA/tmp/mysql8-junit.xml" ]; then
    python3 "$QA/mysql8/junit-ke-json.py" "$QA/tmp/mysql8-junit.xml" "$QA/hasil/mysql8-backend.json" "backend/bin/test.sh, MySQL 8.4.13" || GAGAL=1
  else
    echo "GAGAL: log JUnit tidak terbentuk"; GAGAL=1
  fi
  echo; echo "######## MySQL 8.4: install.sql, upgrade SQL, SQL create-admin"
  "$QA/mysql8/sql-mysql8.sh" || GAGAL=1
}

case "${1:-}" in
  bagian-a)
    prasyarat
    for s in keamanan hitung rekap konkurensi redirect; do suite_dev "$s"; done
    paket 10.11
    paket 11.4
    mysql8
    echo; echo "######## ringkasan"
    python3 "$QA/tools/ringkasan.py"
    ;;
  keamanan|hitung|rekap|konkurensi|redirect) prasyarat; suite_dev "$1" ;;
  paket)
    if [ -n "${2:-}" ]; then paket "$2"; else paket 10.11; paket 11.4; fi ;;
  mysql8) mysql8 ;;
  ringkasan) python3 "$QA/tools/ringkasan.py" ;;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac
exit $GAGAL
