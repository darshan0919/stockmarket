'use strict';
const { evaluate } = require('../lib/valuationStretch');
describe('valuationStretch.evaluate', () => {
  test('no data -> null', () => expect(evaluate({}).state).toBeNull());
  test('PEG 1.7 alone -> detected', () =>
    expect(evaluate({ pe: 30, peg: 1.7, industryPe: 28 })).toMatchObject({
      state: 'detected',
      flags: ['PEG_GT_1_5'],
    }));
  test('PEG>2 + 60% premium -> confirmed', () =>
    expect(evaluate({ pe: 80, peg: 2.4, industryPe: 50 }).state).toBe('confirmed'));
  test('PE>50 only counts in weak regime', () => {
    expect(evaluate({ pe: 60, industryPe: 55, weakRegime: false }).state).toBeNull();
    expect(evaluate({ pe: 60, industryPe: 55, weakRegime: true }).flags).toContain(
      'PE_GT_50_WEAK_REGIME'
    );
  });
  test('negative PEG / PE ignored', () =>
    expect(evaluate({ pe: -5, peg: -1, industryPe: 10 }).state).toBeNull());
});
