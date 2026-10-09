'use strict';
/**
 * peadPricedIn.js — deterministic "was the result already priced in?" screen for the PEAD read.
 * Source: SureshKBN PEAD consolidation (data/assets/pead-framework-sureshkbn.md), Gate 3.
 * THRESHOLDS ARE ILLUSTRATIVE (from his posts, not backtested). Pure function; CLI: node peadPricedIn.js '<json>'
 * input: { preResultRunUpPct, day0ReactionPct, peNow, peMedian1y, peMedian3y, patGrowthYoYPct,
 *          otherIncomeShareOfPbtPct, floatPct }   (use forward P/E for peNow when available)
 * output: { flags:[], setup, pricedIn: 'CLEAN'|'PARTIAL'|'PRICED_IN'|'UNKNOWN' }
 */
const T = {
  runUpPct: 15,
  valAboveMedianPct: 25,
  mutedReactionPct: 2,
  goodPatPct: 30,
  otherIncomePct: 25,
  lowFloatPct: 10,
};
const num = (x) => typeof x === 'number' && Number.isFinite(x);

function peadPricedIn(i = {}) {
  const flags = [];
  const haveVal = num(i.peNow) && (num(i.peMedian1y) || num(i.peMedian3y));
  if (num(i.preResultRunUpPct) && i.preResultRunUpPct >= T.runUpPct)
    flags.push('PRE_RESULT_RUN_UP');
  if (
    num(i.peNow) &&
    num(i.peMedian1y) &&
    i.peMedian1y > 0 &&
    (i.peNow / i.peMedian1y - 1) * 100 >= T.valAboveMedianPct
  )
    flags.push('PE_ABOVE_1Y_MEDIAN');
  if (
    num(i.peNow) &&
    num(i.peMedian3y) &&
    i.peMedian3y > 0 &&
    (i.peNow / i.peMedian3y - 1) * 100 >= T.valAboveMedianPct
  )
    flags.push('PE_ABOVE_3Y_MEDIAN');
  if (
    num(i.day0ReactionPct) &&
    i.day0ReactionPct < T.mutedReactionPct &&
    num(i.patGrowthYoYPct) &&
    i.patGrowthYoYPct > T.goodPatPct
  )
    flags.push('MUTED_REACTION_TO_GOOD_RESULT');
  if (num(i.otherIncomeShareOfPbtPct) && i.otherIncomeShareOfPbtPct >= T.otherIncomePct)
    flags.push('OTHER_INCOME_HEAVY');
  if (num(i.floatPct) && i.floatPct < T.lowFloatPct) flags.push('LOW_FLOAT');
  const pricing = flags.filter((f) =>
    [
      'PRE_RESULT_RUN_UP',
      'PE_ABOVE_1Y_MEDIAN',
      'PE_ABOVE_3Y_MEDIAN',
      'MUTED_REACTION_TO_GOOD_RESULT',
    ].includes(f)
  ).length;
  let pricedIn = 'UNKNOWN';
  if (haveVal || num(i.preResultRunUpPct))
    pricedIn = pricing >= 2 ? 'PRICED_IN' : pricing === 1 ? 'PARTIAL' : 'CLEAN';
  const setup =
    haveVal &&
    num(i.preResultRunUpPct) &&
    i.preResultRunUpPct < T.runUpPct &&
    num(i.peMedian1y) &&
    i.peNow <= i.peMedian1y
      ? 'LOW_EXPECTATION_SETUP'
      : null;
  return { flags, setup, pricedIn };
}
module.exports = { peadPricedIn, T };
if (require.main === module)
  console.log(JSON.stringify(peadPricedIn(JSON.parse(process.argv[2] || '{}')), null, 2));
