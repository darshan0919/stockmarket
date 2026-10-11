'use strict';
/**
 * funnelGaps — pure evaluators for the SOIC process-playbook funnel gaps
 * (kba_x-soic-handles_process-playbook_funnel-gaps). Thresholds are the playbook's (single-author).
 *  - F1-eps-growth: PAT Growth QoQ > 25% (PAT used as EPS proxy — the scan has no EPS-growth column).
 *  - F2-recent-ipo: fewer than ~250 daily candles (listed < 1 year). Listing date is not in the scan
 *    or companies.json, so candle count is the proxy.
 */
const T = { epsGrowthQoQPct: 25, ipoMaxCandles: 250 };
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const epsGrowth = (patGrowthQoQ) =>
  num(patGrowthQoQ) && patGrowthQoQ > T.epsGrowthQoQPct ? 'detected' : null;
const recentIpo = (candleCount) =>
  num(candleCount) && candleCount > 0 && candleCount < T.ipoMaxCandles ? 'detected' : null;
module.exports = { epsGrowth, recentIpo, T };
