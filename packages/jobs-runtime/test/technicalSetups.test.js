'use strict';

const { evaluate, rsRatings, ema } = require('../lib/technicalSetups');

const SEL = { rs: 95, fromHighPct: 3, turnoverRs: 2e8 };
const day = (i) => `2026-01-${String(i + 1).padStart(3, '0')}`;
const c = (i, close, hi = close * 1.004, lo = close * 0.996, v = 1000) => [
  day(i),
  close,
  hi,
  lo,
  close,
  v,
];

// 220-session uptrend (100 -> ~160), then 40-session base capped at 160 with 4+ touches, tight tail.
function baseSeries({ tail = [] } = {}) {
  const out = [];
  for (let i = 0; i < 200; i++) out.push(c(i, 100 + i * 0.3));
  // base: oscillate 156..159.5, highs touch 160 several times
  for (let j = 0; j < 40; j++) {
    const i = 200 + j;
    const close = 157.5 + ((j % 4) - 1.5) * 0.8;
    const hi = j % 6 === 0 ? 160 : close * 1.003;
    out.push([day(i), close, hi, close * 0.997, close, 1000]);
  }
  tail.forEach((t, k) => out.push(c(240 + k, t)));
  return out;
}

describe('ema', () => {
  it('seeds with the SMA and is null before n', () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    expect(e[2]).toBeCloseTo(2);
  });
});

describe('evaluate E1', () => {
  it('flags entry-ready for a tight base under resistance', () => {
    const r = evaluate(baseSeries(), SEL);
    expect(r.candidate).toBe(true);
    expect(r.e1.state).toBe('entry-ready');
    expect(r.e1.levels.breakout).toBeCloseTo(160, 0);
    expect(r.e1.evidence.touches).toBeGreaterThanOrEqual(4);
  });

  it('marks spent on breakout day', () => {
    const r = evaluate(baseSeries({ tail: [162] }), SEL);
    expect(r.e1.state).toBe('spent');
  });

  it('is not a candidate when RS is low', () => {
    const r = evaluate(baseSeries(), { ...SEL, rs: 60 });
    expect(r.candidate).toBe(false);
    expect(r.e1.state).toBe(null);
  });

  it('is not a candidate when turnover is thin', () => {
    expect(evaluate(baseSeries(), { ...SEL, turnoverRs: 1e7 }).candidate).toBe(false);
  });

  it('reports insufficient history without throwing', () => {
    const r = evaluate(baseSeries().slice(0, 30), SEL);
    expect(r.insufficient).toBe(true);
    expect(r.e1.state).toBe(null);
  });
});

describe('evaluate E2', () => {
  it('flags a pullback to the breakout level after a breakout', () => {
    const r = evaluate(baseSeries({ tail: [162, 164, 163, 160.8] }), SEL);
    expect(r.e2.state).toBe('entry-ready');
    expect(r.e2.evidence.sessionsSinceBreakout).toBe(3);
  });

  it('does not fire when price ran far from the level', () => {
    const r = evaluate(baseSeries({ tail: [162, 168, 175, 182] }), SEL);
    expect(r.e2.state).toBe(null);
  });

  it('does not fire when the breakout level failed', () => {
    const r = evaluate(baseSeries({ tail: [162, 158, 150] }), SEL);
    expect(r.e2.state).toBe(null);
  });
});

describe('rsRatings', () => {
  it('percentile-ranks the weighted score, null on missing inputs', () => {
    const rows = [
      { id: 'a', r3m: 10, r6m: 10, r1y: 10 },
      { id: 'b', r3m: 20, r6m: 20, r1y: 20 },
      { id: 'c', r3m: 30, r6m: 30, r1y: 30 },
      { id: 'd', r3m: null, r6m: 1, r1y: 1 },
    ];
    const m = rsRatings(rows);
    expect(m.get('a')).toBe(0);
    expect(m.get('c')).toBe(100);
    expect(m.get('b')).toBe(50);
    expect(m.get('d')).toBe(null);
  });
});

describe('evaluate E2 depth cap', () => {
  it('rejects a collapse back to the breakout level after a huge run', () => {
    const r = evaluate(baseSeries({ tail: [162, 190, 205, 220, 200, 180, 165, 161] }), SEL);
    expect(r.e2.state).toBe(null);
  });
});
