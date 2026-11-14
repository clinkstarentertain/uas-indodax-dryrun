// FUNGSI SINYAL TUNGGAL - dipakai backtest (backtest/run.mjs) DAN bot Vercel (api/tick.js). Jangan diduplikasi.
// Strategi "Momentum Breakout Kripto 1 Jam" (versi kripto dari ide UTS Meta-Momentum: hanya pegang yang sedang naik + saklar risiko pasar).
// v1 (EMA cepat/lambat + ROC) DITOLAK di in-sample (PF <= 1, churn); v2 = breakout Donchian lambat (lihat docs/STRATEGI.md).
// Input: bars per pasangan = array candle 1 jam TERTUTUP {Time,Open,High,Low,Close,Volume} urut naik, berakhir di candle keputusan.
// Output: keputusan untuk dieksekusi di harga order book SESUDAH candle itu tertutup (bot) / open candle berikutnya + biaya (backtest).

export const PARAMS = Object.freeze({
  timeframe: '60',          // menit
  donchianIn: 168,          // jam: masuk bila close > close tertinggi N jam sebelumnya
  donchianOut: 72,          // jam: keluar bila close < close terendah M jam sebelumnya
  emaSlow: 200,             // jam: filter tren, close > EMA200
  btcRegimeEma: 720,        // saklar pasar: BTC close > EMA 720 jam (+-30 hari)
  maxPositions: 3,
  maxPositionFrac: 0.30,    // ukuran maksimum per posisi = 30% ekuitas
  dailyLossLimit: 0.03,     // berhenti buka posisi bila ekuitas turun 3% dari ekuitas awal hari (00.00 WIB)
  minOrderIdr: 25000,
  warmupBars: 800,          // jendela indikator = 2 x warmupBars = 1.600 candle (bot & backtest sama)
});

export const UNIVERSE = Object.freeze(['BTCIDR', 'ETHIDR', 'XRPIDR', 'DOGEIDR', 'SOLIDR', 'ADAIDR']);
export const REGIME_PAIR = 'BTCIDR';

export function ema(values, n) {
  const k = 2 / (n + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

// indikator satu pasangan pada candle terakhir di 'bars'
export function features(bars, p = PARAMS) {
  if (!bars || bars.length < p.warmupBars) return null;
  const w = bars.slice(-p.warmupBars * 2);   // jendela tetap: hasil sama di backtest & live
  const c = w.map((b) => Number(b.Close));
  const last = c[c.length - 1];
  const prevIn = c.slice(-1 - p.donchianIn, -1), prevOut = c.slice(-1 - p.donchianOut, -1);
  return {
    time: Number(w[w.length - 1].Time),
    close: last,
    hh: Math.max(...prevIn),
    ll: Math.min(...prevOut),
    emaSlow: ema(c, p.emaSlow),
    roc: last / c[c.length - 1 - p.donchianIn] - 1,
  };
}

// keputusan untuk semua pasangan pada candle T.
// held = Set pasangan yang sedang dipegang. Return {regimeOn, rows:[{pair,...,entrySignal,exitSignal}], buyOrder:[pair urut prioritas]}
export function decide(barsByPair, held, p = PARAMS) {
  const btc = features(barsByPair[REGIME_PAIR], { ...p, emaSlow: p.btcRegimeEma });
  const regimeOn = !!btc && btc.close > btc.emaSlow;
  const rows = [];
  for (const pair of UNIVERSE) {
    const f = features(barsByPair[pair], p);
    if (!f) { rows.push({ pair, valid: false }); continue; }
    const trend = f.close > f.emaSlow;
    const entrySignal = regimeOn && trend && f.close > f.hh;
    const exitSignal = !regimeOn || f.close < f.ll;
    rows.push({ pair, valid: true, ...f, trend, entrySignal, exitSignal, held: held.has(pair) });
  }
  const buyOrder = rows.filter((r) => r.valid && r.entrySignal && !r.held).sort((a, b) => b.roc - a.roc || a.pair.localeCompare(b.pair)).map((r) => r.pair);
  return { regimeOn, btcClose: btc ? btc.close : null, btcEma: btc ? btc.emaSlow : null, rows, buyOrder };
}

// validasi data candle (aturan soal): umur candle terakhir <= 2x timeframe, tanpa candle hilang di jendela, harga & volume > 0
export function validateBars(bars, serverTime, p = PARAMS) {
  const tf = Number(p.timeframe) * 60;
  const w = (bars || []).slice(-p.warmupBars * 2);
  if (w.length < p.warmupBars) return 'jendela candle kurang';
  const last = w[w.length - 1];
  if (serverTime - (Number(last.Time) + tf) > 2 * tf) return 'candle tertutup terakhir lebih tua dari 2x timeframe';
  for (let i = 1; i < w.length; i++) if (Number(w[i].Time) - Number(w[i - 1].Time) !== tf) return `candle hilang sebelum ${w[i].Time}`;
  for (const b of w) if (!(Number(b.Close) > 0) || !(Number(b.Open) > 0)) return `harga nol di ${b.Time}`;
  if (!(Number(last.Volume) > 0)) return `volume nol di candle terakhir ${last.Time}`;
  return null;
}
