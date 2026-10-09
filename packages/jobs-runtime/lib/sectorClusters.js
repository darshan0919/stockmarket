'use strict';

/**
 * sectorClusters — pure S1 (sector collective movement) evaluator. No I/O.
 * Groups near-high names by industry against the industry's universe size so "3 names"
 * means 3 of 12, not 3 of 300.
 *
 * ALL thresholds are ASSUMPTIONS (uncalibrated). Source claims: S1 = Suresh 1680063718112231424
 * ("breakouts clustering by sector over ~5 days"); S3 = chartist 1952699636017234121 (3-4 names in one group).
 *   minNames 3          from S3 ("3-4 in one group")
 *   minShare 0.10       ASSUMPTION (>=10% of the industry's names near highs)
 *   minLift 1.5         ASSUMPTION (industry share must be >=1.5x the market-wide near-high rate, else a broad rally flags every industry)
 *   minUniverse 8       ASSUMPTION (ignore industries too small for a share to mean anything)
 *   persistDays 5 / persistMin 4   S1 "~5 days"; 4-of-5 is our tolerance
 */

const DEFAULTS = Object.freeze({
  minNames: 3,
  minShare: 0.1,
  minUniverse: 8,
  minLift: 1.5,
  persistDays: 5,
  persistMin: 4,
});

const count = (rows) => {
  const m = new Map();
  for (const r of rows) if (r) m.set(r, (m.get(r) || 0) + 1);
  return m;
};

/** @param {string[]} nearIndustries industry per near-high name  @param {string[]} universeIndustries industry per universe name */
function industryCounts(nearIndustries, universeIndustries) {
  const near = count(nearIndustries);
  const uni = count(universeIndustries);
  const out = {};
  for (const [ind, N] of uni) out[ind] = { n: near.get(ind) || 0, N };
  return out;
}

const baseRate = (snap) => {
  let n = 0,
    N = 0;
  for (const c of Object.values(snap || {})) {
    n += c.n;
    N += c.N;
  }
  return N ? n / N : 0;
};
const hit = (c, p, base) =>
  !!c &&
  c.N >= p.minUniverse &&
  c.n >= p.minNames &&
  c.n / c.N >= Math.max(p.minShare, p.minLift * base);

/**
 * @param {Object} today   industryCounts() for the session
 * @param {Object[]} prior previous snapshots' counts, oldest first (excluding today)
 * @returns observations for the ledger (entityType 'sector')
 */
function buildObservations(today, prior = [], params = {}) {
  const p = { ...DEFAULTS, ...params };
  const recent = prior.slice(-(p.persistDays - 1));
  const obs = [];
  const names = new Set([...Object.keys(today), ...recent.flatMap((s) => Object.keys(s))]);
  for (const ind of names) {
    const c = today[ind];
    if (!c) continue; // industry missing from today's universe: omit, never flip state
    const base = baseRate(today);
    const now = hit(c, p, base);
    const days = recent.filter((s) => hit(s[ind], p, baseRate(s))).length + (now ? 1 : 0);
    let state = null;
    if (now)
      state = recent.length >= p.persistDays - 1 && days >= p.persistMin ? 'confirmed' : 'detected';
    obs.push({
      signalId: 'S1-sector-cluster',
      entityType: 'sector',
      entityId: ind,
      state,
      minMisses: 2,
      evidence: {
        near: c.n,
        universe: c.N,
        sharePct: Math.round((c.n / c.N) * 1000) / 10,
        hitDays: days,
        window: Math.min(p.persistDays, recent.length + 1),
        marketRatePct: Math.round(base * 1000) / 10,
        calibrated: false,
      },
    });
  }
  return obs;
}

module.exports = { DEFAULTS, industryCounts, buildObservations, hit };
