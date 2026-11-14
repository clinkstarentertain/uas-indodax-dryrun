# UAS Algoritma Trading: Bot Dry Run Indodax

Bot ini menjalankan **dry run** (tanpa order sungguhan dan tanpa API key) di Vercel, memakai **API publik Indodax** saja. Strateginya **long-only**, yaitu momentum breakout 1 jam pada 6 pasangan IDR.
Backtest dan bot memakai **fungsi sinyal yang sama**, yaitu [lib/strategy.js](lib/strategy.js) dan [lib/core.js](lib/core.js).

- Strategi, perubahan dari UTS, universe, sumber biaya, dan hasil backtest: **[docs/STRATEGI.md](docs/STRATEGI.md)**
- Operasional, scheduler, dan kill switch: [docs/OPERASIONAL.md](docs/OPERASIONAL.md)
- Refleksi dan hasil forward test: [docs/REFLEKSI.md](docs/REFLEKSI.md). File ini dibuat oleh `hitung_ulang` dari `docs/REFLEKSI.template.md`, sehingga angkanya selalu sama dengan log.
- Ringkasan angka otomatis: [laporan/ringkasan_angka.md](laporan/ringkasan_angka.md)

## Link

- Repositori GitHub (publik, riwayat lengkap + tag `freeze-uas`): https://github.com/clinkstarentertain/uas-indodax-dryrun
- Dashboard Vercel: https://uas-indodax-dryrun.vercel.app
- Data mentah dashboard: https://uas-indodax-dryrun.vercel.app/api/data
- Dashboard offline: `laporan/dashboard_offline.html` (bisa dibuka tanpa internet)

## Freeze

- **Hash commit freeze:** `7f112cd0b2e315061182788e1896ce5c43b11895`
- **Waktu commit freeze:** Sabtu, 14 Nov 2026, 18:06:31 WIB
- **Forward test** dimulai pada candle pertama sesudah freeze. Tick produksi pertama berjalan 14 Nov 2026 pukul 18.09 WIB untuk candle 17.00 WIB.

**Penyimpangan dari jadwal soal (dilaporkan jujur).** Soal meminta freeze pada 4 Nov 12.00 WIB dan forward test 10 hari sampai 14 Nov. Pekerjaan ini baru dimulai 14 Nov, sehingga freeze dan forward test juga baru dimulai pada tanggal itu. Akibatnya, saat pengumpulan (14 Nov 23.59 WIB) forward test baru berjalan sekitar 6 jam. Bot tetap berjalan 10 hari penuh sesudahnya, sampai 24 Nov 2026. Selama itu angka dashboard Vercel terus diperbarui secara langsung dari state bot. Tidak ada angka forward yang dibuat-buat untuk mengisi periode yang tidak dijalankan.

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

## Deploy & operasional

Lihat [docs/OPERASIONAL.md](docs/OPERASIONAL.md). Isinya mencakup deploy, Blob, `CRON_SECRET`, scheduler, kill switch, dan cara menarik log.

Perubahan sesudah freeze, yang semuanya berupa perbaikan bug dan pencatatan tanpa mengubah aturan, ada di [docs/PERUBAHAN_PASCA_FREEZE.md](docs/PERUBAHAN_PASCA_FREEZE.md).

## Keamanan

- Secret hanya ada di environment variable: `CRON_SECRET` dan `BLOB_READ_WRITE_TOKEN` (lihat [.env.example](.env.example)).
- `.env` dan `.vercel` masuk `.gitignore`.
- Blob bersifat **private**.
- Endpoint publik (`/api/data`) tidak pernah mengembalikan secret.
