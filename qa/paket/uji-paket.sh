#!/usr/bin/env bash
# QA bagian A: paket htdocs (build/jastip-htdocs.zip) di Apache 2.4 + PHP-FPM sungguhan, layout
# XAMPP/InfinityFree (web root = isi zip, back-end di app/, .htaccess paket dibaca apa adanya).
# Turunan dari .tools/paket-smoke.sh (Apache + PHP-FPM dari .tools/httpd-root), ditambah:
#   - install.sql ke DB kosong + impor kedua gagal di pernyataan pertama tanpa merusak,
#   - create-admin.php --sql dan --sql --reset (validasi, isi SQL, efek ke sesi),
#   - header HTTP, 403 file sensitif (termasuk variasi huruf, encoding, titik/garis miring akhir,
#     emulasi nama Windows lewat symlink), listing folder, index.php hanya /api/*,
#   - blok "Paksa HTTPS", konfigurasi production salah (500 tanpa bocor, alasan di app.log),
#   - suite Node (keamanan, hitung, rekap, konkurensi) terhadap paket (QA_PAKET_NODE=0 untuk lewati).
# Pakai: qa/paket/uji-paket.sh [11.4|11.4-sendiri|10.11]
# Hasil: qa/hasil/paket-<varian>.json (+ keamanan-paket-<varian>.json, dst.)
# Proses latar belakang sandbox mati saat perintah selesai, jadi DB + server hidup selama skrip ini.
set -uo pipefail
QA=/projects/sandbox/qa
T=/projects/sandbox/.tools
PHP="$T/php/php"
ZIP="${QA_ZIP:-/projects/sandbox/build/jastip-htdocs.zip}"
VARIAN="${1:-11.4}"
NODE_SUITE="${QA_PAKET_NODE:-1}"
case "$VARIAN" in
  11.4)         DB_SH="$T/db.sh";              DB_PORT=3307; CLIENT="$T/mariadb/bin/mariadb";       SOCK="$T/mariadb.sock" ;;
  11.4-sendiri) DB_SH="$T/db-11.4-sendiri.sh"; DB_PORT=3310; CLIENT="$T/mariadb/bin/mariadb";       SOCK="$T/mariadb-11.4-sendiri.sock" ;;
  10.11)        DB_SH="$T/db-10.11.sh";        DB_PORT=3309; CLIENT="$T/mariadb-10.11/bin/mariadb"; SOCK="$T/mariadb-10.11.sock" ;;
  *) echo "varian DB: 11.4, 11.4-sendiri, atau 10.11"; exit 2 ;;
esac
HTTP_PORT=$((8280 + DB_PORT - 3307))
export LD_LIBRARY_PATH="$T/lib"
[ -f "$ZIP" ] || { echo "zip belum ada: jalankan deploy/build-htdocs.sh"; exit 1; }
mkdir -p "$T/tmp" "$QA/hasil"

DIR="$(mktemp -d "$T/tmp/qa-paket-$VARIAN-XXXX")"
chmod 755 "$DIR"
H="$DIR/htdocs"
A="$DIR/apache"
U="http://127.0.0.1:$HTTP_PORT"
J="$DIR/cookies.txt"
DB=jastip_paket
PASS="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
PIDS=()
QA_TSV="$DIR/hasil.tsv"
# shellcheck source=../lib/hasil.sh
source "$QA/lib/hasil.sh"

berhenti() {
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done
  "$DB_SH" stop >/dev/null 2>&1
}
trap berhenti EXIT

