// /api/control  - KILL SWITCH tanpa redeploy. GET = status; POST {"on":true|false,"mode":"blok"|"tutup","alasan":"..."}.
// Wajib Authorization: Bearer CRON_SECRET. Setiap perubahan dicatat di state.killLog (+ waktu, mode, alasan).
import { authorized, json } from '../lib/auth.js';
import { getStore, ConflictError } from '../lib/store.js';
import { STATE_PATH, newState } from '../lib/bot.js';

export async function GET(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const got = await (await getStore()).getJson(STATE_PATH);
  return json({ killSwitch: got ? got.data.killSwitch : null, killLog: got ? got.data.killLog : [] });
}
export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  let body = {}; try { body = await request.json(); } catch { return json({ error: 'body JSON wajib' }, 400); }
  if (typeof body.on !== 'boolean') return json({ error: 'field "on" (boolean) wajib' }, 400);
  const mode = body.mode === 'tutup' ? 'tutup' : 'blok';
  const store = await getStore(); const now = Math.floor(Date.now() / 1000);
  for (let a = 0; a < 3; a++) {
    const got = await store.getJson(STATE_PATH);
    const st = got ? got.data : newState(now);
    st.killSwitch = { on: body.on, mode, sejak: now, alasan: String(body.alasan || '').slice(0, 200) };
    st.killLog.push({ t: now, iso: new Date(now * 1000).toISOString(), on: body.on, mode, alasan: st.killSwitch.alasan });
    try { await store.putJson(STATE_PATH, st, got ? { ifMatch: got.etag } : { noOverwrite: true }); return json({ ok: true, killSwitch: st.killSwitch }); }
    catch (e) { if (!(e instanceof ConflictError)) throw e; }
  }
  return json({ error: 'konflik state, coba lagi' }, 409);
}
