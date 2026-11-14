// Eksekusi dry run di order book SUNGGUHAN: beli menghabiskan level ask, jual menghabiskan level bid, harga = rata-rata tertimbang.
// Fill di mid/close dilarang. Dipakai bot (book live) dan pengukuran spread/slippage dari snapshot (untuk backtest).

export const FEE_TAKER = 0.003248;    // all-in taker; lebih mahal dari /api/pairs 0,2% (lihat docs/STRATEGI.md bagian Biaya)
export const FEE_SOURCES = {
  api_pairs: { nilai: 0.002, url: 'https://indodax.com/api/pairs', field: 'trade_fee_percent_taker', diakses: '2026-11-14 17:08 WIB' },
  rincian_biaya: { nilai: 0.003248, url: 'https://financer.id/ulasan/indodax/ (help.indodax.com & indodax.com/market-fee menolak akses otomatis: 403/404/CAPTCHA)', diakses: '2026-11-14 17:20 WIB' },
};
export const MIN_ORDER_IDR = 25000;
export const QTY_DECIMALS = 8;

export const floorQty = (q) => Math.floor(q * 1e8 + 1e-6) / 1e8;

export function parseBook(depth) {
  const lv = (a) => (a || []).map(([p, q]) => [Number(p), Number(q)]).filter(([p, q]) => p > 0 && q > 0);
  const bids = lv(depth && depth.buy).sort((a, b) => b[0] - a[0]);
  const asks = lv(depth && depth.sell).sort((a, b) => a[0] - b[0]);
  const bestBid = bids.length ? bids[0][0] : null, bestAsk = asks.length ? asks[0][0] : null;
  return { bids, asks, bestBid, bestAsk, mid: bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null,
    spreadPct: bestBid && bestAsk ? (bestAsk - bestBid) / ((bestAsk + bestBid) / 2) : null };
}

// beli senilai 'idr' (nominal, sebelum fee) di sisi ask
export function fillBuy(book, idr) {
  let left = idr, qty = 0, cost = 0;
  for (const [p, q] of book.asks) {
    if (left <= 1e-9) break;
    const take = Math.min(q, left / p);
    qty += take; cost += take * p; left -= take * p;
  }
  qty = floorQty(qty);
  if (qty <= 0) return null;
  // hitung ulang biaya dengan kuantitas yang sudah dibulatkan
  let need = qty, notional = 0;
  for (const [p, q] of book.asks) { if (need <= 1e-12) break; const t = Math.min(q, need); notional += t * p; need -= t; }
  if (need > 1e-9) return { partial: true, qty, notional, avg: notional / qty };
  return { qty, notional, avg: notional / qty, partial: left > 1 };
}

// jual 'qty' di sisi bid
export function fillSell(book, qty) {
  let need = floorQty(qty), notional = 0, done = 0;
  for (const [p, q] of book.bids) { if (need <= 1e-12) break; const t = Math.min(q, need); notional += t * p; need -= t; done += t; }
  if (done <= 0) return null;
  return { qty: done, notional, avg: notional / done, partial: need > 1e-9 };
}

// ukuran biaya dari satu snapshot untuk order 'idr': setengah spread & slippage (relatif harga terbaik)
export function measure(depth, idr) {
  const b = parseBook(depth);
  if (!b.bestBid || !b.bestAsk) return null;
  const buy = fillBuy(b, idr);
  const sell = buy ? fillSell(b, buy.qty) : null;
  return { halfSpread: b.spreadPct / 2, spreadPct: b.spreadPct,
    slipBuy: buy ? buy.avg / b.bestAsk - 1 : null, slipSell: sell ? 1 - sell.avg / b.bestBid : null };
}
