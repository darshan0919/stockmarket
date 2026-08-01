'use strict';

/**
 * Tests for the gainers classifier's signal definitions.
 *
 * These lock down the rules that decide what reaches the reader — the tiering,
 * the dual delivery axes, streaks, sector clusters, and the top-20 selection.
 * The prior version of this pipeline shipped a bug for months (the classifier
 * read price-signal fields the scanner never emitted, so the whole PRICE_ACTION
 * branch was dead) precisely because none of this was covered.
 */

const c = require('../lib/gainersClassifier');
const tax = require('../lib/announcementTaxonomy');
const scanner = require('../gainersScanner');

const ann = (subject) => tax.annotate({ subject, description: '' });

function gainer({
  ticker = 'NSE:TEST',
  industry = 'Widgets',
  return_1d = 8,
  anns = [],
  deliveryAvailable = true,
  delivPct = 0,
  delivValueCr = 0,
  volSpike = false,
  breakout = false,
  rsi = 60,
  concall = null,
} = {}) {
  const announcements = anns.map(ann);
  return {
    ticker,
    name: ticker,
    industry,
    return_1d,
    announcements,
    ann_strength: tax.strongestOf(announcements),
    ann_categories: [...new Set(announcements.map((a) => a.category_derived))],
    concall,
    delivery: {
      available: deliveryAvailable,
      deliv_per: delivPct,
      deliv_value_cr: delivValueCr,
      trd_value_cr: delivPct ? delivValueCr / (delivPct / 100) : null,
      source: 'nse_api',
    },
    price_signals: {
      vol_spike: volSpike,
      vol_ratio: volSpike ? 3.2 : 1.1,
      breakout_52w: breakout,
      above_long_ma: true,
      rsi,
    },
  };
}

const noStreak = { streak: 1, priorDates: [] };
const run = (g, { streak = noStreak, cluster = null, novelty = null } = {}) =>
  c.classify(g, new Set(), novelty, { streak, cluster });

describe('announcement taxonomy', () => {
  it('separates thesis-moving filings from compliance paperwork', () => {
    expect(tax.categoriseAnnouncement('Award of Order from NTPC', '')).toBe('order_book');
    expect(tax.announcementStrength(ann('Award of Order from NTPC'))).toBe('STRONG');
    expect(tax.announcementStrength(ann('Un-audited Financial Results Q1 FY27'))).toBe('STRONG');
    expect(tax.announcementStrength(ann('Allotment of warrants on preferential basis'))).toBe(
      'STRONG'
    );
    expect(tax.announcementStrength(ann('Disclosure under Regulation 29(2) of SAST'))).toBe(
      'STRONG'
    );
    expect(tax.announcementStrength(ann('Commencement of commercial production at Unit II'))).toBe(
      'STRONG'
    );
    // Supporting: real, but rarely the sole cause of a big single-day move.
    expect(tax.announcementStrength(ann('Credit rating reaffirmed by CRISIL'))).toBe('SUPPORTING');
    // Routine.
    expect(tax.announcementStrength(ann('Closure of trading window'))).toBe('ROUTINE');
  });

  it('does not mistake paperwork about an event for the event itself', () => {
    // Each of these contains the keywords of a STRONG category but carries no new
    // information — a steady source of false positives if left unguarded.
    const paperwork = [
      'Newspaper publication of financial results',
      'Intimation of Board Meeting to consider fund raising',
      'Prior intimation for issue of securities',
      'Transcript of Q1 FY27 earnings call',
      'Board Meeting Intimation for Consideration Of Un-Audited Financial Results',
    ];
    for (const p of paperwork) {
      expect(tax.announcementStrength(ann(p))).toBe('ROUTINE');
    }
    // …while the real filing still reads STRONG.
    expect(tax.announcementStrength(ann('Un-audited Financial Results for Q1 FY27'))).toBe(
      'STRONG'
    );
  });

  it('is shared with watchlistInsights so the two jobs cannot drift', () => {
    const wi = require('../watchlistInsights');
    expect(wi.CATEGORY_RULES).toBe(tax.CATEGORY_RULES);
  });
});

