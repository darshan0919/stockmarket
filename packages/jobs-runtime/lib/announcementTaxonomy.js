'use strict';

/**
 * announcementTaxonomy.js — the single source of truth for "what KIND of corporate
 * announcement is this, and how much does it matter?"
 *
 * Previously `watchlistInsights.js` owned CATEGORY_RULES privately while
 * `gainersScanner.js`/`gainersClassifier.js` each carried their own flat
 * MATERIAL_KEYWORDS list. The three drifted (an "Award of Order" was material to
 * the scanner but routine to the classifier), which is exactly the class of bug
 * that makes a signal report untrustworthy. Both jobs now import from here, so a
 * keyword added for one is a keyword added for all.
 *
 * The tiering below encodes the user's stated hierarchy of what actually moves a
 * thesis vs. what is compliance paperwork — see STRONG_CATEGORIES.
 */

// ── Categorisation (first match wins; catch-all 'general' last) ───────────────
// Ordering is load-bearing: more specific categories must precede broader ones
// (e.g. `fundraise` before `acquisition`, since a preferential allotment to an
// acquirer mentions both).
const CATEGORY_RULES = [
  [
    'order_book',
    [
      'award_of_order',
      'award of order',
      'receipt of order',
      'bagging',
      'receiving of order',
      'order win',
      'letter of intent',
      'work order',
      'new order',
      'order book',
      'contract award',
      'order from',
    ],
  ],
  [
    'investor_meet',
    [
      'investor meet',
      'analyst meet',
      'one-on-one meeting',
      'institutional investor',
      'investors meeting',
      'fund manager',
    ],
  ],
  [
    // Fundraise BEFORE shareholding_change: a preferential allotment/warrant
    // issue to a promoter or strategic investor is fundamentally a capital
    // event (new shares/warrants created, dilutive), even though the filing
    // text inevitably also uses shareholding-change vocabulary ("acquirer",
    // "acquisition of shares") to describe the allottee. Without this
    // ordering, shareholding_change's broad 'acquirer'/'acquisition of
    // shares' keywords steal the first-match on preferential-issue filings,
    // mislabeling a fundraise as a mere SAST/stake-change disclosure (see
    // the ZEEL preferential-warrant-to-promoter case, 2026-08-27 —
    // categorised shareholding_change despite the substance being a 17.9%
    // dilutive capital infusion, exactly the miscategorisation this
    // ordering comment already warned about at the top of this file).
    'fundraise',
    [
      'qip',
      'qualified institutional placement',
      'preferential allotment',
      'preferential issue',
      'ncd',
      'non-convertible debenture',
      'warrant',
      'rights issue',
      'fund rais',
      'raising of fund',
      'private placement',
      'issue of securities',
    ],
  ],
  [
    'shareholding_change',
    [
      'sast',
      'takeover regulation',
      'takeovers',
      'substantial acquisition of shares',
      'substantial acquisition',
      'open market purchase',
      'open market sale',
      'pledge',
      'encumbrance',
      'bulk deal',
      'block deal',
      'reg. 29',
      'reg. 31',
      'regulation 29',
      'regulation 31',
      'disclosure under regulation 29',
      'disclosure under sast',
      'promoter bought',
      'promoter sold',
      'promoter purchased',
      'acquirer',
      'acquisition of shares',
    ],
  ],
  [
    'credit_rating',
    [
      'credit rating',
      'crisil',
      'icra',
      'care ratings',
      'india ratings',
      'fitch',
      'rating upgrade',
      'rating downgrade',
      'rating watch',
    ],
  ],
  [
    'management_change',
    [
      'resignation of director',
      'appointment of director',
      'change in management',
      'change in directorate',
      'completion of tenure',
      'cessation',
      'new ceo',
      'new cfo',
      'new md',
    ],
  ],
  [
    // Anticipation BEFORE results: a board-meeting intimation "to consider the
    // Un-Audited Financial Results" contains the `results` keywords verbatim,
    // so without this ordering every result-date notice would categorise as an
    // actual results filing — the exact confusion ROUTINE_OVERRIDES was
    // patching over. Ordering it first makes the distinction explicit: this is
    // a DATE for results, not results. Strength stays ROUTINE (a notice
    // asserts no facts); significance is VERY_HIGH conditional on prior
    // guidance, which the reasoning layer resolves.
    'anticipation',
    [
      'board meeting intimation',
      'intimation of board meeting',
      'notice of board meeting',
      'board meeting notice',
      'intimation of the meeting of the board',
      'consideration of un-audited financial results',
      'consideration of unaudited financial results',
      'to consider and approve the financial results',
      'declaring result',
      'declaration of results',
    ],
  ],
  [
    'results',
    [
      'financial results',
      'quarterly results',
      'annual results',
      'unaudited results',
      'audited results',
      'standalone results',
      'consolidated results',
      'earnings release',
    ],
  ],
  [
    'agm_egm',
    [
      'outcome of agm',
      'outcome of egm',
      'outcome of postal ballot',
      'extraordinary general meeting',
      'extra-ordinary general meeting',
      'shareholder meeting',
      'annual general meeting',
    ],
  ],
  [
    'regulatory',
    [
      'gst',
      'income tax',
      'tax demand',
      'tax order',
      'anti-evasion',
      'search and seizure',
      'show cause',
      'sebi order',
      'cci approval',
      'nclt',
      'adjudication',
      'penalty',
      'navratna',
      'miniratna',
      'usfda',
      'us fda',
      'establishment inspection report',
      'form 483',
      'pli scheme',
    ],
  ],
  [
    'capacity',
    [
      'commercial operations',
      'commercial production',
      'commissioning',
      'capacity addition',
      'capacity expansion',
      'new plant',
      'plant expansion',
      'new facility',
      'capex',
      'production commence',
      'debottleneck',
      // Retail/distribution-network expansion — a store/showroom rollout is the
      // consumer-facing equivalent of a plant expansion (more selling capacity,
      // same forward-EPS logic) but used none of the industrial-capacity words
      // above. Missed live 2026-09-04: Jindal Worldwide's EV-subsidiary press
      // release ("Expand Retail Footprint to 100 Showrooms by FY28") and
      // Lalithaa Jewellery's showroom-launch news both fell to 'general' and
      // were never surfaced.
      'retail footprint',
      'showroom',
      'new store',
      'store expansion',
      'store network',
      'outlet expansion',
      'flagship store',
      'expand its retail',
      'expand retail',
    ],
  ],
  [
    // Deleveraging — paying DOWN debt is the mirror image of `fundraise` (raising
    // it) and belongs in the same forward-earnings-changing tier: interest cost
    // drops, and "debt-free" is a re-rating trigger of its own in small/mid caps.
    // Missed live 2026-09-04: PC Jeweller's "Update on Clearance of Outstanding
    // Debt" (9 of 14 consortium banks fully repaid, 96%+ of the rest discharged,
    // on track to be debt-free that month) filed under a title with none of the
    // `fundraise` keywords and fell to 'general'.
    'deleveraging',
    [
      'clearance of outstanding debt',
      'clearance of debt',
      'repayment of debt',
      'debt repayment',
      'debt-free',
      'debt free',
      'settlement of debt',
      'one time settlement',
      'one-time settlement',
      'discharge of debt',
      'consortium bank',
      'debt resolution',
    ],
  ],
  [
    // Margin expansion — SOIC's canonical growth-trigger list is literally
    // "margin expansion, capacity expansion, deleveraging, capex, geographical
    // expansion, corporate action, backward integration" (Masterclass on
    // Investing Using AI · 29.06.25 Class 2, 00:29:04). Margin was the one
    // item on that list with no category here at all. A mix shift into
    // value-added products or backward integration is a direct EPS-accretion
    // mechanism — see growth_catalyst_framework.md §2 ("New value-added
    // products / mix shift") and §3b.5 for the structural-vs-transitory test
    // the reasoning layer must apply before crediting it.
    'margin_expansion',
    [
      'margin expansion',
      'margin improvement',
      'ebitda margin',
      'gross margin',
      'operating margin',
      'value-added',
      'value added product',
      'premiumisation',
      'premiumization',
      'mix shift',
      'backward integration',
      'backward integrated',
      'forward integration',
      'cost reduction initiative',
      'operating leverage',
    ],
  ],
  [
    // Monthly business/sales updates — the same category `monthly-updates-tracker`
    // already parses as its own workflow, but gainers-signal/volume-rocketing had
    // no notion of it at all, so a filing titled "Monthly Business Updates" (or
    // "Monthly Sales figures") landed in 'general' regardless of the volume trend
    // inside it. Missed live 2026-09-04: SML Mahindra's August update (total
    // vehicles +40% YoY) filed 2 trading days before a 2nd straight day of gains —
    // a textbook follow-through case the taxonomy had no way to name.
    'monthly_update',
    [
      'monthly business update',
      'monthly business updates',
      'monthly sales',
      'monthly volume',
      'monthly production',
      'sales figures for the month',
      'business update for the month',
    ],
  ],
  ['dividend', ['dividend', 'record date for payment']],
  [
    // Demerger/spin-off BEFORE merger/acquisition: a "scheme of arrangement"
    // title is shared by all three, but "demerger" / "spin-off" / "resulting
    // company" language is the specific tell. See references/demerger-merger-
    // management-change-playbook.md (announcement-insights skill) for why this
    // is treated as its own high-conviction category rather than folded into
    // 'acquisition' — SOTP re-rating dynamics are a different animal from a
    // control-premium M&A trade.
    'demerger',
    [
      'demerger',
      'de-merger',
      'spin-off',
      'spin off',
      'scheme of arrangement',
      'resulting company',
      'sotp',
      'hive off',
      'hive-off',
      'hived off',
    ],
  ],
  [
    // Merger/amalgamation/takeover BEFORE plain 'acquisition': these are
    // control-change or entity-combination events (arbitrage/control-premium
    // dynamics), distinct from a straightforward stake/business buy.
    'merger',
    [
      'merger',
      'amalgamation',
      'amalgamated',
      'takeover',
      'open offer',
      'reverse merger',
      'merger arbitrage',
    ],
  ],
  [
    'acquisition',
    ['acquisition', 'acquire', 'joint venture', ' jv ', 'slump sale', 'stake purchase'],
  ],
  ['buyback', ['buyback', 'buy-back', 'extinguishment of shares', 'share repurchase']],
  [
    // Placed last before the 'general' catch-all: these are FILING-TYPE tells
    // (what kind of document this is), not event-type tells, so any genuine
    // material event above (order_book, demerger, results, etc.) should win
    // first-match even if it happens to co-mention "presentation" or
    // "transcript". Only an announcement that is JUST the heavy document
    // itself, with no more specific material-event keyword, lands here.
    // See HEAVY_DOCUMENT_CATEGORIES below — watchlist-insights deliberately
    // skips PDF-parsing these, since dedicated skills (concall-analysis,
    // equity-research-extraction/stock-report, annual-report-analysis) own
    // them and they are frequently 15-300+ pages.
    'concall_transcript',
    [
      'transcript of earnings call',
      'transcript of conference call',
      'transcript of concall',
      'transcript of the earnings call',
      'transcript of the conference call',
      'concall transcript',
      'earnings call transcript',
      'conference call transcript',
    ],
  ],
  [
    'investor_presentation',
    [
      'investor presentation',
      'investors presentation',
      'investor update',
      'investors update',
      'analyst presentation',
      'presentation to investors',
      'presentation to analysts',
    ],
  ],
  ['annual_report', ['annual report', 'integrated annual report', 'annual report and accounts']],
  ['general', []],
];

