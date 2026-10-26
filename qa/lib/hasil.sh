# Pencatat hasil untuk skrip QA shell. Format JSON sama dengan qa/lib/uji.mjs.
# Pakai: QA_TSV=<file> lalu `source qa/lib/hasil.sh`; cek/cek_cocok/catat; akhiri dengan
# hasil_tulis <nama> "<target>"  → qa/hasil/<nama>.json (exit status 1 jika ada yang gagal).
: "${QA_TSV:?QA_TSV wajib diisi}"
QA_DIR_HASIL="${QA_DIR_HASIL:-/projects/sandbox/qa/hasil}"
mkdir -p "$QA_DIR_HASIL"
: > "$QA_TSV"

hasil_bersih() { printf '%s' "$1" | tr '\t\n\r' '   ' | cut -c1-600; }
catat() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$(hasil_bersih "$3")" "$(hasil_bersih "$4")" >> "$QA_TSV"; }
cek() { # id judul harap aktual
  if [ "$3" = "$4" ]; then catat "$1" 1 "$2" "$4"; echo "  LULUS  $1  $2: $(hasil_bersih "$4" | cut -c1-160)"
  else catat "$1" 0 "$2" "harap [$3], dapat [$4]"; echo "  GAGAL  $1  $2: harap [$3], dapat [$(hasil_bersih "$4" | cut -c1-300)]"; fi
}
cek_cocok() { # id judul regex-ERE aktual
  if printf '%s' "$4" | grep -Eq -- "$3"; then catat "$1" 1 "$2" "$4"; echo "  LULUS  $1  $2: $(hasil_bersih "$4" | cut -c1-160)"
  else catat "$1" 0 "$2" "harap cocok /$3/, dapat [$4]"; echo "  GAGAL  $1  $2: harap /$3/, dapat [$(hasil_bersih "$4" | cut -c1-300)]"; fi
}
hasil_tulis() { # nama target
  python3 - "$QA_TSV" "$QA_DIR_HASIL/$1.json" "$2" "$1" <<'EOF'
import json, sys, datetime
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
hasil = [{"id": r[0], "judul": r[2], "lulus": r[1] == '1', "catatan": r[3] or None} for r in rows]
gagal = [h for h in hasil if not h["lulus"]]
json.dump({"waktu": datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'), "target": sys.argv[3],
           "total": len(hasil), "lulus": len(hasil) - len(gagal), "gagal": len(gagal), "hasil": hasil},
          open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f"\n{sys.argv[4]}: {len(hasil) - len(gagal)}/{len(hasil)} lulus. Gagal: {', '.join(h['id'] for h in gagal) or '-'}")
sys.exit(1 if gagal else 0)
EOF
}
