# Strategi: Momentum Breakout Kripto 1 Jam (v2)

Bot dry run, **long-only**, di pasangan IDR Indodax. Strategi ini ditulis dan dibekukan (freeze) sebelum forward test.
Fungsi sinyalnya ada di satu file, [lib/strategy.js](../lib/strategy.js). Aturan order dan manajemen risikonya ada di [lib/core.js](../lib/core.js).
Kedua file itu dipakai oleh backtest maupun bot Vercel, jadi tidak ada salinan logika.

## 1. Aturan lengkap

Ada tiga istilah yang dipakai di seluruh dokumen:

- **Candle keputusan T** adalah candle 1 jam terakhir yang sudah tertutup. Candle yang masih berjalan dibuang.
- **Saklar pasar (regime)** ON bila close BTC/IDR di atas EMA 720 jam (sekitar 30 hari). Bila OFF, semua posisi dijual dan tidak ada entry.
- **Jendela indikator** adalah 1.600 candle terakhir, sama persis di backtest dan bot.

Aturan per pasangan:

| Aturan | Isi |
|---|---|
| Masuk (BELI) | Saklar ON, **close > EMA200 jam**, dan **close > close tertinggi 168 jam sebelumnya** (breakout 7 hari). |
| Keluar (JUAL) | Close < close terendah 72 jam sebelumnya (3 hari), **atau** saklar OFF. |
| Prioritas bila slot terbatas | ROC 168 jam terbesar lebih dulu; bila sama, urut nama pasangan. |
| Jumlah posisi maksimum | 3 |
| Ukuran per posisi | Maksimum 30% ekuitas, dan tidak melebihi kas / (1 + fee). |
| Order minimum | Rp25.000. Order lebih kecil dibatalkan dan dicatat. |
| Daily loss limit | Bila ekuitas < 97% ekuitas awal hari WIB, tidak ada entry baru sampai 00.00 WIB berikutnya. Exit tetap jalan. |
| Kill switch | Flag di Blob, diubah lewat `POST /api/control` tanpa redeploy. Mode `blok` menahan entry baru. Mode `tutup` menahan entry dan menjual semua posisi. Setiap perubahan masuk `killLog`, dan setiap putaran mencatat status kill switch. |
| Batas retry | Tiap request API maksimal 3 percobaan, dengan timeout 8 detik dan jeda ≥ 350 ms (≤ 3 request/detik, berurutan). |
| Idempoten per candle | `state.lastCandle`: candle yang sudah diproses tidak dieksekusi lagi. Commit state memakai `ifMatch` (ETag), sehingga dua panggilan bersamaan hanya menghasilkan satu eksekusi. Hal ini sudah diuji. |
| Validasi data (entry ditolak bila gagal) | Candle terakhir tertutup tidak lebih tua dari 2× timeframe; tidak ada candle hilang di jendela; open/close > 0; volume candle terakhir > 0; semua pasangan berakhir di candle T yang sama; order book tidak kosong; spread ≤ 2%. |

**Eksekusi dry run:**

- Beli menghabiskan level **ask** dan jual menghabiskan level **bid** di order book live. Harga isi adalah rata-rata tertimbang dari level yang dimakan, tidak pernah mid atau close.
- Kuantitas dibulatkan ke bawah 8 desimal.
- Fee taker dikenakan pada nilai transaksi.
- Ekuitas dinilai di **best bid**.
- Ekuitas harian adalah ekuitas pada panggilan pertama sesudah 00.00 WIB.

## 2. Perubahan dari versi UTS

| | UTS (Meta-Momentum fix) | UAS (versi ini) |
|---|---|---|
| Aset | Saham KOMPAS100 (BEI) | 6 pasangan kripto/IDR Indodax |
| Timeframe | Harian, rebalancing berkala | 1 jam, dievaluasi setiap jam |
| Ide inti | Pegang saham dengan momentum terkuat, ditambah saklar risiko pasar | Sama: hanya pegang yang sedang breakout naik (momentum), ditambah saklar risiko pasar dari BTC |
| Saklar pasar | Indeks saham | BTC/IDR > EMA720 jam |
| Biaya | Fee broker saham | Fee taker Indodax all-in, spread dan slippage dari snapshot order book |
| Eksekusi | Simulasi backtest | Backtest dan bot dry run live di Vercel dengan fungsi sinyal yang sama |

