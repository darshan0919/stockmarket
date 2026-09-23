'use strict';

/**
 * Regression coverage for extract_income_statement.js — the parser that
 * replaced the 2026-09-23 SUPRIYA run's manual `pdftotext -layout`
 * transcription step. Fixture text below mirrors the real column layout a
 * Result filing prints (numbered line items, "Rs. in Lakhs" unit header,
 * parenthesised negatives, current-quarter-first column order) so a
 * regression here means a real filing would silently mis-parse too.
 *
 * The fixture's raw current/QoQ/YoY figures are proportionally identical to
 * NSE:SUPRIYA's real Q1 FY27 P&L (see stock-api/test/incomeStatementSignals.test.js) —
 * just re-denominated into lakhs — specifically so that feeding this
 * fixture's lineData into incomeStatementSignals.getOrCompute() reproduces
 * the same RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD combination flag that
 * fix covers, proving the two pieces compose end-to-end.
 */

const {
  extractIncomeStatement,
  mapRows3Col,
  IS_MAP,
  coreEbitda,
  taxRate,
} = require('../extract_income_statement.js');
const {
  getOrCompute,
} = require('../../../../../stock-api/src/analyzers/incomeStatementSignals.js');

const FIXTURE_TEXT = `
XYZ LIMITED
Statement of Standalone Unaudited Financial Results for the Quarter Ended 30th June, 2026
(Rs. in Lakhs, unless otherwise stated)

                                                              Quarter Ended       Quarter Ended    Quarter Ended
                                                               30.06.2026         31.03.2026        30.06.2025
1  Revenue from operations                                       1,897.47           2,765.28          1,450.74
2  Other income                                                     26.48              34.78             26.74
3  Total income (1+2)                                            1,923.95           2,800.06          1,477.48
4  Expenses
   Cost of materials consumed                                   1,094.00             833.61            437.76
   Changes in inventories of finished goods, WIP and stock-in-trade  (530.15)      219.66           (120.04)
   Employee benefits expense                                      284.90             248.17            226.88
   Finance costs                                                     3.74               4.68              5.12
   Depreciation and amortisation expense                           89.40              84.98             64.51
   Other expenses                                                 574.14             487.67            389.13
   Total expenses                                                1,516.03           1,878.77          1,003.40
5  Profit before exceptional items and tax (3-4)                  407.92             921.29            474.12
6  Exceptional items                                                  -                  -                 -
7  Profit before tax (5-6)                                        407.92             921.29            474.12
8  Tax expense
   Current tax                                                     85.13             204.16            105.35
   Deferred tax                                                     82.36             (25.16)            20.87
9  Profit for the period (7-8)                                    240.43             742.29            347.90
10 Earnings per equity share (Face value Rs.10 each)
   Basic (Rs.)                                                      2.99               9.22              4.32
   Diluted (Rs.)                                                    2.99               9.22              4.32
`;

describe('extract_income_statement', () => {
  it('locates the P&L table and parses all three columns (current, QoQ, YoY)', () => {
    const result = extractIncomeStatement({ resultText: FIXTURE_TEXT, pptText: null });
    expect(result.found).toBe(true);
    expect(result.source).toBe('Result');
    expect(result.unit).toBe('lakh');
    // toCr for lakh = 0.01, so 1,897.47 lakh -> 18.9747 cr
    expect(result.raw.cur.revenue).toBeCloseTo(18.9747, 4);
    expect(result.raw.qoq.revenue).toBeCloseTo(27.6528, 4);
    expect(result.raw.yoy.revenue).toBeCloseTo(14.5074, 4);
    expect(result.raw.cur.pbt).toBeCloseTo(4.0792, 4);
    expect(result.raw.cur.pat).toBeCloseTo(2.4043, 4);
  });

  it('strips numbered line-item markers so they are never mistaken for data (the bug this run found)', () => {
    // Without the ITEM_MARKER_RE fix in extract_statements.js's parseRows(),
    // the leading "1", "5", "7", "9", "10" row numbers were parsed as the
    // row's first (current-period) numeric value, corrupting every numbered row.
    const result = extractIncomeStatement({ resultText: FIXTURE_TEXT, pptText: null });
    expect(result.raw.cur.revenue).not.toBeCloseTo(0.01, 2);
    expect(result.raw.cur.pbt).not.toBeCloseTo(0.05, 2);
  });

  it('does not misclassify eps rows or drop unmapped rows silently', () => {
    const result = extractIncomeStatement({ resultText: FIXTURE_TEXT, pptText: null });
    expect(result.raw.cur.epsBasic).toBeCloseTo(2.99, 2);
    expect(result.raw.cur.epsDiluted).toBeCloseTo(2.99, 2);
    expect(Array.isArray(result.unmatched)).toBe(true);
  });

  it('produces lineData/context that reproduces the direction-aware inventory-gain fix end-to-end', () => {
    const { lineData, context } = extractIncomeStatement({
      resultText: FIXTURE_TEXT,
      pptText: null,
    });
    const signals = getOrCompute('NSE:FIXTURETEST', '202606-test', lineData, context);
    const flags = signals.combinations.map((c) => c.flag);
    expect(flags).toContain('RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD');
    expect(flags).not.toContain('INVENTORY_GAIN_DRIVEN');
  });

  it('returns found:false rather than throwing when no P&L table is present', () => {
    const result = extractIncomeStatement({
      resultText: 'no financial content here',
      pptText: null,
    });
    expect(result.found).toBe(false);
  });

  describe('mapRows3Col', () => {
    it('captures up to 3 leading numeric columns per matched label, first-occurrence-wins', () => {
      const rows = [
        { label: 'Revenue from operations', values: [100, 90, 80], raw: '' },
        { label: 'Revenue from operations (restated)', values: [999], raw: '' }, // duplicate key, ignored
      ];
      const { cur, qoq, yoy } = mapRows3Col(rows, IS_MAP, 1);
      expect(cur.revenue).toBe(100);
      expect(qoq.revenue).toBe(90);
      expect(yoy.revenue).toBe(80);
    });
  });

  describe('coreEbitda / taxRate', () => {
    it('returns null rather than NaN when a required line is missing', () => {
      expect(coreEbitda({ revenue: 100 })).toBeNull();
      expect(taxRate({ pbt: 0, currentTax: 5, deferredTax: 0 })).toBeNull();
    });
  });
});
