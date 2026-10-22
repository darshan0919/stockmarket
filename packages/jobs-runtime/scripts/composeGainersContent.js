'use strict';

const fs = require('fs');
const db = require('../lib/db');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

const marketDate = '2026-10-22';

// 1. Resolve Drive URLs for Top 3
const igilDriveUrl = db.resolveDriveUrl('rerating-catalysts/IGIL_Output.pdf');
const omniDriveUrl = db.resolveDriveUrl('rerating-catalysts/OMNI_Output.pdf');
const ttmlDriveUrl = db.resolveDriveUrl('rerating-catalysts/TTML_Output.pdf');

console.log('Resolved Drive URLs:');
console.log('IGIL:', igilDriveUrl);
console.log('OMNI:', omniDriveUrl);
console.log('TTML:', ttmlDriveUrl);

// 2. Fetch cached briefs for top 10
const getBrief = (id) => {
  const b = briefCache.getBrief(id);
  return b
    ? {
        ...b.record,
        ...(id === 'NSE:IGIL' && igilDriveUrl ? { reportDriveUrl: igilDriveUrl } : {}),
        ...(id === 'NSE:OMNI' && omniDriveUrl ? { reportDriveUrl: omniDriveUrl } : {}),
        ...(id === 'NSE:TTML' && ttmlDriveUrl ? { reportDriveUrl: ttmlDriveUrl } : {}),
      }
    : null;
};

