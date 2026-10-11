'use strict';

/**
 * mtfFlush — pure evaluator + scorer for the MTF "flush-out + rejection" entry signal.
 * Source: Shashank (X: Shashank1171) flush-out calls, formalised and back-tested in
 * docs/mtf-flush-signal/SPEC.md (rule "G4"). No I/O here; mtfFlushDaily.js feeds it data.
 *
 *   MTF  : shares financed (q = NSE+BSE qty) fell >= 15% over 10 sessions (cumulative, relative —
 *          not a single-day absolute move), liquid book (>= Rs 20 Cr).
 *   Candle: lower-wick >= 40% of the range (intraday rejection), close above 50-DMA, close within
 *          [-6%, +3%] of EMA20 (not extended).
 *   Leader: 120-session return rank >= 0.60 across the NSE universe AND within 25% of the 250d high.
 *
 * EVIDENCE (back-test 2024-01..2026-10, entry at next close, excess vs same-day median stock):
 * median 20d excess ~ +1.6% (train) / +1.0% (test), hit-rate ~58% — a SMALL edge; ~26 variants were
 * tried, no costs, EMA20 not DEMA, "leader" is a price proxy. The 0-100 score below is a RANKING
 * HEURISTIC (weights are ASSUMPTIONS, uncalibrated) — it orders signals, it does not forecast returns.
 */

const THRESH = Object.freeze({
  minBookCr: 20,
  q10Max: -0.15,
  lowWickMin: 0.4,
  dist20Min: -0.06,
  dist20Max: 0.03,
  rankMin: 0.6,
  hi250Min: -0.25,
  qpkDeep: -0.25,
  caGap: 0.005, // price-discontinuity (split/bonus/ex-date) invalidates q-changes spanning it
  tierAScore: 70,
  bookKeep: 70, // sessions of q history cached
});

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Merge one session's rows into the rolling q cache (pure; returns a new cache). */
function mergeBook(cache, isoDate, rows, { keep = THRESH.bookKeep } = {}) {
  const c = {
    version: 1,
    dates: [...((cache && cache.dates) || [])],
    q: {},
    meta: { ...((cache && cache.meta) || {}) },
  };
  for (const [k, v] of Object.entries((cache && cache.q) || {})) c.q[k] = [...v];
  let idx = c.dates.indexOf(isoDate);
  if (idx < 0) {
    idx = c.dates.findIndex((d) => d > isoDate);
    if (idx < 0) idx = c.dates.length;
    c.dates.splice(idx, 0, isoDate);
    for (const k of Object.keys(c.q)) c.q[k].splice(idx, 0, null);
  }
  const n = c.dates.length;
  const seen = new Set();
  for (const r of rows) {
    if (!c.q[r.symbol]) c.q[r.symbol] = new Array(n).fill(null);
    c.q[r.symbol][idx] = r.qty;
    seen.add(r.symbol);
    if (idx === n - 1) c.meta[r.symbol] = { n: r.name, cr: r.combinedCr };
  }
  if (c.dates.length > keep) {
    const drop = c.dates.length - keep;
    c.dates = c.dates.slice(drop);
    for (const k of Object.keys(c.q)) {
      c.q[k] = c.q[k].slice(drop);
      if (c.q[k].every((v) => v == null)) {
        delete c.q[k];
        delete c.meta[k];
      }
    }
  }
  return c;
}

/** q-features from an ascending q series whose last element is the signal day. */
function qFeatures(series) {
  const s = (series || []).map((v) => (isNum(v) && v > 0 ? v : null));
  const q = s[s.length - 1];
  if (!isNum(q) || s.length < 11) return { q: q ?? null, q10: null, qpk: null };
  const base = s[s.length - 11];
  const win = s.slice(-60).filter(isNum);
  return {
    q,
    q10: isNum(base) ? q / base - 1 : null,
    qpk: win.length >= 20 ? q / Math.max(...win) - 1 : null,
  };
}