describe('scanner price signals feed the classifier contract', () => {
  // Regression: the classifier reads vol_spike / breakout_52w / above_long_ma /
  // rsi. If the scanner stops emitting these, every price-action rule silently
  // becomes a no-op instead of failing loudly — which is what happened before.
  it('emits every field the classifier consumes', () => {
    const candles = Array.from({ length: 65 }, (_, i) => ({
      close: 100 + i * 0.5,
      high: 101 + i * 0.5,
      low: 99 + i * 0.5,
      volume: i === 64 ? 900000 : 100000,
    }));
    const ps = scanner.priceActionSignals(candles);
    for (const k of ['vol_spike', 'vol_ratio', 'breakout_52w', 'above_long_ma', 'rsi']) {
      expect(ps[k]).toBeDefined();
    }
    expect(ps.vol_spike).toBe(true);
    expect(ps.above_long_ma).toBe(true);
    expect(typeof ps.rsi).toBe('number');
  });

  it('returns null RSI rather than a fabricated value on short history', () => {
    expect(scanner.computeRsi([1, 2, 3], 14)).toBeNull();
  });
});

describe('concall sentiment corroboration', () => {
  it('awards +1.5 conviction for a recent Bullish concall and cites it in reasons', () => {
    const g = gainer({
      delivPct: 30,
      delivValueCr: 40,
      concall: { sentiment: 'Bullish', recentWithinDays: 3, resultQualityScore: 82 },
    });
    const withConcall = run(g);
    const without = run(gainer({ delivPct: 30, delivValueCr: 40 }));

    expect(withConcall.score).toBeCloseTo(without.score + 1.5);
    expect(withConcall.reasons.some((r) => /bullish concall filed 3d ago/i.test(r))).toBe(true);
    expect(withConcall.reasons.some((r) => /quality 82\/100/.test(r))).toBe(true);
  });

  it('awards +1 for Optimistic and -1 for Bearish', () => {
    const optimistic = run(
      gainer({ delivPct: 30, delivValueCr: 40, concall: { sentiment: 'Optimistic', recentWithinDays: 5 } })
    );
    const bearish = run(
      gainer({ delivPct: 30, delivValueCr: 40, concall: { sentiment: 'Bearish', recentWithinDays: 5 } })
    );
    const baseline = run(gainer({ delivPct: 30, delivValueCr: 40 }));

    expect(optimistic.score).toBeCloseTo(baseline.score + 1);
    expect(bearish.score).toBeCloseTo(baseline.score - 1);
    expect(bearish.reasons.some((r) => /bearish concall/i.test(r))).toBe(true);
  });

  it('does NOT credit a bullish concall older than 7 days', () => {
    const stale = run(
      gainer({ delivPct: 30, delivValueCr: 40, concall: { sentiment: 'Bullish', recentWithinDays: 8 } })
    );
    const baseline = run(gainer({ delivPct: 30, delivValueCr: 40 }));
    expect(stale.score).toBeCloseTo(baseline.score);
    expect(stale.reasons.some((r) => /concall/i.test(r))).toBe(false);
  });

  it('does NOT credit a bullish sentiment when recentWithinDays is unknown (null)', () => {
    // Guards the "stays inert until a real number exists" design — a concall
    // whose date we couldn't parse must never silently count as recent.
    const unknownAge = run(
      gainer({ delivPct: 30, delivValueCr: 40, concall: { sentiment: 'Bullish', recentWithinDays: null } })
    );
    const baseline = run(gainer({ delivPct: 30, delivValueCr: 40 }));
    expect(unknownAge.score).toBeCloseTo(baseline.score);
  });

  it('is a no-op (uncredited, unpenalised) when no concall data was found', () => {
    const noConcall = run(gainer({ delivPct: 30, delivValueCr: 40, concall: null }));
    const baseline = run(gainer({ delivPct: 30, delivValueCr: 40 }));
    expect(noConcall.score).toBeCloseTo(baseline.score);
  });

  it('Neutral/Cautious sentiment neither helps nor hurts the score', () => {
    const neutral = run(
      gainer({ delivPct: 30, delivValueCr: 40, concall: { sentiment: 'Neutral', recentWithinDays: 2 } })
    );
    const baseline = run(gainer({ delivPct: 30, delivValueCr: 40 }));
    expect(neutral.score).toBeCloseTo(baseline.score);
  });
});

