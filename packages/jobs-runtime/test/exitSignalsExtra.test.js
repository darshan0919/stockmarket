'use strict';
const X = require('../lib/exitSignalsExtra');

const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i)); // [date,o,h,l,c,v]
const flat = (n, price = 100, vol = 1000) =>
  mk(n, (i) => [`d${i}`, price, price + 1, price - 1, price, vol]);

describe('sectorRollover (X4)', () => {
  const ind = (v, n = 6) => Array(n).fill(v);
  test('was leading, now lagging -> detected', () =>
    expect(X.sectorRollover({ ind1m: ind(-1), ind3m: ind(12), mkt1m: 0, mkt3m: 5 }).state).toBe(
      'detected'
    ));
  test('big 1M gap and mostly negative -> confirmed', () =>
    expect(X.sectorRollover({ ind1m: ind(-5), ind3m: ind(12), mkt1m: 0, mkt3m: 5 }).state).toBe(
      'confirmed'
    ));
  test('still leading -> null', () =>
    expect(
      X.sectorRollover({ ind1m: ind(4), ind3m: ind(12), mkt1m: 0, mkt3m: 5 }).state
    ).toBeNull());
  test('too few names -> null', () =>
    expect(
      X.sectorRollover({ ind1m: [1, 2], ind3m: [1, 2], mkt1m: 0, mkt3m: 0 }).state
    ).toBeNull());
});

describe('distribution (X5)', () => {
  test('flat tape, no inputs -> null', () =>
    expect(X.distribution({ candles: flat(80) }).state).toBeNull());
  test('rising on falling volume -> detected', () => {
    const c = mk(80, (i) => {
      const p = 100 + i * 0.5;
      return [`d${i}`, p, p + 1, p - 1, p, i < 60 ? 2000 : 800];
    });
    const r = X.distribution({ candles: c });
    expect(r.flags).toContain('RISING_ON_FALLING_VOLUME');
    expect(r.state).toBe('detected');
  });
  test('block sell >= 50 Cr alone -> confirmed', () =>
    expect(X.distribution({ candles: flat(80), blockSellCr: 60 }).state).toBe('confirmed'));
  test('block 15 Cr + FII -1.5pp -> confirmed (2 flags)', () =>
    expect(X.distribution({ candles: flat(80), blockSellCr: 15, fiiChangePp: -1.5 }).state).toBe(
      'confirmed'
    ));
  test('single FII flag -> detected', () =>
    expect(X.distribution({ candles: flat(80), fiiChangePp: -2 }).state).toBe('detected'));
  test('failedBreakouts counts a break-then-reversal once', () => {
    const c = flat(80);
    c[70] = ['d70', 100, 112, 100, 111, 1000]; // breakout close above prior-40 high (101)
    c[72] = ['d72', 100, 101, 95, 98, 1000]; // closes back below
    expect(X.failedBreakouts(c)).toBe(1);
  });
});

describe('fundamentalExit (X6)', () => {
  test('clean -> null', () =>
    expect(X.fundamentalExit({ pe: 20, peg: 0.8, industryPe: 25, patYoY: 20 }).state).toBeNull());
  test('muted reaction to strong result -> detected', () => {
    const r = X.fundamentalExit({ patYoY: 45, daysFromResult: -30, returnsSinceResult: 0.5 });
    expect(r.flags).toEqual(['MUTED_REACTION']);
    expect(r.state).toBe('detected');
  });
  test('result older than 100d does not count as muted', () =>
    expect(
      X.fundamentalExit({ patYoY: 45, daysFromResult: -150, returnsSinceResult: 0 }).state
    ).toBeNull());
  test('stretched + cash divergence -> confirmed', () => {
    const r = X.fundamentalExit({ pe: 90, peg: 2.5, industryPe: 40, patYoY: 30, cfoToPat: -10 });
    expect(r.flags).toEqual(expect.arrayContaining(['STRETCHED_VALUATION', 'CASH_DIVERGENCE']));
    expect(r.state).toBe('confirmed');
  });
  test('high pledge', () =>
    expect(X.fundamentalExit({ pledgedPct: 35 }).flags).toEqual(['HIGH_PLEDGE']));
});
