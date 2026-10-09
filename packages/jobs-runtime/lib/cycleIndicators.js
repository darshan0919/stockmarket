'use strict';

/**
 * cycleIndicators — pure trend evaluator for monthly macro-cycle indicators (macro playbook §6:
 * IIP, credit growth, PMI, GST, power demand; Suresh 1900000662974586956 / 2010531127082303977).
 * No I/O. Input: readings [{period:'YYYY-MM', value:Number}] for ONE indicator (any order).
 * ASSUMPTIONS (uncalibrated): improving = latest > previous; 'confirmed' = 3 consecutive improving steps
 * (4 readings); PMI additionally reports whether the latest is above the conventional 50 line.
 * Direction only — it says nothing about level or valuation.
 */

const INDICATORS = Object.freeze([
  'iip-yoy',
  'credit-growth-yoy',
  'pmi-manufacturing',
  'pmi-services',
  'gst-collections-yoy',
  'power-demand-yoy',
]);

function evaluate(readings) {
  const r = [...readings]
    .filter((x) => Number.isFinite(x.value))
    .sort((a, b) => a.period.localeCompare(b.period));
  if (r.length < 2) return null;
  const last = r[r.length - 1];
  const prev = r[r.length - 2];
  let streak = 0;
  for (let i = r.length - 1; i > 0 && r[i].value > r[i - 1].value; i--) streak++;
  let fall = 0;
  for (let i = r.length - 1; i > 0 && r[i].value < r[i - 1].value; i--) fall++;
  const state = streak >= 3 ? 'confirmed' : streak >= 1 ? 'detected' : null;
  return {
    state,
    period: last.period,
    latest: last.value,
    previous: prev.value,
    risingStreak: streak,
    fallingStreak: fall,
    readings: r.length,
  };
}

module.exports = { INDICATORS, evaluate };
