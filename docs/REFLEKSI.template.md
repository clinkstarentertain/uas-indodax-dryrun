# Refleksi: backtest vs forward test

Semua angka di dokumen ini berasal dari [laporan/ringkasan_angka.md](../laporan/ringkasan_angka.md) dan [laporan/angka.json](../laporan/angka.json), keduanya dibuat oleh `node tools/hitung_ulang.mjs` dari log mentah. Bila dokumen ini dan file-file itu berbeda, **file hasil hitung_ulang yang benar**. Dashboard Vercel terus diperbarui selama bot berjalan.

## 1. Status forward test saat pengumpulan (jujur)

Soal meminta freeze pada 4 Nov 12.00 WIB dan forward test 10 hari. Pekerjaan ini baru dimulai **14 Nov**: freeze pada 18:06 WIB (commit `7f112cd`), dan tick produksi pertama berjalan pukul 18.09 WIB. Karena itu, saat pengumpulan forward test baru mencakup **{{JAM}} candle 1 jam**, bukan 240 candle. Tidak ada angka forward yang dibuat untuk periode yang tidak dijalankan. Bot tetap berjalan sampai sekitar 24 Nov dengan aturan yang sama, dan dashboard Vercel memperbarui angkanya secara langsung.

Ringkasan saat pengumpulan:

- Forward: return {{FWD_RET}}, MDD {{FWD_MDD}}, {{FWD_ORDER}} order.
- Buy & hold BTC/IDR pada jendela yang sama: {{BH_RET}}.
- Uptime {{UPTIME}}, dengan keterlambatan panggilan median {{TELAT}} sesudah candle tutup.
- Error API {{ERR}}.
- Kill switch diuji 4 kali (nyala/mati) di produksi tanpa redeploy.

## 2. Kecocokan sinyal: target 100%

Backtest dijalankan ulang di jendela forward yang sama, memakai candle yang diunduh ulang dari Indodax sesudah jendela itu. Sinyal **entry, exit, dan saklar BTC** dicocokkan per pasangan per candle. Hasilnya **{{SINYAL}}** cocok.

Kecocokan ini memang diharapkan karena kedua sisi memanggil `decide()` dan `planOrders()` yang sama. Jendela indikatornya juga sama, yaitu 1.600 candle tertutup. Bila saya membuat duplikasi logika untuk bot, kecocokan ini tidak akan terjamin.

Data candle juga konsisten: dari {{TUMPANG}} bar yang tumpang tindih antara unduhan ulang dan data backtest, ada **{{BEDA}}** close yang berbeda. Indodax tidak merevisi candle tertutup.

## 3. Kenapa forward test hampir pasti 0 trade, dan apakah itu wajar

Sepanjang jendela forward, saklar pasar **OFF**. Pada candle 17.00 WIB 14 Nov, close BTC/IDR Rp1,238 miliar, di bawah EMA720 jam di Rp1,398 miliar. Akibatnya:

- Aturan tidak mengizinkan entry.
- Keenam pasangan juga berada di bawah EMA200 jam dan berstatus *exit*.

Backtest pada jendela yang sama juga tidak menghasilkan order. Jadi gap return forward vs backtest adalah **{{GAP}}**, dan nol ini bukan kebetulan: memang tidak ada yang dieksekusi di kedua sisi.

Selisih yang tersisa adalah benchmark. Buy & hold BTC/IDR langsung tercatat negatif ({{BH_RET}}) sejak tick pertama. Penyebabnya adalah biaya masuk: beli di best ask ditambah fee 0,3248%, lalu dinilai di best bid. Ini contoh langsung mengapa ekuitas dinilai di bid, bukan di last atau mid.

## 4. Sumber selisih bila ada trade (kuantitatif, dari backtest dan log)

Di backtest, porsi biaya (fee + spread + slippage) adalah **35,7%** dari laba kotor 3 tahun. Rata-rata trade menang +14,7% dan rata-rata trade kalah −3,2%.

Bila forward menghasilkan trade selama 10 hari ke depan, selisih harga isi per trade akan dijelaskan dengan tiga komponen berikut. Ketiganya sudah dicatat per order di log, yaitu `best_bid`, `best_ask`, `harga_fill`, `harga_sinyal`, dan `selisih_vs_sinyal`.

1. **Keterlambatan jadwal.**
   - Backtest mengisi di open candle T+1 (sekitar 0 menit sesudah sinyal).
   - Bot mengisi rata-rata {{TELAT}} sesudah candle tutup (scheduler menit ke-7, ditambah sekitar 12 detik eksekusi).
   - Perubahan harga selama selang itu masuk ke `selisih_vs_sinyal`.
2. **Spread.**
   - Backtest memakai median dari 3 snapshot yang ada saat freeze.
   - Seluruh snapshot sampai pengumpulan (lokal ditambah order book di setiap log bot) memberikan median yang **lebih lebar** untuk XRP, SOL, dan ADA. Contohnya ADAIDR: {{ADA_BT}} di backtest vs {{ADA_ALL}} dari semua snapshot (tabel lengkap di ringkasan angka).
   - Artinya backtest sedikit **meremehkan** biaya untuk altcoin. Uji stres spread dan slippage ×2 memangkas return 3 tahun dari +328,6% menjadi +302,6%. Dampaknya nyata, tetapi tidak mengubah tanda hasil.
