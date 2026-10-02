'use strict';

/**
 * Maps a parsed results XBRL filing (see parse.js) onto the normalized
 * snapshot keys the existing PDF path already emits (extract_income_statement
 * IS_MAP, extract_statements BS_MAP / CF_MAP), in Rs Cr, so downstream
 * analyzers (incomeStatementSignals, balanceSheetSignals, cashflowSignals)
 * need no change. Pure functions, no I/O.
 *
 * Sign conventions (same as the PDF path): expenses positive; change in
 * inventories as filed (negative = stock build); exceptional items = effect on
 * profit (XBRL tagging convention, PBT = PBT-before-exceptional + exceptional);
 * cash-flow outflows negative; working-capital lines are cash effects.
 */

const CR = 1e7;

/** Families whose element sets this adapter understands. */
const FAM = require('./resultsFamilies');
const SUPPORTED_FAMILIES = Object.freeze([
  'indas',
  'nbfc',
  'sme',
  'banking',
  'life-insurance',
  'general-insurance',
]);

/** Normalized key -> XBRL local element (income statement). */
const IS_ELEMENTS = Object.freeze({
  revenue: 'RevenueFromOperations',
  otherIncome: 'OtherIncome',
  totalIncome: 'Income',
  costOfMaterials: 'CostOfMaterialsConsumed',
  purchasesOfStockInTrade: 'PurchasesOfStockInTrade',
  changeInInventories: 'ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade',
  employeeCost: 'EmployeeBenefitExpense',
  interest: 'FinanceCosts',
  depreciation: 'DepreciationDepletionAndAmortisationExpense',
  otherExpenses: 'OtherExpenses',
  totalExpenses: 'Expenses',
  pbtBeforeExceptional: 'ProfitBeforeExceptionalItemsAndTax',
  exceptionalItems: 'ExceptionalItemsBeforeTax',
  // SME / Indian-GAAP taxonomy only: sits between 'before exceptional' and PBT (absent in Ind AS).
  extraordinaryItems: 'ExtraordinaryItems',
  // SME taxonomy only: minority-interest line that is ADDED to get ProfitLossForThePeriod.
  minorityInterestAdj: 'ProfitLossOfMinorityInterest',
  pbt: 'ProfitBeforeTax',
  currentTax: 'CurrentTax',
  deferredTax: 'DeferredTax',
  tax: 'TaxExpense',
  pat: 'ProfitLossForPeriod',
  regulatoryDeferralMovement:
    'NetMovementInRegulatoryDeferralAccountBalancesRelatedToProfitOrLossAndTheRelatedDeferredTaxMovement',
  associatesShare: 'ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod',
  discontinuedAfterTax: 'ProfitLossFromDiscontinuedOperationsAfterTax',
  patOwners: 'ProfitOrLossAttributableToOwnersOfParent',
  nci: 'ProfitOrLossAttributableToNonControllingInterests',
  epsBasic: 'BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations',
  epsDiluted: 'DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations',
});
/** Element aliases used by the SME / Indian-GAAP ("Other than Ind AS") integrated-filing taxonomy. */
const IS_ALTERNATES = Object.freeze({
  depreciation: ['DepreciationAndAmortisationExpense'],
  pbtBeforeExceptional: ['ProfitBeforeExceptionalAndExtraordinaryItemsAndTax'],
  exceptionalItems: ['ExceptionalItems'],
  pat: ['ProfitLossForThePeriod'],
  associatesShare: ['ShareOfProfitLossOfAssociates'],
  discontinuedAfterTax: ['ProfitLossFromDiscontinuingOperationAfterTax'],
});
const EPS_KEYS = new Set(['epsBasic', 'epsDiluted']);

