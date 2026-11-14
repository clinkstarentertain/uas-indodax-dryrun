"""Tarik candle historis ASLI Indodax (history_v2) mundur dari 'to' sampai tanggal awal. Satu request ~650 bar terakhir sebelum 'to'.
Berurutan, jeda 0,4 detik (<= 3 request/detik). Respons mentah disimpan apa adanya (data/raw/candles/<SYM>_<tf>/<to>.json),
lalu digabung ke data/candles/<SYM>_<tf>.csv (Time,Open,High,Low,Close,Volume), hanya bar yang SUDAH tertutup saat unduh.
Pemakaian: python tools/download_candles.py 60 2023-08-01 BTCIDR ETHIDR ...
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
TF_SEC = {"1": 60, "15": 900, "30": 1800, "60": 3600, "240": 14400, "1D": 86400}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print("  ulang:", e, flush=True)
            time.sleep(3 + 3 * k)
    raise RuntimeError(url)


def server_time():
    return json.loads(get("https://indodax.com/api/server_time"))["server_time"] // 1000


def pull(sym, tf, start_ts):
    raw_dir = os.path.join(ROOT, "data/raw/candles", f"{sym}_{tf}")
    os.makedirs(raw_dir, exist_ok=True)
    now = server_time()
    to = now
    bars = {}
    while True:
        body = get(f"https://indodax.com/tradingview/history_v2?symbol={sym}&tf={tf}&from={start_ts}&to={to}")
        open(os.path.join(raw_dir, f"{to}.json"), "wb").write(body)
        d = json.loads(body)
        time.sleep(0.4)
        if not isinstance(d, list) or not d:
            break
        new = 0
        for b in d:
            t = int(b["Time"])
            if t not in bars:
                new += 1
            bars[t] = b
        earliest = min(int(b["Time"]) for b in d)
        print(f"  {sym} to={dt.datetime.utcfromtimestamp(to):%Y-%m-%d} bar={len(d)} baru={new} total={len(bars)}", flush=True)
        if earliest <= start_ts or new == 0:
            break
        to = earliest
    dur = TF_SEC[tf]
    rows = [bars[t] for t in sorted(bars) if t >= start_ts and t + dur <= now]   # hanya candle tertutup
    os.makedirs(os.path.join(ROOT, "data/candles"), exist_ok=True)
    with open(os.path.join(ROOT, "data/candles", f"{sym}_{tf}.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["Time", "Open", "High", "Low", "Close", "Volume"])
        for b in rows:
            w.writerow([int(b["Time"]), b["Open"], b["High"], b["Low"], b["Close"], b["Volume"]])
    return len(rows), now


def main():
    tf = sys.argv[1]; start = dt.datetime.fromisoformat(sys.argv[2]).replace(tzinfo=dt.timezone.utc)
    log = {}
    for sym in sys.argv[3:]:
        n, now = pull(sym, tf, int(start.timestamp()))
        log[sym] = dict(bar=n, diunduh_utc=dt.datetime.utcfromtimestamp(now).isoformat(), server_time=now)
        print(sym, n, flush=True)
    p = os.path.join(ROOT, "data/candles/download_log.json")
    old = json.load(open(p)) if os.path.exists(p) else {}
    old.update({f"{k}_{tf}": v for k, v in log.items()})
    json.dump(old, open(p, "w"), indent=1)


if __name__ == "__main__":
    main()
