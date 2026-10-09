'use strict';
const { dilutionCheck } = require('../lib/dilutionCheck');

describe('dilutionCheck', () => {
  test('growth beats dilution', () => {
    const r = dilutionCheck({ existingShares: 90, newShares: 10, epsNow: 10, epsGuided: 12 });
    expect(r.dilutionPct).toBe(10);
    expect(r.epsGrowthPct).toBe(20);
    expect(r.verdict).toBe('GROWTH_FUEL');
  });
  test('diluted EPS falls', () => {
    expect(
      dilutionCheck({ existingShares: 80, newShares: 20, epsNow: 10, epsGuided: 9 }).verdict
    ).toBe('SHAREHOLDER_PAIN');
  });
  test('debt flag and bad input', () => {
    expect(
      dilutionCheck({
        existingShares: 90,
        newShares: 10,
        epsNow: 10,
        epsGuided: 12,
        debtAddedCr: 50,
      }).verdict
    ).toBe('GROWTH_FUEL+DEBT_ADDED');
    expect(
      dilutionCheck({ existingShares: 0, newShares: 1, epsNow: 1, epsGuided: 1 }).verdict
    ).toBe('INSUFFICIENT_DATA');
  });
});
