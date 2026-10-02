'use strict';

const { computePatBridge, normalizeRate, roundTo } = require('../patBridge');

describe('computePatBridge', () => {
  test('accurately calculates QIP debt-retirement accretion (thesis-rules worked example)', () => {
    // ₹800 Cr raise where ₹600 Cr retires debt at 11%, company earned ₹300 Cr PAT on 20 Cr shares, issued at ₹310
    const res = computePatBridge({
      raiseAmount: 800,
      debtRepaid: 600,
      interestRate: 0.11,
      taxRate: 0.25,
      currentPat: 300,
      currentShares: 20,
      issuePrice: 310,
    });

    expect(res.interestSaved).toBe(66);
    expect(res.taxAdjustedInterestSaved).toBe(49.5);
    expect(res.patDelta).toBe(49.5);
    expect(res.newPat).toBe(349.5);
    expect(res.sharesAdded).toBeCloseTo(2.58, 2);
    expect(res.dilutedShares).toBeCloseTo(22.58, 2);
    expect(res.dilutionPct).toBeCloseTo(12.9, 1);
    expect(res.oldEps).toBe(15);
    expect(res.newEps).toBeCloseTo(15.48, 2);
    expect(res.isAccretive).toBe(true);
    expect(res.direction).toBe('positive');
    expect(res.auditSummary).toContain('ACCRETIVE');
  });

  test('detects near-term dilution when capex brings depreciation with deferred EBIT', () => {
    // ₹500 Cr capex raise, 0 debt retired, ₹25 Cr incremental depreciation, 0 EBIT yet
    // 10 Cr current shares @ ₹200 issue price (2.5 Cr new shares), current PAT ₹100 Cr
    const res = computePatBridge({
      raiseAmount: 500,
      debtRepaid: 0,
      incrementalDepreciation: 25,
      operatingContribution: 0,
      issuePrice: 200,
      currentPat: 100,
      currentShares: 10,
    });

    expect(res.patDelta).toBe(-25);
    expect(res.newPat).toBe(75);
    expect(res.sharesAdded).toBe(2.5);
    expect(res.dilutedShares).toBe(12.5);
    expect(res.dilutionPct).toBe(25);
    expect(res.oldEps).toBe(10);
    expect(res.newEps).toBe(6);
    expect(res.epsDelta).toBe(-4);
    expect(res.isAccretive).toBe(false);
    expect(res.direction).toBe('negative');
    expect(res.auditSummary).toContain('DILUTIVE');
  });

  test('handles pure debt retirement without equity dilution', () => {
    const res = computePatBridge({
      debtRepaid: 200,
      interestRate: 10, // passed as 10%
      taxRate: 25, // passed as 25%
      currentPat: 150,
      currentShares: 15,
    });

    expect(res.interestSaved).toBe(20);
    expect(res.taxAdjustedInterestSaved).toBe(15);
    expect(res.sharesAdded).toBe(0);
    expect(res.dilutionPct).toBe(0);
    expect(res.oldEps).toBe(10);
    expect(res.newEps).toBe(11);
    expect(res.isAccretive).toBe(true);
    expect(res.direction).toBe('positive');
  });

  test('gracefully handles missing/zero inputs without crashing', () => {
    const res = computePatBridge({});
    expect(res.patDelta).toBe(0);
    expect(res.dilutionPct).toBe(0);
    expect(res.direction).toBe('neutral');
    expect(res.isAccretive).toBe(false);
  });
});

describe('helpers', () => {
  test('normalizeRate converts percentages and fractions', () => {
    expect(normalizeRate(12)).toBe(0.12);
    expect(normalizeRate(0.12)).toBe(0.12);
    expect(normalizeRate(undefined, 0.25)).toBe(0.25);
  });

  test('roundTo rounds properly', () => {
    expect(roundTo(12.3456, 2)).toBe(12.35);
    expect(roundTo(null)).toBeNull();
  });
});
