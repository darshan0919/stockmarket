'use strict';

/**
 * Tests for the shared Thesis Card renderer.
 *
 * Two things are being locked down here, and they matter for different reasons.
 *
 * 1. The EXTRACTION was lossless. This module was carved out of
 *    postCloseScanInsights.js so gainers-signal and volume-rocketing could
 *    render the same cards. That refactor is only safe if the nightly digest
 *    Darshan already relies on renders exactly as it did before — so the
 *    announcement-digest tests below assert the specific structures that were
 *    hard-won against Gmail's sanitizer (cid: icons, no flexbox dependence)
 *    and the grouping/ranking behaviour built over 2026-08/09.
 *
 * 2. The NEW scan-signal mode behaves. Its two most load-bearing behaviours are
 *    the delivery-value sort (Darshan's explicit rule — it decides what he reads
 *    first every morning) and the honest-blank WHY (the whole reason this
 *    refactor happened: an empty WHY cell reads as "we didn't look", and the
 *    renderer must make "we looked and found nothing" visibly different from a
 *    missing value).
 */

const t = require('../lib/thesisCardEmail');

const digestItem = (over = {}) => ({
  companyId: 'NSE:AAA',
  name: 'Alpha Ltd',
  significance: 'high',
  category: 'order_book',
  headline: 'Won a ₹512 Cr order',
  insight: 'Won a big order.',
  announcementId: 'a1',
  ...over,
});

const signal = (over = {}) => ({
  companyId: 'NSE:AAA',
  ticker: 'NSE:AAA',
  name: 'Alpha Ltd',
  tier: 'ACT',
  return_1d: 6.2,
  market_cap_cr: 4200,
  delivery_pct: 54.1,
  delivery_value_cr: 80.4,
  streak: 1,
  ...over,
});

describe('delivery value as % of market cap', () => {
  test('computes the ratio from delivery value and market cap', () => {
    expect(t.deliveryValuePctOfMcap({ delivery_value_cr: 80, market_cap_cr: 400 })).toBeCloseTo(20);
  });

  test('prefers a precomputed value from the classifier over recomputing', () => {
    // The classifier owns this number; the renderer must not quietly produce a
    // second, differently-rounded version of it.
    expect(
      t.deliveryValuePctOfMcap({
        delivery_value_pct_of_mcap: 1.914,
        delivery_value_cr: 80.4,
        market_cap_cr: 4200,
      })
    ).toBe(1.914);
  });

  test('is null — never 0 — when either input is missing', () => {
    // A company we could not measure must not rank as one we measured and
    // found empty. This distinction is the whole reason the field is nullable.
    expect(t.deliveryValuePctOfMcap({ delivery_value_cr: null, market_cap_cr: 400 })).toBeNull();
    expect(t.deliveryValuePctOfMcap({ delivery_value_cr: 80, market_cap_cr: null })).toBeNull();
    expect(t.deliveryValuePctOfMcap({ delivery_value_cr: 80, market_cap_cr: 0 })).toBeNull();
  });
});

describe('delivery-value sort', () => {
  test('sorts descending by delivery value', () => {
    const out = t.sortByDeliveryValue([
      signal({ ticker: 'A', delivery_value_cr: 10 }),
      signal({ ticker: 'B', delivery_value_cr: 99 }),
      signal({ ticker: 'C', delivery_value_cr: 50 }),
    ]);
    expect(out.map((s) => s.ticker)).toEqual(['B', 'C', 'A']);
  });

  test('puts unmeasured names last rather than treating them as zero', () => {
    const out = t.sortByDeliveryValue([
      signal({ ticker: 'NODATA', delivery_value_cr: null, return_1d: 20 }),
      signal({ ticker: 'SMALL', delivery_value_cr: 0.5, return_1d: 1 }),
    ]);
    expect(out.map((s) => s.ticker)).toEqual(['SMALL', 'NODATA']);
  });

  test('breaks ties on return so ordering is deterministic across re-runs', () => {
    const out = t.sortByDeliveryValue([
      signal({ ticker: 'LOW', delivery_value_cr: 10, return_1d: 2 }),
      signal({ ticker: 'HIGH', delivery_value_cr: 10, return_1d: 8 }),
    ]);
    expect(out.map((s) => s.ticker)).toEqual(['HIGH', 'LOW']);
  });

  test('does not mutate the caller’s array', () => {
    const input = [
      signal({ ticker: 'A', delivery_value_cr: 1 }),
      signal({ ticker: 'B', delivery_value_cr: 2 }),
    ];
    t.sortByDeliveryValue(input);
    expect(input.map((s) => s.ticker)).toEqual(['A', 'B']);
  });
});

