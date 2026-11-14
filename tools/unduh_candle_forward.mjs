// Unduh candle 1 jam ASLI untuk periode forward (+ jendela pemanasan) -> data/raw/candles_forward/<SYM>_<server_time>.json
// Dipakai hitung_ulang untuk mencocokkan sinyal backtest vs forward candle per candle. Berurutan, <= 3 req/detik.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { makeClient } from '../lib/indodax.js';
import { UNIVERSE } from '../lib/strategy.js';
const errors = [], c = makeClient(errors);
const st = await c.serverTime();
const n = Number(process.argv[2] || 2400);
const dir = path.join(ROOT, 'data/raw/candles_forward'); fs.mkdirSync(dir, { recursive: true });
for (const p of UNIVERSE) {
  const bars = await c.closedBars(p, st, n); fs.writeFileSync(path.join(dir, `${p}_${st}.json`), JSON.stringify(bars)); console.log(p, bars.length);
  // simpan hanya unduhan terbaru per pasangan di folder kerja (yang lama tetap ada di riwayat git) agar paket tetap kecil
  for (const f of fs.readdirSync(dir)) if (f.startsWith(p + '_') && f !== `${p}_${st}.json`) fs.unlinkSync(path.join(dir, f));
}
console.log('error api', errors.length);
