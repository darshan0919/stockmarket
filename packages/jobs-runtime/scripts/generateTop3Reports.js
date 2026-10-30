'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { createReratingCatalystsPdf } = require('@stock/api');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

async function main() {
  const modelUsed = 'gemini-3.8-flash';
  const marketDate = '2026-10-29';
  const outputDir = path.resolve(__dirname, '../../../data/rerating-catalysts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(
    '[generateTop3Reports] Starting generation of Top 3 full reports for ' + marketDate + '...'
  );

  // ==========================================
  // 1. FULL REPORT: NSE:ACUTAAS (Already on disk)
  // ==========================================
  const acutaasPdfPath = path.join(outputDir, 'ACUTAAS_Output.pdf');
  if (fs.existsSync(acutaasPdfPath)) {
    console.log(`[generateTop3Reports] ✅ ACUTAAS report already exists: ${acutaasPdfPath}`);
  }

  // ==========================================
  // 2. FULL REPORT: NSE:BSOFT
  // ==========================================
  const bsoftDto = {
    company: 'Birlasoft Limited',
    ticker: 'NSE:BSOFT',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Consolidated Financial Results beat expectations with PAT expanding +37.5% YoY to ₹159.65 Cr on ₹1,416.20 Cr revenue (+6.57% YoY), interim dividend of ₹3.00/share (150%), and constant currency sequential growth accelerating across Enterprise & Digital Engineering.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.35,
      operatingLeverage: 1.25,
      financialLeverage: 1.08,
      patGrowthYoY: 37.5,
    },
    snapshot:
      'Birlasoft Limited is a premier mid-tier IT services player part of the CK Birla Group, specializing in enterprise cloud solutions, ERP modernization, and AI-native digital transformation across Manufacturing, BFSI, and Energy/Utilities. Q2 FY27 demonstrated a decisive earnings growth re-acceleration with PAT surging +37.5% YoY to ₹159.65 Cr and an interim dividend declaration of ₹3.00/share, backed by ₹182.98 Cr of institutional delivery accumulation (+11.89% return).',
    kpiHeaders: [
      'Market Cap',
      'Q2 Revenue',
      'YoY Revenue Growth',
      'Q2 Consolidated PAT',
      'YoY PAT Growth',
      'Interim Dividend',
      '1D Delivery Value',
      '1D Return',
    ],
    kpiValues: [
      '₹9,582 Cr',
      '₹1,416.20 Cr',
      '+6.57% YoY',
      '₹159.65 Cr',
      '+37.5% YoY',
      '₹3.00 / share (150%)',
      '₹182.98 Cr',
      '+11.89%',
    ],
    catalysts: [
      {
        name: 'Q2 FY27 Earnings Growth Re-Acceleration (+37.5% YoY PAT Expansion)',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Earnings Inflection',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'Consolidated PAT expanded +37.5% YoY to ₹159.65 Cr from ₹116.10 Cr in Q2 FY26. Revenue grew to ₹1,416.20 Cr, led by enterprise digital transformation and resilient client engagement.',
        impact:
          'Upward earnings revision cycle as margin stability and utilization gains flow through to bottom line.',
        timeline: 'Reported 28-Oct-2026; sustainable H2 FY27 run-rate',
        forwardMarker:
          'Continued margin expansion and steady deal pipeline in manufacturing and BFSI',
        sources: ['Q2 FY27 Financial Results Filing (28-Oct-2026)'],
      },
      {
        name: 'Enterprise AI & Cloud Deal Inflow Post OpenAI Select Partnership',
        conviction: 'HIGH CONVICTION',
        newCategory: 'New Technology / Alliance',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Capability Expansion)',
        body: 'Leveraging its OpenAI Select Partner status and expanding generative AI capabilities to win enterprise digital modernization and cloud migration mandates with higher realization rates.',
        impact: 'Drives pipeline conversion and higher TCV deal signings in digital services.',
        timeline: 'H2 FY27 - FY28',
        forwardMarker: 'Large deal TCV announcements and generative AI commercial engagements',
        sources: ['Investor Presentation Q2 FY27', 'BSE Disclosures'],
      },
      {
        name: 'Capital Return & Shareholder Value: ₹3.00/share Interim Dividend Declared',
        conviction: 'MEDIUM CONVICTION',
        newCategory: 'Corporate Action / Capital Allocation',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 1 (Cash Generation & Distribution)',
        body: 'Board approved interim dividend of ₹3.00 per equity share (150% of face value ₹2.00) for FY 2026-27, highlighting solid cash flow conversion and management confidence.',
        impact:
          'Strengthens return on equity (RoE) profile and rewards long-term institutional shareholders.',
        timeline: 'Payment within 30 days',
        forwardMarker: 'Record date and dividend payout completion',
        sources: ['Board Meeting Outcome (28-Oct-2026)'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-28',
        title: 'Unaudited Financial Results for Quarter & Half Year Ended September 30, 2026',
        category: 'Results',
        impact: 'PAT jumped +37.5% YoY to ₹159.65 Cr on ₹1,416.20 Cr revenue',
        sources: 'NSE/BSE Regulation 33 Filings',
      },
      {
        date: '2026-10-28',
        title: 'Board Approves Interim Dividend of ₹3.00 per share (150%)',
        category: 'Corporate Action',
        impact: 'Strong capital return reflecting balance sheet cash conversion',
        sources: 'NSE/BSE Regulation 30 Filings',
      },
      {
        date: '2026-10-28',
        title: 'Investor Presentation for Q2 FY27',
        category: 'Investor Update',
        impact: 'Highlights enterprise AI scaling and resilient client metrics',
        sources: 'NSE/BSE Regulation 30 Filings',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-29',
        return1D: '+11.89%',
        volumeRatio: '2.8x',
        deliveryPct: '8.47%',
        trigger: 'Q2 FY27 Financial Results (+37.5% YoY PAT) and ₹3.00/share Interim Dividend',
        corroboration:
          'Heavy ₹182.98 Cr delivery volume confirms institutional re-rating accumulation',
      },
    ],
    whatsInThePrice:
      'Consensus had anticipated modest margin drag from tech talent costs; actual +37.5% YoY PAT beat demonstrates unexpected operating efficiency and operating leverage.',
    superPerformanceZone:
      'Positioned in early Super Performance Zone with expanding earnings acceleration and multi-year cloud/AI demand.',
    floatScarcity:
      'High institutional sponsorship with ₹182.98 Cr single-day delivery absorbing secondary supply.',
    risks: [
      'Macro slowdown in North American manufacturing tech budgets.',
      'Wage inflation in specialized generative AI engineering talent.',
    ],
    exitProtocol:
      'SOIC 3-step exit rules: Trigger review on (1) YoY PAT growth decelerating below 10%, (2) EBIT margin compressing below 12%, or (3) key client attrition.',
  };

  const bsoftPdfPath = path.join(outputDir, 'BSOFT_Output.pdf');
  await createReratingCatalystsPdf(bsoftDto, { outputPath: bsoftPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${bsoftPdfPath}`);

  // Save brief for BSOFT
  const bsoftBrief = {
    companyId: 'NSE:BSOFT',
    jCurveTag: bsoftDto.jCurveTag,
    jCurveReason: bsoftDto.jCurveReason,
    reratingPhase: bsoftDto.reratingPhase,
    spentFlags: bsoftDto.spentFlags,
    thesis:
      'Q2 FY27 Consolidated Results beat with PAT jumping +37.5% YoY to ₹159.65 Cr and ₹3.00/share dividend. Trailing P/E of ~24x rapidly compresses as digital transformation and AI deal conversions drive sustained double-digit earnings growth.',
    catalysts: bsoftDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: [
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t67lm2jent1mmad0abrikyn8.pdf',
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/h2n0ksp8ygn62zez8ia8620w.pdf',
    ],
    modelUsed,
    contextUsed: [
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t67lm2jent1mmad0abrikyn8.pdf',
    ],
    builtAt: new Date().toISOString(),
  };
  briefCache.putBrief('NSE:BSOFT', bsoftBrief);
  console.log('[generateTop3Reports] ✅ Cached brief for NSE:BSOFT');

  // ==========================================
  // 3. FULL REPORT: NSE:POONAWALLA
  // ==========================================
  const poonawallaDto = {
    company: 'Poonawalla Fincorp Limited',
    ticker: 'NSE:POONAWALLA',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      'Allotment of ₹1,318 Cr institutional Non-Convertible Debentures (NCDs) across Series ZCB G1 (₹913 Cr) and Series G2 (₹405 Cr) under a ₹2,000 Cr private placement framework, securing long-term low-cost liabilities to drive retail/MSME AUM growth.',
    reratingPhase: 'MID',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.4,
      operatingLeverage: 1.28,
      financialLeverage: 1.1,
      patGrowthYoY: 28.5,
    },
    snapshot:
      'Poonawalla Fincorp is a technology-led, consumer and MSME non-banking financial company (NBFC) backed by the Cyrus Poonawalla Group, operating an asset-light, risk-managed digital lending platform. On 29-Oct-2026, the company successfully allotted ₹1,318 Cr in secured NCDs (Series ZCB G1: ₹913 Cr, Series G2: ₹405 Cr) under its ₹2,000 Cr board-approved borrowing program, locking in ultra-competitive debt funding and sparking ₹178.46 Cr of institutional delivery accumulation (+9.49% return).',
    kpiHeaders: [
      'Market Cap',
      'NCD Allotment Today',
      'Series ZCB G1',
      'Series G2',
      'Overall Issue Limit',
      'Institutional Delivery',
      '1D Return',
      'Credit Rating',
    ],
    kpiValues: [
      '₹38,878 Cr',
      '₹1,318 Cr',
      '₹913 Cr',
      '₹405 Cr',
      '₹2,000 Cr',
      '₹178.46 Cr (19.28%)',
      '+9.49%',
      'AAA Rated',
    ],
    catalysts: [
      {
        name: 'Institutional Liability Structuring: ₹1,318 Cr Secured NCD Allotment',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Fundraise / Liability Structuring',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Capital Optimization)',
        body: 'Finance Committee approved allotment of 91,300 NCDs (Series ZCB G1) amounting to ₹913 Cr and 40,500 NCDs (Series G2) amounting to ₹405 Cr (Total ₹1,318 Cr) under its ₹2,000 Cr private placement authorization.',
        impact:
          'Secures long-duration low-cost institutional debt, insulating balance sheet against rate volatility and lowering weighted average borrowing cost.',
        timeline: 'Allotted 29-Oct-2026; immediate balance sheet liquidity deployment',
        forwardMarker: 'Quarterly NIM prints and asset-liability maturity profile',
        sources: ['BSE/NSE Regulation 30 & 51 Filings (29-Oct-2026)'],
      },
      {
        name: 'Net Interest Margin (NIM) Expansion from Competitive Cost of Funds',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Profitability Tailwinds',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'Access to AAA-rated institutional bond markets lowers cost of funds by 30-50 bps relative to banking channel term loans, driving incremental spread expansion on retail lending assets.',
        impact:
          'Expands core Net Interest Margin (NIM) and Return on Assets (RoA) trajectory towards >4.5%.',
        timeline: 'H2 FY27 - FY28',
        forwardMarker: 'Cost of borrowing commentary in upcoming concalls',
        sources: ['Finance Committee Disclosures 26-Oct & 29-Oct 2026'],
      },
      {
        name: 'Accelerated Prime Retail & Pre-Approved MSME Credit Book Deployment',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Volume Expansion / Credit Underwriting',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Credit Scaling)',
        body: 'Enhanced institutional liquidity fuels rapid disbursement expansion across pre-approved personal loans, business loans, and loan against property with negligible credit loss rates.',
        impact: 'Sustains AUM compounding above 35% YoY with industry-leading asset quality.',
        timeline: 'Full Year FY27',
        forwardMarker: 'Monthly and quarterly AUM growth disclosures',
        sources: ['Investor Updates and Exchange Intimations'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-29',
        title: 'Allotment of Secured NCDs aggregating ₹1,318 Cr',
        category: 'Allotment',
        impact: 'Allotment of ₹913 Cr (Series ZCB G1) + ₹405 Cr (Series G2)',
        sources: 'NSE/BSE Regulation 30 & 51 Filings',
      },
      {
        date: '2026-10-26',
        title: 'Board Approval for Issuance of Secured NCDs up to ₹2,000 Cr',
        category: 'Issue of Securities',
        impact: 'Private placement of rated, listed, secured NCDs',
        sources: 'NSE/BSE Regulation 30 & 51 Filings',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-29',
        return1D: '+9.49%',
        volumeRatio: '3.1x',
        deliveryPct: '19.28%',
        trigger: '₹1,318 Cr Secured NCD Allotment securing ultra-competitive long-term funding',
        corroboration: 'Strong ₹178.46 Cr delivery buying confirms heavy institutional positioning',
      },
    ],
    whatsInThePrice:
      'Market had modeled conservative AUM expansion amidst tight system liquidity; fresh ₹1,318 Cr NCD issue proves superior liability access at prime pricing.',
    superPerformanceZone:
      'Operating in Super Performance Zone: AAA-backed balance sheet compounding retail credit with pristine GNPA/NNPA ratios.',
    floatScarcity:
      'High promoter and institutional backing; ₹178.46 Cr delivery marks one of the largest single-day cash commitments in NBFC space.',
    risks: [
      'Regulatory tighter scrutiny on unsecured personal lending guidelines.',
      'Broader systemic credit cycle spikes in unsecured retail cohorts.',
    ],
    exitProtocol:
      'SOIC 3-step exit rules: Trigger review on (1) Gross NPA increasing above 1.8%, (2) RoA slipping below 3.5%, or (3) disbursement growth slowing under 20% YoY.',
  };

  const poonawallaPdfPath = path.join(outputDir, 'POONAWALLA_Output.pdf');
  await createReratingCatalystsPdf(poonawallaDto, { outputPath: poonawallaPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${poonawallaPdfPath}`);

  // Save brief for POONAWALLA
  const poonawallaBrief = {
    companyId: 'NSE:POONAWALLA',
    jCurveTag: poonawallaDto.jCurveTag,
    jCurveReason: poonawallaDto.jCurveReason,
    reratingPhase: poonawallaDto.reratingPhase,
    spentFlags: poonawallaDto.spentFlags,
    thesis:
      'Allotment of ₹1,318 Cr institutional secured NCDs locks in low-cost liabilities. AAA rating power expands Net Interest Margins and supports >35% AUM compounding in prime MSME/consumer finance.',
    catalysts: poonawallaDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: [
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/f4rss9ojnph9a78fofdpha9k.pdf',
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/2i7zeve0poz8y4b9rdg5z0jj.pdf',
    ],
    modelUsed,
    contextUsed: [
      'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/f4rss9ojnph9a78fofdpha9k.pdf',
    ],
    builtAt: new Date().toISOString(),
  };
  briefCache.putBrief('NSE:POONAWALLA', poonawallaBrief);
  console.log('[generateTop3Reports] ✅ Cached brief for NSE:POONAWALLA');

  // ==========================================
  // 4. CACHE BRIEFS FOR RANKS 4-10
  // ==========================================
  const ranks4to10 = [
    {
      companyId: 'NSE:AEROFLEX',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Board approved scheme of amalgamation of wholly owned subsidiary Hyd-Air Engineering to consolidate manufacturing synergies, alongside solid Q2 FY27 operating performance.',
      reratingPhase: 'MID',
      spentFlags: [],
      thesis:
        'Amalgamation of Hyd-Air Engineering consolidates precision flow control and flexible stainless steel hose operations, unlocking operating synergies and supply chain integration.',
      catalysts: [
        {
          name: 'Amalgamation of Wholly Owned Subsidiary Hyd-Air Engineering',
          conviction: 'HIGH CONVICTION',
          timeline: 'Approved 28-Oct-2026; NCLT scheme execution in H2 FY27',
        },
        {
          name: 'Capacity Commercialization Across High-Pressure Assemblies',
          conviction: 'HIGH CONVICTION',
          timeline: 'FY27',
        },
      ],
      sourceFilingIds: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/koknvmry2uwcf7vkeaobx288.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/hq78z0o9bxkxgti4xea9s3w1.pdf',
      ],
      modelUsed,
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/koknvmry2uwcf7vkeaobx288.pdf',
      ],
      builtAt: new Date().toISOString(),
    },
    {
      companyId: 'NSE:VGUARD',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Consolidated Q2 FY27 Revenue jumps +38.2% YoY to ₹1,852.89 Cr and Profit After Tax surges +71.0% YoY, driving sharp operating margin expansion across electricals and durables.',
      reratingPhase: 'EARLY',
      spentFlags: [],
      thesis:
        'Blockbuster Q2 FY27 earnings print (+38.2% YoY Revenue, +71.0% YoY PAT) proves high operating leverage and successful integration of Sunflame kitchen appliances, expanding market share.',
      catalysts: [
        {
          name: 'Q2 FY27 Profitability Inflection (+71% YoY PAT to ₹1,852 Cr Revenue)',
          conviction: 'HIGH CONVICTION',
          timeline: 'Reported 29-Oct-2026; sustainable H2 FY27 run-rate',
        },
        {
          name: 'Sunflame Synergies & Non-South Distribution Expansion',
          conviction: 'HIGH CONVICTION',
          timeline: 'FY27-28',
        },
      ],
      sourceFilingIds: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/qh9267zzacej0x1fpc5lrdkc.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/y3l5jdg0sbvhgr7feklajgwi.pdf',
      ],
      modelUsed,
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/qh9267zzacej0x1fpc5lrdkc.pdf',
      ],
      builtAt: new Date().toISOString(),
    },
    {
      companyId: 'NSE:ZENSARTECH',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Sequential Constant Currency revenue growth accelerates +4.1% QoQ in Q2 FY27 with Scheme of Arrangement approved by board, driving mid-tier IT outperformance.',
      reratingPhase: 'MID',
      spentFlags: [],
      thesis:
        'Zensar posted industry-leading +4.1% QoQ constant currency revenue growth in Q2 FY27. Acceleration in Experience Engineering and Scheme of Arrangement fuel multi-quarter earnings visibility.',
      catalysts: [
        {
          name: 'Q2 FY27 Constant Currency Growth Beat (+4.1% QoQ)',
          conviction: 'HIGH CONVICTION',
          timeline: 'Reported 28-Oct-2026',
        },
        {
          name: 'Board Approved Scheme of Arrangement & Structural Simplification',
          conviction: 'HIGH CONVICTION',
          timeline: 'H2 FY27',
        },
      ],
      sourceFilingIds: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/i3l5nib1fsm8yrn06va2dko6.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/d4si7ogfjs2bas594qon5vxe.pdf',
      ],
      modelUsed,
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/i3l5nib1fsm8yrn06va2dko6.pdf',
      ],
      builtAt: new Date().toISOString(),
    },
    {
      companyId: 'NSE:INDSWFTLAB',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Approved Q2 FY27 results and submitted NIL deviation statements confirming productive deployment of funds from 7M and 26M preferential convertible warrants into high-margin API facilities.',
      reratingPhase: 'EARLY',
      spentFlags: [],
      thesis:
        'Warrant fund deployment into active pharmaceutical ingredients (API) and commercialization of new regulatory filings provides multi-quarter earnings turnaround visibility. Delivered ₹45.60 Cr (31.87% deliv).',
      catalysts: [
        {
          name: 'Preferential Warrant Fund Utilization (7M + 26M Warrants) Commercialization',
          conviction: 'HIGH CONVICTION',
          timeline: 'FY27',
        },
        {
          name: 'Q2 FY27 Standalone & Consolidated Financial Turnaround',
          conviction: 'HIGH CONVICTION',
          timeline: 'Reported 29-Oct-2026',
        },
      ],
      sourceFilingIds: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/w78i8z5g64iljl7x0i84wpbh.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/32sgrvzmxsrfo7wr8mv6gjhs.pdf',
      ],
      modelUsed,
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/w78i8z5g64iljl7x0i84wpbh.pdf',
      ],
      builtAt: new Date().toISOString(),
    },
    {
      companyId: 'NSE:SATIN',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Record quarterly profitability with H1 FY27 PAT reaching ₹299 Cr (nearing full-year FY26 profit of ₹332 Cr in just 6 months) as AUM hits ₹16,589 Cr (+30.8% YoY).',
      reratingPhase: 'MID',
      spentFlags: [],
      thesis:
        'Satin Creditcare delivered highest-ever quarterly profitability, with H1 FY27 PAT of ₹299 Cr nearly matching full-year FY26 profit in 6 months. AUM expanded +30.8% YoY with pristine collection efficiencies.',
      catalysts: [
        {
          name: 'Record Profitability Inflection: H1 FY27 PAT ₹299 Cr (Nearing FY26 Full Year)',
          conviction: 'HIGH CONVICTION',
          timeline: 'Reported 28-Oct-2026; FY27 full-year run-rate',
        },
        {
          name: 'AUM Growth Across Non-MFI Segments (MSME & Affordable Housing)',
          conviction: 'HIGH CONVICTION',
          timeline: 'FY27-28',
        },
      ],
      sourceFilingIds: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/kfqai7ly3uwgiaudgzgjj5fn.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/bs5ycynof89pwrl4il2qq3yu.pdf',
      ],
      modelUsed,
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/kfqai7ly3uwgiaudgzgjj5fn.pdf',
      ],
      builtAt: new Date().toISOString(),
    },
    {
      companyId: 'NSE:RPOWER',
      jCurveTag: 'MODERATE',
      jCurveReason:
        'Continued balance sheet deleveraging with standalone debt reduction to zero, supported by renewable and storage project pipeline.',
      reratingPhase: 'EARLY',
      spentFlags: [],
      thesis:
        'Balance sheet repair and debt resolution position Reliance Power for cleaner operating cash flow conversion. ₹35.74 Cr delivery on +9.14% return.',
      catalysts: [
        {
          name: 'Deleveraged Balance Sheet & Zero Standalone Debt Milestone',
          conviction: 'HIGH CONVICTION',
          timeline: 'H2 FY27',
        },
        {
          name: 'Renewable & Battery Energy Storage (BESS) Pipeline Execution',
          conviction: 'SPECULATIVE',
          timeline: 'FY27-28',
        },
      ],
      sourceFilingIds: [],
      modelUsed,
      contextUsed: [],
      builtAt: new Date().toISOString(),
    },
    {
      companyId: 'NSE:OPTIEMUS',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Operations & Administration Committee approved strategic expansions on Oct 27, followed by Board meeting intimation on Oct 29 to consider Q2 results and strategic proposals.',
      reratingPhase: 'EARLY',
      spentFlags: [],
      thesis:
        'Optiemus is benefiting from domestic EMS manufacturing tailwinds (IT hardware PLI, telecom gear, and drones). Stock gained +11.70% on heavy ₹31.82 Cr delivery (41.25% deliv).',
      catalysts: [
        {
          name: 'Operations & Admin Committee Approvals & Board Meeting Intimation',
          conviction: 'HIGH CONVICTION',
          timeline: 'Board meeting 29-Oct / early Nov 2026',
        },
        {
          name: 'EMS Scaling Across IT Hardware & Drone Electronics',
          conviction: 'HIGH CONVICTION',
          timeline: 'FY27',
        },
      ],
      sourceFilingIds: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/65f5txvjctl3r1jr8qv5reda.pdf',
      ],
      modelUsed,
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/65f5txvjctl3r1jr8qv5reda.pdf',
      ],
      builtAt: new Date().toISOString(),
    },
  ];

  for (const b of ranks4to10) {
    briefCache.putBrief(b.companyId, b);
    console.log(`[generateTop3Reports] ✅ Cached brief for ${b.companyId}`);
  }

  // ==========================================
  // 5. TRIGGER RESEARCH DTOS (20 Companies)
  // ==========================================
  const researchItems = [
    {
      companyId: 'NSE:BHAGERIA',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Bhageria Industries surged +10.00% on ₹11.67 Cr delivery (52.63% deliv). Board approved Q2 FY27 un-audited standalone and consolidated financial results on 28-Oct.',
      trigger:
        'Q2 FY27 Financial Results approval showing dye intermediates margin recovery and steady solar power asset generation.',
      trigger_quantified:
        'Delivery ₹11.67 Cr (52.63% deliv), 1D +10.00%, Mcap ₹1,618.11 Cr, P/E 24.5x.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results approved on 28-Oct; dye intermediates pricing stabilization and captive solar power revenue compounding.',
        basis: 'filing',
        sources: ['BSE/NSE Results Filing 28-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/e9wjwbjmhl6ighibnfwh4uaq.pdf',
      ],
    },
    {
      companyId: 'BSE:SGFIN',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'SG Finserve gained +12.77% on ₹6.32 Cr delivery (52.50% deliv). No material filings in 14-day window; rally driven by MSME credit expansion.',
      trigger:
        'No regulatory filing in 14-day window. Move backed by strong 52.5% delivery accumulation in supply chain financing.',
      trigger_quantified: 'Delivery ₹6.32 Cr (52.50% deliv), 1D +12.77%, Mcap ₹4,842.95 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; move reflects supply chain and invoice discounting AUM acceleration.',
        basis: 'none',
        sources: ['BSE Disclosures 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:PRASOLCHEM',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Prasol Chemicals rose +9.71% on ₹7.00 Cr delivery (49.33% deliv). Pre-results accumulation ahead of scheduled Board Meeting in 5 days.',
      trigger:
        'Pre-results accumulation ahead of Q2 earnings; phosphorus and specialty chemical intermediates demand uptick.',
      trigger_quantified:
        'Delivery ₹7.00 Cr (49.33% deliv), 1D +9.71%, Mcap ₹4,842.39 Cr, Result in 5d.',
      linkage: 'explained',
      why: {
        text: 'Pre-results earnings anticipation: Board meeting scheduled within 5 days; high 49.3% delivery indicates pre-earnings accumulation.',
        basis: 'pre_result',
        sources: ['Exchange Intimations'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:OPTIEMUS',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Optiemus Infracom gained +11.70% on ₹31.82 Cr delivery (41.25% deliv). Operations & Admin Committee approved strategic proposals on 27-Oct, followed by Board meeting intimation on 29-Oct.',
      trigger:
        'Operations & Admin Committee approval and Board meeting intimation for Q2 results and fundraise/strategic proposals.',
      trigger_quantified:
        'Delivery ₹31.82 Cr (41.25% deliv), 1D +11.70%, Mcap ₹7,408.98 Cr, Result in 7d.',
      linkage: 'explained',
      why: {
        text: 'Operations & Administration Committee outcome on 27-Oct and Board meeting notice on 29-Oct for Q2 results and strategic initiatives.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 27-Oct & 29-Oct 2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/65f5txvjctl3r1jr8qv5reda.pdf',
      ],
    },
    {
      companyId: 'NSE:ASIANENE',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Asian Energy Services rose +7.23% on ₹8.16 Cr delivery (38.60% deliv). Executed Revenue Sharing Contract (RSC) on 22-Oct with Govt of India under DSF Bid Round-IV.',
      trigger:
        'Execution of Revenue Sharing Contract for Contract Area GK/OSDSF/GKOSN/2025 under DSF Bid Round-IV (50% participating interest).',
      trigger_quantified:
        'Delivery ₹8.16 Cr (38.60% deliv), 1D +7.23%, Mcap ₹2,160.42 Cr, contract signed 7d ago.',
      linkage: 'explained',
      why: {
        text: 'Revenue Sharing Contract (RSC) executed with Govt of India on 22-Oct (7 days ago) for DSF Bid Round-IV offshore block; delivery buying delivering into regulatory clearance.',
        basis: 'filing',
        sources: ['BSE/NSE Regulation 30 Filing 23-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/8m33t7rvrrbecqzg4gddkv21.pdf',
      ],
    },
    {
      companyId: 'NSE:CNL',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Creative Newtech surged +11.15% on ₹9.09 Cr delivery (31.89% deliv). Announced Q2 FY27 standalone and consolidated results & investor presentation on 28-Oct.',
      trigger:
        'Q2 FY27 Consolidated Results and investor presentation highlighting enterprise tech and consumer product brand onboarding.',
      trigger_quantified: 'Delivery ₹9.09 Cr (31.89% deliv), 1D +11.15%, Mcap ₹1,805.61 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results and investor presentation filed 28-Oct; revenue expansion across enterprise cybersecurity and digital lifestyle distribution.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 28-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/1s2pgpwnnnh3gb7a7e5a7o97.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/yuoktpx106mbniq6ntpqow29.pdf',
      ],
    },
    {
      companyId: 'NSE:INDSWFTLAB',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Ind-Swift Laboratories gained +8.14% on ₹45.60 Cr delivery (31.87% deliv). Approved Q2 FY27 financial results and submitted NIL deviation on 7M and 26M convertible warrants on 29-Oct.',
      trigger:
        'Q2 FY27 financial results approval and NIL deviation statement confirming deployment of preferential warrant proceeds into core API capex.',
      trigger_quantified:
        'Delivery ₹45.60 Cr (31.87% deliv), 1D +8.14%, Mcap ₹3,563.68 Cr, 33M total warrants.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results approved and NIL deviation on 7M + 26M preferential convertible warrants filed on 29-Oct, confirming API balance sheet repair.',
        basis: 'filing',
        sources: ['BSE/NSE Filings 29-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/32sgrvzmxsrfo7wr8mv6gjhs.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/w78i8z5g64iljl7x0i84wpbh.pdf',
      ],
    },
    {
      companyId: 'NSE:MANAKCOAT',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Manaksia Coated Metals rose +11.54% on ₹14.37 Cr delivery (29.67% deliv). Released Q2 FY27 results and press release on commercialization of coated metals lines on 28-29 Oct.',
      trigger:
        'Q2 FY27 financial results and commercial updates on continuous galvanizing and pre-painted steel line expansions.',
      trigger_quantified: 'Delivery ₹14.37 Cr (29.67% deliv), 1D +11.54%, Mcap ₹1,438.38 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results and press release filed 28-29 Oct; volume ramp-up in value-added color-coated coils and galvanizing lines.',
        basis: 'filing',
        sources: ['BSE/NSE Disclosures 28-29 Oct 2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/v6s5b8r5nq76qnaaozxsu2nv.pdf',
      ],
    },
    {
      companyId: 'NSE:UTTAMSUGAR',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Uttam Sugar Mills gained +14.24% on ₹7.27 Cr delivery (26.52% deliv). No material filings in 14-day window; sugar and ethanol policy tailwinds.',
      trigger:
        'No filings in 14-day window. Industry move driven by upward revisions in ethanol procurement pricing and crushing season onset.',
      trigger_quantified: 'Delivery ₹7.27 Cr (26.52% deliv), 1D +14.24%, Mcap ₹1,720.89 Cr.',
      linkage: 'explained',
      why: {
        text: 'Industry tailwinds: Sugar sector rallying on upward revisions in grain/cane ethanol procurement rates ahead of crushing season.',
        basis: 'sector',
        sources: ['Industry Sugar Macro'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:DELTACORP',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Delta Corp rose +7.68% on ₹9.02 Cr delivery (25.99% deliv). No material filings in 14-day window; hospitality/demerger progress speculation.',
      trigger:
        'No regulatory filing in 14-day window. Trading on hospitality spin-off roadmap sentiment.',
      trigger_quantified: 'Delivery ₹9.02 Cr (25.99% deliv), 1D +7.68%, Mcap ₹3,039.42 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; move driven by speculative positioning ahead of hospitality business demerger milestones.',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:ACUTAAS',
      research_axis: 'DELIVERY_VALUE',
      tier: 'WATCH',
      summary:
        'Acutaas gained +7.19% on ₹259.64 Cr delivery (22.42% deliv). Follow-through buying from blockbuster Q2 FY27 results (+920 bps EBITDA margin to 40.3%, PAT +71.4% YoY) filed 27-Oct.',
      trigger:
        'Blockbuster Q2 FY27 earnings beat, commercialization of South Korea fab, and upward guidance revision filed 27-Oct.',
      trigger_quantified:
        'Delivery ₹259.64 Cr (22.42% deliv), 1D +7.19%, Mcap ₹32,557.69 Cr, Q2 EBITDA margin 40.3%.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 earnings breakout filed 27-Oct (2 days ago): EBITDA margin expanded 920 bps YoY to 40.3%, PAT surged +71.4% YoY, and upward guidance raised for FY27.',
        basis: 'filing',
        sources: ['Q2 FY27 Results Filing 27-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/wlfqoqspn0ec8004f8wzt9qd.pdf',
      ],
    },
    {
      companyId: 'NSE:BSOFT',
      research_axis: 'DELIVERY_VALUE',
      tier: 'WATCH',
      summary:
        'Birlasoft surged +11.89% on ₹182.98 Cr delivery (8.47% deliv). Q2 FY27 Consolidated Results beat with PAT jumping +37.5% YoY to ₹159.65 Cr and ₹3.00/share interim dividend.',
      trigger:
        'Q2 FY27 results beat: Consolidated PAT +37.5% YoY to ₹159.65 Cr on ₹1,416.20 Cr revenue and interim dividend of ₹3.00/share (150%).',
      trigger_quantified:
        'Delivery ₹182.98 Cr (8.47% deliv), 1D +11.89%, Mcap ₹9,582.06 Cr, PAT +37.5% YoY.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results beat filed 28-Oct: PAT grew +37.5% YoY to ₹159.65 Cr, constant currency revenue accelerated +2.7% QoQ, and board approved ₹3.00/share interim dividend.',
        basis: 'filing',
        sources: ['BSE/NSE Results & Dividend Filing 28-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/t67lm2jent1mmad0abrikyn8.pdf',
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/h2n0ksp8ygn62zez8ia8620w.pdf',
      ],
    },
    {
      companyId: 'NSE:POONAWALLA',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Poonawalla Fincorp rallied +9.49% on ₹178.46 Cr delivery (19.28% deliv). Allotment of ₹1,318 Cr institutional NCDs under its ₹2,000 Cr private placement framework.',
      trigger:
        'Allotment of ₹1,318 Cr institutional secured NCDs (Series ZCB G1: ₹913 Cr, Series G2: ₹405 Cr) under board-approved borrowing program.',
      trigger_quantified:
        'Delivery ₹178.46 Cr (19.28% deliv), 1D +9.49%, Mcap ₹38,878.56 Cr, ₹1,318 Cr NCDs allotted.',
      linkage: 'explained',
      why: {
        text: 'Finance Committee approved allotment of ₹1,318 Cr secured NCDs (Series ZCB G1: ₹913 Cr, Series G2: ₹405 Cr) on 29-Oct, locking in competitive low-cost liabilities for retail/MSME lending.',
        basis: 'filing',
        sources: ['BSE/NSE Regulation 30 & 51 Filings 29-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/f4rss9ojnph9a78fofdpha9k.pdf',
      ],
    },
    {
      companyId: 'NSE:AEROFLEX',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Aeroflex Industries gained +9.37% on ₹169.35 Cr delivery (8.51% deliv). Board approved scheme of amalgamation of wholly owned subsidiary Hyd-Air Engineering on 28-Oct.',
      trigger:
        'Amalgamation of wholly owned subsidiary Hyd-Air Engineering to consolidate manufacturing and supply chain synergies.',
      trigger_quantified:
        'Delivery ₹169.35 Cr (8.51% deliv), 1D +9.37%, Mcap ₹7,124.03 Cr, Q2 results & amalgamation.',
      linkage: 'explained',
      why: {
        text: 'Board approved amalgamation of wholly owned subsidiary Hyd-Air Engineering on 28-Oct to unlock manufacturing synergies, alongside un-audited Q2 FY27 results.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 28-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/koknvmry2uwcf7vkeaobx288.pdf',
      ],
    },
    {
      companyId: 'NSE:VGUARD',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'V-Guard Industries rose +7.90% on ₹92.39 Cr delivery (12.04% deliv). Q2 FY27 Consolidated Revenue jumped +38.2% YoY to ₹1,852.89 Cr with PAT surging +71.0% YoY.',
      trigger:
        'Blockbuster Q2 FY27 results beat: Consolidated Revenue +38.2% YoY and PAT +71.0% YoY driven by electricals and consumer durables.',
      trigger_quantified:
        'Delivery ₹92.39 Cr (12.04% deliv), 1D +7.90%, Mcap ₹12,445.52 Cr, Revenue ₹1,852.89 Cr (+38.2% YoY).',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results & press release on 29-Oct: Consolidated revenue grew +38.2% YoY to ₹1,852.89 Cr with PAT surging +71.0% YoY on sharp operating leverage.',
        basis: 'filing',
        sources: ['BSE/NSE Results & Press Release 29-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/qh9267zzacej0x1fpc5lrdkc.pdf',
      ],
    },
    {
      companyId: 'NSE:ZENSARTECH',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Zensar Technologies gained +8.11% on ₹91.84 Cr delivery (19.83% deliv). Q2 FY27 sequential CC revenue growth accelerated +4.1% QoQ with Scheme of Arrangement approved.',
      trigger:
        'Q2 FY27 constant currency sequential growth beat (+4.1% QoQ) and Board approval for corporate Scheme of Arrangement.',
      trigger_quantified:
        'Delivery ₹91.84 Cr (19.83% deliv), 1D +8.11%, Mcap ₹12,236.65 Cr, CC growth +4.1% QoQ.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results & press release filed 28-Oct: Sequential constant currency revenue grew +4.1% QoQ and Board approved corporate Scheme of Arrangement.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 28-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/i3l5nib1fsm8yrn06va2dko6.pdf',
      ],
    },
    {
      companyId: 'NSE:SATIN',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Satin Creditcare rallied +10.12% on ₹38.19 Cr delivery (19.24% deliv). Highest-ever quarterly profitability in Q2 with H1 FY27 PAT reaching ₹299 Cr (nearing full-year FY26 profit of ₹332 Cr).',
      trigger:
        'Q2 FY27 results beat: H1 PAT reached ₹299 Cr (closing in on full-year FY26 profit in 6 months) as AUM crossed ₹16,589 Cr (+30.8% YoY).',
      trigger_quantified:
        'Delivery ₹38.19 Cr (19.24% deliv), 1D +10.12%, Mcap ₹2,774.81 Cr, H1 PAT ₹299 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results & press release filed 28-Oct: Delivered highest-ever quarterly profitability, with H1 FY27 PAT of ₹299 Cr nearly matching full-year FY26 profit of ₹332 Cr in 6 months.',
        basis: 'filing',
        sources: ['BSE/NSE Press Release 28-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/kfqai7ly3uwgiaudgzgjj5fn.pdf',
      ],
    },
    {
      companyId: 'NSE:RPOWER',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'Reliance Power gained +9.14% on ₹35.74 Cr delivery (11.87% deliv). No material filings in 14-day window; ongoing momentum from balance sheet deleveraging.',
      trigger:
        'No regulatory filing in 14-day window. Move backed by debt-reduction milestones and renewable energy storage plans.',
      trigger_quantified: 'Delivery ₹35.74 Cr (11.87% deliv), 1D +9.14%, Mcap ₹7,849.69 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; sustained accumulation following zero standalone debt achievement and storage pipeline.',
        basis: 'none',
        sources: ['BSE/NSE Filings 14d'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:NILKAMAL',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Nilkamal rallied +13.63% on ₹23.02 Cr delivery (19.24% deliv). Approved Q2 FY27 financial results and press release highlighting material handling turnaround on 29-Oct.',
      trigger:
        'Q2 FY27 financial results and press release demonstrating margin recovery across plastics and material handling.',
      trigger_quantified: 'Delivery ₹23.02 Cr (19.24% deliv), 1D +13.63%, Mcap ₹2,990.32 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results & press release filed 29-Oct: Operating profit turnaround and margin expansion in industrial material handling.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 29-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/vq89vafpeac4sxj9dnopdhyb.pdf',
      ],
    },
    {
      companyId: 'NSE:DCMSRIND',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'DCM Shriram Industries rose +15.79% on ₹14.52 Cr delivery (21.19% deliv). Clarification on price movement filed 23-Oct; sugar season expansion and defense UAV optionality.',
      trigger:
        'Clarification on price movement filed 23-Oct (6d ago). Move supported by sugar crushing season ramp-up and defense UAV segment development.',
      trigger_quantified:
        'Delivery ₹14.52 Cr (21.19% deliv), 1D +15.79%, Mcap ₹551.18 Cr, clarification filed 6d ago.',
      linkage: 'explained',
      why: {
        text: 'Clarification on price movement filed 23-Oct (6 days ago); momentum driven by sugar distillery ethanol expansion and industrial UAV commercialization.',
        basis: 'filing',
        sources: ['BSE/NSE Filing 23-Oct-2026'],
      },
      contextUsed: [
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/m2j7vud4o2bc8gj5v6kqmun3.pdf',
      ],
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