describe('WHY block — the honest blank', () => {
  test('renders an explicit "no discoverable trigger" line when nothing was found', () => {
    // The failure this guards against: an empty WHY cell is indistinguishable
    // from a bug. "We checked and there is nothing" must be visibly stated.
    const html = t.whyHtml({ basis: 'none' });
    expect(html).toContain('No discoverable trigger');
    expect(html).toContain('14d');
  });

  test('treats a missing WHY on a rendered card the same as an explicit none', () => {
    const html = t.whyHtml({ text: '', basis: 'filing' });
    expect(html).toContain('No discoverable trigger');
  });

  test('labels which rung of the ladder answered', () => {
    expect(t.whyHtml({ text: 'Live capacity catalyst.', basis: 'catalyst' })).toContain(
      'From re-rating catalyst'
    );
    expect(t.whyHtml({ text: 'Order win.', basis: 'filing' })).toContain('From filing');
    expect(t.whyHtml({ text: 'Sector-wide move.', basis: 'sector' })).toContain('Sector-wide');
  });

  test('renders sources when supplied', () => {
    const html = t.whyHtml({ text: 'x', basis: 'filing', sources: ['BSE filing 02-Sep-2026'] });
    expect(html).toContain('BSE filing 02-Sep-2026');
  });

  test('escapes untrusted text', () => {
    expect(t.whyHtml({ text: '<script>x</script>', basis: 'filing' })).not.toContain('<script>');
  });
});

describe('EPS thesis block', () => {
  test('renders the J-curve tag as a badge', () => {
    expect(t.epsThesisHtml({ jCurveTag: 'STRONG', thesis: 'x' })).toContain('J-CURVE STRONG');
  });

  test('shows the as-of date when the brief came from cache', () => {
    // A cached thesis is fine; a cached thesis presented as this morning's read
    // is not. The date is how a reader tells the difference.
    const html = t.epsThesisHtml({
      jCurveTag: 'WEAK',
      thesis: 'x',
      cacheHit: true,
      asOf: '2026-08-20',
    });
    expect(html).toContain('as of 2026-08-20');
  });

  test('omits the as-of date on a freshly built brief', () => {
    const html = t.epsThesisHtml({ jCurveTag: 'WEAK', thesis: 'x', asOf: '2026-09-03' });
    expect(html).not.toContain('as of');
  });

  test('renders nothing at all when there is no thesis', () => {
    expect(t.epsThesisHtml(null)).toBe('');
  });

  test('caps catalyst chips at three', () => {
    const html = t.epsThesisHtml({
      jCurveTag: 'NONE',
      catalysts: ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name })),
    });
    expect(html).toContain('>a<');
    expect(html).toContain('>c<');
    expect(html).not.toContain('>d<');
  });
});

