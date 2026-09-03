'use strict';

/**
 * balanceSheetSignals.js — deterministic Extraction-First engine for
 * `skills/_shared/balance-sheet-signals.md`.
 *
 * Sibling of `incomeStatementSignals.js`, same contract, same cache
 * discipline, same reason for existing: the QoQ/HoH/YoY delta arithmetic,
 * the ratio derivations (days, turns, gearing, coverage) and the
 * materiality-bar filtering on ~22 balance-sheet lines are pure logic. Doing
 * them inside an LLM reasoning pass burns tokens on division and produces a
 * different "materiality" judgment every run. This module returns ONLY the
 * lines and combinations that cleared their bar; the calling skill's model
 * pass reasons over that short list — what it MEANS for business quality —
 * and never re-derives whether or by how much something moved.
 *
 * WHY THE BALANCE SHEET NEEDS ITS OWN ENGINE: a P&L can be right while the
 * balance sheet is the thing going wrong. The recurring failure mode in
 * Indian mid/small caps is profit that never becomes cash because it is
 * parked on the asset side — receivables, inventory, CWIP, and
 * goodwill/loans-and-advances are the four places an inflated P&L has to
 * come to rest, because the balance sheet must balance. Reading those four
 * against revenue growth, together, is what this scan mechanises.
 *
 * PERIODICITY CAVEAT (India-specific, load-bearing): SEBI LODR Reg 33(3)
 * requires a statement of assets and liabilities only "as at the end of the
 * half-year", submitted as a note to the half-yearly results. Q1 and Q3
 * result filings therefore normally carry NO balance sheet at all, and an
 * investor PPT that shows one in those quarters is usually repeating the
 * last published (H1 or FY) statement. Callers must resolve availability and
 * staleness BEFORE calling this module (see
 * quarterly-result-extractor/scripts/extract_statements.js) — this module
 * assumes the two snapshots it is handed are genuinely different balance
 * sheet dates. `context.priorLabel` should say which comparison basis is in
 * play (e.g. "H1 FY26 vs H1 FY25", "H1 FY26 vs FY25") so the calling skill
 * phrases the comparison honestly rather than implying a quarterly move.
 *
 * Snapshot shape (Ind AS / Schedule III, Rs Cr, per period):
 *   {
 *     // Non-current assets
 *     netBlock, grossBlock, cwip, goodwill, otherIntangibles,
 *     intangiblesUnderDevelopment, investmentsNonCurrent,
 *     loansAdvancesNonCurrent, deferredTaxAssets, otherNonCurrentAssets,
 *     // Current assets
 *     inventories, tradeReceivables, cashAndEquivalents, bankBalancesOther,
 *     investmentsCurrent, loansAdvancesCurrent, otherCurrentAssets,
 *     totalAssets,
 *     // Equity
 *     equityShareCapital, otherEquity, netWorth, minorityInterest,
 *     // Liabilities
 *     borrowingsNonCurrent, leaseLiabilitiesNonCurrent, provisionsNonCurrent,
 *     deferredTaxLiabilities, otherNonCurrentLiabilities,
 *     borrowingsCurrent, currentMaturitiesLTD, tradePayables,
 *     provisionsCurrent, otherCurrentLiabilities,
 *     totalEquityAndLiabilities,
 *     // Notes / off-balance-sheet
 *     contingentLiabilities, promoterPledgePct
 *   }
 * Any line the filing does not disclose must be passed as `null`, NOT 0 —
 * `null` means "not applicable, skip this check" and prevents a fabricated
 * 0% move, exactly as in incomeStatementSignals.js.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../../packages/jobs-runtime/lib/db');
const { sanitizeCompanyId } = require('../utils/companyId');

const CACHE_COLLECTION = 'balance-sheet-signals';

function safeName(id) {
  return String(id || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}
function cacheDir(companyId) {
  return path.join(db.cachePath(CACHE_COLLECTION), safeName(sanitizeCompanyId(companyId)));
}
function cacheFile(companyId, period) {
  return path.join(cacheDir(companyId), `${safeName(period)}.json`);
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function pctChange(curr, prev) {
  if (num(curr) == null || num(prev) == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
function ratio(a, b) {
  if (num(a) == null || num(b) == null || b === 0) return null;
  return a / b;
}
function sum(...xs) {
  const vals = xs.map(num).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}
function days(balance, flowAnnualised) {
  if (num(balance) == null || num(flowAnnualised) == null || flowAnnualised === 0) return null;
  return (balance / flowAnnualised) * 365;
}

/**
 * Derive the cross-line aggregates every check below reads. Kept separate
 * from the checks so a caller can inspect/log the derived view, and so the
 * derivation is written exactly once for both periods.
 *
 * @param {object} s   raw snapshot
 * @param {object} ctx { revenueAnnualised, cogsAnnualised, ebit, interest, pat }
 */