3. **Slippage.** Untuk order Rp30 juta, slippage median kecil (≤ 0,05%) karena level-level teratas cukup dalam. BTC dan DOGE praktis tidak mengalami slippage.

## 5. Apakah backtest bisa dipercaya?

Ada beberapa batas yang membuat backtest ini tidak bisa dibaca sebagai bukti *edge*:

- **Hasil in-sample tidak bertahan di OOS.** Konfigurasi terpilih menghasilkan CAGR in-sample 124,9%, tetapi OOS 1 tahun **−15,4%**. Hasil 3 tahun (+328,6%) didominasi oleh pasar bull 2023–2025, dan saklar BTC membantu menghindari sebagian penurunan 2026 (MDD −30,4% vs B&H −49,6%).
- **Ada dua putaran desain.** v1 ditolak, lalu v2 dirancang sesudah saya melihat kegagalan v1. Ini menambah risiko overfitting yang tidak terlihat di grid v2.
- **Biaya diukur dari sampel kecil.** Saat freeze hanya tersedia 3 snapshot per pasangan dari satu sore. Soal menyarankan pengumpulan mulai 2 Nov.
- **Survivorship.** Pasangan yang sudah delisting tidak bisa dipindai dari `/api/pairs`. Dampaknya kecil karena universe hanya berisi aset besar.
- **Sumber fee.** Nilai all-in 0,3248% berasal dari pihak ketiga karena halaman resmi menolak akses otomatis. Nilai ini dipakai karena lebih mahal (konservatif).

## 6. Operasional: apa yang terjadi dan apa pelajarannya

- **Bug ETag lemah di Vercel Blob.** Bug ini ditemukan saat uji kill switch di produksi dan diperbaiki sebelum tick kedua. Rinciannya ada di [PERUBAHAN_PASCA_FREEZE.md](PERUBAHAN_PASCA_FREEZE.md). Tanpa uji langsung, setiap tick sesudah tick pertama akan gagal commit (berstatus `konflik`), dan uptime akan jatuh ke sekitar 0%.
- **Indodax menolak User-Agent yang mengandung kata "bot"** (HTTP 403). Ini ketahuan saat uji lokal, dan User-Agent-nya diganti.
- **Scheduler.** Scheduler utama adalah Windows Task Scheduler di laptop, karena token GitHub belum tersedia saat pengerjaan. Risikonya adalah laptop tidur atau mati. Insiden pertama terjadi pada 19.07 WIB: tugas tidak berjalan karena laptop memakai baterai (pengaturan bawaan Windows). Tugas itu dibuat ulang pukul 19.12 dengan opsi boleh berjalan saat memakai baterai dan bangun dari tidur. Insiden kedua lebih serius: laptop tidur dari sekitar 21.40 sampai 02.54 WIB, dan bangun-dari-tidur tidak bekerja saat memakai baterai. Selama itu hanya Vercel Cron harian (00.07 WIB) yang berjalan, sehingga beberapa candle tidak terproses. Uptime per definisi soal menjadi **{{UPTIME}}**. Uptime di dashboard mengikuti definisi soal (diproses sebelum candle berikutnya tutup), dan waktu sebenarnya setiap panggilan tercatat di log.

Pelajarannya: scheduler di laptop pribadi adalah titik gagal tunggal. Untuk sisa 10 hari, scheduler harus dipindah ke layanan yang tidak bergantung pada laptop, yaitu GitHub Actions (workflow sudah ada, tinggal push dan isi secret) atau layanan cron gratis seperti cron-job.org yang memanggil `/api/tick` dengan header Authorization. Workflow GitHub Actions dan Vercel Cron harian sudah disiapkan sebagai cadangan.
- **Idempoten dan konkurensi** diuji dua cara. Di produksi, dua panggilan serentak dikirim pada 14 Nov pukul 19.00 WIB untuk candle 18.00: satu berstatus `ok` (HTTP 200) dan satu `konflik` (HTTP 409), dan keduanya tercatat di `logs/` dan `calls/`. Selain itu ada 17 uji otomatis ([artifacts/uji_bot.json](../artifacts/uji_bot.json)). Panggilan scheduler sesudahnya untuk candle yang sama ditolak sebagai `duplikat`.

## 7. Yang akan saya lakukan berbeda

1. Mulai pengumpulan snapshot order book dan freeze sesuai jadwal. Penyebab terbesar lemahnya bukti di sini adalah waktu, bukan kode.
2. Memilih parameter dengan walk-forward atau *purged* CV, bukan dari satu split IS/OOS sesudah dua putaran desain.
3. Menambah kriteria "jumlah hari saklar ON" ke laporan agar ekspektasi jumlah trade forward realistis sejak awal. Dengan saklar BTC OFF, nol trade adalah keluaran yang benar.