/** Balance sheet: normalized key -> list of elements to add together. */
const BS_ELEMENTS = Object.freeze({
  borrowingsNonCurrent: ['BorrowingsNoncurrent'],
  borrowingsCurrent: ['BorrowingsCurrent'],
  leaseLiabilitiesNonCurrent: ['LeaseLiabilitiesNoncurrent'],
  tradePayables: ['TradePayablesCurrent', 'TradePayablesNoncurrent'],
  tradeReceivables: ['TradeReceivablesCurrent', 'TradeReceivablesNoncurrent'],
  inventories: ['Inventories'],
  cashAndEquivalents: ['CashAndCashEquivalents'],
  bankBalancesOther: ['BankBalanceOtherThanCashAndCashEquivalents'],
  investmentsNonCurrent: ['NoncurrentInvestments'],
  investmentsCurrent: ['CurrentInvestments'],
  cwip: ['CapitalWorkInProgress'],
  intangiblesUnderDevelopment: ['IntangibleAssetsUnderDevelopment'],
  goodwill: ['Goodwill'],
  otherIntangibles: ['OtherIntangibleAssets'],
  netBlock: ['PropertyPlantAndEquipment'],
  deferredTaxAssets: ['DeferredTaxAssetsNet'],
  deferredTaxLiabilities: ['DeferredTaxLiabilitiesNet'],
  loansAdvancesNonCurrent: ['LoansNoncurrent'],
  loansAdvancesCurrent: ['LoansCurrent'],
  equityShareCapital: ['EquityShareCapital'],
  otherEquity: ['OtherEquity'],
  minorityInterest: ['NoncontrollingInterest'],
  provisionsNonCurrent: ['ProvisionsNoncurrent'],
  provisionsCurrent: ['ProvisionsCurrent'],
  otherNonCurrentAssets: ['OtherNoncurrentAssets', 'OtherNoncurrentFinancialAssets'],
  otherCurrentAssets: ['OtherCurrentAssets', 'OtherCurrentFinancialAssets'],
  otherNonCurrentLiabilities: ['OtherNoncurrentLiabilities', 'OtherNoncurrentFinancialLiabilities'],
  otherCurrentLiabilities: ['OtherCurrentLiabilities', 'OtherCurrentFinancialLiabilities'],
  totalAssets: ['Assets'],
  totalEquityAndLiabilities: ['EquityAndLiabilities'],
});

const WC_OTHER = [
  'AdjustmentsForDecreaseIncreaseInOtherCurrentAssets',
  'AdjustmentsForDecreaseIncreaseInOtherNoncurrentAssets',
  'AdjustmentsForOtherFinancialAssetsNoncurrent',
  'AdjustmentsForOtherFinancialAssetsCurrent',
  'AdjustmentsForOtherBankBalances',
  'AdjustmentsForIncreaseDecreaseInOtherCurrentLiabilities',
  'AdjustmentsForIncreaseDecreaseInOtherNoncurrentLiabilities',
  'AdjustmentsForProvisionsCurrent',
  'AdjustmentsForProvisionsNoncurrent',
  'AdjustmentsForOtherFinancialLiabilitiesCurrent',
  'AdjustmentsForOtherFinancialLiabilitiesNoncurrent',
];
const CAPEX_OUT = [
  'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  'PurchaseOfInvestmentPropertyClassifiedAsInvestingActivities',
  'PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities',
  'PurchaseOfIntangibleAssetsUnderDevelopment',
  'PurchaseOfOtherLongTermAssetsClassifiedAsInvestingActivities',
];

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * @typedef {Object} PickedContexts
 * @property {string|null} quarter - Duration context of the reporting quarter.
 * @property {string|null} cumulative - Longest duration ending at the same date (YTD / half-year / FY); equals quarter for Q1.
 * @property {string|null} instantCur - Balance-sheet date context.
 * @property {string|null} instantPrior - Prior balance-sheet date context (previous year end).
 * @property {string|null} periodEnd - ISO date the filing reports for.
 * @property {number|null} cumulativeDays
 */

/**
 * Choose contexts by their actual dates rather than assuming ids.
 * @param {import('./parse').XbrlParseResult} parsed
 * @returns {PickedContexts}
 */
