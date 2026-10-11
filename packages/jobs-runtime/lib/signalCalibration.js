'use strict';
/**
 * signalCalibration — pure helpers for the P6 replay study (does a detector's state precede out/under-performance?).
 * No I/O. Entry = the NEXT session's close after the signal day (no look-ahead); forward returns are measured from there
 * and made benchmark-relative by subtracting the equal-weight average return of the study universe over the same dates.
 */
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const HORIZONS = Object.freeze([21, 63]);

/** onset indices: first index where active turns on, then not again within `cooldown` sessions */
function onsets(active, cooldown = 20) {
  const out = [];
  let last = -Infinity;
  for (let i = 0; i < active.length; i++) {
    if (active[i] && (i === 0 || !active[i - 1]) && i - last > cooldown) {
      out.push(i);
      last = i;
    }
  }
  return out;
}

/** forward return (%) from close[i+1] to close[i+1+h]; null if not available */
function fwdReturn(closes, i, h) {
  const a = closes[i + 1];
  const b = closes[i + 1 + h];
  return num(a) && num(b) && a > 0 ? (b / a - 1) * 100 : null;
}

/** worst close-to-entry drawdown (%, <=0) over the h sessions after entry (entry = close[i+1]) */
function fwdDrawdown(closes, i, h) {
  const a = closes[i + 1];
  if (!num(a) || a <= 0 || i + 1 + h >= closes.length) return null;
  let m = a;
  for (let k = i + 2; k <= i + 1 + h; k++) if (closes[k] < m) m = closes[k];
  return (m / a - 1) * 100;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/**
 * @param {{ticker:string, date:string, ex21:number|null, ex63:number|null, raw21:number|null, raw63:number|null}[]} events
 * @returns summary with n, tickers, mean/median excess, % negative excess and a naive t-stat (overlap makes it optimistic)
 */
function summarize(events) {
  const out = { n: events.length, tickers: new Set(events.map((e) => e.ticker)).size };
  for (const h of HORIZONS) {
    const ex = events.map((e) => e[`ex${h}`]).filter(num);
    const raw = events.map((e) => e[`raw${h}`]).filter(num);
    const m = mean(ex);
    const sd = ex.length > 1 ? Math.sqrt(mean(ex.map((x) => (x - m) ** 2)) * (ex.length / (ex.length - 1))) : null;
    out[`h${h}`] = {
      n: ex.length,
      meanExcess: r2(m),
      medianExcess: r2(median(ex)),
      pctNegExcess: ex.length ? r2((ex.filter((x) => x < 0).length / ex.length) * 100) : null,
      meanRaw: r2(mean(raw)),
      tStatNaive: sd && ex.length > 1 ? r2(m / (sd / Math.sqrt(ex.length))) : null,
    };
  }
  const dd = events.map((e) => e.dd21).filter(num);
  out.dd21 = dd.length
    ? { n: dd.length, pctDrawdown10: r2((dd.filter((x) => x <= -10).length / dd.length) * 100), medianWorstDd: r2(median(dd)) }
    : null;
  return out;
}

/**
 * Verdict for an EXIT-type signal, RELATIVE to the unconditional baseline (a skewed return distribution makes ~59% of
 * ALL name-days "negative excess", so absolute hit rates are meaningless): supports = mean excess lower than baseline's
 * by >= 1pp on 21d AND >= 2pp on 63d, and % negative at least 2pp above baseline's on at least one horizon.
 */
function exitVerdict(s, base, { minN = 30 } = {}) {
  const a = s.h21;
  const b = s.h63;
  if (!a || !b || a.n < minN || !base) return 'insufficient';
  const d21 = a.meanExcess - base.h21.meanExcess;
  const d63 = b.meanExcess - base.h63.meanExcess;
  const negUp = a.pctNegExcess - base.h21.pctNegExcess >= 2 || b.pctNegExcess - base.h63.pctNegExcess >= 2;
  if (d21 <= -1 && d63 <= -2 && negUp) return 'supports';
  if (d21 >= 0.5 && d63 >= 0.5) return 'contradicts';
  return 'mixed';
}

/** group events by calendar year of `date` and summarize each (consistency check) */
function byYear(events) {
  const g = {};
  for (const e of events) (g[String(e.date).slice(0, 4)] = g[String(e.date).slice(0, 4)] || []).push(e);
  return Object.fromEntries(Object.entries(g).map(([y, ev]) => [y, summarize(ev)]));
}

module.exports = { HORIZONS, onsets, fwdReturn, fwdDrawdown, summarize, exitVerdict, byYear, mean, median };
