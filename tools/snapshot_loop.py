"""Kumpulkan snapshot order book (api/depth) mentah untuk estimasi spread & slippage backtest.
Pemakaian: python tools/snapshot_loop.py <jumlah_putaran> <jeda_detik> btcidr ethidr ...
Simpan apa adanya ke data/raw/snapshots/<pair>/<unix>.json (+ waktu lokal pengambilan di nama file)."""
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "uas-algotrading-dryrun/1.0"}


def main():
    n, gap, pairs = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:]
    for k in range(n):
        t0 = time.time()
        for p in pairs:
            d = os.path.join(ROOT, "data/raw/snapshots", p); os.makedirs(d, exist_ok=True)
            try:
                with urllib.request.urlopen(urllib.request.Request(f"https://indodax.com/api/depth/{p}", headers=UA), timeout=20) as r:
                    body = r.read()
                open(os.path.join(d, f"{int(time.time())}.json"), "wb").write(body)
            except Exception as e:  # noqa: BLE001
                print("galat", p, e, flush=True)
            time.sleep(0.5)
        print("putaran", k + 1, time.strftime("%H:%M:%S"), flush=True)
        time.sleep(max(0, gap - (time.time() - t0)))


if __name__ == "__main__":
    main()
