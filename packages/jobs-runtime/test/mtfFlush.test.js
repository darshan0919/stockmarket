'use strict';

const m = require('../lib/mtfFlush');

function candles({ n = 260, flushDay = true } = {}) {
  const out = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const prev = px;
    px = px * 1.002; // steady uptrend
    out.push({
      date: `d${i}`,
      open: px,
      high: px * 1.005,
      low: px * 0.995,
      close: px,
      prevClose: prev,
      volume: 1000,
    });
  }
  if (flushDay) {
    const k = out[n - 1];
    const o = out[n - 2].close * 0.995;
    out[n - 1] = {
      ...k,
      open: o,
      close: o * 1.002,
      high: o * 1.01,
      low: o * 0.95,
      prevClose: out[n - 2].close,
    };
  }
  return out;
}
const qs = (last) => [...Array(60).fill(1000), ...Array(10).fill(1000), last]; // q10 vs 1000

describe('qFeatures', () => {
  test('q10 and qpk', () => {
    const f = m.qFeatures([...Array(60).fill(1000), 700]);
    expect(f.q10).toBeCloseTo(-0.3);
    expect(f.qpk).toBeCloseTo(-0.3);
  });
  test('short history -> null', () => {
    expect(m.qFeatures([1, 2, 3]).q10).toBeNull();
  });
});

describe('evaluateStock', () => {
  test('textbook flush + rejection wick on a leader -> tier A/B with score', () => {
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 50,
      qSeries: qs(600),
      candles: candles(),
      rank120: 0.9,
    });
    expect(r.failed).toEqual([]);
    expect(['A', 'B']).toContain(r.tier);
    expect(r.score).toBeGreaterThan(50);
  });
  test('deep flush + strong wick + leader scores tier A', () => {
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 50,
      qSeries: qs(450),
      candles: candles(),
      rank120: 1,
    });
    expect(r.tier).toBe('A');
  });
  test('no wick but everything else -> tier C near-miss', () => {
    const c = candles({ flushDay: false });
    c[c.length - 1] = { ...c[c.length - 1], low: c[c.length - 1].close * 0.9995 };
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 50,
      qSeries: qs(600),
      candles: c,
      rank120: 0.9,
    });
    expect(r.failed).toEqual(['wick']);
    expect(r.tier).toBe('C');
  });
  test('two soft misses are not C; hard miss is not C', () => {
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 50,
      qSeries: qs(600),
      candles: candles(),
      rank120: 0.2,
    });
    expect(r.failed).toContain('leader');
    expect(r.tier).toBeNull();
  });
  test('illiquid book fails', () => {
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 5,
      qSeries: qs(600),
      candles: candles(),
      rank120: 0.9,
    });
    expect(r.failed).toContain('liquid');
    expect(r.tier).toBeNull();
  });
  test('corporate action in window is excluded, not signalled', () => {
    const c = candles();
    c[c.length - 3] = { ...c[c.length - 3], prevClose: c[c.length - 3].prevClose * 2 };
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 50,
      qSeries: qs(600),
      candles: c,
      rank120: 0.9,
    });
    expect(r.excluded).toBe('corporate-action-in-window');
    expect(r.tier).toBeNull();
  });
  test('missing universe rank is flagged and falls back to price proxy', () => {
    const r = m.evaluateStock({
      symbol: 'X',
      bookCr: 50,
      qSeries: qs(600),
      candles: candles(),
      rank120: null,
    });
    expect(r.rankMissing).toBe(true);
    expect(r.failed).toEqual([]);
  });
});

describe('helpers', () => {
  test('pctRank', () => {
    expect(m.pctRank(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(0.4);
    expect(m.pctRank(5, [])).toBeNull();
  });
  test('parseBhavCloses keeps EQ-like series only', () => {
    const t = 'SYMBOL, SERIES, CLOSE_PRICE\nAAA, EQ, 10.5\nBBB, N1, 9\nAAA, BE, 11\n';
    const mp = m.parseBhavCloses(t.replace(/, /g, ','));
    expect(mp.get('AAA')).toBe(10.5);
    expect(mp.has('BBB')).toBe(false);
  });
  test('mergeBook inserts, aligns, trims and is idempotent', () => {
    let c = m.mergeBook(null, '2026-10-01', [{ symbol: 'A', qty: 5, name: 'a', combinedCr: 30 }]);
    c = m.mergeBook(c, '2026-10-02', [
      { symbol: 'A', qty: 6, name: 'a', combinedCr: 31 },
      { symbol: 'B', qty: 1, name: 'b', combinedCr: 2 },
    ]);
    c = m.mergeBook(c, '2026-10-02', [{ symbol: 'A', qty: 6, name: 'a', combinedCr: 31 }]);
    expect(c.q.A).toEqual([5, 6]);
    expect(c.q.B).toEqual([null, 1]);
    const t = m.mergeBook(c, '2026-10-03', [{ symbol: 'A', qty: 7, name: 'a', combinedCr: 32 }], {
      keep: 2,
    });
    expect(t.dates).toEqual(['2026-10-02', '2026-10-03']);
    expect(t.q.A).toEqual([6, 7]);
  });
});

describe('outcomes', () => {
  const mk = (n) =>
    Array.from({ length: n }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      low: 99 + i,
      close: 100 + i,
    }));
  test('entry is next session close; horizons null until available; excess vs bench', () => {
    const c = mk(30);
    const b = c.map((x) => ({ date: x.date, close: 200 }));
    const o = m.computeOutcome('2026-01-02', c, b);
    expect(o.entryDate).toBe('2026-01-03');
    expect(o.horizons[5].ret).toBeCloseTo(c[7].close / c[2].close - 1);
    expect(o.horizons[5].excess).toBeCloseTo(o.horizons[5].ret);
    expect(o.horizons[20]).not.toBeNull();
    expect(m.computeOutcome('2026-01-02', mk(8), b).horizons[20]).toBeNull();
    expect(m.computeOutcome('2026-02-01', c, b)).toBeNull();
  });
  test('summarizeOutcomes groups by tier', () => {
    const rows = [
      { tier: 'B', outcome: { horizons: { 20: { excess: 0.02 } } } },
      { tier: 'B', outcome: { horizons: { 20: { excess: -0.01 } } } },
      { tier: 'C', outcome: { horizons: { 20: null } } },
    ];
    expect(m.summarizeOutcomes(rows).B).toMatchObject({ n: 2, hit: 0.5 });
    expect(m.summarizeOutcomes(rows).C).toBeUndefined();
  });
});

describe('formatEmail', () => {
  test('renders tiers, escapes, and flags data gaps', () => {
    const { formatEmail } = require('../lib/mtfFlushEmail');
    const f = {
      q10: -0.3,
      qpk: -0.4,
      bookCr: 50,
      lowWick: 0.5,
      dist20: -0.01,
      rank: 0.9,
      hi250: -0.1,
      close: 100,
    };
    const row = (tier, symbol) => ({
      tier,
      symbol,
      name: 'A&B',
      score: 80,
      features: f,
      failed: [],
      isNew: true,
    });
    const { subject, html } = formatEmail(
      {
        signalDate: '2026-10-08',
        rows: [row('A', 'X'), row('B', 'Y'), { ...row('C', 'Z'), failed: ['wick'] }],
        stage1: 50,
        flushMedian: 64,
        rankSize: 2900,
        newCount: 3,
        fetchErrors: ['ENRIN'],
      },
      (n) => n
    );
    expect(subject).toContain('1 A · 1 B · 1 C');
    expect(html).toContain('Tier A');
    expect(html).toContain('Data gaps');
    expect(html).toContain('missed: wick');
  });
});
