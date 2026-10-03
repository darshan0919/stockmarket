'use strict';

const { computeJCurveFinancialHealth, pctGrowth, round } = require('../jcurveFinancialMetrics');

describe('computeJCurveFinancialHealth', () => {
  test('confirms real J-curve operating leverage (PAT > EBITDA > Revenue)', () => {
    // Current quarter: Q1FY27 (Rev 150, EBITDA 35, EBIT 30, PBT 26, PAT 20, Tax 6)
    // Prior year:    Q1FY26 (Rev 100, EBITDA 20, EBIT 15, PBT 12, PAT 9, Tax 3)
    const quarters = [
      {
        period: 'Q1FY27',
        revenue: 150,
        ebitda: 35,
        ebit: 30,
        pbt: 26,
        pat: 20,
        tax: 6,
        otherIncome: 1,
      },
      { period: 'Q4FY26', revenue: 130, ebitda: 28, pat: 16 },
      { period: 'Q3FY26', revenue: 120, ebitda: 24, pat: 13 },
      { period: 'Q2FY26', revenue: 110, ebitda: 22, pat: 11 },
      {
        period: 'Q1FY26',
        revenue: 100,
        ebitda: 20,
        ebit: 15,
        pbt: 12,
        pat: 9,
        tax: 3,
        otherIncome: 0.5,
      },
    ];

    const result = computeJCurveFinancialHealth(quarters);

    expect(result.currentPeriod).toBe('Q1FY27');
    expect(result.priorYearPeriod).toBe('Q1FY26');
    expect(result.revenueGrowthYoY).toBe(50);
    expect(result.ebitdaGrowthYoY).toBe(75);
    expect(result.patGrowthYoY).toBeCloseTo(122.22, 1);

    // Dr. Anil Lamba's Combined Leverage = %ΔPAT / %ΔRev = 122.22 / 50 ≈ 2.44x
    expect(result.operatingLeverageConfirmed).toBe(true);
    expect(result.combinedLeverageMultiple).toBeCloseTo(2.44, 1);
    expect(result.clearsPatThreshold).toBe(true);
    expect(result.clearsBuoyantPairing).toBe(true);
    expect(result.verdictClassification).toBe('REAL_JCURVE');
    expect(result.fakeJCurveAudit.triggeredFlags).toEqual([]);
    expect(result.summary).toContain('Operating Leverage CONFIRMED');
  });

  test('catches Fake J-Curve: Other Income distortion (NSE:JINDWORLD case study)', () => {
    // PAT surged +86%, but 88% was an EV asset sale booked in other income
    const quarters = [
      {
        period: 'Q1FY27',
        revenue: 110,
        ebitda: 12,
        ebit: 10,
        pbt: 28, // PBT inflated to 28
        pat: 21, // PAT 21 (+86% from 11.3)
        otherIncome: 19, // Other income is 19/28 = 67.8% of PBT!
        tax: 7,
      },
      { period: 'Q4FY26', revenue: 105, pat: 12 },
      { period: 'Q3FY26', revenue: 102, pat: 11 },
      { period: 'Q2FY26', revenue: 100, pat: 11 },
      {
        period: 'Q1FY26',
        revenue: 100,
        ebitda: 11,
        ebit: 9.5,
        pbt: 14,
        pat: 11.3,
        otherIncome: 2,
        tax: 2.7,
      },
    ];

    const result = computeJCurveFinancialHealth(quarters);

    expect(result.patGrowthYoY).toBeCloseTo(85.84, 1);
    expect(result.revenueGrowthYoY).toBe(10);
    expect(result.fakeJCurveAudit.otherIncomeDistortion).toBe(true);
    expect(result.fakeJCurveAudit.otherIncomeToPbtPct).toBeCloseTo(67.86, 1);
    expect(result.verdictClassification).toBe('SUSPECT_FAKE');
    expect(result.summary).toContain('WARNING: SUSPECT FAKE J-CURVE');
    expect(result.summary).toContain('Other Income Distortion');
  });

  test('catches Low Base anomaly (depressed prior-year PAT)', () => {
    const quarters = [
      { period: 'Q1FY27', revenue: 105, ebitda: 15, pbt: 12, pat: 9, tax: 3 },
      { period: 'Q4FY26', revenue: 100, pat: 8 },
      { period: 'Q3FY26', revenue: 98, pat: 8.5 },
      { period: 'Q2FY26', revenue: 95, pat: 8 },
      { period: 'Q1FY26', revenue: 90, ebitda: 3, pbt: 1, pat: 0.5, tax: 0.5 }, // Abnormally low base (0.5 Cr vs ~8 Cr normal)
    ];

    const result = computeJCurveFinancialHealth(quarters);

    expect(result.patGrowthYoY).toBe(1700); // 1700% growth off 0.5 Cr
    expect(result.fakeJCurveAudit.lowBaseDetected).toBe(true);
    expect(result.verdictClassification).toBe('SUSPECT_FAKE');
    expect(result.summary).toContain('Low Base');
  });

  test('detects Effective Tax Rate anomaly & Exceptional items', () => {
    const quarters = [
      {
        period: 'Q1FY27',
        revenue: 120,
        ebitda: 20,
        pbt: 18,
        pat: 16.5,
        exceptionalItems: 5, // Exceptional items 5/18 = 27.7% of PBT
        tax: 1.5, // Effective tax rate 1.5/18 = 8.3% (< 15%)
      },
      { period: 'Q1FY26', revenue: 100, ebitda: 18, pbt: 15, pat: 11, tax: 4 }, // Prior tax rate 4/15 = 26.6%
    ];

    const result = computeJCurveFinancialHealth(quarters);

    expect(result.fakeJCurveAudit.exceptionalItemDistortion).toBe(true);
    expect(result.fakeJCurveAudit.taxRateAnomaly).toBe(true);
    expect(result.fakeJCurveAudit.effectiveTaxRate).toBeCloseTo(8.33, 1);
    expect(result.verdictClassification).toBe('SUSPECT_FAKE');
  });

  test('detects Operating Deleverage Risk (Lamba Rule)', () => {
    // Revenue stagnant (+1%), interest consumes >40% of EBITDA
    const quarters = [
      { period: 'Q1FY27', revenue: 101, ebitda: 10, interest: 5, pbt: 4, pat: 3 },
      { period: 'Q1FY26', revenue: 100, ebitda: 12, interest: 5, pbt: 6, pat: 4.5 },
    ];

    const result = computeJCurveFinancialHealth(quarters);

    expect(result.fakeJCurveAudit.operatingDeleverageRisk).toBe(true);
    expect(
      result.fakeJCurveAudit.triggeredFlags.some((f) => f.includes('Operating Deleverage Risk'))
    ).toBe(true);
  });

  test('handles empty or malformed inputs without throwing', () => {
    const result = computeJCurveFinancialHealth([]);
    expect(result.currentPeriod).toBe('UNKNOWN');
    expect(result.operatingLeverageConfirmed).toBe(false);
    expect(result.verdictClassification).toBe('CONTRACTION');

    const resultNull = computeJCurveFinancialHealth(null);
    expect(resultNull.verdictClassification).toBe('CONTRACTION');
  });
});

describe('helpers', () => {
  test('pctGrowth handles zeros and negatives', () => {
    expect(pctGrowth(150, 100)).toBe(50);
    expect(pctGrowth(50, 100)).toBe(-50);
    expect(pctGrowth(10, 0)).toBe(100);
    expect(pctGrowth(-10, 0)).toBe(-100);
    expect(pctGrowth(null, 100)).toBeNull();
  });

  test('round handles nulls and decimals', () => {
    expect(round(12.3456, 2)).toBe(12.35);
    expect(round(null)).toBeNull();
  });
});
