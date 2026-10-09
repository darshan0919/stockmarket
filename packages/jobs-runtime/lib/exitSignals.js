'use strict';

/**
 * exitSignals — pure SOIC exit-watch evaluators (taxonomy X1, X2, X3, X7). No I/O.
 * Candles: daily [date, o, h, l, c, v] ascending. Source claims: Suresh 1997104611094941718
 * (X1-X3), chartist 2071224487690039609 (X7). ALL numeric parameters are ASSUMPTIONS (uncalibrated):
 *   X1 weekly: latest 4 weekly highs max < prior 4 weekly highs max, and no new 8-week closing high  (windows ASSUMED)
 *   X2 failed breakout: within 10 sessions, close > prior-40 high then a close back below that level within 5 sessions;
 *      OR a wick day (upper wick >= 60% of range, volume >= 1.5x 20D avg) within 5 sessions of a 20-session high (ASSUMED)
 *   X3 'detected' = close < 20 EMA, 'confirmed' = close < 50 EMA  (chartist/Suresh: "loses 20-DMA then 50-DMA")
 *   X7 close below the stored structural line (support level recorded by the entry detectors)
 */

const ema = require('./technicalSetups').ema;

const r2 = (x) => Math.round(x * 100) / 100;
const mx = (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity);

function weekly(candles) {
  const weeks = new Map();
  for (const [d, , h, l, c, v] of candles) {
    const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00Z' : ''));
    const wk = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400000)
      .toISOString()
      .slice(0, 10);
    const w = weeks.get(wk) || { h: -Infinity, l: Infinity, c: 0, v: 0 };
    w.h = Math.max(w.h, h);
    w.l = Math.min(w.l, l);
    w.c = c;
    w.v += v;
    weeks.set(wk, w);
  }
  return [...weeks.values()];
}

function evaluate(candles, { structuralLine = null } = {}) {
  const n = candles.length;
  const out = { X1: null, X2: null, X3: null, X7: null, evidence: {} };
  if (n < 60) return { ...out, insufficient: true };
  const t = n - 1;
  const closes = candles.map((c) => c[4]);
  const e20 = ema(closes, 20)[t];
  const e50 = ema(closes, 50)[t];
  const close = closes[t];

  // X3
  if (e50 != null && close < e50) out.X3 = 'confirmed';
  else if (e20 != null && close < e20) out.X3 = 'detected';
  out.evidence.X3 = { close, ema20: r2(e20), ema50: r2(e50) };

  // X1 (weekly)
  const w = weekly(candles);
  if (w.length >= 10) {
    const recent = mx(w.slice(-4).map((x) => x.h));
    const prior = mx(w.slice(-8, -4).map((x) => x.h));
    const lastClose = w[w.length - 1].c;
    const high8 = mx(w.slice(-8).map((x) => x.c));
    if (recent < prior && lastClose < high8) out.X1 = 'detected';
    out.evidence.X1 = { recentHigh4w: r2(recent), priorHigh4w: r2(prior) };
  }

  // X2
  for (let k = t - 9; k <= t; k++) {
    const lvl = mx(candles.slice(k - 40, k).map((c) => c[2]));
    if (closes[k] > lvl) {
      const back = closes.slice(k + 1, Math.min(t, k + 5) + 1).some((c) => c < lvl);
      if (back) {
        out.X2 = 'detected';
        out.evidence.X2 = { type: 'failed-breakout', date: candles[k][0], level: r2(lvl) };
        break;
      }
    }
  }
  if (!out.X2) {
    const avgV = candles.slice(t - 24, t - 4).reduce((a, c) => a + c[5], 0) / 20;
    for (let k = t - 4; k <= t; k++) {
      const [, , h, l, c, v] = candles[k];
      const range = h - l;
      const nearHigh = h >= mx(candles.slice(k - 20, k).map((x) => x[2])) * 0.98;
      if (
        range > 0 &&
        (h - Math.max(c, candles[k][1])) / range >= 0.6 &&
        v >= 1.5 * avgV &&
        nearHigh
      ) {
        out.X2 = 'detected';
        out.evidence.X2 = { type: 'wick-on-volume', date: candles[k][0] };
        break;
      }
    }
  }

  // X7
  if (structuralLine != null) {
    if (close < structuralLine) out.X7 = 'confirmed';
    out.evidence.X7 = { line: structuralLine, close };
  }
  return out;
}

module.exports = { evaluate, weekly };