function derive(s, ctx = {}) {
  const grossDebt = sum(s.borrowingsNonCurrent, s.borrowingsCurrent, s.currentMaturitiesLTD);
  const liquidAssets = sum(s.cashAndEquivalents, s.bankBalancesOther, s.investmentsCurrent);
  const netDebt = grossDebt == null ? null : grossDebt - (liquidAssets || 0);
  const netWorth = num(s.netWorth) != null ? s.netWorth : sum(s.equityShareCapital, s.otherEquity);
  const currentAssets = sum(
    s.inventories,
    s.tradeReceivables,
    s.cashAndEquivalents,
    s.bankBalancesOther,
    s.investmentsCurrent,
    s.loansAdvancesCurrent,
    s.otherCurrentAssets
  );
  const currentLiabilities = sum(
    s.borrowingsCurrent,
    s.currentMaturitiesLTD,
    s.tradePayables,
    s.provisionsCurrent,
    s.otherCurrentLiabilities
  );
  const intangibleBlock = sum(s.goodwill, s.otherIntangibles, s.intangiblesUnderDevelopment);
  const relatedPartyish = sum(s.loansAdvancesNonCurrent, s.loansAdvancesCurrent);
  const nwc =
    num(s.tradeReceivables) == null && num(s.inventories) == null
      ? null
      : sum(s.tradeReceivables, s.inventories) - (num(s.tradePayables) || 0);

  const receivableDays = days(s.tradeReceivables, ctx.revenueAnnualised);
  const inventoryDays = days(s.inventories, ctx.cogsAnnualised ?? ctx.revenueAnnualised);
  const payableDays = days(s.tradePayables, ctx.cogsAnnualised ?? ctx.revenueAnnualised);
  const cashConversionDays =
    receivableDays == null && inventoryDays == null
      ? null
      : (receivableDays || 0) + (inventoryDays || 0) - (payableDays || 0);

  return {
    grossDebt,
    liquidAssets,
    netDebt,
    netWorth,
    currentAssets,
    currentLiabilities,
    intangibleBlock,
    relatedPartyish,
    nwc,
    receivableDays,
    inventoryDays,
    payableDays,
    cashConversionDays,
    debtToEquity: ratio(grossDebt, netWorth),
    netDebtToEquity: ratio(netDebt, netWorth),
    currentRatio: ratio(currentAssets, currentLiabilities),
    cwipToNetBlock: ratio(s.cwip, s.netBlock),
    intangiblesToNetWorth: ratio(intangibleBlock, netWorth),
    loansToNetWorth: ratio(relatedPartyish, netWorth),
    otherAssetsToTotal: ratio(sum(s.otherCurrentAssets, s.otherNonCurrentAssets), s.totalAssets),
    cashToTotalAssets: ratio(liquidAssets, s.totalAssets),
    contingentToNetWorth: ratio(s.contingentLiabilities, netWorth),
    dtaToNetWorth: ratio(s.deferredTaxAssets, netWorth),
    nwcToSales: ratio(nwc, ctx.revenueAnnualised),
    grossBlockTurns: ratio(ctx.revenueAnnualised, s.grossBlock),
    interestCoverage: ratio(ctx.ebit, ctx.interest),
    impliedCostOfDebtPct:
      grossDebt && ctx.interestAnnualised ? (ctx.interestAnnualised / grossDebt) * 100 : null,
  };
}