mysqlc() { "$CLIENT" --socket="$SOCK" -uroot "$@"; }
kode() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
kode_u() { kode --path-as-is "$U$1"; }
hdr() { curl -s -o /dev/null -D - --path-as-is "${@:3}" "$U$1" | tr -d '\r' | awk -v h="$2" 'BEGIN{IGNORECASE=1} index(tolower($0), tolower(h)": ")==1 {sub(/^[^:]*: /,""); v = v (v=="" ? "" : " | ") $0} END{print v}'; }
api() { curl -s -b "$J" -c "$J" -X "$1" "$U/api/v1$2" -H "Origin: $U" -H 'Content-Type: application/json' ${3:+-d "$3"}; }
jq_() { "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true); $v=eval("return $argv[1];"); echo is_string($v)?$v:json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),"\n";' "$1"; }
skema() { mysqlc -N "$DB" -e "SELECT TABLE_NAME, TABLE_COLLATION, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY 1; SELECT * FROM schema_migrations; SELECT * FROM pengaturan; SELECT COUNT(*) FROM admin;" 2>&1 | md5sum | cut -c1-12; }
env_dev() {
  sed -e "s#^APP_ALLOWED_ORIGINS=.*#APP_ALLOWED_ORIGINS=$U#" -e "s#^DB_PORT=.*#DB_PORT=$DB_PORT#" -e "s#^DB_NAME=.*#DB_NAME=$DB#" \
    "$H/app/.env.contoh-lokal" > "$H/app/.env"
}
env_prod() { # SECURE ORIGINS [baris tambahan]
  sed -e "s#^APP_ALLOWED_ORIGINS=.*#APP_ALLOWED_ORIGINS=$2#" -e "s#^DB_HOST=.*#DB_HOST=127.0.0.1#" -e "s#^DB_PORT=.*#DB_PORT=$DB_PORT#" \
    -e "s#^DB_NAME=.*#DB_NAME=$DB#" -e "s#^DB_USER=.*#DB_USER=root#" -e "s#^DB_PASSWORD=.*#DB_PASSWORD=#" \
    -e "s#^SESSION_COOKIE_SECURE=.*#SESSION_COOKIE_SECURE=$1#" "$H/app/.env.contoh-infinityfree" > "$H/app/.env"
  [ -n "${3:-}" ] && printf '%s\n' "$3" >> "$H/app/.env"
  chmod 644 "$H/app/.env"
}
log_akhir() { tail -1 "$H/app/storage/logs/app.log" 2>/dev/null; }

echo "== paket $ZIP ($(wc -c < "$ZIP" | tr -d ' ') byte) -> $DIR"
mkdir -p "$H" && unzip -q "$ZIP" -d "$H" || exit 1
env_dev

# ---------------------------------------------------------------------------------------------
echo "== D. install.sql ke MariaDB $VARIAN (klien mariadb, berhenti di error pertama seperti phpMyAdmin)"
"$DB_SH" start >/dev/null || exit 1
mysqlc -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || exit 1
cek "PKT-D00" "versi server" "${VARIAN%-sendiri}" "$(mysqlc -N -e 'SELECT VERSION()' | cut -d. -f1-2)"
OUT="$(mysqlc "$DB" < "$H/app/install.sql" 2>&1)"; RC=$?
cek "PKT-D01" "impor install.sql ke DB kosong" "0 " "$RC $OUT"
cek "PKT-D02" "11 tabel, semua utf8mb4_unicode_ci" "11 11" \
  "$(mysqlc -N "$DB" -e "SELECT COUNT(*), SUM(TABLE_COLLATION = 'utf8mb4_unicode_ci') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()" | tr '\t' ' ')"
cek "PKT-D03" "schema_migrations berisi 001_init; pengaturan awal 10%/3%/50%" "001_init 1000 300 5000" \
  "$(mysqlc -N "$DB" -e "SELECT (SELECT GROUP_CONCAT(version) FROM schema_migrations), default_markup_bp, buffer_aud_bp, dp_bp FROM pengaturan" | tr '\t' ' ')"
cek "PKT-D04" "CHECK constraint aktif setelah impor (baris pengaturan kedua ditolak)" "ditolak" \
  "$(mysqlc "$DB" -e "INSERT INTO pengaturan (id, default_markup_bp, buffer_aud_bp, dp_bp) VALUES (2, 1, 1, 1)" >/dev/null 2>&1 && echo diterima || echo ditolak)"
SEBELUM="$(skema)"
OUT2="$(mysqlc "$DB" < "$H/app/install.sql" 2>&1)"; RC2=$?
cek_cocok "PKT-D05" "impor kedua gagal di pernyataan pertama (Table 'schema_migrations' already exists)" \
  "^ERROR 1050 \(42S01\) at line [0-9]+: Table 'schema_migrations' already exists$" "$OUT2"
BARIS_ERR="$(echo "$OUT2" | sed -n 's/.* at line \([0-9]*\):.*/\1/p')"
BARIS_CREATE="$(grep -n '^CREATE TABLE schema_migrations' "$H/app/install.sql" | cut -d: -f1)"
cek "PKT-D06" "baris error = CREATE TABLE schema_migrations (pernyataan pertama setelah SET)" "$BARIS_CREATE" "$BARIS_ERR"
cek "PKT-D07" "impor kedua tidak mengubah skema/data (checksum)" "$SEBELUM" "$(skema)"
cek "PKT-D08" "migrate.php status dari paket: 001_init sudah" "001_init sudah" \
  "$(cd "$H/app" && env -i PATH="$PATH" "$PHP" bin/migrate.php status 2>&1 | tr -s ' ' | tr -d '\n')"

echo "== U. SQL upgrade (pengaman pernyataan pertama, pesan error sesuai panduan InfinityFree)"
DBU=jastip_paket_upgrade
mysqlc -e "DROP DATABASE IF EXISTS $DBU; CREATE DATABASE $DBU CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysqlc "$DBU" < "$H/app/install.sql"
mkdir -p "$DIR/mig"
cp "$H/app/database/migrations/"001_init*.sql "$DIR/mig/"
printf 'CREATE TABLE qa_contoh (id INT NOT NULL PRIMARY KEY);\n' > "$DIR/mig/002_qa_contoh.sql"; printf 'DROP TABLE qa_contoh;\n' > "$DIR/mig/002_qa_contoh.down.sql"
printf 'CREATE TABLE qa_contoh3 (id INT NOT NULL PRIMARY KEY);\n' > "$DIR/mig/003_qa_lagi.sql"; printf 'DROP TABLE qa_contoh3;\n' > "$DIR/mig/003_qa_lagi.down.sql"
for v in 002_qa_contoh 003_qa_lagi; do
  "$PHP" -r 'require $argv[1]; echo (new Jastip\Infrastructure\MigrationSqlExport($argv[2]))->upgrade($argv[3]);' -- "$H/app/vendor/autoload.php" "$DIR/mig" "$v" > "$DIR/upgrade-$v.sql"
done
cek_cocok "PKT-U01" "upgrade 003 sebelum 002 → gagal di pernyataan pertama, tanpa perubahan" "^ERROR 1048 \(23000\) at line [0-9]+: Column 'applied_at' cannot be null 0$" \
  "$(mysqlc "$DBU" < "$DIR/upgrade-003_qa_lagi.sql" 2>&1) $(mysqlc -N "$DBU" -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qa_contoh3'")"