Ada alasan kenapa tidak memakai rebalancing bulanan. Di kripto 1 jam, momentum berkala yang terlalu sering bergerak membuat biaya menelan laba (lihat v1 di bawah). Breakout lambat 7 hari / 3 hari mempertahankan ide "ikuti yang naik" dengan jumlah trade yang jauh lebih sedikit.

## 3. Riwayat desain (jujur, termasuk yang ditolak)

1. **v1 ditolak.** v1 adalah tren EMA cepat/lambat ditambah ROC, diuji pada grid 3×3 (emaFast {24,50,100} × rocLen {24,72,168}) di in-sample 2023-11-14 s.d. 2025-11-14. Hampir semua konfigurasi rugi. Konfigurasi terbaik hanya mencapai CAGR IS 0,7%, PF 1,004, dengan 709 trade, jadi biaya menelan semuanya. Hasilnya ada di [artifacts/grid_is_v1_DITOLAK.json](../artifacts/grid_is_v1_DITOLAK.json).
2. **v2 (dipakai).** Breakout Donchian lambat. Grid 3×3 (masuk {72,168,336} × keluar {24,72,168} jam) dijalankan di in-sample saja. Kriterianya ditulis sebelum dijalankan: Calmar IS tertinggi dengan ≥ 30 trade. Konfigurasi terpilih adalah **168/72**. Hasilnya ada di [artifacts/grid_is_v2.json](../artifacts/grid_is_v2.json).
3. **Catatan kontaminasi.** v2 dirancang sesudah saya melihat bahwa v1 gagal, termasuk hasil OOS v1. Ini adalah bentuk *researcher degrees of freedom* (dua putaran desain). OOS satu tahun (2025-11-14 s.d. 2026-11-14) dari konfigurasi terpilih adalah **−15,4%** (MDD −28,6%), dan **tidak dipakai untuk memilih**. Hasil OOS ini menunjukkan bahwa kinerja tiga tahun sebagian besar datang dari pasar bull 2023–2025.

## 4. Universe dan kriteria likuiditas (diukur di awal backtest, 2023-11-14)

Sumber data: candle harian (1D) asli `history_v2` untuk **semua 438 pasangan IDR** yang tercantum di `/api/pairs`. Jendelanya 30 hari sebelum 2023-11-14. Data mentahnya ada di `data/raw/scan/`, dan hasilnya di [data/universe_scan.csv](../data/universe_scan.csv). Skripnya [tools/scan_universe.py](../tools/scan_universe.py).

Kriteria universe:

- bukan stablecoin (USDT, USDC, dan sejenisnya dikeluarkan);
- 30 bar penuh;
- ADV30 (rata-rata Volume × Close) ≥ **Rp2 miliar/hari**.

Pasangan yang lolos, dengan ADV30 di 2023-11-14:

| Pasangan | ADV30 |
|---|---|
| BTCIDR | Rp20,9 M |
| ETHIDR | Rp6,78 M |
| XRPIDR | Rp6,14 M |
| DOGEIDR | Rp3,91 M |
| SOLIDR | Rp3,38 M |
| ADAIDR | Rp2,06 M |

Jumlahnya 6 pasangan, di dalam batas 3–10. Kandidat berikutnya, VELOIDR (Rp1,39 M), di bawah ambang.

**Survivorship.** `/api/pairs` hanya memuat pasangan yang *masih* terdaftar hari ini. Pasangan yang sudah delisting sebelum 2026-11 tidak bisa dipindai, sehingga ada bias survivorship kecil. Keenam pasangan terpilih adalah aset besar yang aktif sepanjang periode, jadi dampaknya pada universe ini kecil. Meski begitu, bias ini tetap tercatat.

## 5. Data backtest

