# Catatan perubahan sesudah freeze

**Freeze**: commit `7f112cd0b2e315061182788e1896ce5c43b11895`, tag `freeze-uas`, Sabtu 14 Nov 2026 pukul 18:06:31 WIB.

Sejak freeze, aturan, parameter, dan universe **tidak berubah**. Hal ini bisa dibuktikan dengan perintah berikut, yang hasilnya kosong:

```bash
git diff freeze-uas -- lib/strategy.js lib/core.js lib/execution.js data/candles data/costs.json backtest/
```

Semua perubahan sesudah freeze menyangkut infrastruktur, pencatatan, dan pelaporan. Rinciannya, beserta dampaknya terhadap aturan:

1. **14 Nov, sekitar 18.18 WIB: `lib/store.js` (bug).** `get()` di Vercel Blob mengembalikan ETag lemah `W/"…"`, sehingga `put(..., {ifMatch})` selalu gagal (precondition). Akibatnya, kill switch yang kedua menghasilkan `konflik`, dan tick berikutnya juga akan gagal commit. Perbaikannya adalah menormalkan ETag (menghapus prefix `W/`). Aturan trading tidak berubah.
2. **14 Nov: `api/tick.js` dan `api/control.js`.** Status `konflik` kini mengembalikan HTTP 409 agar scheduler mencoba lagi. Selain itu, `control` mencoba ulang dengan jeda bila terjadi konflik. Aturan tidak berubah.
3. **14 Nov: `lib/bot.js` (pencatatan).** Panggilan yang tidak mengeksekusi (`duplikat`, `konflik`) kini juga disimpan di `calls/` karena soal mewajibkan setiap panggilan tercatat. Logika keputusan dan eksekusi tidak berubah, dan uji bot tetap lulus 17/17.
4. **14 Nov: `lib/metrics.js`.** Uptime kini mengikuti definisi soal: candle yang diproses sebelum candle berikutnya tertutup, dibagi jumlah candle selama forward test. Ada juga tambahan metrik keterlambatan panggilan. Hanya pelaporan yang berubah.
5. **14 Nov: dashboard (`public/index.html`), `api/data.js`, `tools/tarik_log.mjs`, `tools/hitung_ulang.mjs`, `tools/unduh_candle_forward.mjs`, `scheduler/`, `.github/workflows/`, dan `docs/`.** Semuanya untuk pelaporan dan penjadwalan.
6. **14 Nov, 19.12 WIB: scheduler Windows (operasional).** Tugas `schtasks` pertama tidak berjalan pada 19.07 (LastResult 267011, "belum pernah berjalan") karena laptop memakai baterai, sedangkan pengaturan bawaan Windows hanya menjalankan tugas saat tersambung listrik. Tugas itu dibuat ulang dengan `Register-ScheduledTask` dan opsi AllowStartIfOnBatteries, StartWhenAvailable, dan WakeToRun, dengan pengulangan 1 jam selama 12 hari. Candle 18.00 tetap terproses tepat waktu (19.00 WIB, uji konkurensi), jadi uptime tidak terpengaruh.