cek "PKT-U02" "upgrade 002 (normal) berhasil dan tercatat" " 001_init,002_qa_contoh" \
  "$(mysqlc "$DBU" < "$DIR/upgrade-002_qa_contoh.sql" 2>&1) $(mysqlc -N "$DBU" -e 'SELECT GROUP_CONCAT(version ORDER BY version) FROM schema_migrations')"
cek_cocok "PKT-U03" "upgrade 002 diimpor ulang → Duplicate entry di pernyataan pertama" "^ERROR 1062 \(23000\) at line [0-9]+: Duplicate entry '002_qa_contoh' for key 'PRIMARY'$" \
  "$(mysqlc "$DBU" < "$DIR/upgrade-002_qa_contoh.sql" 2>&1)"
cek "PKT-U04" "migrate.php status setelah upgrade SQL: 002 tercatat 'sudah' (tidak dijalankan ulang)" "001_init sudah 002_qa_contoh sudah" \
  "$(cd "$H/app" && cp -r database/migrations "$DIR/mig-asli" && cp "$DIR/mig/"002* database/migrations/ && env -i PATH="$PATH" DB_NAME="$DBU" "$PHP" bin/migrate.php status 2>&1 | tr -s ' ' | tr '\n' ' ' | sed 's/ $//'; rm -f database/migrations/002*)"
mysqlc -e "DROP DATABASE $DBU;"

echo "== A. create-admin.php --sql"
CA() { printf '%s\n' "$2" | env -i PATH="$PATH" "$PHP" "$H/app/bin/create-admin.php" $1; }
SQL_ADMIN="$(CA "pemilik --sql" "$PASS" 2>"$DIR/ca.err")"; RC=$?
cek "PKT-A01" "--sql: exit 0, STDOUT 2 komentar + 1 INSERT, pesan di STDERR" "0 2 1 ya" \
  "$RC $(grep -c '^-- ' <<<"$SQL_ADMIN") $(grep -c '^INSERT INTO admin (nama_pengguna, password_hash) VALUES ('"'"'pemilik'"'"', '"'"'\$2y\$' <<<"$SQL_ADMIN") $(grep -q 'Salin SQL' "$DIR/ca.err" && echo ya || echo tidak)"
cek "PKT-A02" "--sql: STDOUT tidak memuat kata sandi; hash bcrypt cocok dengan kata sandi" "tidak cocok" \
  "$(grep -q "$PASS" <<<"$SQL_ADMIN" && echo ada || echo tidak) $("$PHP" -r 'preg_match("/VALUES \(.*, '"'"'(.*)'"'"'\)/", $argv[1], $m); echo password_verify($argv[2], $m[1]) ? "cocok" : "beda";' -- "$SQL_ADMIN" "$PASS")"
cek "PKT-A03" "SQL admin diimpor: 1 row inserted" "1" "$(mysqlc -vvv "$DB" <<<"$SQL_ADMIN" | grep -o '^Query OK, [0-9]* row' | grep -o '[0-9]*' | head -1)"
cek "PKT-A04" "nama tidak valid (ab, 'nama spasi', pémilik, 51 karakter) → exit 2 tanpa SQL" "2: 2: 2: 2:" \
  "$(for n in ab 'nama spasi' pémilik "$(printf 'a%.0s' {1..51})"; do o="$(printf '%s\n' "$PASS" | env -i PATH="$PATH" "$PHP" "$H/app/bin/create-admin.php" "$n" --sql 2>/dev/null)"; printf '%s:%s ' "$?" "$o"; done | sed 's/ $//')"
cek "PKT-A05" "kata sandi < 10 karakter / > 72 byte → exit 1 tanpa SQL" "1: 1:" \
  "$(o="$(CA "pemilik --sql" 'pendek123' 2>/dev/null)"; printf '%s:%s ' "$?" "$o"; o="$(CA "pemilik --sql" "$(printf 'x%.0s' {1..73})" 2>/dev/null)"; printf '%s:%s' "$?" "$o")"