/**
 * Categories that plausibly re-rate a business rather than merely satisfying a
 * disclosure obligation. This is the user's stated list of "common strong
 * announcement signals": earnings, order book, acquisition/merger/demerger, new
 * capacity commencement, QIP / preferential issue / warrants, and SAST.
 *
 * `credit_rating` and `regulatory` are deliberately in the second tier
 * (SUPPORTING): a rating upgrade or a USFDA clearance genuinely matters, but on
 * its own it rarely explains a double-digit single-day move the way an order win
 * or a result does. They corroborate a signal; they don't originate one.
 *
 * `demerger` / `merger` / `management_change` sit in HIGH_CONVICTION_CATEGORIES
 * below (see announcement-insights skill) ON TOP OF this tier — they are always
 * STRONG regardless of scale, because base-rate evidence (SOIC special-situations
 * research, Aug 2026) shows spin-offs and leadership changes are disproportionate
 * sources of re-rating alpha versus their frequency, and are cheap for retail to
 * front-run institutions on precisely because small/mid-cap demergers fall below
 * institutional mandate thresholds.
 */
const STRONG_CATEGORIES = new Set([
  'results',
  'order_book',
  'acquisition',
  'merger',
  'demerger',
  'capacity',
  'fundraise',
  'shareholding_change',
  'management_change',
  'deleveraging',
  // Margin expansion is a direct EPS-accretion mechanism and sits on SOIC's
  // canonical growth-trigger list — the framework's §5a path runs
  // ... → Margin Expansion → PAT/EPS Acceleration → Re-rating. Whether a
  // specific margin move is structural or transitory is §3b.5's question for
  // the reasoning layer, but the filing itself is never merely SUPPORTING.
  'margin_expansion',
]);