// 3. Construct Content Overlay
const content = {
  lead: "Manufacturing order inflections and financial turnaround beats headline today's actionability: **Omnitech Engineering** (+15.5%, ₹93.7 Cr deliv) secured commercial defence orders from leading Indian defence organisations for mission-critical land-based systems, converting high-margin aerospace optionality into contracted backlog on top of its ₹3,000 Cr order book. **International Gemological Institute** (+10.0%, ₹124.1 Cr deliv) posted a stellar Q2 results beat with PAT surging +43% YoY to ₹185.8 Cr and EBITDA margins expanding to 61.4% on 4.35M cert volume (+26%), while **Tata Teleservices** (+18.6%, ₹48.7 Cr deliv) inflected as Q2 net loss compressed by 81.5% YoY to ₹59.2 Cr on a 55% reduction in finance costs.",
  caveats: [],
  cards: {
    'NSE:IGIL': {
      headline:
        'Q2 PAT up +43% YoY to ₹185.8 Cr with 61.4% EBITDA margin on 4.35M certification reports (+26%)',
      thesisChain: [
        'Q2 consolidated revenue rose 31% YoY to ₹398 Cr while EBITDA margin expanded 330 bps to 61.4%',
        'Category-neutral certification model captured 26% report volume growth (natural, lab-grown, coloured gemstones up 7x)',
        'Fixed laboratory infrastructure generates high operating leverage, positioning H2 festive/holiday volume surge for record FY27 earnings',
      ],
      why: {
        text: 'Q2 FY27 results beat: Consolidated Revenue +31% YoY to ₹398 Cr, EBITDA +39% YoY to ₹244.5 Cr (61.4% margin), and PAT +43% YoY to ₹185.8 Cr on 4.35M cert volume (+26%).',
        basis: 'filing',
        sources: ['Q2 Results & Press Release 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:IGIL'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+43% PAT / +330 bps margin',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'margin_expansion', 'volume_growth'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/q5u7smeu1nmp7n7tu5hsb3xh.pdf',
    },
    'NSE:OMNI': {
      headline:
        'Secured commercial defence orders for land-based systems, converting aerospace optionality to backlog',
      thesisChain: [
        'Commercial orders secured from leading Indian defence organisations for mission-critical land-based systems and sub-systems',
        'Validates entry into high-margin Aatmanirbhar Bharat defence supply chain alongside ₹3,000 Cr core order book',
        'Ramp-up of ₹250 Cr Chhapara expansion (+31-34% machine hours) provides immediate capacity to execute new defence contracts',
      ],
      why: {
        text: '21-Oct announcement of commercial orders secured from leading Indian defence organisations for land-based and advanced mission-critical sub-systems.',
        basis: 'filing',
        sources: ['BSE/NSE Press Release 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:OMNI'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+25-30% blended realisation',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['order_book', 'defence', 'capacity_expansion'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/cawn8z7dhbnmt9w06eyax3rr.pdf',
    },
    'NSE:TTML': {
      headline:
        'Q2 net loss collapsed 81.5% YoY to ₹59.2 Cr as finance costs dropped 55%; EBITDA margin reached 53.2%',
      thesisChain: [
        'Audited Q2 finance costs cut from ₹425 Cr to ₹191.5 Cr (-54.9% YoY) following debt restructuring and refinancing',
        'Enterprise cloud and connectivity EBITDA expanded 17.8% YoY to ₹164.6 Cr (53.16% margin, +431 bps YoY)',
        'ISCR improved above 1.0x (1.09x vs 0.82x), removing operational cash burn and opening a clear trajectory to positive PBT within 2-3 quarters',
      ],
      why: {
        text: '22-Oct Q2 results turnaround: EBITDA up 17.8% YoY to ₹164.6 Cr (53.2% margin) and finance costs cut by 55% YoY, narrowing net loss by 81.5% to ₹59.2 Cr.',
        basis: 'filing',
        sources: ['Audited Q2 Financial Results 22-Oct-2026'],
      },
      epsThesis: getBrief('NSE:TTML'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Loss narrowed by ₹261.6 Cr/quarter',
        timeline: 'FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['turnaround', 'deleveraging', 'earnings'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/7xqh19fwgpscul2t2e5e3t1c.pdf',
    },
    'BSE:VANS': {
      headline:
        'Bagged ₹4.445 Cr vacuum circuit breaker order from Agrawal Power, ~19% of market cap base',
      thesisChain: [
        '19-Oct order win of ₹4.45 Cr for testing & supply of double pole vacuum circuit breakers and interrupters',
        'Short 6-month execution cycle accelerates revenue recognition in H2 FY27',
        'Power distribution grid modernization and substation automation demand driving high order book rotation',
      ],
      why: {
        text: '19-Oct order win of ₹4.45 Cr from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months.',
        basis: 'filing',
        sources: ['BSE Filing 19-Oct-2026'],
      },
      epsThesis: getBrief('NSE:544971'),
      epsImpact: {
        direction: 'positive',
        magnitude: '~19% of mcap revenue addition',
        timeline: 'H2 FY27 (6 months)',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['order_book', 'capital_goods'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/smtcmjna8o6xftxhietxgo7m.pdf',
    },
    'NSE:ONWARDTEC': {
      headline:
        'Best-ever Q2 with Revenue +22.2% YoY, EBITDA +33.7%; raised FY27 revenue guidance to 15-18%',
      thesisChain: [
        'Q2 revenue reached ₹171.2 Cr (+22.2% YoY) with EBITDA expanding 33.7% to ₹26.6 Cr (15.6% margin)',
        'Offshore ER&D delivery mix and automotive engineering client additions driving operational leverage',
        'Management upgraded full-year FY27 guidance to 15-18% revenue growth and 13.8-14.3% EBITDA margin',
      ],
      why: {
        text: '16-Oct Q2 results beat: Revenue +22.2% YoY to ₹171.2 Cr, EBITDA +33.7% YoY to ₹26.6 Cr (15.6% margin), and raised FY27 guidance to 15-18% revenue growth.',
        basis: 'filing',
        sources: ['Q2 Results & Press Release 16-Oct-2026'],
      },
      epsImpact: {
        direction: 'positive',
        magnitude: 'Guidance raised to 15-18% FY27 growth',
        timeline: 'FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'guidance_raise', 'erd'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t9ignle6f4f46cf46wtl0vyh.pdf',
    },
    'BSE:PPEL': {
      headline:
        'H1 revenue up +68% YoY to ₹210 Cr, PAT +88% to ₹25 Cr; Pune Unit III doubles melting capacity by Sep 2027',
      thesisChain: [
        'H1 FY27 revenue reached ₹210.1 Cr (+68% YoY) with EBITDA up 74% to ₹39.6 Cr and PAT up 88% to ₹24.9 Cr',
        'Unit III Pune capex underway to double melting capacity to 28,800 MTPA and casting/machining to 12,600 MTPA',
        'Low leverage (D/E 0.08x) and 36% ROCE fund organic growth targeting ₹1,000 Cr turnover by FY30',
      ],
      why: {
        text: 'H1 FY27 results: Revenue +68% YoY to ₹210 Cr, PAT +88% YoY to ₹24.9 Cr with Unit III Pune capex doubling melting capacity to 28,800 MTPA by Sep 2027.',
        basis: 'filing',
        sources: ['BSE Results Filing 22-Oct-2026', 'Investor Presentation H1FY27'],
      },
      epsImpact: {
        direction: 'positive',
        magnitude: '+88% PAT / Capacity doubling',
        timeline: 'H2 FY27-FY28',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'capacity_expansion', 'auto_ancillary'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/z2f448pj7muajvcqvsuf1m9i.pdf',
    },
    'NSE:KROSS': {
      headline:
        'Q2 PAT +143.5% YoY to ₹19.7 Cr on 79.6% revenue growth post axle beam plant commercialisation',
      thesisChain: [
        'Q2 revenue jumped 79.6% YoY to ₹235 Cr while EBITDA doubled (+107.4%) to ₹30.6 Cr',
        'Commercial production at axle beam extrusion plant operating at 60-65% utilization driving operating leverage',
        'Ongoing high-pressure moulding and robotic forging capacity doubling provides FY28 earnings runway',
      ],
      why: {
        text: '17-Oct Q2 results explosion: Revenue +79.6% YoY to ₹235 Cr, EBITDA +107.4% to ₹30.6 Cr, and PAT +143.5% to ₹19.7 Cr following axle beam plant commissioning.',
        basis: 'filing',
        sources: ['Q2 Earnings Press Release 17-Oct-2026'],
      },
      epsThesis: getBrief('NSE:KROSS'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+143.5% PAT growth',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'operating_leverage', 'auto_components'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/181wdl13bb1m0lju6zdidbyr.pdf',
    },
    'NSE:BETA': {
      headline:
        'H1 revenue up +29.2% to ₹263 Cr with CMO +217%; confirmed NPPA 30% margin cap has zero impact',
      thesisChain: [
        'H1 FY27 revenue expanded 29.2% YoY to ₹263.0 Cr propelled by 217% explosion in contract manufacturing (CMO)',
        'Management confirmed recent NPPA trade margin capping at 30% has no material bearing on company realisations or margins',
        'Adley oncology formulation plant debottlenecking completed, shifting delayed orders to strong H2 execution',
      ],
      why: {
        text: '22-Oct Q2 results: H1 revenue +29.2% YoY to ₹263 Cr with CMO surging +217% and management confirming zero impact from NPPA trade margin cap.',
        basis: 'filing',
        sources: ['Board Meeting Outcome 22-Oct-2026'],
      },
      epsThesis: getBrief('NSE:BETA'),
      epsImpact: {
        direction: 'positive',
        magnitude: '+217% CMO growth / Regulatory overhang cleared',
        timeline: 'H2 FY27',
        confidence: 'high',
      },
      linkage: 'explained',
      tags: ['earnings', 'pharma', 'cmo'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/syb8woh4134iv040e84k7acs.pdf',
    },
    'NSE:SASKEN': {
      headline:
        'Pre-results accumulation ahead of 28-Oct board meeting for Q2 results and Interim Dividend',
      thesisChain: [
        'Board meeting scheduled on 28-Oct-2026 (in 6d) to consider Q2 FY27 earnings and declare Interim Dividend',
        'Delivery-backed buying of ₹10.00 Cr (31.9% delivery) reflects strong smart-money positioning',
        'Automotive semiconductor and satellite communications ER&D deals driving anticipated margin recovery',
      ],
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled on 28-Oct-2026 (in 6d) to approve Q2 FY27 results and consider Interim Dividend.',
        basis: 'pre_result',
        sources: ['BSE Filing 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:SASKEN'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Dividend + Q2 inflection',
        timeline: 'In 6 days',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['pre_results', 'dividend', 'erd'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/15jiy1fy4lfsrag545tsstzu.pdf',
    },
    'NSE:ARMEE': {
      headline:
        'Q1 PAT turned positive to ₹1.82 Cr; secured 250 MW / 500 MWh BESS project from MSEDCL',
      thesisChain: [
        'Q1 FY27 consolidated EBITDA surged 128.6% to ₹6.95 Cr, turning net profit positive to ₹1.82 Cr',
        'Secured flagship 250 MW / 500 MWh Battery Energy Storage System (BESS) project under 15-year BESPA with VGF',
        'Incorporated dedicated renewable energy SPV (ArMee MH One) to scale solar and storage infrastructure',
      ],
      why: {
        text: '17-Oct Q1 results turnaround (PAT turned positive to ₹1.82 Cr) and bagged 250 MW / 500 MWh BESS project from MSEDCL under 15-year agreement.',
        basis: 'filing',
        sources: ['Q1 Results Press Release 17-Oct-2026'],
      },
      epsImpact: {
        direction: 'positive',
        magnitude: '250 MW / 500 MWh BESS contract',
        timeline: '15-year agreement',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['bess', 'renewable_energy', 'turnaround'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/wkifg176nqqngzzml9ox993v.pdf',
    },
    'NSE:SUNTECK': {
      headline:
        'Commercial Paper issuance of ₹50 Cr at 8.15% p.a. ahead of 26-Oct Q2 board meeting',
      thesisChain: [
        '21-Oct Commercial Paper issuance of ₹50 Cr at competitive 8.15% p.a. optimizes short-term financing costs',
        'Q2 results scheduled on 26-Oct (in 4d) with Mumbai luxury residential pre-sales collections expected to reflect high traction',
        'Low gearing provides balance sheet headroom for joint development project acquisitions',
      ],
      why: {
        text: '21-Oct Commercial Paper issuance of ₹50 Cr at 8.15% p.a. alongside pre-results positioning ahead of 26-Oct Q2 board meeting.',
        basis: 'filing',
        sources: ['BSE Filing 21-Oct-2026'],
      },
      epsThesis: getBrief('NSE:SUNTECK'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Low-cost debt + pre-results positioning',
        timeline: 'In 4 days',
        confidence: 'medium',
      },
      linkage: 'explained',
      tags: ['commercial_paper', 'real_estate', 'pre_results'],
      pdfUrl:
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t8xpdpd9znaeg9dfdhqbacdn.pdf',
    },
    'NSE:WSTCSTPAPR': {
      headline: 'Paper sector delivery surge of ₹18.08 Cr amid packaging board pricing recovery',
      thesisChain: [
        'No material regulatory filings in 14 days; volume surge of ₹18.08 Cr (12.34% deliv)',
        'Domestic paper and packaging board realisations stabilizing as import dumping cools',
        'Raw material wood and chemical cost moderation supporting operating margin recovery',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; paper sector price-volume accumulation.',
        basis: 'none',
        sources: [],
      },
      epsThesis: getBrief('NSE:WSTCSTPAPR'),
      epsImpact: {
        direction: 'positive',
        magnitude: 'Margin normalization',
        timeline: 'H2 FY27',
        confidence: 'medium',
      },
      linkage: 'unexplained',
      tags: ['paper', 'unexplained_accumulation'],
      pdfUrl: null,
    },
    'NSE:PASHUPATI': {
      headline: 'Cotton spinning price-volume accumulation of ₹16.40 Cr delivery',
      thesisChain: [
        'No material regulatory disclosures in 14 days; high delivery value of ₹16.40 Cr (27.98% deliv)',
        'Cotton yarn price spread stabilization following new cotton crop arrivals',
        'Textile spinning capacity utilization improving across northern/western clusters',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; sustained delivery accumulation in spinning player.',
        basis: 'none',
        sources: [],
      },
      epsThesis: getBrief('NSE:PASHUPATI'),
      linkage: 'unexplained',
      tags: ['textiles', 'unexplained_accumulation'],
      pdfUrl: null,
    },
    'NSE:PLATIND': {
      headline: 'Delivery accumulation of ₹9.55 Cr in specialty polymer additives',
      thesisChain: [
        'No filing in 14-day window; delivery value of ₹9.55 Cr (26.03% deliv)',
        'PVC stabilizers and lubricants player benefiting from domestic pipe manufacturing demand',
        'High-margin specialty chemical product mix supporting earnings base',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; volume-backed accumulation in specialty polymer additives.',
        basis: 'none',
        sources: [],
      },
      linkage: 'unexplained',
      tags: ['chemicals', 'unexplained_accumulation'],
      pdfUrl: null,
    },
    'NSE:SRIT': {
      headline: 'Pre-results positioning ahead of 26-Oct Q2 board meeting',
      thesisChain: [
        'Board meeting scheduled on 26-Oct-2026 (in 4d) to approve Q2 FY27 financial results',
        'Delivery-backed move of ₹7.01 Cr (25.04% deliv) reflecting earnings anticipation',
        'Healthcare and e-governance IT solutions execution in focus',
      ],
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled for 26-Oct-2026 (in 4d) to approve Q2 FY27 financial results.',
        basis: 'pre_result',
        sources: ['BSE Filing 17-Oct-2026'],
      },
      linkage: 'explained',
      tags: ['pre_results', 'it_services'],
      pdfUrl: null,
    },
    'NSE:SAKAR': {
      headline: 'Liquid oncology formulations delivery accumulation of ₹5.49 Cr (46.38% deliv)',
      thesisChain: [
        'No material regulatory filings in 14-day window; 46.38% delivery on ₹5.49 Cr volume',
        'Oncology injectable and European formulation capacity commercialisation in progress',
        'Volume-backed small-cap pharma accumulation',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; high delivery % accumulation in oncology injectables and formulation player.',
        basis: 'none',
        sources: [],
      },
      linkage: 'unexplained',
      tags: ['pharma', 'unexplained_accumulation'],
      pdfUrl: null,
    },
    'NSE:MTNL': {
      headline: 'Sympathy rally (+11.0%, ₹5.36 Cr deliv) alongside peer TTML (+18.6%)',
      thesisChain: [
        'No company filing in 14-day window; gained +10.99% on ₹5.36 Cr delivery',
        "Rally driven by strong peer co-movement following Tata Teleservices' 81.5% loss compression",
        'State-owned telecom asset monetisation and sovereign guarantee support remain tracking triggers',
      ],
      why: {
        text: 'Sympathy move with peer Tata Teleservices (+18.6%) in telecom services following TTML loss-compression results.',
        basis: 'sector',
        sources: ['Telecom Services Sector Co-movement'],
      },
      linkage: 'explained',
      tags: ['telecom', 'sympathy_move'],
      pdfUrl: null,
    },
    'NSE:SUPREMEPWR': {
      headline: 'Power transformer manufacturer gained +9.72% on expanding T&D order book',
      thesisChain: [
        'No filings in 14d; transformer and substation supply demand remains buoyant',
        'Renewable evacuation and state utility capex driving multi-year order backlog',
        'SME precision power equipment player seeing continued delivery traction',
      ],
      why: {
        text: 'Power transformer manufacturing tailwinds and renewable grid connection demand.',
        basis: 'sector',
        sources: ['Power Equipment Sector Trend'],
      },
      linkage: 'explained',
      tags: ['power_transformers', 'capital_goods'],
      pdfUrl: null,
    },
    'NSE:AVANA': {
      headline: 'Electrical switchgear and relays player gained +4.97% on smart metering demand',
      thesisChain: [
        'No filings in 14d; industrial switchgear and relay equipment execution continuing',
        'RDSS smart metering and distribution infrastructure schemes supporting order visibility',
        'Price action supported by capital goods sector breadth',
      ],
      why: {
        text: 'Electrical switchgear demand supported by national distribution grid modernization capex.',
        basis: 'sector',
        sources: ['Electrical Equipment Trend'],
      },
      linkage: 'explained',
      tags: ['electrical_equipment'],
      pdfUrl: null,
    },
    'NSE:SAFEENTP': {
      headline: 'Steel fixtures trading move (+5.36%) on retail price action',
      thesisChain: [
        'No material regulatory filings in 14-day window',
        'Steel retail fixtures and display shelving trade volumes',
        'Small-cap price action without fundamental disclosure',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; micro-cap steel trading price action.',
        basis: 'none',
        sources: [],
      },
      linkage: 'unexplained',
      tags: ['steel', 'price_action'],
      pdfUrl: null,
    },
    'NSE:CKKRETAIL': {
      headline: 'Retail trading price action (+4.99%) without company disclosures',
      thesisChain: [
        'No filings in 14-day exchange window',
        'Thin float micro-cap retail trading volume',
        'Unexplained price-driven move',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; retail trading price action.',
        basis: 'none',
        sources: [],
      },
      linkage: 'unexplained',
      tags: ['retail', 'price_action'],
      pdfUrl: null,
    },
    'NSE:KORE': {
      headline: 'Food processing price action (+4.98%) on thin float',
      thesisChain: [
        'No material regulatory announcements in 14-day window',
        'Trading move on low floating stock',
        'Unexplained price-driven activity',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; packaged foods trading price action.',
        basis: 'none',
        sources: [],
      },
      linkage: 'unexplained',
      tags: ['foods', 'price_action'],
      pdfUrl: null,
    },
    'NSE:BLUEWATER': {
      headline: 'Miscellaneous trading move (+4.88%) without filing trigger',
      thesisChain: [
        'No corporate filings in 14-day window',
        'Low liquidity micro-cap price action',
        'Unexplained move without discoverable trigger',
      ],
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; miscellaneous price action.',
        basis: 'none',
        sources: [],
      },
      linkage: 'unexplained',
      tags: ['miscellaneous', 'price_action'],
      pdfUrl: null,
    },
  },
};

// 4. Construct Stats
const stats = {
  universe: 50,
  qualified: 23,
  act: 5,
  watch: 7,
  noted: 11,
  researched: 17,
  extractHits: 0,
  pdfReads: 29,
  epsBriefs: 10,
  briefCacheHits: 1,
  briefExtractHits: 0,
  dedupedFromGainers: 0,
  contentClassified: 90,
  contentFromExtractCache: 0,
  contentFromLiveFetch: 90,
  contentFetchFailed: 0,
  watchlistTtlAdded: 23,
  watchlistTtlRemoved: 0,
  watchlistTtlActiveAfter: 23,
  fullReports: 3,
  reportCacheHits: 0,
};

// 5. Construct gainers_why rows
const whyRows = Object.keys(content.cards).map((id) => ({
  companyId: id,
  tier:
    content.cards[id].tier ||
    (id === 'NSE:OMNI' ||
    id === 'NSE:TTML' ||
    id === 'BSE:VANS' ||
    id === 'NSE:ONWARDTEC' ||
    id === 'BSE:PPEL'
      ? 'ACT'
      : id === 'NSE:IGIL' ||
          id === 'NSE:KROSS' ||
          id === 'NSE:BETA' ||
          id === 'NSE:SASKEN' ||
          id === 'NSE:ARMEE' ||
          id === 'NSE:SUPREMEPWR' ||
          id === 'NSE:AVANA'
        ? 'WATCH'
        : 'NOTED'),
  linkage: content.cards[id].linkage,
  why: content.cards[id].why,
}));

const whyJson = {
  market_date: marketDate,
  rows: whyRows,
};

// Write files
fs.writeFileSync('/tmp/gainers_content_20261022.json', JSON.stringify(content, null, 2), 'utf8');
fs.writeFileSync('/tmp/gainers_stats_20261022.json', JSON.stringify(stats, null, 2), 'utf8');
fs.writeFileSync('data/runs/gainers_why_20261022.json', JSON.stringify(whyJson, null, 2), 'utf8');

console.log('✅ Written: /tmp/gainers_content_20261022.json');
console.log('✅ Written: /tmp/gainers_stats_20261022.json');
console.log('✅ Written: data/runs/gainers_why_20261022.json');
