'use strict';

/**
 * priceMetrics — derive liquidity (50D average traded value) and a close-price
 * series from NSE price/volume/deliverable history, for cases where the Stockscans
 * scan doesn't expose a traded-value column. This is the "compute it" path the
 * liquidity gate (liquidity_gate.md) and post-event returns (post_event_returns.md)
 * fall back to when the column is absent.
 *
 * Source: NseClient.getPriceVolumeDeliverable(symbol, from, to) →
 *   rows with { mTIMESTAMP, CH_CLOSING_PRICE, CH_TOT_TRADED_VAL, COP_DELIV_PERC, ... }.
 * CH_TOT_TRADED_VAL is the day's total traded value in ₹ (rupees), so ÷1e7 → ₹ Cr.
 */

function toIsoDate(s) {
  if (!s) return null;
  // NSE gives 'dd-Mon-yyyy' (mTIMESTAMP) or an ISO CH_TIMESTAMP.
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(String(s));
  if (iso) return iso[0];
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(String(s));
  if (!m) return null;
  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const mm = months[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1]}` : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Normalise NSE PVD rows into ascending [{ date, close, tradedValue, delivPerc, qty }].
 */
function normalizePvd(rows) {
  const out = [];
  for (const r of rows || []) {
    const date = toIsoDate(r.mTIMESTAMP || r.CH_TIMESTAMP);
    const close = num(r.CH_CLOSING_PRICE != null ? r.CH_CLOSING_PRICE : r.CH_LAST_TRADED_PRICE);
    const tradedValue = num(r.CH_TOT_TRADED_VAL);
    if (!date || !Number.isFinite(close)) continue;
    out.push({
      date,
      close,
      tradedValue,
      qty: num(r.CH_TOT_TRADED_QTY),
      delivPerc: num(r.COP_DELIV_PERC),
    });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/**
 * 50-day (or n-day) average traded value in ₹ Crore, from the most recent n rows.
 * Returns { atvCr, nDays, avgDelivPerc } or { atvCr: NaN } if unusable.
 */
function avgTradedValueCr(pvd, n = 50) {
  const rows = normalizePvd(pvd);
  if (!rows.length) return { atvCr: NaN, nDays: 0, avgDelivPerc: NaN };
  const recent = rows.slice(-n);
  const vals = recent.map((r) => r.tradedValue).filter(Number.isFinite);
  if (!vals.length) return { atvCr: NaN, nDays: recent.length, avgDelivPerc: NaN };
  const meanRupees = vals.reduce((a, b) => a + b, 0) / vals.length;
  const deliv = recent.map((r) => r.delivPerc).filter(Number.isFinite);
  return {
    atvCr: Math.round((meanRupees / 1e7) * 100) / 100, // ₹ → ₹ Cr
    nDays: recent.length,
    avgDelivPerc: deliv.length ? Math.round((deliv.reduce((a, b) => a + b, 0) / deliv.length) * 10) / 10 : NaN,
  };
}

/**
 * Close-price candles shaped for postEventReturns.normalizeCandles:
 * [[epochMs, 0, 0, 0, close, qty], ...] ascending.
 */
function toCandles(pvd) {
  return normalizePvd(pvd).map((r) => [Date.parse(r.date), 0, 0, 0, r.close, r.qty || 0]);
}

/**
 * Convenience: fetch ~lookbackDays of NSE history and return both liquidity and a
 * candle series in one call. `nse` is an NseClient; symbol is the bare NSE symbol.
 * BSE-only names have no NSE history — caller should skip or use a BSE source.
 */
async function fetchPriceMetrics(nse, symbol, { lookbackDays = 80, atvWindow = 50 } = {}) {
  const fmt = (dt) => {
    const p = dt.toISOString().slice(0, 10).split('-');
    return `${p[2]}-${p[1]}-${p[0]}`; // dd-mm-yyyy
  };
  const to = new Date();
  const from = new Date(Date.now() - lookbackDays * 86400000);
  const rows = await nse.getPriceVolumeDeliverable(symbol.replace(/^NSE:/i, ''), fmt(from), fmt(to));
  const liquidity = avgTradedValueCr(rows, atvWindow);
  return { rows, liquidity, candles: toCandles(rows) };
}

module.exports = {
  normalizePvd,
  avgTradedValueCr,
  toCandles,
  fetchPriceMetrics,
  toIsoDate,
};