// `monthly_update` starts SUPPORTING, not STRONG: most months are unremarkable
// (a filing exists every month regardless of whether the number is interesting),
// the same "scheduled, not a surprise" logic SCHEDULED_CATEGORIES applies to
// results/dividend. `boostStrengthFromContent()` below promotes it to STRONG
// once the actual YoY/MoM % figures in the filing are read and found large —
// exactly the read-before-judging fix this file exists for.
const SUPPORTING_CATEGORIES = new Set([
  'credit_rating',
  'regulatory',
  'buyback',
  'investor_meet',
  'monthly_update',
]);

/**
 * Categories that ALWAYS warrant the deep announcement-insights template
 * (SOTP valuation / control-premium / governance-turnaround framework) and a
 * `high_conviction: true` flag on the saved note, regardless of the deal size —
 * see skills/equity-research/announcement-insights/SKILL.md and its
 * references/demerger-merger-management-change-playbook.md for the full
 * rationale and the extraction checklists. Any consumer of a note (digest email,
 * investment-thesis-engine, gainers-signal) should treat
 * `tags.includes('high_conviction')` as a "read this one" flag independent of
 * the `significance` bucket.
 */
const HIGH_CONVICTION_CATEGORIES = new Set([
  'demerger',
  'merger',
  'acquisition',
  'management_change',
]);