describe('scan-signal email', () => {
  const build = (signals, opts) =>
    t.buildScanSignalEmail(signals, {
      title: 'Daily Gainers Signal',
      marketDate: '2026-09-03',
      ...opts,
    });

  test('groups by tier and orders ACT before WATCH before NOTED', () => {
    const html = build([
      signal({ companyId: 'NSE:W', tier: 'WATCH', delivery_value_cr: 500 }),
      signal({ companyId: 'NSE:N', tier: 'NOTED', delivery_value_cr: 900 }),
      signal({ companyId: 'NSE:A', tier: 'ACT', delivery_value_cr: 1 }),
    ]);
    // Even though NOTED holds the largest delivery value, tier ordering wins at
    // the section level — the sort applies WITHIN a tier, not across tiers.
    expect(html.indexOf('Act')).toBeLessThan(html.indexOf('Watch'));
    expect(html.indexOf('Watch')).toBeLessThan(html.indexOf('Noted'));
  });

  test('sorts within a tier by delivery value', () => {
    const html = build([
      signal({ companyId: 'NSE:SMALL', tier: 'ACT', delivery_value_cr: 5 }),
      signal({ companyId: 'NSE:BIG', tier: 'ACT', delivery_value_cr: 500 }),
    ]);
    expect(html.indexOf('NSE:BIG')).toBeLessThan(html.indexOf('NSE:SMALL'));
  });

  test('renders market cap and delivery-as-%-of-mcap on every card', () => {
    const html = build([signal({ delivery_value_pct_of_mcap: 1.914 })]);
    expect(html).toContain('Mcap');
    expect(html).toContain('Deliv/Mcap');
    expect(html).toContain('1.91%');
  });

  test('detail scales with tier: WATCH drops the thesis chain, NOTED is one line', () => {
    const chain = ['step one happened', 'step two followed'];
    const act = build([signal({ tier: 'ACT', thesisChain: chain })]);
    const watch = build([signal({ tier: 'WATCH', thesisChain: chain })]);
    const noted = build([signal({ tier: 'NOTED', thesisChain: chain })]);
    expect(act).toContain('step two followed');
    expect(watch).not.toContain('step two followed');
    expect(noted).not.toContain('step two followed');
  });

  test('suppresses the volume badge when the caller passes volumeRocketing false', () => {
    // volume-rocketing does this: the badge is definitionally true of every
    // name in that scan, so showing it on every row says nothing.
    expect(build([signal({ volumeRocketing: true })])).toContain('Vol 2.5x');
    expect(build([signal({ volumeRocketing: false })])).not.toContain('Vol 2.5x');
  });

  test('renders the linkage chip so "unexplained" cannot read as "explained"', () => {
    expect(build([signal({ linkage: 'unexplained' })])).toContain('Unexplained');
    expect(build([signal({ linkage: 'mismatched' })])).toContain('Mismatched');
  });

  test('renders sector clusters, the streak board and the stats footer', () => {
    const html = build([signal()], {
      clusters: {
        Cement: { tier: 'SUPER_STRONG', qualified_count: 4, qualified_delivery_value_cr: 312 },
      },
      streaks: [
        { ticker: 'NSE:AAA', name: 'Alpha Ltd', streak: 3, tier: 'ACT', delivery_value_cr: 80 },
      ],
      stats: { universe: 50, act: 1, epsBriefs: 10, briefCacheHits: 7 },
    });
    expect(html).toContain('Sector clusters');
    expect(html).toContain('SUPER_STRONG');
    expect(html).toContain('Streak board');
    expect(html).toContain('Brief cache hits');
  });

  test('says so plainly when the scan produced nothing', () => {
    expect(build([])).toContain('No signals in this scan today');
  });

  test('deduplicates a company appearing twice', () => {
    const html = build([signal({ companyId: 'NSE:DUP' }), signal({ companyId: 'NSE:DUP' })]);
    expect(html.split('NSE:DUP').length - 1).toBeLessThan(4);
  });
});

