#!/usr/bin/env bash
# Siapkan Playwright Firefox 1555 (dibangun untuk Ubuntu) di Amazon Linux 2023 tanpa root.
#
# Masalah: libxul butuh GTK3, libXcursor, cairo-gobject, gdk-pixbuf (tidak ada di sistem) dan
# NSS >= 3.126 (sistem punya NSS lebih lama di /lib64; NSS bawaan Firefox tidak terpakai karena
# folder Firefox tidak ada di jalur pencarian library).
# Solusi (hanya di bawah /projects/sandbox/.tools):
#   1. Pakai ulang paket Ubuntu 24.04 yang sudah diekstrak qa/tools/setup-webkit.py ke
#      .tools/webkit-root (GTK3 + X11 + glibc Ubuntu). Jalankan setup-webkit.py dulu kalau belum.
#   2. Salin firefox ke .tools/firefox-run, ubah interpreter ELF `firefox` dan `firefox-bin` ke
#      ld-linux milik glibc Ubuntu (patchelf), karena library GTK Ubuntu butuh glibc 2.38+.
#   3. Wrapper .tools/firefox-run/run.sh: LD_LIBRARY_PATH = folder Firefox (NSS bawaan) dulu,
#      lalu library Ubuntu. HOME harus bisa ditulis (sandbox: /root read-only) → lihat run.sh.
#
# Pakai: qa/tools/setup-firefox.sh   lalu   QA_FIREFOX_EXEC=.tools/firefox-run/run.sh
set -euo pipefail
T=/projects/sandbox/.tools
SRC="$T/pw-browsers/firefox-1555/firefox"
R="$T/webkit-root"
OUT="$T/firefox-run"
LD="$R/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
[ -d "$SRC" ] || { echo "Firefox Playwright tidak ada di $SRC"; exit 1; }
[ -x "$LD" ] || { echo "webkit-root belum ada: PYTHONPATH=$T/py python3 qa/tools/setup-webkit.py"; exit 1; }
for lib in libgtk-3.so.0 libgdk-3.so.0 libcairo-gobject.so.2 libgdk_pixbuf-2.0.so.0 libXcursor.so.1; do
  [ -e "$R/usr/lib/x86_64-linux-gnu/$lib" ] || { echo "library $lib tidak ada di $R"; exit 1; }
done
mkdir -p "$OUT" "$T/home"
if [ ! -x "$OUT/firefox/firefox-bin" ]; then
  cp -a "$SRC" "$OUT/"
  for b in firefox firefox-bin; do "$T/py/bin/patchelf" --set-interpreter "$LD" "$OUT/firefox/$b"; done
fi
cat > "$OUT/run.sh" <<EOF
#!/bin/sh
# Wrapper Firefox untuk Playwright (executablePath). Lihat qa/tools/setup-firefox.sh.
R=$R
D=$OUT/firefox
export LD_LIBRARY_PATH="\$D:\$R/usr/lib/x86_64-linux-gnu:\$R/lib/x86_64-linux-gnu"
export FONTCONFIG_FILE="\$R/etc/fonts/fonts.conf"
export XDG_DATA_DIRS="\$R/usr/share:/usr/share"
export GSETTINGS_BACKEND=memory
export HOME=$T/home
exec "\$D/firefox" "\$@"
EOF
chmod +x "$OUT/run.sh"
echo "wrapper: $OUT/run.sh"