/**
 * ── SIGNIFICANCE: a SECOND axis, orthogonal to strength ─────────────────────
 *
 * `strength` (STRONG/SUPPORTING/ROUTINE) answers "how much does this filing
 * assert?". `significance` answers a different and, for this repo's purposes,
 * more important question: **does this filing plausibly change the market's
 * model of FUTURE EPS?** — i.e. is it on the path
 * `Trigger → Capacity/Operating Leverage → Revenue Acceleration → Margin
 * Expansion → PAT/EPS Acceleration → Re-rating`
 * (growth_catalyst_framework.md §5a).
 *
 * The two axes come apart in exactly the cases that matter. A board-meeting
 * intimation asserts almost nothing (strength ROUTINE, correctly) but for a
 * company that guided hard last quarter it is a dated catalyst the market
 * front-runs — "market is a discounting machine" (SOIC Market Signals ·
 * 17.05.26 Earnings Decoded, 01:24:56). A concall transcript is routed away
 * to a specialist skill (heavy document) yet is the single richest source of
 * forward guidance there is. Collapsing both axes into `strength` is what let
 * these read as low-priority.
 *
 * VERY_HIGH is Darshan's stated bar: "any kind of filing that leads to EPS
 * accretion or J-Curve or Strong Anticipation is very high significance."
 * It maps onto SOIC's own canonical growth-trigger list — "margin expansion,
 * capacity expansion, deleveraging, capex, geographical expansion, corporate
 * action, backward integration" (Masterclass on Investing Using AI · 29.06.25
 * Class 2, 00:29:04) — plus the four primary documents (result/PPT/concall/AR)
 * where guidance actually lives.
 *
 * IMPORTANT: significance is a PRIOR, not a verdict. A capacity announcement
 * of ₹2 Cr on a ₹5,000 Cr base is VERY_HIGH by category and trivial in fact.
 * Only the `announcement-taxonomy` skill's reasoning layer — which reads the
 * document and weighs the number against the company's base — produces the
 * final call. See skills/equity-research/announcement-taxonomy/SKILL.md.
 */
const VERY_HIGH_SIGNIFICANCE_CATEGORIES = new Set([
  // Direct EPS-accretion / J-curve mechanisms (framework §2, §5a)
  'capacity', // incl. store/showroom additions — retail floor space IS capacity
  'deleveraging', // lower finance cost = direct EPS accretion
  'margin_expansion',
  'order_book', // order book grows before revenue grows (§5d — leading signal)
  'fundraise', // warrants/pref issues: promoter skin in the game (§3)
  // Corporate actions that re-rate regardless of size (HIGH_CONVICTION set)
  'demerger',
  'merger',
  'acquisition',
  'management_change',
  // The four primary documents where forward guidance actually lives. These
  // are still ROUTED to specialist skills (HEAVY_DOCUMENT_CATEGORIES below) —
  // routing and significance are different questions and must not be conflated.
  'results',
  'concall_transcript',
  'investor_presentation',
  'annual_report',
  // Dated catalyst, conditional on prior-quarter guidance (see the category's
  // own comment in CATEGORY_RULES).
  'anticipation',
]);

const HIGH_SIGNIFICANCE_CATEGORIES = new Set([
  'monthly_update', // leading operational data between results
  'credit_rating', // rating upgrade often accompanies a deleveraging story
  'regulatory', // PLI/anti-dumping/USFDA reshape forward economics
  'shareholding_change', // smart-money SAST accumulation
  'buyback',
]);

/**
 * Categories whose final significance the script explicitly CANNOT resolve on
 * its own, and must hand to the reasoning layer with the question named.
 */
const REQUIRES_REASONING_CHECK = {
  anticipation:
    'Significance depends on whether this company gave strong guidance in its ' +
    'previous concall/quarter — the script cannot know that. Check the last ' +
    "concall's guidance before treating the result date as a catalyst.",
  monthly_update:
    'Significance depends on the YoY/MoM figures inside the filing and how they ' +
    'compare to the run-rate — a flat month is not a catalyst.',
  capacity:
    'Significance depends on the size of the addition RELATIVE to the existing ' +
    'base (% capacity added, or new stores vs. current store count) — an ' +
    'absolute number alone cannot be judged.',
  margin_expansion:
    'Apply framework §3b.5: is the margin move structural (mix shift, backward ' +
    'integration, operating leverage from a disclosed ramp) or transitory ' +
    '(inventory gain, forex, one-off commodity spike)?',
};

/** VERY_HIGH | HIGH | NORMAL — see VERY_HIGH_SIGNIFICANCE_CATEGORIES' doc comment. */
function significanceOf(category) {
  if (VERY_HIGH_SIGNIFICANCE_CATEGORIES.has(category)) return 'VERY_HIGH';
  if (HIGH_SIGNIFICANCE_CATEGORIES.has(category)) return 'HIGH';
  return 'NORMAL';
}

