'use strict';

/**
 * liquiditySupply — pure supply/flow evaluators for the liquidity monitor (macro playbook §2 "supply drains").
 * No I/O. Source claims: "IPO and big-listing supply absorbs liquidity" (ishmohit1 1971183090639962341);
 * "heavy FII/promoter block selling is an overhang" (ishmohit1 1674480880893689857); FII vs SIP flow
 * (Suresh 2040420598892159299). ALL numeric thresholds are ASSUMPTIONS (uncalibrated):
 *   L1 FII 20-session cumulative net < -15000 Rs Cr -> 'detected'; < -30000 -> 'confirmed'   (needs >=20 snapshots)
 *   L2 block+bulk traded value, last 5 sessions >= 2.0x the median of the prior-20 five-session sums -> 'detected';
 *      >= 3.0x -> 'confirmed'  (relative to the market's own recent baseline, so no absolute-size assumption)
 */

const TH = Object.freeze({
  fii20Detected: -15000,
  fii20Confirmed: -30000,
  blockDetected: 2,
  blockConfirmed: 3,
  minSessions: 25,
});

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** deals: [{date:'DD-MON-YYYY'|'YYYY-MM-DD', qty, price}] -> Map(isoDate -> Rs Cr traded) */
function dailyValueCr(deals) {
  const MON = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  const out = new Map();
  for (const d of deals) {
    let iso = d.date;
    const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(d.date || '');
    if (m)
      iso = new Date(Date.UTC(+m[3], MON[m[2].toUpperCase()], +m[1])).toISOString().slice(0, 10);
    const v = (Number(d.qty) * Number(d.price)) / 1e7;
    if (!iso || !Number.isFinite(v)) continue;
    out.set(iso, (out.get(iso) || 0) + v);
  }
  return out;
}

/** returns {ratio, last5Cr, baselineCr, sessions} or null when history is too short */
function blockSpike(dailyMap, th = TH) {
  const days = [...dailyMap.keys()].sort();
  if (days.length < th.minSessions) return null;
  const vals = days.map((d) => dailyMap.get(d));
  const last5 = vals.slice(-5).reduce((a, b) => a + b, 0);
  const prior = vals.slice(-25, -5);
  const sums = [];
  for (let i = 0; i + 5 <= prior.length; i++)
    sums.push(prior.slice(i, i + 5).reduce((a, b) => a + b, 0));
  const base = median(sums);
  if (!(base > 0)) return null;
  return {
    ratio: Math.round((last5 / base) * 100) / 100,
    last5Cr: Math.round(last5),
    baselineCr: Math.round(base),
    sessions: days.length,
  };
}

const blockState = (ratio, th = TH) =>
  ratio >= th.blockConfirmed ? 'confirmed' : ratio >= th.blockDetected ? 'detected' : null;

/** fiiNets: array of daily FII net (Rs Cr), oldest -> newest */
function fii20(fiiNets, th = TH) {
  if (!fiiNets || fiiNets.length < 20) return null;
  const cum = fiiNets.slice(-20).reduce((a, b) => a + b, 0);
  return {
    cumCr: Math.round(cum),
    state: cum <= th.fii20Confirmed ? 'confirmed' : cum <= th.fii20Detected ? 'detected' : null,
  };
}

module.exports = { TH, dailyValueCr, blockSpike, blockState, fii20 };
