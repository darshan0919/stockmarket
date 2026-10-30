'use strict';

const fs = require('fs');
const db = require('../lib/db');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

const marketDate = '2026-10-29';

// 1. Resolve Drive URLs for Top 3
const acutaasDriveUrl = db.resolveDriveUrl('rerating-catalysts/ACUTAAS_Output.pdf');
const bsoftDriveUrl = db.resolveDriveUrl('rerating-catalysts/BSOFT_Output.pdf');
const poonawallaDriveUrl = db.resolveDriveUrl('rerating-catalysts/POONAWALLA_Output.pdf');

console.log('Resolved Drive URLs:');
console.log('ACUTAAS:', acutaasDriveUrl);
console.log('BSOFT:', bsoftDriveUrl);
console.log('POONAWALLA:', poonawallaDriveUrl);

// 2. Fetch cached briefs for top 10
const getBrief = (id) => {
  const b = briefCache.getBrief(id);
  if (!b) return null;
  const record = { ...b.record };
  if (id === 'NSE:ACUTAAS' && acutaasDriveUrl) record.reportDriveUrl = acutaasDriveUrl;
  if (id === 'NSE:BSOFT' && bsoftDriveUrl) record.reportDriveUrl = bsoftDriveUrl;
  if (id === 'NSE:POONAWALLA' && poonawallaDriveUrl) record.reportDriveUrl = poonawallaDriveUrl;
  return record;
};