/**
 * STRONG categories that are CALENDAR-DRIVEN rather than genuine surprises.
 *
 * Earnings are strong and market-moving, but every listed company files them in
 * the same few weeks. During results season this makes "filed results" true of
 * almost every gainer, so treating it like an unscheduled order win floods the
 * top tier — observed live on 2026-07-30, where 14 of 38 names reached ACT almost
 * entirely on the existence of a results filing.
 *
 * What distinguishes an actionable earnings move is the SURPRISE and the market's
 * reaction to it, neither of which is knowable from the filing's title. So the
 * classifier gives scheduled events a smaller automatic credit and lets delivery
 * carry them into the top tier — and the PDF-reading research step is where the
 * actual beat/miss gets established.
 */
const SCHEDULED_CATEGORIES = new Set(['results', 'dividend', 'monthly_update']);

function isScheduled(category) {
  return SCHEDULED_CATEGORIES.has(category);
}

/** Human labels for the email/report render — keep short, they go in table cells. */
const CATEGORY_LABELS = {
  results: 'Earnings',
  order_book: 'Order win',
  acquisition: 'Acquisition',
  merger: 'Merger / Amalgamation',
  demerger: 'Demerger / Spin-off',
  capacity: 'New capacity',
  fundraise: 'QIP / Pref / Warrants',
  shareholding_change: 'SAST / stake change',
  credit_rating: 'Rating action',
  regulatory: 'Regulatory',
  buyback: 'Buyback',
  investor_meet: 'Investor meet',
  management_change: 'Management change',
  margin_expansion: 'Margin expansion',
  deleveraging: 'Debt reduction',
  monthly_update: 'Monthly update',
  anticipation: 'Result date / anticipation',
  dividend: 'Dividend',
  agm_egm: 'AGM / EGM',
  concall_transcript: 'Concall transcript',
  investor_presentation: 'Investor presentation',
  annual_report: 'Annual report',
  general: 'Other',
};

/**
 * Categories whose PDF is a heavy, dedicated-workflow document rather than
 * something watchlist-insights should itself parse into an insight. Each has
 * its own specialist skill that does this properly (deep extraction, section
 * structure, multi-quarter comparison, etc.) — re-parsing the same 15-300+
 * page document inside the daily watchlist scan would spend the model's
 * thinking time on document mechanics instead of the actual signal, which is
 * the opposite of what watchlist-insights exists to do.
 *
 * `results` is included deliberately: a genuine "Financial Results" /
 * "Unaudited Results" filing (the full statement, not a shorter press
 * release about it — those still fall to `general`) is exactly this kind of
 * document, and `quarterly-result-analysis` / `pre-pead-scanner` already own
 * it. `gainers-signal` is a DELIBERATE EXCEPTION — it does NOT skip `results`
 * (see its SKILL.md), because its actionability signal specifically needs
 * the beat/miss extracted from the results filing itself; only
 * `watchlist-insights` treats this set as skip-worthy.
 *
 * Skipping here means: don't fetch/parse the PDF, don't call
 * `announcement-insights`, just `mark-processed` and log the skip (category +
 * reason) for visibility — see HEAVY_DOCUMENT_SKIP_REASONS and
 * watchlist-insights' SKILL.md Step 2.
 */
const HEAVY_DOCUMENT_CATEGORIES = new Set([
  'results',
  'concall_transcript',
  'investor_presentation',
  'annual_report',
]);

const HEAVY_DOCUMENT_SKIP_REASONS = {
  results:
    'Full results/financial-statement filing — quarterly-result-analysis and ' +
    'pre-pead-scanner own this document; re-parsing it here would spend thinking time ' +
    'on tables instead of insight synthesis.',
  concall_transcript:
    'Full earnings-call transcript — concall-analysis / ' +
    'concall-transcript-extractor own this; typically 15-40+ pages of verbatim Q&A.',
  investor_presentation:
    'Full investor/analyst presentation — equity-research-extraction ' +
    'and stock-report own this; typically 20-60+ slides.',
  annual_report:
    'Full annual report — annual-report-analysis owns this; typically ' + '100-300+ pages.',
};

function isHeavyDocumentCategory(category) {
  return HEAVY_DOCUMENT_CATEGORIES.has(category);
}

function heavyDocumentSkipReason(category) {
  return HEAVY_DOCUMENT_SKIP_REASONS[category] || 'Heavy dedicated-workflow document.';
}

/**
 * Paperwork that WRAPS a material event without being one.
 *
 * These are checked before the category rules because they contain the same
 * keywords as the real thing: "Newspaper publication of financial results"
 * matches `results`, and "Intimation of Board Meeting to consider fund raising"
 * matches `fundraise` — but neither carries new information. A notice that a
 * result will be published is not a result. Left unguarded, these are a steady
 * source of false STRONG signals, which is the fastest way to make the report
 * feel like noise.
 */
