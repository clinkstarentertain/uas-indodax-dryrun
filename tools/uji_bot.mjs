// Uji otomatis bot (lib/bot.js) dengan candle historis ASLI + order book snapshot ASLI (diskalakan ke harga candle).
// Membuktikan: entry/exit sama dengan backtest, fill di ask/bid, idempoten, kill switch, daily loss limit, validasi data, konkurensi.
// Pemakaian: node tools/uji_bot.mjs   -> artifacts/uji_bot.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCandles } from '../backtest/run.mjs';
import { runTick, STATE_PATH, newState } from '../lib/bot.js';
import { dirStore } from '../lib/store.js';
import { PARAMS, UNIVERSE } from '../lib/strategy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candles = loadCandles();
const snapDir = path.join(ROOT, 'data/raw/snapshots');
const snap = {};
for (const p of UNIVERSE) { const d = path.join(snapDir, p.toLowerCase()); const f = fs.readdirSync(d).sort()[0]; snap[p] = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); }
const W = PARAMS.warmupBars * 2;

function mockClient(T, { serverTime = T + 3600 + 420, mutateBars, mutateBook } = {}) {
  return {
    serverTime: async () => serverTime,
    async closedBars(sym) {
      const a = candles[sym]; const i = a.findIndex((b) => b.Time === T);
      let bars = a.slice(i + 1 - W, i + 1).map((b) => ({ ...b }));
      if (mutateBars) bars = mutateBars(sym, bars);
      return bars;
    },
    async depth(pair) {
      const bar = candles[pair].find((b) => b.Time === T + 3600) || candles[pair].find((b) => b.Time === T);
      const s = snap[pair];
      const mid = (Number(s.buy[0][0]) + Number(s.sell[0][0])) / 2, k = bar.Open / mid;
      let d = { buy: s.buy.map(([p, q]) => [String(Number(p) * k), String(Number(q) / k)]), sell: s.sell.map(([p, q]) => [String(Number(p) * k), String(Number(q) / k)]) };
      if (mutateBook) d = mutateBook(pair, d);
      return d;
    },
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ujibot-'));
const run = (T, store, opt) => { const errors = []; return runTick({ client: mockClient(T, opt), store, errors, now: (opt && opt.now) || T + 3600 + 420 }); };
const readLog = (store, T) => store.getJson(`logs/${T}.json`).then((r) => r && r.data);

// kasus nyata dari backtest final: order BELI pertama & JUAL pasangannya
const ords = fs.readFileSync(path.join(ROOT, 'artifacts/backtest/orders.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => { const [t, pair, sisi] = l.split(','); return { t: +t, pair, sisi }; });
const buy = ords.find((o) => o.sisi === 'BELI'); const sell = ords.find((o) => o.sisi === 'JUAL' && o.pair === buy.pair && o.t > buy.t);
const Tb = buy.t - 3600 - 420, Ts = sell.t - 3600 - 420;
const hasil = []; const cek = (nama, ok, detail) => { hasil.push({ nama, lulus: !!ok, detail }); console.log(ok ? 'LULUS' : 'GAGAL', nama, detail ? JSON.stringify(detail).slice(0, 200) : ''); };

// 1-3 entry, duplikat, exit
{
  const st = dirStore(tmp());
  const r1 = await run(Tb, st); const L = await readLog(st, Tb);
  const o = L.order.find((x) => x.pair === buy.pair && x.sisi === 'BELI');
  cek('entry sama dengan backtest (pasangan & candle)', r1.status === 'ok' && o, { pair: buy.pair, candle: Tb, order: L.order.map((x) => x.pair + ':' + x.sisi) });
  cek('fill beli di sisi ask (harga rata-rata >= best ask, bukan mid/close)', o && o.harga_fill >= o.best_ask && o.best_ask > o.best_bid, o && { fill: o.harga_fill, ask: o.best_ask, bid: o.best_bid });
  cek('ukuran posisi <= 30% ekuitas', o && o.nilai <= 0.30 * 100_000_000 + 1, o && { nilai: o.nilai });
  const r2 = await run(Tb, st);
  cek('idempoten: candle sama dipanggil lagi -> tidak dieksekusi', r2.status === 'duplikat', r2);
  // isi state agar posisi tetap dipegang sampai candle jual (lompat langsung ke candle jual)
  const r3 = await run(Ts, st); const L3 = await readLog(st, Ts);
  const s3 = L3.order.find((x) => x.pair === buy.pair && x.sisi === 'JUAL');
  cek('exit sama dengan backtest', r3.status === 'ok' && s3, { candle: Ts, order: L3.order.map((x) => x.pair + ':' + x.sisi) });
  cek('fill jual di sisi bid (harga rata-rata <= best bid)', s3 && s3.harga_fill <= s3.best_bid, s3 && { fill: s3.harga_fill, bid: s3.best_bid });
  const S = (await st.getJson(STATE_PATH)).data;
  cek('trade tertutup tercatat dengan fee + spread + slippage', S.trades.length >= 1 && S.trades[0].fee_masuk > 0 && S.trades[0].fee_keluar > 0, S.trades[0]);
}
// 4 kill switch tanpa redeploy (flag di state)
{
  const st = dirStore(tmp()); const s0 = newState(Tb); s0.killSwitch = { on: true, mode: 'blok', sejak: Tb, alasan: 'uji' }; s0.killLog.push({ t: Tb, on: true });
  await st.putJson(STATE_PATH, s0, { noOverwrite: true });
  await run(Tb, st); const L = await readLog(st, Tb);
  cek('kill switch memblokir entry & tercatat', L.order.length === 0 && L.diblokir.some((b) => b.reason === 'kill switch aktif') && L.kill_switch.on, L.diblokir);
}
// 5 daily loss limit
{
  const st = dirStore(tmp()); const s0 = newState(Tb); s0.day = new Date((Tb + 3600 + 420 + 7 * 3600) * 1000).toISOString().slice(0, 10); s0.dayStartEquity = 110_000_000;
  await st.putJson(STATE_PATH, s0, { noOverwrite: true });
  await run(Tb, st); const L = await readLog(st, Tb);
  cek('daily loss limit (hari WIB) memblokir entry', L.order.length === 0 && L.diblokir.some((b) => b.reason === 'daily loss limit tercapai'), L.daily_loss);
}
// 6-9 validasi data
const valCase = async (nama, opt, re) => {
  const st = dirStore(tmp()); const r = await run(Tb, st, opt); const L = await readLog(st, Tb);
  const bl = L ? L.diblokir.filter((b) => b.pair === buy.pair) : [];
  cek(nama, r.status === 'ok' && !L.order.some((o) => o.pair === buy.pair) && bl.some((b) => re.test(b.reason)), bl);
};
await valCase('candle hilang -> tidak entry', { mutateBars: (s, b) => (s === buy.pair ? [...b.slice(0, 1000), ...b.slice(1001)] : b) }, /candle hilang/);
await valCase('harga nol -> tidak entry', { mutateBars: (s, b) => (s === buy.pair ? b.map((x, i) => (i === 900 ? { ...x, Close: 0 } : x)) : b) }, /harga nol/);
await valCase('volume nol candle terakhir -> tidak entry', { mutateBars: (s, b) => (s === buy.pair ? b.map((x, i) => (i === b.length - 1 ? { ...x, Volume: 0 } : x)) : b) }, /volume nol/);
await valCase('spread > 2% -> tidak entry', { mutateBook: (p, d) => (p === buy.pair ? { buy: d.buy.map(([x, q]) => [String(Number(x) * 0.97), q]), sell: d.sell } : d) }, /spread/);
await valCase('order book kosong -> tidak entry', { mutateBook: (p, d) => (p === buy.pair ? { buy: [], sell: d.sell } : d) }, /kosong/);
{
  const st = dirStore(tmp()); const r = await run(Tb, st, { serverTime: Tb + 3600 + 3 * 3600 }); const L = await readLog(st, Tb);
  cek('candle basi (> 2x timeframe) -> tidak entry', r.status === 'ok' && L.order.length === 0 && L.diblokir.some((b) => /lebih tua/.test(b.reason)), L.diblokir.slice(0, 2));
}
// 10 konkurensi: dua panggilan serentak di candle sama -> hanya satu yang tereksekusi
{
  const st = dirStore(tmp()); await st.putJson(STATE_PATH, newState(Tb), { noOverwrite: true });
  const rs = await Promise.all([run(Tb, st), run(Tb, st)]);
  const S = (await st.getJson(STATE_PATH)).data;
  cek('dua panggilan serentak -> satu ok, satu ditolak', rs.filter((r) => r.status === 'ok').length === 1 && S.history.length === 1, rs.map((r) => r.status));
}
// 11 sinyal bot == sinyal backtest (signals.csv) di candle entry
{
  const sig = fs.readFileSync(path.join(ROOT, 'artifacts/backtest/signals.csv'), 'utf8').trim().split(/\r?\n/);
  const k = sig[0].split(','); const rows = sig.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [k[i], v]))).filter((r) => +r.time === Tb);
  const st = dirStore(tmp()); await run(Tb, st); const L = await readLog(st, Tb);
  const beda = rows.filter((r) => { const b = L.keputusan.baris.find((x) => x.pair === r.pair); return (+r.entry === 1) !== b.entry || (+r.exit === 1) !== b.exit; });
  cek('sinyal bot = sinyal backtest di candle yang sama (6 pasangan)', rows.length === 6 && beda.length === 0, { n: rows.length, beda });
}
fs.writeFileSync(path.join(ROOT, 'artifacts/uji_bot.json'), JSON.stringify({ dijalankan: new Date().toISOString(), lulus: hasil.filter((h) => h.lulus).length, total: hasil.length, hasil }, null, 1));
console.log(`${hasil.filter((h) => h.lulus).length}/${hasil.length} lulus`);
if (hasil.some((h) => !h.lulus)) process.exit(1);