// ── Checks ────────────────────────────────────────────────────────────────
// Each check: id, label, compute(curr, prev, dCurr, dPrev, ctx) -> reading
// object or null, and a `bar` embedded in compute (return null = immaterial).
// Returning a reading means "this cleared the bar and is worth a sentence".

const CHECKS = [
  {
    id: 'gearing',
    label: 'Gross debt / net debt and gearing',
    compute: (_c, _p, dc, dp) => {
      if (dc.grossDebt == null) return null;
      const dePrev = dp.netDebtToEquity;
      const deCurr = dc.netDebtToEquity;
      const moved = dePrev != null && deCurr != null && Math.abs(deCurr - dePrev) > 0.15;
      const high = deCurr != null && deCurr > 1.0;
      const debtPct = pctChange(dc.grossDebt, dp.grossDebt);
      const bigMove = debtPct != null && Math.abs(debtPct) > 15;
      if (!moved && !high && !bigMove) return null;
      return {
        grossDebt: dc.grossDebt,
        grossDebtPriorPeriod: dp.grossDebt,
        grossDebtChangePct: debtPct,
        netDebt: dc.netDebt,
        netDebtToEquity: deCurr,
        netDebtToEquityPrior: dePrev,
        direction: debtPct == null ? null : debtPct < 0 ? 'deleveraging' : 'leveraging',
      };
    },
    note: 'Gearing is the first-order balance-sheet strength read. Falling gross debt with flat/rising net worth is the deleveraging setup that re-rates; rising debt is only acceptable if it is funding assets that will earn above the cost of capital — check against CWIP and the cash-flow scan before judging.',
  },
  {
    id: 'cashAndDebtCoexist',
    label: 'Large cash balance alongside large borrowings',
    compute: (c, _p, dc) => {
      if (dc.liquidAssets == null || dc.grossDebt == null || !c.totalAssets) return null;
      const cashPct = (dc.liquidAssets / c.totalAssets) * 100;
      const debtPct = (dc.grossDebt / c.totalAssets) * 100;
      if (cashPct < 10 || debtPct < 10) return null;
      return { cashPctOfAssets: cashPct, debtPctOfAssets: debtPct, netDebt: dc.netDebt };
    },
    note: 'Holding a big cash pile while paying interest on comparable borrowings is either a deliberate war chest (check management commentary for a stated capex/acquisition plan) or a sign the cash is encumbered/does not exist. Cross-check interest received in the cash-flow scan — real cash yields real interest income.',
  },
  {
    id: 'receivableDays',
    label: 'Trade receivable days',
    compute: (c, _p, dc, dp) => {
      if (dc.receivableDays == null) return null;
      const delta = dp.receivableDays == null ? null : dc.receivableDays - dp.receivableDays;
      if ((delta == null || Math.abs(delta) < 10) && dc.receivableDays < 90) return null;
      return {
        receivableDays: dc.receivableDays,
        priorReceivableDays: dp.receivableDays,
        deltaDays: delta,
        receivables: c.tradeReceivables,
      };
    },
    note: 'A sustained climb in receivable days is the single most-cited pre-fraud signal — sales booked that the customer has not paid for. Always read together with the CFO/PAT conversion check before calling it benign.',
  },
  {
    id: 'inventoryDays',
    label: 'Inventory days',
    compute: (c, _p, dc, dp) => {
      if (dc.inventoryDays == null) return null;
      const delta = dp.inventoryDays == null ? null : dc.inventoryDays - dp.inventoryDays;
      if (delta == null || Math.abs(delta) < 10) return null;
      return {
        inventoryDays: dc.inventoryDays,
        priorInventoryDays: dp.inventoryDays,
        deltaDays: delta,
        inventories: c.inventories,
      };
    },
    note: 'Distinguish a deliberate build ahead of a demand season or a commodity move (temporary, often margin-positive) from stock that is not selling (structural). The P&L "changes in inventories" line and the cash-flow working-capital line must tell the same story.',
  },
  {
    id: 'payableDays',
    label: 'Trade payable days',
    compute: (_c, _p, dc, dp) => {
      if (dc.payableDays == null || dp.payableDays == null) return null;
      const delta = dc.payableDays - dp.payableDays;
      if (Math.abs(delta) < 10) return null;
      return { payableDays: dc.payableDays, priorPayableDays: dp.payableDays, deltaDays: delta };
    },
    note: 'Stretching payables flatters CFO for a quarter or two and is not a durable improvement; shrinking payables can mean suppliers have tightened terms — a credit-stress tell.',
  },
  {
    id: 'cashConversionCycle',
    label: 'Net working capital days (receivable + inventory - payable)',
    compute: (_c, _p, dc, dp) => {
      if (dc.cashConversionDays == null || dp.cashConversionDays == null) return null;
      const delta = dc.cashConversionDays - dp.cashConversionDays;
      if (Math.abs(delta) < 15) return null;
      return {
        cycleDays: dc.cashConversionDays,
        priorCycleDays: dp.cashConversionDays,
        deltaDays: delta,
        nwcToSalesPct: dc.nwcToSales == null ? null : dc.nwcToSales * 100,
      };
    },
    note: 'Falling working-capital days lighten the balance sheet: the same sales need less capital, so capital-employed turnover and therefore ROCE rise without any margin improvement. This is the highest-value constructive signal on this statement.',
  },
  {
    id: 'receivablesVsRevenue',
    label: 'Receivables growth vs revenue growth',
    compute: (c, p, _dc, _dp, ctx) => {
      const recPct = pctChange(c.tradeReceivables, p.tradeReceivables);
      if (recPct == null || ctx.revenueGrowthPct == null) return null;
      const gap = recPct - ctx.revenueGrowthPct;
      if (Math.abs(gap) < 15) return null;
      return { receivablesGrowthPct: recPct, revenueGrowthPct: ctx.revenueGrowthPct, gapPp: gap };
    },
    note: 'Receivables outgrowing revenue by a wide margin means the incremental sale was made on progressively looser credit — growth bought, not earned.',
  },
  {
    id: 'inventoryVsRevenue',
    label: 'Inventory growth vs revenue growth',
    compute: (c, p, _dc, _dp, ctx) => {
      const invPct = pctChange(c.inventories, p.inventories);
      if (invPct == null || ctx.revenueGrowthPct == null) return null;
      const gap = invPct - ctx.revenueGrowthPct;
      if (Math.abs(gap) < 15) return null;
      return { inventoryGrowthPct: invPct, revenueGrowthPct: ctx.revenueGrowthPct, gapPp: gap };
    },
    note: 'Inventory far outgrowing revenue is either a pre-build (ask what for) or unsold stock heading for a write-down.',
  },
  {
    id: 'cwip',
    label: 'Capital work in progress',
    compute: (c, p, dc) => {
      if (num(c.cwip) == null) return null;
      const pct = pctChange(c.cwip, p.cwip);
      const level = dc.cwipToNetBlock;
      const stagnant = pct != null && Math.abs(pct) < 5 && level != null && level > 0.15;
      if (!(level != null && level > 0.15) && !(pct != null && Math.abs(pct) > 25)) return null;
      return {
        cwip: c.cwip,
        priorCwip: p.cwip,
        changePct: pct,
        cwipToNetBlockPct: level == null ? null : level * 100,
        stagnant,
      };
    },
    note: 'High and RISING CWIP is future capacity — the earnings the market has not seen yet, and often the whole re-rating thesis. High and FLAT CWIP across several periods is the opposite: capital parked in something that is not being commissioned, earning nothing while it sits. The two readings look identical on a single snapshot, which is why the change matters more than the level.',
  },
  {
    id: 'grossBlockTurns',
    label: 'Gross block / fixed-asset turnover',
    compute: (_c, _p, dc, dp) => {
      if (dc.grossBlockTurns == null || dp.grossBlockTurns == null) return null;
      const pct = pctChange(dc.grossBlockTurns, dp.grossBlockTurns);
      if (pct == null || Math.abs(pct) < 10) return null;
      return { grossBlockTurns: dc.grossBlockTurns, prior: dp.grossBlockTurns, changePct: pct };
    },
    note: 'Asset turns are the other half of ROCE (EBIT margin x capital-employed turnover). Turns falling while capex lands is normal in the commissioning year; turns falling with no capex is demand weakness.',
  },
  {
    id: 'intangibles',
    label: 'Goodwill and intangible assets',
    compute: (_c, _p, dc, dp) => {
      if (dc.intangibleBlock == null) return null;
      const pct = pctChange(dc.intangibleBlock, dp.intangibleBlock);
      const level = dc.intangiblesToNetWorth;
      if (!(level != null && level > 0.1) && !(pct != null && Math.abs(pct) > 20)) return null;
      return {
        intangibleBlock: dc.intangibleBlock,
        prior: dp.intangibleBlock,
        changePct: pct,
        pctOfNetWorth: level == null ? null : level * 100,
      };
    },
    note: 'Goodwill is the accounting record of having overpaid for an acquisition, and it is one of the four asset lines an inflated P&L can be parked in. A large goodwill block relative to net worth is a standing impairment risk; a sudden increase means an acquisition that needs its own scrutiny.',
  },
  {
    id: 'loansAndAdvances',
    label: 'Loans and advances (incl. to related parties/subsidiaries)',
    compute: (_c, _p, dc, dp) => {
      if (dc.relatedPartyish == null) return null;
      const pct = pctChange(dc.relatedPartyish, dp.relatedPartyish);
      const level = dc.loansToNetWorth;
      if (!(level != null && level > 0.05) && !(pct != null && Math.abs(pct) > 25)) return null;
      return {
        loansAndAdvances: dc.relatedPartyish,
        prior: dp.relatedPartyish,
        changePct: pct,
        pctOfNetWorth: level == null ? null : level * 100,
      };
    },
    note: 'Loans and advances growing faster than the business is the classic route for cash to leave a listed entity for a promoter-owned unlisted one. Read alongside the related-party-transaction note and the cash-flow statement investing lines.',
  },
  {
    id: 'otherAssets',
    label: 'Other current / non-current assets (residual bucket)',
    compute: (c, p, dc) => {
      const curr = sum(c.otherCurrentAssets, c.otherNonCurrentAssets);
      const prior = sum(p.otherCurrentAssets, p.otherNonCurrentAssets);
      const pct = pctChange(curr, prior);
      if (pct == null || Math.abs(pct) < 25) return null;
      return {
        otherAssets: curr,
        prior,
        changePct: pct,
        pctOfTotalAssets: dc.otherAssetsToTotal == null ? null : dc.otherAssetsToTotal * 100,
      };
    },
    note: 'The unnamed residual is where an asset nobody wants to label ends up. A jump with no scale explanation deserves the schedule note, not a shrug.',
  },
  {
    id: 'netWorthBridge',
    label: 'Net worth bridge (opening + PAT - dividend +/- issuance = closing)',
    compute: (_c, _p, dc, dp, ctx) => {
      if (dc.netWorth == null || dp.netWorth == null || ctx.patForPeriod == null) return null;
      const expected =
        dp.netWorth + ctx.patForPeriod - (ctx.dividendPaid || 0) + (ctx.equityRaised || 0);
      const gap = dc.netWorth - expected;
      const gapPct = Math.abs(gap) / Math.abs(dp.netWorth || 1);
      if (gapPct < 0.03) return null;
      return {
        closingNetWorth: dc.netWorth,
        expected,
        unexplainedGap: gap,
        gapPctOfOpening: gapPct * 100,
      };
    },
    note: 'Net worth that does not reconcile to opening + profit - dividend +/- issuance means something moved through reserves or OCI without passing through the P&L — a write-off, a restatement, or a revaluation. Find it before trusting the reported book value.',
  },
  {
    id: 'balanceCheck',
    label: 'Balance sheet balances',
    compute: (c) => {
      if (num(c.totalAssets) == null || num(c.totalEquityAndLiabilities) == null) return null;
      const gap = c.totalAssets - c.totalEquityAndLiabilities;
      if (Math.abs(gap) / Math.abs(c.totalAssets || 1) < 0.005) return null;
      return {
        totalAssets: c.totalAssets,
        totalEquityAndLiabilities: c.totalEquityAndLiabilities,
        gap,
      };
    },
    note: 'A balance sheet that does not balance is an extraction error, not a company finding — re-parse before reporting anything else from this statement.',
  },
  {
    id: 'deferredTaxAssets',
    label: 'Deferred tax assets',
    compute: (c, p, dc) => {
      if (num(c.deferredTaxAssets) == null) return null;
      const pct = pctChange(c.deferredTaxAssets, p.deferredTaxAssets);
      const level = dc.dtaToNetWorth;
      if (!(level != null && level > 0.05) && !(pct != null && Math.abs(pct) > 25)) return null;
      return {
        deferredTaxAssets: c.deferredTaxAssets,
        prior: p.deferredTaxAssets,
        changePct: pct,
        pctOfNetWorth: level == null ? null : level * 100,
      };
    },
    note: 'A DTA is a claim on future taxable profit. Building one materially means carried-forward losses being capitalised as an asset — only worth what future profits make it worth.',
  },
  {
    id: 'contingentLiabilities',
    label: 'Contingent liabilities (off balance sheet)',
    compute: (c, p, dc) => {
      if (num(c.contingentLiabilities) == null) return null;
      const level = dc.contingentToNetWorth;
      const pct = pctChange(c.contingentLiabilities, p.contingentLiabilities);
      if (!(level != null && level > 0.25) && !(pct != null && Math.abs(pct) > 30)) return null;
      return {
        contingentLiabilities: c.contingentLiabilities,
        prior: p.contingentLiabilities,
        changePct: pct,
        pctOfNetWorth: level == null ? null : level * 100,
      };
    },
    note: 'These are liabilities that do not appear on the balance sheet and become real if an event goes against the company. The question is never the number alone — it is whether the worst case threatens survival or merely dents a year of profit.',
  },
  {
    id: 'equityDilution',
    label: 'Equity share capital (dilution)',
    compute: (c, p) => {
      const pct = pctChange(c.equityShareCapital, p.equityShareCapital);
      if (pct == null || Math.abs(pct) < 1) return null;
      return {
        equityShareCapital: c.equityShareCapital,
        prior: p.equityShareCapital,
        changePct: pct,
      };
    },
    note: 'A QIP, preferential issue, or warrant conversion is not good or bad on its own — it is good if the money is deployed at a return above the cost of the equity issued, and dilutive if it is not. Pair with CWIP/capex and with stated end-use.',
  },
  {
    id: 'liquidity',
    label: 'Current ratio / near-term liquidity',
    compute: (c, _p, dc, dp) => {
      if (dc.currentRatio == null) return null;
      const low = dc.currentRatio < 1.0;
      const moved = dp.currentRatio != null && Math.abs(dc.currentRatio - dp.currentRatio) > 0.25;
      if (!low && !moved) return null;
      return {
        currentRatio: dc.currentRatio,
        prior: dp.currentRatio,
        currentMaturitiesLTD: c.currentMaturitiesLTD,
        liquidAssets: dc.liquidAssets,
      };
    },
    note: 'A current ratio below 1 with meaningful current maturities of long-term debt is a refinancing question, not a ratio.',
  },
  {
    id: 'impliedCostOfDebt',
    label: 'Implied cost of debt (P&L interest / average gross debt)',
    compute: (_c, _p, dc, dp, ctx) => {
      if (ctx.interestAnnualised == null || dc.grossDebt == null || dp.grossDebt == null)
        return null;
      const avgDebt = (dc.grossDebt + dp.grossDebt) / 2;
      if (!avgDebt) return null;
      const rate = (ctx.interestAnnualised / avgDebt) * 100;
      if (rate >= 5 && rate <= 15) return null;
      return {
        impliedCostOfDebtPct: rate,
        avgGrossDebt: avgDebt,
        interestAnnualised: ctx.interestAnnualised,
      };
    },
    note: 'An implied rate far below the market cost of borrowing suggests debt that is not on the balance sheet, or interest being capitalised into CWIP; far above suggests distressed borrowing or an undisclosed short-term facility.',
  },
  {
    id: 'promoterPledge',
    label: 'Promoter share pledge',
    compute: (c, p) => {
      if (num(c.promoterPledgePct) == null || c.promoterPledgePct === 0) return null;
      return { promoterPledgePct: c.promoterPledgePct, prior: p ? p.promoterPledgePct : null };
    },
    note: 'Any non-zero pledge is reportable. A rising pledge alongside rising company borrowings and rising financing inflows is the promoter-leverage pattern, and it transmits price risk into the business.',
  },
];

