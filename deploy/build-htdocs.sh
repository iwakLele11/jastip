#!/usr/bin/env bash
# Membangun paket "htdocs" aplikasi jastip untuk XAMPP lokal dan InfinityFree:
#   build/jastip-htdocs/      isi yang disalin ke htdocs (web root)
#   build/jastip-htdocs.zip   arsip yang sama, file langsung di akar zip (maks. 10 MB)
#
# Langkah: build front-end → salin frontend/dist → salin back-end yang dibutuhkan ke app/ →
# composer install --no-dev --optimize-autoloader di app/ → salin template deploy/htdocs →
# app/install.sql (+ app/upgrade/NNN_*.sql) dari database/migrations → cek isi dan batas
# ukuran InfinityFree → zip. Berhenti dengan pesan GAGAL kalau ada langkah yang gagal.
#
# Konfigurasi lewat environment (opsional):
#   PHP_BIN    PHP CLI >= 8.2        default: .tools/php/php kalau ada, selain itu "php"
#   COMPOSER   composer.phar atau perintah composer
#                                    default: .tools/composer.phar kalau ada, selain itu "composer"
#   NPM_CACHE  folder cache untuk npm ci (hanya kalau frontend/node_modules belum ada)
#                                    default: .tools/npm-cache kalau ada; kosong = cache npm biasa
#
# Pakai: deploy/build-htdocs.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.tools"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
TEMPLATE="$ROOT/deploy/htdocs"
OUT="$ROOT/build"
STAGE="$OUT/jastip-htdocs"
APP="$STAGE/app"
ZIP="$OUT/jastip-htdocs.zip"
MAX_ZIP_BYTES=$((10 * 1024 * 1024))

pilih() { if [ -e "$1" ]; then echo "$1"; else echo "$2"; fi; }
PHP_BIN="${PHP_BIN:-$(pilih "$TOOLS/php/php" php)}"
COMPOSER_CMD="${COMPOSER:-$(pilih "$TOOLS/composer.phar" composer)}"
if [ -z "${NPM_CACHE+x}" ] && [ -d "$TOOLS/npm-cache" ]; then NPM_CACHE="$TOOLS/npm-cache"; fi
NPM_CACHE="${NPM_CACHE:-}"
# Composer sendiri membaca $COMPOSER sebagai path composer.json, jadi jangan diteruskan ke sana.
unset COMPOSER

STEP="persiapan"
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "GAGAL di langkah \"$STEP\" (exit $rc). Paket tidak lengkap, jangan dipakai." >&2; fi' EXIT
langkah() { STEP="$1"; echo "== $1"; }
gagal() { echo "GAGAL: $*" >&2; exit 1; }

composer_() {
  case "$COMPOSER_CMD" in
    *.phar) "$PHP_BIN" "$COMPOSER_CMD" "$@" ;;
    *) "$COMPOSER_CMD" "$@" ;;
  esac
}

langkah "cek alat"
command -v "$PHP_BIN" >/dev/null 2>&1 || gagal "PHP tidak ditemukan ($PHP_BIN). Set PHP_BIN."
"$PHP_BIN" -r 'exit(PHP_VERSION_ID >= 80200 ? 0 : 1);' || gagal "Butuh PHP >= 8.2 ($PHP_BIN)."
composer_ --version >/dev/null 2>&1 || gagal "Composer tidak bisa dijalankan ($COMPOSER_CMD). Set COMPOSER."
command -v npm >/dev/null 2>&1 || gagal "npm tidak ditemukan (butuh Node >= 22)."
command -v zip >/dev/null 2>&1 || gagal "Perintah zip tidak ditemukan."
echo "PHP: $("$PHP_BIN" -r 'echo PHP_VERSION;') ($PHP_BIN), composer: $COMPOSER_CMD, npm cache: ${NPM_CACHE:-bawaan}"

langkah "build front-end"
if [ ! -d "$FRONTEND/node_modules" ]; then
  (cd "$FRONTEND" && npm ci ${NPM_CACHE:+--cache "$NPM_CACHE"})
fi
(cd "$FRONTEND" && npm run build)
[ -f "$FRONTEND/dist/index.html" ] || gagal "frontend/dist/index.html tidak ada setelah build."
for f in index.php .htaccess app api; do
  [ ! -e "$FRONTEND/dist/$f" ] || gagal "frontend/dist/$f bentrok dengan isi paket."
done

langkah "salin front-end"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp -R "$FRONTEND/dist/." "$STAGE/"

