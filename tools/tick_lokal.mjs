// Uji satu putaran bot di laptop dengan API Indodax SUNGGUHAN dan store folder (bukan Blob). Pemakaian: STORE_DIR=tmp/store node tools/tick_lokal.mjs
import { makeClient } from '../lib/indodax.js';
import { getStore } from '../lib/store.js';
import { runTick } from '../lib/bot.js';
const errors = [];
const t0 = Date.now();
const out = await runTick({ client: makeClient(errors), store: await getStore(), errors });
console.log(JSON.stringify(out), 'detik', (Date.now() - t0) / 1000);
