// Klien API PUBLIK Indodax (tanpa API key). Berurutan, jeda >= 350 ms (<= 3 request/detik), timeout + batas retry.
const BASE = 'https://indodax.com';
export const RETRY_MAX = 3;          // percobaan per request
export const TIMEOUT_MS = 8000;
const GAP_MS = 350;
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeClient(errors) {
  async function getJson(pathq) {
    let lastErr;
    for (let a = 1; a <= RETRY_MAX; a++) {
      const wait = last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const r = await fetch(BASE + pathq, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'uas-algotrading-dryrun/1.0' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
        errors.push({ t: Math.floor(Date.now() / 1000), url: pathq, percobaan: a, error: String(e && e.message || e) });
        await sleep(400 * a);
      }
    }
    throw new Error(`gagal sesudah ${RETRY_MAX} percobaan: ${pathq}: ${lastErr && lastErr.message}`);
  }
  return {
    serverTime: async () => Math.floor(Number((await getJson('/api/server_time')).server_time) / 1000),
    depth: (pair) => getJson(`/api/depth/${pair.toLowerCase()}`),
    // candle 1 jam TERTUTUP saja, minimal n bar, dipaging mundur (satu request <= 649 bar)
    async closedBars(sym, serverTime, n) {
      const tf = 3600, byT = new Map();
      let to = serverTime;
      for (let page = 0; page < 6 && byT.size < n + 1; page++) {
        const arr = await getJson(`/tradingview/history_v2?symbol=${sym}&tf=60&from=${to - 649 * tf}&to=${to}`);
        if (!Array.isArray(arr) || !arr.length) break;
        let minT = Infinity;
        for (const b of arr) { const T = Number(b.Time); byT.set(T, { Time: T, Open: +b.Open, High: +b.High, Low: +b.Low, Close: +b.Close, Volume: +b.Volume }); minT = Math.min(minT, T); }
        to = minT - 1;
      }
      // buang candle yang belum tertutup (Time + 1 jam > waktu server)
      return [...byT.values()].filter((b) => b.Time + tf <= serverTime).sort((a, b) => a.Time - b.Time);
    },
  };
}