// 3. Construct Content Overlay
const content = {
  lead: "Q2 earnings inflections, strategic liability optimization, and corporate restructuring dominate today's actionability: **Poonawalla Fincorp** (+9.49%, ₹178.5 Cr deliv) locked in ₹1,318 Cr of institutional low-cost secured NCDs under its ₹2,000 Cr borrowing limit, while **V-Guard Industries** (+7.90%, ₹92.4 Cr deliv) surged as Q2 Consolidated PAT jumped +71.0% YoY on +38.2% revenue growth (₹1,852.9 Cr). In mid-cap tech and engineering, **Zensar Technologies** (+8.11%, ₹91.8 Cr deliv) beat with +4.1% QoQ CC growth and a Scheme of Arrangement, and **Aeroflex Industries** (+9.37%, ₹169.4 Cr deliv) approved the amalgamation of wholly owned subsidiary Hyd-Air Engineering to consolidate manufacturing synergies.",
  caveats: [],
  cards: {
    // -------------------------------------------------------------
    // ACT CARDS (Full detail)
    // -------------------------------------------------------------
    'NSE:POONAWALLA': {
      tier: 'ACT',
      headline:
        'Allotment of ₹1,318 Cr institutional secured NCDs (Series ZCB G1: ₹913 Cr, Series G2: ₹405 Cr) under ₹2,000 Cr program',
      thesisChain: [
        'Finance Committee approved allotment of ₹1,318 Cr secured NCDs across two series, securing long-duration AAA-rated funding',
        'Access to low-cost institutional debt reduces weighted average cost of borrowing, expanding Net Interest Margin (NIM) towards >4.5%',
        'Enhanced liquidity runway accelerates disbursement compounding across high-ROE prime consumer and MSME loans',
      ],
      why: {
        text: 'Finance Committee approved allotment of ₹1,318 Cr secured NCDs (Series ZCB G1: ₹913 Cr, Series G2: ₹405 Cr) on 29-Oct under ₹2,000 Cr private placement framework.',
        basis: 'filing',
        sources: ['BSE/NSE Regulation 30 & 51 Filings 29-Oct-2026'],
      },
      epsThesis: getBrief('NSE:POONAWALLA'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+30-50 bps NIM expansion',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['ncd_allotment', 'liability_structuring', 'nbfc', 'fundraise'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/f4rss9ojnph9a78fofdpha9k.pdf',
    },
    'NSE:AEROFLEX': {
      tier: 'ACT',
      headline:
        'Board approves amalgamation of wholly owned subsidiary Hyd-Air Engineering alongside un-audited Q2 FY27 results',
      thesisChain: [
        'Board approved scheme of amalgamation of Hyd-Air Engineering to consolidate precision flow-control and stainless steel hose manufacturing',
        'Eliminates intra-group operational friction and unifies supply chain capabilities for high-margin industrial applications',
        'Institutional accumulation of ₹169.35 Cr confirms conviction in post-merger operational leverage',
      ],
      why: {
        text: 'Board approved scheme of amalgamation of wholly owned subsidiary Hyd-Air Engineering on 28-Oct to consolidate manufacturing synergies.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 28-Oct-2026'],
      },
      epsThesis: getBrief('NSE:AEROFLEX'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+15-20% margin expansion',
        timeline: 'FY27-28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['amalgamation', 'corporate_action', 'results', 'manufacturing'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/koknvmry2uwcf7vkeaobx288.pdf',
    },
    'NSE:VGUARD': {
      tier: 'ACT',
      headline:
        'Q2 Consolidated Revenue surged +38.2% YoY to ₹1,852.89 Cr; Profit After Tax jumped +71.0% YoY',
      thesisChain: [
        'Q2 FY27 Consolidated revenue jumped +38.2% YoY to ₹1,852.89 Cr (vs ₹1,340.92 Cr) with broad-based electricals demand',
        'Profit after tax jumped +71.0% YoY, demonstrating sharp operating leverage as gross margins expanded and Sunflame synergies scaled',
        'Strong non-South distribution penetration and seasonal festive channel restocking cement market share gains',
      ],
      why: {
        text: 'Blockbuster Q2 FY27 results filed 29-Oct: Consolidated revenue +38.2% YoY to ₹1,852.89 Cr and PAT +71.0% YoY on high operating leverage.',
        basis: 'filing',
        sources: ['BSE/NSE Results & Press Release 29-Oct-2026'],
      },
      epsThesis: getBrief('NSE:VGUARD'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+71.0% YoY PAT',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'earnings_beat', 'operating_leverage', 'consumer_durables'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/qh9267zzacej0x1fpc5lrdkc.pdf',
    },
    'NSE:ZENSARTECH': {
      tier: 'ACT',
      headline:
        'Q2 FY27 CC sequential revenue growth accelerates +4.1% QoQ; Board approves Scheme of Arrangement',
      thesisChain: [
        'Constant currency sequential revenue grew +4.1% QoQ, beating tier-2 IT peer benchmarks',
        'Board approved Scheme of Arrangement for structural simplification and operational alignment across subsidiaries',
        'Resilient enterprise order bookings in digital engineering and cloud infrastructure support multi-quarter revenue visibility',
      ],
      why: {
        text: 'Q2 FY27 results & press release filed 28-Oct: +4.1% QoQ constant currency revenue growth beat and Board approval for Scheme of Arrangement.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 28-Oct-2026'],
      },
      epsThesis: getBrief('NSE:ZENSARTECH'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+4.1% QoQ CC growth',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'it_services', 'scheme_of_arrangement', 'cc_growth'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/i3l5nib1fsm8yrn06va2dko6.pdf',
    },
    'NSE:SATIN': {
      tier: 'ACT',
      headline:
        'Record quarterly profitability: H1 FY27 PAT reaches ₹299 Cr (nearing full-year FY26 profit of ₹332 Cr) as AUM hits ₹16,589 Cr (+30.8% YoY)',
      thesisChain: [
        'Delivered highest-ever quarterly profitability with H1 PAT reaching ₹299 Cr, closing in on full FY26 profit in just 6 months',
        'Assets under Management (AUM) expanded +30.8% YoY to ₹16,589 Cr with stable asset quality and disciplined credit underwriting',
        'Strategic scaling in non-MFI book (MSME & affordable housing finance) drives diversification and structural return on equity (RoE)',
      ],
      why: {
        text: 'Q2 FY27 results & press release on 28-Oct: Highest-ever profitability with H1 PAT at ₹299 Cr (near full-year FY26) and AUM +30.8% YoY to ₹16,589 Cr.',
        basis: 'filing',
        sources: ['BSE/NSE Press Release 28-Oct-2026'],
      },
      epsThesis: getBrief('NSE:SATIN'),
      epsImpact: {
        direction: 'positive',
        magnitude: '₹299 Cr H1 PAT (~FY26 full year)',
        timeline: 'FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'highest_profitability', 'mfi', 'aum_growth'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/kfqai7ly3uwgiaudgzgjj5fn.pdf',
    },
    'NSE:OPTIEMUS': {
      tier: 'ACT',
      headline:
        'Operations & Admin Committee approved strategic expansions on 27-Oct; Board meeting intimation on 29-Oct for Q2 results & fundraise',
      thesisChain: [
        'Operations & Admin Committee approved operational initiatives on 27-Oct, followed by Board meeting notice on 29-Oct to consider Q2 results and strategic proposals',
        'Capitalizes on IT hardware PLI and domestic electronics manufacturing service (EMS) demand',
        'Heavy ₹31.82 Cr delivery buying (41.25% deliv) confirms strong institutional pre-positioning',
      ],
      why: {
        text: 'Operations & Administration Committee outcome on 27-Oct and Board meeting notice on 29-Oct for Q2 results and strategic proposals.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 27-Oct & 29-Oct 2026'],
      },
      epsThesis: getBrief('NSE:OPTIEMUS'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Strategic proposal & EMS scaling',
        timeline: 'H2 FY27',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['board_meeting', 'ems', 'electronics_pli', 'pre_result'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/65f5txvjctl3r1jr8qv5reda.pdf',
    },
    'NSE:NILKAMAL': {
      tier: 'ACT',
      headline:
        'Q2 FY27 results & press release demonstrate operating profit turnaround across material handling and plastics',
      thesisChain: [
        'Q2 FY27 un-audited results show margin stabilization and operating profit inflection in material handling division',
        'Raw material cost stabilization (polymer inputs) expands gross spreads across retail furniture and industrial crates',
        'Delivered ₹23.02 Cr in delivery value on +13.63% rally, confirming cash accumulation into consumer cyclicals',
      ],
      why: {
        text: 'Q2 FY27 financial results & press release filed 29-Oct: Operating profit turnaround and margin expansion in industrial material handling.',
        basis: 'filing',
        sources: ['BSE/NSE Results & Press Release 29-Oct-2026'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'positive',
        magnitude: 'Operating turnaround',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'plastics', 'material_handling', 'turnaround'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/vq89vafpeac4sxj9dnopdhyb.pdf',
    },
    'NSE:PRASOLCHEM': {
      tier: 'ACT',
      headline: 'Pre-results accumulation ahead of Q2 earnings; Board meeting scheduled in 5 days',
      thesisChain: [
        'Board meeting scheduled within 5 days to consider Q2 FY27 financial results',
        '49.33% delivery on ₹7.00 Cr turnover confirms tight institutional accumulation ahead of earnings release',
        'Recovery in phosphorus-based specialty chemical exports and agrochemical intermediates supports earnings re-rating',
      ],
      why: {
        text: 'Pre-results earnings anticipation: Board meeting scheduled within 5 days; high 49.3% delivery indicates pre-earnings accumulation.',
        basis: 'pre_result',
        sources: ['Exchange Intimations'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'positive',
        magnitude: 'Pre-results accumulation',
        timeline: 'Q2 FY27',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['pre_result', 'specialty_chemicals', 'accumulation'],
      pdfUrl: null,
    },

    // -------------------------------------------------------------
    // WATCH CARDS (Compact detail)
    // -------------------------------------------------------------
    'NSE:ACUTAAS': {
      tier: 'WATCH',
      headline:
        'Follow-through buying from Q2 results (+920 bps EBITDA margin to 40.3%, PAT +71.4% YoY) filed 27-Oct',
      why: {
        text: 'Q2 FY27 earnings breakout filed 27-Oct (2 days ago): EBITDA margin expanded 920 bps YoY to 40.3%, PAT surged +71.4% YoY, and upward guidance raised for FY27.',
        basis: 'filing',
        sources: ['Q2 FY27 Results Filing 27-Oct-2026'],
      },
      epsThesis: getBrief('NSE:ACUTAAS'),
      linkage: 'explained',
      tags: ['results', 'margin_expansion', 'semiconductors'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/wlfqoqspn0ec8004f8wzt9qd.pdf',
    },
    'NSE:BSOFT': {
      tier: 'WATCH',
      headline:
        'Q2 FY27 results beat: Consolidated PAT +37.5% YoY to ₹159.65 Cr and ₹3.00/share (150%) interim dividend',
      why: {
        text: 'Q2 FY27 financial results beat filed 28-Oct: PAT grew +37.5% YoY to ₹159.65 Cr, constant currency revenue accelerated +2.7% QoQ, and board approved ₹3.00/share interim dividend.',
        basis: 'filing',
        sources: ['BSE/NSE Results & Dividend Filing 28-Oct-2026'],
      },
      epsThesis: getBrief('NSE:BSOFT'),
      linkage: 'explained',
      tags: ['results', 'dividend', 'it_services'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t67lm2jent1mmad0abrikyn8.pdf',
    },
    'NSE:INDSWFTLAB': {
      tier: 'WATCH',
      headline:
        'Q2 FY27 financial results approved and NIL deviation on 7M + 26M preferential convertible warrants',
      why: {
        text: 'Q2 FY27 financial results approved and NIL deviation on 7M + 26M preferential convertible warrants filed on 29-Oct, confirming API balance sheet repair.',
        basis: 'filing',
        sources: ['BSE/NSE Filings 29-Oct-2026'],
      },
      epsThesis: getBrief('NSE:INDSWFTLAB'),
      linkage: 'explained',
      tags: ['results', 'warrants', 'pharma_api'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/32sgrvzmxsrfo7wr8mv6gjhs.pdf',
    },
    'NSE:MANAKCOAT': {
      tier: 'WATCH',
      headline:
        'Q2 FY27 financial results and commercial updates on continuous galvanizing and pre-painted steel line expansions',
      why: {
        text: 'Q2 FY27 results and press release filed 28-29 Oct; volume ramp-up in value-added color-coated coils and galvanizing lines.',
        basis: 'filing',
        sources: ['BSE/NSE Disclosures 28-29 Oct 2026'],
      },
      linkage: 'explained',
      tags: ['results', 'steel_coating', 'expansion'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/v6s5b8r5nq76qnaaozxsu2nv.pdf',
    },
    'NSE:BHAGERIA': {
      tier: 'WATCH',
      headline:
        'Q2 FY27 un-audited results approved showing dye intermediates recovery and captive solar power generation',
      why: {
        text: 'Q2 FY27 financial results approved on 28-Oct; dye intermediates pricing stabilization and captive solar power revenue compounding.',
        basis: 'filing',
        sources: ['BSE/NSE Results Filing 28-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['results', 'chemicals', 'solar_power'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/e9wjwbjmhl6ighibnfwh4uaq.pdf',
    },
    'NSE:CNL': {
      tier: 'WATCH',
      headline:
        'Q2 FY27 Consolidated Results and investor presentation highlighting enterprise tech and consumer product brand onboarding',
      why: {
        text: 'Q2 FY27 financial results and investor presentation filed 28-Oct; revenue expansion across enterprise cybersecurity and digital lifestyle distribution.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 28-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['results', 'tech_distribution', 'presentation'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/1s2pgpwnnnh3gb7a7e5a7o97.pdf',
    },
    'NSE:ASIANENE': {
      tier: 'WATCH',
      headline:
        'Execution of Revenue Sharing Contract (RSC) on 22-Oct with Govt of India under DSF Bid Round-IV',
      why: {
        text: 'Revenue Sharing Contract (RSC) executed with Govt of India on 22-Oct (7 days ago) for DSF Bid Round-IV offshore block; delivery buying delivering into regulatory clearance.',
        basis: 'filing',
        sources: ['BSE/NSE Regulation 30 Filing 23-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['contract_award', 'oil_gas', 'revenue_sharing'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/8m33t7rvrrbecqzg4gddkv21.pdf',
    },
    'BSE:SGFIN': {
      tier: 'WATCH',
      headline:
        'Supply chain financing and invoice discounting credit acceleration; 52.50% delivery',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; move reflects supply chain and invoice discounting AUM acceleration.',
        basis: 'none',
        sources: ['BSE Disclosures 14d'],
      },
      linkage: 'unexplained',
      tags: ['supply_chain_finance', 'msme_lending'],
      pdfUrl: null,
    },
    'NSE:CREDENT': {
      tier: 'WATCH',
      headline: 'Hospital and healthcare medical services accumulation',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; trading on healthcare facility expansion sentiment.',
        basis: 'none',
        sources: ['Exchange Disclosures 14d'],
      },
      linkage: 'unexplained',
      tags: ['hospitals', 'healthcare'],
      pdfUrl: null,
    },

    // -------------------------------------------------------------
    // NOTED TIER CARDS
    // -------------------------------------------------------------
    'NSE:RPOWER': {
      tier: 'NOTED',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; sustained accumulation following zero standalone debt achievement and storage pipeline.',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      linkage: 'unexplained',
      epsThesis: getBrief('NSE:RPOWER'),
    },
    'NSE:DCMSRIND': {
      tier: 'NOTED',
      why: {
        text: 'Clarification on price movement filed 23-Oct (6 days ago); momentum driven by sugar distillery ethanol expansion and industrial UAV commercialization.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 23-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:APOLLOPIPE': {
      tier: 'NOTED',
      why: {
        text: 'Building materials plastic pipes demand; pre-results positioning.',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:AURIONPRO': {
      tier: 'NOTED',
      why: {
        text: 'Transaction banking tech platforms deal momentum.',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:DELTACORP': {
      tier: 'NOTED',
      why: {
        text: 'Speculative positioning ahead of hospitality business demerger milestones.',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:PRANAV': {
      tier: 'NOTED',
      why: {
        text: 'Pre-results earnings anticipation: Board meeting scheduled within 8 days.',
        basis: 'pre_result',
        sources: ['Exchange Intimations'],
      },
      linkage: 'explained',
    },
    'NSE:UTTAMSUGAR': {
      tier: 'NOTED',
      why: {
        text: 'Industry tailwinds: Sugar sector rallying on upward revisions in grain/cane ethanol procurement rates ahead of crushing season.',
        basis: 'sector',
        sources: ['Industry Sugar Macro'],
      },
      linkage: 'explained',
    },
    'NSE:AGIIL': {
      tier: 'NOTED',
      why: {
        text: 'Pre-results earnings anticipation: Board meeting scheduled within 7 days.',
        basis: 'pre_result',
        sources: ['Exchange Intimations'],
      },
      linkage: 'explained',
    },
    'NSE:GAUDIUMIVF': {
      tier: 'NOTED',
      why: {
        text: 'Fertility and specialized clinical chain expansion sentiment.',
        basis: 'none',
        sources: ['Exchange Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:KRISHCA': {
      tier: 'NOTED',
      why: {
        text: 'Steel strapping packaging products demand.',
        basis: 'none',
        sources: ['Exchange Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:SACHEEROME': {
      tier: 'NOTED',
      why: {
        text: 'Aroma chemicals and fragrance ingredients demand.',
        basis: 'none',
        sources: ['Exchange Disclosures 14d'],
      },
      linkage: 'unexplained',
    },
  },
};

// 4. Construct Stats Footer
const stats = {
  universe: 50,
  qualified: 28,
  act: 8,
  watch: 9,
  noted: 11,
  researched: 20,
  extractHits: 0,
  pdfReads: 43,
  epsBriefs: 10,
  briefCacheHits: 1,
  briefExtractHits: 0,
  contentClassified: 110,
  contentFromExtractCache: 0,
  contentFromLiveFetch: 110,
  contentFetchFailed: 0,
  watchlistTtlAdded: 28,
  watchlistTtlRemoved: 0,
  watchlistTtlActiveAfter: 28,
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
fs.writeFileSync('/tmp/gainers_content_20261029.json', JSON.stringify(content, null, 2), 'utf8');
fs.writeFileSync('/tmp/gainers_stats_20261029.json', JSON.stringify(stats, null, 2), 'utf8');
fs.writeFileSync('data/runs/gainers_why_20261029.json', JSON.stringify(whyJson, null, 2), 'utf8');

console.log('✅ Written: /tmp/gainers_content_20261029.json');
console.log('✅ Written: /tmp/gainers_stats_20261029.json');
console.log('✅ Written: data/runs/gainers_why_20261029.json');
