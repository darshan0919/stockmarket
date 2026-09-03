'use strict';

/**
 * cashflowSignals.js — deterministic Extraction-First engine for
 * `skills/_shared/cashflow-signals.md`.
 *
 * Third sibling of `incomeStatementSignals.js` / `balanceSheetSignals.js`,
 * same contract and same cache discipline. The cash-flow statement is the
 * one statement that cannot be accrued into existence: profit is an opinion
 * expressed through recognition policy, cash received is a fact. Every
 * conversion ratio, funding-gap identity and cash-bridge check below is
 * arithmetic and belongs in this script; the model's job starts at what a
 * cleared signal MEANS for business quality.
 *
 * PERIODICITY CAVEAT (India-specific, load-bearing): SEBI LODR Reg 33(3)
 * requires a statement of cash flows only for the half-year, filed as a note
 * to the half-yearly results. So (a) Q1/Q3 filings normally carry no cash
 * flow statement at all, (b) the figures that DO appear are CUMULATIVE
 * (H1 year-to-date, or full-year), never a single quarter, and (c) the only
 * honest comparison is against the SAME cumulative window a year earlier
 * (H1 vs H1, FY vs FY). Never compare an H1 cash flow against a full-year
 * one, and never annualise a half-year cash flow to compare against a
 * full-year P&L — the context figures passed in (`ebitdaForPeriod`,
 * `patForPeriod`, `revenueForPeriod`) must cover exactly the same window as
 * the cash-flow statement itself. `context.periodLabel` and
 * `context.priorPeriodLabel` carry that window forward so the calling skill
 * can state the basis instead of implying a quarterly figure.
 *
 * Snapshot shape (Rs Cr, per cumulative period; `null` for not disclosed):
 *   {
 *     pbt, depreciation, financeCostAddBack, otherNonCashAdjustments,
 *     opProfitBeforeWCChanges,
 *     changeInReceivables, changeInInventories, changeInPayables,
 *     changeInOtherWC, wcChangeTotal, taxPaid, cfo,
 *     capex, saleOfPPE, purchaseOfInvestments, saleOfInvestments,
 *     interestReceived, acquisitions, loansGiven, cfi,
 *     proceedsFromBorrowings, repaymentOfBorrowings, netBorrowings,
 *     proceedsFromEquity, buyback, dividendPaid, interestPaid, cff,
 *     netCashChange, openingCash, closingCash
 *   }
 * Sign convention: as printed in the filing — inflows positive, outflows
 * negative. `capex` is normally negative; the checks below use absolute
 * values where a magnitude is what matters and say so.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../../packages/jobs-runtime/lib/db');
const { sanitizeCompanyId } = require('../utils/companyId');

const CACHE_COLLECTION = 'cashflow-signals';

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
function abs(v) {
  return num(v) == null ? null : Math.abs(v);
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

/**
 * Cross-line aggregates. `ctx` supplies the SAME-WINDOW P&L figures:
 * { ebitdaForPeriod, patForPeriod, revenueForPeriod, taxChargeForPeriod,
 *   financeCostForPeriod, cashAndInvestmentsAvg }
 */
