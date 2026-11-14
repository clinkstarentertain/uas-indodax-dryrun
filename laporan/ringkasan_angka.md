# Ringkasan angka (dibuat otomatis oleh tools/hitung_ulang.mjs)

Dibuat: 2026-11-14T20:33:22.389Z (UTC). Pemeriksaan silang: **25/25 cocok**.

## Forward test

| Metrik | Nilai |
|---|---|
| Jendela | 2026-11-14 17:00:00 WIB → 2026-11-15 02:00:00 WIB (10 candle) |
| Ekuitas akhir | Rp100.000.000 |
| Return total | 0,00% |
| MDD | 0,00% |
| Trade / order | 0 / 0 |
| PF / win rate | – / – |
| Porsi biaya | – |
| B&H BTC/IDR (return / MDD) | -2,76% / -2,83% |
| Uptime | 70,0% (7/10) |
| Telat panggilan median / maks | 7 mnt / 55 mnt |
| Panggilan: eksekusi / duplikat / konflik / gagal | 7 / 3 / 1 / 0 |
| Error API (percobaan gagal) | 0 |
| Kill switch: perubahan / putaran aktif | 4 / 0 |
| Fill terverifikasi ulang dari order book di log | 0/0 |

## Gap backtest vs forward (jendela sama)

| | Forward | Backtest |
|---|---|---|
| Return | 0,00% | 0,00% |
| MDD | 0,00% | 0,00% |
| Order | 0 | 0 |

Sinyal cocok candle per candle: **42/42** (entry, exit, saklar × pasangan × candle). Candle unduhan ulang vs data backtest: 0 beda dari 11616 bar.

## Backtest 3 tahun

Return 328,6%, CAGR 62,4%, MDD -30,4%, 258 trade, PF 1.64, win rate 33,3%, porsi biaya 35,7%. B&H BTC: 115,2% (MDD -49,6%). OOS 1 tahun konfigurasi terpilih: -15,4%.

## Spread & slippage: backtest vs seluruh snapshot

| Pasangan | Spread backtest (n) | Spread median semua (n) | Spread maks | Slip jual bt / semua |
|---|---|---|---|---|
| BTCIDR | 0,0001% (3) | 0,0077% (64) | 0,214% | 0,0000% / 0,0000% |
| ETHIDR | 0,0372% (3) | 0,0820% (64) | 0,209% | 0,0425% / 0,0000% |
| XRPIDR | 0,0055% (3) | 0,0714% (64) | 1,141% | 0,0428% / 0,0158% |
| DOGEIDR | 0,1738% (3) | 0,1732% (64) | 0,277% | 0,0000% / 0,0000% |
| SOLIDR | 0,0262% (3) | 0,0988% (64) | 0,287% | 0,0125% / 0,0102% |
| ADAIDR | 0,1669% (3) | 0,2366% (64) | 5,541% | 0,0451% / 0,0468% |