cek "PKT-A06" "opsi tidak dikenal (--sq) → exit 2" "2" "$(CA "pemilik --sq" "$PASS" >/dev/null 2>&1; echo $?)"
DUP="$(CA "PEMILIK --sql" "$PASS" 2>/dev/null | mysqlc "$DB" 2>&1)"
cek_cocok "PKT-A07" "INSERT kedua untuk nama sama beda huruf (PEMILIK) ditolak Duplicate entry, admin tetap 1" "Duplicate entry .*1$" "$DUP $(mysqlc -N "$DB" -e 'SELECT COUNT(*) FROM admin')"

# ---------------------------------------------------------------------------------------------
echo "== Apache + PHP-FPM"
HR="$T/httpd-root"
M="$HR/usr/lib64/httpd/modules"
mkdir -p "$A" "$A/tmp"
chmod 777 "$H/app/storage/logs"   # PHP-FPM jalan sebagai nobody (salinan uji saja)
# /tmp sandbox tidak bisa ditulis user nobody. Body request > 16 KB disimpan PHP di file sementara,
# jadi tanpa ini body besar hilang (lingkungan uji, bukan perilaku hosting). Hosting/XAMPP punya tmp sendiri.
chmod 1777 "$A/tmp"
cat > "$A/php.ini" <<EOF
extension_dir = "$HR/usr/lib64/php8.4/modules"
extension=pdo
extension=mysqlnd
extension=pdo_mysql
extension=mbstring
extension=curl
date.timezone = UTC
display_errors = Off
log_errors = On
expose_php = On
sys_temp_dir = "$A/tmp"
upload_tmp_dir = "$A/tmp"
error_log = "$A/php-error.log"
EOF
cat > "$A/php-fpm.conf" <<EOF
[global]
pid = $A/php-fpm.pid
error_log = $A/php-fpm.log
daemonize = no
[www]
user = nobody
group = nobody
listen = $A/php-fpm.sock
listen.mode = 0666
pm = static
pm.max_children = 4
clear_env = yes
EOF
{
  echo "Listen 127.0.0.1:$HTTP_PORT"
  echo "ServerName 127.0.0.1"
  echo "PidFile \"$A/httpd.pid\""
  echo "DefaultRuntimeDir \"$A\""
  echo "User nobody"
  echo "Group nobody"
  for m in mpm_event unixd authz_core authz_host access_compat dir autoindex mime rewrite headers log_config setenvif proxy proxy_fcgi; do
    echo "LoadModule ${m}_module \"$M/mod_$m.so\""
  done
  cat <<EOF
TypesConfig "$HR/etc/mime.types"
ErrorLog "$A/error.log"
LogLevel warn
LogFormat "%h \"%r\" %>s" basic
CustomLog "$A/access.log" basic
DocumentRoot "$H"
<Directory />
    AllowOverride None
    Require all denied
</Directory>
# Seperti XAMPP: mod_autoindex aktif, Options Indexes FollowSymLinks, AllowOverride All
<Directory "$H">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
<Files ".ht*">
    Require all denied
</Files>
<FilesMatch "\.php$">
    SetHandler "proxy:unix:$A/php-fpm.sock|fcgi://localhost"
</FilesMatch>
EOF
} > "$A/httpd.conf"
export LD_LIBRARY_PATH="$HR/usr/lib64:$T/lib"
"$HR/usr/sbin/httpd" -t -f "$A/httpd.conf" >/dev/null 2>&1 || { "$HR/usr/sbin/httpd" -t -f "$A/httpd.conf"; exit 1; }
echo "   $("$HR/usr/sbin/httpd" -v | sed -n 's/^Server version: //p') + PHP-FPM $("$HR/usr/sbin/php-fpm" -n -v | head -1 | cut -d' ' -f2) di $U"
env -i PATH="$PATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" PHP_INI_SCAN_DIR= "$HR/usr/sbin/php-fpm" -c "$A/php.ini" -y "$A/php-fpm.conf" -F >/dev/null 2>&1 &
PIDS+=($!)
env -i PATH="$PATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" "$HR/usr/sbin/httpd" -f "$A/httpd.conf" -DFOREGROUND >/dev/null 2>&1 &
PIDS+=($!)
# File uji yang tidak ikut paket: .sql/.log nyasar di web root, .well-known, skrip PHP polos,
# dan symlink yang meniru cara Windows membaca nama (huruf tidak dibedakan, titik akhir dibuang).
printf -- '-- uji\n' > "$H/admin.sql"; printf -- '-- uji\n' > "$H/Backup.SQL"; printf 'log\n' > "$H/error.log"; printf 'log\n' > "$H/php_error.LOG"
mkdir -p "$H/.well-known/acme-challenge" && echo ok > "$H/.well-known/acme-challenge/uji.txt"
printf '<?php echo "ok";\n' > "$H/uji-xpb.php"
ln -s app "$H/APP"; ln -s app "$H/app."; ln -s app "$H/App "
chmod -R o+rX "$DIR"
for _ in $(seq 1 40); do curl -s -o /dev/null "$U/" && break; sleep 0.25; done