function pickContexts(parsed) {
  const durs = [];
  const insts = [];
  for (const [id, c] of Object.entries(parsed.contexts || {})) {
    if (c.hasDimensions) continue;
    if (c.start && c.end) durs.push({ id, start: c.start, end: c.end, n: days(c.start, c.end) });
    else if (c.instant) insts.push({ id, at: c.instant });
  }
  const out = {
    quarter: null,
    cumulative: null,
    instantCur: null,
    instantPrior: null,
    periodEnd: null,
    cumulativeDays: null,
    periodDays: null,
  };
  if (!durs.length) return out;
  const end = durs
    .map((d) => d.end)
    .sort()
    .pop();
  out.periodEnd = end;
  const same = durs.filter((d) => d.end === end);
  const qs = same.filter((d) => d.n >= 80 && d.n <= 100).sort((a, b) => a.n - b.n);
  const longest = [...same].sort((a, b) => b.n - a.n)[0];
  // Half-yearly filers (no quarterly results) carry a ~6-month "current period" context instead.
  const hs = qs.length
    ? []
    : same.filter((d) => d.n >= 150 && d.n <= 200).sort((x, y) => x.n - y.n);
  const cur0 = qs[0] || hs[0] || null;
  out.quarter = cur0?.id || null;
  out.periodDays = cur0?.n ?? null;
  out.cumulative = longest?.id || null;
  out.cumulativeDays = longest?.n ?? null;
  const cur = insts.find((i) => i.at === end);
  out.instantCur = cur?.id || null;
  const prior = insts.filter((i) => i.at < end).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  out.instantPrior = prior?.id || null;
  return out;
}

/**
 * Value lookup with an index built once.
 * @param {import('./parse').XbrlFact[]} facts
 * @returns {(local: string, ctx: string|null) => number|undefined}
 */
function lookup(facts) {
  const m = new Map();
  for (const f of facts) {
    const k = `${f.local}|${f.ctx}`;
    if (!m.has(k)) m.set(k, f.value);
  }
  return (local, ctx) => (ctx ? m.get(`${local}|${ctx}`) : undefined);
}

const sumEls = (get, els, ctx) => {
  let any = false;
  let t = 0;
  for (const e of els) {
    const v = get(e, ctx);
    if (v !== undefined) {
      any = true;
      t += v;
    }
  }
  return any ? t : null;
};

/**
 * Income-statement snapshot for one duration context (Rs Cr; EPS unscaled).
 * @param {import('./parse').XbrlParseResult} parsed
 * @param {string|null} ctx
 * @returns {Record<string, number>} Only keys present in the filing.
 */
function incomeSnapshot(parsed, ctx, family = 'indas') {
  const get = lookup(parsed.facts);
  const out = {};
  if (!ctx) return out;
  const fam = FAM.FAMILY_IS[family];
  if (fam) {
    for (const [key, el] of Object.entries(fam)) {
      const v = get(el, ctx);
      if (v === undefined) continue;
      if (FAM.UNSCALED.has(key)) out[key] = v;
      else if (FAM.FRACTION_TO_PCT.test(key)) out[key] = Math.round(v * 10000) / 100;
      else out[key] = v / CR;
    }
    return out;
  }
  for (const [key, el] of Object.entries(IS_ELEMENTS)) {
    let v = get(el, ctx);
    for (const alt of IS_ALTERNATES[key] || []) if (v === undefined) v = get(alt, ctx);
    if (v === undefined) continue;
    out[key] = EPS_KEYS.has(key) ? v : v / CR;
  }
  if (out.pbt == null && out.pbtBeforeExceptional != null) out.pbt = out.pbtBeforeExceptional;
  return out;
}

/**
 * Balance-sheet snapshot at one instant context (Rs Cr).
 * @param {import('./parse').XbrlParseResult} parsed
 * @param {string|null} ctx
 * @returns {Record<string, number>}
 */
function balanceSheetSnapshot(parsed, ctx, family = 'indas') {
  const get = lookup(parsed.facts);
  const out = {};
  if (!ctx) return out;
  for (const [key, els] of Object.entries(FAM.FAMILY_BS[family] || BS_ELEMENTS)) {
    const v = sumEls(get, els, ctx);
    if (v != null) out[key] = v / CR;
  }
  return out;
}

/**
 * Cash-flow snapshot for the cumulative context (Rs Cr, outflows negative).
 * @param {import('./parse').XbrlParseResult} parsed
 * @param {PickedContexts} c
 * @returns {Record<string, number>}
 */