/** Pure computation — no I/O, no cache. Exported for tests. */
function compute(current, prior, context = {}) {
  if (!current || !prior) {
    return {
      material: [],
      combinations: [],
      skipped: [],
      derived: { current: current ? derive(current, context) : null, prior: null },
      incomplete: true,
      incompleteReason: !current ? 'no current balance sheet' : 'no comparable prior balance sheet',
    };
  }
  const dc = derive(current, context);
  const dp = derive(prior, context);

  const material = [];
  const skipped = [];
  for (const check of CHECKS) {
    let reading = null;
    try {
      reading = check.compute(current, prior, dc, dp, context);
    } catch (_) {
      reading = null;
    }
    if (reading) material.push({ id: check.id, label: check.label, ...reading, note: check.note });
    else
      skipped.push({
        id: check.id,
        label: check.label,
        reason: 'below materiality bar or not disclosed',
      });
  }

  const byId = Object.fromEntries(material.map((m) => [m.id, m]));
  const combinations = [];

  const assetSideStretch = [
    'receivablesVsRevenue',
    'inventoryVsRevenue',
    'cwip',
    'intangibles',
    'loansAndAdvances',
  ].filter((k) => byId[k]).length;
  if (assetSideStretch >= 3) {
    combinations.push({
      flag: 'ASSET_SIDE_INFLATION_PATTERN',
      severity: 'high',
      note: 'Three or more of receivables / inventory / CWIP / goodwill / loans-and-advances are stretching at once. Because the balance sheet must balance, an overstated P&L has to come to rest in exactly these lines — this combination is the forensic pattern, not any one line alone. Escalate to `forensic-accounting` rather than resolving it inside a quarterly note.',
    });
  }
  if (byId.gearing && byId.gearing.direction === 'leveraging' && byId.cwip && !byId.cwip.stagnant) {
    combinations.push({
      flag: 'DEBT_FUNDED_CAPEX',
      severity: 'medium',
      note: 'Borrowings and CWIP rising together — growth is being funded by debt. Acceptable only if the project return clears the cost of debt; check the guided ROCE on the project and the commissioning timeline.',
    });
  }
  if (byId.cwip && byId.cwip.stagnant) {
    combinations.push({
      flag: 'CWIP_STAGNANT',
      severity: 'medium',
      note: 'A large CWIP block that is not moving: capital committed but not commissioned, earning nothing while depreciation and interest wait. Ask management for the revised commissioning date and compare it with what was said last quarter.',
    });
  }
  if (byId.cashAndDebtCoexist) {
    combinations.push({
      flag: 'CASH_AND_DEBT_COEXIST',
      severity: 'medium',
      note: 'Verify against interest received in the cash-flow statement before accepting the cash as real and unencumbered.',
    });
  }
  if (
    byId.cashConversionCycle &&
    byId.cashConversionCycle.deltaDays < 0 &&
    byId.gearing &&
    byId.gearing.direction === 'deleveraging'
  ) {
    combinations.push({
      flag: 'BALANCE_SHEET_LIGHTENING',
      severity: 'constructive',
      note: 'Working-capital days falling AND debt falling together — the balance sheet is getting lighter, which lifts capital-employed turnover and ROCE without needing any margin help. This is the constructive setup that precedes a re-rating; check whether it is durable or one period of payables stretch.',
    });
  }
  if (
    byId.equityDilution &&
    byId.equityDilution.changePct > 0 &&
    byId.cwip &&
    byId.cwip.changePct > 0
  ) {
    combinations.push({
      flag: 'EQUITY_FUNDED_EXPANSION',
      severity: 'neutral',
      note: 'Fresh equity issued alongside rising CWIP — judge by the return the project is expected to earn versus the price at which equity was issued, not by the dilution percentage alone.',
    });
  }
  if (byId.contingentLiabilities && byId.contingentLiabilities.pctOfNetWorth > 50) {
    combinations.push({
      flag: 'CONTINGENT_LIABILITY_THREAT',
      severity: 'high',
      note: 'Off-balance-sheet claims exceed half of net worth — size the worst case against equity and say plainly whether it is a survival question or a one-year earnings dent.',
    });
  }
  if (byId.promoterPledge && byId.gearing && byId.gearing.direction === 'leveraging') {
    combinations.push({
      flag: 'PROMOTER_LEVERAGE_PATTERN',
      severity: 'high',
      note: 'Pledged promoter holding alongside rising company borrowings — the income statement, balance sheet and financing cash flows should be read as one story here, not three.',
    });
  }
  if (byId.balanceCheck) {
    combinations.push({
      flag: 'EXTRACTION_SUSPECT',
      severity: 'blocking',
      note: 'Totals do not tie. Treat every other reading from this statement as unverified until the parse is fixed.',
    });
  }

  return {
    material,
    combinations,
    skipped,
    derived: { current: dc, prior: dp },
    incomplete: false,
  };
}