function derive(s, ctx = {}) {
  const wcTotal =
    num(s.wcChangeTotal) != null
      ? s.wcChangeTotal
      : sum(s.changeInReceivables, s.changeInInventories, s.changeInPayables, s.changeInOtherWC);
  const capexAbs = abs(s.capex);
  const fcf = num(s.cfo) != null && capexAbs != null ? s.cfo - capexAbs : null;
  const netBorrow =
    num(s.netBorrowings) != null
      ? s.netBorrowings
      : sum(s.proceedsFromBorrowings, s.repaymentOfBorrowings);
  const shareholderReturn = sum(abs(s.dividendPaid), abs(s.buyback));
  const externalFundingNeed =
    num(s.cfo) != null && capexAbs != null ? capexAbs + (shareholderReturn || 0) - s.cfo : null;
  const externalFundingRaised = sum(netBorrow, s.proceedsFromEquity);
  const nonCoreOutflow = sum(abs(s.purchaseOfInvestments), abs(s.loansGiven), abs(s.acquisitions));

  return {
    wcTotal,
    capexAbs,
    fcf,
    netBorrow,
    shareholderReturn,
    externalFundingNeed,
    externalFundingRaised,
    nonCoreOutflow,
    cfoToEbitda: ratio(s.cfo, ctx.ebitdaForPeriod),
    cfoToPat: ratio(s.cfo, ctx.patForPeriod),
    cfoToRevenue: ratio(s.cfo, ctx.revenueForPeriod),
    wcDragShare: ratio(wcTotal, s.opProfitBeforeWCChanges),
    capexToDepreciation: ratio(capexAbs, s.depreciation),
    capexToCfo: ratio(capexAbs, s.cfo),
    fcfToCfo: ratio(fcf, s.cfo),
    payoutToFcf: ratio(shareholderReturn, fcf),
    nonCoreShareOfInvesting: ratio(nonCoreOutflow, sum(nonCoreOutflow, capexAbs)),
    taxPaidVsCharge: ratio(abs(s.taxPaid), ctx.taxChargeForPeriod),
    interestPaidVsCharge: ratio(abs(s.interestPaid), ctx.financeCostForPeriod),
    impliedCashYieldPct:
      num(s.interestReceived) != null && ctx.cashAndInvestmentsAvg
        ? (Math.abs(s.interestReceived) / ctx.cashAndInvestmentsAvg) * 100
        : null,
  };
}

