'use strict';

const { formatDigest, collapse, tierOf } = require('../lib/signalDigest');

const t = (o) => ({ date: '2026-10-15', entityType: 'company', from: null, ...o });

describe('formatDigest (tiered)', () => {
  test('null when no transitions', () => {
    expect(formatDigest([], [])).toBeNull();
  });

  test('null (silence) when only noise: E0 candidates and invalidations', () => {
    const tr = [
      t({ signalId: 'E0-candidate', entityId: 'NSE:AAA', to: 'detected', evidence: { rs: 90 } }),
      t({ signalId: 'E1-base-breakout', entityId: 'NSE:BBB', from: 'detected', to: 'invalidated' }),
    ];
    expect(formatDigest(tr, [])).toBeNull();
  });

  test('tiers: regime, act, risk, watch, noise', () => {
    expect(
      tierOf(t({ signalId: 'M4-deep-correction', entityType: 'market', to: 'confirmed' }))
    ).toBe('regime');
    expect(tierOf(t({ signalId: 'E2-pullback', to: 'entry-ready' }))).toBe('act');
    expect(tierOf(t({ signalId: 'X5-distribution', to: 'detected' }))).toBe('risk');
    expect(tierOf(t({ signalId: 'E1-base-breakout', to: 'detected' }))).toBe('watch');
    expect(tierOf(t({ signalId: 'S1-sector-cluster', entityType: 'sector', to: 'detected' }))).toBe(
      'watch'
    );
    expect(tierOf(t({ signalId: 'E0-candidate', to: 'detected' }))).toBe('noise');
    expect(tierOf(t({ signalId: 'MTF-flush', to: 'detected' }))).toBe('noise');
    expect(tierOf(t({ signalId: 'MTF-flush', from: 'entry-ready', to: 'detected' }))).toBe('noise');
    expect(tierOf(t({ signalId: 'E2-pullback', from: 'entry-ready', to: 'invalidated' }))).toBe(
      'noise'
    );
  });

  test('collapse keeps net transition and counts flips', () => {
    const k = {
      ledgerId: 'x',
      signalId: 'S1-sector-cluster',
      entityType: 'sector',
      entityId: 'Banks',
    };
    const out = collapse([
      t({ ...k, date: '2026-10-14', from: null, to: 'detected' }),
      t({ ...k, date: '2026-10-15', from: 'detected', to: 'invalidated' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: null, to: 'invalidated', flips: 1 });
  });

  test('renders regime header, act row with levels, counter-regime note, escapes html', () => {
    const tr = [
      t({
        signalId: 'M4-deep-correction',
        entityType: 'market',
        entityId: 'IN',
        from: 'invalidated',
        to: 'confirmed',
        evidence: { pctAbove20SMA: 29.4, pctAbove50SMA: 19.6, pctAbove200SMA: 40.8 },
      }),
      t({
        signalId: 'E2-pullback',
        entityId: 'NSE:PAISALO',
        to: 'entry-ready',
        evidence: { name: '<b>Paisalo</b>', rs: 92, pctFromLevel: 0.7, sessionsSinceBreakout: 23 },
        levels: { support: 80.5, pivot: 94.88 },
      }),
      t({ signalId: 'E0-candidate', entityId: 'NSE:ZZZ', to: 'detected', evidence: { rs: 99 } }),
    ];
    const active = [{ signalId: 'M4-deep-correction', entityType: 'market', entityId: 'IN' }];
    const snaps = [
      {
        date: '2026-10-15',
        snapshot: {
          breadth: { universe: 500, above20: 147 },
          macro: { nifty: 22997 },
          flows: {},
          mood: null,
        },
      },
    ];
    const d = formatDigest(tr, active, { label: 'since 2026-10-14', snapshots: snaps });
    expect(d.subject).toBe('Signals since 2026-10-14: Cautious, 1 act / 1 regime');
    expect(d.html).toContain('Deep correction');
    expect(d.html).toContain('support 80.5');
    expect(d.html).toContain('counter-regime');
    expect(d.html).toContain('&lt;b&gt;Paisalo&lt;/b&gt;');
    expect(d.html).toContain('Data gaps today: mood');
    expect(d.html).toContain('1 new candidates');
    expect(d.stats).toMatchObject({ regime: 1, act: 1, noise: 1 });
  });
});
