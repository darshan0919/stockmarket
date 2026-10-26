'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { createReratingCatalystsPdf } = require('@stock/api');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

async function main() {
  const modelUsed = 'gemini-2.5-pro';
  const marketDate = '2026-10-23';
  const outputDir = path.resolve(__dirname, '../../../data/rerating-catalysts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(
    '[generateTop3Reports] Starting generation of Top 3 full reports for ' + marketDate + '...'
  );

  // ==========================================
  // 1. FULL REPORT: NSE:ETERNAL
  // ==========================================
  const eternalDto = {
    company: 'Eternal Limited (formerly Zomato Limited)',
    ticker: 'NSE:ETERNAL',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Consolidated Results demonstrate sustained rapid scaling in Quick Commerce (Blinkit) under 1P inventory model, corporate restructuring via slump sale of Going-out India business to wholly owned subsidiary ZEPL to unlock operational synergies, strategic acquisition of 4.4% stake in merged Mygate/Adonmo entity valued at ₹156 Cr, and global launch roadmap for dark.ai enterprise AI sandbox.',
    reratingPhase: 'MID',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.45,
      operatingLeverage: 1.35,
      financialLeverage: 1.07,
      patGrowthYoY: 38.5,
    },
    snapshot:
      "Eternal Limited (formerly Zomato Limited) is India's dominant consumer-tech powerhouse spanning Food Delivery, Quick Commerce (Blinkit), B2B Supplies (Hyperpure), and Going-Out (ZEPL/District). Q2 FY27 highlighted major corporate restructuring with the slump sale transfer of Going-out to ZEPL, ambient digital advertising consolidation via Mygate-Adonmo (4.4% stake valued at ₹156 Cr), and the launch of dark.ai (privacy-first end-to-end encrypted AI platform).",
    kpiHeaders: [
      'Market Cap',
      'B2C Net Order Value',
      'Quick Commerce Growth',
      'Adj EBITDA Trend',
      'Dark.ai Launch',
      'Going-Out Entity',
      'Mygate Stake Value',
      '1D Delivery Value',
    ],
    kpiValues: [
      '₹2,21,800 Cr',
      'Accelerating YoY',
      '1P Model Scaling',
      'Expanding Margins',
      '2026 Global Rollout',
      'Consolidated in ZEPL',
      '₹156 Cr (~4.4%)',
      '₹722.61 Cr (42.1%)',
    ],
    catalysts: [
      {
        name: 'Quick Commerce (Blinkit) Operating Leverage Inflection & 1P Model Margin Capture',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Volume Inflection',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'Blinkit continues rapid store network expansion across metro and Tier-2 clusters. Transition to 1P inventory model captures full merchandise value and higher retail margins, compounding operating leverage across mature dark stores.',
        impact: 'Accelerated top-line expansion and dark store contribution margin expansion.',
        timeline: 'H2 FY27 festive and holiday ordering peaks',
        forwardMarker:
          'Continued store additions, festive order surge, and dark store breakeven inflection',
        sources: ['Q2 FY27 Shareholders Letter (21-Oct-2026)'],
      },
      {
        name: 'Corporate Restructuring: Consolidation of Going-Out Business into Subsidiary ZEPL',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Corporate Action / Structural Simplification',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Capability Expansion)',
        body: 'Board approved Business Transfer Agreement (BTA) to transfer Going-out India business to wholly owned subsidiary ZEPL via slump sale, consolidating TicketNew and Insider under a unified corporate entity to optimize management and capital allocation.',
        impact:
          'Streamlined corporate structure, eliminated entity friction, positioned District for dedicated monetization.',
        timeline: 'Q3-Q4 FY27 completion',
        forwardMarker: 'Execution of BTA and operational integration under ZEPL',
        sources: ['BSE/NSE Reg 30 Filings (21-Oct-2026)'],
      },
      {
        name: 'High-Margin Enterprise Tech Frontier: Global Rollout of dark.ai Privacy Platform',
        conviction: 'MEDIUM CONVICTION',
        newCategory: 'New Technology / Enterprise Expansion',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 1 (Emerging Frontier Option)',
        body: 'Unveiled dark.ai, an end-to-end encrypted, zero-data-retention AI assistant powered by fine-tuned open-weight models for power users, researchers, enterprises, and scientists, opening non-food software revenue optionality.',
        impact:
          'Expands global addressable market into enterprise privacy software with high SaaS gross margins.',
        timeline: '2026 global rollout',
        forwardMarker: 'Public benchmarks and global commercial launch',
        sources: ['Q2 FY27 Shareholders Letter Deepinder Commentary'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-21',
        title: 'Shareholders Letter & Financial Results for Q2 FY27',
        category: 'Results',
        impact: 'Strong Q2 growth, quick commerce 1P transition, and dark.ai platform unveiling',
        sources: 'NSE/BSE Regulation 30 Filings',
      },
      {
        date: '2026-10-21',
        title: 'Board Approves Transfer of Going-Out India Business to Subsidiary ZEPL',
        category: 'Corporate Action',
        impact: 'Slump sale consolidation of ticketing and dining business into ZEPL',
        sources: 'NSE/BSE Regulation 30 Filings',
      },
      {
        date: '2026-10-21',
        title: 'Strategic Stake Acquisition in Merged Mygate/Adonmo Entity',
        category: 'Strategic Investment',
        impact:
          'Transfer of Adonmo shares for 4.4% equity stake in merged Mygate valued at ₹156 Cr',
        sources: 'NSE/BSE Regulation 30 Filings',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-23',
        return1D: '+4.25%',
        volumeRatio: '2.4x',
        deliveryPct: '42.14%',
        trigger: 'Q2 FY27 Results, Going-out consolidation to ZEPL, and ₹156 Cr Mygate stake',
        corroboration: 'Massive ₹722.61 Cr delivery buying confirms heavy institutional commitment',
      },
    ],
    whatsInThePrice:
      'Consensus is modeling 35-40% quick commerce growth; market was discounting Going-out drag and underappreciating store-level contribution margin inflection and tech platform optionality.',
    superPerformanceZone:
      'Operating in Super Performance Zone: market leader across Food Delivery and Quick Commerce with expanding consolidated adjusted EBITDA and ₹722 Cr delivery conviction.',
    floatScarcity:
      'Large institutional holding base; ₹722.61 Cr delivery represents substantial daily cash allocation into large-cap consumer tech.',
    risks: [
      'Heightened competitive spending in quick commerce dark store expansion.',
      'Regulatory shifts concerning gig worker welfare mandates and platform fee caps.',
    ],
    exitProtocol:
      'SOIC 3-step exit rules: Trigger review on (1) Blinkit GOV growth dropping below 30% YoY, (2) food delivery adjusted EBITDA margin compressing, or (3) execution failure in ZEPL integration.',
    eventChainTheses: [
      {
        title: 'Quick Commerce 1P Margin Expansion + ZEPL Synergies → Earnings Inflection',
        archetype: 'Platform Monopoly Operating Leverage',
        confidence: 'GROUNDED',
        theme: 'Consumer Internet & Quick Commerce',
        subTheme: 'Quick Commerce Infrastructure',
        chain: [
          {
            basis: 'FACT',
            claim: 'Blinkit transitioning to 1P inventory model captures full merchandise margin',
            source: 'Q2 FY27 Shareholders Letter',
          },
          {
            basis: 'INFERENCE',
            claim: 'Dark store density in top metros reduces delivery cost per order below ₹30',
            source: 'Operational Metrics Analysis',
          },
          {
            basis: 'HYPOTHESIS',
            claim: 'Consolidated Adjusted EBITDA will expand above ₹2,500 Cr run-rate by FY28',
            source: 'SOIC Platform Scale Framework',
          },
        ],
        whyMarketPays:
          'Market pays a premier valuation multiple for consumer-tech leaders with defensible network effects and inflection into cash flow.',
        precedent:
          'Global consumer internet monopolies (Meituan, DoorDash) re-rating as quick commerce dark stores crossed unit profitability.',
        mustBeTrue: [
          'Quick commerce GOV sustains >40% YoY growth',
          'Dark store contribution margins remain positive and expanding',
        ],
        confirmKill: ['Monitor Q3 festive gross order values and monthly dark store additions'],
      },
    ],
    verdict:
      "STRONG ACCUMULATE: India's leading consumer platform demonstrating operating leverage across Blinkit, corporate restructuring in ZEPL, and ₹722 Cr delivery commitment.",
    additional: {
      strategicRestructuring: {
        'Going-Out Entity': 'ZEPL (Zomato Entertainment Pvt Ltd)',
        'Transaction Structure': 'Slump sale on going concern basis',
        'Entities Consolidated': 'ZEPL, Orbgen (TicketNew), Wasteland (Insider)',
        'Mygate Equity Stake': '~4.4% valued at ₹156 Cr',
      },
    },
  };

  const eternalPdfPath = path.join(outputDir, 'ETERNAL_Output.pdf');
  await createReratingCatalystsPdf(eternalDto, { outputPath: eternalPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${eternalPdfPath}`);

  // Save brief for ETERNAL
  const eternalBrief = {
    companyId: 'NSE:ETERNAL',
    jCurveTag: eternalDto.jCurveTag,
    jCurveReason: eternalDto.jCurveReason,
    reratingPhase: eternalDto.reratingPhase,
    spentFlags: eternalDto.spentFlags,
    thesis:
      'Consumer tech market leader demonstrates accelerating quick commerce scale with Blinkit 1P margin expansion, corporate restructuring via slump sale of Going-out to ZEPL, and ₹722 Cr institutional delivery.',
    catalysts: eternalDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['88q4p8vw26axrngxf5ukx6xk.pdf', '8w77ksx26qvzykfnf2hk2sty.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Shareholders Letter', 'NSE/BSE Corporate Filings 21-Oct-2026'],
  };
  briefCache.putBrief('NSE:ETERNAL', eternalBrief);

  // ==========================================
  // 2. FULL REPORT: NSE:CYIENT
  // ==========================================
  const cyientDto = {
    company: 'Cyient Limited',
    ticker: 'NSE:CYIENT',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Results beat with DET EBIT margin expanding to a 10-quarter high of 14.2% (EBIT +16.8% QoQ to ₹237 Cr), DET FCF surging to ₹214 Cr (139% FCF/PAT conversion), record $158.4M DET order intake (+20.8% YoY), Cyient Semiconductors growing for 6th straight quarter (+8% QoQ) with a $100M+ ASIC pipeline, and ₹12 interim dividend.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.38,
      operatingLeverage: 1.28,
      financialLeverage: 1.08,
      patGrowthYoY: 18.2,
    },
    snapshot:
      'Cyient Limited is a global engineering, digital, and technology solutions leader operating across Digital Engineering & Technology (DET), Cyient Semiconductors, and Cyient DLM. Q2 FY27 performance marked a clear inflection in operational profitability with DET EBIT margin reaching a 10-quarter peak of 14.2%, order intake up 20.8% YoY, and an expanding $100M+ turnkey ASIC pipeline.',
    kpiHeaders: [
      'Market Cap',
      'DET Q2 Revenue',
      'DET EBIT Margin',
      'DET Free Cash Flow',
      'FCF to PAT Conversion',
      'Order Intake Growth',
      'Cyient Semi Pipeline',
      'Interim Dividend',
    ],
    kpiValues: [
      '₹19,850 Cr',
      '₹1,664 Cr (+15.7% YoY)',
      '14.2% (10-Quarter High)',
      '₹214 Cr',
      '139%',
      '+20.8% YoY ($158.4M)',
      '$100M+ ASIC Pipeline',
      '₹12.00 per share',
    ],
    catalysts: [
      {
        name: 'EBIT Margin Inflection to 10-Quarter Peak (14.2%) & FCF Surging to ₹214 Cr',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Operational Leverage',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'Cyient DET EBIT expanded 16.8% QoQ to ₹237 Cr with margin reaching 14.2% (+110 bps expansion), driven by pricing discipline and high-value aerospace/defense project execution. FCF conversion reached 139% of PAT.',
        impact:
          '+16.8% QoQ EBIT expansion; ₹214 Cr FCF generation supporting ongoing capex and ₹12/share dividend.',
        timeline: 'H2 FY27 sustaining 14%+ margin trajectory',
        forwardMarker: 'Continued margin expansion toward 15% DET EBIT target in FY28',
        sources: ['Q2 FY27 Press Release (22-Oct-2026)'],
      },
      {
        name: 'Surge in DET Order Book to Record $158.4M Intake (+20.8% YoY)',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Order Win / Revenue Visibility',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Pipeline Acceleration)',
        body: 'Record quarterly order intake of $158.4M across aerospace, communications, and transport sectors provides multi-year revenue visibility. Cyient DLM order book exceeded 1.6x book-to-bill.',
        impact: '+20.8% YoY order book growth securing double-digit organic growth into FY28.',
        timeline: 'FY27-FY28 execution window',
        forwardMarker: 'Conversion of order intake into billable engineering milestones',
        sources: ['Q2 FY27 Financial Results & MD Commentary'],
      },
      {
        name: 'Semiconductor Unit Inflection: 6th Consecutive Quarter of Growth & $100M+ ASIC Pipeline',
        conviction: 'HIGH CONVICTION',
        newCategory: 'New Technology / Structural Market Share',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (High-Margin Value Add)',
        body: 'Cyient Semiconductors grew 8% QoQ for its 6th consecutive growth quarter, securing a major turnkey program with a global semiconductor leader. ASIC pipeline exceeded $100M alongside AI data-center power product R&D.',
        impact:
          'Accelerates corporate transition from engineering services to high-margin turnkey silicon IP and ASIC solutions.',
        timeline: 'Commercialization in FY28',
        forwardMarker:
          'Initial ASIC revenue recognition and data-center power product commercialization',
        sources: ['Q2 FY27 Earnings Release (22-Oct-2026)'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-22',
        title: 'Q2 FY27 Financial Results & Press Release',
        category: 'Results',
        impact:
          'DET EBIT margin at 10-quarter high of 14.2%, order intake $158.4M, interim dividend ₹12',
        sources: 'NSE/BSE Filings',
      },
      {
        date: '2026-10-22',
        title: 'Acquisition of Entire Stake in Subsidiary Company',
        category: 'Corporate Action',
        impact: 'Full consolidation of minority interest to streamline engineering capabilities',
        sources: 'NSE/BSE Filings',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-23',
        return1D: '+7.81%',
        volumeRatio: '2.8x',
        deliveryPct: '10.48%',
        trigger: 'Q2 FY27 EBIT margin 10-quarter high (14.2%), record $158.4M orders, ₹12 dividend',
        corroboration: 'Institutional delivery of ₹257.38 Cr confirms major post-earnings buying',
      },
    ],
    whatsInThePrice:
      'Market was pricing 12-13% subdued EBIT margins and sluggish tech discretionary spend; the 14.2% margin print, 139% FCF conversion, and $100M+ ASIC pipeline trigger an earnings upgrade cycle.',
    superPerformanceZone:
      'Operating in Super Performance Zone: DET EBIT margin expanding, record free cash flow generation, and strong balance sheet supporting ₹12 dividend.',
    floatScarcity:
      'Delivery buying of ₹257.38 Cr marks one of the heaviest accumulation sessions for Cyient in 2026.',
    risks: [
      'Two-phase wage hikes scheduled in Q3 and Q4 potentially exerting near-term margin pressure.',
      'Semiconductor supply chain constraints impacting hardware delivery timelines.',
    ],
    exitProtocol:
      'SOIC 3-step exit rules: Trigger exit on (1) DET EBIT margins falling back below 12.5%, (2) quarterly order intake declining below $120M, or (3) loss of key aerospace/telecom clients.',
    eventChainTheses: [
      {
        title: 'DET Margin Expansion + ASIC Semiconductor Scale → EPS Upgrade Cycle',
        archetype: 'Operating Leverage Turnaround',
        confidence: 'GROUNDED',
        theme: 'Engineering R&D Services',
        subTheme: 'Custom Silicon & Embedded Engineering',
        chain: [
          {
            basis: 'FACT',
            claim: 'Q2 DET EBIT margin expanded to 14.2% with ₹214 Cr free cash flow',
            source: 'Q2 FY27 Financial Results',
          },
          {
            basis: 'INFERENCE',
            claim:
              'Record $158.4M order intake and 1.6x DLM book-to-bill guarantee H2 revenue visibility',
            source: 'Management Commentary',
          },
          {
            basis: 'HYPOTHESIS',
            claim:
              'Turnkey ASIC programs will drive higher blended billing rates, expanding FY28 PAT toward ₹850 Cr',
            source: 'SOIC Operating Leverage Framework',
          },
        ],
        whyMarketPays:
          'Market re-rates ER&D players when margin expansion is backed by proprietary semiconductor IP and strong FCF conversion.',
        precedent:
          'ER&D peers (Tata Elxsi, KPIT Tech) re-rating from 25x to 45x P/E as margins crossed 14% with high automotive/semiconductor mix.',
        mustBeTrue: [
          'DET EBIT margins sustain above 14% post wage hikes',
          'ASIC pipeline converts into firm multi-year production orders',
        ],
        confirmKill: ['Monitor Q3 DET EBIT margin and H2 semiconductor revenue growth'],
      },
    ],
    verdict:
      'STRONG BUY: High-conviction ER&D leader inflecting profitability with 10-quarter high EBIT margin (14.2%), record order bookings, and ₹257 Cr institutional delivery.',
    additional: {
      segmentalPerformance: {
        'Cyient DET Revenue': '₹1,664 Cr (+15.7% YoY, +8.1% QoQ)',
        'Cyient DET EBIT': '₹237 Cr (+16.8% QoQ, 14.2% margin)',
        'Free Cash Flow (DET)': '₹214 Cr (139% of PAT)',
        'Order Intake': '$158.4 Mn (+20.8% YoY)',
        'Semiconductor Growth': '+8% QoQ (6th consecutive quarter)',
      },
    },
  };

  const cyientPdfPath = path.join(outputDir, 'CYIENT_Output.pdf');
  await createReratingCatalystsPdf(cyientDto, { outputPath: cyientPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${cyientPdfPath}`);

  // Save brief for CYIENT
  const cyientBrief = {
    companyId: 'NSE:CYIENT',
    jCurveTag: cyientDto.jCurveTag,
    jCurveReason: cyientDto.jCurveReason,
    reratingPhase: cyientDto.reratingPhase,
    spentFlags: cyientDto.spentFlags,
    thesis:
      'Global ER&D leader hits 10-quarter peak EBIT margin of 14.2% with ₹214 Cr free cash flow (139% FCF/PAT conversion), record $158.4M order bookings, and $100M+ ASIC pipeline backed by ₹257 Cr delivery.',
    catalysts: cyientDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['c2n5001rxh6679xt0h875yjm.pdf', '9q58pcylesbpn6rippacr6uq.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Press Release', 'Q2 FY27 Financial Results'],
  };
  briefCache.putBrief('NSE:CYIENT', cyientBrief);

  // ==========================================
  // 3. FULL REPORT: NSE:IGIL
  // ==========================================
  const igilDto = {
    company: 'International Gemological Institute Limited',
    ticker: 'NSE:IGIL',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Consolidated Results beat with Revenue +31% YoY to ₹398 Cr, EBITDA +39% YoY to ₹244.5 Cr (61.4% margin, +330 bps expansion), and PAT +43% YoY to ₹185.8 Cr on 4.35M cert volume (+26%). High combined operating leverage demonstrates category-neutral monopoly scale.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.39,
      operatingLeverage: 1.26,
      financialLeverage: 1.1,
      patGrowthYoY: 43.1,
    },
    snapshot:
      'International Gemological Institute Limited (Blackstone-backed) is the global and Indian leader in independent diamond and fine jewellery certification, commanding an estimated ~50% market share with 37 laboratories across 10 countries. The company operates a category-neutral certification model capturing demand across natural diamonds, lab-grown diamonds (LGD), coloured gemstones, and studded jewellery.',
    kpiHeaders: [
      'Market Cap',
      'Q2 Revenue',
      'Q2 EBITDA',
      'EBITDA Mgn',
      'Q2 PAT',
      'PAT Mgn',
      'H1 Revenue',
      'H1 PAT',
    ],
    kpiValues: [
      '₹18,450 Cr',
      '₹398.0 Cr (+31%)',
      '₹244.5 Cr (+39%)',
      '61.4% (+330 bps)',
      '₹185.8 Cr (+43%)',
      '46.7% (+390 bps)',
      '₹768.8 Cr (+27%)',
      '₹351.6 Cr (+37%)',
    ],
    catalysts: [
      {
        name: 'Operating Leverage Inflection on Surging Certification Volumes (4.35M reports in Q2, +26% YoY)',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Volume Inflection',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'IGI delivered 4.35 million certification reports in Q2 FY27 (+26% YoY) and 7.91 million in H1 FY27 (+22% YoY). Fixed laboratory footprint and automated screening drove EBITDA margins up 330 bps YoY to 61.4%, with PAT growing 43% YoY.',
        impact: '+43% PAT growth; EBITDA margin expanded from 58.1% to 61.4%',
        timeline: 'H2 FY27 festive and US holiday ordering cycle',
        forwardMarker:
          'Continued volume acceleration into Q3 festive peak in India and US retail holiday ramp-up',
        sources: ['Q2 FY27 Financial Results & Press Release (21-Oct-2026)'],
      },
      {
        name: 'Broadening Value Chain Beyond Diamonds into High-Margin Coloured Stones and Fine Jewellery',
        conviction: 'HIGH CONVICTION',
        newCategory: 'New Product / Mix Shift',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Capacity / Capability Expansion)',
        body: 'Growth drivers are diversifying rapidly: natural diamond jewellery certification up 3%, while coloured gemstones surged 7x YoY including AGL integration. Category-neutral positioning hedges against raw material price deflation.',
        impact:
          'Coloured stones volume up 7x YoY; blended realisations insulated from diamond price swings',
        timeline: 'FY27-FY28',
        forwardMarker: 'Integration of AGL and expansion across luxury branded jewellery houses',
        sources: ['Q2 FY27 Press Release MD Commentary'],
      },
      {
        name: 'Rapid Adoption of Lab-Grown Diamonds (LGD) Screening & Digital Verification',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Regulatory / Structural Shift',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 3 (Scale Monetisation)',
        body: 'Mass market adoption of LGD in US and India requires trusted third-party verification for consumer confidence. IGI screens millions of stones, creating sticky recurring verification fees from major retail chains.',
        impact: 'LGD report volume expanding at >35% CAGR',
        timeline: 'Ongoing through FY27-FY29',
        forwardMarker: 'B2B retailer tie-ups for mandatory POS certification',
        sources: ['Q2 FY27 Earnings Release'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-21',
        title: 'Outcome of Board Meeting & Press Release for Q2 FY27 Results',
        category: 'Results',
        impact:
          'Q2 Revenue +31%, EBITDA +39%, PAT +43% YoY; delivered 4.35 Mn certification reports',
        sources: 'NSE/BSE Regulation 30 & 33 Filings',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-23',
        return1D: '+7.91%',
        volumeRatio: '3.2x',
        deliveryPct: '20.63%',
        trigger: 'Continued institutional follow-through on Q2 results beat (+43% PAT)',
        corroboration:
          'Heavy delivery volume of ₹156.60 Cr confirms persistent institutional buying',
      },
    ],
    whatsInThePrice:
      'Consensus models 20-25% steady-state growth; the +43% profit acceleration and 61.4% margin milestone indicate market was underestimating operating leverage and coloured-stone volume expansion (up 7x).',
    superPerformanceZone:
      'Operating in Super Performance Zone: EBITDA margin >60%, ROE >35%, zero long-term debt, and 50% domestic certification market share.',
    floatScarcity:
      'Sponsor (Blackstone) and promoter lock-ins restrict free float; delivery-backed buying of ₹156.60 Cr represents substantial institutional float absorption.',
    risks: [
      'Slowdown in US luxury retail discretionary spending during holiday season.',
      'Potential regulatory changes in diamond grading standards across export destinations.',
    ],
    exitProtocol:
      'SOIC 3-step exit rules: Trigger exit on (1) certification volume growth decelerating below 12%, (2) EBITDA margin compressing below 52%, or (3) regulatory impairment of gemological accreditation.',
    eventChainTheses: [
      {
        title: 'LGD Adoption Boom + Coloured Stone 7x Surge → Structural Platform Monetisation',
        archetype: 'Operating Leverage Monopoly',
        confidence: 'GROUNDED',
        theme: 'Gemological Accreditation & Verification',
        subTheme: 'Category-Neutral Certification',
        chain: [
          {
            basis: 'FACT',
            claim:
              'Q2 certification volume expanded +26% YoY to 4.35 million reports with coloured stones up 7x',
            source: 'Q2 FY27 Press Release',
          },
          {
            basis: 'INFERENCE',
            claim:
              'Fixed automated grading laboratory costs yield incremental EBITDA margins above 70%',
            source: 'Financial Statements Analysis',
          },
          {
            basis: 'HYPOTHESIS',
            claim:
              'H2 FY27 festive and holiday volumes will drive FY27 PAT toward ₹800 Cr, demanding re-rating to luxury platform multiples',
            source: 'SOIC Operating Leverage Thesis',
          },
        ],
        whyMarketPays:
          'Market pays a premium multiple for capital-light, toll-booth monopolistic business models with 60%+ EBITDA margins and high ROE.',
        precedent:
          'Credit rating agencies and testing/inspection leaders (Bureau Veritas, SGS, CRISIL) re-rating from 30x to 55x P/E during volume inflection cycles.',
        mustBeTrue: [
          'Certification volume growth remains above 20% YoY',
          'EBITDA margins sustain above 60%',
        ],
        confirmKill: ['Monitor Q3 report volume disclosure and US jewellery retail sales data'],
      },
    ],
    verdict:
      'STRONG BUY / ACCUMULATE on breakout: Category-neutral monopoly leader demonstrating blistering operating leverage (+43% PAT, 61.4% EBITDA margin) with ₹156.6 Cr delivery backing.',
    additional: {
      volumeMetrics: {
        'Q2 FY27 Report Volume': '4.35 Million (+26% YoY)',
        'H1 FY27 Report Volume': '7.91 Million (+22% YoY)',
        'Coloured Gemstone Volume Growth': '7.0x YoY',
        'Natural Diamond Jewelry Growth': '+3.0% YoY',
      },
      marginInflection: {
        'Q2 FY26 EBITDA Margin': '58.1%',
        'Q2 FY27 EBITDA Margin': '61.4% (+330 bps)',
        'Q2 FY26 PAT Margin': '42.8%',
        'Q2 FY27 PAT Margin': '46.7% (+390 bps)',
      },
    },
  };

  const igilPdfPath = path.join(outputDir, 'IGIL_Output.pdf');
  await createReratingCatalystsPdf(igilDto, { outputPath: igilPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${igilPdfPath}`);

  // Save brief for IGIL
  const igilBrief = {
    companyId: 'NSE:IGIL',
    jCurveTag: igilDto.jCurveTag,
    jCurveReason: igilDto.jCurveReason,
    reratingPhase: igilDto.reratingPhase,
    spentFlags: igilDto.spentFlags,
    thesis:
      'Blackstone-backed category-neutral diamond certification leader demonstrates blistering operating leverage (+43% PAT, 61.4% EBITDA margin on 4.35M reports) with festive and holiday volume surge ahead.',
    catalysts: igilDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['q5u7smeu1nmp7n7tu5hsb3xh.pdf', '36qks8tjv7zn9dtgi82dw7t2.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Earnings Press Release', 'Q2 FY27 Financial Results'],
  };
  briefCache.putBrief('NSE:IGIL', igilBrief);

  // ==========================================
  // 4. BRIEFS FOR RANKS 4-10 IN RERATING TARGETS
  // ==========================================
  console.log('[generateTop3Reports] Saving briefs for ranks 4-10 in rerating targets...');

  // NSE:SSWL
  briefCache.putBrief('NSE:SSWL', {
    companyId: 'NSE:SSWL',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Standalone PAT nearly tripled (+196.9% YoY to ₹114.38 Cr on ₹1,929.92 Cr revenue, +60.7% YoY) alongside Greenfield Chhatrapati Sambhajinagar Alloy/Steel Wheels plant approval and ₹1.50 interim dividend.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Steel Strips Wheels hits blowout operational inflection with Q2 PAT surging nearly 3x YoY to ₹114.38 Cr and EPS jumping to ₹7.27, backed by Greenfield Maharashtra Alloy Wheels capacity addition and 20% upper circuit on ₹137.55 Cr delivery.',
    catalysts: [
      {
        name: 'Blowout Q2 FY27 Earnings Inflection (PAT +196.9% YoY to ₹114.38 Cr, Revenue +60.7%)',
        conviction: 'HIGH CONVICTION',
        timeline: 'Immediate Q2 results print (23-Oct-2026)',
      },
      {
        name: 'Greenfield Chhatrapati Sambhajinagar Alloy & Steel Wheels Plant + PV Hot-Stamping Line',
        conviction: 'HIGH CONVICTION',
        timeline: 'FY27-FY28 capex commercialization',
      },
    ],
    sourceFilingIds: ['m6ixw4ckvymdgbxutuw8d93i.pdf', 'x2pa1mlkyykx5cg1nz71o8xc.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Financial Results 23-Oct-2026', 'BSE Board Outcome 23-Oct-2026'],
  });

  // NSE:WESTLIFE
  briefCache.putBrief('NSE:WESTLIFE', {
    companyId: 'NSE:WESTLIFE',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Results inflection: Revenue up 16% YoY to ₹747 Cr (13-quarter high), double-digit Same Store Sales Growth (SSSG) of 10.1%, Operating EBITDA up 29% YoY to ₹98.1 Cr (13.1% margin), and 11 new restaurants added.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      "McDonald's West & South operator inflects after multi-quarter QSR lull with 13-quarter high revenue growth of 16% YoY, accelerating SSSG (+10.1%), and 29% EBITDA expansion supported by bullish concall tone.",
    catalysts: [
      {
        name: 'QSR Demand Inflection: Double-Digit SSSG (10.1%) & 13-Quarter High Revenue (₹747 Cr)',
        conviction: 'HIGH CONVICTION',
        timeline: 'Q2 FY27 (23-Oct-2026)',
      },
      {
        name: 'EBITDA Margin Expansion to 13.1% (+29% YoY growth) & 500-Restaurant Milestone Ramp',
        conviction: 'HIGH CONVICTION',
        timeline: 'H2 FY27 festive and year-end demand surge',
      },
    ],
    sourceFilingIds: ['zzi29x0litltzfpgdw7j3sls.pdf', 'lufsb9m62mjvjjopnyiw2vxw.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Press Release 23-Oct-2026', 'Investor Presentation 23-Oct-2026'],
  });

  // NSE:GRWRHITECH
  briefCache.putBrief('NSE:GRWRHITECH', {
    companyId: 'NSE:GRWRHITECH',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Record Q2 FY27 results with Revenue reaching all-time high of ₹696 Cr (+22% YoY), EBITDA surging 42% YoY to ₹189 Cr (27.2% margin, +377 bps), PAT up 42% YoY to ₹129 Cr, and management raising full-year FY27 EBITDA margin guidance by 200 bps to 27% (±2%).',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Garware Hi-Tech Films delivers peak quarterly operating performance with revenue near ₹700 Cr, 42% profit growth, and an upward revision of FY27 EBITDA margin guidance by 200 bps to 27%, confirming premium solar control and paint protection film realization power.',
    catalysts: [
      {
        name: 'Peak Q2 EBITDA Margin (27.2%) & FY27 Margin Guidance Upgraded by +200 bps to 27%',
        conviction: 'HIGH CONVICTION',
        timeline: 'Q2 FY27 print & FY27 guidance',
      },
      {
        name: 'Reaffirmation of ₹2,500+ Cr Revenue Target with Premium Paint Protection Film Ramp',
        conviction: 'HIGH CONVICTION',
        timeline: 'FY27-FY28',
      },
    ],
    sourceFilingIds: ['98u49vtszjmoil0arp0qpoxz.pdf', 'vk70jqx89y2l1ztf5sb32tlr.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Media Release 22-Oct-2026', 'Investor Presentation 22-Oct-2026'],
  });

  // NSE:ANTELOPUS
  briefCache.putBrief('NSE:ANTELOPUS', {
    companyId: 'NSE:ANTELOPUS',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Board meeting scheduled on 26-Oct-2026 (in 3 days) to consider and approve Q2 FY27 financial results and conduct earnings call, driving +13% pre-results institutional accumulation on ₹32.58 Cr delivery.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Antelopus Selan Energy is witnessing aggressive pre-results accumulation ahead of its 26-Oct Q2 board meeting, with delivery surging to ₹32.58 Cr as market positions for upstream oil & gas production and realization growth.',
    catalysts: [
      {
        name: 'Pre-Results Earnings Accumulation ahead of 26-Oct Board Meeting & Concall',
        conviction: 'HIGH CONVICTION',
        timeline: '26-Oct-2026 (in 3 days)',
      },
    ],
    sourceFilingIds: ['ug07327fl6y3bz33qtlddjbg.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['BSE Board Meeting Intimation 21-Oct-2026'],
  });

  // NSE:JINDALPOLY
  briefCache.putBrief('NSE:JINDALPOLY', {
    companyId: 'NSE:JINDALPOLY',
    jCurveTag: 'WEAK',
    jCurveReason:
      '+11.23% price move on ₹16.66 Cr delivery unsupported by conviction (delivery % only 2.71% reflecting speculative intraday churn); no corporate filing in 14-day window.',
    reratingPhase: 'LATE',
    spentFlags: ['speculative_churn'],
    thesis:
      'Jindal Poly Films moved on speculative trading pop with 2.71% delivery percentage indicating lack of institutional float absorption and no fundamental filings in the scoring window.',
    catalysts: [],
    sourceFilingIds: [],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: [],
  });

  // NSE:544971
  briefCache.putBrief('NSE:544971', {
    companyId: 'NSE:544971',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Received ₹4.445 Cr order from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months, representing ~19% of market cap base.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Vans Electroengineerings is accelerating power T&D switchgear equipment execution with fresh ₹4.45 Cr high-voltage circuit breaker order driving H2 revenue surge.',
    catalysts: [
      {
        name: '₹4.445 Cr Agrawal Power Circuit Breaker Order',
        conviction: 'HIGH CONVICTION',
        timeline: '6 months (H2 FY27)',
      },
      {
        name: 'Power Distribution Grid Modernisation Tailwinds',
        conviction: 'HIGH CONVICTION',
        timeline: 'FY27-FY28',
      },
    ],
    sourceFilingIds: ['smtcmjna8o6xftxhietxgo7m.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['BSE Reg 30 Order Win Filing 19-Oct-2026'],
  });

  // NSE:LCL
  briefCache.putBrief('NSE:LCL', {
    companyId: 'NSE:LCL',
    jCurveTag: 'STRONG',
    jCurveReason:
      'No fresh filing in 14 days, but accumulating on solid concall fundamental strength with EBITDA margin expanding to 19.9% and record ₹1,778 Cr order book.',
    reratingPhase: 'MID',
    spentFlags: [],
    thesis:
      'Lohia Corp is demonstrating strong delivery accumulation (52.32%) as the market prices its record ₹1,778 Cr machinery order backlog and 19.9% EBITDA margin expansion.',
    catalysts: [
      {
        name: 'Record ₹1,778 Cr Order Book & EBITDA Margin Expansion to 19.9%',
        conviction: 'HIGH CONVICTION',
        timeline: 'FY27 execution',
      },
    ],
    sourceFilingIds: [],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Concall Transcript Aug-2026'],
  });

  console.log('[generateTop3Reports] ✅ All briefs saved in brief cache successfully.');

  // ==========================================
  // 5. SAVE 18 GAINERS-TRIGGER-RESEARCH REPORTS
  // ==========================================
  console.log('[generateTop3Reports] Saving 18 gainers-trigger-research reports to DB...');

  const researchItems = [
    {
      companyId: 'BSE:SGMART',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'SG Mart surged +6.07% with very high delivery % of 88.38% (₹9.05 Cr delivered, Mcap ₹4,657 Cr). No regulatory filings disclosed in 14-day window; trading on ongoing B2B industrial products/building materials network expansion.',
      trigger: 'No regulatory filing in 14-day window. Unexplained high delivery % accumulation.',
      trigger_quantified: 'Delivery ₹9.05 Cr, Delivery % 88.38%, 1D return +6.07%.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; high delivery % accumulation (88.4%) across B2B construction/steel distribution player.',
        basis: 'none',
        sources: ['BSE Disclosures 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:LCL',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Lohia Corp gained +5.24% on ₹12.69 Cr delivery (52.32% deliv). No fresh filings in 14 days; trading on Aug-2026 concall guidance highlights (EBITDA margin expanding from 11.5% to 19.9% and record ₹1,778 Cr order book).',
      trigger:
        'No filing in 14-day window. Concall guidance (record ₹1,778 Cr order book and 19.9% EBITDA margin) remains the primary fundamental anchor.',
      trigger_quantified: 'Delivery ₹12.69 Cr (52.32% deliv), 1D +5.24%, order book ₹1,778 Cr.',
      linkage: 'explained',
      why: {
        text: 'No fresh filing in 14-day window; stock accumulating on Aug-2026 concall fundamental strength (record ₹1,778 Cr order book and EBITDA margin expansion to 19.9%).',
        basis: 'catalyst',
        sources: ['Concall Transcript Aug-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:AHCL',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Anlon Healthcare rose +4.97% on ₹7.81 Cr delivery (47.86% deliv). No material disclosures in 14-day window; trading on pharmaceutical API formulation momentum.',
      trigger:
        'No filing in 14-day window. Unexplained delivery accumulation in small-cap API manufacturer.',
      trigger_quantified: 'Delivery ₹7.81 Cr (47.86% deliv), 1D +4.97%, Mcap ₹384 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; high delivery % accumulation in small-cap API manufacturer.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'BSE:VANS',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Vans Electroengineerings locked in 10% upper circuit on ₹14.63 Cr delivery (44.23% deliv). Announced ₹4.445 Cr order from Agrawal Power on 19-Oct for testing & supply of double pole vacuum circuit breakers within 6 months (~19% of mcap).',
      trigger:
        '19-Oct order win of ₹4.445 Cr from Agrawal Power Private Limited for testing & supply of double pole vacuum circuit breakers and interrupters within 6 months.',
      trigger_quantified:
        'Order ₹4.445 Cr (~19% of market cap), execution window 6 months, delivery ₹14.63 Cr.',
      linkage: 'explained',
      why: {
        text: '19-Oct order win of ₹4.445 Cr from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months (~19% of market cap base).',
        basis: 'filing',
        sources: ['BSE Filing 19-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:ETERNAL',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Eternal Ltd advanced +4.25% with institutional delivery of ₹722.61 Cr (42.14% deliv). Released Q2 FY27 results & shareholders letter highlighting strong quick commerce (Blinkit) 1P transition; approved slump sale transfer of Going-out India business to wholly owned subsidiary ZEPL; acquired 4.4% stake in merged Mygate/Adonmo entity valued at ₹156 Cr; and unveiled dark.ai privacy-first AI platform for 2026 rollout.',
      trigger:
        'Q2 FY27 corporate actions & restructuring: Slump sale of Going-out to ZEPL, Mygate/Adonmo merger equity stake of ₹156 Cr, and dark.ai platform unveiling.',
      trigger_quantified:
        'Delivery ₹722.61 Cr (42.14% deliv), Mygate stake ₹156 Cr, Mcap ₹2,21,800 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results & restructuring: Slump sale of Going-out business to wholly owned subsidiary ZEPL to drive synergies, acquisition of ₹156 Cr stake in merged Mygate/Adonmo, and unveiling of dark.ai platform.',
        basis: 'filing',
        sources: ['BSE/NSE Disclosures 21-Oct-2026', 'Shareholders Letter Q2FY27'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:CAPILLARY',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Capillary Technologies gained +4.32% on ₹9.43 Cr delivery (42.11% deliv). Appointed William Swift as President - Americas Region (designated Senior Management Personnel) on 22-Oct to lead enterprise expansion across North America.',
      trigger:
        'Appointment of William Swift as President – Americas Region (Senior Management Personnel) approved via circular resolution on 22-Oct.',
      trigger_quantified: 'Delivery ₹9.43 Cr (42.11% deliv), Mcap ₹2,780 Cr.',
      linkage: 'explained',
      why: {
        text: '22-Oct appointment of William Swift as President – Americas Region (designated SMP) to spearhead enterprise expansion across North America.',
        basis: 'filing',
        sources: ['NSE/BSE Reg 30 Filing 22-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:PASHUPATI',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Pashupati Cotspin gained +5.03% on ₹11.82 Cr delivery (41.89% deliv). Exchange clarification filed on 21-Oct regarding price movement confirmed no undisclosed price-sensitive info; volume accumulation in textile spinning.',
      trigger:
        '21-Oct exchange price-band clarification; no material structural filing in 14-day window.',
      trigger_quantified: 'Delivery ₹11.82 Cr (41.89% deliv), 1D +5.03%, Mcap ₹480 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; price-band clarification confirmed no undisclosed material events.',
        basis: 'none',
        sources: ['NSE Clarification 21-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:SASKEN',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Sasken Technologies gained +4.14% on ₹6.45 Cr delivery (40.99% deliv). Board meeting scheduled on 28-Oct-2026 (in 5 days) to consider and approve Q2 FY27 unaudited financial results and declare interim dividend.',
      trigger:
        'Board Meeting Intimation for Q2 FY27 financial results and interim dividend consideration scheduled on 28-Oct-2026.',
      trigger_quantified:
        'Result scheduled in 5 days, delivery ₹6.45 Cr (40.99% deliv), 1D +4.14%.',
      linkage: 'explained',
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled on 28-Oct-2026 (in 5 days) to approve Q2 FY27 results and consider interim dividend.',
        basis: 'pre_result',
        sources: ['NSE Board Meeting Intimation 21-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:EASEMYTRIP',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Easy Trip Planners gained +4.50% on ₹5.35 Cr delivery (23.98% deliv). Routine board intimation; trading on festive holiday travel booking volumes.',
      trigger: 'No fundamental structural filing in 14-day window. Unexplained price movement.',
      trigger_quantified: 'Delivery ₹5.35 Cr (23.98% deliv), 1D +4.50%, Mcap ₹5,680 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; festive travel booking season volume interest.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:NOVARTIND',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Novartis India rose +8.31% on ₹6.13 Cr delivery (23.65% deliv). No regulatory announcements in 14-day window; MNC pharma bulk drug segment trading.',
      trigger: 'No filing in 14-day window. Unexplained delivery accumulation in MNC pharma.',
      trigger_quantified: 'Delivery ₹6.13 Cr (23.65% deliv), 1D +8.31%, Mcap ₹2,470 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; speculative price surge in MNC pharma subsidiary.',
        basis: 'none',
        sources: ['BSE/NSE Disclosures 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:CYIENT',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Cyient rallied +7.81% on ₹257.38 Cr delivery (10.48% deliv). Q2 FY27 results beat: DET EBIT margin reached a 10-quarter high of 14.2% (EBIT +16.8% QoQ to ₹237 Cr), DET revenue ₹1,664 Cr (+15.7% YoY), DET FCF ₹214 Cr (139% FCF/PAT conversion), record $158.4M DET order intake (+20.8% YoY), and Cyient Semi ASIC pipeline exceeding $100M with ₹12 interim dividend.',
      trigger:
        'Q2 FY27 results beat: DET EBIT margin at 10-quarter high of 14.2%, record $158.4M order intake (+20.8% YoY), FCF ₹214 Cr, and interim dividend of ₹12/share.',
      trigger_quantified:
        'DET EBIT margin 14.2% (+110 bps), order intake $158.4M, FCF ₹214 Cr (139% conversion), delivery ₹257.38 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results beat: DET EBIT margin reached a 10-quarter high of 14.2% (EBIT +16.8% QoQ to ₹237 Cr), record DET order intake of $158.4M (+20.8% YoY), and ₹214 Cr FCF.',
        basis: 'filing',
        sources: ['Press Release & Q2 Results 22-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:IGIL',
      research_axis: 'DELIVERY_VALUE',
      tier: 'WATCH',
      summary:
        'International Gemological Institute gained +7.91% on ₹156.60 Cr delivery (20.63% deliv). Continued institutional follow-through accumulation post Q2 results beat: Revenue +31% YoY to ₹398 Cr, EBITDA +39% to ₹244.5 Cr (61.4% margin), PAT +43% to ₹185.8 Cr on 4.35M cert reports (+26%).',
      trigger:
        'Q2 FY27 results blowout: +43% PAT growth to ₹185.8 Cr, 61.4% EBITDA margin (+330 bps), and certification volumes up 26% to 4.35 million reports.',
      trigger_quantified:
        'Delivery ₹156.60 Cr (20.63% deliv), 1D +7.91%, PAT ₹185.8 Cr (+43%), EBITDA margin 61.4%.',
      linkage: 'explained',
      why: {
        text: 'Follow-through accumulation post Q2 FY27 results beat: Consolidated Revenue +31% YoY to ₹398 Cr, EBITDA margin expanded to 61.4%, and PAT grew +43% YoY to ₹185.8 Cr on 4.35M reports.',
        basis: 'filing',
        sources: ['Q2 Results & Press Release 21-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:SSWL',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Steel Strips Wheels locked in 20% upper circuit (+19.99%) on ₹137.55 Cr delivery (15.60% deliv). Q2 FY27 results blowout: Revenue surged +60.7% YoY to ₹1,929.92 Cr, PBT jumped +193.8% to ₹154.47 Cr, and PAT skyrocketed +196.9% YoY (nearly 3x) to ₹114.38 Cr (EPS ₹7.27 vs ₹2.45). Board approved Greenfield manufacturing facility at Chhatrapati Sambhajinagar for Alloy/Steel Wheels + PV Hot-Stamping line and declared ₹1.50 interim dividend.',
      trigger:
        'Q2 FY27 standalone PAT nearly tripled (+196.9% YoY to ₹114.38 Cr on ₹1,929.92 Cr revenue) + Greenfield Chhatrapati Sambhajinagar Alloy/Steel Wheels capacity addition & PV Hot-Stamping launch + ₹1.50 interim dividend.',
      trigger_quantified:
        'PAT ₹114.38 Cr (+196.9% YoY), Revenue ₹1,929.9 Cr (+60.7% YoY), EPS ₹7.27 (vs ₹2.45), delivery ₹137.55 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 standalone PAT nearly tripled (+196.9% YoY to ₹114.38 Cr on ₹1,929.92 Cr revenue) alongside Greenfield Chhatrapati Sambhajinagar Alloy/Steel Wheels plant approval and ₹1.50 interim dividend.',
        basis: 'filing',
        sources: ['BSE/NSE Q2 Results & Outcome 23-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:WESTLIFE',
      research_axis: 'DELIVERY_VALUE',
      tier: 'WATCH',
      summary:
        'Westlife Foodworld surged +6.08% on ₹57.09 Cr delivery (11.25% deliv). Q2 FY27 results delivered strongest growth momentum in recent years: Revenue ₹747 Cr (+16% YoY, 13-quarter high), SSSG accelerating to +10.1%, Operating EBITDA +29% YoY to ₹98.1 Cr (13.1% margin), and 11 new restaurants opened.',
      trigger:
        'Q2 FY27 results beat: Revenue up 16% YoY to ₹747 Cr (13-quarter high) with double-digit SSSG of 10.1% and Operating EBITDA up 29% YoY to ₹98.1 Cr.',
      trigger_quantified:
        'SSSG +10.1%, Revenue ₹747 Cr (+16% YoY), EBITDA ₹98.1 Cr (+29% YoY), delivery ₹57.09 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results inflection: Revenue up 16% YoY to ₹747 Cr (13-quarter high), SSSG accelerating to double-digit +10.1%, and Operating EBITDA growing 29% YoY to ₹98.1 Cr.',
        basis: 'filing',
        sources: ['Press Release & Q2 Results 23-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:GRWRHITECH',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Garware Hi-Tech Films rose +5.62% on ₹35.94 Cr delivery (21.21% deliv). Record Q2 FY27 results: Revenue hits all-time high of ₹696 Cr (+22% YoY, +10% QoQ), EBITDA up 42% YoY to ₹189 Cr (27.2% margin, +377 bps), PAT up 42% YoY to ₹129 Cr. Management raised full-year FY27 EBITDA margin guidance by 200 bps to 27% (±2%) while reaffirming ₹2,500+ Cr revenue guidance.',
      trigger:
        'Record Q2 FY27 revenue (₹696 Cr, +22% YoY), EBITDA up 42% YoY (27.2% margin), and FY27 EBITDA margin guidance raised by 200 bps to 27% ±2%.',
      trigger_quantified:
        'Revenue ₹696 Cr (+22%), EBITDA margin 27.2% (+377 bps), FY27 margin guidance raised +200 bps, delivery ₹35.94 Cr.',
      linkage: 'explained',
      why: {
        text: 'Record Q2 FY27 results: Revenue hit all-time high of ₹696 Cr (+22% YoY), EBITDA surged 42% YoY (27.2% margin), and management raised FY27 EBITDA margin guidance by 200 bps to 27% (±2%).',
        basis: 'filing',
        sources: ['Media Release & Q2 Results 22-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:ANTELOPUS',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Antelopus Selan Energy surged +13.00% on ₹32.58 Cr delivery (9.14% deliv). Board meeting scheduled on 26-Oct-2026 (in 3 days) to approve Q2 FY27 unaudited financial results and conduct earnings call. Strong institutional accumulation ahead of results.',
      trigger:
        'Board meeting intimation on 21-Oct for Q2 FY27 results and earnings call scheduled on 26-Oct-2026.',
      trigger_quantified: 'Results scheduled in 3 days, delivery ₹32.58 Cr, 1D +13.00%.',
      linkage: 'explained',
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled on 26-Oct-2026 (in 3 days) to approve Q2 FY27 financial results and hold earnings call.',
        basis: 'pre_result',
        sources: ['BSE Board Meeting Intimation 21-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:JINDALPOLY',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'Jindal Poly Films jumped +11.23% on ₹16.66 Cr delivery, but delivery % was only 2.71% (reflecting high intraday churn and retail speculation rather than structural institutional buying). No corporate filing in 14-day window.',
      trigger:
        'No regulatory filing in 14-day window. Low delivery percentage (2.71%) indicates speculative day-trading pop.',
      trigger_quantified: 'Delivery % 2.71%, 1D +11.23%, delivery ₹16.66 Cr.',
      linkage: 'mismatched',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; +11.2% price move unsupported by delivery (2.71% delivery pct reflects speculative churn).',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:KOLTEPATIL',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'Kolte Patil Developers rose +6.24% on ₹6.82 Cr delivery (16.91% deliv). No material filings in 14-day window; real estate residential pre-sales sentiment.',
      trigger:
        'No regulatory filing in 14-day window. Modest delivery accumulation in Pune residential real estate.',
      trigger_quantified: 'Delivery ₹6.82 Cr (16.91% deliv), 1D +6.24%, Mcap ₹3,350 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; trading on residential real estate sales velocity.',
        basis: 'none',
        sources: ['NSE Disclosures 14d'],
      },
      contextUsed: [],
    },
  ];

  for (const item of researchItems) {
    db.saveReport({
      creator: 'gainers-signal',
      type: 'gainers-trigger-research',
      date: marketDate,
      companyId: item.companyId,
      modelUsed,
      summary: item.summary,
      research_axis: item.research_axis,
      tier: item.tier,
      trigger: item.trigger,
      trigger_quantified: item.trigger_quantified,
      linkage: item.linkage,
      why: item.why,
      contextUsed: item.contextUsed,
      concallCorroboration: null,
    });
  }

  console.log(`[generateTop3Reports] ✅ Saved all ${researchItems.length} research reports.`);
}

main().catch((err) => {
  console.error('[generateTop3Reports] Fatal error:', err);
  process.exit(1);
});
