"""Pindai likuiditas SEMUA pasangan IDR Indodax pada awal periode backtest (anti survivorship bias).
Ukuran: rata-rata nilai transaksi harian (Volume x Close, IDR) 30 hari sebelum tanggal awal backtest, dari candle 1D history_v2.
Jeda >= 0,4 detik antar-request, berurutan (batas Indodax 180/menit; soal: maks 3/detik).
Keluaran: data/raw/scan/scan_<awal>.json (respons mentah ringkas) + data/universe_scan.csv
Pemakaian: python tools/scan_universe.py 2023-11-14
"""
import csv
import datetime as dt
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "uas-algotrading-dryrun/1.0"}


def get(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                return {"_error": str(e)}
            time.sleep(2 + 2 * k)


def main():
    start = dt.datetime.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else "2023-11-14").replace(tzinfo=dt.timezone.utc)
    t1 = int(start.timestamp()); t0 = t1 - 30 * 86400
    meta = sorted(f for f in os.listdir(os.path.join(ROOT, "data/raw/meta")) if f.startswith("pairs_"))[-1]
    pairs = [p for p in json.load(open(os.path.join(ROOT, "data/raw/meta", meta), encoding="utf-8")) if p["base_currency"] == "idr"]
    out, rows = {}, []
    for i, p in enumerate(pairs):
        sym = p["symbol"]
        d = get(f"https://indodax.com/tradingview/history_v2?symbol={sym}&tf=1D&from={t0}&to={t1}")
        bars = [b for b in d if isinstance(d, list) and t0 <= b["Time"] < t1] if isinstance(d, list) else []
        vals = [float(b["Volume"]) * float(b["Close"]) for b in bars]
        out[sym] = {"n_bar": len(bars), "error": d.get("_error") if isinstance(d, dict) else None}
        rows.append(dict(symbol=sym, ticker_id=p["ticker_id"], bar_30h=len(bars), adv_idr_30h=round(sum(vals) / 30) if vals else 0,
                         hari_volume_nol=sum(1 for v in vals if v <= 0), first_time=min((b["Time"] for b in bars), default="")))
        if i % 50 == 0:
            print(i, sym, len(bars), flush=True)
        time.sleep(0.4)
    os.makedirs(os.path.join(ROOT, "data/raw/scan"), exist_ok=True)
    json.dump(dict(awal_backtest=start.isoformat(), jendela="30 hari sebelum awal", meta=meta, hasil=out),
              open(os.path.join(ROOT, f"data/raw/scan/scan_{start.date()}.json"), "w"), indent=0)
    rows.sort(key=lambda r: -r["adv_idr_30h"])
    with open(os.path.join(ROOT, "data/universe_scan.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    for r in rows[:20]:
        print(r)


if __name__ == "__main__":
    main()
