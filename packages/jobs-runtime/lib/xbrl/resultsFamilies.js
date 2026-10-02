'use strict';

/**
 * Element maps for result families whose statements are not the industrial P&L: banks, life
 * insurers and general insurers (NSE `INTEGRATED_FILING_BANKING|LI|GI`, BSE `IFBanking|IFGI`).
 * Keys reuse the normalized names of resultsAdapter where the meaning is the same (`pbt`, `tax`,
 * `pat`, `epsBasic`, ...) and add family KPIs. `revenue` is TOTAL INCOME for these families
 * (banks: interest earned + other income; insurers: total operating income), so an EBITDA-style
 * signal scan does not apply: `signalScanApplicable` is false for them.
 */

const BANK_IS = Object.freeze({
  revenue: 'Income',
  interestEarned: 'InterestEarned',
  otherIncome: 'OtherIncome',
  interest: 'InterestExpended',
  employeeCost: 'EmployeesCost',
  otherExpenses: 'OtherOperatingExpenses',
  operatingExpenses: 'OperatingExpenses',
  ppop: 'OperatingProfitBeforeProvisionAndContingencies',
  provisions: 'ProvisionsOtherThanTaxAndContingencies',
  exceptionalItems: 'ExceptionalItems',
  pbt: 'ProfitLossFromOrdinaryActivitiesBeforeTax',
  tax: 'TaxExpense',
  patAfterTaxOrdinary: 'ProfitLossFromOrdinaryActivitiesAfterTax',
  pat: 'ProfitLossForThePeriod',
  associatesShare: 'ShareOfProfitLossOfAssociates',
  nci: 'ProfitLossOfMinorityInterest',
  patOwners: 'ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates',
  epsBasic: 'BasicEarningsPerShareAfterExtraordinaryItems',
  epsDiluted: 'DilutedEarningsPerShareAfterExtraordinaryItems',
  gnpaPct: 'PercentageOfGrossNpa',
  nnpaPct: 'PercentageOfNpa',
  cet1Pct: 'CET1Ratio',
});

const LIFE_IS = Object.freeze({
  revenue: 'Income',
  grossPremium: 'GrossPremiumIncome',
  netPremium: 'NetPremiumIncome',
  firstYearPremium: 'IncomeFirstYearPremium',
  renewalPremium: 'IncomeRenewalPremium',
  singlePremium: 'IncomeSinglePremium',
  investmentIncome: 'IncomeFromInvestmentsNet',
  commission: 'Commission',
  employeeCost: 'EmployeesRemunerationAndWelfareExpenses',
  operatingExpenses: 'OperatingExpensesRelatedToInsuranceBusiness',
  managementExpenses: 'ExpensesOfManagement',
  benefitsPaid: 'BenefitsPaidNet',
  actuarialLiabilityChange: 'ChangeInActuarialLiability',
  totalExpenses: 'Expenses',
  surplus: 'NetSurplusDeficit',
  pbt: 'ProfitLossBeforeTax',
  tax: 'ProvisionsForTaxes',
  pat: 'ProfitLossAfterTaxAndExtraordinaryItems',
  epsBasic: 'BasicAndDilutedEPSAfterExtraordinaryItemsNetOfTaxExpenseForThePeriodNotToBeAnnualized',
  epsDiluted:
    'BasicAndDilutedEPSAfterExtraordinaryItemsNetOfTaxExpenseForThePeriodNotToBeAnnualized',
  solvencyRatio: 'SolvencyRatio',
  expenseOfManagementRatioPct: 'ExpensesOfManagementRatio',
});

const GENERAL_IS = Object.freeze({
  revenue: 'OperatingIncome',
  grossPremium: 'GrossPremiumsWritten',
  netPremiumWritten: 'NetPremiumWritten',
  premiumEarned: 'PremiumEarned',
  investmentIncome: 'IncomeFromInvestmentsNet',
  otherIncome: 'OtherIncome',
  commission: 'CommissionsAndBrokerageNet',
  employeeCost: 'EmployeesRemunerationAndWelfareExpenses',
  operatingExpenses: 'OperatingExpensesRelatedToInsuranceBusiness',
  incurredClaims: 'IncurredClaims',
  totalExpenses: 'OperatingExpenses',
  underwritingResult: 'UnderwritingProfitOrLoss',
  operatingProfit: 'OperatingProfitOrLoss',
  pbt: 'ProfitOrLossBeforeTax',
  tax: 'ProvisionForTax',
  pat: 'ProfitLossAfterTax',
  epsBasic: 'BasicAndDilutedEPSAfterExtraordinaryItemsNetOfTaxExpenseForThePeriodNotToBeAnnualized',
  epsDiluted:
    'BasicAndDilutedEPSAfterExtraordinaryItemsNetOfTaxExpenseForThePeriodNotToBeAnnualized',
  solvencyRatio: 'SolvencyRatio',
  combinedRatioPct: 'CombinedRatio',
  incurredClaimRatioPct: 'IncurredClaimRatio',
  expenseOfManagementRatioPct: 'ExpensesOfManagementRatio',
  netRetentionRatioPct: 'NetRetentionRatio',
});