function ema(values, span) {
  const a = 2 / (span + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = a * values[i] + (1 - a) * e;
  return e;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/**
 * Candle/price features from ascending daily candles; the LAST candle is the signal day.
 * Candle: {date, open, high, low, close, prevClose, volume}.
 */
function candleFeatures(candles) {
  const n = candles.length;
  if (n < 51) return null;
  const k = candles[n - 1];
  const closes = candles.map((c) => c.close);
  const range = k.high - k.low;
  const e20 = ema(closes, 20);
  const hi250 = Math.max(...closes.slice(-250));
  // CA guard: any day in the last 10 whose exchange prevClose disagrees with our prior close
  let ca = false;
  for (let i = n - 10; i < n; i++) {
    const prev = candles[i - 1].close;
    if (candles[i].prevClose > 0 && Math.abs(candles[i].prevClose / prev - 1) > THRESH.caGap)
      ca = true;
  }
  return {
    date: k.date,
    close: k.close,
    lowWick: range > 0 ? (Math.min(k.open, k.close) - k.low) / range : null,
    upWick: range > 0 ? (k.high - Math.max(k.open, k.close)) / range : null,
    clv: range > 0 ? (k.close - k.low) / range : null,
    dist20: k.close / e20 - 1,
    above50: k.close > mean(closes.slice(-50)),
    hi250: k.close / hi250 - 1,
    ret120: n > 120 ? k.close / closes[n - 121] - 1 : null,
    ret1: k.close / candles[n - 2].close - 1,
    volRel: (() => {
      const v = candles
        .slice(-21, -1)
        .map((c) => c.volume)
        .filter(isNum)
        .sort((a, b) => a - b);
      return v.length >= 10 && v[Math.floor(v.length / 2)] > 0
        ? k.volume / v[Math.floor(v.length / 2)]
        : null;
    })(),
    ca,
  };
}

/** Percentile rank (0..1) of `ret` within a sorted ascending array of universe returns. */
function pctRank(ret, sortedAsc) {
  if (!isNum(ret) || !sortedAsc.length) return null;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sortedAsc[m] < ret) lo = m + 1;
    else hi = m;
  }
  return lo / sortedAsc.length;
}

/** Parse NSE sec_bhavdata_full CSV -> Map(symbol -> close) for cash-equity series. */
function parseBhavCloses(text) {
  const out = new Map();
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length < 2) return out;
  const head = lines[0].split(',').map((h) => h.trim().toUpperCase());
  const si = head.indexOf('SYMBOL');
  const ei = head.indexOf('SERIES');
  const ci = head.indexOf('CLOSE_PRICE');
  if (si < 0 || ei < 0 || ci < 0) return out;
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const series = (c[ei] || '').trim();
    if (!['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(series)) continue;
    const px = Number(c[ci]);
    if (isNum(px) && px > 0 && !out.has(c[si].trim())) out.set(c[si].trim(), px);
  }
  return out;
}

/** Score 0-100 (ranking heuristic; ASSUMPTION weights). Returns {score, parts}. */
function score(f) {
  const parts = {
    flushDepth: clamp01((-f.q10 - 0.15) / 0.25) * 25,
    fromPeak: f.qpk == null ? 0 : clamp01((-f.qpk - 0.25) / 0.35) * 15,
    rejection: clamp01((f.lowWick - 0.4) / 0.3) * 20,
    leadership: f.rank == null ? 0 : clamp01((f.rank - 0.6) / 0.4) * 15,
    location: f.dist20 >= -0.03 && f.dist20 <= 0.01 ? 10 : 5,
  };
  const total = Object.values(parts).reduce((s, x) => s + x, 0);
  return { score: Math.round((total / 85) * 100), parts };
}

/**
 * Evaluate one stock.
 * @param {{symbol:string, bookCr:number, qSeries:Array<number|null>, candles:Object[], rank120:number|null}} x
 * @returns {{symbol:string, tier:'A'|'B'|'C'|null, score:number|null, failed:string[], features:Object, rankMissing:boolean, excluded?:string}}
 */
