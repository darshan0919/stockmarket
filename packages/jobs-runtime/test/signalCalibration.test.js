'use strict';
const C = require('../lib/signalCalibration');

describe('signalCalibration', () => {
  test('onsets respects cooldown and only counts rising edges', () => {
    const a = [0, 1, 1, 0, 1, 0, 0, 0, 1].map(Boolean);
    expect(C.onsets(a, 2)).toEqual([1, 4, 8]); // rising edges at 1, 4, 8, each > 2 sessions apart
    expect(C.onsets(a, 5)).toEqual([1, 8]); // cooldown 5 drops index 4
  });
  test('fwdReturn enters next close', () => {
    const closes = [100, 100, 110, 121];
    expect(C.fwdReturn(closes, 0, 2)).toBeCloseTo(21, 5); // 100 -> 121
    expect(C.fwdReturn(closes, 2, 5)).toBeNull();
  });
  test('summarize and verdict', () => {
    const ev = Array.from({ length: 40 }, (_, i) => ({
      ticker: `T${i % 5}`,
      date: 'd',
      ex21: -2,
      ex63: -3,
      raw21: 1,
      raw63: 2,
    }));
    const s = C.summarize(ev);
    expect(s.h21.meanExcess).toBe(-2);
    expect(s.h21.pctNegExcess).toBe(100);
    expect(s.tickers).toBe(5);
    const base = {
      h21: { meanExcess: 0, pctNegExcess: 59 },
      h63: { meanExcess: 1, pctNegExcess: 61 },
    };
    expect(C.exitVerdict(s, base)).toBe('supports');
    expect(C.exitVerdict(C.summarize(ev.slice(0, 5)), base)).toBe('insufficient');
    expect(
      C.exitVerdict(s, {
        h21: { meanExcess: -2, pctNegExcess: 99 },
        h63: { meanExcess: -3, pctNegExcess: 99 },
      })
    ).toBe('mixed');
    expect(
      Object.keys(
        C.byYear([
          { ...ev[0], date: '2024-01-01' },
          { ...ev[1], date: '2025-02-02' },
        ])
      )
    ).toEqual(['2024', '2025']);
  });
});