const CHECKS = [
  {
    id: 'cfoSign',
    label: 'Cash flow from operations — sign and level',
    compute: (c, p) => {
      if (num(c.cfo) == null) return null;
      const negative = c.cfo < 0;
      const swung = num(p && p.cfo) != null && Math.sign(c.cfo) !== Math.sign(p.cfo);
      const bigMove = pctChange(c.cfo, p && p.cfo);
      if (!negative && !swung && (bigMove == null || Math.abs(bigMove) < 30)) return null;
      return {
        cfo: c.cfo,
        priorCfo: p ? p.cfo : null,
        changePct: bigMove,
        negative,
        signSwitch: swung,
      };
    },
    note: 'Negative operating cash flow in a profitable company is always reportable, whatever the explanation offered. A sign flip in either direction is the highest-information single fact on this statement.',
  },
  {
    id: 'cfoToEbitda',
    label: 'CFO / EBITDA conversion',
    compute: (_c, _p, dc, dp) => {
      if (dc.cfoToEbitda == null) return null;
      const pct = dc.cfoToEbitda * 100;
      const prior = dp && dp.cfoToEbitda != null ? dp.cfoToEbitda * 100 : null;
      const fell = prior != null && prior - pct > 20;
      if (pct >= 50 && !fell) return null;
      return { cfoToEbitdaPct: pct, priorPct: prior, belowFiftyPct: pct < 50 };
    },
    note: 'The working benchmark taught by SOIC is a floor of roughly 50% CFO/EBITDA; sustained readings below it mean operating profit is not becoming cash, and the gap has to be found in working capital. Judge the level against the sector (project/EPC businesses run structurally lower than consumer) but judge the TREND against the company itself.',
  },
  {
    id: 'cfoToPat',
    label: 'CFO / PAT conversion',
    compute: (_c, _p, dc, dp) => {
      if (dc.cfoToPat == null) return null;
      const pct = dc.cfoToPat * 100;
      const prior = dp && dp.cfoToPat != null ? dp.cfoToPat * 100 : null;
      const fell = prior != null && prior - pct > 20;
      if (pct >= 80 && !fell) return null;
      return { cfoToPatPct: pct, priorPct: prior, belowEightyPct: pct < 80 };
    },
    note: 'SOIC’s working bar for a B2B business is 80-90%+ of PAT converting to operating cash. Persistent under-conversion across several periods is the accrual-quality signal that precedes most Indian small-cap accidents; a single weak period during a growth spurt is usually working capital funding real volume.',
  },
  {
    id: 'workingCapitalDrag',
    label: 'Working-capital movement as a share of operating profit',
    compute: (c, _p, dc) => {
      if (dc.wcTotal == null || dc.wcDragShare == null) return null;
      if (Math.abs(dc.wcDragShare) < 0.3) return null;
      return {
        wcChangeTotal: dc.wcTotal,
        opProfitBeforeWCChanges: c.opProfitBeforeWCChanges,
        shareOfOperatingProfitPct: dc.wcDragShare * 100,
        byLine: {
          receivables: c.changeInReceivables,
          inventories: c.changeInInventories,
          payables: c.changeInPayables,
          other: c.changeInOtherWC,
        },
      };
    },
    note: 'When working capital absorbs a large share of operating profit, name WHICH line did it — receivables, inventory, or payables unwinding — because the three have completely different implications, and the answer must agree with the balance-sheet days scan.',
  },
  {
    id: 'taxPaidVsCharge',
    label: 'Cash taxes paid vs P&L tax charge',
    compute: (c, _p, dc) => {
      if (dc.taxPaidVsCharge == null) return null;
      const r = dc.taxPaidVsCharge;
      if (r > 0.7 && r < 1.3) return null;
      return { taxPaid: c.taxPaid, ratioToCharge: r };
    },
    note: 'Cash tax far below the booked charge means deferred tax is doing the work — timing differences, MAT credit, or carried-forward losses. Far above means prior-year settlements. Either way, cash tax is what actually leaves the business.',
  },
  {
    id: 'capexIntensity',
    label: 'Capex vs depreciation and vs CFO',
    compute: (_c, _p, dc) => {
      if (dc.capexAbs == null) return null;
      const vsDep = dc.capexToDepreciation;
      const vsCfo = dc.capexToCfo;
      const expansion = vsDep != null && vsDep > 2;
      const under = vsDep != null && vsDep < 0.8;
      const outrunning = vsCfo != null && vsCfo > 1;
      if (!expansion && !under && !outrunning) return null;
      return {
        capex: dc.capexAbs,
        capexToDepreciation: vsDep,
        capexToCfo: vsCfo,
        mode: expansion ? 'expansion' : under ? 'under-investment' : 'in-line',
        outrunningOperatingCash: outrunning,
      };
    },
    note: 'Capex above ~2x depreciation is expansion, not maintenance — it should be traceable to a stated project and to the CWIP line. Capex persistently below depreciation is a business being harvested. Capex exceeding CFO is not itself a problem; it is a question about who is funding the gap, answered by the financing section.',
  },
  {
    id: 'freeCashFlow',
    label: 'Free cash flow (CFO - capex)',
    compute: (_c, _p, dc, dp) => {
      if (dc.fcf == null) return null;
      const priorFcf = dp ? dp.fcf : null;
      const swung = priorFcf != null && Math.sign(dc.fcf) !== Math.sign(priorFcf);
      if (dc.fcf >= 0 && !swung) return null;
      return {
        fcf: dc.fcf,
        priorFcf,
        signSwitch: swung,
        fcfToCfoPct: dc.fcfToCfo == null ? null : dc.fcfToCfo * 100,
      };
    },
    note: 'Negative free cash flow is NOT automatically a negative: a company reinvesting every rupee at a high incremental return is doing exactly what it should, and the dividend can wait. The question to answer is what the reinvestment is earning, not whether FCF is positive. What is unambiguously bad is negative FCF with no identifiable project behind it.',
  },
  {
    id: 'nonCoreInvesting',
    label: 'Cash leaving via non-core investing (investments, loans, acquisitions)',
    compute: (c, _p, dc) => {
      if (dc.nonCoreOutflow == null || dc.nonCoreOutflow === 0) return null;
      const share = dc.nonCoreShareOfInvesting;
      const loansMaterial = abs(c.loansGiven) != null && abs(c.loansGiven) > 0;
      if ((share == null || share < 0.25) && !loansMaterial) return null;
      return {
        nonCoreOutflow: dc.nonCoreOutflow,
        loansGiven: c.loansGiven,
        acquisitions: c.acquisitions,
        purchaseOfInvestments: c.purchaseOfInvestments,
        shareOfInvestingPct: share == null ? null : share * 100,
      };
    },
    note: 'Loans given out, or investments bought, while the core business is short of capital is the cash-flow-statement view of the same question the balance sheet asks via loans and advances. Any non-trivial "loans given" line deserves a named counterparty from the related-party note.',
  },
  {
    id: 'fundingGap',
    label: 'Funding identity (capex + shareholder returns - CFO vs external funding raised)',
    compute: (c, _p, dc) => {
      if (dc.externalFundingNeed == null) return null;
      if (dc.externalFundingNeed <= 0) return null;
      return {
        externalFundingNeed: dc.externalFundingNeed,
        netBorrowings: dc.netBorrow,
        equityRaised: c.proceedsFromEquity,
        externalFundingRaised: dc.externalFundingRaised,
        coveredBy:
          num(c.proceedsFromEquity) && c.proceedsFromEquity > 0
            ? 'equity'
            : dc.netBorrow && dc.netBorrow > 0
              ? 'debt'
              : 'existing cash',
      };
    },
    note: 'Growth and dividends that operating cash cannot cover are financed by someone — debt, equity, or the cash pile. Saying WHICH, in one sentence, is usually the single most useful line in a cash-flow write-up, and it connects this statement to the gearing and dilution readings on the balance sheet.',
  },
  {
    id: 'shareholderReturns',
    label: 'Dividend / buyback vs free cash flow',
    compute: (_c, _p, dc) => {
      if (dc.shareholderReturn == null || dc.shareholderReturn === 0) return null;
      const cover = dc.payoutToFcf;
      if (cover != null && cover >= 0 && cover < 0.8) return null;
      return { shareholderReturn: dc.shareholderReturn, fcf: dc.fcf, payoutToFcf: cover };
    },
    note: 'A payout exceeding free cash flow is being funded from the balance sheet. That can be a deliberate return of surplus cash by a business with nothing to reinvest in (fine, and often the right call) or a payout the company cannot afford (not fine) — the distinction is the cash balance and the debt trend.',
  },
  {
    id: 'financingComposition',
    label: 'Financing mix — borrowings, equity, repayment',
    compute: (c, _p, dc, dp) => {
      const equity = num(c.proceedsFromEquity);
      const nb = dc.netBorrow;
      const priorNb = dp ? dp.netBorrow : null;
      const equityRaised = equity != null && equity > 0;
      const swing =
        nb != null && priorNb != null && Math.abs(nb - priorNb) > Math.abs(priorNb || 1) * 0.5;
      const repaying = nb != null && nb < 0;
      if (!equityRaised && !swing && !repaying) return null;
      return { netBorrowings: nb, priorNetBorrowings: priorNb, equityRaised: equity, repaying };
    },
    note: 'Net repayment of borrowings out of operating cash is the deleveraging signature that shows up on the balance sheet a period later. A fresh equity raise is neutral until the end-use and its expected return are known.',
  },
  {
    id: 'interestPaidVsCharge',
    label: 'Interest paid (cash) vs P&L finance cost',
    compute: (c, _p, dc) => {
      if (dc.interestPaidVsCharge == null) return null;
      const r = dc.interestPaidVsCharge;
      if (r > 0.8 && r < 1.25) return null;
      return { interestPaid: c.interestPaid, ratioToCharge: r };
    },
    note: 'Cash interest materially above the P&L charge usually means interest is being capitalised into CWIP rather than expensed — real cash cost, invisible in reported margins. Materially below can mean accrued-but-unpaid interest.',
  },
  {
    id: 'interestReceivedYield',
    label: 'Interest received vs cash and investments held',
    compute: (c, _p, dc) => {
      if (dc.impliedCashYieldPct == null) return null;
      const y = dc.impliedCashYieldPct;
      if (y >= 3 && y <= 12) return null;
      return { interestReceived: c.interestReceived, impliedYieldPct: y };
    },
    note: 'A large reported cash and investments balance that earns almost no interest income is the standard test for cash that is encumbered, pledged, or not there. Run this check whenever the balance sheet shows cash and debt side by side.',
  },
  {
    id: 'cashBridge',
    label: 'Cash bridge (CFO + CFI + CFF = change in cash)',
    compute: (c) => {
      const parts = sum(c.cfo, c.cfi, c.cff);
      const stated =
        num(c.netCashChange) != null
          ? c.netCashChange
          : num(c.closingCash) != null && num(c.openingCash) != null
            ? c.closingCash - c.openingCash
            : null;
      if (parts == null || stated == null) return null;
      const gap = parts - stated;
      const scale = Math.max(Math.abs(stated), Math.abs(c.cfo || 0), 1);
      if (Math.abs(gap) / scale < 0.02) return null;
      return { cfoPlusCfiPlusCff: parts, statedChange: stated, gap };
    },
    note: 'The three sections must reconcile to the movement in cash. A gap is an extraction error (forex translation lines are a common cause) — fix the parse before drawing any conclusion from this statement.',
  },
];