function readCache(companyId, period) {
  const f = cacheFile(companyId, period);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCache(companyId, period, result) {
  const d = cacheDir(companyId);
  fs.mkdirSync(d, { recursive: true });
  const f = cacheFile(companyId, period);
  const tmp = `${f}.tmp.${process.pid}`;
  fs.writeFileSync(
    tmp,
    JSON.stringify(
      {
        companyId: sanitizeCompanyId(companyId),
        period,
        computedAt: new Date().toISOString(),
        ...result,
      },
      null,
      2
    )
  );
  fs.renameSync(tmp, f);
}

/**
 * Entry point every skill should call — cache-checked, so two skills (or two
 * runs) scanning the same company/period get identical numbers for free.
 * `period` should encode the BALANCE SHEET DATE, not the quarter being
 * discussed (e.g. "2026H1", "202603"), because the same statement is
 * legitimately re-read from a later quarter's filing.
 */
function getOrCompute(companyId, period, current, prior, context = {}, force = false) {
  if (!force) {
    const cached = readCache(companyId, period);
    if (cached) return { ...cached, fromCache: true };
  }
  const result = compute(current, prior, context);
  writeCache(companyId, period, result);
  return { ...result, fromCache: false };
}

module.exports = { compute, getOrCompute, readCache, writeCache, derive, CHECKS };
