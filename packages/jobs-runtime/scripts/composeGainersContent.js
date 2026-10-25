'use strict';

const fs = require('fs');
const db = require('../lib/db');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

const marketDate = '2026-10-23';

// 1. Resolve Drive URLs for Top 3
const eternalDriveUrl = db.resolveDriveUrl('rerating-catalysts/ETERNAL_Output.pdf');
const cyientDriveUrl = db.resolveDriveUrl('rerating-catalysts/CYIENT_Output.pdf');
const igilDriveUrl = db.resolveDriveUrl('rerating-catalysts/IGIL_Output.pdf');

console.log('Resolved Drive URLs:');
console.log('ETERNAL:', eternalDriveUrl);
console.log('CYIENT:', cyientDriveUrl);
console.log('IGIL:', igilDriveUrl);

// 2. Fetch cached briefs for top 10
const getBrief = (id) => {
  const b = briefCache.getBrief(id);
  if (!b) return null;
  const record = { ...b.record };
  if (id === 'NSE:ETERNAL' && eternalDriveUrl) record.reportDriveUrl = eternalDriveUrl;
  if (id === 'NSE:CYIENT' && cyientDriveUrl) record.reportDriveUrl = cyientDriveUrl;
  if (id === 'NSE:IGIL' && igilDriveUrl) record.reportDriveUrl = igilDriveUrl;
  return record;
};

