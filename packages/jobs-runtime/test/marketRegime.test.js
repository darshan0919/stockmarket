'use strict';

const { buildObservations, pct, resolveRecommendedHorizon } = require('../lib/marketRegime');

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

  test('sentimental bottom setup confirmed when deep breadth correction occurs and fundamentals hold', () => {
    const o = buildObservations(
      snap({
        breadth: { universe: 500, above20: 80, above50: 85, above200: 150 },
        aggregatePatGrowthYoY: 14.5,
      })
    );
    const bottomObs = by(o, 'M4-sentimental-bottom-setup');
    expect(bottomObs.state).toBe('confirmed');
    expect(bottomObs.evidence.aggregatePatGrowthYoY).toBe(14.5);
  });

  test('sentimental bottom setup null when breadth is healthy', () => {
    const o = buildObservations(
      snap({
        breadth: { universe: 500, above20: 300, above50: 320, above200: 350 },
      })
    );
    expect(by(o, 'M4-sentimental-bottom-setup').state).toBeNull();
  });
});

describe('resolveRecommendedHorizon', () => {
  test('euphoric breadth (>= 75%) recommends 3-6M horizon', () => {
    const res = resolveRecommendedHorizon(80);
    expect(res.horizon).toBe('3-6M');
    expect(res.regime).toBe('EUPHORIC_BREADTH');
  });

  test('despondent correction (< 25%) recommends 24-36M horizon', () => {
    const res = resolveRecommendedHorizon(18);
    expect(res.horizon).toBe('24-36M');
    expect(res.regime).toBe('DESPONDENT_CORRECTION');
  });

  test('balanced breadth (35-75%) recommends 12-18M horizon', () => {
    const res = resolveRecommendedHorizon(50);
    expect(res.horizon).toBe('12-18M');
    expect(res.regime).toBe('BALANCED_EXPANSION');
  });

  test('null input returns null', () => {
    expect(resolveRecommendedHorizon(null)).toBeNull();
  });
});