echo "== H. Header HTTP"
CSS="$(grep -o 'css/app.css?v=[0-9a-f]*' "$H/index.html" | head -1)"
JS="$(grep -o 'js/pages/[a-z-]*\.js?v=[0-9a-f]*' "$H/index.html" | head -1)"
cek "PKT-H00" "/ melayani index.html (bukan index.php)" "$(md5sum < "$H/index.html")" "$(curl -s "$U/" | md5sum)"
for p in / /index.html /login.html /keranjang.html; do
  cek "PKT-H01 $p" "HTML $p: XFO | nosniff | Referrer-Policy | Cache-Control" "SAMEORIGIN|nosniff|no-referrer|no-cache" \
    "$(hdr "$p" x-frame-options)|$(hdr "$p" x-content-type-options)|$(hdr "$p" referrer-policy)|$(hdr "$p" cache-control)"
done
for p in "/$CSS" "/$JS" "/js/awal.js?v=1"; do
  cek "PKT-H02 ${p%%\?*}" "CSS/JS ${p%%\?*}: Cache-Control immutable + nosniff" "public, max-age=31536000, immutable|nosniff" "$(hdr "$p" cache-control)|$(hdr "$p" x-content-type-options)"
done
cek_cocok "PKT-H03" "JS dilayani dengan Content-Type JavaScript (nosniff tidak memblokir modul)" "^(text|application)/javascript" "$(hdr "/$JS" content-type)"
XPB=""
for p in / /login.html "/$CSS" "/$JS" /favicon.svg /api/v1/health /api/v1/pengaturan /api/v1/tidak-ada /app/.env /tidak-ada.html /uji-xpb.php /index.php; do
  v="$(hdr "$p" x-powered-by)"; [ -n "$v" ] && XPB="$XPB $p=$v"
done
cek "PKT-H04" "tanpa X-Powered-By di HTML, CSS, JS, SVG, API 200/401/404, 403, 404, skrip PHP polos" "" "$XPB"
cek "PKT-H05" "API: Cache-Control no-store, nosniff dan Referrer-Policy tepat sekali" "no-store|nosniff|no-referrer" \
  "$(hdr /api/v1/health cache-control)|$(hdr /api/v1/health x-content-type-options)|$(hdr /api/v1/health referrer-policy)"
cek "PKT-H06" "tanpa CORS: GET API dari Origin asing tanpa Access-Control-Allow-Origin" "" "$(hdr /api/v1/health access-control-allow-origin -H 'Origin: http://evil.example')"

echo "== F. 403 untuk file sensitif"
i=0
for p in /app /app/ /app/.env /app/.env.txt /app/.env.contoh-lokal /app/.env.contoh-infinityfree /app/install.sql /app/storage/logs/app.log \
  /app/storage/logs/ /app/vendor/autoload.php /app/vendor/composer/installed.json /app/src/Bootstrap/AppFactory.php /app/src/Http/Kernel.php \
  /app/bin/create-admin.php /app/bin/migrate.php /app/database/migrations/001_init.sql /app/.htaccess /.htaccess /.HTACCESS /.env /.git/config \
  /APP/.env /App/install.sql /aPp/vendor/autoload.php /%61pp/.env /%41PP/install.sql /app%2f.env /app/.env/ /app/.env. /app/install.sql. \
  "/app/install.sql%20" /app/install.sql%00 /./app/.env //app/.env /js/../app/.env /api/../app/.env /index.php/../app/.env /app/./.env \
  /admin.sql /Backup.SQL /error.log /php_error.LOG /app./.env /app./vendor/autoload.php /app./src/Bootstrap/AppFactory.php /app./bin/create-admin.php \
  "/App%20/vendor/autoload.php" /APP/vendor/autoload.php; do
  i=$((i + 1)); c="$(kode_u "$p")"
  case "$p" in
    /app%2f.env|/app/install.sql%00) cek_cocok "PKT-F$(printf %02d $i) $p" "$p ditolak (403/404, bukan isi file)" "^(403|404)$" "$c" ;;
    *) cek "PKT-F$(printf %02d $i) $p" "$p → 403" "403" "$c" ;;
  esac
done
cek "PKT-F90" "kontrol: /.well-known/acme-challenge/uji.txt tetap 200 (verifikasi SSL)" "200" "$(kode_u /.well-known/acme-challenge/uji.txt)"
BOCOR="$(for p in /app/.env /APP/.env /app./.env /app/install.sql /admin.sql; do curl -s --path-as-is "$U$p"; done | grep -c -E 'DB_PASSWORD|CREATE TABLE|^-- uji' || true)"
cek "PKT-F91" "isi .env / install.sql / .sql tidak pernah ada di body respons" "0" "$BOCOR"

