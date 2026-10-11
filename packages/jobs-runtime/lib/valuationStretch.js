'use strict';
/**
 * valuationStretch — pure V1 "valuation stretch" evaluator (kb-automation
 * kba_x-soic-handles_valuation-playbook_stretch-flag). Uses Stockscans-native columns only
 * (Price To Earnings, PEG, Industry PE Median) — platform reuse first. Own-history P/E median
 * (peadPricedIn.js) needs data the scan does not return; left for a later enhancement.
 * THRESHOLDS: PEG 1.5 / 2 and PE>50-in-weak-regime come from the SOIC valuation playbook
 * (single-author, uncalibrated); the 50% premium-to-industry is an ASSUMPTION.
 * Caveat: Stockscans PEG uses trailing growth — a stretch flag, not a verdict.
 */
const T = { pegHigh: 1.5, pegVeryHigh: 2, premiumToIndustryPct: 50, pe50: 50 };
const num = (x) => typeof x === 'number' && Number.isFinite(x);

function evaluate({ pe, peg, industryPe, weakRegime = false } = {}) {
  const flags = [];
  if (num(peg) && peg > 0) {
    if (peg > T.pegVeryHigh) flags.push('PEG_GT_2');
    else if (peg > T.pegHigh) flags.push('PEG_GT_1_5');
  }
  const premiumPct =
    num(pe) && pe > 0 && num(industryPe) && industryPe > 0 ? (pe / industryPe - 1) * 100 : null;
  if (premiumPct != null && premiumPct >= T.premiumToIndustryPct)
    flags.push('PE_PREMIUM_TO_INDUSTRY');
  if (weakRegime && num(pe) && pe > T.pe50) flags.push('PE_GT_50_WEAK_REGIME');
  const state = flags.length >= 2 ? 'confirmed' : flags.length === 1 ? 'detected' : null;
  return {
    state,
    flags,
    evidence: {
      pe,
      peg,
      industryPe,
      premiumToIndustryPct: premiumPct,
      weakRegime,
      calibrated: false,
    },
  };
}
module.exports = { evaluate, T };
