'use strict';

/**
 * policyEvents — pure helpers for the policy-event tracker (taxonomy M/S policy rows; macro playbook §4).
 * No I/O. An event = a dated policy announcement mapped to a basket of tickers (sector proxy).
 * Absorption = basket equal-weight return since the event date minus the benchmark's, in %.
 *
 * Source claim: "after the stock has moved 5%/10%/20% check sector odds and government push before timing
 * entry" (Suresh 1967014431256350933); "policy is necessary, not sufficient: the test is orders and earnings"
 * (Suresh 2083874630045954090). The 5/20 cut-offs and MAX_AGE_DAYS are ASSUMPTIONS, uncalibrated.
 *   excess <5%   -> 'detected'   logged, not yet absorbed by price
 *   5%..20%      -> 'confirmed'  market is responding; check orders/earnings (agent step)
 *   >=20%        -> 'spent'      priced in
 */

const THRESH = Object.freeze({ confirmedPct: 5, spentPct: 20, maxAgeDays: 120 });

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

/** candles ascending [date,o,h,l,c,v]; return since first close on/after eventDate, null if unavailable */
function returnSince(candles, eventDate) {
  if (!candles || candles.length < 2) return null;
  const i = candles.findIndex((c) => c[0] >= eventDate);
  if (i < 0 || i === candles.length - 1) return null;
  return (candles[candles.length - 1][4] / candles[i][4] - 1) * 100;
}

function absorption({ basket, bench, eventDate }) {
  const rets = Object.values(basket)
    .map((c) => returnSince(c, eventDate))
    .filter((x) => x != null);
  const b = returnSince(bench, eventDate);
  if (!rets.length || b == null) return null;
  const basketRet = mean(rets);
  return {
    basketRetPct: round(basketRet),
    benchRetPct: round(b),
    excessPct: round(basketRet - b),
    names: rets.length,
  };
}

const round = (x) => Math.round(x * 100) / 100;

function stateFor(excessPct, ageDays, th = THRESH) {
  if (ageDays > th.maxAgeDays) return null;
  if (excessPct >= th.spentPct) return 'spent';
  if (excessPct >= th.confirmedPct) return 'confirmed';
  return 'detected';
}

function ageDays(eventDate, today) {
  return Math.round((Date.parse(today) - Date.parse(eventDate)) / 86400000);
}

module.exports = { THRESH, returnSince, absorption, stateFor, ageDays };