echo "== L. Listing folder dan index.php"
for p in /js/ /css/ /js/pages/ /js/lib/ /.well-known/; do cek "PKT-L01 $p" "listing $p dimatikan → 403" "403" "$(kode_u "$p")"; done
cek "PKT-L02" "/index.php langsung → 404 JSON (bukan halaman lain)" "404 ENDPOINT_TIDAK_DITEMUKAN" "$(kode_u /index.php) $(curl -s "$U/index.php" | jq_ '$d["error"]["kode"]')"
cek "PKT-L03" "/index.php/api/v1/health (PATH_INFO) tidak melayani API" "404" "$(kode_u /index.php/api/v1/health)"
cek "PKT-L04" "/api dan /api/ → 404 JSON dari API; /apix dan /api.html → 404 Apache" "404 404 404 404 application/json" \
  "$(kode_u /api) $(kode_u /api/) $(kode_u /apix) $(kode_u /api.html) $(hdr /api content-type | cut -d';' -f1)"
cek "PKT-L05" "/api/v1/health lewat rewrite → 200" '{"data":{"status":"ok","database":"ok"}}' "$(curl -s "$U/api/v1/health")"
cek "PKT-L06" "header Authorization (Bearer) sampai ke PHP lewat FastCGI" "401 BELUM_MASUK" \
  "$(kode -H "Authorization: Bearer $(printf 'a%.0s' {1..64})" "$U/api/v1/auth/sesi") $(curl -s -H "Authorization: Bearer $(printf 'a%.0s' {1..64})" "$U/api/v1/auth/sesi" | jq_ '$d["error"]["kode"]')"

echo "== API dasar"
cek "PKT-P01" "login admin dari SQL --sql" "pemilik" "$(api POST /auth/login "{\"nama_pengguna\":\"pemilik\",\"kata_sandi\":\"$PASS\"}" | jq_ '$d["data"]["pengguna"]["nama_pengguna"]')"
cek "PKT-P02" "cookie lokal jastip_sesi (development, http)" "jastip_sesi" "$(awk '$6 ~ /jastip_sesi/ {print $6}' "$J")"
cek "PKT-P03" "origin lain ditolak" "ORIGIN_DITOLAK" "$(curl -s -X POST "$U/api/v1/auth/login" -H 'Origin: http://evil.test' -H 'Content-Type: application/json' -d '{}' | jq_ '$d["error"]["kode"]')"

if [ "$NODE_SUITE" = 1 ]; then
  echo "== Suite Node terhadap paket"
  for s in keamanan hitung rekap konkurensi; do
    echo "-- $s"
    env APP_URL="$U" ADMIN_USER=pemilik ADMIN_PASSWORD="$PASS" QA_TARGET=paket QA_DB_SH="$DB_SH" DB_NAME="$DB" QA_APP_DIR="$H/app" \
      QA_LOG_PATH="$H/app/storage/logs/app.log" QA_HASIL_AKHIRAN="-paket-$VARIAN" node "$QA/api/$s.mjs" | grep -E '^  GAGAL|^[a-z]+-paket' | cut -c1-300
  done
  chmod 777 "$H/app/storage/logs"; [ -f "$H/app/storage/logs/app.log" ] && chmod 666 "$H/app/storage/logs/app.log"
fi
# Bagian B: perintah tambahan terhadap paket yang sedang jalan (mis. uji cache browser di Apache).
# QA_PAKET_UI="node qa/ui/cache-paket.mjs"; hasilnya ditulis perintah itu sendiri.
if [ -n "${QA_PAKET_UI:-}" ]; then
  echo "== Bagian B terhadap paket: $QA_PAKET_UI"
  env APP_URL="$U" ADMIN_USER=pemilik ADMIN_PASSWORD="$PASS" QA_TARGET=paket QA_DB_SH="$DB_SH" DB_NAME="$DB" QA_APP_DIR="$H/app" \
    PLAYWRIGHT_BROWSERS_PATH="$T/pw-browsers" NODE_PATH="$T/pw/node_modules" QA_HASIL_AKHIRAN="-paket-$VARIAN" \
    bash -c "cd /projects/sandbox && $QA_PAKET_UI" || QA_UI_GAGAL=1
fi

echo "== A. create-admin.php --sql --reset"
rm -f "$J"
api POST /auth/login "{\"nama_pengguna\":\"pemilik\",\"kata_sandi\":\"$PASS\"}" >/dev/null
TOKEN="$(curl -s -X POST "$U/api/v1/auth/login" -H "Origin: $U" -H 'Content-Type: application/json' -d "{\"nama_pengguna\":\"pemilik\",\"kata_sandi\":\"$PASS\",\"klien\":\"mobile\"}" | jq_ '$d["data"]["token"]')"
cek "PKT-A10" "sebelum reset: sesi cookie dan token mobile aktif" "200 200" "$(kode -b "$J" "$U/api/v1/auth/sesi") $(kode -H "Authorization: Bearer $TOKEN" "$U/api/v1/auth/sesi")"
PASS2="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
SQL_RESET="$(CA "Pemilik --sql --reset" "$PASS2" 2>/dev/null)"
cek "PKT-A11" "--reset: START TRANSACTION, UPDATE … WHERE nama_pengguna = 'Pemilik', DELETE sesi_login, COMMIT" "1 1 1 1" \
  "$(grep -c '^START TRANSACTION;$' <<<"$SQL_RESET") $(grep -c "^UPDATE admin SET password_hash = '\$2y\$.*' WHERE nama_pengguna = 'Pemilik';$" <<<"$SQL_RESET") $(grep -c "^DELETE FROM sesi_login WHERE admin_id IN (SELECT id FROM admin WHERE nama_pengguna = 'Pemilik');$" <<<"$SQL_RESET") $(grep -c '^COMMIT;$' <<<"$SQL_RESET")"
