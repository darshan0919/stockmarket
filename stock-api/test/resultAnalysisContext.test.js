'use strict';

const {
  computeKpiCards,
  gradeStatementHealth,
  computeMandatoryChips,
  buildAnalysisContext,
} = require('../src/analyzers/resultAnalysisContext');

describe('resultAnalysisContext analyzer', () => {
  const sampleHeadline = {
    revenue: { val: 1240.5, qoqPct: 4.2, yoyPct: 15.6, yoyVal: 1073.1 },
    ebitdaMargin: { val: 22.4, yoyBps: 120, yoyVal: 21.2 },
    pat: { val: 185.0, yoyPct: 22.0, yoyVal: 151.6 },
    effectiveTaxRate: { val: 24.5, yoyBps: -40, yoyVal: 24.9 },
    eps: { val: 12.5, yoyPct: 21.8 },
  };

  it('computes formatted KPI cards with basis and tone', () => {
    const cards = computeKpiCards(sampleHeadline);
    expect(cards).toHaveLength(5);

    const revCard = cards.find((c) => c.label === 'Revenue');
    expect(revCard.value).toBe('₹1240.5 Cr');
    expect(revCard.subtext).toContain('+15.6% YoY');
    expect(revCard.tone).toBe('pos');

    const mrgCard = cards.find((c) => c.label === 'EBITDA Margin');
    expect(mrgCard.value).toBe('22.4%');
    expect(mrgCard.subtext).toContain('+120 bps YoY');
    expect(mrgCard.tone).toBe('pos');
  });

  it('detects mandatory verdict chips from combination flags', () => {
    const record = {
      headlineFinancials: sampleHeadline,
      incomeStatementSignals: {
        combinations: [
          { flag: 'INVENTORY_GAIN_DRIVEN', severity: 'medium' },
          { flag: 'TAX_RATE_DRIVEN_PAT_SWING', severity: 'low' },
        ],
      },
    };

    const chips = computeMandatoryChips(record);
    expect(chips).toContain('INVENTORY-GAIN DRIVEN');
    expect(chips).toContain('TAX-RATE DRIVEN');
  });

  it('detects working capital drain and cash conversion chips from balance sheet and cash flow signals', () => {
    const record = {
      balanceSheetSignals: {
        material: [
          { id: 'receivablesVsRevenue', label: 'Receivables growth vs revenue growth' },
          { id: 'inventoryVsRevenue', label: 'Inventory growth vs revenue growth' },
        ],
      },
      cashflowSignals: {
        material: [
          { id: 'cfoToPat', label: 'CFO / PAT conversion ratio' },
          { id: 'workingCapitalDrag', label: 'Working capital drag on operating cash flow' },
        ],
      },
    };

    const chips = computeMandatoryChips(record);
    expect(chips).toContain('WORKING-CAPITAL DRAIN (DEBTORS SPIKE)');
    expect(chips).toContain('INVENTORY BLOAT');
    expect(chips).toContain('POOR CASH CONVERSION');
    expect(chips).toContain('WORKING-CAPITAL CASH DRAIN');
  });

  it('grades statement health correctly when balance sheet is absent for Q1/Q3', () => {
    const record = {
      incomeStatementSignals: { combinations: [] },
      statementAvailability: {
        balanceSheet: { status: 'absent' },
        cashflow: { status: 'absent' },
      },
    };

    const health = gradeStatementHealth(record);
    expect(health.income.grade).toBe('CLEAN');
    expect(health.balanceSheet.grade).toBe('ABSENT');
    expect(health.cashflow.grade).toBe('ABSENT');
  });

  it('builds consolidated analysis context cleanly', () => {
    const record = {
      companyId: 'NSE:TCS',
      quarter: 'Q3 FY26',
      date: '2026-01-15',
      headlineFinancials: sampleHeadline,
      incomeStatementSignals: { combinations: [] },
      statementAvailability: {
        balanceSheet: { status: 'absent' },
        cashflow: { status: 'absent' },
      },
      toneExcerpts: ['sample tone'],
    };

    const ctx = buildAnalysisContext(record);
    expect(ctx.companyId).toBe('NSE:TCS');
    expect(ctx.isNbfc).toBe(false);
    expect(ctx.computedKpiCards).toHaveLength(5);
    expect(ctx.statementHealth.income.grade).toBe('CLEAN');
    expect(ctx.toneExcerpts).toEqual(['sample tone']);
  });

  describe('NBFC specific handling', () => {
    const nbfcRecord = {
      companyId: 'NSE:POONAWALLA',
      family: 'nbfc',
      industry: 'Conglomerate Backed NBFC',
      statementAvailability: {
        balanceSheet: { status: 'fresh' },
        cashflow: { status: 'fresh' },
      },
      headlineFinancials: [],
      balanceSheetSignals: {
        derived: {
          current: { netWorth: 13754.07 },
          prior: { netWorth: 10348.24 },
        },
        material: [],
      },
      cashflowSignals: {
        material: [
          {
            id: 'cfoSign',
            cfo: -12763.33,
            negative: true,
          },
          {
            id: 'cfoToPat',
            cfoToPatPct: -1869.9,
          },
          {
            id: 'workingCapitalDrag',
            wcChangeTotal: -14345.24,
          },
          {
            id: 'fundingGap',
            externalFundingNeed: 13197.34,
            externalFundingRaised: 13186.23,
            netBorrowings: 10736.23,
            equityRaised: 2450.0,
          },
        ],
        combinations: [
          {
            flag: 'ACCRUAL_HEAVY_PROFIT',
            severity: 'high',
            note: 'Profit is not converting to cash.',
          },
        ],
      },
      kpiExcerpts: [
        { label: 'AUM', value: '₹74,008 Cr', comparison: '+55.1% YoY' },
        { label: 'RoA', value: '2.18%', comparison: '+149 bps YoY' },
        { label: 'Gross NPA', value: '1.20%', comparison: '-39 bps YoY' },
        { label: 'Net Worth', value: '₹13,754 Cr', comparison: '+32.9% YoY' },
        { label: 'Book Value Per Share', value: '₹156.19', comparison: '+21.9% YoY' },
        { label: 'Price to Book (P/B)', value: '2.86x', comparison: 'at CMP ₹447.30' },
      ],
      toneExcerpts: [
        {
          quote:
            'Credit cost this quarter has declined by 25 basis points... 6 MOB 30+ dropped to 0.35%',
        },
        { quote: 'We have now sustained net income of over 9% over three quarters' },
      ],
      strategicExcerpts: [
        { details: 'Completed QIP of ₹2,500 Cr. Debt-to-equity ratio at 4.30x and CAR at 18.68%.' },
      ],
    };

    it('suppresses false-positive industrial cash flow flags and grades CLEAN for funded AUM expansion', () => {
      const health = gradeStatementHealth(nbfcRecord);
      expect(health.cashflow.grade).toBe('CLEAN');
      expect(health.cashflow.brief).toContain('reflects loan disbursements');
      expect(health.cashflow.brief).toContain('fully funded via borrowings/equity');

      const chips = computeMandatoryChips(nbfcRecord);
      expect(chips).not.toContain('POOR CASH CONVERSION');
      expect(chips).not.toContain('WORKING-CAPITAL CASH DRAIN');
      expect(chips).toContain('AUM EXPANSION FUNDED');
      expect(chips).toContain('BOOK VALUE ACCRETION');
      expect(chips).toContain('DISBURSEMENT ACCELERATION');
    });

    it('generates NBFC-specific KPI cards from excerpts with correct tones', () => {
      const cards = computeKpiCards(nbfcRecord.headlineFinancials, {
        isNbfc: true,
        kpiExcerpts: nbfcRecord.kpiExcerpts,
      });

      expect(cards.length).toBeGreaterThanOrEqual(6);
      const aumCard = cards.find((c) => c.label === 'AUM');
      expect(aumCard.value).toBe('₹74,008 Cr');
      expect(aumCard.tone).toBe('pos');

      const roaCard = cards.find((c) => c.label === 'RoA');
      expect(roaCard.value).toBe('2.18%');
      expect(roaCard.tone).toBe('pos');

      const gnpaCard = cards.find((c) => c.label === 'Gross NPA');
      expect(gnpaCard.value).toBe('1.20%');
      expect(gnpaCard.tone).toBe('pos'); // GNPA decline is positive
    });

    it('builds nbfcQualityChecks payload with RoA tree, capital, and valuation metrics', () => {
      const ctx = buildAnalysisContext(nbfcRecord);
      expect(ctx.isNbfc).toBe(true);
      expect(ctx.nbfcQualityChecks).toBeDefined();
      expect(ctx.nbfcQualityChecks.isNbfc).toBe(true);
      expect(ctx.nbfcQualityChecks.valuation.bvps.value).toBe('₹156.19');
      expect(ctx.nbfcQualityChecks.valuation.pbRatio.value).toBe('2.86x');
      expect(ctx.nbfcQualityChecks.capitalAndLeverage.car).toBe('18.68%');
      expect(ctx.nbfcQualityChecks.capitalAndLeverage.debtToEquity).toBe('4.30x');
      expect(ctx.nbfcQualityChecks.almAndFunding.covered).toBe(true);
    });
  });
});
