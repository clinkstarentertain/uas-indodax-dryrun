// BACKTEST - memakai lib/strategy.js (decide, validateBars) dan lib/core.js (planOrders) yang SAMA dengan bot Vercel.
// Waktu: keputusan di candle T (tertutup T+3600); bot berjalan ~menit ke-7 sesudahnya -> backtest mengisi di OPEN candle T+1
// x (1 +/- setengah-spread median +/- slippage median dari snapshot) lalu fee taker all-in. Posisi dinilai di estimasi bid.
// Pemakaian: node backtest/run.mjs [mulai] [akhir] [out_dir] [json_override_params]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS, UNIVERSE, REGIME_PAIR, decide, validateBars } from '../lib/strategy.js';
import { planOrders, wibDay } from '../lib/core.js';
import { FEE_TAKER, MIN_ORDER_IDR, floorQty } from '../lib/execution.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOT_DELAY = 7 * 60;

export function loadCandles(tf = '60') {
  const out = {};
  for (const p of UNIVERSE) {
    const lines = fs.readFileSync(path.join(ROOT, 'data/candles', `${p}_${tf}.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
    out[p] = lines.map((l) => { const [Time, Open, High, Low, Close, Volume] = l.split(','); return { Time: +Time, Open: +Open, High: +High, Low: +Low, Close: +Close, Volume: +Volume }; });
  }
  return out;
}

export function runBacktest({ candles, costs, start, end, params = PARAMS, fee = FEE_TAKER, initial = 100_000_000 }) {
  const t0 = Date.parse(start + 'T00:00:00Z') / 1000, t1 = Date.parse(end + 'T00:00:00Z') / 1000;
  const idx = {}; for (const p of UNIVERSE) { idx[p] = new Map(candles[p].map((b, i) => [b.Time, i])); }
  const times = candles[REGIME_PAIR].map((b) => b.Time).filter((t) => t >= t0 - 3600 && t + 3600 < t1);
  const W = params.warmupBars * 2;
  const st = { cash: initial, positions: {}, dayStartEquity: initial, day: null };
  const trades = [], orders = [], equity = [], daily = [], signals = [];
  const c = (p) => costs[p] || { half_spread: 0, slip_buy: 0, slip_sell: 0 };
  for (const T of times) {
    const execT = T + 3600 + BOT_DELAY;
    const next = {}; for (const p of UNIVERSE) { const i = idx[p].get(T + 3600); next[p] = i === undefined ? null : candles[p][i]; }
    const barsBy = {}, valid = {};
    for (const p of UNIVERSE) {
      const i = idx[p].get(T);
      barsBy[p] = i === undefined ? [] : candles[p].slice(Math.max(0, i + 1 - W), i + 1);
      valid[p] = validateBars(barsBy[p], T + 3600 + BOT_DELAY, params);
    }
    const bidOf = (p) => next[p] ? next[p].Open * (1 - c(p).half_spread) : (barsBy[p].length ? barsBy[p][barsBy[p].length - 1].Close * (1 - c(p).half_spread) : 0);
    const eqNow = () => st.cash + Object.entries(st.positions).reduce((s, [p, x]) => s + x.qty * bidOf(p), 0);
    const day = wibDay(execT);
    if (day !== st.day) { st.day = day; st.dayStartEquity = eqNow(); if (T >= t0) daily.push({ hari: day, ekuitas: st.dayStartEquity }); }
    const dec = decide(barsBy, new Set(Object.keys(st.positions)), params);
    for (const r of dec.rows) signals.push({ time: T, pair: r.pair, valid: r.valid, regime: dec.regimeOn ? 1 : 0, entry: r.entrySignal ? 1 : 0, exit: r.exitSignal ? 1 : 0, close: r.close });
    const plan = planOrders(st, dec, eqNow(), valid, false, params);
    if (T < t0) continue;   // pemanasan: sinyal dihitung tetapi tidak berdagang sebelum tanggal mulai
    for (const s of plan.sells) {
      const nb = next[s.pair]; if (!nb) continue;
      const pos = st.positions[s.pair];
      const ref = nb.Open, px = ref * (1 - c(s.pair).half_spread - c(s.pair).slip_sell);
      const gross = pos.qty * px, f = gross * fee;
      st.cash += gross - f;
      const tr = { pair: s.pair, masuk: pos.time, harga_masuk: pos.px, harga_sinyal_masuk: pos.sig, keluar: execT, harga_keluar: px, harga_sinyal_keluar: barsBy[s.pair].at(-1).Close,
        qty: pos.qty, biaya_masuk: pos.cost, fee_masuk: pos.fee, nilai_keluar: gross, fee_keluar: f,
        spread_rp: pos.qty * ref * c(s.pair).half_spread + pos.spread, slip_rp: pos.qty * ref * c(s.pair).slip_sell + pos.slip,
        laba_bersih: gross - f - pos.cost - pos.fee, alasan: s.reason };
      tr.laba_kotor = tr.laba_bersih + tr.fee_keluar + tr.fee_masuk + tr.spread_rp + tr.slip_rp;
      tr.return_pct = tr.laba_bersih / (pos.cost + pos.fee) * 100;
      trades.push(tr); orders.push({ t: execT, pair: s.pair, sisi: 'JUAL', qty: pos.qty, harga_ref: ref, harga_fill: px, fee: f });
      delete st.positions[s.pair];
    }
    for (const b of plan.buys) {
      const nb = next[b.pair]; if (!nb) continue;
      const idr = Math.min(b.targetIdr, st.cash / (1 + fee));
      if (idr < MIN_ORDER_IDR) continue;
      const ref = nb.Open, px = ref * (1 + c(b.pair).half_spread + c(b.pair).slip_buy);
      const qty = floorQty(idr / px); if (qty <= 0) continue;
      const cost = qty * px, f = cost * fee;
      st.cash -= cost + f;
      st.positions[b.pair] = { qty, px, cost, fee: f, time: execT, sig: barsBy[b.pair].at(-1).Close,
        spread: qty * ref * c(b.pair).half_spread, slip: qty * ref * c(b.pair).slip_buy };
      orders.push({ t: execT, pair: b.pair, sisi: 'BELI', qty, harga_ref: ref, harga_fill: px, fee: f });
    }
    equity.push({ t: execT, ekuitas: eqNow(), kas: st.cash, posisi: Object.keys(st.positions).length });
  }
  // posisi terbuka di akhir dinilai di estimasi bid (bukan trade tertutup)
  return { trades, orders, equity, daily, signals, open: st.positions, final: equity.length ? equity.at(-1).ekuitas : initial, initial };
}

export function metrics(res, candles, start, end, costs, fee = FEE_TAKER) {
  const eq = res.equity.map((e) => e.ekuitas);
  let pk = res.initial, mdd = 0; for (const v of [res.initial, ...eq]) { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  const yrs = (Date.parse(end) - Date.parse(start)) / 864e5 / 365.25;
  const tot = res.final / res.initial - 1;
  const w = res.trades.filter((t) => t.laba_bersih > 0), l = res.trades.filter((t) => t.laba_bersih <= 0);
  const sum = (a, k) => a.reduce((s, t) => s + t[k], 0);
  const biaya = sum(res.trades, 'fee_masuk') + sum(res.trades, 'fee_keluar') + sum(res.trades, 'spread_rp') + sum(res.trades, 'slip_rp');
  const kotor = sum(res.trades, 'laba_kotor');
  // buy & hold BTC/IDR periode sama: beli di open pertama (+ spread/slip/fee), nilai di bid terakhir
  const btc = candles.BTCIDR.filter((b) => b.Time >= Date.parse(start) / 1000 && b.Time < Date.parse(end) / 1000);
  const cb = costs.BTCIDR || { half_spread: 0, slip_buy: 0, slip_sell: 0 };
  const bhIn = btc[0].Open * (1 + cb.half_spread + cb.slip_buy), q = res.initial / (1 + fee) / bhIn;
  const bhSeries = btc.map((b) => q * b.Close * (1 - cb.half_spread));
  let pk2 = res.initial, mdd2 = 0; for (const v of [res.initial, ...bhSeries]) { pk2 = Math.max(pk2, v); mdd2 = Math.min(mdd2, v / pk2 - 1); }
  const bhEnd = bhSeries.at(-1) * (1 - fee);
  return { periode: [start, end], tahun: yrs, ekuitas_akhir: res.final, return_total: tot, cagr: (1 + tot) ** (1 / yrs) - 1, mdd,
    jumlah_trade: res.trades.length, win_rate: res.trades.length ? w.length / res.trades.length : null,
    profit_factor: l.length ? sum(w, 'laba_bersih') / Math.abs(sum(l, 'laba_bersih')) : null,
    rata_untung_pct: w.length ? sum(w, 'return_pct') / w.length : null, rata_rugi_pct: l.length ? sum(l, 'return_pct') / l.length : null,
    rata_untung_rp: w.length ? sum(w, 'laba_bersih') / w.length : null, rata_rugi_rp: l.length ? sum(l, 'laba_bersih') / l.length : null,
    total_biaya_rp: biaya, laba_kotor_rp: kotor, porsi_biaya: kotor > 0 ? biaya / kotor : null,
    bh_btc_return: bhEnd / res.initial - 1, bh_btc_cagr: (bhEnd / res.initial) ** (1 / yrs) - 1, bh_btc_mdd: mdd2 };
}

const toCsv = (rows) => { if (!rows.length) return ''; const k = Object.keys(rows[0]); return [k.join(','), ...rows.map((r) => k.map((x) => r[x]).join(','))].join('\n') + '\n'; };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [start = '2023-11-14', end = '2026-11-14', outDir = 'artifacts/backtest', over = '{}'] = process.argv.slice(2);
  const params = { ...PARAMS, ...JSON.parse(over) };
  const candles = loadCandles();
  const costs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/costs.json'), 'utf8')).pasangan;
  const res = runBacktest({ candles, costs, start, end, params });
  const m = metrics(res, candles, start, end, costs);
  const od = path.join(ROOT, outDir); fs.mkdirSync(od, { recursive: true });
  fs.writeFileSync(path.join(od, 'trades.csv'), toCsv(res.trades));
  fs.writeFileSync(path.join(od, 'orders.csv'), toCsv(res.orders));
  fs.writeFileSync(path.join(od, 'equity.csv'), toCsv(res.equity));
  fs.writeFileSync(path.join(od, 'equity_harian.csv'), toCsv(res.daily));
  fs.writeFileSync(path.join(od, 'signals.csv'), toCsv(res.signals.filter((s) => s.time >= Date.parse(start) / 1000 - 3600)));
  fs.writeFileSync(path.join(od, 'metrics.json'), JSON.stringify({ params, metrics: m, posisi_terbuka: res.open, biaya: costs }, null, 1));
  console.log(JSON.stringify(m, null, 1));
}
