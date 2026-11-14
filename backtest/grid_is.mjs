// Pemilihan parameter HANYA di in-sample (2023-11-14 s.d. 2025-11-14). Grid kecil 3x3 (donchianIn x donchianOut); parameter lain tetap.
// Kriteria (ditulis sebelum menjalankan): Calmar IS tertinggi di antara konfigurasi dengan >= 30 trade; OOS hanya dilaporkan.
// Pemakaian: node backtest/grid_is.mjs  -> artifacts/grid_is_v2.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS } from '../lib/strategy.js';
import { loadCandles, runBacktest, metrics } from './run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candles = loadCandles();
const costs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/costs.json'), 'utf8')).pasangan;
const IS = ['2023-11-14', '2025-11-14'], OOS = ['2025-11-14', '2026-11-14'];
const rows = [];
for (const donchianIn of [72, 168, 336]) for (const donchianOut of [24, 72, 168]) {
  const params = { ...PARAMS, donchianIn, donchianOut };
  const mi = metrics(runBacktest({ candles, costs, start: IS[0], end: IS[1], params }), candles, IS[0], IS[1], costs);
  const mo = metrics(runBacktest({ candles, costs, start: OOS[0], end: OOS[1], params }), candles, OOS[0], OOS[1], costs);
  rows.push({ donchianIn, donchianOut, is_cagr: mi.cagr, is_mdd: mi.mdd, is_calmar: mi.cagr / Math.abs(mi.mdd), is_trade: mi.jumlah_trade, is_pf: mi.profit_factor,
    oos_return: mo.return_total, oos_mdd: mo.mdd, oos_trade: mo.jumlah_trade });
  console.log(rows.at(-1));
}
const ok = rows.filter((r) => r.is_trade >= 30).sort((a, b) => b.is_calmar - a.is_calmar);
fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/grid_is_v2.json'), JSON.stringify({ kriteria: 'Calmar IS tertinggi, >= 30 trade IS', IS, OOS, terpilih: ok[0], semua: rows }, null, 1));
console.log('TERPILIH', ok[0]);