function compute(current, prior, context = {}) {
  if (!current) {
    return {
      material: [],
      combinations: [],
      skipped: [],
      derived: { current: null, prior: null },
      incomplete: true,
      incompleteReason: 'no cash flow statement for this period',
    };
  }
  const dc = derive(current, context);
  const dp = prior ? derive(prior, context.prior || context) : null;

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

  const weakConversion = byId.cfoToPat || byId.cfoToEbitda;
  const receivableDriven =
    byId.workingCapitalDrag &&
    num(byId.workingCapitalDrag.byLine.receivables) != null &&
    byId.workingCapitalDrag.byLine.receivables < 0;

  if (weakConversion && receivableDriven) {
    combinations.push({
      flag: 'ACCRUAL_HEAVY_PROFIT',
      severity: 'high',
      note: 'Profit is not converting to cash and receivables are the reason. This is the same finding the balance sheet reports as rising receivable days — one phenomenon seen from two statements, so report it once, with both numbers, not twice.',
    });
  }
  if (
    weakConversion &&
    byId.workingCapitalDrag &&
    num(byId.workingCapitalDrag.byLine.inventories) != null &&
    byId.workingCapitalDrag.byLine.inventories < 0
  ) {
    combinations.push({
      flag: 'INVENTORY_ABSORBING_CASH',
      severity: 'medium',
      note: 'Inventory is absorbing the operating profit. Ask whether it is a deliberate pre-build against a named order or season — and whether the goods came back as sales returns in a later period, which is how channel stuffing eventually shows up.',
    });
  }
  if (
    byId.capexIntensity &&
    byId.capexIntensity.outrunningOperatingCash &&
    byId.fundingGap &&
    byId.fundingGap.coveredBy === 'debt'
  ) {
    combinations.push({
      flag: 'DEBT_FUNDED_EXPANSION',
      severity: 'medium',
      note: 'Expansion is running ahead of operating cash and debt is closing the gap. Sustainable only while the project return clears the cost of that debt and the commissioning schedule holds.',
    });
  }
  if (byId.interestReceivedYield && byId.interestReceivedYield.impliedYieldPct < 3) {
    combinations.push({
      flag: 'CASH_BALANCE_SUSPECT',
      severity: 'high',
      note: 'The reported cash and investments are not producing a plausible yield. Escalate to `forensic-accounting` rather than treating it as a rounding issue.',
    });
  }
  if (byId.nonCoreInvesting && weakConversion) {
    combinations.push({
      flag: 'CASH_LEAKING_TO_NON_CORE',
      severity: 'high',
      note: 'The core business is short of cash while cash is going out to investments, loans, or acquisitions. Identify the counterparties before anything else in this note.',
    });
  }
  if (
    !byId.cfoToPat &&
    !byId.cfoToEbitda &&
    byId.financingComposition &&
    byId.financingComposition.repaying &&
    byId.freeCashFlow == null
  ) {
    combinations.push({
      flag: 'SELF_FUNDED_AND_DELEVERAGING',
      severity: 'constructive',
      note: 'Operating cash is covering capex and shareholder returns AND repaying debt, with conversion ratios healthy enough not to clear a materiality bar. This is the cash-flow signature that precedes a re-rating — worth stating explicitly rather than leaving as an absence of red flags.',
    });
  }
  if (byId.cashBridge) {
    combinations.push({
      flag: 'EXTRACTION_SUSPECT',
      severity: 'blocking',
      note: 'The cash bridge does not tie. Treat every other reading from this statement as unverified until the parse is fixed.',
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
 * `period` must encode the CUMULATIVE WINDOW the statement covers, not the
 * quarter being discussed — e.g. "2026H1" or "2026FY" — so that re-reading
 * the same H1 cash flow from a later quarter's filing is a cache hit rather
 * than a second, differently-keyed scan of identical numbers.
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