// 3. Construct Content Overlay
const content = {
  lead: "Q2 earnings inflections, record profitability prints, and strategic corporate restructuring dominate today's actionability: **Eternal Limited** (+4.25%, ₹722.6 Cr deliv) saw massive institutional buying following Q2 results with Blinkit 1P margin capture, approval of Going-out business transfer to subsidiary ZEPL, a ₹156 Cr stake in merged Mygate/Adonmo, and the launch of dark.ai. **Cyient** (+7.81%, ₹257.4 Cr deliv) rallied as Q2 DET EBIT margin surged to a 10-quarter high of 14.2% with ₹214 Cr free cash flow (139% conversion) and record $158.4M order intake, while **Steel Strips Wheels** (+19.99% upper circuit, ₹137.6 Cr deliv) nearly tripled Q2 PAT (+196.9% YoY to ₹114.4 Cr on ₹1,930 Cr revenue) alongside approval of a Greenfield Alloy/Steel Wheels plant in Chhatrapati Sambhajinagar.",
  caveats: [],
  cards: {
    // -------------------------------------------------------------
    // ACT CARDS (Full detail)
    // -------------------------------------------------------------
    'NSE:ETERNAL': {
      tier: 'ACT',
      headline:
        'Quick Commerce 1P scaling, slump sale transfer of Going-out to ZEPL, and ₹156 Cr Mygate stake',
      thesisChain: [
        'Blinkit 1P inventory model transition captures full merchandise value and higher retail margins across mature dark store clusters',
        'Corporate restructuring consolidates Going-out operations into wholly owned subsidiary ZEPL to unlock operational synergies and focused monetization',
        'Strategic investment transfers Adonmo into Mygate for ~4.4% stake valued at ₹156 Cr, complemented by global roadmap for dark.ai enterprise AI sandbox',
      ],
      why: {
        text: 'Q2 FY27 results & restructuring: Slump sale of Going-out business to wholly owned subsidiary ZEPL to drive synergies, acquisition of ₹156 Cr stake in merged Mygate/Adonmo, and unveiling of dark.ai platform.',
        basis: 'filing',
        sources: ['BSE/NSE Disclosures 21-Oct-2026', 'Shareholders Letter Q2FY27'],
      },
      epsThesis: getBrief('NSE:ETERNAL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+35-40% GOV growth',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'restructuring', 'quick_commerce', 'mna'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/88q4p8vw26axrngxf5ukx6xk.pdf',
    },
    'NSE:CYIENT': {
      tier: 'ACT',
      headline:
        'DET EBIT margin hits 10-quarter peak of 14.2% (+16.8% QoQ) with record $158.4M order intake and ₹214 Cr FCF',
      thesisChain: [
        'DET EBIT expanded 16.8% QoQ to ₹237 Cr (14.2% margin, +110 bps) with 139% FCF to PAT conversion (₹214 Cr generated)',
        'Record quarterly order intake of $158.4M (+20.8% YoY) and Cyient DLM book-to-bill above 1.6x secure double-digit organic growth visibility',
        'Cyient Semiconductors logged 6th straight growth quarter (+8% QoQ) with ASIC pipeline surpassing $100M alongside ₹12/share interim dividend',
      ],
      why: {
        text: 'Q2 FY27 results beat: DET EBIT margin reached a 10-quarter high of 14.2% (EBIT +16.8% QoQ to ₹237 Cr), record DET order intake of $158.4M (+20.8% YoY), and ₹214 Cr FCF.',
        basis: 'filing',
        sources: ['Press Release & Q2 Results 22-Oct-2026'],
      },
      epsThesis: getBrief('NSE:CYIENT'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+16.8% QoQ EBIT / 14.2% margin',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'margin_expansion', 'order_book', 'semiconductors'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/c2n5001rxh6679xt0h875yjm.pdf',
    },
    'NSE:SSWL': {
      tier: 'ACT',
      headline:
        'Q2 standalone PAT surged +196.9% YoY to ₹114.4 Cr on ₹1,930 Cr revenue; Greenfield Sambhajinagar plant approved',
      thesisChain: [
        'Standalone Q2 PAT nearly tripled (+196.9% YoY) to ₹114.38 Cr as Revenue jumped 60.7% YoY to ₹1,929.92 Cr (EPS ₹7.27 vs ₹2.45)',
        'Board approved setting up a state-of-the-art Greenfield facility at Chhatrapati Sambhajinagar, Maharashtra for Alloy Wheels, Steel Wheels, and Passenger Vehicle Hot-Stamping',
        'Declared ₹1.50 per share interim dividend with stock locking in 20% upper circuit on heavy ₹137.55 Cr delivery backing',
      ],
      why: {
        text: 'Q2 FY27 standalone PAT nearly tripled (+196.9% YoY to ₹114.38 Cr on ₹1,929.92 Cr revenue) alongside Greenfield Chhatrapati Sambhajinagar Alloy/Steel Wheels plant approval and ₹1.50 interim dividend.',
        basis: 'filing',
        sources: ['BSE/NSE Q2 Results & Outcome 23-Oct-2026'],
      },
      epsThesis: getBrief('NSE:SSWL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+196.9% PAT / EPS ₹7.27',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'capacity_expansion', 'auto_ancillaries', 'dividend'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/m6ixw4ckvymdgbxutuw8d93i.pdf',
    },
    'NSE:GRWRHITECH': {
      tier: 'ACT',
      headline:
        'Record Q2 revenue hits ₹696 Cr (+22% YoY); FY27 EBITDA margin guidance raised +200 bps to 27% (±2%)',
      thesisChain: [
        'Revenue from operations reached an all-time high of ₹696 Cr (+22% YoY, +10% QoQ) with peak quarterly EBITDA margin of 27.2% (+377 bps YoY)',
        'H1 EBITDA margin reached 28.7%, prompting management to raise full-year FY27 EBITDA margin guidance by 200 bps to 27% (±2%) while reaffirming ₹2,500+ Cr revenue',
        'Strong consumer demand and pricing realization across premium Solar Control and Paint Protection Films (PPF) offset Middle East headwinds',
      ],
      why: {
        text: 'Record Q2 FY27 results: Revenue hit all-time high of ₹696 Cr (+22% YoY), EBITDA surged 42% YoY (27.2% margin), and management raised FY27 EBITDA margin guidance by 200 bps to 27% (±2%).',
        basis: 'filing',
        sources: ['Media Release & Q2 Results 22-Oct-2026'],
      },
      epsThesis: getBrief('NSE:GRWRHITECH'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+200 bps FY27 EBITDA margin guidance',
        timeline: 'FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'guidance_upgrade', 'margin_expansion', 'specialty_films'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/98u49vtszjmoil0arp0qpoxz.pdf',
    },
    'NSE:ANTELOPUS': {
      tier: 'ACT',
      headline:
        'Pre-results institutional accumulation (+13%) ahead of 26-Oct Q2 board meeting & concall',
      thesisChain: [
        'Board meeting intimation filed for 26-Oct-2026 (in 3 days) to approve Q2 FY27 financial results and hold analyst earnings call',
        'Heavy institutional delivery of ₹32.58 Cr (+13.00% price surge) confirms aggressive positioning ahead of upstream production and revenue prints',
        'High-conviction pre-PEAD candidate in oil & gas exploration with operational momentum across producing assets',
      ],
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled on 26-Oct-2026 (in 3 days) to approve Q2 FY27 financial results and hold earnings call.',
        basis: 'pre_result',
        sources: ['BSE Board Meeting Intimation 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:ANTELOPUS'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Pre-results accumulation',
        timeline: 'Q2 FY27 print (26-Oct)',
        confidence: 'high',
      },
      linkage: 'explained',
      pead_candidate: true,
      tags: ['pre_result', 'pead_candidate', 'oil_gas'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/ug07327fl6y3bz33qtlddjbg.pdf',
    },
    'BSE:VANS': {
      tier: 'ACT',
      headline:
        'Won ₹4.445 Cr vacuum circuit breaker order from Agrawal Power, representing ~19% of market cap',
      thesisChain: [
        'Secured ₹4.445 Cr commercial contract from Agrawal Power for testing and supply of 33kV & 11kV double pole vacuum circuit breakers and interrupters',
        'Six-month execution window provides sharp revenue visibility into H2 FY27 on a small-cap base',
        'High delivery percentage of 44.23% (₹14.63 Cr delivered) drove stock to 10% upper circuit',
      ],
      why: {
        text: '19-Oct order win of ₹4.445 Cr from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months (~19% of market cap base).',
        basis: 'filing',
        sources: ['BSE Filing 19-Oct-2026'],
      },
      epsThesis: getBrief('NSE:544971'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+19% of market cap in new orders',
        timeline: 'H2 FY27 (6 months)',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['order_book', 'switchgear', 't_and_d'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/smtcmjna8o6xftxhietxgo7m.pdf',
    },
    'BSE:SGMART': {
      tier: 'ACT',
      headline:
        'Heavy delivery accumulation (88.38% deliv, ₹9.05 Cr) in B2B steel & building materials supply network',
      thesisChain: [
        'Extremely high delivery percentage of 88.38% (₹9.05 Cr delivered) reflects institutional buying in B2B building materials aggregator',
        'No regulatory announcements in 14-day window; accumulation driven by ongoing distribution network expansion and volume throughput',
        'Move remains unbacked by direct company disclosures and is classified as unexplained accumulation',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; high delivery % accumulation (88.4%) across B2B construction/steel distribution player.',
        basis: 'none',
        sources: ['BSE Disclosures 14d'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'neutral',
        magnitude: 'Unexplained accumulation',
        timeline: 'Ongoing',
        confidence: 'medium',
      },
      linkage: 'unexplained',
      tags: ['high_delivery', 'b2b_distribution'],
      pdfUrl: null,
    },
    'NSE:SASKEN': {
      tier: 'ACT',
      headline:
        'Pre-results accumulation (40.99% deliv) ahead of 28-Oct board meeting for Q2 results & dividend',
      thesisChain: [
        'Board meeting intimation issued for 28-Oct-2026 (in 5 days) to approve Q2 FY27 financial results and declare interim dividend',
        'High delivery % of 40.99% (₹6.45 Cr delivered) confirms accumulation in semiconductor and connected device product engineering services',
        'Positioned as an earnings anticipation candidate for upcoming dividend declaration',
      ],
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled on 28-Oct-2026 (in 5 days) to approve Q2 FY27 results and consider interim dividend.',
        basis: 'pre_result',
        sources: ['NSE Board Meeting Intimation 21-Oct-2026'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'positive',
        magnitude: 'Pre-results positioning',
        timeline: '28-Oct-2026',
        confidence: 'medium',
      },
      linkage: 'explained',
      pead_candidate: true,
      tags: ['pre_result', 'pead_candidate', 'it_services', 'dividend'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/15jiy1fy4lfsrag545tsstzu.pdf',
    },

    // -------------------------------------------------------------
    // WATCH CARDS (Compact layout)
    // -------------------------------------------------------------
    'NSE:IGIL': {
      tier: 'WATCH',
      headline:
        'Persistent institutional follow-through (+7.9%, ₹156.6 Cr deliv) on blowout Q2 results (+43% PAT, 61.4% EBITDA mgn)',
      why: {
        text: 'Follow-through accumulation post Q2 FY27 results beat: Consolidated Revenue +31% YoY to ₹398 Cr, EBITDA margin expanded to 61.4%, and PAT grew +43% YoY to ₹185.8 Cr on 4.35M reports.',
        basis: 'filing',
        sources: ['Q2 Results & Press Release 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:IGIL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+43% PAT / 61.4% margin',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'margin_expansion', 'certification'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/q5u7smeu1nmp7n7tu5hsb3xh.pdf',
    },
    'NSE:WESTLIFE': {
      tier: 'WATCH',
      headline:
        'Q2 results inflection: Revenue up 16% YoY to ₹747 Cr (13-quarter high) with double-digit SSSG of 10.1% and Operating EBITDA +29%',
      why: {
        text: 'Q2 FY27 results inflection: Revenue up 16% YoY to ₹747 Cr (13-quarter high), SSSG accelerating to double-digit +10.1%, and Operating EBITDA growing 29% YoY to ₹98.1 Cr.',
        basis: 'filing',
        sources: ['Press Release & Q2 Results 23-Oct-2026'],
      },
      epsThesis: getBrief('NSE:WESTLIFE'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+10.1% SSSG / +29% EBITDA',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'qsr', 'sssg_inflection'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/zzi29x0litltzfpgdw7j3sls.pdf',
    },
    'NSE:LCL': {
      tier: 'WATCH',
      headline:
        'Accumulating on concall fundamental strength (record ₹1,778 Cr order book and 19.9% EBITDA margin)',
      why: {
        text: 'No fresh filing in 14-day window; stock accumulating on Aug-2026 concall fundamental strength (record ₹1,778 Cr order book and EBITDA margin expansion to 19.9%).',
        basis: 'catalyst',
        sources: ['Concall Transcript Aug-2026'],
      },
      epsThesis: getBrief('NSE:LCL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '₹1,778 Cr order book backlog',
        timeline: 'FY27',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['order_book', 'textile_machinery'],
      pdfUrl: null,
    },
    'NSE:PASHUPATI': {
      tier: 'WATCH',
      headline:
        'High delivery percentage (41.89%, ₹11.82 Cr) in textile spinning; price-band clarification confirmed no material events',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; price-band clarification confirmed no undisclosed material events.',
        basis: 'none',
        sources: ['NSE Clarification 21-Oct-2026'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'neutral',
        magnitude: 'Unexplained accumulation',
        timeline: 'Ongoing',
        confidence: 'medium',
      },
      linkage: 'unexplained',
      tags: ['textiles', 'clarification'],
      pdfUrl: null,
    },
    'NSE:CAPILLARY': {
      tier: 'WATCH',
      headline:
        'Appointed William Swift as President - Americas Region to lead enterprise customer loyalty expansion',
      why: {
        text: '22-Oct appointment of William Swift as President – Americas Region (designated SMP) to spearhead enterprise expansion across North America.',
        basis: 'filing',
        sources: ['NSE/BSE Reg 30 Filing 22-Oct-2026'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'positive',
        magnitude: 'North America enterprise growth',
        timeline: 'FY27-FY28',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['management_change', 'saas', 'enterprise'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/y3raxa9q06732qq2pq8c9hcc.pdf',
    },

    // -------------------------------------------------------------
    // NOTED CARDS
    // -------------------------------------------------------------
    'NSE:JINDALPOLY': {
      tier: 'NOTED',
      headline: '+11.23% price move unbacked by delivery (2.71% deliv indicates speculative intraday churn)',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; +11.2% price move unsupported by delivery (2.71% delivery pct reflects speculative churn).',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'mismatched',
    },
    'NSE:AHCL': {
      tier: 'NOTED',
      headline: 'Small-cap API manufacturer gained +4.97% on ₹7.81 Cr delivery (47.86% deliv)',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; high delivery % accumulation in small-cap API manufacturer.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:KOLTEPATIL': {
      tier: 'NOTED',
      headline: 'Pune residential real estate developer gained +6.24% on ₹6.82 Cr delivery',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; trading on residential real estate sales velocity.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:NOVARTIND': {
      tier: 'NOTED',
      headline: 'MNC pharma subsidiary rose +8.31% on ₹6.13 Cr delivery with no filings',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; speculative price surge in MNC pharma subsidiary.',
        basis: 'none',
        sources: ['BSE/NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:EASEMYTRIP': {
      tier: 'NOTED',
      headline: 'Online travel agency rose +4.50% on ₹5.35 Cr delivery on festive travel sentiment',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; festive travel booking season volume interest.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:PRIZOR': {
      tier: 'NOTED',
      headline: 'CCTV camera manufacturer rose +9.95% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:KARNIKA': {
      tier: 'NOTED',
      headline: 'Readymade apparel manufacturer gained +5.73% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:SIMCA': {
      tier: 'NOTED',
      headline: 'Advertising media player gained +5.00% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:TANKUP': {
      tier: 'NOTED',
      headline: 'Engineering equipment player rose +5.00% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:RAVITA': {
      tier: 'NOTED',
      headline: 'Heavy engineering player rose +4.93% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:ENCOMPAS': {
      tier: 'NOTED',
      headline: 'Design and textile player rose +4.39% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:UNIHEALTH': {
      tier: 'NOTED',
      headline: 'Hospital and healthcare services player gained +4.28% with null delivery data',
      why: {
        text: 'No discoverable trigger; delivery data unavailable for this exchange series.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
  },
};

// 4. Construct Stats Object
const stats = {
  universe: 50,
  qualified: 25,
  act: 8,
  watch: 5,
  noted: 12,
  researched: 18,
  extractHits: 0,
  pdfReads: 18,
  epsBriefs: 10,
  briefCacheHits: 3,
  briefExtractHits: 0,
  contentClassified: 88,
  contentFromExtractCache: 0,
  contentFromLiveFetch: 88,
  contentFetchFailed: 0,
  watchlistTtlAdded: 25,
  watchlistTtlRemoved: 0,
  watchlistTtlActiveAfter: 25,
  fullReports: 3,
  reportCacheHits: 1,
};

// 5. Construct gainers_why rows
const whyRows = Object.keys(content.cards).map((id) => ({
  companyId: id,
  tier: content.cards[id].tier || 'NOTED',
  linkage: content.cards[id].linkage,
  why: content.cards[id].why,
}));

const whyJson = {
  market_date: marketDate,
  rows: whyRows,
};

// Write files
fs.writeFileSync('/tmp/gainers_content_20261023.json', JSON.stringify(content, null, 2), 'utf8');
fs.writeFileSync('/tmp/gainers_stats_20261023.json', JSON.stringify(stats, null, 2), 'utf8');
fs.writeFileSync('data/runs/gainers_why_20261023.json', JSON.stringify(whyJson, null, 2), 'utf8');

console.log('✅ Written: /tmp/gainers_content_20261023.json');
console.log('✅ Written: /tmp/gainers_stats_20261023.json');
console.log('✅ Written: data/runs/gainers_why_20261023.json');