langkah "salin back-end ke app/"
mkdir -p "$APP/bin" "$APP/database" "$APP/storage/logs"
cp -R "$BACKEND/src" "$APP/src"
cp "$BACKEND/bin/migrate.php" "$BACKEND/bin/create-admin.php" "$BACKEND/bin/export-sql.php" "$APP/bin/"
cp -R "$BACKEND/database/migrations" "$APP/database/migrations"
cp "$BACKEND/storage/logs/.gitkeep" "$APP/storage/logs/.gitkeep"
cp "$BACKEND/composer.json" "$BACKEND/composer.lock" "$APP/"

langkah "composer install --no-dev --optimize-autoloader"
(cd "$APP" && composer_ install --no-dev --optimize-autoloader --no-interaction --no-progress --no-scripts)
rm -f "$APP/composer.json" "$APP/composer.lock"
[ -f "$APP/vendor/autoload.php" ] || gagal "app/vendor/autoload.php tidak terbentuk."

langkah "salin template deploy/htdocs"
cp -R "$TEMPLATE/." "$STAGE/"
[ ! -e "$APP/.env" ] || gagal "deploy/htdocs/app/.env ikut tersalin. Hapus dari template (rahasia tidak boleh masuk paket)."

langkah "install.sql dan upgrade SQL dari database/migrations"
"$PHP_BIN" "$APP/bin/export-sql.php" install > "$APP/install.sql"
versi_pertama=1
for v in $("$PHP_BIN" "$APP/bin/export-sql.php" versions); do
  if [ $versi_pertama -eq 1 ]; then versi_pertama=0; continue; fi
  mkdir -p "$APP/upgrade"
  "$PHP_BIN" "$APP/bin/export-sql.php" upgrade "$v" > "$APP/upgrade/$v.sql"
done

langkah "cek isi paket"
for p in tests phpunit.xml.dist phpcs.xml.dist .phpunit.cache vendor/bin vendor/phpunit vendor/squizlabs \
  bin/test.sh composer.json composer.lock .env; do
  [ ! -e "$APP/$p" ] || gagal "app/$p tidak boleh ada di paket."
done
[ ! -e "$STAGE/node_modules" ] || gagal "node_modules tidak boleh ada di paket."
while IFS= read -r -d '' f; do
  "$PHP_BIN" -l "$f" >/dev/null || gagal "Sintaks PHP salah: ${f#"$STAGE"/}"
done < <(find "$STAGE" -type f -name '*.php' -print0)
# .htaccess menyuruh browser menyimpan CSS/JS 1 tahun (immutable), jadi setiap URL CSS/JS harus
# membawa ?v=<hash build>. Kalau tidak, pengguna bisa tertahan di versi lama setelah update.
tanpa_versi="$(grep -EHo '(src|href)="[^"?#]+\.(js|css)"' "$STAGE"/*.html || true)"
tanpa_versi+="$(grep -rEHo "(from|import)[[:space:]]*\(?[[:space:]]*['\"]\.{1,2}/[^'\"?]+\.js['\"]" "$STAGE/js" || true)"
[ -z "$tanpa_versi" ] || gagal "URL CSS/JS tanpa ?v=:"$'\n'"$tanpa_versi"

langkah "cek batas ukuran InfinityFree"
# Batas per file: HTML/PHP/JS 1 MB, .htaccess 10 kB, lainnya 10 MB (file yang lebih besar dihapus otomatis).
terlalu_besar="$(
  find "$STAGE" -type f \( -name '*.html' -o -name '*.php' -o -name '*.js' \) -size +1024k
  find "$STAGE" -type f -name '.htaccess' -size +10k
  find "$STAGE" -type f -size +10240k
)"
[ -z "$terlalu_besar" ] || gagal "File melebihi batas ukuran InfinityFree:"$'\n'"$terlalu_besar"

langkah "zip"
(cd "$STAGE" && zip -r -q -X "$ZIP" .)
zip_bytes=$(wc -c < "$ZIP" | tr -d ' ')
[ "$zip_bytes" -lt "$MAX_ZIP_BYTES" ] || gagal "Zip $zip_bytes byte, harus < 10 MB."

STEP="selesai"
jumlah=$(find "$STAGE" -type f | wc -l | tr -d ' ')
echo "== selesai"
echo "Folder : ${STAGE#"$ROOT"/}/ ($jumlah file, $(du -sh "$STAGE" | cut -f1))"
echo "Zip    : ${ZIP#"$ROOT"/} ($zip_bytes byte)"
echo "Migrasi: $("$PHP_BIN" "$APP/bin/export-sql.php" versions | tr '\n' ' ')"
