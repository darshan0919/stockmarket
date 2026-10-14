'use strict';

const { compute } = require('../src/analyzers/incomeStatementSignals');

const base = {
  revenue: { value: 260, qoq: 260, yoy: 210 },
};

describe('CAPEX_COMMISSIONED_NOT_YET_CONTRIBUTING combination', () => {
  test('fires only when D&A and interest both rose', () => {
    const up = compute({
      ...base,
      depreciation: { value: 16, qoq: 12, yoy: 11 },
      interest: { value: 2, qoq: 1, yoy: 1 },
    });
    expect(up.combinations.map((c) => c.flag)).toContain('CAPEX_COMMISSIONED_NOT_YET_CONTRIBUTING');
  });
  test('does not fire when both fell (SJS Q1FY27 shape)', () => {
    const down = compute({
      ...base,
      depreciation: { value: 11.75, qoq: 13.9, yoy: 11.86 },
      interest: { value: 0.56, qoq: 1.0, yoy: 0.93 },
    });
    expect(down.combinations.map((c) => c.flag)).not.toContain(
      'CAPEX_COMMISSIONED_NOT_YET_CONTRIBUTING'
    );
  });
});
