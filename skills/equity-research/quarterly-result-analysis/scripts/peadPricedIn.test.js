'use strict';
const { peadPricedIn } = require('./peadPricedIn');
test('priced in needs two pricing flags', () => {
  const r = peadPricedIn({ preResultRunUpPct: 25, peNow: 50, peMedian1y: 30, peMedian3y: 25 });
  expect(r.pricedIn).toBe('PRICED_IN');
  expect(r.flags).toContain('PRE_RESULT_RUN_UP');
});
test('clean low-expectation setup', () => {
  const r = peadPricedIn({ preResultRunUpPct: 2, peNow: 18, peMedian1y: 22, peMedian3y: 20 });
  expect(r.pricedIn).toBe('CLEAN');
  expect(r.setup).toBe('LOW_EXPECTATION_SETUP');
});
test('unknown without inputs, muted reaction + low float flags', () => {
  expect(peadPricedIn({}).pricedIn).toBe('UNKNOWN');
  const r = peadPricedIn({
    day0ReactionPct: 0,
    patGrowthYoYPct: 45,
    floatPct: 6,
    peNow: 20,
    peMedian1y: 20,
  });
  expect(r.flags).toEqual(['MUTED_REACTION_TO_GOOD_RESULT', 'LOW_FLOAT']);
  expect(r.pricedIn).toBe('PARTIAL');
});
