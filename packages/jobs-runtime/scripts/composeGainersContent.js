'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

const marketDate = '2026-11-03';

// 1. Resolve Drive URLs for Top 3
const mcxDriveUrl = db.resolveDriveUrl('rerating-catalysts/MCX_Output.pdf');
const maricoDriveUrl = db.resolveDriveUrl('rerating-catalysts/MARICO_Output.pdf');
const cartradeDriveUrl = db.resolveDriveUrl('rerating-catalysts/CARTRADE_Output.pdf');

console.log('Resolved Drive URLs:');
console.log('MCX:', mcxDriveUrl);
console.log('MARICO:', maricoDriveUrl);
console.log('CARTRADE:', cartradeDriveUrl);

// 2. Fetch cached briefs for top 10
const getBrief = (id) => {
  const b = briefCache.getBrief(id);
  if (!b) return null;
  const record = { ...b.record };
  if (id === 'NSE:MCX' && mcxDriveUrl) record.reportDriveUrl = mcxDriveUrl;
  if (id === 'NSE:MARICO' && maricoDriveUrl) record.reportDriveUrl = maricoDriveUrl;
  if (id === 'NSE:CARTRADE' && cartradeDriveUrl) record.reportDriveUrl = cartradeDriveUrl;
  return record;
};

// 3. Construct Content Overlay
const content = {
  lead: "Generational earnings beats and institutional accumulation dominate today's actionability: **Marico** (+10.00% upper circuit, ₹316.1 Cr deliv) shattered consensus with +10% YoY domestic volume growth (highest in 50 quarters / 12.5 years), +600 bps gross margin expansion, and +31% YoY PAT surge. In market infrastructure, **MCX** (+7.42%, ₹624.0 Cr deliv — #1 delivery across the market) saw aggressive pre-results accumulation on its Q2 FY27 Board Meeting day amid peak gold/silver options ADTV. In digital platforms, **CarTrade Tech** (+10.22%, ₹121.5 Cr deliv, 1.00% of Mcap) delivered all-time record revenue (₹213 Cr) and EBITDA (₹76 Cr, 36% margin) with OLX India EBITDA zooming +36% YoY. Among small/mid-caps, **Tempsens Instruments** (+13.54%, ₹67.8 Cr deliv) and **Nelcast** (+14.18%, ₹32.4 Cr deliv) confirmed robust Q2 earnings inflections.",
  caveats: [],
  cards: {
    // -------------------------------------------------------------
    // ACT CARDS (Full detail)
    // -------------------------------------------------------------
    'NSE:MARICO': {
      tier: 'ACT',
      headline:
        'Domestic volume growth hits +10% YoY (50-quarter high); Gross Margin expands +600 bps and PAT surges +31% YoY',
      thesisChain: [
        'Q2 FY27 delivered blowout domestic volume growth (+10% YoY, highest in 50 quarters / 12.5 years) with consolidated revenue up +13% YoY to ₹2,845 Cr',
        'Consolidated gross margin expanded by +600 bps YoY, while EBITDA jumped +27% YoY with +200 bps margin expansion (highest in 51 quarters) despite +44% brand A&P reinvestment',
        'Massive ₹316.11 Cr delivery buying locked the stock at its +10.00% upper circuit, confirming major buy-side re-rating of FMCG compounding',
      ],
      why: {
        text: 'Blockbuster Q2 FY27 results filed 02-Nov: Domestic volume growth accelerated to +10% YoY (highest in 50 quarters), Gross margin expanded +600 bps, EBITDA jumped +27% YoY with +200 bps margin expansion (highest in 51 quarters), and PAT surged +31% YoY.',
        basis: 'filing',
        sources: [
          'Q2 FY27 Information Update 02-Nov-2026',
          'NSE/BSE Financial Results 02-Nov-2026',
        ],
      },
      epsThesis: getBrief('NSE:MARICO'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+25-30% FY27 EPS revision',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings_beat', 'volume_growth', 'margin_expansion', 'fmcg'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/p1zml1227jbr511iyl665szi.pdf',
    },
    'NSE:TEMPSENS': {
      tier: 'ACT',
      headline:
        'Q2 Standalone & Consolidated results confirm operating turnaround in industrial temperature sensors; ₹67.76 Cr delivery',
      thesisChain: [
        'Q2 FY27 financial results show operating recovery and margin inflection in precision temperature sensors and thermal instrumentation',
        'Heavy institutional delivery buying of ₹67.76 Cr (11.11% deliv, 1.46% of Mcap) confirms institutional accumulation',
        'Industrial automation and green energy capex demand unlock multi-quarter order conversion',
      ],
      why: {
        text: 'Q2 FY27 financial results filed 30-Oct (4 days ago); revenue and operating turnaround in industrial temperature sensors and thermal instrumentation supported by ₹67.76 Cr delivery buying.',
        basis: 'filing',
        sources: ['NSE/BSE Regulation 33 Filing 30-Oct-2026'],
      },
      epsThesis: getBrief('NSE:TEMPSENS'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+15-20% margin expansion',
        timeline: 'FY27-28',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['results', 'capital_goods', 'sensors', 'industrial_capex'],
      pdfUrl: null,
    },
    'NSE:NELCAST': {
      tier: 'ACT',
      headline:
        'Commercial vehicle and tractor casting volume inflection + export commercialization; stock rallies +14.18% on ₹32.39 Cr deliv',
      thesisChain: [
        'Q2 FY27 financial results and press release filed 02-Nov demonstrate commercial vehicle and farm equipment casting recovery',
        'New export machining capacity commissioning expands blended realizations and margin profile',
        'Substantial cash commitment of ₹32.39 Cr (16.96% deliv, 2.27% of Mcap) drives +14.18% breakout',
      ],
      why: {
        text: 'Q2 FY27 financial results and press release filed 02-Nov: Recovery in commercial vehicle and tractor casting volumes, paired with new export capacity commissioning.',
        basis: 'filing',
        sources: ['NSE/BSE Regulation 30 & 33 Filings 02-Nov-2026'],
      },
      epsThesis: getBrief('NSE:NELCAST'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+20-25% PAT recovery',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['results', 'auto_components', 'castings', 'capacity_commissioning'],
      pdfUrl: null,
    },

    // -------------------------------------------------------------
    // WATCH CARDS (Compact layout)
    // -------------------------------------------------------------
    'NSE:MCX': {
      tier: 'WATCH',
      headline:
        'Pre-results accumulation into Q2 FY27 Board Meeting (03-Nov); #1 market-wide delivery of ₹624.04 Cr on peak options ADTV',
      why: {
        text: 'Q2 FY27 financial results board meeting scheduled for today (03-Nov-2026); record gold and silver commodity derivatives ADTV and software cost rationalization post-TCS migration drive institutional accumulation.',
        basis: 'pre_result',
        sources: [
          'BSE/NSE Board Meeting Intimation 13-Oct-2026',
          'Conference Call Intimation 22-Oct-2026',
        ],
      },
      epsThesis: getBrief('NSE:MCX'),
      linkage: 'explained',
      tags: ['pre_result', 'derivatives', 'market_infrastructure', 'monopoly'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/5qagqy6ytzd0m0xet2csea1r.pdf',
    },
    'NSE:CARTRADE': {
      tier: 'WATCH',
      headline:
        'Record Q2 revenue (₹213 Cr) and EBITDA (₹76 Cr, 36% margin); OLX India EBITDA zooms +36% YoY on 96% organic traffic',
      why: {
        text: 'Highest-ever quarterly revenue of ₹213 Cr (+10% YoY) and EBITDA jump of +20% YoY to ₹76 Cr (36% margin) filed 28-Oct (6d ago), powered by OLX India EBITDA zooming +36% YoY; delivery volume accelerating into multi-quarter operating leverage.',
        basis: 'filing',
        sources: ['NSE/BSE Press Release 28-Oct-2026', 'Q2 FY27 Financial Results'],
      },
      epsThesis: getBrief('NSE:CARTRADE'),
      linkage: 'explained',
      tags: ['earnings_record', 'platform', 'olx_synergies', 'operating_leverage'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/6qgfndowwnr8du63tegtdj8l.pdf',
    },
    'NSE:TECHNOCRAF': {
      tier: 'WATCH',
      headline:
        'Rallies +13.28% on ₹50.81 Cr delivery (2.53% of Mcap); global scaffolding & drum closure export demand',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; move backed by industrial scaffolding export demand and high delivery accumulation (₹50.81 Cr, 2.53% of Mcap).',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      epsThesis: getBrief('NSE:TECHNOCRAF'),
      linkage: 'unexplained',
      tags: ['scaffolding', 'exports', 'precision_engineering'],
      pdfUrl: null,
    },
    'NSE:BALRAMCHIN': {
      tier: 'WATCH',
      headline:
        'Pre-results accumulation (+9.15%, ₹40.94 Cr deliv) ahead of Q2 Board Meeting; ethanol blending procurement tailwinds',
      why: {
        text: 'Pre-results accumulation ahead of upcoming Q2 FY27 financial results board meeting, supported by favorable policy tailwinds in ethanol blending pricing and sugar distillery capacities.',
        basis: 'pre_result',
        sources: ['NSE/BSE Filings 14d'],
      },
      epsThesis: getBrief('NSE:BALRAMCHIN'),
      linkage: 'explained',
      tags: ['pre_result', 'sugar', 'ethanol', 'policy_tailwinds'],
      pdfUrl: null,
    },
    'NSE:KRBL': {
      tier: 'WATCH',
      headline:
        'Q2 results beat + SAST Reg 29(1) institutional stake acquisition; Basmati minimum export price floor removal',
      why: {
        text: 'Q2 FY27 financial results filed 02-Nov and SAST Reg 29(1) stake disclosure filed 03-Nov; export margin recovery driven by removal of Basmati minimum export price floor.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 02-Nov & 03-Nov-2026'],
      },
      epsThesis: getBrief('NSE:KRBL'),
      linkage: 'explained',
      tags: ['results', 'sast_stake_change', 'basmati_export', 'fmcg'],
      pdfUrl: null,
    },
    'NSE:FUSION': {
      tier: 'WATCH',
      headline:
        'Q2 results and Rights Issue monitoring report confirm capital adequacy buffer and credit provision stabilization',
      why: {
        text: 'Q2 FY27 results and investor presentation filed 02-Nov: Rights issue proceeds deployment confirmed by monitoring report, bolstering capital adequacy and credit loss stabilization.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 02-Nov-2026'],
      },
      epsThesis: getBrief('NSE:FUSION'),
      linkage: 'explained',
      tags: ['results', 'rights_issue', 'mfi', 'capital_buffer'],
      pdfUrl: null,
    },
    'NSE:TRIDENT': {
      tier: 'WATCH',
      headline:
        'Board approves Capacity Expansion and Modernization Project alongside Q2 results; ₹30.15 Cr delivery',
      why: {
        text: 'Board approval of Capacity Expansion and Modernization Project filed 02-Nov alongside Q2 FY27 financial results; expanding high-margin value-added textile and yarn capacities.',
        basis: 'filing',
        sources: ['NSE/BSE Regulation 30 & 33 Filings 02-Nov-2026'],
      },
      epsThesis: getBrief('NSE:TRIDENT'),
      linkage: 'explained',
      tags: ['capacity_expansion', 'capex', 'results', 'textiles'],
      pdfUrl: null,
    },
    'NSE:SHAREINDIA': {
      tier: 'WATCH',
      headline:
        'Update on Scheme of Amalgamation filed 03-Nov following Q2 FY27 Results & 2nd Interim Dividend',
      why: {
        text: 'Update on Scheme of Amalgamation filed 03-Nov following Q2 FY27 results and 2nd Interim Dividend declaration on 30-Oct; expanding prop trading and retail client franchise.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 30-Oct & 03-Nov-2026'],
      },
      linkage: 'explained',
      tags: ['amalgamation', 'results', 'dividend', 'capital_markets'],
      pdfUrl: null,
    },
    'NSE:MPIMANIPAL': {
      tier: 'WATCH',
      headline:
        'Q2 FY27 results filed 03-Nov on high-conviction 48.07% delivery (₹17.25 Cr); banking card & secure ID demand',
      why: {
        text: 'Q2 FY27 financial results filed 03-Nov (today); high-conviction delivery (48.07%, ₹17.25 Cr) reflecting payment solutions and secure ID contract deliveries.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 03-Nov-2026'],
      },
      linkage: 'explained',
      tags: ['results', 'smartcards', 'payments', 'delivery_backed'],
      pdfUrl: null,
    },
    'BSE:CNCRD': {
      tier: 'WATCH',
      headline:
        'Q2 results filed 02-Nov confirm railway electrical order execution; extraordinary 80.61% delivery percentage',
      why: {
        text: 'Q2 FY27 financial results and press release filed 02-Nov; exceptional 80.61% delivery backed by Indian Railways and metro rolling stock order deliveries.',
        basis: 'filing',
        sources: ['BSE Filing 02-Nov-2026'],
      },
      linkage: 'explained',
      tags: ['railways', 'results', 'high_delivery', 'order_execution'],
      pdfUrl: null,
    },
    'BSE:AERPACE': {
      tier: 'WATCH',
      headline:
        'Board meeting outcome filed 03-Nov without prior intimation; upper circuit (+19.56%) on 72.29% delivery',
      why: {
        text: 'Board meeting outcome filed 03-Nov (today); strong retail/HNI accumulation with 72.29% delivery value (₹10.54 Cr).',
        basis: 'filing',
        sources: ['BSE Filing 03-Nov-2026'],
      },
      linkage: 'explained',
      tags: ['board_outcome', 'circuit', 'high_delivery'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/lqjrp7f81geu21riad8zccl4.pdf',
    },
    'NSE:OSELDEVICE': {
      tier: 'WATCH',
      headline: 'Rallies +13.00% on price momentum; commercial LED display solutions',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; move driven by price momentum in specialized electronics.',
        basis: 'none',
        sources: ['NSE/BSE Filings 14d'],
      },
      linkage: 'unexplained',
      tags: ['electronics', 'momentum'],
      pdfUrl: null,
    },

    // -------------------------------------------------------------
    // NOTED CARDS
    // -------------------------------------------------------------
    'NSE:KITEX': {
      tier: 'NOTED',
      headline:
        'Q2 results filed 02-Nov (+15.08%, ₹18.00 Cr deliv); Telangana infant-wear capacity ramp-up',
      why: {
        text: 'Q2 FY27 financial results filed 02-Nov; strong shipment ramp-up from newly commissioned Telangana manufacturing facility.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 02-Nov-2026'],
      },
      linkage: 'explained',
    },
    'NSE:IZMO': {
      tier: 'NOTED',
      headline:
        'Press release filed 03-Nov (+16.64%, ₹16.81 Cr deliv); Indigenous Pitch Detector for Defence Avionics qualified',
      why: {
        text: 'Press release filed 03-Nov (today): Subsidiary izmo microsystems successfully developed and qualified Indigenous Pitch Detector for Defence Avionics, opening high-margin defense aerospace supply chain opportunities.',
        basis: 'filing',
        sources: ['NSE/BSE Press Release 03-Nov-2026'],
      },
      linkage: 'explained',
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/126dp0w3q5fj4w6szh8nnmpe.pdf',
    },
    'NSE:GOCOLORS': {
      tier: 'NOTED',
      headline:
        'Q2 results filed 30-Oct (+8.74%, ₹11.42 Cr deliv); festive retail restock and store expansion',
      why: {
        text: 'Q2 FY27 financial results filed 30-Oct (4d ago); festive seasonal retail restock and store expansion across EBO network.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 30-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:SHREEPUSHK': {
      tier: 'NOTED',
      headline:
        'Board approves Preferential Issue of Convertible Warrants + Q2 Results (+9.33%, ₹10.00 Cr deliv)',
      why: {
        text: 'Board approval of Preferential Issue of Fully Convertible Warrants and increase in authorised share capital filed 02-Nov alongside Q2 FY27 results.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 02-Nov-2026'],
      },
      linkage: 'explained',
    },
    'NSE:MOLDTKPAC': {
      tier: 'NOTED',
      headline:
        'Q2 results & PR filed 02-Nov (+8.03%, ₹6.47 Cr deliv); volume recovery in specialized pharma packaging',
      why: {
        text: 'Q2 FY27 financial results and press release filed 02-Nov; margin stability and volume recovery in specialized IML and pharma packaging.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 02-Nov-2026'],
      },
      linkage: 'explained',
    },
    'NSE:INFOBEAN': {
      tier: 'NOTED',
      headline:
        'Q2 results & PR filed 29-Oct (+7.37%, ₹5.01 Cr deliv); digital engineering contract signings',
      why: {
        text: 'Q2 FY27 financial results and press release filed 29-Oct (5d ago); digital engineering deal signings and utilization inflection.',
        basis: 'filing',
        sources: ['NSE/BSE Filings 29-Oct-2026'],
      },
      linkage: 'explained',
    },
    'NSE:APS': {
      tier: 'NOTED',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; solar module sector momentum.',
        basis: 'none',
        sources: ['NSE/BSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:DPEL': {
      tier: 'NOTED',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; power transformer and transmission component demand.',
        basis: 'none',
        sources: ['NSE/BSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:KRISHCA': {
      tier: 'NOTED',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; industrial packaging volume recovery.',
        basis: 'none',
        sources: ['NSE/BSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:TECHD': {
      tier: 'NOTED',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; momentum in enterprise security solutions.',
        basis: 'none',
        sources: ['NSE/BSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
    'NSE:VMARCIND': {
      tier: 'NOTED',
      why: {
        text: 'No regulatory filing in 14-day exchange filings; power grid capex cable demand.',
        basis: 'none',
        sources: ['NSE/BSE Filings 14d'],
      },
      linkage: 'unexplained',
    },
  },
};

// 4. Assemble Stats Footer
const stats = {
  universe: 50,
  qualified: 26,
  act: 3,
  watch: 12,
  noted: 11,
  researched: 20,
  extractHits: 0,
  pdfReads: 20,
  epsBriefs: 10,
  briefCacheHits: 1,
  briefExtractHits: 0,
  fullReports: 3,
  reportCacheHits: 0,
  contentClassified: 127,
  contentFromExtractCache: 0,
  contentFromLiveFetch: 127,
  contentFetchFailed: 0,
  watchlistTtlAdded: 26,
  watchlistTtlRemoved: 0,
  watchlistTtlActiveAfter: 26,
};

// Write files to /tmp
const contentPath = `/tmp/gainers_content_${marketDate.replace(/-/g, '')}.json`;
const statsPath = `/tmp/gainers_stats_${marketDate.replace(/-/g, '')}.json`;

fs.writeFileSync(contentPath, JSON.stringify(content, null, 2));
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log(`[composeGainersContent] ✅ Written overlay to ${contentPath}`);
console.log(`[composeGainersContent] ✅ Written stats to ${statsPath}`);
