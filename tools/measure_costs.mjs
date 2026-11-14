// Median setengah-spread & slippage per pasangan dari snapshot order book mentah (data/raw/snapshots/<pair>/*.json),
// untuk order senilai ORDER_IDR (default Rp30 juta = 30% x modal Rp100 juta). Keluaran: data/costs.json
// Pemakaian: node tools/measure_costs.mjs [batas_unix_waktu_freeze]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from '../lib/execution.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER_IDR = 30_000_000;
const until = Number(process.argv[2] || 9e12);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const out = { order_idr: ORDER_IDR, sampai_unix: until, dibuat: new Date().toISOString(), pasangan: {} };
const dir = path.join(ROOT, 'data/raw/snapshots');
for (const pair of fs.readdirSync(dir)) {
  const files = fs.readdirSync(path.join(dir, pair)).filter((f) => f.endsWith('.json') && Number(f.slice(0, -5)) <= until).sort();
  const hs = [], sb = [], ss = [], sp = [];
  for (const f of files) {
    try {
      const m = measure(JSON.parse(fs.readFileSync(path.join(dir, pair, f), 'utf8')), ORDER_IDR);
      if (!m) continue;
      hs.push(m.halfSpread); sp.push(m.spreadPct); if (m.slipBuy != null) sb.push(m.slipBuy); if (m.slipSell != null) ss.push(m.slipSell);
    } catch { /* snapshot rusak dilewati */ }
  }
  out.pasangan[pair.toUpperCase()] = { n_snapshot: hs.length, pertama: files[0], terakhir: files[files.length - 1],
    half_spread: med(hs), spread: med(sp), slip_buy: med(sb), slip_sell: med(ss), spread_maks: hs.length ? Math.max(...sp) : null };
}
fs.writeFileSync(path.join(ROOT, 'data/costs.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.pasangan, null, 1));
