'use strict';
const { evaluate, weekly } = require('../lib/exitSignals');

const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
const mk = (closes, f = {}) =>
  closes.map((c, i) =>
    [day(i), c, c * 1.003, c * 0.997, c, 1000, ...[]].map((x, j) =>
      f[i] && f[i][j] != null ? f[i][j] : x
    )
  );
const up = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5);

describe('exitSignals', () => {
  it('is quiet in a clean uptrend', () => {
    const r = evaluate(mk(up));
    expect(r.X3).toBe(null);
    expect(r.X2).toBe(null);
  });
  it('X3 detected below 20 EMA, confirmed below 50 EMA', () => {
    const a = evaluate(mk([...up, 156, 154, 153, 152.5, 152]));
    expect(a.X3).toBe('detected');
    const b = evaluate(mk([...up, ...Array.from({ length: 30 }, (_, i) => 158 - i * 2)]));
    expect(b.X3).toBe('confirmed');
  });
  it('X2 failed breakout', () => {
    const base = [...up.slice(0, 100)];
    const brk = [...base, 160, 150, 149, 148];
    expect(evaluate(mk(brk)).X2).toBe('detected');
  });
  it('X7 trips below the stored line only', () => {
    expect(evaluate(mk(up), { structuralLine: 100 }).X7).toBe(null);
    expect(evaluate(mk(up), { structuralLine: 200 }).X7).toBe('confirmed');
  });
  it('X1 detects lower weekly highs', () => {
    const peak = [...up, ...Array.from({ length: 40 }, (_, i) => 160 - i * 0.2)];
    expect(evaluate(mk(peak)).X1).toBe('detected');
  });
  it('groups weeks', () => {
    expect(weekly(mk(up)).length).toBeGreaterThan(15);
  });
  it('flags insufficient history', () => {
    expect(evaluate(mk(up.slice(0, 30))).insufficient).toBe(true);
  });
});