function cashFlowSnapshot(parsed, c) {
  const get = lookup(parsed.facts);
  const d = c.cumulative;
  const out = {};
  if (!d || get('CashFlowsFromUsedInOperatingActivities', d) === undefined) return out;
  const put = (k, v) => {
    if (v != null) out[k] = v / CR;
  };
  const neg = (v) => (v == null ? null : -v);
  put('pbt', get('ProfitBeforeTax', d) ?? null);
  put('depreciation', get('AdjustmentsForDepreciationAndAmortisationExpense', d) ?? null);
  put('financeCostAddBack', get('AdjustmentsForFinanceCosts', d) ?? null);
  const recv = sumEls(
    get,
    [
      'AdjustmentsForDecreaseIncreaseInTradeReceivablesCurrent',
      'AdjustmentsForDecreaseIncreaseInTradeReceivablesNoncurrent',
    ],
    d
  );
  const inv = sumEls(get, ['AdjustmentsForDecreaseIncreaseInInventories'], d);
  const pay = sumEls(
    get,
    [
      'AdjustmentsForIncreaseDecreaseInTradePayablesCurrent',
      'AdjustmentsForIncreaseDecreaseInTradePayablesNoncurrent',
    ],
    d
  );
  const oth = sumEls(get, WC_OTHER, d);
  put('changeInReceivables', recv);
  put('changeInInventories', inv);
  put('changeInPayables', pay);
  put('changeInOtherWC', oth);
  const wc = [recv, inv, pay, oth].reduce((a, v) => a + (v || 0), 0);
  put('wcChangeTotal', wc);
  const ops = get('CashFlowsFromUsedInOperations', d);
  if (ops !== undefined) put('opProfitBeforeWCChanges', ops - wc);
  put('taxPaid', neg(get('IncomeTaxesPaidRefundClassifiedAsOperatingActivities', d)));
  put('cfo', get('CashFlowsFromUsedInOperatingActivities', d));
  put('capex', neg(sumEls(get, CAPEX_OUT, d)));
  put(
    'saleOfPPE',
    get('ProceedsFromSalesOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', d)
  );
  put(
    'purchaseOfInvestments',
    neg(
      get(
        'OtherCashPaymentsToAcquireEquityOrDebtInstrumentsOfOtherEntitiesClassifiedAsInvestingActivities',
        d
      )
    )
  );
  put(
    'saleOfInvestments',
    get(
      'OtherCashReceiptsFromSalesOfEquityOrDebtInstrumentsOfOtherEntitiesClassifiedAsInvestingActivities',
      d
    )
  );
  put('interestReceived', get('InterestReceivedClassifiedAsInvestingActivities', d));
  put(
    'acquisitions',
    neg(
      get(
        'CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities',
        d
      )
    )
  );
  put(
    'loansGiven',
    neg(get('CashAdvancesAndLoansMadeToOtherPartiesClassifiedAsInvestingActivities', d))
  );
  put('cfi', get('CashFlowsFromUsedInInvestingActivities', d));
  put(
    'proceedsFromBorrowings',
    sumEls(
      get,
      [
        'ProceedsFromBorrowingsClassifiedAsFinancingActivities',
        'ProceedsFromIssuingDebenturesNotesBondsEtc',
      ],
      d
    )
  );
  put(
    'repaymentOfBorrowings',
    neg(get('RepaymentsOfBorrowingsClassifiedAsFinancingActivities', d))
  );
  put(
    'proceedsFromEquity',
    sumEls(
      get,
      [
        'ProceedsFromIssuingSharesClassifiedAsFinancingActivities',
        'ProceedsFromExerciseOfStockOptions',
      ],
      d
    )
  );
  put('buyback', neg(get('PaymentsToAcquireOrRedeemEntitysShares', d)));
  put('dividendPaid', neg(get('DividendsPaidClassifiedAsFinancingActivities', d)));
  put('interestPaid', neg(get('InterestPaidClassifiedAsFinancingActivities', d)));
  put('cff', get('CashFlowsFromUsedInFinancingActivities', d));
  put('netCashChange', get('IncreaseDecreaseInCashAndCashEquivalents', d));
  put('fxEffect', get('EffectOfExchangeRateChangesOnCashAndCashEquivalents', d));
  put('openingCash', get('CashAndCashEquivalentsCashFlowStatement', c.instantPrior));
  put('closingCash', get('CashAndCashEquivalentsCashFlowStatement', c.instantCur));
  return out;
}

/**
 * Arithmetic checks on a snapshot. Returns human-readable failures.
 * @param {{is?: Record<string,number>, bs?: Record<string,number>, cf?: Record<string,number>}} s
 * @returns {Array<{check: string, expected: number, actual: number, severity: 'major'|'minor'}>}
 */