const ROUTINE_OVERRIDES = [
  /newspaper (publication|advertisement|clipping)/i,
  /publication (of|in) .*(newspaper|advertisement)/i,
  /intimation of board meeting/i,
  // "Board Meeting Intimation for Consideration Of Un-Audited Financial Results"
  // — word order varies by filer, so match both arrangements. Seen live leaking
  // into the STRONG bucket as an earnings signal when it is only a date notice.
  /board meeting intimation/i,
  /(intimation|notice).{0,40}(for|to) (consider|consideration)/i,
  /notice of board meeting/i,
  /prior intimation/i,
  /(schedule|date) of .*(board meeting|analyst|investor) call/i,
  /trading window/i,
  /compliance certificate/i,
  /(submission|filing) of .*(shareholding pattern|corporate governance report)/i,
  /investor (presentation|meet) (schedule|intimation)/i,
  /transcript of/i,
  /audio (recording|link)/i,
];

function isRoutineOverride(title, description, bodyText) {
  const combined = `${title || ''} ${description || ''} ${bodyText || ''}`;
  return ROUTINE_OVERRIDES.some((re) => re.test(combined));
}

// ── LEARNED RULES: the script's rules are not frozen ────────────────────────
//
// `announcement-taxonomy` (the skill) reads a document, reasons about it
// against the SOIC growth-catalyst framework, and compares its own verdict to
// this script's. When they disagree AND the reasoning verdict is right, the
// skill records the mismatch and — once a keyword has caused the SAME miss
// more than once — promotes it into the learned-rules file below. The script
// then picks it up on its next run, so a class of miss is fixed permanently
// rather than re-litigated by the model every morning.
//
// The file is re-read fresh on every call (like announcementNoiseFilter's
// keyword list) so a rule added mid-session takes effect immediately without a
// restart. Learned keywords are ADDITIVE ONLY — they extend a category's
// keyword list, never remove or reorder the built-in rules above, so a bad
// learned rule can widen a category but can never silently disable one.
// Removing a learned rule is a human edit of this one file.
//
// Shape (data/cache/announcement-taxonomy-rules.json):
//   {
//     "version": 1,
//     "categoryKeywords": { "capacity": ["retail footprint", ...], ... },
//     "materialityPatterns": ["\\bdebt[- ]free\\b", ...],
//     "provenance": [{ "keyword": "...", "category": "...", "addedAt": "...",
//                      "mismatchIds": ["..."], "rationale": "..." }]
//   }
let _learnedRulesCache = { mtimeMs: null, value: null };

function learnedRulesPath() {
  // eslint-disable-next-line global-require
  const db = require('./db');
  return db.cachePath('announcement-taxonomy-rules.json');
}

function loadLearnedRules() {
  const empty = { categoryKeywords: {}, materialityPatterns: [], provenance: [] };
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    const p = learnedRulesPath();
    const stat = fs.statSync(p);
    if (_learnedRulesCache.mtimeMs === stat.mtimeMs && _learnedRulesCache.value) {
      return _learnedRulesCache.value;
    }
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    const value = {
      categoryKeywords: parsed.categoryKeywords || {},
      materialityPatterns: parsed.materialityPatterns || [],
      provenance: parsed.provenance || [],
    };
    _learnedRulesCache = { mtimeMs: stat.mtimeMs, value };
    return value;
  } catch (_) {
    // Missing/corrupt learned-rules file must never take down a scan — the
    // built-in rules alone are always a valid (if less complete) taxonomy.
    return empty;
  }
}

/** Built-in keywords for a category, plus anything the skill has learned. */
function keywordsFor(category, builtIn) {
  const learned = loadLearnedRules().categoryKeywords[category] || [];
  return learned.length ? [...builtIn, ...learned.map((k) => String(k).toLowerCase())] : builtIn;
}

