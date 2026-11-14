# UAS Algoritma Trading: Bot Dry Run Indodax

Bot ini menjalankan **dry run** (tanpa order sungguhan dan tanpa API key) di Vercel, memakai **API publik Indodax** saja. Strateginya **long-only**, yaitu momentum breakout 1 jam pada 6 pasangan IDR.
Backtest dan bot memakai **fungsi sinyal yang sama**, yaitu [lib/strategy.js](lib/strategy.js) dan [lib/core.js](lib/core.js).

- Strategi, perubahan dari UTS, universe, sumber biaya, dan hasil backtest: **[docs/STRATEGI.md](docs/STRATEGI.md)**
- Operasional, scheduler, dan kill switch: [docs/OPERASIONAL.md](docs/OPERASIONAL.md)
- Refleksi dan hasil forward test: [docs/REFLEKSI.md](docs/REFLEKSI.md)

## Freeze

Freeze strategi adalah commit bertag **`freeze-uas`** (`git show freeze-uas`). Commit itu berisi:

- strategi dan parameter;
- data candle;
- biaya;
- backtest final;
- kode bot.

Commit sesudah freeze **tidak mengubah** `lib/strategy.js`, `lib/core.js`, `lib/execution.js`, parameter, ataupun data backtest. Perubahan apa pun pada file-file itu terlihat dengan `git diff freeze-uas -- lib/`. Riwayat git tidak ditulis ulang.

## Struktur

| Path | Isi |
|---|---|
| `lib/strategy.js` | Fungsi sinyal tunggal dan validasi candle |
| `lib/core.js` | Rencana order: posisi maksimum, ukuran, daily loss limit (hari WIB), kill switch |
| `lib/execution.js` | Fill di order book (beli = ask, jual = bid), fee, dan order minimum |
| `lib/bot.js` | Satu putaran bot: idempoten per candle, commit state dengan `ifMatch`, log mentah |
| `lib/indodax.js` | Klien API publik: ≤ 3 request/detik, berurutan, timeout, maksimal 3 retry |
| `lib/metrics.js` | Definisi metrik forward. Dipakai oleh `/api/data` dan `hitung_ulang` |
| `api/tick.js` | `GET/POST /api/tick`, dilindungi `Authorization: Bearer CRON_SECRET` |
| `api/control.js` | Kill switch tanpa redeploy (dilindungi secret) |
| `api/data.js` | Data dashboard publik, dihitung dari state saat diminta |
| `public/index.html` | Dashboard Vercel |
| `backtest/run.mjs`, `backtest/grid_is.mjs` | Backtest dan pemilihan parameter in-sample |
| `tools/` | Pengunduh data, snapshot order book, ukur biaya, uji bot, tarik log, `hitung_ulang` |
| `data/raw/` | Respons API mentah: candle, snapshot order book, meta (`pairs`, `price_increments`) |
| `artifacts/` | Keluaran backtest (CSV/JSON), grid, dan hasil uji bot |
| `logs_forward/` | Log mentah forward test yang ditarik dari Blob (satu JSON per candle) |
| `laporan/` | `angka.json` dan dashboard offline, hasil `hitung_ulang` |

## Reproduksi

Prasyarat: Node ≥ 20 dan Python 3.

```bash
npm install
# backtest final (data di data/candles, biaya di data/costs.json)
node backtest/run.mjs 2023-11-14 2026-11-14 artifacts/backtest
node backtest/grid_is.mjs           # pemilihan parameter (in-sample saja)
node tools/uji_bot.mjs              # 17 uji: entry/exit = backtest, fill ask/bid, idempoten, kill switch, validasi
# data mentah dari awal (opsional, ±15 menit, berurutan <= 3 req/detik)
python tools/scan_universe.py
python tools/download_candles.py 60 2023-08-01 BTCIDR ETHIDR XRPIDR DOGEIDR SOLIDR ADAIDR
# forward test: tarik log mentah dari Blob, lalu hitung ulang semua angka dashboard
node tools/tarik_log.mjs
node tools/hitung_ulang.mjs         # -> laporan/angka.json + laporan/dashboard_offline.html
```

## Keamanan

- Secret hanya ada di environment variable: `CRON_SECRET` dan `BLOB_READ_WRITE_TOKEN` (lihat [.env.example](.env.example)).
- `.env` dan `.vercel` masuk `.gitignore`.
- Blob bersifat **private**.
- Endpoint publik (`/api/data`) tidak pernah mengembalikan secret.