- Sumber: candle 1 jam asli `https://indodax.com/tradingview/history_v2?symbol=<SYM>&tf=60`, diunduh mundur per halaman 649 bar, berurutan dengan jeda 0,4 detik. Skripnya [tools/download_candles.py](../tools/download_candles.py).
- Respons mentah disimpan di `data/raw/candles/`, dan hasil gabungannya di `data/candles/<SYM>_60.csv`.
- Rentang: 2023-08-01 s.d. 2026-11-14. Pemanasan indikator berlangsung sebelum 2023-11-14, dan perdagangan dimulai 2023-11-14 (**3,0 tahun**). Tiap pasangan memiliki 28.834 bar, tanpa celah jam.

## 6. Biaya (fee, minimum order, spread, slippage)

**Fee.** Yang dipakai adalah nilai **yang lebih mahal** dari dua sumber:

| Sumber | Nilai taker | URL | Diakses |
|---|---|---|---|
| API `/api/pairs` (`trade_fee_percent_taker`) | 0,20% | https://indodax.com/api/pairs (respons mentah: `data/raw/meta/pairs_20261114T1708.json`) | 2026-11-14 17:08 WIB |
| Fee taker all-in termasuk pajak/pungutan menurut ulasan pihak ketiga (rinciannya tidak bisa diverifikasi) | **0,3248%** | https://financer.id/ulasan/indodax/ | 2026-11-14 17:20 WIB |

Halaman resmi `help.indodax.com` dan `indodax.com/market-fee` menolak akses otomatis (403/404/CAPTCHA) saat dicek. Karena itu nilai all-in di atas berasal dari sumber pihak ketiga, dan statusnya *belum diverifikasi langsung di halaman resmi*. Nilai ini dipakai karena lebih mahal (konservatif) dan berlaku untuk setiap sisi, baik beli maupun jual.

**Minimum order.** Rp25.000 sesuai soal. Nilai ini lebih ketat daripada `trade_min_traded_currency` di API.

**Spread dan slippage.** Nilai yang dipakai adalah median dari snapshot order book **asli** `/api/depth/<pair>` yang diambil setiap 5 menit. Snapshot mentahnya ada di `data/raw/snapshots/`, skrip pengambilnya [tools/snapshot_loop.py](../tools/snapshot_loop.py), dan hasilnya di [data/costs.json](../data/costs.json). Ukuran order acuan adalah Rp30 juta (30% × modal Rp100 juta). Slippage dihitung dari harga terbaik ke harga rata-rata isi.

Di backtest, beli diisi di `Open[T+1] × (1 + ½spread + slip_beli)` dan jual di `Open[T+1] × (1 − ½spread − slip_jual)`, lalu fee 0,3248% ditambahkan. Posisi dinilai di `harga × (1 − ½spread)`, yaitu estimasi bid.

**Keterbatasan.** Saat freeze baru ada 3 snapshot per pasangan (diambil 14 Nov 2026 sore). Snapshot terus dikumpulkan selama forward test. Sebagai uji sensitivitas, menggandakan spread dan slippage menurunkan return 3 tahun dari +328,6% menjadi +302,6% ([artifacts/stress_biaya_x2.json](../artifacts/stress_biaya_x2.json)).

## 7. Hasil backtest final (2023-11-14 s.d. 2026-11-14, modal Rp100 juta)

Semua angka di bawah dihasilkan oleh `node backtest/run.mjs` dan tersimpan di [artifacts/backtest/metrics.json](../artifacts/backtest/metrics.json). Angka-angka ini juga dihitung ulang dari CSV mentah oleh `tools/hitung_ulang.mjs`.

Ringkasan saat freeze:

| Metrik | Strategi | Buy & hold BTC/IDR |
|---|---|---|
| Return total | +328,6% | +115,2% |
| CAGR | 62,4% | 29,1% |
| MDD | −30,4% | −49,6% |

Metrik strategi lainnya:

- 258 trade, win rate 33,3%, PF 1,64;
- rata-rata untung +14,7% dan rata-rata rugi −3,2% per trade;
- porsi biaya (fee + spread + slippage) / laba kotor = 35,7%.

**Peringatan.** OOS tahun terakhir negatif (−15,4%). Ini bukan bukti bahwa strategi punya *edge*.
