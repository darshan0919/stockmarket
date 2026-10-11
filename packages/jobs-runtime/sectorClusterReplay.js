#!/usr/bin/env node
'use strict';
/**
 * sectorClusterReplay — P6 calibration of S1 sector clusters (kb-automation sector-cluster-validation). Zero LLM, no API calls.
 * Replays the production S1 rule (lib/sectorClusters DEFAULTS: >=3 near-high names, share >= max(10%, 1.5x market base rate), 4 of 5 sessions)
 * over cached daily candles (data/cache/sector-lifecycle-ohlcv/), industry = data/companies.json. APPROXIMATIONS:
 *   near-high = close >= 95% of the trailing 252-session high (the user's saved Near Highs scan is not replayable);
 *   each industry is represented by its <= 8 largest names (>= Rs 500 Cr), so minUniverse is relaxed to 6 and "share" is of that sample.
 * Event = cluster onset (20-session cooldown). Outcome = equal-weight forward return (21 / 63 sessions from the next close) of the
 * industry's sampled names minus the cross-sectional MEDIAN return over the same dates. Baseline = every 10th session, all industries.
 * Writes data/cache/calibration/cluster-replay-<date>.json.   node sectorClusterReplay.js [--cooldown 20]
 */
const fs = require('fs');
const path = require('path');
const C = require('./lib/signalCalibration');
const SC = require('./lib/sectorClusters');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'data', 'cache', 'sector-lifecycle-ohlcv');
const WARM = 252;
const NEAR = 0.95;
const MIN_UNI = 6;
const P = SC.DEFAULTS || { minNames: 3, minShare: 0.1, minLift: 1.5, persistDays: 5, persistMin: 4 };

function main() {
  const db = require('./lib/db');
  const industryOf = new Map(db.find('companies', {}).map((c) => [c.id, c.industry]));
  const names = [];
  for (const f of fs.readdirSync(DIR)) {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const id = f.replace(/\.json$/, '').replace(/^(NSE|BSE)_/, '$1:');
    const ind = industryOf.get(id);
    const cl = c.map((r) => r[4]);
    if (!ind || c.length < WARM + 80 || cl.some((x, i) => i > 0 && cl[i - 1] > 0 && Math.abs(x / cl[i - 1] - 1) > 0.3)) continue;
    const near = new Array(c.length).fill(null);
    for (let i = WARM; i < c.length; i++) {
      let hi = 0;
      for (let k = i - 251; k <= i; k++) if (cl[k] > hi) hi = cl[k];
      near[i] = cl[i] >= NEAR * hi;
    }
    names.push({ id, ind, cl, dates: c.map((r) => r[0]), near, at: new Map(c.map((r, i) => [r[0], i])) });
  }
  const dates = [...new Set(names.flatMap((n) => n.dates))].sort();
  const byInd = new Map();
  for (const n of names) (byInd.get(n.ind) || byInd.set(n.ind, []).get(n.ind)).push(n);

  // benchmark: cross-sectional median fwd return per date / horizon
  const bench = new Map();
  for (const d of dates) {
    for (const h of C.HORIZONS) {
      const a = [];
      for (const n of names) { const i = n.at.get(d); if (i != null) { const r = C.fwdReturn(n.cl, i, h); if (r != null) a.push(r); } }
      if (a.length >= 100) bench.set(`${d}|${h}`, C.median(a));
    }
  }
  // market-wide near-high base rate per date
  const base = new Map();
  for (const d of dates) {
    let n1 = 0, N = 0;
    for (const n of names) { const i = n.at.get(d); if (i != null && n.near[i] != null) { N++; if (n.near[i]) n1++; } }
    if (N >= 100) base.set(d, n1 / N);
  }

  const event = (ind, members, d, tNext) => {
    const e = { ticker: ind, date: d };
    for (const h of C.HORIZONS) {
      const rs = [];
      for (const n of members) { const i = n.at.get(d); if (i != null) { const r = C.fwdReturn(n.cl, i, h); if (r != null) rs.push(r); } }
      const b = bench.get(`${d}|${h}`);
      const r = rs.length >= 3 ? C.mean(rs) : null;
      e[`raw${h}`] = r;
      e[`ex${h}`] = r != null && b != null ? r - b : null;
    }
    return e;
  };

  const cluster = [];
  const baseline = [];
  const cooldown = Number(process.argv[process.argv.indexOf('--cooldown') + 1]) || 20;
  for (const [ind, members] of byInd) {
    if (members.length < MIN_UNI) continue;
    const hits = dates.map((d) => {
      const b = base.get(d);
      if (b == null) return false;
      let n1 = 0, N = 0;
      for (const m of members) { const i = m.at.get(d); if (i != null && m.near[i] != null) { N++; if (m.near[i]) n1++; } }
      return N >= MIN_UNI && n1 >= P.minNames && n1 / N >= Math.max(P.minShare, P.minLift * b);
    });
    const active = hits.map((_, t) => t >= P.persistDays - 1 && hits.slice(t - P.persistDays + 1, t + 1).filter(Boolean).length >= P.persistMin);
    for (const t of C.onsets(active, cooldown)) cluster.push(event(ind, members, dates[t]));
    for (let t = 0; t < dates.length; t += 10) if (base.has(dates[t])) baseline.push(event(ind, members, dates[t]));
  }

  const b = C.summarize(baseline);
  const s = C.summarize(cluster);
  const verdict = (() => {
    if (!s.h21 || !s.h63 || s.h21.n < 30) return 'insufficient';
    const d21 = s.h21.meanExcess - b.h21.meanExcess;
    const d63 = s.h63.meanExcess - b.h63.meanExcess;
    if (d21 >= 1 && d63 >= 2) return 'supports';
    if (d21 <= -0.5 && d63 <= -0.5) return 'contradicts';
    return 'mixed';
  })();
  const out = {
    ran: new Date().toISOString(),
    universe: { names: names.length, industries: [...byInd].filter(([, m]) => m.length >= MIN_UNI).length },
    window: { from: dates[WARM], to: dates[dates.length - 1] },
    rule: { nearHighPct: NEAR * 100, ...P, minUniverse: MIN_UNI, cooldown },
    cluster: { ...s, verdict, byYear: C.byYear(cluster) },
    baseline: { ...b, byYear: C.byYear(baseline) },
    caveats: [
      'survivorship: names listed today; industry sample = largest <=8 names, not the production full-industry share',
      'near-high proxy (95% of 252d close high) differs from the saved Stockscans scan',
      'market clusters (many industries at once) make t-stats optimistic; overlapping windows too',
      'supports = mean excess above baseline by >=1pp (21d) and >=2pp (63d)',
    ],
  };
  const dir = path.join(ROOT, 'data', 'cache', 'calibration');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `cluster-replay-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ ...out, cluster: { ...out.cluster, byYear: Object.fromEntries(Object.entries(out.cluster.byYear).map(([y, v]) => [y, { n: v.n, h21: v.h21 && v.h21.meanExcess, h63: v.h63 && v.h63.meanExcess }])) }, baseline: { n: b.n, h21: b.h21, h63: b.h63 } }, null, 1));
}
if (require.main === module) main();
module.exports = { main };
