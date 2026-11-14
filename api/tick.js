// POST/GET /api/tick  - satu putaran bot (dipanggil scheduler eksternal tiap jam menit ke-7). Wajib Authorization: Bearer CRON_SECRET.
import { authorized, json } from '../lib/auth.js';
import { makeClient } from '../lib/indodax.js';
import { getStore } from '../lib/store.js';
import { runTick } from '../lib/bot.js';

async function handle(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const errors = [];
  try {
    const out = await runTick({ client: makeClient(errors), store: await getStore(), errors });
    return json(out, out.status === 'gagal' ? 502 : 200);
  } catch (e) {
    return json({ status: 'error', error: String(e && e.message || e), error_api: errors.length }, 500);
  }
}
export const GET = handle;
export const POST = handle;
