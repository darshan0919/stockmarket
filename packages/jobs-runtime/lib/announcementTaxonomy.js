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
]);

const SUPPORTING_CATEGORIES = new Set(['credit_rating', 'regulatory', 'buyback', 'investor_meet']);

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
const SCHEDULED_CATEGORIES = new Set(['results', 'dividend']);

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

function isRoutineOverride(title, description) {
  const combined = `${title || ''} ${description || ''}`;
  return ROUTINE_OVERRIDES.some((re) => re.test(combined));
}

function categoriseAnnouncement(title, description) {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (!keywords.length) return category;
    if (keywords.some((kw) => combined.includes(kw))) return category;
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
 */
function announcementStrength(ann) {
  if (isRoutineOverride(ann.subject, ann.description)) return 'ROUTINE';
  const category = ann.category_derived || categoriseAnnouncement(ann.subject, ann.description);
  if (STRONG_CATEGORIES.has(category)) return 'STRONG';
  if (SUPPORTING_CATEGORIES.has(category)) return 'SUPPORTING';
  return 'ROUTINE';
}

/** Annotate an announcement in place with `category_derived`, `strength`, `label`. */
function annotate(ann) {
  const category = categoriseAnnouncement(ann.subject, ann.description);
  ann.category_derived = category;
  ann.strength = announcementStrength(ann);
  ann.category_label = CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
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
  strongestOf,
};
