#!/usr/bin/env python3
"""Oracle perhitungan independen memakai decimal.Decimal (bukan bilangan bulat berskala
seperti app). Dipakai QA untuk memverifikasi harga jual, DP, dan status terhadap server
dan pratinjau front-end.

Rumus (scope-mvp.md / ui-spec §12):
  harga_jual_unit = ceil_Rp1000( round_half_up_2dp( harga_aud * kurs_jastip * (1 + markup%) ) )
  subtotal        = harga_jual_unit * qty
  dp              = ceil_Rp1000( total * dp% )
  dana_diterima   = sum(pembayaran) - sum(pengembalian)
  status          : lihat tabel ui-spec §12.2

Pakai: python3 oracle.py <file-json-kasus>  ->  stdout JSON hasil
Kasus: {"harga": [{"id","harga_aud","kurs","markup","qty"}], "dp": [{"id","total","dp_bp"}],
        "status": [{"id","total","dp_bp","bayar","kembali"}]}
"""
import json
import sys
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 80


def ceil_ribuan(nilai: Decimal) -> int:
    # Bulat ke atas ke kelipatan 1000; kelipatan tepat tidak naik.
    ribuan = (nilai / 1000).to_integral_value(rounding="ROUND_CEILING")
    return int(ribuan) * 1000


def harga_jual_unit(harga_aud: str, kurs: int, markup_persen: str) -> int:
    harga = Decimal(harga_aud.replace(",", "."))
    markup = Decimal(markup_persen.replace(",", "."))
    mentah = harga * Decimal(kurs) * (Decimal(1) + markup / Decimal(100))
    dua_desimal = mentah.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return ceil_ribuan(dua_desimal)


def dp(total: int, dp_bp: int) -> int:
    return ceil_ribuan(Decimal(total) * Decimal(dp_bp) / Decimal(10000))


def status(total: int, dp_nilai: int, dana: int) -> str:
    if dana > total:
        return "lebih_bayar"
    if dana == total:
        return "lunas"
    if dana == 0:
        return "belum_bayar"
    if dana < dp_nilai:
        return "kurang_dp"
    return "dp"


def main() -> int:
    kasus = json.load(open(sys.argv[1]))
    out = {"harga": [], "dp": [], "status": []}
    for c in kasus.get("harga", []):
        unit = harga_jual_unit(c["harga_aud"], c["kurs"], c["markup"])
        out["harga"].append({"id": c["id"], "harga_jual_unit": unit, "subtotal": unit * c["qty"]})
    for c in kasus.get("dp", []):
        out["dp"].append({"id": c["id"], "dp": dp(c["total"], c["dp_bp"])})
    for c in kasus.get("status", []):
        d = dp(c["total"], c["dp_bp"])
        dana = c["bayar"] - c["kembali"]
        out["status"].append({
            "id": c["id"], "dp": d, "dana_diterima": dana,
            "sisa": max(0, c["total"] - dana), "kelebihan_bayar": max(0, dana - c["total"]),
            "status": status(c["total"], d, dana),
        })
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