function categoriseAnnouncement(title, description, bodyText) {
  const combined = `${title || ''} ${description || ''} ${bodyText || ''}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    const all = keywordsFor(category, keywords);
    if (!all.length) return category;
    if (all.some((kw) => combined.includes(kw))) return category;
  }
  return 'general';
}

/**
 * STRONG | SUPPORTING | ROUTINE for a single announcement.
 *
 * Note this replaces the old boolean `has_material_ann`. A boolean forced two
 * genuinely different things — "they won a ₹500 Cr order" and "they filed a
 * credit-rating reaffirmation" — into the same bucket, which is why the old email
 * kept surfacing paperwork as a FUNDAMENTAL driver.
 *
 * `bodyText`, when supplied, is matched INCLUDING the real document text, not
 * just the title/description — see `annotateFromContent` below for why this
 * distinction is load-bearing and must never be skipped.
 */
function announcementStrength(ann, bodyText) {
  if (isRoutineOverride(ann.subject, ann.description, bodyText)) return 'ROUTINE';
  const category =
    ann.category_derived || categoriseAnnouncement(ann.subject, ann.description, bodyText);
  if (STRONG_CATEGORIES.has(category)) return 'STRONG';
  if (SUPPORTING_CATEGORIES.has(category)) return 'SUPPORTING';
  return 'ROUTINE';
}

/**
 * Annotate an announcement in place with `category_derived`, `strength`, `label`
 * — from the TITLE AND DESCRIPTION ONLY, before anyone has opened the PDF.
 *
 * ── THIS IS A PROVISIONAL LABEL, NEVER A FINAL VERDICT ──────────────────────
 * A title/description-only strength is exactly the mechanism that caused
 * gainers-signal to miss PC Jeweller's debt-clearance news ("Update On
 * Clearance Of Outstanding Debt" reads as boilerplate), Jindal Worldwide's
 * showroom-rollout press release ("Press Release / Media Release" carries no
 * category signal at all), and SML Mahindra's +40% YoY monthly volume update
 * (title alone can't show the number) — all confirmed live on 2026-09-04 by
 * actually opening the PDFs the title-only gate had bucketed ROUTINE.
 *
 * Every caller MUST treat `.strength` set by THIS function as provisional:
 * fine for a pre-read sort order (e.g. "fetch STRONG-titled PDFs first" when
 * bandwidth is genuinely bounded), never sufficient grounds to (a) exclude an
 * announcement from being read, or (b) report a final STRONG/SUPPORTING/
 * ROUTINE verdict to a reader. The only function allowed to set a FINAL
 * verdict is `annotateFromContent` below, which requires the real document
 * text and stamps `strengthSource: 'content'` so a consumer can tell the two
 * apart. If you are about to skip reading an announcement based on what
 * `annotate()` returned, stop — that is the bug this comment exists to
 * prevent from recurring.
 */
function annotate(ann) {
  const category = categoriseAnnouncement(ann.subject, ann.description);
  ann.category_derived = category;
  ann.strength = announcementStrength(ann);
  ann.category_label = CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
  ann.strengthSource = 'title'; // provisional — see doc comment above
  return ann;
}

// ── Content-based materiality boosters ──────────────────────────────────────
// Regex tells that a document's ACTUAL TEXT carries a quantified, plausibly
// material claim even when its category fell to 'general' (no keyword match)
// or its category is merely SUPPORTING. This is what lets a real read upgrade
// a title that looked like paperwork — the entire point of this file's
// content-based path. Deliberately permissive (false positives here just mean
// an extra announcement gets a closer look downstream, which is cheap; a
// missed one is what actually damages the report).
const MATERIALITY_PATTERNS = [
  // Amounts stated in crore/lakh units.
  /(?:rs\.?|inr|₹)\s?[\d,]+(?:\.\d+)?\s*(?:crore|cr\.?|lakh)/i,
  // Large absolute rupee figures (≥7 digits ≈ ₹10 lakh+) even without a
  // crore/lakh suffix — e.g. "Rs. 13,19,40,000", which is how many filings
  // state a strategic-investment or preferential-issue amount.
  /(?:rs\.?|inr|₹)\s?[\d]{1,3}(?:,\d{2,3}){2,}(?:\.\d+)?/i,
  /\b\d{1,3}(?:\.\d+)?\s?%\s*(?:yoy|y-o-y|growth|increase|decline|jump|surge)/i,
  /debt[- ]free/i,
  /repaid (?:all|the) (?:outstanding )?debt/i,
];

function hasContentMaterialitySignal(text) {
  if (!text) return false;
  if (MATERIALITY_PATTERNS.some((re) => re.test(text))) return true;
  // Learned patterns (see loadLearnedRules) — stored as regex source strings.
  return loadLearnedRules().materialityPatterns.some((src) => {
    try {
      return new RegExp(src, 'i').test(text);
    } catch (_) {
      return false; // a malformed learned pattern is ignored, never fatal
    }
  });
}

/**
 * Final, content-verified classification. Call this once the announcement's
 * real text is in hand (a live PDF read, a cached `pdf-text` entry, or a
 * served Filing Extract) — never before.
 *
 * Promotion rules, both driven by the REAL TEXT, never the title:
 *  1. A category that content-matches STRONG_CATEGORIES / SUPPORTING_CATEGORIES
 *     against the full text wins outright (this alone fixes titles like "Press
 *     Release / Media Release" once the body says "Expand Retail Footprint to
 *     100 Showrooms").
 *  2. ANY announcement — regardless of category, including 'general' — that
 *     carries a `MATERIALITY_PATTERNS` hit in its real text is floored at
 *     SUPPORTING rather than left ROUTINE: a rupee-crore figure or a
 *     quantified growth number in the body is itself worth a closer look,
 *     even before anyone has decided which named category it belongs to.
 *  3. A SCHEDULED category (monthly_update, results, dividend — filed on a
 *     calendar cadence, so a filing existing is not itself news) that ALSO
 *     carries a materiality hit is promoted all the way to STRONG, not just
 *     SUPPORTING: "sales figures for the month" is scheduled and unremarkable
 *     by default, but "+40% YoY" inside it is exactly the surprise the
 *     schedule alone can't tell you (see SCHEDULED_CATEGORIES' doc comment —
 *     the same logic that keeps quiet results filings out of ACT tier is what
 *     makes a genuinely loud one worth promoting once actually read).
 *
 * @param {{subject: string, description: string}} ann
 * @param {string} bodyText the actual extracted document text
 * @returns {{category: string, strength: string, label: string}}
 */
function classifyFromContent(ann, bodyText) {
  const category = categoriseAnnouncement(ann.subject, ann.description, bodyText);
  let strength = announcementStrength({ ...ann, category_derived: category }, bodyText);
  const materialContent = hasContentMaterialitySignal(bodyText);
  if (strength === 'ROUTINE' && materialContent) {
    strength = 'SUPPORTING';
  } else if (strength === 'SUPPORTING' && isScheduled(category) && materialContent) {
    strength = 'STRONG';
  }
  return {
    category,
    strength,
    label: CATEGORY_LABELS[category] || CATEGORY_LABELS.general,
    // Second axis — see VERY_HIGH_SIGNIFICANCE_CATEGORIES. A VERY_HIGH here is
    // a PRIOR that this filing sits on the EPS-accretion/J-curve path, not a
    // finding that it does; `reasoningCheck` names what the script could not
    // resolve and the announcement-taxonomy skill must.
    significance: significanceOf(category),
    reasoningCheck: REQUIRES_REASONING_CHECK[category] || null,
  };
}

/**
 * Overwrite an already-`annotate()`d announcement with the content-verified
 * verdict. This is the ONLY function that may set a FINAL strength — every
 * consuming skill (gainers-signal, volume-rocketing, watchlist-insights,
 * post-close-scan-insights) must call this (or confirm it already ran) before
 * reporting a STRONG/SUPPORTING/ROUTINE label to a reader, filtering an
 * announcement out of scoring, or deciding not to read one further.
 *
 * If `bodyText` could not be obtained (fetch failure, OCR failure on a
 * scanned PDF, etc.), this does NOT silently keep the title-only verdict as
 * if it were final — it sets `strengthSource: 'content_unavailable'` so a
 * reader can see the announcement was never actually verified, rather than
 * mistaking a title guess for a real read.
 *
 * @param {object} ann mutated in place
 * @param {string|null} bodyText
 */
function annotateFromContent(ann, bodyText) {
  if (!bodyText) {
    ann.strengthSource = 'content_unavailable';
    return ann;
  }
  const { category, strength, label, significance, reasoningCheck } = classifyFromContent(
    ann,
    bodyText
  );
  ann.category_derived = category;
  ann.strength = strength;
  ann.category_label = label;
  ann.significance = significance;
  ann.reasoningCheck = reasoningCheck;
  ann.strengthSource = 'content';
  return ann;
}

/** The strongest strength present in a list — STRONG > SUPPORTING > ROUTINE > null. */
function strongestOf(anns = []) {
  let best = null;
  for (const a of anns) {
    const s = a.strength || announcementStrength(a);
    if (s === 'STRONG') return 'STRONG';
    if (s === 'SUPPORTING') best = 'SUPPORTING';
    else if (!best) best = 'ROUTINE';
  }
  return best;
}

module.exports = {
  CATEGORY_RULES,
  CATEGORY_LABELS,
  ROUTINE_OVERRIDES,
  isRoutineOverride,
  STRONG_CATEGORIES,
  SUPPORTING_CATEGORIES,
  SCHEDULED_CATEGORIES,
  HIGH_CONVICTION_CATEGORIES,
  HEAVY_DOCUMENT_CATEGORIES,
  HEAVY_DOCUMENT_SKIP_REASONS,
  isScheduled,
  isHighConviction: (category) => HIGH_CONVICTION_CATEGORIES.has(category),
  isHeavyDocumentCategory,
  heavyDocumentSkipReason,
  categoriseAnnouncement,
  announcementStrength,
  annotate,
  classifyFromContent,
  annotateFromContent,
  hasContentMaterialitySignal,
  MATERIALITY_PATTERNS,
  strongestOf,
  // Significance axis (EPS accretion / J-curve / anticipation)
  VERY_HIGH_SIGNIFICANCE_CATEGORIES,
  HIGH_SIGNIFICANCE_CATEGORIES,
  REQUIRES_REASONING_CHECK,
  significanceOf,
  // Learned-rules layer, maintained by the announcement-taxonomy skill
  loadLearnedRules,
  learnedRulesPath,
};
