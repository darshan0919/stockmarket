'use strict';

/**
 * exitSignalsExtra — pure evaluators for SOIC exit signals X4, X5, X6 (docs/SOIC_SIGNAL_TAXONOMY_V1.md). No I/O.
 * Sources: X4 = Suresh 1997104611094941718 (sector RS rolls over while others improve);
 * X5 = Suresh 1898602587076596038 (rising on falling volume, block/bulk selling, FII/DII fall, repeated failed breakouts);
 * X6 = Suresh J-curve framework (spent re-rating, thesis break). ALL numeric parameters are ASSUMPTIONS (uncalibrated).
 *   X4  industry median 3M return > market median 3M (was leading) AND industry median 1M < market median 1M -> detected;
 *       confirmed if the 1M gap <= -3pp and >= 60% of the industry's names have a negative 1M return.
 *       NOT modelled: "other sectors' RS improves" (needs a full cross-industry ranking).
 *   X5  flags: RISING_ON_FALLING_VOLUME (close >= close 20 sessions ago, 20D avg volume < 75% of the prior 20D),
 *       BLOCK_SELLING (5-session NSE block SELL >= Rs 10 Cr), REPEAT_FAILED_BREAKOUTS (>= 2 in 60 sessions),
 *       FII_SELLING (quarterly change in FII holding <= -1.0pp). 1 flag -> detected; >= 2 flags or block SELL >= Rs 50 Cr -> confirmed.
 *       NOT modelled: DII holding change, insider selling (no cheap source).
 *   X6  flags: STRETCHED_VALUATION (lib/valuationStretch state non-null), MUTED_REACTION (result in last 100d, PAT YoY > 30,
 *       return since result < 2%), CASH_DIVERGENCE (PAT growing but CFO/PAT < 0), HIGH_PLEDGE (pledged >= 20%).
 *       1 flag -> detected; >= 2 -> confirmed. Thesis-break is handled by the thesis-delta jobs, not here.
 */

const vs = require('./valuationStretch');

const T = Object.freeze({
  x4Gap1mConfirmPp: 3,
  x4NegShareConfirm: 0.6,
  x5VolDrop: 0.75,
  x5BlockDetectedCr: 10,
  x5BlockConfirmedCr: 50,
  x5FailedBreakouts: 2,
  x5FiiSellPp: -1.0,
  x6MutedPct: 2,
  x6PatYoY: 30,
  x6ResultWindowDays: 100,
  x6Pledge: 20,
  x8IndustryCapexGrowthYoY: 40,
  x8SupplyDemandRatio: 1.5,
  x8InventoryExpansionPct: 25,
  x8MarginCompressionBps: 200,
});
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const mx = (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity);
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

