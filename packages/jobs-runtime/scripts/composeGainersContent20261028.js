'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

const marketDate = '2026-10-28';

// 1. Resolve Drive URLs for Top 3
const pplpharmaDriveUrl = db.resolveDriveUrl('rerating-catalysts/PPLPHARMA_Output.pdf');
const syngeneDriveUrl = db.resolveDriveUrl('rerating-catalysts/SYNGENE_Output.pdf');
const voltasDriveUrl = db.resolveDriveUrl('rerating-catalysts/VOLTAS_Output.pdf');

console.log('Resolved Drive URLs:');
console.log('PPLPHARMA:', pplpharmaDriveUrl);
console.log('SYNGENE:', syngeneDriveUrl);
console.log('VOLTAS:', voltasDriveUrl);

// 2. Fetch cached briefs for top 10
const getBrief = (id) => {
  const b = briefCache.getBrief(id);
  if (!b) return null;
  const record = { ...b.record };
  if (id === 'NSE:PPLPHARMA' && pplpharmaDriveUrl) record.reportDriveUrl = pplpharmaDriveUrl;
  if (id === 'NSE:SYNGENE' && syngeneDriveUrl) record.reportDriveUrl = syngeneDriveUrl;
  if (id === 'NSE:VOLTAS' && voltasDriveUrl) record.reportDriveUrl = voltasDriveUrl;
  return record;
};