OUT="$(mysqlc -vvv "$DB" <<<"$SQL_RESET" 2>&1)"
cek "PKT-A12" "impor --reset (nama beda huruf): UPDATE 1 row affected, DELETE ≥ 2 sesi" "1 ya" \
  "$(echo "$OUT" | grep -A5 '^UPDATE' | grep -o 'Rows matched: [0-9]*' | grep -o '[0-9]*') $(echo "$OUT" | grep -A5 '^DELETE' | grep -qE 'Query OK, ([2-9]|[1-9][0-9]+) rows' && echo ya || echo tidak)"
cek "PKT-A13" "setelah reset: sesi lama 401, token mobile 401, sandi lama 401, sandi baru 200" "401 401 401 200" \
  "$(kode -b "$J" "$U/api/v1/auth/sesi") $(kode -H "Authorization: Bearer $TOKEN" "$U/api/v1/auth/sesi") $(kode -X POST "$U/api/v1/auth/login" -H 'Content-Type: application/json' -d "{\"nama_pengguna\":\"pemilik\",\"kata_sandi\":\"$PASS\"}") $(kode -X POST "$U/api/v1/auth/login" -H 'Content-Type: application/json' -d "{\"nama_pengguna\":\"pemilik\",\"kata_sandi\":\"$PASS2\"}")"
OUT="$(CA "salahketik --sql --reset" "$PASS2" 2>/dev/null | mysqlc -vvv "$DB" 2>&1)"
cek "PKT-A14" "--reset untuk nama yang tidak ada: UPDATE 0 rows (sesuai panduan: 0 = salah ketik)" "0" "$(echo "$OUT" | grep -A5 '^UPDATE' | grep -o 'Rows matched: [0-9]*' | grep -o '[0-9]*')"
PASS="$PASS2"

echo "== S. Blok 'Paksa HTTPS' diaktifkan (hapus '# ' di 4 baris, seperti panduan langkah 7)"
cp "$H/.htaccess" "$DIR/htaccess.asli"
sed -E 's/^    # (RewriteCond %\{HTTP:X-Forwarded-Proto\}|RewriteCond %\{HTTPS\} off|RewriteCond %\{HTTP:CF-Visitor\}|RewriteRule \(\.\*\) https:)/    \1/' \
  "$DIR/htaccess.asli" > "$H/.htaccess"
cek "PKT-S01" "4 baris berubah" "4" "$(diff "$DIR/htaccess.asli" "$H/.htaccess" | grep -c '^>')"
cek "PKT-S02" "http halaman → 301 ke https dengan path + query" "301 https://127.0.0.1:$HTTP_PORT/po.html?id=1" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$U/po.html?id=1")"
cek "PKT-S03" "http API → 301 ke https" "301 https://127.0.0.1:$HTTP_PORT/api/v1/health" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$U/api/v1/health")"
cek "PKT-S04" "di belakang proxy HTTPS (X-Forwarded-Proto / CF-Visitor) → 200 tanpa loop" "200 200 200" \
  "$(kode -H 'X-Forwarded-Proto: https' "$U/login.html") $(kode -H 'CF-Visitor: {"scheme":"https"}' "$U/login.html") $(kode -H 'X-Forwarded-Proto: https' "$U/api/v1/health")"
cek "PKT-S05" "dengan HTTPS aktif /app/.env dan /.htaccess tetap 403" "403 403" "$(kode -H 'X-Forwarded-Proto: https' "$U/app/.env") $(kode -H 'X-Forwarded-Proto: https' "$U/.htaccess")"
cp "$DIR/htaccess.asli" "$H/.htaccess"

