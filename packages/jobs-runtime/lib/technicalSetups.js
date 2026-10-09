'use strict';

/**
 * technicalSetups — pure price-structure evaluators for the SOIC entry gates (taxonomy E0-E2).
 * No I/O. Candles are daily [date, open, high, low, close, volume] sorted ascending.
 *
 * Parameter provenance (ALL uncalibrated; single-author claims or marked ASSUMPTION):
 *   tightMaxDepthPct 7      kbu_x-thechartist26_te_7011d036  "base less than ~6-7% deep"
 *   ma50NearPct 7           kbu_x-thechartist26_te_86764c07  "within 5-7% of the 50 EMA"
 *   minTouches 4            kbu_x-thechartist26_te_19782877  "line touched more than three times"
 *   selection (rs>=90, <=20% of 52wH, >200 EMA, turnover >= Rs 7 Cr)  chartist te_8233ada5 / te_74f72de2 / te_7038fb91
 *   baseWindow 40           ASSUMPTION  ("base >= ~2 months" ~ 40 sessions)
 *   tightWindow 15          ASSUMPTION  (length of the "tight" tail)
 *   baseMaxDepthPct 20      kbu_x-thechartist26_te_6812fc2e "correction < 20%" (used as a base-depth cap)
 *   touchBandPct 1          ASSUMPTION
 *   pullbackBandPct 3       ASSUMPTION  (te_d8e5e609 says "rest at the 21 EMA", band is ours)
 *   pullbackLookback 25     ASSUMPTION
 *   maxPullbackPct 15       ASSUMPTION  (deeper than 15% off the post-breakout high = failed momentum, not a pullback)
 *   minPullbackPct 2        ASSUMPTION  (must be >= 2% off the post-breakout high to count as a pullback)
 */

const DEFAULTS = Object.freeze({
  baseWindow: 40,
  tightWindow: 15,
  tightMaxDepthPct: 7,
  baseMaxDepthPct: 20,
  ma50NearPct: 7,
  minTouches: 4,
  touchBandPct: 1,
  pullbackBandPct: 3,
  pullbackLookback: 25,
  minPullbackPct: 2,
  maxPullbackPct: 15,
  minRs: 90,
  maxFromHighPct: 20,
  minTurnoverRs: 7e7,
});

