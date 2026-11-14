// Tarik log MENTAH forward test dari Vercel Blob (private) ke logs_forward/. Token dari env/.env.local, tidak dicetak.
// Pemakaian: node tools/tarik_log.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { blobStore } from '../lib/store.js';
const store = await blobStore();
const out = path.join(ROOT, 'logs_forward'); fs.mkdirSync(path.join(out, 'logs'), { recursive: true });
const names = await store.list('logs/');
let baru = 0;
for (const n of names) {
  const f = path.join(out, n); if (fs.existsSync(f)) continue;
  const r = await store.getJson(n); fs.writeFileSync(f, JSON.stringify(r.data, null, 1)); baru++;
}
const st = await store.getJson('state/state.json');
if (st) fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(st.data, null, 1));
console.log(`log di Blob: ${names.length}, baru diunduh: ${baru}, state: ${st ? 'ok' : 'tidak ada'}`);
