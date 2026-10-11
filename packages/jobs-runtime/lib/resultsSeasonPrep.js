'use strict';
/**
 * resultsSeasonPrep — pure evaluator for the pre-results-season "faded move" watchlist
 * (kba_x-soic-handles_process-playbook_results-season-prep). Names whose last result was good
 * (PAT growth YoY > 20%) but whose price since that result is negative, and whose next result is
 * approaching (>= 70 days since the last one; quarterly cycle ~90 days). Platform columns only
 * ("Days From Result", "Returns Since Result", "PAT Growth YoY"). Thresholds are ASSUMPTIONS.
 * Related-party / negative-CFO flags (playbook) need filing extracts: NOT included here.
 */
const TH = Object.freeze({ minDaysFromResult: 70, maxDaysFromResult: 120, goodPatYoY: 20, fadedBelowPct: 0, deepFadePct: -10 });
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/** Stockscans 'Days From Result' is NEGATIVE for past results (Reliance: -86 = result 86 days ago). */
function fadedState({ daysFromResult, returnsSinceResult, patGrowthYoY }, th = TH) {
  if (![daysFromResult, returnsSinceResult, patGrowthYoY].every(num)) return null;
  const since = -daysFromResult;
  if (since < th.minDaysFromResult || since > th.maxDaysFromResult) return null;
  if (patGrowthYoY <= th.goodPatYoY || returnsSinceResult >= th.fadedBelowPct) return null;
  return returnsSinceResult <= th.deepFadePct ? 'confirmed' : 'detected';
}
module.exports = { TH, fadedState };
