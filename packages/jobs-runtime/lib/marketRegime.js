'use strict';

/**
 * marketRegime — pure functions turning a market snapshot (+ prior snapshots) into
 * signal-ledger observations for the top-down gates (taxonomy M1-M4, docs/SOIC_SIGNAL_TAXONOMY_V1.md).
 *
 * ALL thresholds below are single-author claims taken from tweets (see THRESHOLDS.source) and are
 * NOT calibrated; every observation therefore carries `calibrated: false` in its evidence.
 * No I/O here: the job (marketRegimeDaily.js) fetches data and persists via lib/signalLedger.js.
 */

const THRESHOLDS = Object.freeze({
  breadthPct: 20, // % of Nifty 500 above its MA that marks a correction / bottom
  brentMax: 100, // $ — relief zone upper bound
  us10yMax: 5, // % — relief zone upper bound
  usdinrMax: 95, // INR — "deteriorated" when above this
  fiiWindow: 5, // sessions
  scanFallDays: 3, // consecutive falling near-high counts = weak market
  source: {
    breadth: 'kbu_x-thechartist26_ma_5ad5fe1e, _6e689d7b, _c666c140',
    macro: 'kbu_x-sureshkbn_ma_d105277a, _241ed631',
    scanCount: 'thechartist26 2071224487690039609 (M1)',
  },
});

const pct = (n, d) => (d > 0 && Number.isFinite(n) ? Math.round((n / d) * 1000) / 10 : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const MARKET = { entityType: 'market', entityId: 'IN' };
const ev = (extra) => ({ calibrated: false, ...extra });

/**
 * @param {Object} snap  { sessionDate, breadth:{universe,above20,above50,above200,nearHighsCount},
 *                         macro:{brent,us10y,usdinr}, flows:{fiiNet,diiNet} }
 * @param {Object[]} history prior snapshots, ascending by sessionDate, EXCLUDING `snap`
 * @returns {Object[]} observations (signals with insufficient data are omitted, never invalidated)
 */
function buildObservations(snap, history = []) {
  const out = [];
  const b = snap.breadth || {};
  const p20 = pct(b.above20, b.universe);
  const p50 = pct(b.above50, b.universe);
  const p200 = pct(b.above200, b.universe);
  const t = THRESHOLDS.breadthPct;
  const breadthEv = {
    pctAbove20SMA: p20,
    pctAbove50SMA: p50,
    pctAbove200SMA: p200,
    universe: b.universe,
    threshold: t,
  };

  if (p20 != null)
    out.push({
      ...MARKET,
      signalId: 'M4-shallow-correction',
      state: p20 < t ? 'confirmed' : null,
      minMisses: 2,
      evidence: ev(breadthEv),
    });
  if (p50 != null)
    out.push({
      ...MARKET,
      signalId: 'M4-deep-correction',
      state: p50 < t ? 'confirmed' : null,
      minMisses: 2,
      evidence: ev(breadthEv),
    });
  if (p200 != null)
    out.push({
      ...MARKET,
      signalId: 'M4-bottom-marker',
      state: p200 < t ? 'confirmed' : null,
      minMisses: 2,
      evidence: ev(breadthEv),
    });

  // M2 / M3 macro
  const m = snap.macro || {};
  const brent = num(m.brent);
  const us10y = num(m.us10y);
  const usdinr = num(m.usdinr);
  if (brent != null && us10y != null && usdinr != null) {
    const breaches = [];
    if (brent >= THRESHOLDS.brentMax) breaches.push('brent');
    if (us10y >= THRESHOLDS.us10yMax) breaches.push('us10y');
    if (usdinr >= THRESHOLDS.usdinrMax) breaches.push('usdinr');
    const macroEv = ev({
      brent,
      us10y,
      usdinr,
      breaches,
      limits: {
        brent: THRESHOLDS.brentMax,
        us10y: THRESHOLDS.us10yMax,
        usdinr: THRESHOLDS.usdinrMax,
      },
    });
    out.push({
      ...MARKET,
      signalId: 'M2-relief-zone',
      state: breaches.length === 0 ? 'confirmed' : null,
      evidence: macroEv,
    });
    out.push({
      ...MARKET,
      signalId: 'M3-weak-macro',
      state: breaches.length > 0 ? 'confirmed' : null,
      evidence: macroEv,
    });
  }

  // M1: near-highs scan count falling N sessions in a row
  const counts = [
    ...history.map((h) => num(h.breadth && h.breadth.nearHighsCount)),
    num(b.nearHighsCount),
  ];
  const need = THRESHOLDS.scanFallDays + 1;
  if (counts.length >= need && counts.slice(-need).every((c) => c != null)) {
    const w = counts.slice(-need);
    const falling = w.every((c, i) => i === 0 || c < w[i - 1]);
    out.push({
      ...MARKET,
      signalId: 'M1-scan-count-falling',
      state: falling ? 'detected' : null,
      minMisses: 1,
      evidence: ev({ lastCounts: w, days: THRESHOLDS.scanFallDays }),
    });
  }

  // FII net outflow over the last N sessions
  const f = [...history.map((h) => num(h.flows && h.flows.fiiNet)), num((snap.flows || {}).fiiNet)];
  const n = THRESHOLDS.fiiWindow;
  if (f.length >= n && f.slice(-n).every((x) => x != null)) {
    const w = f.slice(-n);
    const sum = Math.round(w.reduce((a, c) => a + c, 0) * 100) / 100;
    out.push({
      ...MARKET,
      signalId: 'M4-fii-outflow-5d',
      state: sum < 0 ? 'detected' : null,
      minMisses: 2,
      evidence: ev({ fiiNetSumCr: sum, sessions: n, dailyCr: w }),
    });
  }
  return out;
}

module.exports = { THRESHOLDS, buildObservations, pct };
