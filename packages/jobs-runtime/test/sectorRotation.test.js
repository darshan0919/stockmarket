'use strict';
const R = require('../lib/sectorRotation');

const mk = (industry, n, r1m, r3m, r1y) =>
  Array.from({ length: n }, () => ({ industry, r1m, r3m, r1y }));

describe('industryRs', () => {
  const rows = [
    ...mk('A', 6, 8, 10, 40),
    ...mk('B', 6, -2, 15, 5),
    ...mk('C', 6, 0, 0, 15),
    ...mk('Tiny', 2, 50, 50, 80),
  ];
  const t = R.industryRs(rows);
  test('market medians and small industries dropped', () => {
    expect(t.industries.map((i) => i.industry).sort()).toEqual(['A', 'B', 'C']);
    expect(t.mkt1m).toBe(0);
    expect(t.mkt1y).toBe(15);
  });
  test('sorted by rs1', () => expect(t.industries[0].industry).toBe('A'));
  test('calculates winRate1y and flags winRateLeader when >= 60%', () => {
    const indA = t.industries.find((i) => i.industry === 'A');
    expect(indA.winRate1y).toBe(1);
    expect(indA.isWinRateLeader).toBe(true);
    expect(indA.rs1y).toBe(25);

    const indB = t.industries.find((i) => i.industry === 'B');
    expect(indB.winRate1y).toBe(0);
    expect(indB.isWinRateLeader).toBe(false);
  });
});

describe('rsObservations', () => {
  const t = R.industryRs([
    ...mk('A', 6, 8, 10),
    ...mk('B', 6, -6, 15),
    ...mk('C', 6, 0, 0),
    ...mk('D', 6, 0, 0),
  ]);
  const by = (obs, sig, ind) => obs.find((o) => o.signalId === sig && o.entityId === ind).state;
  test('no history: A rising (rs1 8 > rs3/3), confirmed (rs3>0, all beat)', () => {
    const o = R.rsObservations(t);
    expect(by(o, 'S2-sector-rs-rising', 'A')).toBe('confirmed');
  });
  test('B is a confirmed rollover (3M lead, 1M gap -6pp, none beat)', () => {
    const o = R.rsObservations(t);
    expect(by(o, 'X4-sector-rs-rollover', 'B')).toBe('confirmed');
    expect(by(o, 'S2-sector-rs-rising', 'B')).toBeNull();
  });
  test('with history, falling rs1 is not rising', () => {
    const o = R.rsObservations(t, [{ industry: 'A', rs1: 12 }]);
    expect(by(o, 'S2-sector-rs-rising', 'A')).toBeNull();
  });
});

describe('focusConcentration (S3)', () => {
  const f = (ind, n) => Array.from({ length: n }, (_, i) => ({ id: `${ind}${i}`, industry: ind }));
  test('too few names -> insufficient', () =>
    expect(R.focusConcentration(f('A', 5)).insufficient).toBe(true));
  test('3 of 11 in one industry -> detected', () => {
    const r = R.focusConcentration([...f('A', 3), ...f('B', 4), ...f('C', 4)]);
    expect(r.observations.find((o) => o.entityId === 'A').state).toBe('detected');
    expect(r.observations.find((o) => o.entityId === 'B').state).toBe('confirmed');
  });
  test('2 of 10 -> null', () => {
    const r = R.focusConcentration([...f('A', 2), ...f('B', 4), ...f('C', 4)]);
    expect(r.observations.find((o) => o.entityId === 'A').state).toBeNull();
  });
});