function median(a) {
  const s = a.filter(num).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** @param {{ind1m:number[], ind3m:number[], mkt1m:number, mkt3m:number}} i  industry member returns and market medians (percent) */
function sectorRollover({ ind1m = [], ind3m = [], mkt1m, mkt3m } = {}) {
  const m1 = median(ind1m);
  const m3 = median(ind3m);
  if (!num(m1) || !num(m3) || !num(mkt1m) || !num(mkt3m) || ind1m.filter(num).length < 3)
    return { state: null, evidence: { insufficient: true } };
  const evidence = {
    ind1mMedian: Math.round(m1 * 100) / 100,
    ind3mMedian: Math.round(m3 * 100) / 100,
    mkt1m,
    mkt3m,
    n: ind1m.filter(num).length,
  };
  const negShare = ind1m.filter((x) => num(x) && x < 0).length / ind1m.filter(num).length;
  evidence.negShare1m = Math.round(negShare * 100) / 100;
  if (m3 > mkt3m && m1 < mkt1m) {
    const confirmed = mkt1m - m1 >= T.x4Gap1mConfirmPp && negShare >= T.x4NegShareConfirm;
    return { state: confirmed ? 'confirmed' : 'detected', evidence };
  }
  return { state: null, evidence };
}

/** count distinct failed breakouts (close > prior-40 high, then a close back below within 5 sessions) in the last `win` sessions */
function failedBreakouts(candles, win = 60) {
  const t = candles.length - 1;
  const closes = candles.map((c) => c[4]);
  let n = 0;
  for (let k = Math.max(41, t - win + 1); k <= t; k++) {
    const lvl = mx(candles.slice(k - 40, k).map((c) => c[2]));
    if (closes[k] > lvl && closes.slice(k + 1, Math.min(t, k + 5) + 1).some((c) => c < lvl)) {
      n++;
      k += 5;
    }
  }
  return n;
}

/** @param {{candles:Array, blockSellCr?:number, fiiChangePp?:number}} i */
function distribution({ candles = [], blockSellCr = null, fiiChangePp = null } = {}) {
  const flags = [];
  const evidence = {};
  const n = candles.length;
  if (n >= 45) {
    const t = n - 1;
    const v1 = avg(candles.slice(t - 19, t + 1).map((c) => c[5]));
    const v0 = avg(candles.slice(t - 39, t - 19).map((c) => c[5]));
    const up = candles[t][4] >= candles[t - 20][4];
    evidence.volRatio20d = v0 > 0 ? Math.round((v1 / v0) * 100) / 100 : null;
    if (up && v0 > 0 && v1 < T.x5VolDrop * v0) flags.push('RISING_ON_FALLING_VOLUME');
    const fb = failedBreakouts(candles);
    evidence.failedBreakouts60 = fb;
    if (fb >= T.x5FailedBreakouts) flags.push('REPEAT_FAILED_BREAKOUTS');
  }
  if (num(blockSellCr)) {
    evidence.blockSellCr5d = Math.round(blockSellCr);
    if (blockSellCr >= T.x5BlockDetectedCr) flags.push('BLOCK_SELLING');
  }
  if (num(fiiChangePp)) {
    evidence.fiiChangePp = fiiChangePp;
    if (fiiChangePp <= T.x5FiiSellPp) flags.push('FII_SELLING');
  }
  const bigBlock = num(blockSellCr) && blockSellCr >= T.x5BlockConfirmedCr;
  const state =
    flags.length >= 2 || bigBlock ? 'confirmed' : flags.length === 1 ? 'detected' : null;
  return { state, flags, evidence };
}

/** @param {object} r Stockscans Default-scan fields: pe, peg, industryPe, patYoY, daysFromResult (negative = past), returnsSinceResult, cfoToPat, pledgedPct */
function fundamentalExit(r = {}) {
  const flags = [];
  const stretch = vs.evaluate({ pe: r.pe, peg: r.peg, industryPe: r.industryPe });
  if (stretch.state) flags.push('STRETCHED_VALUATION');
  const days = num(r.daysFromResult) ? Math.abs(r.daysFromResult) : null;
  if (
    days != null &&
    days <= T.x6ResultWindowDays &&
    num(r.patYoY) &&
    r.patYoY > T.x6PatYoY &&
    num(r.returnsSinceResult) &&
    r.returnsSinceResult < T.x6MutedPct
  )
    flags.push('MUTED_REACTION');
  if (num(r.cfoToPat) && r.cfoToPat < 0 && num(r.patYoY) && r.patYoY > 0)
    flags.push('CASH_DIVERGENCE');
  if (num(r.pledgedPct) && r.pledgedPct >= T.x6Pledge) flags.push('HIGH_PLEDGE');
  if (
    num(r.inventoryDaysExpansionPct) &&
    r.inventoryDaysExpansionPct >= T.x8InventoryExpansionPct &&
    num(r.marginDeclineBps) &&
    r.marginDeclineBps >= T.x8MarginCompressionBps
  )
    flags.push('CAPITAL_CYCLE_GLUT');
  if (r.endUserHeadwind) flags.push('END_USER_HEADWIND');
  const state = flags.length >= 2 ? 'confirmed' : flags.length === 1 ? 'detected' : null;
  return {
    state,
    flags,
    evidence: {
      valuationFlags: stretch.flags,
      patYoY: r.patYoY ?? null,
      returnsSinceResult: r.returnsSinceResult ?? null,
      daysFromResult: r.daysFromResult ?? null,
      cfoToPat: r.cfoToPat ?? null,
      pledgedPct: r.pledgedPct ?? null,
      inventoryDaysExpansionPct: r.inventoryDaysExpansionPct ?? null,
      marginDeclineBps: r.marginDeclineBps ?? null,
      endUserHeadwind: Boolean(r.endUserHeadwind),
    },
  };
}

/**
 * themeExpiryExit (X8) — evaluates capital cycle oversupply, capacity glut, and end-user downcycle headwinds.
 * @param {{
 *   industryCapexGrowthYoY?: number,
 *   supplyDemandRatio?: number,
 *   inventoryDaysExpansionPct?: number,
 *   marginDeclineBps?: number,
 *   endUserHeadwind?: boolean
 * }} r
 */
function themeExpiryExit(r = {}) {
  const flags = [];
  if (num(r.industryCapexGrowthYoY) && r.industryCapexGrowthYoY > T.x8IndustryCapexGrowthYoY) {
    flags.push('INDUSTRY_CAPEX_GLUT');
  }
  if (num(r.supplyDemandRatio) && r.supplyDemandRatio > T.x8SupplyDemandRatio) {
    flags.push('SUPPLY_DEMAND_OVERSUPPLY');
  }
  if (
    num(r.inventoryDaysExpansionPct) &&
    r.inventoryDaysExpansionPct >= T.x8InventoryExpansionPct &&
    num(r.marginDeclineBps) &&
    r.marginDeclineBps >= T.x8MarginCompressionBps
  ) {
    flags.push('CAPITAL_CYCLE_GLUT');
  }
  if (r.endUserHeadwind) {
    flags.push('END_USER_HEADWIND');
  }
  const state = flags.length >= 2 ? 'confirmed' : flags.length === 1 ? 'detected' : null;
  return {
    state,
    flags,
    evidence: {
      industryCapexGrowthYoY: r.industryCapexGrowthYoY ?? null,
      supplyDemandRatio: r.supplyDemandRatio ?? null,
      inventoryDaysExpansionPct: r.inventoryDaysExpansionPct ?? null,
      marginDeclineBps: r.marginDeclineBps ?? null,
      endUserHeadwind: Boolean(r.endUserHeadwind),
    },
  };
}

module.exports = {
  T,
  median,
  sectorRollover,
  failedBreakouts,
  distribution,
  fundamentalExit,
  themeExpiryExit,
};
