'use strict';

/**
 * sectorLifecycle — pure evaluators for the S4 sector-lifecycle crowding context signal. No I/O.
 * Sources: SOIC sector teaching (tailwinds run ~2-3 years, super-cycles 2-5 years; late-cycle = price run + rush of listings + stretched
 * sector P/E vs its pre-cycle level). The numeric tests are the USER'S chosen defaults (2026-10-11), NOT calibrated:
 *   PRICE   equal-weight sector index: now / lowest close in the last 24 months >= 2.0 -> crowded, >= 1.7 -> warm
 *   SUPPLY  IPO listings in the industry in the last 12 months >= 4, or >= 25% of the industry's names -> crowded
 *   PE      sector median P/E now / median of the earliest 13 weekly snapshots >= 1.5 -> stretched (n/a before 26 snapshots)
 * State: 0 flags -> null; 1 flag -> detected; >= 2 flags -> confirmed. CONTEXT ONLY (never a gate).
 * Index members need mcap >= Rs 500 Cr and candle history spanning the full 24M window (else a listing price masquerades as the cycle low); >= 3 members.
 * Phase (descriptive): fading = peaked >= 1.7x within window and now >= 15% below that peak; crowded = price flag; run = 1.3-1.7x;
 * base otherwise. "Duration" = months since the 24M low.
 */
const TH = Object.freeze({
  windowDays: 730,
  crowdedX: 2.0,
  warmX: 1.7,
  runX: 1.3,
  fadeDd: 0.15,
  ipoCount: 4,
  ipoShare: 0.25,
  pePremium: 1.5,
  peMinSnaps: 26,
  peBaseSnaps: 13,
  minMembers: 5,
  minIndexMembers: 3,
  indexMcapCr: 500,
  maxDayMove: 0.3,
});
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const r2 = (x) => Math.round(x * 100) / 100;
const median = (a) => {
  const s = a.filter(num).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** @param {Array<Array>} memberCandles each [[date,o,h,l,c,v],...] ascending. Equal-weight index from mean daily return; tickers with a >30% one-day move are dropped (split artifacts). */
function sectorIndex(memberCandles, th = TH, minStart = null) {
  const good = [];
  for (const c of memberCandles) {
    if (!c || c.length < 60) continue;
    if (minStart && c[0][0] > minStart) continue; // history must span the whole window: a recent listing's first price is not a cycle low
    let bad = false;
    for (let i = 1; i < c.length; i++)
      if (c[i - 1][4] > 0 && Math.abs(c[i][4] / c[i - 1][4] - 1) > th.maxDayMove) {
        bad = true;
        break;
      }
    if (!bad) good.push(c);
  }
  const rets = new Map();
  for (const c of good)
    for (let i = 1; i < c.length; i++) {
      if (!(c[i - 1][4] > 0) || !(c[i][4] > 0)) continue;
      const e = rets.get(c[i][0]) || { s: 0, n: 0 };
      e.s += c[i][4] / c[i - 1][4] - 1;
      e.n++;
      rets.set(c[i][0], e);
    }
  const dates = [...rets.keys()].sort();
  let v = 100;
  const series = dates.map((d) => {
    const e = rets.get(d);
    v *= 1 + e.s / e.n;
    return [d, v];
  });
  return { series, used: good.length };
}

function priceTest(series, th = TH) {
  if (series.length < 120) return { flag: null, insufficient: true };
  const last = series[series.length - 1];
  const cut = new Date(Date.parse(last[0]) - th.windowDays * 86400000).toISOString().slice(0, 10);
  const win = series.filter((p) => p[0] >= cut);
  let lo = win[0],
    hi = win[0];
  for (const p of win) {
    if (p[1] < lo[1]) lo = p;
    if (p[1] > hi[1]) hi = p;
  }
  const x = last[1] / lo[1];
  const peakX = hi[1] / lo[1];
  const dd = 1 - last[1] / hi[1];
  const months =
    Math.round(((Date.parse(last[0]) - Date.parse(lo[0])) / 86400000 / 30.4) * 10) / 10;
  const fading = peakX >= th.warmX && dd >= th.fadeDd && Date.parse(hi[0]) > Date.parse(lo[0]);
  const flag = x >= th.crowdedX ? 'crowded' : x >= th.warmX ? 'warm' : null;
  const phase = fading ? 'fading' : x >= th.warmX ? 'crowded' : x >= th.runX ? 'run' : 'base';
  return {
    flag,
    phase,
    x: r2(x),
    peakX: r2(peakX),
    drawdownPct: r2(dd * 100),
    runStart: lo[0],
    monthsSinceLow: months,
    asOf: last[0],
  };
}

/** @param {string[]} listingDates IPO listing dates of the industry's names  @param {number} members names in the industry */
function supplyTest(listingDates, members, today, th = TH) {
  const cut = new Date(Date.parse(today) - 365 * 86400000).toISOString().slice(0, 10);
  const n = listingDates.filter((d) => d && d >= cut && d <= today).length;
  const share = members > 0 ? n / members : 0;
  return {
    flag: n >= th.ipoCount || (n >= 1 && share >= th.ipoShare) ? 'crowded' : null,
    ipos12m: n,
    members,
    sharePct: r2(share * 100),
  };
}

/** @param {{industry:string,medianPe:number,week:string}[][]} snaps chronological sector_pe_snapshot industries arrays */
function peTest(industry, snaps, th = TH) {
  const hist = snaps
    .map((s) => (s.find((i) => i.industry === industry) || {}).medianPe)
    .filter(num);
  if (snaps.length < th.peMinSnaps || hist.length < th.peMinSnaps)
    return { flag: null, insufficient: true, snapshots: snaps.length };
  const base = median(hist.slice(0, th.peBaseSnaps));
  const now = hist[hist.length - 1];
  const ratio = base > 0 ? now / base : null;
  return {
    flag: num(ratio) && ratio >= th.pePremium ? 'stretched' : null,
    ratio: num(ratio) ? r2(ratio) : null,
    now,
    base: r2(base),
    snapshots: snaps.length,
  };
}

function evaluate({ price, supply, pe }) {
  const flags = [];
  if (price && price.flag === 'crowded') flags.push('PRICE_2X_24M');
  if (supply && supply.flag) flags.push('IPO_SUPPLY');
  if (pe && pe.flag) flags.push('PE_PREMIUM');
  const state = flags.length >= 2 ? 'confirmed' : flags.length === 1 ? 'detected' : null;
  return { state, flags, phase: price && price.phase ? price.phase : null };
}

module.exports = { TH, median, sectorIndex, priceTest, supplyTest, peTest, evaluate };
