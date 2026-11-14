// HITUNG ULANG semua angka dashboard dari data/log MENTAH (tidak ada angka yang diketik tangan).
//  A. Backtest: dari artifacts/backtest/trades.csv + equity.csv + candle mentah -> dibandingkan dengan metrics.json
//  B. Forward : dari logs_forward/logs/*.json (satu log mentah per candle) -> dibandingkan dengan state.json (/api/data)
//               + verifikasi ulang tiap fill dengan menelusuri order book yang tercatat di log
//  C. Gap     : backtest di jendela yang sama dengan forward, sinyal dicocokkan candle per candle
//  D. Keluaran: laporan/angka.json, public/data/laporan.json, laporan/dashboard_offline.html
// Pemakaian: node tools/tarik_log.mjs && node tools/unduh_candle_forward.mjs && node tools/hitung_ulang.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { loadCandles, runBacktest, metrics as btMetrics } from '../backtest/run.mjs';
import { tradeStats, maxDrawdown, forwardMetrics } from '../lib/metrics.js';
import { fillBuy, fillSell, measure, FEE_TAKER, FEE_SOURCES, MIN_ORDER_IDR } from '../lib/execution.js';
import { PARAMS, UNIVERSE } from '../lib/strategy.js';
import { wibDay } from '../lib/core.js';

const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const csv = (p) => { const [h, ...ls] = rd(p).trim().split(/\r?\n/); const k = h.split(','); return ls.map((l) => Object.fromEntries(l.split(',').map((v, i) => [k[i], isNaN(+v) || v === '' ? v : +v]))); };
const close = (a, b, tol = 1e-9) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)));
const cek = []; const banding = (nama, a, b, tol) => { cek.push({ nama, hitung_ulang: a, sumber: b, cocok: close(a, b, tol) }); };

// ---------- A. BACKTEST ----------
const bm = JSON.parse(rd('artifacts/backtest/metrics.json'));
const btTrades = csv('artifacts/backtest/trades.csv'), btEq = csv('artifacts/backtest/equity.csv'), btDaily = csv('artifacts/backtest/equity_harian.csv');
const modal = 100_000_000;
const [s0, s1] = bm.metrics.periode;
const yrs = (Date.parse(s1) - Date.parse(s0)) / 864e5 / 365.25;
const eqv = btEq.map((e) => e.ekuitas);
const A = { periode: [s0, s1], tahun: yrs, ekuitas_akhir: eqv.at(-1), return_total: eqv.at(-1) / modal - 1, mdd: maxDrawdown(eqv, modal), ...tradeStats(btTrades) };
A.cagr = (1 + A.return_total) ** (1 / yrs) - 1;
// buy & hold BTC dari candle mentah + biaya yang sama
const candles = loadCandles();
const costs = JSON.parse(rd('data/costs.json')).pasangan;
{
  const btc = candles.BTCIDR.filter((b) => b.Time >= Date.parse(s0) / 1000 && b.Time < Date.parse(s1) / 1000), cb = costs.BTCIDR;
  const q = modal / (1 + FEE_TAKER) / (btc[0].Open * (1 + cb.half_spread + cb.slip_buy));
  const ser = btc.map((b) => q * b.Close * (1 - cb.half_spread));
  A.bh_btc_return = ser.at(-1) * (1 - FEE_TAKER) / modal - 1; A.bh_btc_cagr = (1 + A.bh_btc_return) ** (1 / yrs) - 1; A.bh_btc_mdd = maxDrawdown(ser, modal);
  // seri harian untuk grafik (ekuitas strategi pada panggilan pertama tiap hari WIB, B&H BTC di candle yang sama)
  const byT = new Map(btc.map((b) => [b.Time, b]));
  A.seri_harian = btDaily.map((d) => ({ hari: d.hari, ekuitas: d.ekuitas }));
  const firstOfDay = new Map(); for (const b of btc) { const h = wibDay(b.Time + 3600 + 420); if (!firstOfDay.has(h)) firstOfDay.set(h, b); }
  for (const s of A.seri_harian) { const b = firstOfDay.get(s.hari); s.bh_btc = b ? q * b.Open * (1 - cb.half_spread) : null; }
  void byT;
}
for (const k of ['return_total', 'cagr', 'mdd', 'jumlah_trade', 'win_rate', 'profit_factor', 'rata_untung_pct', 'rata_rugi_pct', 'porsi_biaya', 'bh_btc_return', 'bh_btc_cagr', 'bh_btc_mdd'])
  banding(`backtest.${k}`, A[k], bm.metrics[k], 1e-6);
