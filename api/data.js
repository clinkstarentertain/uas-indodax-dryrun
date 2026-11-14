// GET /api/data  - data publik dashboard (tanpa secret). Semua angka dihitung dari state di Blob saat diminta.
import { json } from '../lib/auth.js';
import { getStore } from '../lib/store.js';
import { STATE_PATH } from '../lib/bot.js';
import { forwardMetrics } from '../lib/metrics.js';

export async function GET() {
  const got = await (await getStore()).getJson(STATE_PATH);
  if (!got) return json({ status: 'belum ada state' }, 200, { 'cache-control': 's-maxage=60' });
  const s = got.data;
  const m = forwardMetrics({ history: s.history, trades: s.trades, orders: s.orders, modal: s.modal_awal, ops: s.ops, killLog: s.killLog, daily: s.daily });
  return json({ dibuat: new Date().toISOString(), versi: s.versi, params: s.params, fee_taker: s.fee_taker, mulai: s.mulai, modal_awal: s.modal_awal,
    metrik: m, posisi: s.positions, kas: s.cash, kill_switch: s.killSwitch, kill_log: s.killLog, history: s.history, harian: s.daily,
    trades: s.trades, orders: s.orders, ops: s.ops }, 200, { 'cache-control': 'public, s-maxage=120, stale-while-revalidate=60' });
}