/** Keys that are unscaled (EPS, ratios given as fractions to convert to percent, or plain ratios). */
const UNSCALED = new Set(['epsBasic', 'epsDiluted', 'solvencyRatio']);
const FRACTION_TO_PCT = /(Pct|RatioPct)$/;

const FAMILY_IS = Object.freeze({
  banking: BANK_IS,
  'life-insurance': LIFE_IS,
  'general-insurance': GENERAL_IS,
});

const BANK_BS = Object.freeze({
  equityShareCapital: ['Capital'],
  reserves: ['ReservesAndSurplus'],
  deposits: ['Deposits'],
  borrowings: ['Borrowings'],
  otherLiabilities: ['OtherLiabilitiesAndProvisions'],
  totalEquityAndLiabilities: ['CapitalAndLiabilities'],
  cashAndRbi: ['CashAndBalancesWithReserveBankOfIndia'],
  interbankBalances: ['BalancesWithBanksAndMoneyAtCallAndShortNotice'],
  investments: ['Investments'],
  advances: ['Advances'],
  fixedAssets: ['FixedAssets'],
  otherAssets: ['OtherAssets'],
  totalAssets: ['Assets'],
});

const INSURER_BS = Object.freeze({
  shareCapital: ['ShareCapital', 'PaidUpEquityShareCapital'],
  reserves: ['ReservesAndSurplus'],
  shareholdersFunds: ['ShareholdersFunds'],
  policyholdersFunds: ['PolicyholdersFunds'],
  policyLiabilities: ['PolicyLiabilities'],
  linkedLiabilities: ['LinkedLiabilities'],
  borrowings: ['Borrowings'],
  loans: ['Loans'],
  investments: ['Investments'],
  investmentsShareholders: ['InvestmentsShareholders', 'InvestmentsShareholderFund'],
  investmentsPolicyholders: ['InvestmentsPolicyholders', 'InvestmentsPolicyholdersFund'],
  fixedAssets: ['FixedAssets'],
  cashAndBank: ['CashAndBankBalances'],
  currentLiabilities: ['CurrentLiabilities'],
  provisions: ['Provisions'],
  contingentLiabilities: ['ContigentLiabilities'],
  // IRDAI format is net of current liabilities: SourcesOfFunds == ApplicationOfFunds. The bare 'Assets'
  // element is NOT the balance-sheet total for general insurers (NIACL, NIVABUPA). Lists are SUMMED, so
  // never put both here.
  totalAssets: ['ApplicationOfFunds'],
  totalEquityAndLiabilities: ['SourcesOfFunds'],
});

const FAMILY_BS = Object.freeze({
  banking: BANK_BS,
  'life-insurance': INSURER_BS,
  'general-insurance': INSURER_BS,
});

const NON_INDUSTRIAL = Object.freeze(Object.keys(FAMILY_IS));

/**
 * Family-specific arithmetic checks (Rs Cr). Returns `{check, expected, actual, severity}` items.
 * @param {string} family
 * @param {Record<string, number>} is
 * @returns {Array<Object>}
 */
function familySumChecks(family, is) {
  const out = [];
  const scale = Math.abs(is.revenue ?? is.pbt ?? 1);
  const add = (check, expected, actual) => {
    if (expected == null || actual == null) return;
    if (Math.abs(expected - actual) > Math.max(0.06, scale * 0.002))
      out.push({ check, expected, actual, severity: 'minor' });
  };
  if (family === 'banking') {
    if (is.ppop != null && is.provisions != null && is.pbt != null)
      add(
        'ppop-provisions+exceptional=pbt',
        is.ppop - is.provisions + (is.exceptionalItems || 0),
        is.pbt
      );
    if (is.interestEarned != null && is.otherIncome != null)
      add('interestEarned+otherIncome=totalIncome', is.interestEarned + is.otherIncome, is.revenue);
    if (is.pbt != null && is.tax != null && is.patAfterTaxOrdinary != null)
      add('pbt-tax=patAfterTax', is.pbt - is.tax, is.patAfterTaxOrdinary);
  } else if (is.pbt != null && is.tax != null && is.pat != null) {
    add('pbt-tax=pat', is.pbt - is.tax, is.pat);
  }
  return out;
}

module.exports = {
  FAMILY_IS,
  FAMILY_BS,
  NON_INDUSTRIAL,
  UNSCALED,
  FRACTION_TO_PCT,
  familySumChecks,
};
