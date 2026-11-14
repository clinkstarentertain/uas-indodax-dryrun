# Ringkasan angka (dibuat otomatis oleh tools/hitung_ulang.mjs)

Dibuat: 2026-11-14T12:13:46.271Z (UTC). Pemeriksaan silang: **25/25 cocok**.

## Forward test

| Metrik | Nilai |
|---|---|
| Jendela | 2026-11-14 17:00:00 WIB → 2026-11-14 18:00:00 WIB (2 candle) |
| Ekuitas akhir | Rp100.000.000 |
| Return total | 0,00% |
| MDD | 0,00% |
| Trade / order | 0 / 0 |
| PF / win rate | – / – |
| Porsi biaya | – |
| B&H BTC/IDR (return / MDD) | -0,34% / -0,34% |
| Uptime | 100,0% (2/2) |
| Telat panggilan median / maks | 10 mnt / 10 mnt |
| Panggilan: eksekusi / duplikat / konflik / gagal | 2 / 1 / 1 / 0 |
| Error API (percobaan gagal) | 0 |
| Kill switch: perubahan / putaran aktif | 4 / 0 |
| Fill terverifikasi ulang dari order book di log | 0/0 |

## Gap backtest vs forward (jendela sama)

| | Forward | Backtest |
|---|---|---|
| Return | 0,00% | 0,00% |
| MDD | 0,00% | 0,00% |
| Order | 0 | 0 |

Sinyal cocok candle per candle: **12/12** (entry, exit, saklar × pasangan × candle). Candle unduhan ulang vs data backtest: 0 beda dari 11664 bar.

## Backtest 3 tahun

Return 328,6%, CAGR 62,4%, MDD -30,4%, 258 trade, PF 1.64, win rate 33,3%, porsi biaya 35,7%. B&H BTC: 115,2% (MDD -49,6%). OOS 1 tahun konfigurasi terpilih: -15,4%.

## Spread & slippage: backtest vs seluruh snapshot

| Pasangan | Spread backtest (n) | Spread median semua (n) | Spread maks | Slip jual bt / semua |
|---|---|---|---|---|
| BTCIDR | 0,0001% (3) | 0,0001% (20) | 0,089% | 0,0000% / 0,0000% |
| ETHIDR | 0,0372% (3) | 0,0715% (20) | 0,209% | 0,0425% / 0,0102% |
| XRPIDR | 0,0055% (3) | 0,0469% (20) | 0,127% | 0,0428% / 0,0085% |
| DOGEIDR | 0,1738% (3) | 0,1732% (20) | 0,260% | 0,0000% / 0,0000% |
| SOLIDR | 0,0262% (3) | 0,0988% (20) | 0,175% | 0,0125% / 0,0075% |
| ADAIDR | 0,1669% (3) | 0,3496% (20) | 0,533% | 0,0451% / 0,0121% |