function evaluateStock({ symbol, bookCr, qSeries, candles, rank120 }) {
  const qf = qFeatures(qSeries);
  const cf = candleFeatures(candles || []);
  const out = { symbol, tier: null, score: null, failed: [], features: {}, rankMissing: false };
  if (qf.q10 == null) return { ...out, excluded: 'insufficient-mtf-history' };
  if (!cf) return { ...out, excluded: 'insufficient-price-history' };
  if (cf.ca) return { ...out, excluded: 'corporate-action-in-window' };
  if (cf.lowWick == null) return { ...out, excluded: 'zero-range-candle' };
  const rankMissing = !isNum(rank120);
  const leader = rankMissing
    ? isNum(cf.ret120) && cf.ret120 > 0 && cf.hi250 >= THRESH.hi250Min
    : rank120 >= THRESH.rankMin && cf.hi250 >= THRESH.hi250Min;
  const f = { ...qf, ...cf, rank: rankMissing ? null : rank120, bookCr };
  const checks = {
    liquid: bookCr >= THRESH.minBookCr,
    flush: qf.q10 <= THRESH.q10Max,
    wick: cf.lowWick >= THRESH.lowWickMin,
    above50: cf.above50,
    location: cf.dist20 >= THRESH.dist20Min && cf.dist20 <= THRESH.dist20Max,
    leader,
  };
  const failed = Object.keys(checks).filter((k) => !checks[k]);
  const res = { ...out, failed, features: f, rankMissing };
  if (!failed.length) {
    const s = score(f);
    return {
      ...res,
      score: s.score,
      scoreParts: s.parts,
      tier: s.score >= THRESH.tierAScore ? 'A' : 'B',
    };
  }
  const soft = failed.every((k) => k === 'wick' || k === 'location');
  if (
    checks.liquid &&
    checks.flush &&
    checks.above50 &&
    checks.leader &&
    soft &&
    failed.length === 1
  ) {
    return { ...res, tier: 'C' };
  }
  return res;
}

/**
 * Forward outcome of one signal. Entry = close of the first session AFTER signalDate (the back-test rule);
 * `candles`/`bench` ascending {date,low,close}. Horizons are null until that many sessions after entry exist.
 */
function computeOutcome(signalDate, candles, bench, horizons = [5, 10, 20]) {
  const i0 = candles.findIndex((c) => c.date > signalDate);
  if (i0 < 0) return null;
  const entry = candles[i0];
  const bAt = new Map(bench.map((b) => [b.date, b.close]));
  const out = { entryDate: entry.date, entryClose: entry.close, horizons: {}, mae10: null };
  for (const h of horizons) {
    const c = candles[i0 + h];
    if (!c) {
      out.horizons[h] = null;
      continue;
    }
    const ret = c.close / entry.close - 1;
    const b0 = bAt.get(entry.date);
    const b1 = bAt.get(c.date);
    out.horizons[h] = { ret, excess: b0 && b1 ? ret - (b1 / b0 - 1) : null };
  }
  if (candles[i0 + 10])
    out.mae10 = Math.min(...candles.slice(i0 + 1, i0 + 11).map((c) => c.low)) / entry.close - 1;
  out.complete = out.horizons[20] != null;
  return out;
}

/** Summarise outcomes grouped by key: n, median excess, hit-rate (excess>0) per horizon. */
function summarizeOutcomes(rows, horizon = 20) {
  const g = {};
  for (const r of rows) {
    const h = r.outcome && r.outcome.horizons && r.outcome.horizons[horizon];
    if (!h || h.excess == null) continue;
    (g[r.tier] = g[r.tier] || []).push(h.excess);
  }
  const out = {};
  for (const [k, v] of Object.entries(g)) {
    const s = [...v].sort((a, b) => a - b);
    out[k] = {
      n: s.length,
      medianExcess: s[Math.floor(s.length / 2)],
      hit: v.filter((x) => x > 0).length / v.length,
    };
  }
  return out;
}

module.exports = {
  computeOutcome,
  summarizeOutcomes,
  THRESH,
  mergeBook,
  qFeatures,
  candleFeatures,
  pctRank,
  parseBhavCloses,
  score,
  evaluateStock,
};
