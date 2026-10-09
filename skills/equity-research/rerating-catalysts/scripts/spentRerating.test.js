'use strict';
const { spentRerating } = require('./spentRerating');
test('spent needs two flags and caps tag', () => {
  const r = spentRerating({ peNow: 50, pe1yAgo: 20, reactionsPct: [0, -1], patGrowthYoYPct: 45 });
  expect(r.reratingPhase).toBe('SPENT');
  expect(r.capTag).toBe('MODERATE');
});
test('early and unknown', () => {
  expect(spentRerating({ peNow: 22, pe1yAgo: 20 }).reratingPhase).toBe('EARLY');
  expect(spentRerating({}).reratingPhase).toBe('UNKNOWN');
});
test('fake flags', () => {
  const r = spentRerating({
    ocf: -5,
    pat: 10,
    debtorDaysNow: 130,
    debtorDays1yAgo: 100,
    salesCagr8qPct: 2,
    ebitdaMarginPct: 2,
  });
  expect(r.fakeFlags).toEqual([
    'CASH_FLOW_DIVERGENCE',
    'RECEIVABLES_RISING',
    'NEVER_ENDING_TURNAROUND',
    'THIN_MARGIN_BREAKEVEN_ONLY',
  ]);
});
