'use strict';
/**
 * spentRerating.js — deterministic "has the re-rating already happened?" + extra fake-J-curve flags.
 * Source: SureshKBN J-curve framework (data/assets/jcurve-framework-sureshkbn.md).
 * THRESHOLDS ARE ILLUSTRATIVE (from his posts, not backtested) — tune after the case backtest.
 * Pure function; CLI: node spentRerating.js '<json input>'
 *
 * input: { peNow, pe1yAgo, reactionsPct:[last result reaction %, prior result reaction %],
 *          monthsSinceFirstRerating, patGrowthYoYPct, ocf, pat, debtorDaysNow, debtorDays1yAgo,
 *          salesCagr8qPct, ebitdaMarginPct }
 * output: { reratingPhase: 'EARLY'|'IN_PROGRESS'|'SPENT'|'UNKNOWN', spentFlags:[], fakeFlags:[], capTag:'MODERATE'|null }
 */
const T = {
  peMultipleSpent: 2, // P/E now >= 2x P/E a year ago
  mutedReactionPct: 2, // post-result reaction below this = "stopped reacting"
  maxMonthsInRerating: 18,
  debtorDaysRisePct: 15,
  flatSalesCagrPct: 5,
  thinEbitdaPct: 3,
};
const num = (x) => typeof x === 'number' && Number.isFinite(x);

function spentRerating(i = {}) {
  const spentFlags = [];
  const fakeFlags = [];
  if (num(i.peNow) && num(i.pe1yAgo) && i.pe1yAgo > 0 && i.peNow / i.pe1yAgo >= T.peMultipleSpent)
    spentFlags.push('PE_EXPANDED_2X');
  if (
    Array.isArray(i.reactionsPct) &&
    i.reactionsPct.length >= 2 &&
    i.reactionsPct.slice(0, 2).every((r) => num(r) && r < T.mutedReactionPct) &&
    num(i.patGrowthYoYPct) &&
    i.patGrowthYoYPct > 30
  )
    spentFlags.push('MUTED_REACTION_TO_GOOD_RESULTS');
  if (num(i.monthsSinceFirstRerating) && i.monthsSinceFirstRerating > T.maxMonthsInRerating)
    spentFlags.push('REPEAT_RERATING_UNLIKELY');
  if (num(i.ocf) && num(i.pat) && i.pat > 0 && i.ocf < 0) fakeFlags.push('CASH_FLOW_DIVERGENCE');
  if (
    num(i.debtorDaysNow) &&
    num(i.debtorDays1yAgo) &&
    i.debtorDays1yAgo > 0 &&
    (i.debtorDaysNow / i.debtorDays1yAgo - 1) * 100 > T.debtorDaysRisePct
  )
    fakeFlags.push('RECEIVABLES_RISING');
  if (num(i.salesCagr8qPct) && i.salesCagr8qPct < T.flatSalesCagrPct)
    fakeFlags.push('NEVER_ENDING_TURNAROUND');
  if (num(i.ebitdaMarginPct) && i.ebitdaMarginPct <= T.thinEbitdaPct)
    fakeFlags.push('THIN_MARGIN_BREAKEVEN_ONLY');
  const known = num(i.peNow) && num(i.pe1yAgo);
  let reratingPhase = 'UNKNOWN';
  if (spentFlags.length >= 2) reratingPhase = 'SPENT';
  else if (spentFlags.length === 1) reratingPhase = 'IN_PROGRESS';
  else if (known) reratingPhase = 'EARLY';
  return {
    reratingPhase,
    spentFlags,
    fakeFlags,
    capTag: reratingPhase === 'SPENT' ? 'MODERATE' : null,
  };
}
module.exports = { spentRerating, T };
if (require.main === module)
  console.log(JSON.stringify(spentRerating(JSON.parse(process.argv[2] || '{}')), null, 2));
