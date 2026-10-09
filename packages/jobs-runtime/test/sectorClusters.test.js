'use strict';
const { industryCounts, buildObservations } = require('../lib/sectorClusters');

const uni = (o) => Object.fromEntries(Object.entries(o).map(([k, [n, N]]) => [k, { n, N }]));
const by = (obs, id) => obs.find((o) => o.entityId === id);

describe('sectorClusters', () => {
  it('counts near-highs against the industry universe', () => {
    const c = industryCounts(['A', 'A', 'B'], ['A', 'A', 'A', 'B', 'B', 'C']);
    expect(c).toEqual({ A: { n: 2, N: 3 }, B: { n: 1, N: 2 }, C: { n: 0, N: 1 } });
  });
  it('requires names, share and universe size', () => {
    const o = buildObservations(
      uni({ big: [3, 300], small: [3, 5], ok: [3, 12], few: [2, 10], bg: [0, 300] })
    );
    expect(by(o, 'ok').state).toBe('detected');
    expect(by(o, 'big').state).toBe(null);
    expect(by(o, 'small').state).toBe(null);
    expect(by(o, 'few').state).toBe(null);
  });
  it('confirms after 4 of 5 sessions', () => {
    const h = uni({ ok: [3, 12], bg: [0, 100] });
    expect(by(buildObservations(h, [h, h, h, h]), 'ok').state).toBe('confirmed');
    expect(by(buildObservations(h, [h, h]), 'ok').state).toBe('detected');
    const miss = uni({ ok: [0, 12], bg: [0, 100] });
    expect(by(buildObservations(h, [miss, miss, h, h]), 'ok').state).toBe('detected');
  });
  it('suppresses clusters in a broad rally (share below 1.5x market rate)', () => {
    const o = buildObservations(uni({ a: [3, 12], b: [6, 12], c: [6, 12] }));
    expect(by(o, 'a').state).toBe(null);
  });
  it('omits an industry absent today', () => {
    expect(by(buildObservations(uni({}), [uni({ x: [3, 12] })]), 'x')).toBeUndefined();
  });
});
