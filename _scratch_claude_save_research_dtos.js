const db = require('./packages/jobs-runtime/lib/db');

const MODEL = 'claude-sonnet-5';
const DATE = '2026-10-14';

const entries = [
  {
    companyId: 'NSE:TARIL',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Blowout Q2FY27: PAT +338% YoY to Rs75cr on EBITDA +205% and revenue +66%; order inflow +97% YoY lifted the unexecuted order book 32% YoY to Rs7,237cr (18-24mo visibility), Rs21,000cr inquiry pipeline.',
    trigger: 'Blowout Q2FY27 results + record order book',
    trigger_quantified:
      'PAT +338% YoY to Rs75cr; EBITDA +205% to Rs114cr; order book Rs7,237cr (+32% YoY)',
    linkage: 'explained',
    why: {
      text: 'Q2FY27 PAT up 338% YoY (Rs75cr) on EBITDA +205% (Rs114cr, margin 16.1%) and revenue +66% (Rs709cr); order inflow +97% YoY to Rs1,169cr lifted the unexecuted order book 32% YoY to Rs7,237cr (18-24mo executable), against a Rs21,000cr inquiry pipeline.',
      basis: 'filing',
      sources: ['BSE/NSE filing 13-Oct-2026 - Q2FY27 results + press release'],
    },
    contextUsed: [
      'announcement:TARIL:2026-10-13:results',
      'announcement:TARIL:2026-10-13:order_book',
    ],
  },
  {
    companyId: 'NSE:IDBI',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Cabinet Committee on Economic Affairs approved the long-pending strategic sale of 60.72% GoI+LIC stake in IDBI Bank to Fairfax Financial Holdings on 14-Oct-2026 - the privatization process (open since 2022) actually consummated.',
    trigger: 'Cabinet approval of IDBI privatization - Fairfax named strategic buyer',
    trigger_quantified:
      '60.72% stake sale (GoI 30.48% + LIC 30.24%) to Fairfax Financial Holdings via 10955230 Canada Inc.',
    linkage: 'explained',
    why: {
      text: 'Ministry of Finance press release (via BSE/NSE filing) confirms CCEA approved Fairfax Financial Holdings as the Strategic Buyer for 60.72% of IDBI Bank - the formal conclusion of a 4-year disinvestment process.',
      basis: 'filing',
      sources: ['PIB/Ministry of Finance press release via BSE/NSE filing 14-Oct-2026'],
    },
    contextUsed: ['announcement:IDBI:2026-10-14:fundraise'],
  },
  {
    companyId: 'NSE:SSRETAIL',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Record Q1FY27 results (revenue +59% YoY, EBITDA +51%, PAT +61%, SSS +34%) released 13-Oct, reinforced by a chairman media interview on 14-Oct. Flag: Q1FY27 = Apr-Jun 2026 quarter disclosed with an unusually long lag - plausibly this recently-listed companys first result cycle as a public entity.',
    trigger: 'Record Q1FY27 results + chairman media interview',
    trigger_quantified:
      'Revenue +59% YoY to Rs790cr; EBITDA +51%; PAT +61%; 33 new stores (536 total), SSS +34%',
    linkage: 'explained',
    why: {
      text: 'Media release "SS Retail Posts Record Q1 FY27" (revenue +59% YoY, EBITDA +51%, PAT +61%, same-store sales +34%) dated 13-Oct, with the Chairman giving a media interview on it on 14-Oct (the move day).',
      basis: 'filing',
      sources: ['BSE/NSE media release 13-Oct-2026', 'media interview intimation 14-Oct-2026'],
    },
    contextUsed: [
      'announcement:SSRETAIL:2026-10-13:results',
      'announcement:SSRETAIL:2026-10-14:general',
    ],
  },
  {
    companyId: 'NSE:MVELECTRO',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'SAST disclosure: Kotak Mahindra Mutual Fund crossed the 5% threshold (4.67% -> 5.04%) via open-market purchases. A real but modest (0.37pp) incremental buy - does not fully explain a 17% single-day, Rs99cr-delivery move.',
    trigger: 'Kotak MF crosses 5% ownership threshold',
    trigger_quantified: 'Stake 4.6708% -> 5.0373% (+0.37pp, 100,000 shares via open market)',
    linkage: 'mismatched',
    why: {
      text: 'A Reg.29(1) SAST filing shows Kotak Mahindra MF crossing 5% ownership via a modest 100,000-share open-market purchase. That is real accumulation evidence but a thin explanation for a +17.2% day on Rs99cr of delivery (3.7% of market cap) - the filing under-explains the size of the move.',
      basis: 'filing',
      sources: ['SAST Reg.29(1) disclosure 13-Oct-2026'],
    },
    contextUsed: ['announcement:MVELECTRO:2026-10-13:fundraise'],
  },
  {
    companyId: 'NSE:ELECON',
    tier: 'ACT',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Q2FY27 results: consolidated revenue +8.5% YoY (Rs639cr), EBITDA +11.1% (Rs156cr, margin 23.9%), Gear order book +37% YoY to Rs1,056cr; interim dividend Re0.50/share declared. Standalone EPS actually dipped YoY (Rs3.33 vs Rs3.52) - decent, not a blowout. Third consecutive day on the gainers list (streak 3).',
    trigger: 'Q2FY27 results + interim dividend + Gear order book growth',
    trigger_quantified:
      'Revenue +8.5% YoY to Rs639cr; Gear order book +37% YoY to Rs1,056cr; interim dividend Re0.50/share',
    linkage: 'explained',
    why: {
      text: 'Q2FY27 consolidated revenue +8.5% YoY, EBITDA +11.1% (margin 23.9%, +140bps), Gear division order book +37% YoY to Rs1,056cr; Board also declared an interim dividend of Re0.50/share. Standalone EPS fell YoY (Rs3.33 vs Rs3.52), so the quarter is genuinely mixed rather than a clean beat.',
      basis: 'filing',
      sources: ['BSE/NSE filing 14-Oct-2026 - Q2FY27 results + press release'],
    },
    contextUsed: [
      'announcement:ELECON:2026-10-14:results',
      'announcement:ELECON:2026-10-14:order_book',
    ],
  },
  {
    companyId: 'BSE:MRTX',
    tier: 'ACT',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Merritronix (BSE SME, listed Jun-2026): H1FY27 business update shows revenue +90.15% YoY to Rs106.37cr, order book Rs101.64cr, with BEL/HAL/CERN approvals - still deploying IPO capex.',
    trigger: 'H1FY27 business update - revenue +90% YoY',
    trigger_quantified:
      'Revenue +90.15% YoY to Rs106.37cr; order book Rs101.64cr; capacity utilisation 65%',
    linkage: 'explained',
    why: {
      text: 'H1FY27 Business Update discloses revenue of Rs106.37cr (+90.15% YoY) and an order book of Rs101.64cr, with key approvals from BEL, HAL and CERN (via TIFR) - a small, recently-IPOd defence-electronics name still ramping capacity.',
      basis: 'filing',
      sources: ['BSE filing 13-Oct-2026 - H1FY27 Business Update'],
    },
    contextUsed: ['announcement:MRTX:2026-10-13:order_book'],
  },
  {
    companyId: 'NSE:EIMCOELECO',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Q2FY27 results: revenue +70.9% YoY to Rs57cr, EBITDA +108.8% to Rs11cr (margin 18.8%), PAT +46.5% to Rs8cr, open order pipeline Rs133cr. Also disclosed CFO resignation effective 30-Oct (succession item, not flagged as a red flag on its own).',
    trigger: 'Strong Q2FY27 results',
    trigger_quantified:
      'Revenue +70.9% YoY to Rs57cr; EBITDA +108.8% to Rs11cr; PAT +46.5% to Rs8cr; order pipeline Rs133cr',
    linkage: 'explained',
    why: {
      text: 'Q2 & H1FY27 press release shows revenue +70.9% YoY, EBITDA +108.8% YoY (margin 18.8%), PAT +46.5% YoY, with a Rs133cr open order pipeline cited by the Executive Director. Same filing also discloses the CFOs resignation effective 30-Oct-2026.',
      basis: 'filing',
      sources: ['BSE/NSE filing 13-Oct-2026 - Q2&H1FY27 results + press release'],
    },
    contextUsed: [
      'announcement:EIMCOELECO:2026-10-13:results',
      'announcement:EIMCOELECO:2026-10-13:order_book',
    ],
  },
  {
    companyId: 'NSE:SEJALLTD',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Board approved Q2FY27 results 13-Oct; the filed PDF is a scanned limited-review report whose P&L table did not OCR into legible figures. Largest % mover in todays universe (+20%) on a filing whose quantum cannot be confirmed.',
    trigger: 'Q2FY27 results approved (figures not confirmable from filing text)',
    trigger_quantified: null,
    linkage: 'mismatched',
    why: {
      text: 'The board approved unaudited Q2FY27 results and a clean limited-review report was filed, but the filed PDFs financial-results pages are a scanned image that did not OCR into a legible P&L - the scanners content read could not confirm the quantum behind a 20% single-day move.',
      basis: 'filing',
      sources: [
        'BSE/NSE filing 13-Oct-2026 - board outcome + limited review report (figures not machine-readable)',
      ],
    },
    contextUsed: ['announcement:SEJALLTD:2026-10-13:results'],
  },
  {
    companyId: 'NSE:RAIN',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'No announcement in the 14-day window; no Stockscans growth-catalyst cache on file; not concall-flagged. Genuinely no discoverable trigger for a Rs129cr delivery-backed move.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache for this name. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:WSTCSTPAPR',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'No announcement in the 14-day window; no Stockscans cache; not concall-flagged. Genuinely no discoverable trigger for a Rs82cr delivery-backed move.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache for this name. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'BSE:INDOSMC',
    tier: 'WATCH',
    research_axis: 'DELIVERY_PCT',
    summary: 'No announcement in the 14-day window; no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache for this name. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:VEDPOWER',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Only a SUPPORTING-strength investor-meet intimation in the 14-day window (no STRONG filing); no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): only a SUPPORTING investor-meet intimation, not a STRONG filing. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:VOGL',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'Only a SUPPORTING-strength investor-meet intimation in the 14-day window (no STRONG filing); no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): only a SUPPORTING investor-meet intimation, not a STRONG filing. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:KROSS',
    tier: 'WATCH',
    research_axis: 'DELIVERY_VALUE',
    summary:
      'A SUPPORTING investor-meet intimation and an unread shareholding_change filing exist in the window; neither was read this run (deferred for time) so this is reported as undetermined rather than "none".',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Only SUPPORTING-strength filings (investor_meet, shareholding_change) in the 14-day window - the shareholding_change filing was deferred (not read) this run; no Stockscans cache; not concall-flagged. Reported as no confirmed trigger, with the shareholding_change filing flagged for a follow-up read.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:DCMSHRIRAM',
    tier: 'NOTED',
    research_axis: 'DELIVERY_VALUE',
    summary: 'No announcement in the 14-day window; no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:ZOTA',
    tier: 'NOTED',
    research_axis: 'DELIVERY_PCT',
    summary: 'No announcement in the 14-day window; no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:JGCHEM',
    tier: 'NOTED',
    research_axis: 'DELIVERY_PCT',
    summary:
      'Only a SUPPORTING investor-meet filing this window. A cached rerating-catalysts brief (2026-10-06) tags the thesis WEAK and explicitly says its evidence (a 57-day-old concall) is not fresh enough to serve as todays trigger.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Cached rerating-catalysts brief (asOf 2026-10-06, WEAK) exists but its own text says the underlying concall is too stale to explain a fresh move; no new filing this window. No discoverable trigger for today.',
    },
    contextUsed: ['cache:rerating-catalysts:NSE:JGCHEM:2026-10-06'],
  },
  {
    companyId: 'NSE:KOPRAN',
    tier: 'NOTED',
    research_axis: 'DELIVERY_PCT',
    summary: 'No announcement in the 14-day window; no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:HMAAGRO',
    tier: 'NOTED',
    research_axis: 'DELIVERY_PCT',
    summary: 'No announcement in the 14-day window; no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): none. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
  {
    companyId: 'NSE:SAKAR',
    tier: 'NOTED',
    research_axis: 'DELIVERY_PCT',
    summary: 'Only a ROUTINE general filing this window; no Stockscans cache; not concall-flagged.',
    trigger: null,
    trigger_quantified: null,
    linkage: 'unexplained',
    why: {
      basis: 'none',
      text: 'Checked filings (14d): only ROUTINE strength; not material. Re-rating catalysts: no Stockscans cache. Concall: not flagged. No discoverable trigger.',
    },
    contextUsed: [],
  },
];

let saved = 0;
for (const e of entries) {
  const id =
    'rpt_gainers-signal_gainers-trigger-research_' + e.companyId.replace(/[:]/g, '_') + '_' + DATE;
  db.saveReport({
    id: id,
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: DATE,
    companyId: e.companyId,
    modelUsed: MODEL,
    summary: e.summary,
    research_axis: e.research_axis,
    tier: e.tier,
    trigger: e.trigger,
    trigger_quantified: e.trigger_quantified,
    linkage: e.linkage,
    why: e.why,
    contextUsed: e.contextUsed || [],
    concallCorroboration: null,
  });
  saved++;
}
console.log('saved', saved, 'research DTOs');
