'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { createReratingCatalystsPdf } = require('@stock/api');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

async function main() {
  const modelUsed = 'gemini-2.5-pro';
  const marketDate = '2026-10-22';
  const outputDir = path.resolve(__dirname, '../../../data/rerating-catalysts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('[generateTop3Reports] Starting generation of Top 3 full reports...');

  // ==========================================
  // 1. FULL REPORT: NSE:IGIL
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
        date: '2026-10-22',
        return1D: '+10.00%',
        volumeRatio: '3.8x',
        deliveryPct: '46.67%',
        trigger: 'Q2 FY27 Results beat (+43% PAT growth, 61.4% EBITDA margin)',
        corroboration:
          'Heavy delivery volume of ₹124.09 Cr confirms institutional accumulation post results',
      },
    ],
    whatsInThePrice:
      'Consensus models 20-25% steady-state growth; the +43% profit acceleration and 61.4% margin milestone indicate market was underestimating operating leverage and coloured-stone volume expansion (up 7x).',
    superPerformanceZone:
      'Operating in Super Performance Zone: EBITDA margin >60%, ROE >35%, zero long-term debt, and 50% domestic certification market share.',
    floatScarcity:
      'Sponsor (Blackstone) and promoter lock-ins restrict free float; delivery-backed buying of ₹124 Cr represents ~0.67% of total market cap in a single session.',
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
      'STRONG BUY / ACCUMULATE on breakout: Category-neutral monopoly leader demonstrating blistering operating leverage (+43% PAT, 61.4% EBITDA margin) with ₹124 Cr delivery backing.',
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
  // 2. FULL REPORT: NSE:OMNI
  // ==========================================
  const omniDto = {
    company: 'Omnitech Engineering Limited',
    ticker: 'NSE:OMNI',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      '21-Oct commercial defence orders announcement officially converts aerospace & defence qualification optionality into confirmed commercial backlog, adding high-margin mission-critical land-based systems to the existing ₹3,000 Cr order book and ₹250 Cr Chhapara expansion.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 2.15,
      operatingLeverage: 1.85,
      financialLeverage: 1.16,
      patGrowthYoY: 468.7,
    },
    snapshot:
      'Omnitech Engineering Limited is a high-precision engineering enterprise manufacturing safety-critical machined components and assemblies for global energy, motion control, automation, and aerospace/defence applications. Headquartered in Rajkot, Gujarat, the company is executing a ₹250 Cr capex across two new Chhapara facilities expanding machine hours by 31-34%.',
    kpiHeaders: [
      'Market Cap',
      'Q1 Revenue',
      'Q1 EBITDA',
      'EBITDA Mgn',
      'Q1 PAT',
      'Order Book',
      'Chhapara Capex',
      'P/E (TTM)',
    ],
    kpiValues: [
      '₹2,140 Cr',
      '₹135.2 Cr (+61.5%)',
      '₹36.8 Cr (+142%)',
      '27.2% (+910 bps)',
      '₹19.9 Cr (+468.7%)',
      '₹3,000+ Cr',
      '₹250 Cr (+31% cap)',
      '34.2x',
    ],
    catalysts: [
      {
        name: 'Commercial Aerospace & Defence Orders Secured from Leading Indian Defence Organisations',
        conviction: 'HIGH CONVICTION',
        newCategory: 'New Vertical / Order Win',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'On 21-Oct-2026, Omnitech officially announced securing commercial orders for precision-engineered components and sub-assemblies for mission-critical applications of land-based systems and advanced defence sub-systems. This converts previously speculative qualification optionality into contracted backlog.',
        impact:
          'High-margin aerospace/defence commercial orders validating Nadcap/FAI entry; higher realisation mix',
        timeline: 'FY27-FY28 commercial delivery cycles',
        forwardMarker:
          'Contract execution schedules and initial defence revenue recognition in H2 FY27',
        sources: ['BSE/NSE Press Release (21-Oct-2026)'],
      },
      {
        name: '₹3,000 Cr Precision Engineering Order Book Conversion (4.5x Annualised Turnover)',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Order Book',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 3 (Execution Accretion)',
        body: 'Order book stands at ₹3,000+ Cr anchored by a >USD 100 Mn multi-year Weatherford energy contract. High revenue visibility over the next 3-4 years provides baseline revenue security as new capacity goes live.',
        impact: '4.5x book-to-bill revenue visibility over FY27-FY29',
        timeline: 'Converting through FY27-FY29',
        forwardMarker: 'Quarterly order book execution rates and customer delivery sign-offs',
        sources: ['Q1 FY27 Investor Presentation', 'Weatherford Contract Disclosures'],
      },
      {
        name: '₹250 Cr Chhapara Capacity Expansion Coming Online (+31-34% Machine Hours)',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Capacity Expansion',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 2 (Commercialisation)',
        body: 'Two new facilities at Chhapara are ramping up, adding high-precision 5-axis CNC machining centers and automated inspection, driving an estimated 31-34% expansion in available machine-hours.',
        impact: 'Overcoming production bottlenecks to execute ₹3,000 Cr backlog',
        timeline: 'Commercializing through H2 FY27 and FY28',
        forwardMarker: 'Commercial operation date (COD) of Chhapara Phase 2 lines',
        sources: ['Corporate Filings & Site Expansion Updates'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-21',
        title:
          'Press Release: Omnitech Engineering Strengthens Aerospace & Defence Manufacturing Portfolio with New Commercial Orders',
        category: 'Order Win / Defence',
        impact:
          'Commercial orders from leading Indian defence organizations for land-based systems and advanced sub-systems',
        sources: 'NSE/BSE Exchange Disclosures',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-22',
        return1D: '+15.54%',
        volumeRatio: '4.2x',
        deliveryPct: '6.71%',
        trigger: 'Commercial defence orders announcement',
        corroboration:
          'Massive ₹93.69 Cr delivery confirms institutional positioning into newly established defence vertical',
      },
    ],
    whatsInThePrice:
      'Street was valuing Omnitech primarily as an energy/industrial precision supplier on existing execution; entry into high-multiple indigenous defence manufacturing (Aatmanirbhar Bharat) represents unmodelled re-rating upside.',
    superPerformanceZone:
      'Order book / Mcap ratio >1.4x, Q1 PAT growth >400%, and EBITDA margins expanding toward 27%+ place Omnitech squarely into high-leverage growth trajectory.',
    floatScarcity:
      'Promoter holding >70% with tight institutional holding in Rajkot precision engineering cluster.',
    risks: [
      'Execution delay in Chhapara facility commercialisation.',
      'Customer concentration in oil & gas/energy anchor accounts.',
    ],
    exitProtocol:
      'Exit if order book growth turns negative or gross margins compress by >300 bps across two quarters.',
    eventChainTheses: [
      {
        title: 'Defence Vertical Commercialisation → Margin Accretion + Multiple Expansion',
        archetype: 'Strategic Pivot to High-Margin Moat',
        confidence: 'GROUNDED',
        theme: 'Indigenous Defence Manufacturing',
        subTheme: 'Precision Components for Land-Based Systems',
        chain: [
          {
            basis: 'FACT',
            claim:
              'Commercial orders secured from leading Indian defence organisations for mission-critical land-based systems',
            source: 'Press Release 21-Oct-2026',
          },
          {
            basis: 'INFERENCE',
            claim:
              'Defence precision components carry EBITDA margins of 30-35%, well above legacy industrial averages',
            source: 'Industry Peer Margin Benchmark (Dynamatic, MTAR)',
          },
          {
            basis: 'HYPOTHESIS',
            claim:
              'Defence backlog will scale to 15-20% of mix by FY28, triggering re-rating from industrial P/E (30x) to defence engineering P/E (55-60x)',
            source: 'SOIC Sector Multiple Valuation Framework',
          },
        ],
        whyMarketPays:
          'Defence manufacturing contracts in India carry multi-year annuity visibility and sticky government counterparty status with high barriers to entry.',
        precedent:
          'MTAR Technologies and Azad Engineering re-rating sharply upon winning initial tier-1 defence/aerospace production mandates.',
        mustBeTrue: [
          'Defence orders convert to recurring repeat purchase orders',
          'Chhapara capacity commercialises smoothly in FY27',
        ],
        confirmKill: ['Track H2 FY27 defence order intake announcements and revenue segmentation'],
      },
    ],
    verdict:
      'STRONG BUY / ACCUMULATE: Real commercial defence orders convert thesis optionality into tangible EPS runway alongside ₹3,000 Cr order book; ₹93.7 Cr institutional delivery validates move.',
    additional: {
      orderBookBreakdown: {
        'Total Order Book': '₹3,000+ Cr (~4.5x annualised revenue)',
        'Anchor Energy Contract': '>USD 100 Mn multi-year Weatherford mandate',
        'New Defence Portfolio': 'Commercial precision components for land-based systems',
        'Capacity Addition': '₹250 Cr Chhapara expansion (+31-34% machine-hours)',
      },
    },
  };

  const omniPdfPath = path.join(outputDir, 'OMNI_Output.pdf');
  await createReratingCatalystsPdf(omniDto, { outputPath: omniPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${omniPdfPath}`);

  // Save brief for OMNI
  const omniBrief = {
    companyId: 'NSE:OMNI',
    jCurveTag: omniDto.jCurveTag,
    jCurveReason: omniDto.jCurveReason,
    reratingPhase: omniDto.reratingPhase,
    spentFlags: omniDto.spentFlags,
    thesis:
      'Commercial defence orders secured on 21-Oct-2026 convert qualification optionality into real backlog, layered on top of ₹3,000 Cr core order book and ₹250 Cr Chhapara capacity expansion (+31-34% machine hours).',
    catalysts: omniDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['cawn8z7dhbnmt9w06eyax3rr.pdf', '7ris2yaqmnjnol96piga31h2.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: [
      'Aerospace & Defence Commercial Orders Press Release (21-Oct-2026)',
      'Q1 FY27 Results',
    ],
  };
  briefCache.putBrief('NSE:OMNI', omniBrief);

  // ==========================================
  // 3. FULL REPORT: NSE:TTML
  // ==========================================
  const ttmlDto = {
    company: 'Tata Teleservices (Maharashtra) Limited',
    ticker: 'NSE:TTML',
    date: marketDate,
    modelUsed,
    jCurveTag: 'STRONG',
    jCurveReason:
      'Audited Q2 FY27 results confirm turnaround inflection: EBITDA up 17.8% YoY to ₹164.6 Cr (53.16% margin, +431 bps expansion) while finance costs plummeted 54.9% YoY from ₹425 Cr to ₹191.5 Cr, shrinking net loss by 81.5% YoY to ₹(59.20) Cr (vs ₹(320.82) Cr loss in Q2 FY26).',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.82,
      operatingLeverage: 2.16,
      financialLeverage: 0.84,
      patGrowthYoY: 81.5,
    },
    snapshot:
      'Tata Teleservices (Maharashtra) Limited (TTML), part of the Tata Group, is a leading digital connectivity and enterprise communications solutions provider in Maharashtra and Goa. Operating under the Tata Tele Business Services (TTBS) brand, TTML delivers cloud, cybersecurity, IoT, enterprise connectivity, and smart collaboration tools to MSMEs and large enterprises.',
    kpiHeaders: [
      'Market Cap',
      'Q2 Revenue',
      'Q2 EBITDA',
      'EBITDA Mgn',
      'Finance Costs',
      'Q2 Net Loss',
      'Loss Narrowing',
      'ISCR',
    ],
    kpiValues: [
      '₹7,430.68 Cr',
      '₹309.65 Cr (+8.2%)',
      '₹164.61 Cr (+17.8%)',
      '53.16% (+431 bps)',
      '₹191.49 Cr (-54.9%)',
      '₹(59.20) Cr',
      '81.5% YoY Reduction',
      '1.09x (vs 0.82x)',
    ],
    catalysts: [
      {
        name: 'Massive 81.5% Net Loss Compression Driven by Halving of Finance Costs',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Deleveraging / Debt Restructuring',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Loss-to-Profit Turnaround)',
        body: 'Audited Q2 FY27 results show net loss collapsed from ₹(320.82) Cr in Q2 FY26 to ₹(59.20) Cr in Q2 FY27 — an 81.5% loss reduction. This was unlocked by finance costs dropping from ₹424.99 Cr to ₹191.49 Cr (-54.9% YoY), bringing Interest Service Coverage Ratio (ISCR) above 1.0x (1.09x).',
        impact:
          'Loss narrowed by ₹261.6 Cr in a single quarter; path to positive PBT within 2-3 quarters',
        timeline: 'H2 FY27 and FY28 debt refinancing horizon',
        forwardMarker: 'Continued finance cost reduction and transition to net breakeven',
        sources: ['Audited Financial Results Q2 FY27 (Annexure A, 22-Oct-2026)'],
      },
      {
        name: 'Enterprise Cloud & Connectivity Margin Expansion (EBITDA Margin up 431 bps to 53.2%)',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Operational Leverage',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'Revenue from operations rose 8.22% YoY to ₹309.65 Cr, while operating expenses fell. EBITDA expanded 17.77% YoY to ₹164.61 Cr, driving EBITDA margin to 53.16% (+431 bps YoY), reflecting high incremental margins in digital enterprise services.',
        impact: 'EBITDA margin reached 53.2%; core operational cash generation robust',
        timeline: 'FY27-FY28',
        forwardMarker: 'TTBS cloud and IoT solution customer addition numbers',
        sources: ['Statement of Audited Results Q2 FY27'],
      },
      {
        name: 'Management and Board Overhaul to Accelerate Enterprise Transformation',
        conviction: 'MEDIUM CONVICTION',
        newCategory: 'Management Change',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 1 (Organizational Restructuring)',
        body: 'On 22-Oct-2026, the Board approved the appointment of Mr. Gaurav Gupta as Additional Director, Ms. Sweety Mamodia as Company Secretary/Compliance Officer, and appointed Mr. Sai Pratyush (VP Strategy) and Mr. Vaibhav Ambradkar (GM Customer Experience) as Senior Management Personnel.',
        impact: 'Institutional strategic realignment under Tata Sons corporate oversight',
        timeline: 'Effective October-November 2026',
        forwardMarker: 'Shareholder ratification and execution of enterprise growth initiatives',
        sources: ['Outcome of Board Meeting Regulation 30 Disclosures (22-Oct-2026)'],
      },
    ],
    weeklyAnnouncements: [
      {
        date: '2026-10-22',
        title: 'Audited Financial Results for Q2 and Half Year Ended September 30, 2026',
        category: 'Financial Results',
        impact:
          'EBITDA +17.8% to ₹164.6 Cr (53.2% margin); Net loss narrowed 81.5% to ₹(59.2) Cr as finance costs fell 55%',
        sources: 'BSE/NSE Filing 22-Oct-2026',
      },
      {
        date: '2026-10-22',
        title: 'Outcome of Board Meeting - Change in Management and Directorate',
        category: 'Management Change',
        impact:
          'Appointment of VP Strategy and GM Customer Experience as Senior Management Personnel',
        sources: 'BSE/NSE Filing 22-Oct-2026',
      },
    ],
    managementInterviews: [],
    spikeDays: [
      {
        date: '2026-10-22',
        return1D: '+18.56%',
        volumeRatio: '5.6x',
        deliveryPct: '6.52%',
        trigger: 'Q2 Results beat (Net loss shrinks 81.5%, EBITDA margin 53.2%)',
        corroboration: '₹48.73 Cr delivery confirms aggressive smart-money turnaround accumulation',
      },
    ],
    whatsInThePrice:
      'Market had written off TTML as an interest-burdened legacy vehicle; the halving of finance costs and compression of quarterly net loss to just ₹59 Cr introduces a genuine path to positive PBT within 2-3 quarters.',
    superPerformanceZone:
      'EBITDA margin >53% with operating leverage in high-margin enterprise telecom services.',
    floatScarcity:
      'Tata Group holds 74.36% promoter equity, leaving limited institutional floating stock.',
    risks: [
      'High cumulative debt and negative net worth require continued sponsor financial support.',
      'Pricing competition in enterprise telecom bandwidth.',
    ],
    exitProtocol:
      'Exit if finance costs rebound or if quarterly net loss widens back above ₹150 Cr.',
    eventChainTheses: [
      {
        title: 'Interest Expense Collapse → Loss-to-Profit Turnaround Inflection',
        archetype: 'Balance Sheet Deleveraging Turnaround',
        confidence: 'GROUNDED',
        theme: 'Enterprise Digital Telecom & TTBS',
        subTheme: 'Debt Restructuring Turnaround',
        chain: [
          {
            basis: 'FACT',
            claim:
              'Q2 finance costs halved from ₹424.99 Cr to ₹191.49 Cr, compressing net loss by 81.5% to ₹59.20 Cr',
            source: 'Audited Financial Results 22-Oct-2026',
          },
          {
            basis: 'INFERENCE',
            claim:
              'EBITDA of ₹164.6 Cr now covers interest expense (ISCR 1.09x), eliminating operational cash burn',
            source: 'Financial Ratio Calculation',
          },
          {
            basis: 'HYPOTHESIS',
            claim:
              'Further refinancing will flip TTML to positive net profit by Q4 FY27, prompting massive re-rating from turnaround funds',
            source: 'SOIC Turnaround Framework',
          },
        ],
        whyMarketPays:
          'Market pays disproportionately high returns for large-cap turnaround companies transitioning from severe loss to positive net profit.',
        precedent:
          'Telecom/tower turnaround plays like Indus Towers and Tata Communications rerating 2-3x as leverage burdens eased.',
        mustBeTrue: [
          'Finance costs sustain below ₹200 Cr per quarter',
          'Enterprise EBITDA continues growing at >15% YoY',
        ],
        confirmKill: ['Audit Q3 FY27 interest charges and debt maturity schedule'],
      },
    ],
    verdict:
      'SPECULATIVE BUY / ACCUMULATE: Pure turnaround inflection with quarterly loss collapsing 81.5% on 55% interest reduction; ₹48.7 Cr delivery confirms high conviction accumulation.',
    additional: {
      turnaroundMetrics: {
        'Q2 FY26 Net Loss': '₹(320.82) Cr',
        'Q2 FY27 Net Loss': '₹(59.20) Cr (81.5% reduction)',
        'Q2 FY26 Finance Costs': '₹424.99 Cr',
        'Q2 FY27 Finance Costs': '₹191.49 Cr (54.9% reduction)',
        'Interest Service Coverage Ratio (ISCR)': '1.09x (improved from 0.82x)',
      },
    },
  };

  const ttmlPdfPath = path.join(outputDir, 'TTML_Output.pdf');
  await createReratingCatalystsPdf(ttmlDto, { outputPath: ttmlPdfPath, modelUsed });
  console.log(`[generateTop3Reports] ✅ Generated: ${ttmlPdfPath}`);

  // Save brief for TTML
  const ttmlBrief = {
    companyId: 'NSE:TTML',
    jCurveTag: ttmlDto.jCurveTag,
    jCurveReason: ttmlDto.jCurveReason,
    reratingPhase: ttmlDto.reratingPhase,
    spentFlags: ttmlDto.spentFlags,
    thesis:
      'Audited Q2 FY27 results confirm turnaround inflection: EBITDA up 17.8% YoY to ₹164.6 Cr (53.2% margin) while finance costs fell 55% to ₹191.5 Cr, shrinking net loss by 81.5% to ₹(59.20) Cr.',
    catalysts: ttmlDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['7xqh19fwgpscul2t2e5e3t1c.pdf', 'uilvrpbhaoma4igkhkugy7ru.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Audited Financial Results Q2 FY27', 'Board Meeting Outcome 22-Oct-2026'],
  };
  briefCache.putBrief('NSE:TTML', ttmlBrief);

  // ==========================================
  // BRIEFS FOR TARGETS 4-10
  // ==========================================
  console.log('[generateTop3Reports] Saving briefs for ranks 4-10...');

  // 5. NSE:SUNTECK
  briefCache.putBrief('NSE:SUNTECK', {
    companyId: 'NSE:SUNTECK',
    jCurveTag: 'MODERATE',
    jCurveReason:
      'Commercial Paper issuance of ₹50 Cr at 8.15% p.a. for working capital; Board meeting on 26-Oct (in 4d) for Q2 results with strong Mumbai luxury pre-sales velocity.',
    reratingPhase: 'IN_PROGRESS',
    spentFlags: [],
    thesis:
      'Sunteck Realty is experiencing pre-sales acceleration across Mumbai MMR luxury and aspirational residential projects, backed by low-cost CP financing (8.15%) ahead of Q2 earnings.',
    catalysts: [
      {
        name: 'Commercial Paper Issuance (₹50 Cr at 8.15% p.a.)',
        conviction: 'MEDIUM CONVICTION',
        timeline: 'Q3 FY27',
      },
      {
        name: 'Q2 Results Board Meeting Pre-Sales Momentum (26-Oct)',
        conviction: 'HIGH CONVICTION',
        timeline: 'Q2 FY27',
      },
    ],
    sourceFilingIds: ['t8xpdpd9znaeg9dfdhqbacdn.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['BSE Reg 30 CP Filing 21-Oct-2026'],
  });

  // 6. NSE:WSTCSTPAPR
  briefCache.putBrief('NSE:WSTCSTPAPR', {
    companyId: 'NSE:WSTCSTPAPR',
    jCurveTag: 'MODERATE',
    jCurveReason:
      'Integrated paper manufacturer benefiting from packaging board price hikes and wood cost stabilisation; delivery accumulation of ₹18.08 Cr.',
    reratingPhase: 'IN_PROGRESS',
    spentFlags: [],
    thesis:
      'West Coast Paper is positioned for margin normalization as packaging board realisations stabilize and raw material fiber inflation cools, driving free cash flow recovery.',
    catalysts: [
      {
        name: 'Packaging Board Realisation Recovery',
        conviction: 'MEDIUM CONVICTION',
        timeline: 'H2 FY27',
      },
      { name: 'Fiber & Energy Cost Deflation', conviction: 'HIGH CONVICTION', timeline: 'FY27' },
    ],
    sourceFilingIds: [],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: [],
  });

  // 7. BSE:VANS (NSE:544971)
  briefCache.putBrief('NSE:544971', {
    companyId: 'NSE:544971',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Received ₹4.445 Cr order from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months, representing ~19% of market cap base.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'VANS Electroengineerings is accelerating power T&D switchgear equipment execution with fresh ₹4.45 Cr high-voltage circuit breaker order driving H2 revenue surge.',
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

  // 8. NSE:BETA
  briefCache.putBrief('NSE:BETA', {
    companyId: 'NSE:BETA',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2/H1 FY27 results show H1 revenue +29.2% to ₹263 Cr with CMO surging +217%; confirmed NPPA trade margin cap at 30% has zero impact on realisations/margins; maintained ₹150 Cr branded oncology guidance.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Beta Drugs is compounding at 25%+ with CMO vertical exploding +217% and oncology formulation capacity coming back online in H2 post debottlenecking, with regulatory overhang cleared.',
    catalysts: [
      {
        name: 'CMO Business Hypergrowth (+217% YoY in H1)',
        conviction: 'HIGH CONVICTION',
        timeline: 'H2 FY27',
      },
      {
        name: 'Zero Impact from NPPA 30% Trade Margin Cap',
        conviction: 'HIGH CONVICTION',
        timeline: 'Immediate',
      },
      {
        name: 'Adley Oncology Formulation Plant Expansion Commercialisation',
        conviction: 'HIGH CONVICTION',
        timeline: 'H2 FY27',
      },
    ],
    sourceFilingIds: ['syb8woh4134iv040e84k7acs.pdf', '7x64xvzzpgyul32tfkrx90mp.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Board Meeting Outcome & MD&A 22-Oct-2026'],
  });

  // 9. NSE:PASHUPATI
  briefCache.putBrief('NSE:PASHUPATI', {
    companyId: 'NSE:PASHUPATI',
    jCurveTag: 'NONE',
    jCurveReason:
      'Cotton spinning manufacturer experiencing volume-backed accumulation without incremental capacity or pricing disclosures in 14-day window.',
    reratingPhase: 'MATURE',
    spentFlags: [],
    thesis:
      'Pashupati Cotspin trading moves reflect commodity spinning spread cycles and cotton crop arrival sentiment rather than an identified company-specific re-rating catalyst.',
    catalysts: [
      {
        name: 'Cotton Yarn Spread Normalisation',
        conviction: 'MEDIUM CONVICTION',
        timeline: 'H2 FY27',
      },
    ],
    sourceFilingIds: [],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: [],
  });

  // 10. NSE:SASKEN
  briefCache.putBrief('NSE:SASKEN', {
    companyId: 'NSE:SASKEN',
    jCurveTag: 'MODERATE',
    jCurveReason:
      'Board meeting on 28-Oct (in 6d) to consider Q2 results and Interim Dividend; ER&D automotive and satellite communications contracts driving pre-results accumulation.',
    reratingPhase: 'IN_PROGRESS',
    spentFlags: [],
    thesis:
      'Sasken Technologies is seeing earnings anticipation and dividend positioning ahead of 28-Oct board meeting, driven by 5G and automotive ER&D pipeline traction.',
    catalysts: [
      {
        name: 'Q2 Results & Interim Dividend Board Meeting (28-Oct)',
        conviction: 'HIGH CONVICTION',
        timeline: 'In 6 days',
      },
      {
        name: 'Automotive and Satellite Communication ER&D Deal Wins',
        conviction: 'MEDIUM CONVICTION',
        timeline: 'H2 FY27',
      },
    ],
    sourceFilingIds: ['15jiy1fy4lfsrag545tsstzu.pdf', 'yjq4pw07t4k5vtkfajrm9x71.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Board Meeting Intimation 21-Oct-2026'],
  });

  console.log('[generateTop3Reports] ✅ All briefs saved in brief cache successfully.');

  // ==========================================
  // SAVE 17 GAINERS-TRIGGER-RESEARCH REPORTS
  // ==========================================
  console.log('[generateTop3Reports] Saving 17 gainers-trigger-research reports to DB...');

  const researchItems = [
    {
      companyId: 'BSE:VANS',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Vans Electroengineerings surged +10.00% on ₹17.10 Cr delivery (72.45% deliv). 19-Oct announced ₹4.445 Cr order from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months (~19% of mcap).',
      trigger:
        '19-Oct order win of ₹4.445 Cr from Agrawal Power Private Limited for testing & supply of double pole vacuum circuit breakers and interrupters.',
      trigger_quantified: 'Order ₹4.445 Cr (~19% of market cap), 6-month execution window.',
      linkage: 'explained',
      why: {
        text: '19-Oct order win of ₹4.45 Cr from Agrawal Power for testing & supply of double pole vacuum circuit breakers within 6 months.',
        basis: 'filing',
        sources: ['BSE Filing 19-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'BSE:PPEL',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Poojaa Precision Engg jumped +5.14% on ₹5.77 Cr delivery (52.52% deliv). H1 FY27 results report Revenue +68% YoY to ₹210.1 Cr, EBITDA +74% to ₹39.6 Cr (19% margin), and PAT +88% to ₹24.9 Cr with Unit III Pune capex doubling melting capacity to 28,800 MTPA by Sep 2027.',
      trigger:
        'H1 FY27 results & investor presentation: Revenue +68% YoY, EBITDA +74% YoY, PAT +88% YoY; targeting 50% FY27 growth and ₹1,000 Cr turnover by FY30.',
      trigger_quantified:
        'Revenue ₹210.1 Cr (+68%), PAT ₹24.9 Cr (+88%), melting capacity doubling to 28,800 MTPA, D/E 0.08x, ROCE 36%.',
      linkage: 'explained',
      why: {
        text: 'H1 FY27 results: Revenue +68% YoY to ₹210 Cr, PAT +88% YoY to ₹24.9 Cr with Unit III Pune capex doubling melting capacity to 28,800 MTPA by Sep 2027.',
        basis: 'filing',
        sources: ['BSE Results Filing 22-Oct-2026', 'Investor Presentation H1FY27'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:IGIL',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'International Gemological Institute rose +10.00% on massive ₹124.09 Cr delivery (46.67% deliv). Q2 FY27 results beat: Consolidated Revenue +31% YoY to ₹398 Cr, EBITDA +39% to ₹244.5 Cr (61.4% margin), PAT +43% to ₹185.8 Cr on 4.35M cert reports (+26%).',
      trigger:
        'Q2 FY27 results beat with Revenue +31%, EBITDA +39%, PAT +43% YoY and 4.35 Mn certification reports delivered.',
      trigger_quantified:
        'Revenue ₹398 Cr (+31%), EBITDA margin 61.4% (+330 bps), PAT ₹185.8 Cr (+43%), delivery ₹124.09 Cr.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results beat: Consolidated Revenue +31% YoY to ₹398 Cr, EBITDA +39% YoY to ₹244.5 Cr (61.4% margin), and PAT +43% YoY to ₹185.8 Cr on 4.35M cert volume (+26%).',
        basis: 'filing',
        sources: ['Q2 Results & Press Release 21-Oct-2026'],
      },
      contextUsed: ['rpt_forward-guidance-extractor_NSE:IGIL_2026-10-14_745b8bb1'],
    },
    {
      companyId: 'NSE:SAKAR',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Sakar Healthcare gained +5.19% on ₹5.49 Cr delivery (46.38% deliv). No material regulatory filings in 14 days; volume accumulation across small-cap oncology formulations.',
      trigger:
        'No filing in 14-day window. Unexplained delivery accumulation in liquid oncology formulations.',
      trigger_quantified: 'Delivery ₹5.49 Cr, delivery % 46.38%, Mcap ₹810 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; high delivery % accumulation in oncology injectables and formulation player.',
        basis: 'none',
        sources: [],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:ONWARDTEC',
      research_axis: 'DELIVERY_PCT',
      tier: 'ACT',
      summary:
        'Onward Technologies gained +5.96% on ₹9.31 Cr delivery (44.93% deliv). 16-Oct Q2 results beat: Revenue +22.2% YoY to ₹171.2 Cr, EBITDA +33.7% YoY to ₹26.6 Cr (15.6% margin), PAT +41.2% YoY; raised FY27 outlook to 15-18% revenue growth.',
      trigger:
        '16-Oct Q2 FY27 results: Strongest-ever quarter with Revenue +22.2% YoY, EBITDA +33.7% YoY, and upward revision in FY27 guidance.',
      trigger_quantified:
        'Revenue ₹171.2 Cr (+22.2%), EBITDA margin 15.6%, FY27 guidance raised to 15-18% growth.',
      linkage: 'explained',
      why: {
        text: '16-Oct Q2 results beat: Revenue +22.2% YoY to ₹171.2 Cr, EBITDA +33.7% YoY to ₹26.6 Cr (15.6% margin), and raised FY27 guidance to 15-18% revenue growth.',
        basis: 'filing',
        sources: ['Q2 Results & Press Release 16-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:SASKEN',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Sasken Technologies gained +6.08% on ₹10.00 Cr delivery (31.90% deliv). Board meeting intimation on 21-Oct scheduled for 28-Oct-2026 to consider Q2 results and Interim Dividend.',
      trigger:
        '21-Oct Board meeting intimation for 28-Oct-2026 (in 6d) to approve Q2 FY27 financial results and declare Interim Dividend.',
      trigger_quantified: 'Results countdown in 6d, date announced 1d ago; delivery ₹10.00 Cr.',
      linkage: 'explained',
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled on 28-Oct-2026 (in 6d) to approve Q2 FY27 results and consider Interim Dividend.',
        basis: 'pre_result',
        sources: ['BSE Filing 21-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:ARMEE',
      research_axis: 'DELIVERY_PCT',
      tier: 'WATCH',
      summary:
        'Armee Infotech rose +5.05% on ₹5.05 Cr delivery (31.85% deliv). 17-Oct Q1 results: Consolidated EBITDA up 128.6% to ₹6.95 Cr, PAT turned positive to ₹1.82 Cr; secured 250 MW / 500 MWh BESS project from MSEDCL under 15-year BESPA.',
      trigger:
        '17-Oct Q1 results turnaround and award of 250 MW / 500 MWh Battery Energy Storage System (BESS) project from MSEDCL.',
      trigger_quantified:
        'EBITDA +128.6% YoY, 250 MW / 500 MWh BESS project win under 15-year agreement.',
      linkage: 'explained',
      why: {
        text: '17-Oct Q1 results turnaround (PAT turned positive to ₹1.82 Cr) and bagged 250 MW / 500 MWh BESS project from MSEDCL under 15-year agreement.',
        basis: 'filing',
        sources: ['Q1 Results Press Release 17-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:PASHUPATI',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Pashupati Cotspin rose +5.46% on ₹16.40 Cr delivery (27.98% deliv). No material filings in 14-day window; spinning industry delivery accumulation.',
      trigger:
        'No filing in 14-day window. Unexplained delivery-backed accumulation in cotton spinning.',
      trigger_quantified: 'Delivery ₹16.40 Cr, delivery % 27.98%, Mcap ₹680 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; sustained delivery accumulation in spinning player.',
        basis: 'none',
        sources: [],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:PLATIND',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'Platinum Industries gained +5.16% on ₹9.55 Cr delivery (26.03% deliv). No company filing in 14 days; volume surge in specialty PVC stabilizers and polymer additives.',
      trigger: 'No filing in 14-day window. Specialty polymer additives price-volume move.',
      trigger_quantified: 'Delivery ₹9.55 Cr, delivery % 26.03%, Mcap ₹1,580 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; volume-backed accumulation in specialty polymer additives.',
        basis: 'none',
        sources: [],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:SRIT',
      research_axis: 'DELIVERY_PCT',
      tier: 'NOTED',
      summary:
        'SRIT India jumped +10.02% on ₹7.01 Cr delivery (25.04% deliv). Board meeting scheduled on 26-Oct-2026 (in 4d) to approve Q2 FY27 results.',
      trigger:
        'Pre-results accumulation: Board meeting intimation on 17-Oct scheduled for 26-Oct-2026 (in 4d) to consider Q2 FY27 results.',
      trigger_quantified: 'Result countdown in 4d, delivery ₹7.01 Cr.',
      linkage: 'explained',
      why: {
        text: 'Pre-results accumulation: Board meeting scheduled for 26-Oct-2026 (in 4d) to approve Q2 FY27 financial results.',
        basis: 'pre_result',
        sources: ['BSE Filing 17-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:OMNI',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Omnitech Engineering jumped +15.54% on ₹93.69 Cr delivery (6.71% deliv). 21-Oct press release announced commercial orders secured from leading Indian defence organisations for mission-critical land-based systems and advanced sub-systems.',
      trigger:
        '21-Oct announcement of commercial orders secured from leading Indian defence organisations for mission critical applications of land-based systems and advanced sub-systems.',
      trigger_quantified:
        'Defence orders converting qualification optionality to backlog; delivery ₹93.69 Cr.',
      linkage: 'explained',
      why: {
        text: '21-Oct announcement of commercial orders secured from leading Indian defence organisations for land-based and advanced mission-critical sub-systems.',
        basis: 'filing',
        sources: ['BSE/NSE Press Release 21-Oct-2026'],
      },
      contextUsed: [
        'rpt_gainers-signal_NSE:OMNI_2026-10-02_6e4e70f1',
        'rpt_gainers-signal_NSE:OMNI_2026-10-01_6e4e70f1',
      ],
    },
    {
      companyId: 'NSE:TTML',
      research_axis: 'DELIVERY_VALUE',
      tier: 'ACT',
      summary:
        'Tata Teleservices (Maharashtra) surged +18.56% on ₹48.73 Cr delivery (6.52% deliv). 22-Oct audited Q2 results confirm turnaround: EBITDA +17.8% YoY to ₹164.6 Cr (53.2% margin) while finance costs dropped 55% YoY to ₹191.5 Cr, shrinking net loss by 81.5% to ₹(59.20) Cr.',
      trigger:
        '22-Oct audited Q2 results: Net loss collapsed 81.5% YoY to ₹(59.20) Cr as finance costs dropped from ₹425 Cr to ₹191.5 Cr; enterprise EBITDA margin reached 53.2%.',
      trigger_quantified:
        'Finance costs reduced by ₹233.5 Cr YoY; Net loss narrowed 81.5% to ₹59.2 Cr; Delivery ₹48.73 Cr.',
      linkage: 'explained',
      why: {
        text: '22-Oct Q2 results turnaround: EBITDA up 17.8% YoY to ₹164.6 Cr (53.2% margin) and finance costs cut by 55% YoY, narrowing net loss by 81.5% to ₹59.2 Cr.',
        basis: 'filing',
        sources: ['Audited Q2 Financial Results 22-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:KROSS',
      research_axis: 'DELIVERY_VALUE',
      tier: 'WATCH',
      summary:
        'Kross Ltd gained +5.84% on ₹31.15 Cr delivery (15.75% deliv). 17-Oct Q2 results explosion: Revenue +79.6% YoY to ₹235 Cr, EBITDA +107.4% to ₹30.6 Cr, and PAT +143.5% to ₹19.7 Cr alongside commissioning of axle beam extrusion plant.',
      trigger:
        '17-Oct Q2 results: Revenue +79.6% YoY, EBITDA +107.4% YoY, PAT +143.5% YoY following axle beam extrusion plant commissioning.',
      trigger_quantified: 'Revenue +79.6% YoY, PAT +143.5% YoY, delivery ₹31.15 Cr.',
      linkage: 'explained',
      why: {
        text: '17-Oct Q2 results explosion: Revenue +79.6% YoY to ₹235 Cr, EBITDA +107.4% to ₹30.6 Cr, and PAT +143.5% to ₹19.7 Cr following axle beam plant commissioning.',
        basis: 'filing',
        sources: ['Q2 Earnings Press Release 17-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:SUNTECK',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'Sunteck Realty rose +5.29% on ₹18.34 Cr delivery (3.53% deliv). 21-Oct Commercial Paper issuance of ₹50 Cr at 8.15% p.a.; Board meeting scheduled on 26-Oct (in 4d) for Q2 results.',
      trigger:
        '21-Oct Commercial Paper issuance of ₹50 Cr at 8.15% p.a. and pre-results positioning ahead of 26-Oct board meeting.',
      trigger_quantified: 'CP issuance ₹50 Cr at 8.15% p.a., delivery ₹18.34 Cr.',
      linkage: 'explained',
      why: {
        text: '21-Oct Commercial Paper issuance of ₹50 Cr at 8.15% p.a. alongside pre-results positioning ahead of 26-Oct Q2 board meeting.',
        basis: 'filing',
        sources: ['BSE Filing 21-Oct-2026'],
      },
      contextUsed: [],
    },
    {
      companyId: 'NSE:WSTCSTPAPR',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'West Coast Paper Mills rose +6.41% on ₹18.08 Cr delivery (12.34% deliv). No filing in 14-day window; paper sector rotation and packaging board pricing recovery.',
      trigger: 'No filing in 14-day window. Paper sector price-volume accumulation.',
      trigger_quantified: 'Delivery ₹18.08 Cr, delivery % 12.34%, Mcap ₹3,840 Cr.',
      linkage: 'unexplained',
      why: {
        text: 'No discoverable trigger in 14-day exchange filings; paper sector price-volume accumulation.',
        basis: 'none',
        sources: [],
      },
      contextUsed: ['rpt_gainers-signal_gainers-trigger-research_NSE_WSTCSTPAPR_2026-10-14'],
    },
    {
      companyId: 'NSE:BETA',
      research_axis: 'DELIVERY_VALUE',
      tier: 'WATCH',
      summary:
        'Beta Drugs surged +18.40% on ₹16.86 Cr delivery (15.82% deliv). 22-Oct Q2 results: H1 revenue +29.2% to ₹263 Cr with CMO business up 217%; confirmed NPPA 30% trade margin cap has zero impact on realisations/margins.',
      trigger:
        '22-Oct Q2 results & MD&A: H1 revenue +29.2% YoY, CMO business surging +217%, and management confirmation of zero impact from NPPA trade margin capping.',
      trigger_quantified: 'H1 revenue ₹263 Cr (+29.2%), CMO +217%, delivery ₹16.86 Cr.',
      linkage: 'explained',
      why: {
        text: '22-Oct Q2 results: H1 revenue +29.2% YoY to ₹263 Cr with CMO surging +217% and management confirming zero impact from NPPA trade margin cap.',
        basis: 'filing',
        sources: ['Board Meeting Outcome 22-Oct-2026'],
      },
      contextUsed: ['rpt_forward-guidance-extractor_NSE:BETA_2026-09-20_745b8bb1'],
    },
    {
      companyId: 'NSE:MTNL',
      research_axis: 'DELIVERY_VALUE',
      tier: 'NOTED',
      summary:
        'MTNL gained +10.99% on ₹5.36 Cr delivery (10.16% deliv). No company filing in 14 days; sympathy co-movement alongside Tata Teleservices (+18.6%) in telecom services sector.',
      trigger: 'Sympathy move with peer TTML (+18.6%) following TTML loss-compression results.',
      trigger_quantified: 'Delivery ₹5.36 Cr, +10.99% return.',
      linkage: 'explained',
      why: {
        text: 'Sympathy move with peer Tata Teleservices (+18.6%) in telecom services following TTML loss-compression results.',
        basis: 'sector',
        sources: ['Telecom Services Sector Co-movement'],
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
