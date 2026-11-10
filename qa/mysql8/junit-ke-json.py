#!/usr/bin/env python3
"""Ubah log JUnit PHPUnit (bin/test.sh --log-junit …) menjadi qa/hasil/<nama>.json (format qa/lib/uji.mjs).

Pakai: python3 qa/mysql8/junit-ke-json.py <junit.xml> <hasil.json> "<target>"
Satu entri per test case (id = Kelas::metode, data provider ikut di nama).
"""
import datetime
import json
import sys
import xml.etree.ElementTree as ET


def main() -> int:
    src, dst, target = sys.argv[1], sys.argv[2], sys.argv[3]
    root = ET.parse(src).getroot()
    hasil = []
    for tc in root.iter("testcase"):
        kelas = (tc.get("class") or tc.get("classname") or "").replace("Jastip\\Tests\\", "")
        nama = f"{kelas}::{tc.get('name')}"
        gagal = tc.find("failure") if tc.find("failure") is not None else tc.find("error")
        lewat = tc.find("skipped") is not None
        catatan = None
        if gagal is not None:
            catatan = (gagal.text or gagal.get("message") or "").strip().splitlines()
            catatan = " | ".join(line for line in catatan[:6] if line.strip())[:600]
        elif lewat:
            catatan = "dilewati"
        hasil.append({"id": nama, "judul": nama, "lulus": gagal is None, "catatan": catatan,
                      "ms": round(float(tc.get("time", "0")) * 1000)})
    gagal = [h for h in hasil if not h["lulus"]]
    out = {
        "waktu": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "target": target, "total": len(hasil), "lulus": len(hasil) - len(gagal), "gagal": len(gagal),
        "per_kelas": {},
        "hasil": hasil,
    }
    for h in hasil:
        k = h["id"].split("::")[0]
        s = out["per_kelas"].setdefault(k, {"total": 0, "gagal": 0})
        s["total"] += 1
        s["gagal"] += 0 if h["lulus"] else 1
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"{dst}: {out['lulus']}/{out['total']} lulus. Gagal: {', '.join(h['id'] for h in gagal) or '-'}")
    return 1 if gagal else 0


if __name__ == "__main__":
    sys.exit(main())
