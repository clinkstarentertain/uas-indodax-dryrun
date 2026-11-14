// Aturan order & risk management bersama (bot dan backtest). Murni: tidak memanggil jaringan.
import { PARAMS } from './strategy.js';

export const WIB_OFFSET = 7 * 3600;
export const wibDay = (unixSec) => new Date((unixSec + WIB_OFFSET) * 1000).toISOString().slice(0, 10);

// rencana order dari keputusan sinyal.
// state: {cash, positions:{pair:{qty,...}}, dayStartEquity}; equity = ekuitas saat ini (posisi dinilai di best bid / estimasinya)
// valid: {pair: null | alasan tidak valid}; killSwitch: bool
export function planOrders(state, decision, equity, valid, killSwitch, p = PARAMS) {
  const sells = [], buys = [], blocked = [];
  for (const r of decision.rows) {
    if (state.positions[r.pair] && r.valid && r.exitSignal) sells.push({ pair: r.pair, reason: decision.regimeOn ? 'close < close terendah M jam' : 'saklar BTC OFF (BTC < EMA720)' });
  }
  const lossHit = state.dayStartEquity > 0 && equity < state.dayStartEquity * (1 - p.dailyLossLimit);
  const nAfter = Object.keys(state.positions).length - sells.length;
  let free = p.maxPositions - nAfter;
  for (const pair of decision.buyOrder) {
    if (killSwitch) { blocked.push({ pair, reason: 'kill switch aktif' }); continue; }
    if (lossHit) { blocked.push({ pair, reason: 'daily loss limit tercapai' }); continue; }
    if (valid[pair]) { blocked.push({ pair, reason: `data tidak valid: ${valid[pair]}` }); continue; }
    if (free <= 0) { blocked.push({ pair, reason: 'slot penuh' }); continue; }
    buys.push({ pair, targetIdr: equity * p.maxPositionFrac });
    free -= 1;
  }
  return { sells, buys, blocked, lossHit };
}
