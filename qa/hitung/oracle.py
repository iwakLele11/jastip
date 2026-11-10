#!/usr/bin/env python3
"""Oracle perhitungan independen memakai decimal.Decimal (bukan bilangan bulat berskala
seperti app). Dipakai QA untuk memverifikasi harga jual, kurs jastip, DP, dan status
terhadap server dan pratinjau front-end.

Rumus (scope-mvp.md, ui-spec §12, kontrak API §6 dan §12):
  harga_jual_unit = ceil_Rp1000( round_half_up_2dp( harga_aud * kurs_jastip * (1 + markup%) ) )
  subtotal        = harga_jual_unit * qty
  kurs_jastip     = ceil_Rp1( kurs_pasar * (1 + buffer%) )
  dp              = ceil_Rp1000( total * dp% )
  dana_diterima   = sum(pembayaran) - sum(pengembalian)
  status          : tabel ui-spec §12.2 / kontrak §12.2 (dievaluasi berurutan)

Pakai: python3 oracle.py <file-json-kasus>  ->  stdout JSON hasil
Kasus: {"harga":  [{"id","harga_aud","kurs","markup","qty"}],
        "kurs":   [{"id","kurs_pasar","buffer"}],
        "dp":     [{"id","total","dp_bp"}],
        "status": [{"id","total","dp_bp","bayar","kembali"}]}
"""
import json
import sys
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 80


def dec(teks: str) -> Decimal:
    return Decimal(str(teks).strip().replace(",", "."))


def ceil_ribuan(nilai: Decimal) -> int:
    # Bulat ke atas ke kelipatan 1000; kelipatan tepat tidak naik.
    ribuan = (nilai / 1000).to_integral_value(rounding=ROUND_CEILING)
    return int(ribuan) * 1000


def harga_jual_unit(harga_aud: str, kurs: int, markup_persen: str) -> int:
    mentah = dec(harga_aud) * Decimal(kurs) * (Decimal(1) + dec(markup_persen) / Decimal(100))
    dua_desimal = mentah.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return ceil_ribuan(dua_desimal)


def kurs_jastip(kurs_pasar: str, buffer_persen: str) -> int:
    mentah = dec(kurs_pasar) * (Decimal(1) + dec(buffer_persen) / Decimal(100))
    return int(mentah.to_integral_value(rounding=ROUND_CEILING))


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
    with open(sys.argv[1], encoding="utf-8") as f:
        kasus = json.load(f)
    out = {"harga": [], "kurs": [], "dp": [], "status": []}
    for c in kasus.get("harga", []):
        unit = harga_jual_unit(c["harga_aud"], c["kurs"], c["markup"])
        mentah = dec(c["harga_aud"]) * Decimal(c["kurs"])
        dengan_markup = (mentah * (1 + dec(c["markup"]) / 100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        out["harga"].append({
            "id": c["id"], "harga_jual_unit": unit, "subtotal": unit * c["qty"],
            # Kolom "harga × kurs" dan "× (1+markup), 2 desimal" di tabel scope, dalam sen.
            "sen_sebelum_markup": int(mentah * 100), "sen": int(dengan_markup * 100),
        })
    for c in kasus.get("kurs", []):
        out["kurs"].append({"id": c["id"], "kurs_jastip": kurs_jastip(c["kurs_pasar"], c["buffer"])})
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
