'use strict';
const { evaluate } = require('../lib/cycleIndicators');
const rd = (...v) => v.map((x, i) => ({ period: `2026-0${i + 1}`, value: x }));

describe('cycleIndicators', () => {
  it('needs two readings', () => expect(evaluate(rd(1))).toBe(null));
  it('detected on one rising step, confirmed on three', () => {
    expect(evaluate(rd(5, 4, 6)).state).toBe('detected');
    expect(evaluate(rd(1, 2, 3, 4)).state).toBe('confirmed');
    expect(evaluate(rd(1, 2, 3, 4)).risingStreak).toBe(3);
  });
  it('no state when flat or falling; tracks falling streak', () => {
    const e = evaluate(rd(6, 5, 4));
    expect(e.state).toBe(null);
    expect(e.fallingStreak).toBe(2);
    expect(evaluate(rd(3, 3)).state).toBe(null);
  });
  it('sorts by period and ignores non-finite', () => {
    const e = evaluate([
      { period: '2026-03', value: 9 },
      { period: '2026-01', value: 5 },
      { period: '2026-02', value: NaN },
    ]);
    expect(e.latest).toBe(9);
    expect(e.readings).toBe(2);
  });
});
