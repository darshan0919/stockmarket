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
    expect(ctx.computedKpiCards).toHaveLength(5);
    expect(ctx.statementHealth.income.grade).toBe('CLEAN');
    expect(ctx.toneExcerpts).toEqual(['sample tone']);
  });
});
