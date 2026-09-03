const db = require('./packages/jobs-runtime/lib/db.js');

const reports = [
  {
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: '2026-09-01',
    companyId: 'NSE:TBZ',
    modelUsed: 'claude-sonnet-5',
    summary:
      'Open offer from GRT Jewellers (India) Pvt Ltd for 25.88% of voting capital at ₹249.61/share, ~₹431 Cr aggregate. Clean SAST takeover-related trigger.',
    research_axis: 'delivery_value',
    tier: 'ACT',
    trigger: 'Open offer announcement under SEBI SAST Regulations',
    trigger_quantified:
      'GRT Jewellers open offer for 1,72,70,845 shares (25.88% of voting capital) at ₹249.61/share, aggregating ~₹431 Cr',
    linkage: 'explained',
    contextUsed: [],
    concallCorroboration: null,
    narrative:
      'Both filings restate the same Aug 31 disclosure (public announcement + company acknowledgement) — novelty assessment correctly flagged as follow-up, but the underlying event is a genuine, market-moving open offer, not noise.',
  },
  {
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: '2026-09-01',
    companyId: 'NSE:MARINE',
    modelUsed: 'claude-sonnet-5',
    summary:
      'Two consecutive days of data-center power distribution order wins totaling ~₹628.5 Cr (Digital Edge DC ₹229.7 Cr on Sep 1, Princeton Digital Group + Classic Electric ₹398.8 Cr on Aug 31).',
    research_axis: 'delivery_pct',
    tier: 'ACT',
    trigger: 'Order wins from data-center clients',
    trigger_quantified:
      '₹229.7 Cr (Digital Edge DC, 15mo delivery) + ₹398.8 Cr (Princeton Digital Group + Classic Electric, 6-18mo delivery) = ~₹628.5 Cr across two sessions',
    linkage: 'explained',
    contextUsed: [],
    concallCorroboration: null,
    narrative:
      'Strong, quantified, unscheduled order-book news landing two days in a row — data-center power infra demand is the through-line across all three orders.',
  },
  {
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: '2026-09-01',
    companyId: 'NSE:WELCORP',
    modelUsed: 'claude-sonnet-5',
    summary:
      'ACT-tier classification not supported by filings read: a trivial GGBS associate-co incorporation (₹26,000 paid-up) and a stale promoter block-deal SALE (2.27%, dated Aug 26). Concall (Jul 27) was Neutral. No fresh catalyst found for the +6.8% move.',
    research_axis: 'delivery_value',
    tier: 'ACT',
    trigger: 'None found — filings do not explain the move',
    trigger_quantified:
      'Associate co incorporation: ₹26,000 paid-up capital (26% stake) — immaterial. Promoter sale: 60,00,000 shares (2.27%) via block deal, Aug 26 — a divestment, not a buy signal, and 6 days stale.',
    linkage: 'mismatched',
    contextUsed: [],
    concallCorroboration: null,
    narrative:
      'Delivery is real (30% / ₹269 Cr) but unexplained by any filing surfaced here. Flagged explicitly as mismatched rather than reaching for the nearest available narrative — promoter selling is directionally the opposite of what would explain a rally.',
  },
];

(async () => {
  for (const r of reports) {
    const res = await db.saveReport(r);
    console.log('saved', r.companyId, JSON.stringify(res).slice(0, 150));
  }
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
