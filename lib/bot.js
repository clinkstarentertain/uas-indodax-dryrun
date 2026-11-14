// Satu putaran bot dry run (dipanggil /api/tick). Memakai fungsi sinyal & aturan order yang SAMA dengan backtest.
// Urutan: waktu server -> state -> candle tertutup -> idempoten per candle -> validasi -> order book -> sinyal -> rencana -> fill di book -> commit state (ifMatch) -> log mentah.
import { PARAMS, UNIVERSE, REGIME_PAIR, decide, validateBars } from './strategy.js';
import { planOrders, wibDay } from './core.js';
import { FEE_TAKER, MIN_ORDER_IDR, parseBook, fillBuy, fillSell } from './execution.js';
import { ConflictError } from './store.js';

export const MAX_SPREAD = 0.02;          // spread > 2% -> tidak boleh entry
export const INITIAL_CAPITAL = 100_000_000;
export const STATE_PATH = 'state/state.json';
export const VERSION = 'v2-donchian-168-72';
const BOOK_LEVELS = 30;                  // level order book yang disimpan di log per sisi

export function newState(now) {
  return { versi: VERSION, params: PARAMS, fee_taker: FEE_TAKER, modal_awal: INITIAL_CAPITAL, mulai: now,
    cash: INITIAL_CAPITAL, positions: {}, lastCandle: null, day: null, dayStartEquity: INITIAL_CAPITAL,
    killSwitch: { on: false, mode: 'blok', sejak: null, alasan: null }, killLog: [],
    history: [], daily: [], trades: [], orders: [],
    ops: { panggilan_diproses: 0, gagal_fatal: 0, error_api: 0, konflik: 0, kill_aktif_putaran: 0 }, bh: null };
}

const mtm = (st, books, lastClose) => {
  let v = st.cash, est = [];
  for (const [p, x] of Object.entries(st.positions)) {
    const bid = books[p] && books[p].bestBid;
    if (bid) v += x.qty * bid; else { v += x.qty * (lastClose[p] || x.avg); est.push(p); }
  }
  return { equity: v, estimasi: est };
};

