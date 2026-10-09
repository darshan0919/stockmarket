'use strict';
const { returnSince, absorption, stateFor, ageDays } = require('../lib/policyEvents');

const series = (start, closes) =>
  closes.map((c, i) => [
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
    c,
    c,
    c,
    c,
    1,
  ]);

describe('policyEvents', () => {
  it('returnSince uses first close on/after the event', () => {
    const c = series('2026-01-01', [100, 110, 120]);
    expect(returnSince(c, '2026-01-02')).toBeCloseTo((120 / 110 - 1) * 100);
    expect(returnSince(c, '2026-01-03')).toBe(null); // event on last bar: no elapsed return
    expect(returnSince(c, '2027-01-01')).toBe(null);
  });
  it('absorption = basket mean minus benchmark', () => {
    const a = absorption({
      basket: { A: series('2026-01-01', [100, 130]), B: series('2026-01-01', [100, 110]) },
      bench: series('2026-01-01', [100, 105]),
      eventDate: '2026-01-01',
    });
    expect(a.basketRetPct).toBe(20);
    expect(a.excessPct).toBe(15);
  });
  it('returns null with no usable data', () => {
    expect(
      absorption({ basket: {}, bench: series('2026-01-01', [1, 2]), eventDate: '2026-01-01' })
    ).toBe(null);
  });
  it('maps excess to states and ages out', () => {
    expect(stateFor(2, 10)).toBe('detected');
    expect(stateFor(-8, 10)).toBe('detected');
    expect(stateFor(7, 10)).toBe('confirmed');
    expect(stateFor(25, 10)).toBe('spent');
    expect(stateFor(7, 200)).toBe(null);
  });
  it('ageDays', () => expect(ageDays('2026-10-01', '2026-10-10')).toBe(9));
});
