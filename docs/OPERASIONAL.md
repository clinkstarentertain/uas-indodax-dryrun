# Operasional bot

## Arsitektur

```
scheduler eksternal (tiap jam, menit ke-7)          Vercel (region sin1)                     Vercel Blob (PRIVATE)
  Windows Task Scheduler (utama)  ── POST ──▶  /api/tick  (Bearer CRON_SECRET) ──▶ state/state.json  (ifMatch/ETag)
  GitHub Actions (cadangan)                         │                              logs/<candle>.json (1 log per candle, tanpa-timpa)
  Vercel Cron 00.07 WIB (cadangan harian)           │                              calls/<waktu>-duplikat|konflik.json
                                                    ├─ API publik Indodax: server_time, history_v2 (3 halaman/pasangan), depth
                                                    └─ lib/strategy.js + lib/core.js (SAMA dengan backtest)
pengguna ── GET /  (dashboard)  ── GET /api/data (dihitung dari state saat diminta) + /data/laporan.json (hitung_ulang)
admin   ── POST /api/control (Bearer CRON_SECRET) ── kill switch tanpa redeploy
```

Satu putaran `/api/tick` memakan sekitar 10–13 detik. Batas fungsinya 60 detik, sedangkan paket Hobby mengizinkan sampai 300 detik. Isinya:

- **25 request** ke Indodax: 1 `server_time`, 18 `history_v2`, dan 6 `depth`.
- Request berjalan berurutan dengan jeda ≥ 350 ms, sehingga laju maksimum sekitar 2,9 request/detik.
- Setiap request punya timeout 8 detik dan maksimal 3 percobaan.

## Deploy dari nol

```bash
npm install
npm i -g vercel
vercel link                                   # buat/tautkan project
vercel blob create-store <nama> --access private --region sin1 --yes   # BLOB_READ_WRITE_TOKEN otomatis masuk env project
vercel env add CRON_SECRET production         # isi acak >= 16 karakter (mis. node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
vercel deploy --prod
# uji koneksi Vercel -> Indodax (harus status ok / duplikat)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<project>.vercel.app/api/tick
```

Simpan `CRON_SECRET` dan `BOT_URL` di `.env` lokal untuk scheduler. File `.env` masuk `.gitignore`.

## Scheduler (tiap jam, menit ke-7)

1. **Windows Task Scheduler** (aktif sejak 14 Nov 2026 19.07 WIB). Tugas bernama `UAS_Indodax_Tick` menjalankan [scheduler/panggil_tick.ps1](../scheduler/panggil_tick.ps1).
   - Setiap panggilan berikut kode HTTP-nya dicatat di `scheduler/riwayat_panggilan.csv`.
   - Bila gagal atau mendapat 409, skrip mencoba lagi hingga 3 kali dengan jeda 20/40 detik.
   - Kelemahannya: laptop harus menyala dan tidak tidur. Kalau tidak, panggilan terlewat, dan hal itu terlihat di uptime.
2. **GitHub Actions** ([.github/workflows/tick.yml](../.github/workflows/tick.yml), cron `7 * * * *`). **Aktif sejak 15 Nov 2026 sekitar 03.20 WIB** di https://github.com/clinkstarentertain/uas-indodax-dryrun/actions, dengan secret `CRON_SECRET` dan `BOT_URL` terenkripsi di repository secrets. Scheduler ini tidak bergantung pada laptop. Uji `workflow_dispatch` pertama mendapat HTTP 200 `duplikat`. Jadwal GitHub sering terlambat 5–30 menit, tetapi masih memenuhi definisi uptime (diproses sebelum candle berikutnya tertutup).
3. **Vercel Cron** harian `7 17 * * *` (00.07 WIB, [vercel.json](../vercel.json)). Ini cadangan agar ekuitas harian selalu tercatat pada panggilan pertama sesudah 00.00 WIB.

Beberapa scheduler yang memanggil candle yang sama **aman**. Panggilan kedua ditolak oleh `state.lastCandle`, yang menghasilkan status `duplikat`. Bila keduanya berjalan bersamaan, `ifMatch` ETag menolak salah satunya (status `konflik`, HTTP 409). Kedua jenis panggilan itu tetap dicatat di `calls/`.

## Kill switch (tanpa redeploy)

```bash
# nyalakan: blok entry baru (exit tetap jalan)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" \
     -d '{"on":true,"mode":"blok","alasan":"..."}' $BOT_URL/api/control
# mode tutup: blok entry + jual semua posisi pada putaran berikutnya
curl ... -d '{"on":true,"mode":"tutup","alasan":"..."}' $BOT_URL/api/control
# matikan / status
curl ... -d '{"on":false,"alasan":"..."}' $BOT_URL/api/control
curl -H "Authorization: Bearer $CRON_SECRET" $BOT_URL/api/control
```

Pencatatannya ada di dua tempat:

- Setiap perubahan masuk `state.killLog` (waktu, status, mode, alasan) dan ditampilkan di panel operasional.
- Setiap log candle menyimpan status kill switch saat putaran itu berjalan, termasuk order yang diblokir dengan alasan `kill switch aktif`.

Uji langsung di produksi pada 14 Nov 2026 sekitar 18.16–18.18 WIB: kill switch dinyalakan dan dimatikan dua kali, dan keempat perubahan itu tercatat.

## Tarik log & hitung ulang

```bash
node tools/tarik_log.mjs              # logs/ + calls/ + state.json dari Blob -> logs_forward/ (token dari .env.local)
node tools/unduh_candle_forward.mjs   # candle asli untuk mencocokkan sinyal backtest vs forward
node tools/hitung_ulang.mjs           # laporan/angka.json, laporan/csv/*.csv, laporan/dashboard_offline.html, public/data/laporan.json
vercel deploy --prod                  # agar /data/laporan.json di dashboard ikut terbarui
```

## Batas kuota Vercel Blob (Hobby)

Setiap putaran normal memakai 1 baca (operasi sederhana) dan 2 tulis (operasi lanjutan), sehingga 10 hari × 24 jam ≈ 480 operasi lanjutan.

`/api/data` di-cache di CDN selama 120 detik dan membaca 2 blob per permintaan. Endpoint ini tidak memakai `list` agar kuota operasi lanjutan tetap aman.
