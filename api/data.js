// GET /api/data  - data publik dashboard (tanpa secret). Semua angka dihitung dari state di Blob saat diminta.
import { json } from '../lib/auth.js';
import { getStore } from '../lib/store.js';
import { STATE_PATH } from '../lib/bot.js';
import { forwardMetrics } from '../lib/metrics.js';

export async function GET() {
  const store = await getStore();
  const got = await store.getJson(STATE_PATH);
  if (!got) return json({ status: 'belum ada state' }, 200, { 'cache-control': 's-maxage=60' });
  const s = got.data;
  const m = forwardMetrics({ history: s.history, trades: s.trades, orders: s.orders, modal: s.modal_awal, ops: s.ops, killLog: s.killLog, daily: s.daily,
    nowCandle: Math.floor(Date.now() / 1000 / 3600) * 3600 - 3600 });   // candle tertutup terakhir saat ini (untuk uptime)
  let last = null;
  try { const r = s.lastCandle != null ? await store.getJson(`logs/${s.lastCandle}.json`) : null; if (r) last = { candle: r.data.candle, waktu: r.data.waktu_panggilan, ...r.data.keputusan, validasi: r.data.validasi, diblokir: r.data.diblokir, daily_loss: r.data.daily_loss }; } catch { /* log terakhir opsional */ }
  return json({ dibuat: new Date().toISOString(), versi: s.versi, params: s.params, fee_taker: s.fee_taker, mulai: s.mulai, modal_awal: s.modal_awal,
    metrik: m, posisi: s.positions, kas: s.cash, kill_switch: s.killSwitch, kill_log: s.killLog, history: s.history, harian: s.daily,
    trades: s.trades, orders: s.orders, ops: s.ops, keputusan_terakhir: last, hari_ini: { hari: s.day, ekuitas_awal: s.dayStartEquity } }, 200, { 'cache-control': 'public, s-maxage=120, stale-while-revalidate=60' });
}
