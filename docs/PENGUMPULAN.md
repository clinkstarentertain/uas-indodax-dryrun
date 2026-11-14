# Pengumpulan (RISE)

**Isi kolom catatan saat submit:**

```
Link Vercel (dashboard): https://uas-indodax-dryrun.vercel.app
Data live dashboard: https://uas-indodax-dryrun.vercel.app/api/data
Bukti freeze: ZIP menyertakan folder .git utuh. Commit freeze 7f112cd0b2e315061182788e1896ce5c43b11895 (tag freeze-uas), 14 Nov 2026 18:06:31 WIB.
Link repositori GitHub: https://github.com/clinkstarentertain/uas-indodax-dryrun (publik, riwayat lengkap, tag freeze-uas)
Catatan: paket diperbarui 15 Nov dini hari karena sesi pengerjaan terhenti saat laptop tidur (lewat tenggat 23.59). Paket versi 14 Nov 21.08 WIB juga ada di riwayat commit (61d3890). Freeze dan forward test baru dimulai 14 Nov (terlambat dari jadwal 4 Nov). Forward test parsial dilaporkan apa adanya, dan bot tetap berjalan 10 hari sampai ±24 Nov.
```

## Cek isi ZIP terhadap daftar wajib

| Wajib | Lokasi |
|---|---|
| Source code bot dan backtest, plus README (langkah menjalankan dan deploy) | `lib/`, `api/`, `backtest/`, `tools/`, `README.md`, `docs/OPERASIONAL.md` |
| Strategi tertulis dan perubahan dari UTS | `docs/STRATEGI.md` |
| Commit freeze (hash dan waktu) | `README.md` bagian Freeze; cek dengan `git show freeze-uas` |
| Log mentah forward test (JSON dan CSV): panggilan, order, equity harian, error, snapshot order book | `logs_forward/logs/*.json`, `logs_forward/calls/*.json`, `logs_forward/state.json`, `laporan/csv/*.csv`, `data/raw/snapshots/` |
| Skrip `hitung_ulang` | `tools/hitung_ulang.mjs` (`npm run hitung_ulang`) |
| Dashboard offline dan link Vercel | `laporan/dashboard_offline.html`, https://uas-indodax-dryrun.vercel.app |
| Refleksi | `docs/REFLEKSI.md` |
| `.env.example` tanpa rahasia; tidak ada `.env` | `.env.example`, diperiksa oleh `tools/paket_zip.py` |

## Scheduler yang tidak bergantung laptop (sangat disarankan)

**Opsi A: cron-job.org (gratis).**

1. Buat job dengan URL `https://uas-indodax-dryrun.vercel.app/api/tick`, metode POST, dan jadwal setiap jam menit 7 (zona waktu Asia/Jakarta).
2. Tambahkan header `Authorization: Bearer <CRON_SECRET>`. Nilainya ada di file `.env` lokal, dan jangan dibagikan.

**Opsi B: GitHub Actions** (lihat langkah push di bawah).

## Push ke GitHub nanti (tanpa menulis ulang riwayat)

```bash
git remote add origin https://github.com/<user>/uas-indodax-dryrun.git
git push -u origin main --follow-tags     # jangan pernah --force
```

Sesudah repositori di-push:

1. Isi repository secrets `CRON_SECRET` dan `BOT_URL` di Settings → Secrets → Actions. Workflow `.github/workflows/tick.yml` akan menjadi scheduler cadangan.
2. **Rotasi token Vercel** yang sempat ditempel di chat, di Vercel → Account Settings → Tokens. Token itu tidak tersimpan di repositori, tetapi tetap sebaiknya diganti.