echo "== C. Konfigurasi production di app/.env"
cp "$H/app/.env" "$DIR/env.dev"
PESAN500='{"error":{"kode":"KESALAHAN_SERVER","pesan":"Terjadi kesalahan di server. Coba lagi beberapa saat lagi."}}'
uji_start() { # id judul alasan-regex
  local body; body="$(curl -s "$U/api/v1/health")"
  cek "$1a" "$2: health 500 dengan pesan generik" "500 $PESAN500" "$(kode "$U/api/v1/health") $body"
  cek_cocok "$1b" "$2: alasan tercatat di app/storage/logs/app.log" "gagal_memulai_aplikasi.*$3" "$(log_akhir)"
  cek "$1c" "$2: respons tidak memuat alasan/rahasia" "0" "$(printf '%s' "$body" | grep -c -E 'SESSION|ORIGIN|https|\.env|DB_' || true)"
}
env_prod false "https://jastip.example";      uji_start PKT-C01 "APP_ENV=production + SESSION_COOKIE_SECURE=false" "SESSION_COOKIE_SECURE wajib true"
env_prod true "http://jastip.example";        uji_start PKT-C02 "APP_ENV=production + origin http" "APP_ALLOWED_ORIGINS di production wajib https"
env_prod true "https://a.example,http://b.example"; uji_start PKT-C03 "production + salah satu origin http" "APP_ALLOWED_ORIGINS di production wajib https"
env_prod true "https://jastip.example" "APP_ENV=produksi"; uji_start PKT-C04 "APP_ENV salah ketik (produksi)" "APP_ENV harus salah satu dari"
mv "$H/app/.env" "$H/app/.env.txt";           uji_start PKT-C05 "app/.env tidak ada (tersimpan sebagai .env.txt)" "file app/.env tidak ditemukan"
rm -f "$H/app/.env.txt"
env_prod true "https://jastip.example"
cek "PKT-C06" "production benar: health 200" '{"data":{"status":"ok","database":"ok"}}' "$(curl -s "$U/api/v1/health")"
SC="$(curl -s -o /dev/null -D - -X POST "$U/api/v1/auth/login" -H 'Origin: https://jastip.example' -H 'Content-Type: application/json' \
  -d "{\"nama_pengguna\":\"pemilik\",\"kata_sandi\":\"$PASS\"}" | tr -d '\r' | sed -n 's/^[Ss]et-[Cc]ookie: //p' | sed -E 's/=[0-9a-f]{64}/=<token>/')"
cek "PKT-C07" "production benar: cookie __Host- dengan Secure; HttpOnly; SameSite=Strict" "__Host-jastip_sesi=<token>; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict; Secure" "$SC"
cek "PKT-C08" "production: Origin http lokal ditolak 403" "403" "$(kode -X POST "$U/api/v1/auth/login" -H "Origin: $U" -H 'Content-Type: application/json' -d '{}')"
env_prod true "https://jastip.example"; sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=salah/' "$H/app/.env"
B503="$(curl -s "$U/api/v1/health")"
cek "PKT-C09" "production, password DB salah: health 503 tanpa detail koneksi" '503 {"error":{"kode":"LAYANAN_TIDAK_TERSEDIA","pesan":"Database tidak dapat dihubungi."}}' "$(kode "$U/api/v1/health") $B503"
printf 'APP_ENV=production\r\nAPP_ALLOWED_ORIGINS=https://jastip.example\r\nDB_HOST=127.0.0.1\r\nDB_PORT=%s\r\nDB_NAME=%s\r\nDB_USER=root\r\nDB_PASSWORD=\r\nSESSION_COOKIE_SECURE=true\r\n' "$DB_PORT" "$DB" > "$H/app/.env"
cek "PKT-C10" ".env dengan akhir baris Windows (CRLF, dari Notepad) tetap terbaca" "200" "$(kode "$U/api/v1/health")"
printf '\xef\xbb\xbf# komentar\nAPP_ENV=production\nAPP_ALLOWED_ORIGINS=https://jastip.example\nDB_HOST=127.0.0.1\nDB_PORT=%s\nDB_NAME=%s\nDB_USER=root\nDB_PASSWORD=\nSESSION_COOKIE_SECURE=true\n' "$DB_PORT" "$DB" > "$H/app/.env"
cek "PKT-C11" ".env UTF-8 dengan BOM (Notepad 'UTF-8 with BOM') tetap terbaca" "200" "$(kode "$U/api/v1/health")"
cp "$DIR/env.dev" "$H/app/.env"
cek "PKT-C12" "app.log tidak memuat password DB / kata sandi admin" "0" "$(grep -c -E "salah\"|$PASS" "$H/app/storage/logs/app.log" || true)"

echo "== E. error.log Apache"
# AH01630/AH01276/AH00127 = penolakan/404 yang memang diuji; AH00489/AH00094/AH00491 = start/stop.
ERR="$(grep -v -E 'AH01630|AH01276|AH00127|AH00489|AH00094|AH00491|AH01797|AH00128' "$A/error.log" | grep -v 'gagal memulai aplikasi' | grep -c . || true)"
cek "PKT-E01" "error.log Apache tanpa error tak terduga" "0" "$ERR"
[ "$ERR" = 0 ] || grep -v -E 'AH01630|AH01276|AH00127|AH00489|AH00094|AH00491|AH01797|AH00128' "$A/error.log" | tail -5 | sed 's/^/    | /'
cp "$A/error.log" "$DIR/apache-error.log" 2>/dev/null

hasil_tulis "paket-$VARIAN" "$U (Apache + PHP-FPM, paket htdocs, MariaDB $VARIAN)"
