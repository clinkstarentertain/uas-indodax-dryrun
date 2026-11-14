// Metrik FORWARD dari state/log mentah (dipakai /api/data dan tools/hitung_ulang.mjs - satu definisi).
// Forward: return total & MDD saja (tanpa CAGR - periode < 1 tahun).
export function maxDrawdown(series, start) {
  let pk = start, mdd = 0;
  for (const v of [start, ...series]) { if (v == null) continue; pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  return mdd;
}
export function tradeStats(trades) {
  const sum = (a, k) => a.reduce((s, t) => s + t[k], 0);
  const w = trades.filter((t) => t.laba_bersih > 0), l = trades.filter((t) => t.laba_bersih <= 0);
  const biaya = sum(trades, 'fee_masuk') + sum(trades, 'fee_keluar') + sum(trades, 'spread_rp') + sum(trades, 'slip_rp');
  const kotor = sum(trades, 'laba_kotor');
  return { jumlah_trade: trades.length, win_rate: trades.length ? w.length / trades.length : null,
    profit_factor: l.length && sum(l, 'laba_bersih') !== 0 ? sum(w, 'laba_bersih') / Math.abs(sum(l, 'laba_bersih')) : null,
    rata_untung_pct: w.length ? sum(w, 'return_pct') / w.length : null, rata_rugi_pct: l.length ? sum(l, 'return_pct') / l.length : null,
    rata_untung_rp: w.length ? sum(w, 'laba_bersih') / w.length : null, rata_rugi_rp: l.length ? sum(l, 'laba_bersih') / l.length : null,
    total_biaya_rp: biaya, laba_kotor_rp: kotor, porsi_biaya: kotor > 0 ? biaya / kotor : null };
}
// history: [{t, candle, ekuitas, bh_btc}], modal: modal awal
export function forwardMetrics({ history, trades, orders, modal, ops, killLog, daily, nowCandle }) {
  const eq = history.map((h) => h.ekuitas);
  const last = eq.length ? eq.at(-1) : modal;
  const bh = history.map((h) => h.bh_btc).filter((v) => v != null);
  const first = history.length ? history[0].candle : null;
  const lastC = nowCandle || (history.length ? history.at(-1).candle : null);
  const expected = first != null && lastC != null ? Math.round((lastC - first) / 3600) + 1 : 0;
  const processed = new Set(history.map((h) => h.candle)).size;
  const fees = orders.reduce((s, o) => s + o.fee, 0);
  return { ekuitas_akhir: last, return_total: last / modal - 1, mdd: maxDrawdown(eq, modal), ...tradeStats(trades),
    jumlah_order: orders.length, total_fee_order_rp: fees,
    bh_btc_return: bh.length ? bh.at(-1) / modal - 1 : null, bh_btc_mdd: bh.length ? maxDrawdown(bh, modal) : null,
    candle_pertama: first, candle_terakhir: lastC, candle_diharapkan: expected, candle_diproses: processed, uptime: expected ? processed / expected : null,
    error_api: ops ? ops.error_api : null, gagal_fatal: ops ? ops.gagal_fatal : null, kill_switch_perubahan: killLog ? killLog.length : 0,
    kill_switch_putaran_aktif: ops ? ops.kill_aktif_putaran : 0, hari_tercatat: daily ? daily.length : 0 };
}
