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

describe('NEAR_52W_HIGH (informational)', () => {
  const { peadPricedIn } = require('./peadPricedIn');
  test('flags within 5% of 52wH but does not change pricedIn', () => {
    const r = peadPricedIn({ fromHigh52Pct: 3 });
    expect(r.flags).toContain('NEAR_52W_HIGH');
    expect(r.pricedIn).toBe('UNKNOWN');
  });
  test('not flagged when far or missing', () => {
    expect(peadPricedIn({ fromHigh52Pct: 12 }).flags).not.toContain('NEAR_52W_HIGH');
    expect(peadPricedIn({}).flags).not.toContain('NEAR_52W_HIGH');
  });
});
