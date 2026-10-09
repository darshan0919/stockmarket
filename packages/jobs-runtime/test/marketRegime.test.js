'use strict';

const { buildObservations, pct } = require('../lib/marketRegime');

const snap = (over = {}) => ({
  sessionDate: '2026-10-09',
  breadth: { universe: 500, above20: 97, above50: 90, above200: 188, nearHighsCount: 305 },
  macro: { brent: 104.7, us10y: 5.25, usdinr: 96.7 },
  flows: { fiiNet: -3568.9 },
  ...over,
});
const by = (obs, id) => obs.find((o) => o.signalId === id);

describe('buildObservations', () => {
  test('today (2026-10-09): shallow + deep correction, no bottom marker, weak macro', () => {
    const o = buildObservations(snap());
    expect(by(o, 'M4-shallow-correction').state).toBe('confirmed'); // 19.4%
    expect(by(o, 'M4-deep-correction').state).toBe('confirmed'); // 18%
    expect(by(o, 'M4-bottom-marker').state).toBeNull(); // 37.6%
    expect(by(o, 'M3-weak-macro').state).toBe('confirmed');
    expect(by(o, 'M3-weak-macro').evidence.breaches).toEqual(['brent', 'us10y', 'usdinr']);
    expect(by(o, 'M2-relief-zone').state).toBeNull();
    expect(by(o, 'M1-scan-count-falling')).toBeUndefined(); // not enough history
    expect(by(o, 'M4-fii-outflow-5d')).toBeUndefined();
  });

  test('relief zone only when all three are inside limits', () => {
    const o = buildObservations(snap({ macro: { brent: 90, us10y: 4.5, usdinr: 90 } }));
    expect(by(o, 'M2-relief-zone').state).toBe('confirmed');
    expect(by(o, 'M3-weak-macro').state).toBeNull();
  });

  test('missing macro value omits M2/M3 instead of flipping state', () => {
    const o = buildObservations(snap({ macro: { brent: null, us10y: 5.2, usdinr: 96 } }));
    expect(by(o, 'M2-relief-zone')).toBeUndefined();
    expect(by(o, 'M3-weak-macro')).toBeUndefined();
  });

  test('M1 fires only after 3 consecutive declines (4 points)', () => {
    const hist = [310, 290, 270].map((c, i) => ({
      breadth: { nearHighsCount: c },
      flows: {},
      sessionDate: `d${i}`,
    }));
    const falling = buildObservations(
      snap({
        breadth: { universe: 500, above20: 97, above50: 90, above200: 188, nearHighsCount: 250 },
      }),
      hist
    );
    expect(by(falling, 'M1-scan-count-falling').state).toBe('detected');
    const notFalling = buildObservations(
      snap({
        breadth: { universe: 500, above20: 97, above50: 90, above200: 188, nearHighsCount: 280 },
      }),
      hist
    );
    expect(by(notFalling, 'M1-scan-count-falling').state).toBeNull();
  });

  test('FII 5-session outflow sums the window', () => {
    const hist = [100, -200, -300, -400].map((n) => ({ breadth: {}, flows: { fiiNet: n } }));
    const o = buildObservations(snap({ flows: { fiiNet: -50 } }), hist);
    expect(by(o, 'M4-fii-outflow-5d').evidence.fiiNetSumCr).toBe(-850);
    expect(by(o, 'M4-fii-outflow-5d').state).toBe('detected');
  });

  test('every observation flags calibrated:false', () => {
    for (const o of buildObservations(snap())) expect(o.evidence.calibrated).toBe(false);
  });

  test('pct handles zero universe', () => {
    expect(pct(5, 0)).toBeNull();
    expect(pct(90, 500)).toBe(18);
  });
});
