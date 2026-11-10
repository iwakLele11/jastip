#!/usr/bin/env python3
"""Ringkas semua qa/hasil/*.json (kecuali ringkasan-*.json) menjadi tabel + qa/hasil/ringkasan-bagian-a.json.

Pakai: python3 qa/tools/ringkasan.py
"""
import datetime
import glob
import json
import os

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hasil")


def main() -> int:
    rows = []
    for f in sorted(glob.glob(os.path.join(DIR, "*.json"))):
        nama = os.path.basename(f)[:-5]
        if nama.startswith("ringkasan"):
            continue
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
        gagal = [h["id"] for h in d["hasil"] if not h["lulus"]]
        rows.append({"suite": nama, "waktu": d.get("waktu"), "target": d.get("target"), "total": d["total"],
                     "lulus": d["total"] - len(gagal), "gagal": len(gagal), "id_gagal": gagal})
    lebar = max((len(r["suite"]) for r in rows), default=10)
    print(f"{'suite'.ljust(lebar)}  lulus/total  gagal")
    for r in rows:
        print(f"{r['suite'].ljust(lebar)}  {str(r['lulus']).rjust(5)}/{str(r['total']).ljust(5)}  {', '.join(r['id_gagal'])[:150] or '-'}")
    tot = sum(r["total"] for r in rows)
    lul = sum(r["lulus"] for r in rows)
    print(f"{'JUMLAH'.ljust(lebar)}  {str(lul).rjust(5)}/{str(tot).ljust(5)}")
    with open(os.path.join(DIR, "ringkasan-bagian-a.json"), "w", encoding="utf-8") as fh:
        json.dump({"waktu": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                   "total": tot, "lulus": lul, "gagal": tot - lul, "suite": rows}, fh, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