export async function runTick({ client, store, errors, now = Math.floor(Date.now() / 1000) }) {
  const log = { versi: VERSION, waktu_panggilan: now, waktu_panggilan_iso: new Date(now * 1000).toISOString() };
  let serverTime;
  try { serverTime = await client.serverTime(); } catch (e) { return fatal(store, log, errors, 'server_time: ' + e.message); }
  log.waktu_server = serverTime;

  const got = await store.getJson(STATE_PATH);
  const st = got ? got.data : newState(now);
  const etag = got ? got.etag : null;

  // 1) candle tertutup per pasangan
  const W = PARAMS.warmupBars * 2, bars = {}, validBars = {};
  for (const p of UNIVERSE) {
    try { bars[p] = (await client.closedBars(p, serverTime, W)).slice(-W); }
    catch (e) { bars[p] = []; }
    validBars[p] = validateBars(bars[p], serverTime, PARAMS);
  }
  if (!bars[REGIME_PAIR].length) return fatal(store, log, errors, 'candle BTCIDR tidak bisa diambil', st, etag);
  const T = bars[REGIME_PAIR].at(-1).Time;
  log.candle = T; log.candle_iso = new Date(T * 1000).toISOString();
  // 2) idempoten per candle: candle yang sudah diproses tidak dieksekusi lagi
  if (st.lastCandle != null && T <= st.lastCandle) return { status: 'duplikat', candle: T, lastCandle: st.lastCandle };
  // semua pasangan harus berakhir di candle yang sama dengan BTC
  for (const p of UNIVERSE) if (!validBars[p] && bars[p].at(-1).Time !== T) validBars[p] = `candle terakhir ${bars[p].at(-1).Time} != ${T}`;

  // 3) order book live
  const books = {}, validBook = {}, top = {};
  for (const p of UNIVERSE) {
    try {
      const raw = await client.depth(p); const b = parseBook(raw); books[p] = b;
      top[p] = { best_bid: b.bestBid, best_ask: b.bestAsk, spread_pct: b.spreadPct, bids: b.bids.slice(0, BOOK_LEVELS), asks: b.asks.slice(0, BOOK_LEVELS) };
      validBook[p] = !b.bestBid || !b.bestAsk ? 'order book kosong' : b.spreadPct > MAX_SPREAD ? `spread ${(b.spreadPct * 100).toFixed(2)}% > 2%` : null;
    } catch (e) { books[p] = null; validBook[p] = 'order book gagal diambil'; }
  }
  const valid = {}; for (const p of UNIVERSE) valid[p] = validBars[p] || validBook[p] || null;
  log.validasi = UNIVERSE.map((p) => ({ pair: p, candle: validBars[p], order_book: validBook[p], n_candle: bars[p].length, candle_terakhir: bars[p].length ? bars[p].at(-1).Time : null }));
  const lastClose = Object.fromEntries(UNIVERSE.map((p) => [p, bars[p].length ? bars[p].at(-1).Close : null]));

  // 4) ekuitas (dinilai di best bid) & batas hari WIB (ekuitas harian = panggilan pertama sesudah 00.00 WIB)
  const before = mtm(st, books, lastClose);
  const day = wibDay(now);
  if (day !== st.day) { st.day = day; st.dayStartEquity = before.equity; st.daily.push({ hari: day, ekuitas: before.equity, t: now }); }

  // 5) sinyal (fungsi yang sama dengan backtest) & rencana order
  const dec = decide(bars, new Set(Object.keys(st.positions)), PARAMS);
  const ks = st.killSwitch || { on: false };
  const plan = planOrders(st, dec, before.equity, valid, !!ks.on, PARAMS);
  if (ks.on && ks.mode === 'tutup') for (const p of Object.keys(st.positions)) if (!plan.sells.find((s) => s.pair === p)) plan.sells.push({ pair: p, reason: 'kill switch mode tutup' });
  if (ks.on) st.ops.kill_aktif_putaran += 1;
  log.keputusan = { regime_on: dec.regimeOn, btc_close: dec.btcClose, btc_ema720: dec.btcEma, urutan_beli: dec.buyOrder,
    baris: dec.rows.map((r) => ({ pair: r.pair, valid_fitur: r.valid, close: r.close, hh: r.hh, ll: r.ll, ema200: r.emaSlow, roc: r.roc, tren: r.trend, entry: !!r.entrySignal, exit: !!r.exitSignal, dipegang: !!r.held })) };
  log.kill_switch = ks; log.daily_loss = { ekuitas_awal_hari: st.dayStartEquity, batas: st.dayStartEquity * (1 - PARAMS.dailyLossLimit), tercapai: plan.lossHit };
  log.diblokir = plan.blocked.slice();

  // 6) eksekusi simulasi di order book (beli = ask, jual = bid; bukan mid/close)
  const orders = [];
  for (const s of plan.sells) {
    const b = books[s.pair], pos = st.positions[s.pair];
    if (!b || !b.bestBid) { log.diblokir.push({ pair: s.pair, reason: 'jual tertunda: bid kosong' }); continue; }
    const f = fillSell(b, pos.qty); if (!f) { log.diblokir.push({ pair: s.pair, reason: 'jual gagal: bid tidak cukup' }); continue; }
    const fee = f.notional * FEE_TAKER, mid = b.mid;
    const left = pos.qty - f.qty;
    const share = f.qty / pos.qty;
    st.cash += f.notional - fee;
    const o = { t: now, candle: T, pair: s.pair, sisi: 'JUAL', alasan: s.reason, qty: f.qty, best_bid: b.bestBid, best_ask: b.bestAsk, harga_fill: f.avg, nilai: f.notional, fee,
      spread_rp: f.qty * (mid - b.bestBid), slip_rp: f.qty * (b.bestBid - f.avg), harga_sinyal: lastClose[s.pair], selisih_vs_sinyal: f.avg / lastClose[s.pair] - 1, parsial: f.partial };
    orders.push(o);
    const costPart = pos.cost * share, feeIn = pos.fee * share;
    const tr = { pair: s.pair, masuk: pos.time, harga_masuk: pos.avg, keluar: now, harga_keluar: f.avg, qty: f.qty, biaya_masuk: costPart, fee_masuk: feeIn, nilai_keluar: f.notional, fee_keluar: fee,
      spread_rp: pos.spread_rp * share + o.spread_rp, slip_rp: pos.slip_rp * share + o.slip_rp, laba_bersih: f.notional - fee - costPart - feeIn, alasan: s.reason };
    tr.laba_kotor = tr.laba_bersih + tr.fee_masuk + tr.fee_keluar + tr.spread_rp + tr.slip_rp;
    tr.return_pct = tr.laba_bersih / (costPart + feeIn) * 100;
    st.trades.push(tr);
    if (left > 1e-9) { Object.assign(pos, { qty: left, cost: pos.cost - costPart, fee: pos.fee - feeIn, spread_rp: pos.spread_rp * (1 - share), slip_rp: pos.slip_rp * (1 - share) }); }
    else delete st.positions[s.pair];
  }
  for (const bq of plan.buys) {
    const b = books[bq.pair];
    const idr = Math.min(bq.targetIdr, st.cash / (1 + FEE_TAKER));
    if (idr < MIN_ORDER_IDR) { log.diblokir.push({ pair: bq.pair, reason: `nilai order Rp${Math.round(idr)} < minimum Rp${MIN_ORDER_IDR}` }); continue; }
    const f = fillBuy(b, idr); if (!f || f.notional < MIN_ORDER_IDR) { log.diblokir.push({ pair: bq.pair, reason: 'beli gagal: ask tidak cukup' }); continue; }
    const fee = f.notional * FEE_TAKER, mid = b.mid;
    st.cash -= f.notional + fee;
    const o = { t: now, candle: T, pair: bq.pair, sisi: 'BELI', alasan: 'breakout > close tertinggi N jam', qty: f.qty, best_bid: b.bestBid, best_ask: b.bestAsk, harga_fill: f.avg, nilai: f.notional, fee,
      spread_rp: f.qty * (b.bestAsk - mid), slip_rp: f.qty * (f.avg - b.bestAsk), harga_sinyal: lastClose[bq.pair], selisih_vs_sinyal: f.avg / lastClose[bq.pair] - 1, parsial: f.partial };
    orders.push(o);
    st.positions[bq.pair] = { qty: f.qty, avg: f.avg, cost: f.notional, fee, time: now, candle: T, spread_rp: o.spread_rp, slip_rp: o.slip_rp };
  }
  st.orders.push(...orders);
  log.order = orders;

  // 7) ekuitas sesudah, benchmark buy & hold BTC (masuk di best ask panggilan pertama, dinilai di best bid)
  const after = mtm(st, books, lastClose);
  const bb = books[REGIME_PAIR];
  if (!st.bh && bb && bb.bestAsk) st.bh = { t: now, ask: bb.bestAsk, qty: INITIAL_CAPITAL / (1 + FEE_TAKER) / bb.bestAsk };
  const bhVal = st.bh && bb && bb.bestBid ? st.bh.qty * bb.bestBid : null;
  st.history.push({ t: now, candle: T, ekuitas: after.equity, kas: st.cash, n_posisi: Object.keys(st.positions).length, btc_bid: bb ? bb.bestBid : null, bh_btc: bhVal, n_order: orders.length, n_error_api: errors.length });
  st.lastCandle = T;
  st.ops.panggilan_diproses += 1; st.ops.error_api += errors.length;
  log.ekuitas = { sebelum: before.equity, sesudah: after.equity, kas: st.cash, estimasi_tanpa_bid: after.estimasi, posisi: st.positions, bh_btc: bhVal };
  log.order_book = top; log.error_api = errors;

  // 8) commit: state dulu dengan ifMatch (dua panggilan bersamaan -> hanya satu yang menang), lalu log mentah
  try { await store.putJson(STATE_PATH, st, etag ? { ifMatch: etag } : { noOverwrite: true }); }
  catch (e) { if (e instanceof ConflictError) return { status: 'konflik', candle: T }; throw e; }
  try { await store.putJson(`logs/${T}.json`, log, { noOverwrite: true }); } catch (e) { if (!(e instanceof ConflictError)) throw e; }
  return { status: 'ok', candle: T, ekuitas: after.equity, order: orders.length, diblokir: log.diblokir.length, error_api: errors.length };
}

async function fatal(store, log, errors, msg, st, etag) {
  log.status = 'gagal'; log.error = msg; log.error_api = errors;
  try { await store.putJson(`logs/gagal-${log.waktu_panggilan}.json`, log, { noOverwrite: true }); } catch { /* dicatat di respons */ }
  if (st) { st.ops.gagal_fatal += 1; st.ops.error_api += errors.length; try { await store.putJson(STATE_PATH, st, etag ? { ifMatch: etag } : { noOverwrite: true }); } catch { /* abaikan */ } }
  return { status: 'gagal', error: msg, error_api: errors.length };
}
