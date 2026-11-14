# Ringkasan angka (dibuat otomatis oleh tools/hitung_ulang.mjs)

Dibuat: 2026-11-14T19:55:44.656Z (UTC). Pemeriksaan silang: **25/25 cocok**.

## Forward test

| Metrik | Nilai |
|---|---|
| Jendela | 2026-11-14 17:00:00 WIB → 2026-11-15 01:00:00 WIB (9 candle) |
| Ekuitas akhir | Rp100.000.000 |
| Return total | 0,00% |
| MDD | 0,00% |
| Trade / order | 0 / 0 |
| PF / win rate | – / – |
| Porsi biaya | – |
| B&H BTC/IDR (return / MDD) | -2,75% / -2,83% |
| Uptime | 66,7% (6/9) |
| Telat panggilan median / maks | 10 mnt / 55 mnt |
| Panggilan: eksekusi / duplikat / konflik / gagal | 6 / 1 / 1 / 0 |
| Error API (percobaan gagal) | 0 |
| Kill switch: perubahan / putaran aktif | 4 / 0 |
| Fill terverifikasi ulang dari order book di log | 0/0 |

## Gap backtest vs forward (jendela sama)

| | Forward | Backtest |
|---|---|---|
| Return | 0,00% | 0,00% |
| MDD | 0,00% | 0,00% |
| Order | 0 | 0 |

Sinyal cocok candle per candle: **36/36** (entry, exit, saklar × pasangan × candle). Candle unduhan ulang vs data backtest: 0 beda dari 11622 bar.

## Backtest 3 tahun

Return 328,6%, CAGR 62,4%, MDD -30,4%, 258 trade, PF 1.64, win rate 33,3%, porsi biaya 35,7%. B&H BTC: 115,2% (MDD -49,6%). OOS 1 tahun konfigurasi terpilih: -15,4%.

## Spread & slippage: backtest vs seluruh snapshot

| Pasangan | Spread backtest (n) | Spread median semua (n) | Spread maks | Slip jual bt / semua |
|---|---|---|---|---|
| BTCIDR | 0,0001% (3) | 0,0079% (55) | 0,195% | 0,0000% / 0,0000% |
| ETHIDR | 0,0372% (3) | 0,0805% (55) | 0,209% | 0,0425% / 0,0056% |
| XRPIDR | 0,0055% (3) | 0,0710% (55) | 0,177% | 0,0428% / 0,0162% |
| DOGEIDR | 0,1738% (3) | 0,1732% (55) | 0,263% | 0,0000% / 0,0000% |
| SOLIDR | 0,0262% (3) | 0,0721% (55) | 0,280% | 0,0125% / 0,0156% |
| ADAIDR | 0,1669% (3) | 0,2364% (55) | 0,653% | 0,0451% / 0,0344% |