function sumChecks({ is = {}, bs = {}, cf = {}, family = 'indas' }) {
  const out = [];
  const close = (a, b, scale) => Math.abs(a - b) <= Math.max(0.06, Math.abs(scale) * 0.002);
  const add = (check, expected, actual, scale, severity = 'major') => {
    if (expected == null || actual == null) return;
    if (!close(expected, actual, scale ?? actual)) out.push({ check, expected, actual, severity });
  };
  const industrial = !FAM.NON_INDUSTRIAL.includes(family);
  if (!industrial) out.push(...FAM.familySumChecks(family, is));
  if (industrial && is.revenue != null && is.otherIncome != null)
    add(
      'revenue+otherIncome=totalIncome',
      is.revenue + is.otherIncome,
      is.totalIncome,
      is.totalIncome
    );
  if (industrial && is.totalIncome != null && is.totalExpenses != null)
    add(
      'totalIncome-totalExpenses=pbtBeforeExceptional',
      is.totalIncome - is.totalExpenses,
      is.pbtBeforeExceptional,
      is.totalIncome
    );
  if (industrial && is.pbtBeforeExceptional != null && is.exceptionalItems != null)
    add(
      'pbtBeforeExceptional+exceptional(+extraordinary)=pbt',
      is.pbtBeforeExceptional + is.exceptionalItems + (is.extraordinaryItems || 0),
      is.pbt,
      is.totalIncome
    );
  if (industrial && is.pbt != null && is.tax != null)
    add(
      'pbt-tax(+deferral,associates,discontinued)=pat',
      is.pbt -
        is.tax +
        (is.regulatoryDeferralMovement || 0) +
        (is.associatesShare || 0) +
        (is.minorityInterestAdj || 0) +
        (is.discontinuedAfterTax || 0),
      is.pat,
      is.totalIncome,
      'minor'
    );
  add('assets=equity+liabilities', bs.totalAssets, bs.totalEquityAndLiabilities, bs.totalAssets);
  if (cf.cfo != null && cf.cfi != null && cf.cff != null)
    add(
      'cfo+cfi+cff+fx=netCashChange',
      cf.cfo + cf.cfi + cf.cff + (cf.fxEffect || 0),
      cf.netCashChange,
      cf.cfo,
      'minor'
    );
  return out;
}

/**
 * Numeric facts in the quarter context that no mapping consumed (for the
 * UNMAPPED_ELEMENT report; never silently dropped).
 * @param {import('./parse').XbrlParseResult} parsed
 * @param {PickedContexts} c
 * @returns {string[]}
 */
function unmappedElements(parsed, c, family = 'indas') {
  const used = new Set([
    ...Object.values(FAM.FAMILY_IS[family] || {}),
    ...Object.values(FAM.FAMILY_BS[family] || {}).flat(),
    ...Object.values(IS_ELEMENTS),
    ...Object.values(IS_ALTERNATES).flat(),
    ...Object.values(BS_ELEMENTS).flat(),
    ...WC_OTHER,
    ...CAPEX_OUT,
  ]);
  const SUBTOTAL =
    /^(Current|Noncurrent)(Assets|Liabilities|Financial|TaxAssets|TaxLiabilities)|^(Comprehensive|OtherComprehensive|AmountOfItem|IncomeTaxRelating|PaidUp|FaceValue|NumberOf|NetMovementInRegulatory|Basic|Diluted|Biological|Investment|Regulatory|LiabilitiesDirectly|NoncurrentAssetsClassified|Equity|Liabilities$|TotalOutstanding|DeferredGovernment|CurrentTax)/;
  const ctxs = new Set([c.quarter, c.cumulative, c.instantCur, c.instantPrior].filter(Boolean));
  const names = new Set();
  for (const f of parsed.facts) {
    if (
      ctxs.has(f.ctx) &&
      !used.has(f.local) &&
      !SUBTOTAL.test(f.local) &&
      !/^(Adjustments|CashFlows|Cash[A-Z]|Proceeds|Purchase|Payments|Interest|Income|Dividends|Repayments|Increase|Effect)/.test(
        f.local
      )
    ) {
      names.add(f.local);
    }
  }
  return [...names].sort();
}

module.exports = {
  SUPPORTED_FAMILIES,
  IS_ELEMENTS,
  BS_ELEMENTS,
  pickContexts,
  incomeSnapshot,
  balanceSheetSnapshot,
  cashFlowSnapshot,
  sumChecks,
  unmappedElements,
};