// IS/OOS dari grid (dibaca, bukan diketik)
const grid = JSON.parse(rd('artifacts/grid_is_v2.json'));

// ---------- B. FORWARD ----------
const ldir = path.join(ROOT, 'logs_forward/logs');
const logs = fs.existsSync(ldir) ? fs.readdirSync(ldir).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ldir, f), 'utf8'))) : [];
const gagal = fs.existsSync(ldir) ? fs.readdirSync(ldir).filter((f) => f.startsWith('gagal-')).length : 0;
const state = fs.existsSync(path.join(ROOT, 'logs_forward/state.json')) ? JSON.parse(rd('logs_forward/state.json')) : null;
const orders = logs.flatMap((l) => l.order || []);
// rekonstruksi trade dari order mentah (FIFO per pasangan)
const open = {}, trades = [];
for (const o of orders) {
  if (o.sisi === 'BELI') open[o.pair] = { qty: o.qty, cost: o.nilai, fee: o.fee, spread: o.spread_rp, slip: o.slip_rp, t: o.t, px: o.harga_fill };
  else {
    const p = open[o.pair]; if (!p) continue; const sh = o.qty / p.qty;
    const tr = { pair: o.pair, masuk: p.t, keluar: o.t, harga_masuk: p.px, harga_keluar: o.harga_fill, qty: o.qty, biaya_masuk: p.cost * sh, fee_masuk: p.fee * sh, nilai_keluar: o.nilai, fee_keluar: o.fee,
      spread_rp: p.spread * sh + o.spread_rp, slip_rp: p.slip * sh + o.slip_rp, alasan: o.alasan };
    tr.laba_bersih = tr.nilai_keluar - tr.fee_keluar - tr.biaya_masuk - tr.fee_masuk; tr.laba_kotor = tr.laba_bersih + tr.fee_masuk + tr.fee_keluar + tr.spread_rp + tr.slip_rp;
    tr.return_pct = tr.laba_bersih / (tr.biaya_masuk + tr.fee_masuk) * 100; trades.push(tr);
    if (o.qty >= p.qty - 1e-9) delete open[o.pair]; else Object.assign(p, { qty: p.qty - o.qty, cost: p.cost * (1 - sh), fee: p.fee * (1 - sh), spread: p.spread * (1 - sh), slip: p.slip * (1 - sh) });
  }
}
// verifikasi fill: telusuri ulang order book yang tercatat (30 level) -> harga rata-rata & fee harus sama
const fillCek = orders.map((o) => {
  const L = logs.find((l) => l.candle === o.candle); const b = L.order_book[o.pair]; const book = { bids: b.bids, asks: b.asks, bestBid: b.best_bid, bestAsk: b.best_ask };
  const f = o.sisi === 'BELI' ? fillBuy(book, o.nilai) : fillSell(book, o.qty);
  return { candle: o.candle, pair: o.pair, sisi: o.sisi, cocok: !!f && close(f.avg, o.harga_fill, 1e-7) && close(o.fee, o.nilai * FEE_TAKER, 1e-9), sisi_benar: o.sisi === 'BELI' ? o.harga_fill >= o.best_ask : o.harga_fill <= o.best_bid };
});
// candle tertutup terakhir saat laporan dibuat (dari unduhan candle forward terbaru) -> penyebut uptime
const fdirC = path.join(ROOT, 'data/raw/candles_forward');
const fwdFiles = fs.existsSync(fdirC) ? fs.readdirSync(fdirC).filter((f) => f.startsWith('BTCIDR_')).sort() : [];
const nowCandle = fwdFiles.length ? JSON.parse(fs.readFileSync(path.join(fdirC, fwdFiles.at(-1)), 'utf8')).at(-1).Time : null;
const cdir = path.join(ROOT, 'logs_forward/calls');
const calls = fs.existsSync(cdir) ? fs.readdirSync(cdir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8'))) : [];
const gagalLogs = fs.existsSync(ldir) ? fs.readdirSync(ldir).filter((f) => f.startsWith('gagal-')).map((f) => JSON.parse(fs.readFileSync(path.join(ldir, f), 'utf8'))) : [];
const history = logs.map((l) => ({ t: l.waktu_panggilan, candle: l.candle, ekuitas: l.ekuitas.sesudah, bh_btc: l.ekuitas.bh_btc }));
const harian = []; for (const l of logs) { const h = wibDay(l.waktu_panggilan); if (!harian.find((x) => x.hari === h)) harian.push({ hari: h, ekuitas: l.ekuitas.sebelum, t: l.waktu_panggilan }); }
const B = forwardMetrics({ history, trades, orders, modal, ops: state && state.ops, killLog: state && state.killLog, daily: harian, nowCandle });
B.panggilan = { eksekusi: logs.length, duplikat: calls.filter((c) => c.status === 'duplikat').length, konflik: calls.filter((c) => c.status === 'konflik').length, gagal: gagalLogs.length };
B.kill_switch_putaran_aktif_log = logs.filter((l) => l.kill_switch && l.kill_switch.on).length;
B.error_api_log = logs.reduce((s, l) => s + (l.error_api || []).length, 0);
B.gagal_fatal_log = gagal;
B.verifikasi_fill = { total: fillCek.length, cocok: fillCek.filter((x) => x.cocok && x.sisi_benar).length };
B.diblokir = logs.flatMap((l) => (l.diblokir || []).map((d) => ({ candle: l.candle, ...d })));
if (state) {
  const S = forwardMetrics({ history: state.history, trades: state.trades, orders: state.orders, modal: state.modal_awal, ops: state.ops, killLog: state.killLog, daily: state.daily, nowCandle });
  for (const k of ['ekuitas_akhir', 'return_total', 'mdd', 'jumlah_trade', 'win_rate', 'profit_factor', 'porsi_biaya', 'bh_btc_return', 'bh_btc_mdd', 'candle_diproses', 'candle_tepat_waktu', 'uptime'])
    banding(`forward.${k} (log mentah vs state /api/data)`, B[k], S[k], 1e-9);
  banding('forward.error_api (log vs state)', B.error_api_log, state.ops.error_api, 0);
}

// ---------- C. GAP backtest vs forward di jendela yang sama ----------
let C = null;
if (logs.length) {
  // candle: data backtest + unduhan forward terbaru (mentah); cek konsistensi di bar yang tumpang tindih
  const fdir = path.join(ROOT, 'data/raw/candles_forward');
  const merged = {}; let beda = 0, tumpang = 0;
  for (const p of UNIVERSE) {
    const m = new Map(candles[p].map((b) => [b.Time, b]));
    const files = fs.existsSync(fdir) ? fs.readdirSync(fdir).filter((f) => f.startsWith(p + '_')).sort() : [];
    if (files.length) for (const b of JSON.parse(fs.readFileSync(path.join(fdir, files.at(-1)), 'utf8'))) {
      const o = m.get(b.Time); if (o) { tumpang++; if (o.Close !== b.Close) beda++; } else m.set(b.Time, b);
    }
    merged[p] = [...m.values()].sort((a, b) => a.Time - b.Time);
  }
  const T0 = logs[0].candle, T1 = logs.at(-1).candle;
  const dayStart = new Date(T0 * 1000).toISOString().slice(0, 10), dayEnd = new Date((T1 + 2 * 86400) * 1000).toISOString().slice(0, 10);
  const bt = runBacktest({ candles: merged, costs, start: dayStart, end: dayEnd, params: PARAMS });
  // cocokkan sinyal candle per candle
  const sigBy = new Map(bt.signals.map((s) => [s.time + ':' + s.pair, s]));
  const rows = [];
  for (const l of logs) for (const r of l.keputusan.baris) {
    const s = sigBy.get(l.candle + ':' + r.pair);
    rows.push({ candle: l.candle, pair: r.pair, regime_fwd: l.keputusan.regime_on ? 1 : 0, regime_bt: s ? s.regime : null, entry_fwd: r.entry ? 1 : 0, entry_bt: s ? s.entry : null, exit_fwd: r.exit ? 1 : 0, exit_bt: s ? s.exit : null,
      close_fwd: r.close, close_bt: s ? s.close : null });
  }
  const ada = rows.filter((r) => r.entry_bt != null);
  const cocok = ada.filter((r) => r.entry_fwd === r.entry_bt && r.exit_fwd === r.exit_bt && r.regime_fwd === r.regime_bt);
  const eqW = bt.equity.filter((e) => e.t >= logs[0].waktu_panggilan - 3600 && e.t <= logs.at(-1).waktu_panggilan + 3600);
  const btOrdersW = bt.orders.filter((o) => o.t >= T0 + 3600 && o.t <= T1 + 3600 + 3600);
  C = { sinyal_rows: rows, jendela: { candle_awal: T0, candle_akhir: T1, awal_iso: new Date(T0 * 1000).toISOString(), akhir_iso: new Date(T1 * 1000).toISOString(), jam: Math.round((T1 - T0) / 3600) + 1 },
    sinyal: { baris: rows.length, tersedia_di_backtest: ada.length, cocok: cocok.length, tidak_cocok: ada.filter((r) => !cocok.includes(r)) },
    candle_konsisten: { tumpang_tindih: tumpang, close_beda: beda },
    backtest_jendela: { return_total: eqW.length ? eqW.at(-1).ekuitas / eqW[0].ekuitas - 1 : null, mdd: eqW.length ? maxDrawdown(eqW.map((e) => e.ekuitas), eqW[0].ekuitas) : null, jumlah_order: btOrdersW.length,
      catatan: 'backtest dijalankan dari 00.00 UTC hari pertama forward; return dihitung dari titik ekuitas pada jam forward pertama' },
    forward_jendela: { return_total: B.return_total, mdd: B.mdd, jumlah_order: orders.length },
  };
  C.gap_return = C.forward_jendela.return_total - (C.backtest_jendela.return_total || 0);
}

// ---------- C2. SPREAD: angka backtest (median snapshot s.d. freeze) vs SEMUA snapshot (lokal + order book di setiap log bot) ----------
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const ORDER_IDR = JSON.parse(rd('data/costs.json')).order_idr;
const spreadBanding = UNIVERSE.map((p) => {
  const sd = path.join(ROOT, 'data/raw/snapshots', p.toLowerCase());
  const ms = (fs.existsSync(sd) ? fs.readdirSync(sd) : []).map((f) => { try { return measure(JSON.parse(fs.readFileSync(path.join(sd, f), 'utf8')), ORDER_IDR); } catch { return null; } }).filter(Boolean);
  const mb = logs.map((l) => (l.order_book && l.order_book[p] ? measure({ buy: l.order_book[p].bids, sell: l.order_book[p].asks }, ORDER_IDR) : null)).filter(Boolean);
  const all = [...ms, ...mb];
  return { pair: p, backtest_spread: costs[p].spread, backtest_n: costs[p].n_snapshot, semua_n: all.length, n_lokal: ms.length, n_log_bot: mb.length,
    semua_spread_median: med(all.map((m) => m.spreadPct)), semua_spread_maks: all.length ? Math.max(...all.map((m) => m.spreadPct)) : null,
    backtest_slip_beli: costs[p].slip_buy, semua_slip_beli: med(all.map((m) => m.slipBuy)), backtest_slip_jual: costs[p].slip_sell, semua_slip_jual: med(all.map((m) => m.slipSell)) };
});

// ---------- D. KELUARAN ----------
const lastLog = logs.at(-1) || null;
const out = { dibuat: new Date().toISOString(), freeze: 'tag git freeze-uas', params: PARAMS, fee: { taker_dipakai: FEE_TAKER, sumber: FEE_SOURCES, min_order_idr: MIN_ORDER_IDR },
  biaya_snapshot: costs, backtest: A, is_oos: { kriteria: grid.kriteria, IS: grid.IS, OOS: grid.OOS, terpilih: grid.terpilih, semua: grid.semua },
  stress_biaya_x2: JSON.parse(rd('artifacts/stress_biaya_x2.json')),
  forward: { ...B, history, harian, trades, orders, posisi: state ? state.positions : open, kill_log: state ? state.killLog : [], kill_switch: state ? state.killSwitch : null,
    keputusan_terakhir: lastLog && { candle: lastLog.candle, waktu: lastLog.waktu_panggilan, ...lastLog.keputusan, validasi: lastLog.validasi } },
  spread_banding: spreadBanding, gap: C, pemeriksaan: { total: cek.length, cocok: cek.filter((c) => c.cocok).length, rincian: cek } };
fs.mkdirSync(path.join(ROOT, 'laporan'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'laporan/angka.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(ROOT, 'public/data/laporan.json'), JSON.stringify(out));
const html = rd('public/index.html').replace('<script id="data-offline"></script>', `<script id="data-offline">window.__LAPORAN__=${JSON.stringify(out).replace(/</g, '\\u003c')};window.__OFFLINE__=true;</script>`);
fs.writeFileSync(path.join(ROOT, 'laporan/dashboard_offline.html'), html);
// CSV log mentah (turunan langsung dari JSON log, untuk dibaca di spreadsheet)
const toCsv = (rows) => { if (!rows.length) return ''; const k = [...new Set(rows.flatMap((r) => Object.keys(r)))]; return [k.join(','), ...rows.map((r) => k.map((x) => { const v = r[x]; const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','))].join('\n') + '\n'; };
const cd = path.join(ROOT, 'laporan/csv'); fs.mkdirSync(cd, { recursive: true });
const iso = (t) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' WIB';
fs.writeFileSync(path.join(cd, 'panggilan.csv'), toCsv([
  ...logs.map((l) => ({ waktu: l.waktu_panggilan, waktu_wib: iso(l.waktu_panggilan), status: 'ok', candle: l.candle, telat_detik: l.waktu_panggilan - l.candle - 3600, n_order: l.order.length, n_diblokir: l.diblokir.length, n_error_api: l.error_api.length, kill_switch: l.kill_switch && l.kill_switch.on ? 1 : 0, regime_on: l.keputusan.regime_on ? 1 : 0, ekuitas: l.ekuitas.sesudah })),
  ...calls.map((c) => ({ waktu: c.waktu_panggilan, waktu_wib: iso(c.waktu_panggilan), status: c.status, candle: c.candle, n_error_api: (c.error_api || []).length })),
  ...gagalLogs.map((c) => ({ waktu: c.waktu_panggilan, waktu_wib: iso(c.waktu_panggilan), status: 'gagal', error: c.error, n_error_api: (c.error_api || []).length })),
].sort((a, b) => a.waktu - b.waktu)));
fs.writeFileSync(path.join(cd, 'order.csv'), toCsv(orders.map((o) => ({ waktu_wib: iso(o.t), ...o }))));
fs.writeFileSync(path.join(cd, 'trade.csv'), toCsv(trades));
fs.writeFileSync(path.join(cd, 'equity_per_jam.csv'), toCsv(history.map((h) => ({ waktu_wib: iso(h.t), ...h }))));
fs.writeFileSync(path.join(cd, 'equity_harian.csv'), toCsv(harian.map((h) => ({ ...h, waktu_wib: iso(h.t) }))));
fs.writeFileSync(path.join(cd, 'error_api.csv'), toCsv([...logs, ...calls, ...gagalLogs].flatMap((l) => (l.error_api || []).map((e) => ({ waktu_wib: iso(e.t), ...e })))));
fs.writeFileSync(path.join(cd, 'diblokir.csv'), toCsv(B.diblokir.map((d) => ({ candle_wib: iso(d.candle), ...d }))));
fs.writeFileSync(path.join(cd, 'sinyal_backtest_vs_forward.csv'), toCsv(C ? C.sinyal_rows : []));
fs.writeFileSync(path.join(cd, 'spread_banding.csv'), toCsv(spreadBanding));
// ringkasan angka untuk refleksi (dibuat otomatis; docs/REFLEKSI.md merujuk file ini)
{
  const P = (v, d = 2) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d).replace('.', ',') + '%');
  const R = (v) => (v == null ? '–' : 'Rp' + Math.round(v).toLocaleString('id-ID'));
  const f = out.forward, a = out.backtest, g = out.gap;
  const L = [];
  L.push('# Ringkasan angka (dibuat otomatis oleh tools/hitung_ulang.mjs)', '', `Dibuat: ${out.dibuat} (UTC). Pemeriksaan silang: **${out.pemeriksaan.cocok}/${out.pemeriksaan.total} cocok**.`, '');
  L.push('## Forward test', '', '| Metrik | Nilai |', '|---|---|',
    `| Jendela | ${g ? `${iso(g.jendela.candle_awal)} → ${iso(g.jendela.candle_akhir)} (${g.jendela.jam} candle)` : '–'} |`,
    `| Ekuitas akhir | ${R(f.ekuitas_akhir)} |`, `| Return total | ${P(f.return_total)} |`, `| MDD | ${P(f.mdd)} |`,
    `| Trade / order | ${f.jumlah_trade} / ${f.jumlah_order} |`, `| PF / win rate | ${f.profit_factor == null ? '–' : f.profit_factor.toFixed(2)} / ${P(f.win_rate, 1)} |`,
    `| Porsi biaya | ${P(f.porsi_biaya, 1)} |`, `| B&H BTC/IDR (return / MDD) | ${P(f.bh_btc_return)} / ${P(f.bh_btc_mdd)} |`,
    `| Uptime | ${P(f.uptime, 1)} (${f.candle_tepat_waktu}/${f.candle_diharapkan}) |`, `| Telat panggilan median / maks | ${f.telat_median_detik == null ? '–' : Math.round(f.telat_median_detik / 60) + ' mnt'} / ${f.telat_maks_detik == null ? '–' : Math.round(f.telat_maks_detik / 60) + ' mnt'} |`,
    `| Panggilan: eksekusi / duplikat / konflik / gagal | ${f.panggilan.eksekusi} / ${f.panggilan.duplikat} / ${f.panggilan.konflik} / ${f.panggilan.gagal} |`,
    `| Error API (percobaan gagal) | ${f.error_api_log} |`, `| Kill switch: perubahan / putaran aktif | ${f.kill_switch_perubahan} / ${f.kill_switch_putaran_aktif_log} |`,
    `| Fill terverifikasi ulang dari order book di log | ${f.verifikasi_fill.cocok}/${f.verifikasi_fill.total} |`, '');
  if (g) L.push('## Gap backtest vs forward (jendela sama)', '', '| | Forward | Backtest |', '|---|---|---|',
    `| Return | ${P(g.forward_jendela.return_total)} | ${P(g.backtest_jendela.return_total)} |`, `| MDD | ${P(g.forward_jendela.mdd)} | ${P(g.backtest_jendela.mdd)} |`,
    `| Order | ${g.forward_jendela.jumlah_order} | ${g.backtest_jendela.jumlah_order} |`, '',
    `Sinyal cocok candle per candle: **${g.sinyal.cocok}/${g.sinyal.tersedia_di_backtest}** (entry, exit, saklar × pasangan × candle). Candle unduhan ulang vs data backtest: ${g.candle_konsisten.close_beda} beda dari ${g.candle_konsisten.tumpang_tindih} bar.`, '');
  L.push('## Backtest 3 tahun', '', `Return ${P(a.return_total, 1)}, CAGR ${P(a.cagr, 1)}, MDD ${P(a.mdd, 1)}, ${a.jumlah_trade} trade, PF ${a.profit_factor.toFixed(2)}, win rate ${P(a.win_rate, 1)}, porsi biaya ${P(a.porsi_biaya, 1)}. B&H BTC: ${P(a.bh_btc_return, 1)} (MDD ${P(a.bh_btc_mdd, 1)}). OOS 1 tahun konfigurasi terpilih: ${P(out.is_oos.terpilih.oos_return, 1)}.`, '');
  L.push('## Spread & slippage: backtest vs seluruh snapshot', '', '| Pasangan | Spread backtest (n) | Spread median semua (n) | Spread maks | Slip jual bt / semua |', '|---|---|---|---|---|',
    ...out.spread_banding.map((s) => `| ${s.pair} | ${P(s.backtest_spread, 4)} (${s.backtest_n}) | ${P(s.semua_spread_median, 4)} (${s.semua_n}) | ${P(s.semua_spread_maks, 3)} | ${P(s.backtest_slip_jual, 4)} / ${P(s.semua_slip_jual, 4)} |`), '');
  fs.writeFileSync(path.join(ROOT, 'laporan/ringkasan_angka.md'), L.join('\n'));
  // refleksi: template docs/REFLEKSI.template.md + angka hasil hitung ulang -> docs/REFLEKSI.md
  const ada = out.spread_banding.find((s) => s.pair === 'ADAIDR');
  const isi = { JAM: g ? g.jendela.jam : 0, FWD_RET: P(f.return_total), FWD_MDD: P(f.mdd), FWD_ORDER: f.jumlah_order, BH_RET: P(f.bh_btc_return), UPTIME: `${P(f.uptime, 1)} (${f.candle_tepat_waktu}/${f.candle_diharapkan})`,
    TELAT: f.telat_median_detik == null ? '–' : Math.round(f.telat_median_detik / 60) + ' menit', ERR: f.error_api_log, SINYAL: g ? `${g.sinyal.cocok}/${g.sinyal.tersedia_di_backtest}` : '–',
    TUMPANG: g ? g.candle_konsisten.tumpang_tindih.toLocaleString('id-ID') : '–', BEDA: g ? g.candle_konsisten.close_beda : '–', GAP: g ? P(g.gap_return) : '–', ADA_BT: P(ada.backtest_spread, 3), ADA_ALL: P(ada.semua_spread_median, 3) };
  const tpl = rd('docs/REFLEKSI.template.md');
  fs.writeFileSync(path.join(ROOT, 'docs/REFLEKSI.md'), `<!-- dibuat otomatis oleh tools/hitung_ulang.mjs dari docs/REFLEKSI.template.md pada ${out.dibuat} -->\n` + tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in isi ? String(isi[k]) : m)));
}
console.log(`pemeriksaan: ${out.pemeriksaan.cocok}/${out.pemeriksaan.total} cocok`);
for (const c of cek.filter((c) => !c.cocok)) console.log('TIDAK COCOK', c);
console.log('forward: log', logs.length, 'order', orders.length, 'fill terverifikasi', B.verifikasi_fill, C ? `sinyal cocok ${C.sinyal.cocok}/${C.sinyal.tersedia_di_backtest}` : '');
if (cek.some((c) => !c.cocok)) process.exitCode = 1;