describe('announcement-digest mode still behaves as before the extraction', () => {
  test('groups multiple filings from one company into a single card', () => {
    const grouped = t.groupInsightsByCompany([
      digestItem({ announcementId: 'a1' }),
      digestItem({ announcementId: 'a2', significance: 'medium', category: 'shareholding_change' }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].subAnnouncementCount).toBe(2);
    // The card keeps the highest-scoring item's significance so a company with
    // one high-conviction filing still surfaces in the High section.
    expect(grouped[0].significance).toBe('high');
  });

  test('ranks a mostly-NEW announcement above a mostly-KNOWN one', () => {
    const mostlyNew = digestItem({
      infoClassification: { claims: [{ bucket: 'NEW' }, { bucket: 'NEW' }] },
    });
    const mostlyKnown = digestItem({
      infoClassification: { claims: [{ bucket: 'KNOWN' }, { bucket: 'KNOWN' }] },
    });
    expect(t.computeRankScore(mostlyNew)).toBeGreaterThan(t.computeRankScore(mostlyKnown));
  });

  test('references the filing icon by cid, never as a data: URI', () => {
    // Gmail strips the src attribute from any <img src="data:...">, confirmed
    // by DOM inspection of live rendered mail. Losing this would silently break
    // the link button on every card in every digest.
    const html = t.buildDigestHtml([digestItem({ pdfUrl: 'https://x/1' })], {
      cutoffIstHuman: 'a',
      runIstHuman: 'b',
    });
    expect(html).toContain(`cid:${t.EXPAND_ICON_CID}`);
    expect(html).not.toContain('src="data:');
  });
});

// ── 5-level signal strength (added 2026-09-04) ─────────────────────────────
describe('signal strength: 5 tiers derived from significance + evidence', () => {
  const {
    computeSignalScore,
    signalTierFor,
    signalScoreChipHtml,
    SIGNAL_TIERS,
  } = require('../lib/thesisCardEmail');

  const hardEps = { direction: 'positive', magnitude: '+18%', confidence: 'high' };

  test('all five tiers are reachable — the calibration bug this guards against', () => {
    // The first cut normalised computeRankScore by its THEORETICAL max (100),
    // which pinned every `medium` note to the bottom of its band and made S3
    // mathematically unreachable. Five tiers where one cannot occur is four
    // tiers with extra steps, so this asserts reachability directly rather
    // than asserting the divisor's value.
    const cases = [
      {
        significance: 'high',
        high_conviction: true,
        epsImpact: hardEps,
        infoClassification: { claims: [{ bucket: 'NEW' }, { bucket: 'NEW' }] },
      },
      { significance: 'high', epsImpact: { direction: 'positive', confidence: 'medium' } },
      { significance: 'medium', epsImpact: { direction: 'positive', confidence: 'low' } },
      { significance: 'medium', epsImpact: null },
      { significance: 'routine', epsImpact: null },
    ];
    const tiers = cases.map((c) => signalTierFor(c).tier);
    expect(new Set(tiers).size).toBe(5);
    expect(tiers).toEqual([1, 2, 3, 4, 5]);
  });

  test('bands do not overlap: a medium can never present as a top tier', () => {
    // Even with every evidence signal maxed out, a `medium` must stay below
    // S2's floor — the refinement reorders within a label, never across.
    const maxedMedium = {
      significance: 'medium',
      high_conviction: true,
      epsImpact: hardEps,
      infoClassification: { claims: [{ bucket: 'NEW' }, { bucket: 'NEW' }, { bucket: 'NEW' }] },
      marketData: { returns1d: 12, volRatio7d: 5 },
    };
    expect(computeSignalScore(maxedMedium)).toBeLessThan(60);
    expect(signalTierFor(maxedMedium).tier).toBeGreaterThanOrEqual(3);

    const bareHigh = { significance: 'high', epsImpact: null };
    expect(computeSignalScore(bareHigh)).toBeGreaterThanOrEqual(60);
  });

  test('score is monotone in evidence quality at the same significance', () => {
    const base = { significance: 'high' };
    const withSoftEps = { ...base, epsImpact: { direction: 'positive', confidence: 'low' } };
    const withHardEps = { ...base, epsImpact: hardEps };
    expect(computeSignalScore(base)).toBeLessThan(computeSignalScore(withSoftEps));
    expect(computeSignalScore(withSoftEps)).toBeLessThan(computeSignalScore(withHardEps));
  });

  test('market reaction cannot promote a card out of its evidence band', () => {
    // Clamping matters: what the market did is confirmation, not new evidence
    // about the filing, so it moves a card up its band and no further.
    const low = { significance: 'low', epsImpact: null };
    const lowWithHugeMove = { ...low, marketData: { returns1d: 25, volRatio7d: 9 } };
    expect(computeSignalScore(lowWithHugeMove)).toBeLessThanOrEqual(34);
    expect(signalTierFor(lowWithHugeMove).tier).toBeGreaterThanOrEqual(4);
  });

  test('every tier has a min/label/code and the list is ordered strongest-first', () => {
    expect(SIGNAL_TIERS).toHaveLength(5);
    for (const t of SIGNAL_TIERS) {
      expect(typeof t.min).toBe('number');
      expect(t.code).toMatch(/^S[1-5]$/);
      expect(t.label.length).toBeGreaterThan(0);
    }
    const mins = SIGNAL_TIERS.map((t) => t.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });

  test('chip shows both the tier and the raw number', () => {
    const html = signalScoreChipHtml({ significance: 'high', epsImpact: hardEps });
    expect(html).toMatch(/S[12]/);
    expect(html).toMatch(/\d+\/100/);
  });
});

describe('digest: tiers drive sections, and the footer agrees with the body', () => {
  const { buildDigestHtml } = require('../lib/thesisCardEmail');
  const items = [
    {
      companyId: 'NSE:A',
      name: 'A Ltd',
      category: 'demerger',
      significance: 'high',
      high_conviction: true,
      headline: 'H1',
      insight: 'i1',
      announcementId: 'a1',
      epsImpact: { direction: 'positive', magnitude: '+18%', confidence: 'high' },
      infoClassification: { claims: [{ bucket: 'NEW' }, { bucket: 'NEW' }] },
    },
    {
      companyId: 'NSE:B',
      name: 'B Ltd',
      category: 'order_book',
      significance: 'medium',
      headline: 'H2',
      insight: 'i2',
      announcementId: 'a2',
      epsImpact: { direction: 'positive', confidence: 'low' },
    },
    {
      companyId: 'NSE:C',
      name: 'C Ltd',
      category: 'general',
      significance: 'routine',
      headline: 'H3',
      insight: 'i3',
      announcementId: 'a3',
      epsImpact: null,
    },
  ];

  test('renders per-tier sections and a per-tier footer strip', () => {
    const html = buildDigestHtml(items, {
      cutoffIstHuman: 'start',
      runIstHuman: 'end',
      slotLabel: 'Post-close',
    });
    expect(html).toContain('Signal strength');
    expect(html).toContain('Post-close');
    // One section header per distinct tier present, and each card carries a score.
    expect((html.match(/\/100/g) || []).length).toBe(items.length);
  });

  test('knowledge-gap strip renders, and an unresolved gap is flagged as such', () => {
    const html = buildDigestHtml(items, {
      cutoffIstHuman: 's',
      runIstHuman: 'e',
      knowledgeGaps: [
        {
          topic: 'CCPS conversion mechanics',
          whyItMattered: 'dilution math',
          resolvedVia: 'SEBI ICDR',
        },
        { topic: 'Uncovered thing', whyItMattered: 'needed it' },
      ],
    });
    expect(html).toContain('Knowledge-base gaps');
    expect(html).toContain('CCPS conversion mechanics');
    expect(html).toContain('resolved via: SEBI ICDR');
    expect(html).toContain('(unresolved)');
  });

  test('no knowledge gaps means no strip — an empty list is the honest answer', () => {
    const html = buildDigestHtml(items, {
      cutoffIstHuman: 's',
      runIstHuman: 'e',
      knowledgeGaps: [],
    });
    expect(html).not.toContain('Knowledge-base gaps');
  });

  test('footer draws the keyword-filter and already-covered funnel stages', () => {
    const html = buildDigestHtml(items, {
      cutoffIstHuman: 's',
      runIstHuman: 'e',
      stats: { total: 41, noiseDropped: 9, alreadyProcessed: 4, insights: 3 },
    });
    expect(html).toContain('Keyword-filtered');
    expect(html).toContain('Already covered');
  });
});

describe('marketDataHtml: the ratio columns added for the day recap', () => {
  const { marketDataHtml } = require('../lib/thesisCardEmail');

  test('renders market cap and delivery-as-%-of-mcap alongside the old figures', () => {
    const html = marketDataHtml({
      returns1d: 6.4,
      deliveryPct: 62.1,
      deliveryValueCr: 48.3,
      volRatio7d: 3.12,
      marketCapCr: 1820,
      deliveryValuePctOfMcap: 2.65,
    });
    expect(html).toContain('Mcap');
    expect(html).toContain('1.8k Cr');
    expect(html).toContain('Deliv/Mcap');
    expect(html).toContain('2.65%');
  });

  test('a legacy note without the new fields still renders, showing em-dashes', () => {
    // Notes written before these fields existed must not break the digest.
    const html = marketDataHtml({
      returns1d: 1.2,
      deliveryPct: 40,
      deliveryValueCr: 5,
      volRatio7d: 1.1,
    });
    expect(html).toContain('1D');
    expect(html).toContain('Mcap: <b style="color:#475467;">—</b>');
  });

  test('an entirely empty marketData renders nothing at all', () => {
    expect(
      marketDataHtml({
        returns1d: null,
        deliveryPct: null,
        deliveryValueCr: null,
        volRatio7d: null,
        marketCapCr: null,
        deliveryValuePctOfMcap: null,
      })
    ).toBe('');
  });
});
