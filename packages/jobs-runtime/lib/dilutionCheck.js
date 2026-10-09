'use strict';
/**
 * dilutionCheck.js — deterministic "does EPS growth beat the dilution?" test for
 * equity raises (QIP / preferential / warrants). Pure arithmetic, no LLM.
 * Source framework: kbf_x-sureshkbn_earnings-horizon-valuation-gate ("Judge a QIP by
 * whether EPS growth beats the dilution"; sustained-earnings caveat stays a judgment call).
 *
 *   node packages/jobs-runtime/lib/dilutionCheck.js <existingShares> <newShares> <epsNow> <epsGuided> [debtAddedCr]
 */

function dilutionCheck({ existingShares, newShares, epsNow, epsGuided, debtAddedCr = 0 }) {
  const nums = [existingShares, newShares, epsNow, epsGuided];
  if (
    nums.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
    existingShares <= 0 ||
    newShares < 0 ||
    epsNow <= 0
  ) {
    return {
      verdict: 'INSUFFICIENT_DATA',
      reason: 'need positive existingShares/epsNow, numeric newShares/epsGuided',
    };
  }
  const dilutionPct = (newShares / (existingShares + newShares)) * 100;
  // Guided EPS is already post-dilution only if the company says so — caller must pass the post-issue figure.
  const epsGrowthPct = ((epsGuided - epsNow) / epsNow) * 100;
  // EPS needed just to stand still: PAT unchanged => EPS falls by dilution; breakeven growth in PAT = dilution/(1-dilution)
  const breakEvenPatGrowthPct = (newShares / existingShares) * 100;
  let verdict = epsGrowthPct > 0 ? 'GROWTH_FUEL' : 'SHAREHOLDER_PAIN';
  if (debtAddedCr > 0) verdict += '+DEBT_ADDED';
  return {
    dilutionPct: +dilutionPct.toFixed(2),
    epsGrowthPct: +epsGrowthPct.toFixed(2),
    breakEvenPatGrowthPct: +breakEvenPatGrowthPct.toFixed(2),
    verdict,
    note: 'epsGuided must be the post-issue (diluted) EPS. A positive diluted-EPS growth means growth beats dilution; whether the guidance is credible is a judgment step.',
  };
}

module.exports = { dilutionCheck };

if (require.main === module) {
  const [a, b, c, d, e] = process.argv.slice(2).map(Number);
  console.log(
    JSON.stringify(
      dilutionCheck({
        existingShares: a,
        newShares: b,
        epsNow: c,
        epsGuided: d,
        debtAddedCr: e || 0,
      }),
      null,
      2
    )
  );
}