// 3. Construct Content Overlay
const content = {
  lead:
    "Q2 earnings inflections, major capacity commercialisations, and upstream white-goods demand read-across dominate today's actionability: **Piramal Pharma** (+17.15%, ₹422.5 Cr deliv) led the entire market in institutional delivery after Q2 revenue jumped +28% YoY to ₹2,617 Cr and EBITDA surged +72% YoY (margin up 350 bps to 14.7%) on rapid CDMO utilization, while **Syngene International** (+12.19%, ₹184.6 Cr deliv) confirmed a sharp sequential turnaround with revenue +13% QoQ and operating EBITDA margin jumping 600 bps to 18.0%. **PG Electroplast** (+7.16%, ₹95.6 Cr deliv) nearly quadrupled Q2 PAT (+395% to ₹13.7 Cr on ₹933.9 Cr revenue) from explosive RAC manufacturing, providing immediate demand read-across for brand leader **Voltas** (+6.94%, ₹101.5 Cr deliv, 32% deliv) ahead of its own Q2 earnings, while **Sudeep Pharma** (+9.45%, ₹40.2 Cr deliv) secured landmark Gujarat FDA approval for its new 51,200 MT greenfield facility at Nandesari.",
  caveats: [],
  cards: {
    // -------------------------------------------------------------
    // ACT CARDS (Full detail)
    // -------------------------------------------------------------
    'NSE:PPLPHARMA': {
      tier: 'ACT',
      headline:
        'Q2 revenue accelerated +28% YoY to ₹2,617 Cr with EBITDA jumping +72% YoY to ₹385 Cr (+350 bps margin to 14.7%) on ₹422.5 Cr delivery',
      thesisChain: [
        'CDMO division revenue surged +28% YoY to ₹1,424 Cr with high capacity utilization and fixed-cost absorption across sterile filling and ADCs',
        'EBITDA increased +72% YoY to ₹385 Cr as operating leverage and sustained cost optimizations expanded EBITDA margins by 350 bps to 14.7%',
        'Commercial traction accelerated with 22 new enterprise customer additions and 110 client audits completed in H1FY27',
      ],
      why: {
        text: 'Q2 FY27 results beat: Consolidated revenue accelerated +28% YoY to ₹2,617 Cr, EBITDA surged +72% YoY to ₹385 Cr with 350 bps margin expansion to 14.7%, adding 22 new customers.',
        basis: 'filing',
        sources: ['Q2 FY27 Results Press Release 27-Oct-2026', 'NSE/BSE Filings 27-Oct-2026'],
      },
      epsThesis: getBrief('NSE:PPLPHARMA'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+35-40% PAT CAGR',
        timeline: 'FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'margin_expansion', 'cdmo', 'capacity_utilization'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/8i3vc4c6qy2g840wbnscl2pr.pdf',
    },
    'NSE:SYNGENE': {
      tier: 'ACT',
      headline:
        'Sequential turnaround: Q2 revenue up +13% QoQ to ₹833 Cr with operating EBITDA margin expanding 600 bps to 18.0% on ₹184.6 Cr delivery',
      thesisChain: [
        'Operating EBITDA rebounded +61.5% sequentially to ₹147 Cr as operating margin expanded by 6 percentage points from 12% in Q1 to 18%',
        'Revenue from operations grew +13% QoQ to ₹833 Cr, confirming stabilization in discovery chemistry and clinical biologics demand',
        'Dedicated research centers (BMS, Amgen, Baxter) provide stable high-margin annuity cash flows as biopharma funding winter recedes',
      ],
      why: {
        text: 'Q2 FY27 sequential turnaround: Revenue +13% QoQ to ₹833 Cr, Operating EBITDA jumped +61.5% QoQ to ₹147 Cr with a 600 bps margin rebound to 18.0%.',
        basis: 'filing',
        sources: ['Q2 FY27 Results Press Release 27-Oct-2026', 'Fact Sheet Q2 FY27'],
      },
      epsThesis: getBrief('NSE:SYNGENE'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+25-30% EPS CAGR',
        timeline: 'FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'margin_expansion', 'crdmo', 'turnaround'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/jpfrpedasd5c1r20bb1c0fan.pdf',
    },
    'NSE:PGEL': {
      tier: 'ACT',
      headline:
        'Q2 revenue accelerated +42.5% YoY to ₹933.9 Cr, EBITDA +54.8% YoY, and PAT surged +395% to ₹13.7 Cr on ₹95.6 Cr delivery',
      thesisChain: [
        'Consolidated Q2 revenues surged +42.5% YoY to ₹933.88 Cr driven by RAC manufacturing expansion and electronic manufacturing services (EMS)',
        'Operating EBITDA expanded +54.8% YoY to ₹69.14 Cr as plastic molding and backward integration captured high manufacturing value-add',
        'PAT jumped nearly quadrupling (+395% YoY) to ₹13.67 Cr, while step-down subsidiary NGM progresses capex on next-generation facilities',
      ],
      why: {
        text: 'Q2 FY27 blowout results: Revenues grew +42.5% YoY to ₹933.88 Cr, EBITDA rose +54.8% YoY to ₹69.14 Cr, and PAT skyrocketed +395% YoY to ₹13.67 Cr on RAC backward integration.',
        basis: 'filing',
        sources: ['Q2 FY27 Results Press Release 27-Oct-2026'],
      },
      epsThesis: getBrief('NSE:PGEL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+40-50% PAT growth',
        timeline: 'FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'ems', 'room_ac', 'operating_leverage'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/nz82fq1f2sfo3nj3xl4w5b3i.pdf',
    },
    'NSE:ZEEL': {
      tier: 'ACT',
      headline:
        'Senior leadership overhaul: Suraj Singh appointed Business Head of Zee Studios to drive theatrical and streaming monetization',
      thesisChain: [
        'Board appointed Suraj Singh as Business Head of Zee Studios (effective Nov 10, 2026) to steer movie production, acquisitions, and digital syndication',
        'Leadership restructuring focuses on content monetization and margin recovery following corporate simplification',
        'Stock rallied +6.98% on ₹52.36 Cr delivery buying as market positions for content pipeline execution',
      ],
      why: {
        text: 'Appointment of Suraj Singh as Business Head of Zee Studios to revitalize theatrical and digital content monetization, backed by ₹52.36 Cr delivery accumulation.',
        basis: 'filing',
        sources: ['Reg 30 Filing 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:ZEEL'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Operating margin recovery',
        timeline: 'H2 FY27-FY28',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['management_change', 'media', 'restructuring'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/j2ohh514gwveqveoq9wfm8iu.pdf',
    },
    'NSE:SUDEEPPHRM': {
      tier: 'ACT',
      headline:
        'Landmark Gujarat FDA approval authorises commercial operations at new 51,200 MT greenfield facility at Nandesari on ₹40.2 Cr delivery',
      thesisChain: [
        'Received Gujarat Food and Drug Control Administration (FDA) approval for new greenfield facility at 179 Nandesari, authorizing commercial manufacturing',
        'The state-of-the-art facility has an installed annual capacity of 51,200 MT across Pharma, Food & Nutrition, and Specialty Ingredients',
        'Approval unlocks major commercial capacity scaling to service rising export demand across high-margin pharmaceutical excipients',
      ],
      why: {
        text: 'Gujarat FDA approval received authorizing commercial manufacturing operations at new 51,200 MT greenfield facility at 179 Nandesari, alongside Q2 FY27 results approval.',
        basis: 'filing',
        sources: ['FDA Approval Press Release 26-Oct-2026', 'Q2 Results Filing 28-Oct-2026'],
      },
      epsThesis: getBrief('NSE:SUDEEPPHRM'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+51,200 MT capacity commercialisation',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['fda_approval', 'capacity_commissioning', 'excipients', 'specialty_chemicals'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/hszw9ro4ja5kepjff8dlrbbq.pdf',
    },
    'BSE:PPEL': {
      tier: 'ACT',
      headline:
        'H1 revenue surged +68% YoY to ₹210.1 Cr with 19% EBITDA margin and PAT of ₹24.9 Cr on 64.1% delivery conviction',
      thesisChain: [
        'Revenue from Operations reached ₹210.1 Cr (+68% YoY over H1FY26) driven by precision engineering components across automotive and industrial sectors',
        'Operating profitability expanded significantly with EBITDA standing at ₹39.6 Cr (19% margin) and PAT of ₹24.9 Cr (12% margin)',
        'Installed melting capacity of ~13,800 MT and casting capacity of ~6,000 MT being augmented with magnesium component R&D',
      ],
      why: {
        text: 'H1 FY27 revenue surged +68% YoY to ₹210.1 Cr with 19% operating EBITDA margin (₹39.6 Cr) and PAT of ₹24.9 Cr following BSE SME listing.',
        basis: 'filing',
        sources: ['H1 FY27 Results 22-Oct-2026'],
      },
      epsThesis: getBrief('BSE:PPEL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+68% YoY top-line / 19% EBITDA margin',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'castings', 'margin_expansion', 'capacity'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/i3m4xl98qtcg1l27ividj3ml.pdf',
    },
    'NSE:SHREEPUSHK': {
      tier: 'ACT',
      headline:
        'Board Meeting scheduled for Nov 2 to approve Q2 results AND consider Preferential Issue fundraise on 48.8% delivery',
      thesisChain: [
        'Board meeting scheduled for November 2, 2026 (5 days away) to consider Q2 FY27 results and potential fundraising via Preferential Issue',
        'Analyst and institutional investor meeting intimation filed in parallel, signaling proactive investor engagement',
        'Dyes, dye intermediates, and fertilizer backward integration positions company for fertilizer subsidy and specialty chemical recovery',
      ],
      why: {
        text: 'Board Meeting scheduled for November 2, 2026 to approve Q2 results and evaluate potential fund raising by way of Preferential Issue, alongside analyst meet intimation.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 27-Oct-2026', 'Analyst Meet Notice 28-Oct-2026'],
      },
      epsThesis: null,
      epsImpact: {
        direction: 'positive',
        magnitude: 'Pref issue fundraise + Q2 results',
        timeline: 'Nov 2026',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['pre_result', 'fundraise', 'fertilizers', 'chemicals'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t0gfufj4a2sc3c4k3g8wkx58.pdf',
    },

    // -------------------------------------------------------------
    // WATCH CARDS (Compact detail)
    // -------------------------------------------------------------
    'NSE:VOLTAS': {
      tier: 'WATCH',
      headline:
        'Heavy delivery accumulation (₹101.5 Cr, 32% deliv) ahead of Q2 results on supplier PGEL blowout RAC prints (+42.5% rev, +395% PAT)',
      why: {
        text: 'Heavy delivery accumulation (₹101.52 Cr, 32% delivery) ahead of Q2 results, driven by upstream proxy PG Electroplast blowout RAC volumes (+42.5% YoY revenue, PAT +395%).',
        basis: 'catalyst',
        sources: ['PG Electroplast Q2 Results Release 27-Oct-2026', 'Stockscans Market Flow'],
      },
      epsThesis: getBrief('NSE:VOLTAS'),
      linkage: 'explained',
      tags: ['room_ac', 'consumer_electronics', 'pre_result'],
    },
    'NSE:TIPSMUSIC': {
      tier: 'WATCH',
      headline:
        'Digital music publishing royalty compounding: Q2 revenue +35% YoY to ₹120.1 Cr with 70.5% EBITDA margin on ₹48.0 Cr delivery',
      why: {
        text: 'Q2 FY27 financial results show 35% YoY revenue growth to ₹120.1 Cr, operating EBITDA margin of 70.5%, and PAT +23% YoY to ₹65.5 Cr, backed by interim dividend approval.',
        basis: 'catalyst',
        sources: ['Q2 FY27 Results Filing 16-Oct-2026', 'Cached EPS Brief'],
      },
      epsThesis: getBrief('NSE:TIPSMUSIC'),
      linkage: 'explained',
      tags: ['results', 'music_licensing', 'operating_leverage'],
    },
    'NSE:AARTIDRUGS': {
      tier: 'WATCH',
      headline:
        'Pre-results accumulation (₹39.9 Cr delivery) ahead of Board Meeting on Nov 3 for Q2 results amid API sector re-rating',
      why: {
        text: 'Pre-results accumulation ahead of Board Meeting scheduled for November 3, 2026 (6 days countdown) to approve Q2 FY27 financial results.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 27-Oct-2026'],
      },
      epsThesis: getBrief('NSE:AARTIDRUGS'),
      linkage: 'explained',
      tags: ['pre_result', 'pharma_api'],
    },
    'NSE:LUMAXTECH': {
      tier: 'WATCH',
      headline:
        'Q2 consolidated revenue jumped +35% YoY to ₹1,556 Cr; Board approves new Mechatronics manufacturing plant at Manesar',
      why: {
        text: 'Q2 FY27 consolidated revenue jumped +35% YoY (+14% QoQ) to ₹1,556 Cr with EBITDA of ₹228 Cr, while Board approved setting up a new Mechatronics manufacturing facility at Manesar, Haryana.',
        basis: 'filing',
        sources: ['Investor Release 24-Oct-2026', 'Mechatronics Plant Intimation 24-Oct-2026'],
      },
      epsThesis: getBrief('NSE:LUMAXTECH'),
      linkage: 'explained',
      tags: ['results', 'auto_components', 'capacity'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/abvtxfawxcjrl9nv9wbpeofq.pdf',
    },
    'NSE:DEEPA': {
      tier: 'WATCH',
      headline:
        'Q2 revenue rose +24.6% YoY to ₹625.6 Cr, EBITDA +17.1% to ₹45.3 Cr, and PAT surged +37.1% to ₹37.3 Cr on ₹21.0 Cr delivery',
      why: {
        text: 'Q2 FY27 results print: Revenue +24.6% YoY to ₹625.6 Cr, EBITDA +17.1% YoY to ₹45.3 Cr, and PAT +37.1% YoY to ₹37.3 Cr, heading into peak festive H2.',
        basis: 'filing',
        sources: ['Q2 FY27 Results 26-Oct-2026', 'Investor Presentation 26-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['results', 'jewellery', 'festive_demand'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/2cavnd0hlkjs8fnkv550hcfy.pdf',
    },
    'NSE:PNGSREVA': {
      tier: 'WATCH',
      headline:
        'Festive sales surge: Dussehra sales jumped +62.4% YoY to ₹12.2 Cr; retail network expanded to 39 stores with new Jaipur COCO store',
      why: {
        text: 'Dussehra sales jumped +62.4% YoY to ₹12.19 Cr and Navratri/Dussehra sales grew +35.01% YoY to ₹38.53 Cr, expanding retail network to 39 stores with new Jaipur COCO store.',
        basis: 'filing',
        sources: ['Festive Sales Update 21-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['retail_sales', 'diamond_jewellery', 'festive'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/ek2def1auufhfwtu7y9rpk02.pdf',
    },
    'NSE:SMSPHARMA': {
      tier: 'WATCH',
      headline:
        'Pre-results accumulation (43.9% delivery) ahead of Board Meeting on Nov 4 to approve Q2 FY27 results',
      why: {
        text: 'Board Meeting scheduled for November 4, 2026 (7 days away) to approve Q2 FY27 results, supported by 43.9% delivery backing.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 28-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['pre_result', 'pharma_api'],
    },
    'NSE:MIDWESTLTD': {
      tier: 'WATCH',
      headline:
        'High-conviction buying (74.7% delivery) in dominant Black Galaxy & Absolute Black granite export monopolist',
      why: {
        text: 'Accumulation in premium natural stone and black granite export monopolist with dominant captive quarry concessions across AP/Telangana.',
        basis: 'catalyst',
        sources: ['Stockscans Company Overview', 'Market Flow Data'],
      },
      linkage: 'explained',
      tags: ['granite_mining', 'exports'],
    },

    // -------------------------------------------------------------
    // NOTED CARDS (Single-line tickers)
    // -------------------------------------------------------------
    'NSE:HUBTOWN': {
      tier: 'NOTED',
      headline: 'Pre-results rally (+15.24%, 32.9% delivery) 1 day ahead of Board Meeting scheduled for Oct 29',
      why: {
        text: 'Board Meeting scheduled for October 29, 2026 (tomorrow, 1 day countdown) to approve Q2 standalone and consolidated financial results.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 26-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:SBFC': {
      tier: 'NOTED',
      headline: 'Steady secured MSME loan book compounding following Q2 FY27 results release on ₹15.8 Cr delivery',
      why: {
        text: 'Q2 FY27 financial results release confirming healthy secured MSME portfolio expansion and stable asset quality.',
        basis: 'filing',
        sources: ['Financial Results 24-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:JYOTISTRUC': {
      tier: 'NOTED',
      headline:
        'Awarded mega ₹648.9 Cr turnkey HVDC transmission line order for Barmer-II project from PGCIL (>52% of market cap)',
      why: {
        text: 'Award of major ±800 kV HVDC Bipole Barmer-II transmission line turnkey contract valued at ₹648.91 Cr from Power Grid Corporation of India (PGCIL).',
        basis: 'filing',
        sources: ['Order Win Notification 28-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:HUHTAMAKI': {
      tier: 'NOTED',
      headline:
        'Locked 20% upper circuit as Q3 net sales rose +23.7% YoY to ₹748.1 Cr and 9M EBIT surged +22% YoY to ₹152.8 Cr',
      why: {
        text: 'Q3 2026 net sales rose +23.7% YoY to ₹748.1 Cr and 9M EBIT surged +22% YoY to ₹152.8 Cr on volume growth and operating efficiency, locking 20% upper circuit.',
        basis: 'filing',
        sources: ['Q3 Results Press Release 27-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:RAMKY': {
      tier: 'NOTED',
      headline: 'Executed EPC contract agreement with RVNL for residential towers at NMDC Township, Bacheli (+17.4% gain)',
      why: {
        text: 'Execution of contract agreement with Rail Vikas Nigam Limited (RVNL) for residential towers in NMDC Township at Bacheli, Chhattisgarh.',
        basis: 'filing',
        sources: ['Contract Execution Intimation 24-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:DCMSRIND': {
      tier: 'NOTED',
      headline: 'Gained +10.1% on ₹6.8 Cr delivery (30.3% deliv) following price movement clarification to exchange',
      why: {
        text: 'No material corporate filing in 14 days beyond routine price movement clarification; price momentum in sugar and alcohol operations.',
        basis: 'none',
        sources: ['Exchange Clarification Letter 23-Oct-2026'],
      },
      linkage: 'unexplained',
    },
  },
};

// 4. Construct Stats Object
const stats = {
  universe: 50,
  qualified: 21,
  act: 7,
  watch: 8,
  noted: 6,
  researched: 20,
  extractHits: 0,
  pdfReads: 20,
  epsBriefs: 10,
  briefCacheHits: 1,
  briefExtractHits: 0,
  fullReports: 3,
  reportCacheHits: 0,
  contentClassified: 87,
  contentFromExtractCache: 0,
  contentFromLiveFetch: 87,
  contentFetchFailed: 0,
  watchlistTtlAdded: 21,
  watchlistTtlRemoved: 0,
  watchlistTtlActiveAfter: 21,
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
fs.writeFileSync('/tmp/gainers_content_20261028.json', JSON.stringify(content, null, 2), 'utf8');
fs.writeFileSync('/tmp/gainers_stats_20261028.json', JSON.stringify(stats, null, 2), 'utf8');
fs.writeFileSync('data/runs/gainers_why_20261028.json', JSON.stringify(whyJson, null, 2), 'utf8');

console.log('✅ Written: /tmp/gainers_content_20261028.json');
console.log('✅ Written: /tmp/gainers_stats_20261028.json');
console.log('✅ Written: data/runs/gainers_why_20261028.json');