function ema(values, n) {
  const k = 2 / (n + 1);
  const out = [];
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    prev =
      prev == null
        ? values.slice(0, n).reduce((a, b) => a + b, 0) / n
        : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const maxOf = (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity);
const minOf = (a) => a.reduce((m, x) => (x < m ? x : m), Infinity);
const depthPct = (hi, lo) => (hi > 0 ? ((hi - lo) / hi) * 100 : null);

/**
 * Evaluate E1 (base breakout readiness) and E2 (pullback) at the LAST candle.
 * @param {Array} candles daily candles
 * @param {{rs:number,fromHighPct:number,turnoverRs:number}} sel selection inputs from the scan
 * @returns {{candidate:boolean, selection:Object, e1:Object, e2:Object}}
 */
function evaluate(candles, sel, params = {}) {
  const p = { ...DEFAULTS, ...params };
  const n = candles.length;
  const need = p.baseWindow + p.tightWindow + 5;
  const closes = candles.map((c) => c[4]);
  const e200 = ema(closes, 200);
  const e50 = ema(closes, 50);
  const e21 = ema(closes, 21);
  const t = n - 1;
  const close = closes[t];

  const selection = {
    rs: sel.rs ?? null,
    fromHighPct: r2(sel.fromHighPct),
    turnoverCr: sel.turnoverRs == null ? null : r2(sel.turnoverRs / 1e7),
    aboveEma200: e200[t] != null ? close > e200[t] : null,
  };
  const candidate =
    selection.rs != null &&
    selection.rs >= p.minRs &&
    selection.fromHighPct != null &&
    selection.fromHighPct <= p.maxFromHighPct &&
    selection.aboveEma200 === true &&
    sel.turnoverRs != null &&
    sel.turnoverRs >= p.minTurnoverRs;

  const none = { state: null, levels: null, evidence: null };
  if (n < need || e50[t] == null)
    return { candidate, selection, e1: none, e2: none, insufficient: true };

  // --- E1: resistance from the window BEFORE today, so a breakout today is visible
  const prior = candles.slice(t - p.baseWindow, t); // excludes today
  const resistance = maxOf(prior.map((c) => c[2]));
  const baseLow = minOf(prior.map((c) => c[3]));
  const band = resistance * (1 - p.touchBandPct / 100);
  const touches = prior.filter((c) => c[2] >= band && c[4] <= resistance).length;
  const tight = prior.slice(-p.tightWindow);
  const tightDepth = depthPct(maxOf(tight.map((c) => c[2])), minOf(tight.map((c) => c[3])));
  const baseDepth = depthPct(resistance, baseLow);
  const near50 = Math.abs(close / e50[t] - 1) * 100;
  const vols = candles.slice(t - 20, t).map((c) => c[5]);
  const volRatio = vols.length
    ? candles[t][5] / (vols.reduce((a, b) => a + b, 0) / vols.length)
    : null;
  const metrics = {
    resistance: r2(resistance),
    touches,
    tightDepthPct: r2(tightDepth),
    baseDepthPct: r2(baseDepth),
    pctFromEma50: r2(near50),
    volumeRatio20: r2(volRatio),
  };
  const setupOk =
    tightDepth != null &&
    tightDepth <= p.tightMaxDepthPct &&
    near50 <= p.ma50NearPct &&
    touches >= p.minTouches;

  let e1 = none;
  if (candidate && setupOk && close > resistance) {
    e1 = {
      state: 'spent',
      levels: { breakout: r2(resistance), support: r2(minOf(tight.map((c) => c[3]))) },
      evidence: { trigger: 'breakout-today', ...metrics },
    };
  } else if (candidate && setupOk) {
    e1 = {
      state: 'entry-ready',
      levels: {
        breakout: r2(resistance),
        support: r2(minOf(tight.map((c) => c[3]))),
        ema50: r2(e50[t]),
      },
      evidence: metrics,
    };
  } else if (
    candidate &&
    baseDepth != null &&
    baseDepth <= p.baseMaxDepthPct &&
    close <= resistance
  ) {
    e1 = { state: 'detected', levels: { breakout: r2(resistance) }, evidence: metrics };
  }

  // --- E2: pullback to the breakout level / 21 EMA after a recent breakout
  let e2 = none;
  const lookStart = Math.max(p.baseWindow + 1, t - p.pullbackLookback);
  let brk = null;
  for (let k = lookStart; k <= t - 1; k++) {
    // FIRST breakout in the window = the base's breakout level
    const win = candles.slice(k - p.baseWindow, k);
    const lvl = maxOf(win.map((c) => c[2]));
    // the breakout must come out of a real base (depth <= baseMaxDepthPct), not a trending run
    if (closes[k] > lvl && depthPct(lvl, minOf(win.map((c) => c[3]))) <= p.baseMaxDepthPct) {
      brk = { k, lvl };
      break;
    }
  }
  if (candidate && brk && e21[t] != null) {
    const distLvl = (close / brk.lvl - 1) * 100;
    const distE21 = (close / e21[t] - 1) * 100;
    const holds = close >= brk.lvl * (1 - p.pullbackBandPct / 100);
    const atSupport =
      Math.abs(distLvl) <= p.pullbackBandPct || Math.abs(distE21) <= p.pullbackBandPct;
    const pivot = maxOf(candles.slice(brk.k, t + 1).map((c) => c[2]));
    const offPivotPct = (1 - close / pivot) * 100;
    if (holds && atSupport && offPivotPct >= p.minPullbackPct && offPivotPct <= p.maxPullbackPct) {
      e2 = {
        state: 'entry-ready',
        levels: { support: r2(brk.lvl), ema21: r2(e21[t]), pivot: r2(pivot) },
        evidence: {
          offPivotPct: r2(offPivotPct),
          breakoutDate: candles[brk.k][0],
          breakoutLevel: r2(brk.lvl),
          pctFromLevel: r2(distLvl),
          pctFromEma21: r2(distE21),
          sessionsSinceBreakout: t - brk.k,
        },
      };
    }
  }
  return { candidate, selection, e1, e2 };
}

/** RS rating: weighted performance score, percentile-ranked against the supplied universe (0-100). */
function rsRatings(rows, weights = { r3m: 0.4, r6m: 0.4, r1y: 0.2 }) {
  // weights: chartist te_2dd301b2 = 40% 3M, 20% each 6/9/12M. 9M is not available from Stockscans,
  // so its 20% is folded into 6M (ASSUMPTION, recorded in evidence by the caller).
  const scored = rows.map((r) => {
    const parts = Object.entries(weights).map(([k, w]) => [r[k], w]);
    if (parts.some(([v]) => typeof v !== 'number' || !Number.isFinite(v)))
      return { id: r.id, score: null };
    return { id: r.id, score: parts.reduce((a, [v, w]) => a + v * w, 0) };
  });
  const valid = scored
    .filter((s) => s.score != null)
    .map((s) => s.score)
    .sort((a, b) => a - b);
  const out = new Map();
  for (const s of scored) {
    if (s.score == null) {
      out.set(s.id, null);
      continue;
    }
    let below = 0;
    for (const v of valid) {
      if (v < s.score) below++;
      else break;
    }
    out.set(s.id, Math.round((below / Math.max(1, valid.length - 1)) * 1000) / 10);
  }
  return out;
}

module.exports = { DEFAULTS, ema, evaluate, rsRatings };