describe('delivery is measured on two axes', () => {
  it('treats a high percentage as decent conviction', () => {
    expect(c.deliveryFacts(gainer({ delivPct: 55, delivValueCr: 8 })).decent).toBe(true);
  });

  it('treats a large absolute rupee amount as decent even at a low percentage', () => {
    // The large-cap case the user raised: 22% delivery on heavy turnover is
    // ₹150 Cr of real buying and must not be dismissed as churn.
    const d = c.deliveryFacts(gainer({ delivPct: 22, delivValueCr: 150 }));
    expect(d.decent).toBe(true);
    expect(d.strong).toBe(true);
    expect(d.weak).toBe(false);
  });

  it('flags genuinely thin delivery as churn', () => {
    expect(c.deliveryFacts(gainer({ delivPct: 14, delivValueCr: 3 })).weak).toBe(true);
  });
});

describe('tiering separates actionable from informative', () => {
  it('ACT requires a known cause AND delivery conviction', () => {
    const r = run(
      gainer({
        anns: ['Award of Order from NTPC worth Rs 500 Cr'],
        delivPct: 62,
        delivValueCr: 80,
      }),
      { streak: { streak: 3, priorDates: ['2026-07-30', '2026-07-29'] } }
    );
    expect(r.tier).toBe('ACT');
    expect(r.conviction).toBe('HIGH');
    expect(r.primary_driver).toBe('FUNDAMENTAL');
  });

  it('a strong filing the market ignored is not actionable', () => {
    // The core failure of the old rule: material announcement + any delivery
    // produced HIGH, so the email filled with filings nobody traded on.
    const r = run(gainer({ anns: ['Award of Order from NTPC'], delivPct: 12, delivValueCr: 2 }));
    expect(r.tier).not.toBe('ACT');
  });

  it('delivery-backed buying with no discoverable cause still reaches WATCH', () => {
    // Early accumulation often precedes any filing; burying it would defeat the
    // point of tracking delivery.
    const r = run(gainer({ anns: [], delivPct: 45, delivValueCr: 30, volSpike: true }));
    expect(r.tier).toBe('WATCH');
    expect(r.primary_driver).toBe('PRICE_ACTION');
  });

  it('compliance paperwork on thin volume lands in NOTED', () => {
    const r = run(gainer({ anns: ['Closure of trading window'], delivPct: 15, delivValueCr: 2 }));
    expect(r.tier).toBe('NOTED');
    expect(r.conviction).toBe('LOW');
  });

  it('a super-strong sector cluster lifts an otherwise ordinary large-cap move', () => {
    const r = run(
      gainer({ anns: ['Un-audited Financial Results'], delivPct: 27, delivValueCr: 220 }),
      {
        streak: { streak: 2, priorDates: ['2026-07-30'] },
        cluster: {
          tier: 'SUPER_STRONG',
          qualified_count: 5,
          qualified_tickers: ['A', 'B', 'C', 'D', 'E'],
          qualified_delivery_value_cr: 500,
        },
      }
    );
    expect(r.tier).toBe('ACT');
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringContaining('super-strong')]));
  });

  it('downgrades news that merely restates a prior disclosure', () => {
    const g = gainer({ anns: ['Award of Order from NTPC'], delivPct: 55, delivValueCr: 60 });
    const fresh = run(g);
    const stale = run(g, { novelty: { assessed: true, total: 1, newCount: 0, followUpCount: 1 } });
    expect(stale.score).toBeLessThan(fresh.score);
    expect(stale.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('restate prior disclosures')])
    );
  });

  it('does not let a routine results filing alone reach ACT in earnings season', () => {
    // Observed live 2026-07-30: 14 of 38 names hit ACT almost entirely because
    // they had filed Q1 results — true of nearly every listed company that week,
    // and therefore not differentiating.
    const r = run(
      gainer({ anns: ['Un-audited Financial Results Q1'], delivPct: 45, delivValueCr: 20 })
    );
    expect(r.tier).not.toBe('ACT');
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringContaining('scheduled')]));
  });

  it('still lets an unscheduled surprise reach ACT on the same delivery', () => {
    // Same delivery as the test above — only the nature of the news differs.
    const r = run(gainer({ anns: ['Award of Order from NTPC'], delivPct: 45, delivValueCr: 20 }));
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringContaining('unscheduled')]));
    expect(r.conviction_score ?? r.score).toBeGreaterThan(2);
  });

  it('treats an unknown delivery value as unknown, not as zero', () => {
    // BSE names had no delivery value until the close-price backfill landed.
    // Coercing the gap to 0 would have branded them "churn" and dropped them
    // out of the top-20 selection.
    const g = gainer({ anns: [], delivPct: 71, delivValueCr: 0 });
    g.delivery.deliv_value_cr = null;
    const d = c.deliveryFacts(g);
    expect(d.valueKnown).toBe(false);
    expect(d.weak).toBe(false);
    expect(d.decent).toBe(true); // carried by the 71% alone
  });

  it('always explains itself', () => {
    const r = run(gainer({ anns: ['Award of Order'], delivPct: 55, delivValueCr: 60 }));
    expect(Array.isArray(r.reasons)).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe('streaks', () => {
  const history = {
    runDates: ['2026-07-30', '2026-07-29', '2026-07-28', '2026-07-27'],
    byDate: new Map([
      ['2026-07-30', new Set(['NSE:A'])],
      ['2026-07-29', new Set(['NSE:A'])],
      ['2026-07-28', new Set([])],
      ['2026-07-27', new Set(['NSE:A'])],
    ]),
  };

  it('counts consecutive sessions including today', () => {
    expect(c.computeStreak('NSE:A', history).streak).toBe(3);
  });

  it('resets on a gap rather than counting through it', () => {
    // 07-28 has no appearance, so the 07-27 appearance does not extend the run.
    expect(c.computeStreak('NSE:A', history).priorDates).toEqual(['2026-07-30', '2026-07-29']);
  });

  it('a first appearance is a streak of 1, never 0', () => {
    expect(c.computeStreak('NSE:NEW', history).streak).toBe(1);
  });

  it('normalises historically double-prefixed ids', () => {
    const h = { runDates: ['2026-07-30'], byDate: new Map([['2026-07-30', new Set(['BSE:X'])]]) };
    expect(c.computeStreak('NSE:BSE:X', h).streak).toBe(2);
  });
});

describe('sector clusters require delivery, not just co-movement', () => {
  const summary = {
    Textiles: {
      qualified_count: 5,
      qualified_tickers: ['a', 'b', 'c', 'd', 'e'],
      gainer_count: 7,
      qualified_delivery_value_cr: 300,
    },
    Pharma: { qualified_count: 3, qualified_tickers: ['x', 'y', 'z'], gainer_count: 6 },
    Autos: { qualified_count: 2, qualified_tickers: ['p', 'q'], gainer_count: 9 },
  };

  it('grades >=4 qualified names as SUPER_STRONG and >=3 as STRONG', () => {
    const cl = c.buildSectorClusters(summary);
    expect(cl.Textiles.tier).toBe('SUPER_STRONG');
    expect(cl.Pharma.tier).toBe('STRONG');
  });

  it('ignores a sector where many names moved but few had delivery', () => {
    // 9 Autos gainers but only 2 delivery-backed — a sector-wide pop, not
    // accumulation. Counting it would be the fastest way to lose trust in the report.
    expect(c.buildSectorClusters(summary).Autos).toBeUndefined();
  });
});

describe('top-20 research selection', () => {
  const signals = Array.from({ length: 30 }, (_, i) => ({
    ticker: `T${i + 1}`,
    return_1d: 30 - i,
    delivery_pct: i < 12 ? 90 - i : 20,
    delivery_value_cr: i >= 12 ? 500 - i : 5,
  }));

  it('takes 10 by delivery % then 10 by delivery value, without overlap', () => {
    const t = c.selectResearchTargets(signals);
    expect(t).toHaveLength(20);
    const pct = t.filter((x) => x.research_axis === 'DELIVERY_PCT').map((x) => x.ticker);
    const val = t.filter((x) => x.research_axis === 'DELIVERY_VALUE').map((x) => x.ticker);
    expect(pct).toHaveLength(10);
    expect(val).toHaveLength(10);
    expect(val.some((v) => pct.includes(v))).toBe(false);
  });

  it('excludes companies with no delivery data rather than ranking them as zero', () => {
    const t = c.selectResearchTargets([
      ...signals,
      { ticker: 'UNKNOWN', delivery_pct: null, delivery_value_cr: null },
    ]);
    expect(t.map((x) => x.ticker)).not.toContain('UNKNOWN');
  });

  it('degrades gracefully when fewer than 20 companies qualify', () => {
    const t = c.selectResearchTargets(signals.slice(0, 6));
    expect(t.length).toBeLessThanOrEqual(6);
    expect(t.length).toBeGreaterThan(0);
  });
});
