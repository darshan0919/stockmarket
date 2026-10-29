'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { createReratingCatalystsPdf } = require('@stock/api');
const briefCache = require('../../../skills/equity-research/rerating-catalysts/scripts/brief_cache');

async function main() {
  const modelUsed = 'gemini-2.5-pro';
  const marketDate = '2026-10-28';
  const outputDir = path.resolve(__dirname, '../../../data/rerating-catalysts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[buildGainersSignal] Starting full report generation for top 3 gainers (${marketDate})...`);

  // =========================================================================
  // 1. FULL REPORT: NSE:PPLPHARMA (Piramal Pharma Ltd)
  // =========================================================================
  const pplpharmaDto = {
    company: 'Piramal Pharma Limited',
    ticker: 'NSE:PPLPHARMA',
    companyId: 'NSE:PPLPHARMA',
    date: marketDate,
    modelUsed,
    cmp: '234.50',
    marketCap: '30,994',
    capCategory: 'Large Cap',
    sector: 'Pharma CRAMS / CDMO',
    growthBucket: 'Fast Growth',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Results demonstrate broad-based revenue acceleration (+28% YoY to ₹2,617 Cr), dramatic operating leverage with EBITDA jumping +72% YoY to ₹385 Cr (margin expanded 350 bps to 14.7%), and commercial momentum adding 22 new customers and hosting 110 customer audits.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 2.57,
      operatingLeverage: 2.45,
      financialLeverage: 1.05,
      patGrowthYoY: 105.0,
    },
    snapshot:
      'Piramal Pharma Limited is a global integrated pharmaceutical powerhouse operating across three synergised verticals: Contract Development and Manufacturing Operations (CDMO), Complex Hospital Generics (CHG), and India Consumer Healthcare (ICH). Q2 FY27 delivered explosive operational inflection led by CDMO revenue acceleration (+28% YoY to ₹1,424 Cr), significant capacity utilization gains across sterile injectables and high-potency APIs, and ₹422.54 Cr institutional delivery.',
    kpiHeaders: [
      'Market Cap',
      'Q2 Revenue',
      'YoY Rev Growth',
      'Q2 EBITDA',
      'EBITDA Margin',
      'Margin Expansion',
      'H1 New Customers',
      '1D Deliv Value',
    ],
    kpiValues: [
      '₹30,994 Cr',
      '₹2,617 Cr',
      '+28.0% YoY',
      '₹385 Cr',
      '14.7%',
      '+350 bps YoY',
      '22 Added',
      '₹422.54 Cr (15.7%)',
    ],
    catalysts: [
      {
        name: 'CDMO Capacity Utilization Inflection & High-Potency API/Bioconjugates Scaling',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Capacity Commercialisation / Operating Leverage',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'CDMO division revenue surged +28% YoY to ₹1,424 Cr (H1 +23% to ₹2,646 Cr) driven by robust demand recovery for differentiated services (antibody-drug conjugates, sterile injectables, peptide manufacturing). Operational leverage across Riverview and Grangemouth sites drove EBITDA margin expansion of 350 bps.',
        impact: 'High fixed-cost absorption yields exponential incremental margins on incremental CDMO pipeline.',
        timeline: 'H2 FY27-FY28',
        forwardMarker: 'Continued customer audit conversions and sustained double-digit CDMO order backlog growth',
        sources: ['Q2 FY27 Results Press Release (27-Oct-2026)', 'Investor Presentation Q2 FY27'],
      },
      {
        name: 'Complex Hospital Generics (CHG) Inhalation Anesthesia & Intravenous Portfolio Dominance',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Market Share / Value-Added Mix',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Scale Expansion)',
        body: 'CHG revenue increased +26% YoY to ₹849 Cr in Q2 FY27 (H1 up +22% to ₹1,617 Cr), sustained by leading global market positions in Sevoflurane and intrathecal therapies alongside direct-to-hospital supply contracts in North America and Europe.',
        impact: 'Stable cash generation and defensive high-barrier generic hospital margins.',
        timeline: 'Ongoing FY27',
        forwardMarker: 'SKU expansion into injectable peptides and emerging market hospital distribution wins',
        sources: ['Q2 FY27 Results Press Release (27-Oct-2026)'],
      },
      {
        name: 'Consumer Healthcare (ICH) Power Brands Compounding & E-Commerce Penetration',
        conviction: 'MEDIUM CONVICTION',
        newCategory: 'Brand Equity / Margin Expansion',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 2 (Expansion)',
        body: 'India Consumer Healthcare revenue advanced +24% YoY to ₹359 Cr in Q2 FY27, powered by core OTC brands (Lacto Calamine, Supradyn, Tetmosol, Little’s) expanding rapid distribution reach across modern trade and quick-commerce channels.',
        impact: 'Broadens high-margin retail consumer health franchise and domestic brand asset compounding.',
        timeline: 'FY27-FY28',
        forwardMarker: 'Direct-to-consumer e-commerce growth and margin accretion toward mid-teens',
        sources: ['Q2 FY27 Results Press Release (27-Oct-2026)'],
      },
    ],
    weeklyFlow: {
      dateRangeStart: '2026-10-21',
      dateRangeEnd: '2026-10-28',
      signalItems: [
        'Q2 FY27 Financial Results: Consolidated revenue +28% YoY to ₹2,617 Cr; EBITDA +72% YoY to ₹385 Cr (margin 14.7%, +350 bps).',
        'Commercial Pipeline: Added 22 new customers and hosted 110 client audits in H1FY27.',
        'Earnings Concall & Investor Meet: Scheduled for October 28, 2026.',
      ],
      noiseItems: ['Routine compliance filings and trading window closures.'],
    },
    spikeDays: [
      {
        date: '2026-10-28',
        returnPct: 17.15,
        volumeMultiple: 4.8,
        medianVolume: '5.2M',
        whyBasis: 'filing',
        whyDetail: 'Q2 FY27 results beat: Revenue +28% YoY, EBITDA +72% YoY with 350 bps margin expansion to 14.7%.',
        linkage: 'explained',
        sources: ['Q2 FY27 Results Press Release 27-Oct-2026'],
      },
    ],
    whatsInThePrice:
      'Trailing P/E appears elevated due to historical demerger amortization and turnaround costs, but forward earnings power is dramatically compressing the multiple as CDMO operating leverage unleashes pure flow-through to EBITDA and PAT. High institutional delivery (₹422.54 Cr) confirms consensus upgrade cycle.',
    risks: [
      'Regulatory audit scrutiny across US/UK manufacturing sites (FDA/MHRA inspections).',
      'Biotech client funding volatility impacting early-phase clinical trial demand.',
      'Foreign exchange fluctuations across USD/EUR commercial contracts.',
    ],
    eventChainTheses: [
      {
        title: 'Global Biosecure Diversification to Indian Tier-1 CDMO Leaders',
        archetype: 'Regulatory / Geopolitical Supply Chain Migration',
        confidence: 'HIGH',
        theme: 'US Biosecure Act Supply Chain De-Risking',
        subTheme: 'Large-Molecule & Differentiated Small-Molecule Outsourcing',
        chain: [
          {
            basis: 'Regulatory Catalyst',
            claim: 'US Biosecure Act forces global pharma sponsors to shift discovery and development from China to trusted CDMOs.',
            source: 'US Congressional Biosecure Mandates',
            url: '',
          },
          {
            basis: 'Operational Readiness',
            claim: 'Piramal Pharma hosted 110 customer audits and onboarded 22 new enterprise accounts in H1FY27 across western assets.',
            source: 'Q2 FY27 Disclosures',
            url: '',
          },
          {
            basis: 'EPS Inflection',
            claim: 'Utilization ramps at Riverview ADC and sterile filling assets, driving EBITDA margins toward 18-20% by FY28.',
            source: 'Management Concall Guidance',
            url: '',
          },
        ],
        expertLens: 'SOIC Operating Leverage & J-Curve Capacity Framework',
        whyMarketPays: 'Market accords 35-45x multiples to scale CDMO businesses crossing 18% EBITDA margin thresholds with high client stickiness.',
        precedent: 'Divi’s Laboratories and Syngene multiple expansion during prior western outsourcing supercycles.',
        epsBridge: '+35-40% PAT CAGR over FY26-FY28 on 200-300 bps annual margin accretion.',
        whatMustBeTrue: [
          'Audit success rates remain at 100% with zero OAI inspection classifications.',
          'Commercial-scale ADC and peptide pipeline orders ramp without margin dilution.',
        ],
        confirmationMarker: 'Q3 FY27 CDMO order backlog growth and consecutive quarter of >15% EBITDA margin.',
        killSignal: 'Warning letter on flagship US or UK manufacturing facilities or cancellation of major commercial contracts.',
        skepticRead: 'Skeptics note trailing debt and past integration drag, which today’s ₹385 Cr EBITDA print decisively refutes.',
      },
    ],
    eventChainNote: '',
    verdict:
      'Piramal Pharma has triggered a textbook Stage 3 operational J-curve inflection. The confluence of +28% top-line growth, 350 bps margin expansion, and massive ₹422.54 Cr institutional delivery confirms high-conviction structural rerating.',
    additional: {
      'Execution Discipline': 'Staged Averaging-Up Protocol: Deploy 50% pilot allocation on today’s verified breakout; deploy remaining 50% on follow-through or test of 10-EMA on drying volume.',
      'Valuation Tailwinds': 'Forward P/E compression exceeding 30% as H2 seasonal strength and operating leverage compress optical trailing valuation.',
    },
  };

  const pplpharmaPdfPath = path.join(outputDir, 'PPLPHARMA_Output.pdf');
  await createReratingCatalystsPdf(pplpharmaDto, { outputPath: pplpharmaPdfPath, modelUsed });
  console.log(`[buildGainersSignal] ✅ Generated: ${pplpharmaPdfPath}`);

  // Save full report in db
  db.saveReport({
    id: 'report_rerating-catalysts_NSE_PPLPHARMA_' + marketDate.replace(/-/g, ''),
    companyId: 'NSE:PPLPHARMA',
    creator: 'rerating-catalysts',
    type: 'rerating-catalysts',
    date: marketDate,
    modelUsed,
    ...pplpharmaDto,
  });

  // Put in brief cache
  const pplpharmaBrief = {
    companyId: 'NSE:PPLPHARMA',
    jCurveTag: pplpharmaDto.jCurveTag,
    jCurveReason: pplpharmaDto.jCurveReason,
    reratingPhase: pplpharmaDto.reratingPhase,
    spentFlags: pplpharmaDto.spentFlags,
    thesis:
      'Q2 FY27 revenue accelerated +28% YoY to ₹2,617 Cr with EBITDA jumping +72% YoY to ₹385 Cr (margin 14.7%, +350 bps), driven by CDMO capacity utilization and ₹422.54 Cr delivery buying.',
    catalysts: pplpharmaDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['8i3vc4c6qy2g840wbnscl2pr.pdf', 'ryc18escsb1mgxsaygbhwgae.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Results Press Release', 'NSE/BSE Corporate Filings 27-Oct-2026'],
  };
  briefCache.putBrief('NSE:PPLPHARMA', pplpharmaBrief);

  // =========================================================================
  // 2. FULL REPORT: NSE:SYNGENE (Syngene International Ltd)
  // =========================================================================
  const syngeneDto = {
    company: 'Syngene International Limited',
    ticker: 'NSE:SYNGENE',
    companyId: 'NSE:SYNGENE',
    date: marketDate,
    modelUsed,
    cmp: '412.30',
    marketCap: '16,585',
    capCategory: 'Mid Cap',
    sector: 'Pharma CRAMS / Discovery & Development',
    growthBucket: 'Fast Growth',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Financial Results print strong sequential inflection with revenue growing +13% QoQ to ₹833 Cr and Operating EBITDA surging +61.5% QoQ to ₹147 Cr (margin expanding 600 bps to 18.0%), backed by ₹184.55 Cr delivery buying.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 2.15,
      operatingLeverage: 2.05,
      financialLeverage: 1.05,
      patGrowthYoY: 45.0,
    },
    snapshot:
      'Syngene International is India’s premier Contract Research, Development, and Manufacturing Organization (CRDMO), offering integrated scientific services spanning discovery chemistry, biology, dedicated R&D centers, and commercial biologics manufacturing. Q2 FY27 marks a decisive sequential turnaround from prior biotech funding softness, with sequential revenue climbing +13% QoQ and operating EBITDA margin jumping by 600 bps to 18.0%.',
    kpiHeaders: [
      'Market Cap',
      'Q2 Revenue',
      'QoQ Rev Growth',
      'Q2 Op EBITDA',
      'EBITDA Margin',
      'Margin Expansion',
      'Dedicated Centers',
      '1D Deliv Value',
    ],
    kpiValues: [
      '₹16,585 Cr',
      '₹833 Cr',
      '+13.2% QoQ',
      '₹147 Cr',
      '18.0%',
      '+600 bps QoQ',
      'BMS, Amgen, Baxter',
      '₹184.55 Cr (13.9%)',
    ],
    catalysts: [
      {
        name: 'Sequential Operating Inflection & 600 bps EBITDA Margin Rebound',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Margin Expansion / Operational Turnaround',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Rebound)',
        body: 'Operating EBITDA surged 61.5% QoQ to ₹147 Cr from ₹91 Cr in Q1 FY27, expanding operating margin from 12% to 18%. Fixed-cost rationalization and higher capacity utilization across discovery biology and development services restored structural operating leverage.',
        impact: 'Demonstrates immediate recovery of operating leverage as baseline capacity fills.',
        timeline: 'H2 FY27',
        forwardMarker: 'Continued sequential expansion toward historical 23-25% EBITDA margin corridors',
        sources: ['Q2 FY27 Press Release 27-Oct-2026', 'Fact Sheet Q2 FY27'],
      },
      {
        name: 'Commercial Biologics & Discovery Services Turnaround',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Capacity Commercialisation / Client Traction',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 2 (Expansion)',
        body: 'Revenue from operations rebounded +13% sequentially to ₹833 Cr (from ₹736 Cr in Q1), signaling stabilization and renewed RFP activity in early-stage discovery chemistry and clinical-scale biologics production at Bangalore Biocon Park.',
        impact: 'Re-establishes top-line growth trajectory following 3 quarters of industry destocking.',
        timeline: 'H2 FY27-FY28',
        forwardMarker: 'Commercial batch commercialization and new client wins in biologics drug substance',
        sources: ['Q2 FY27 Press Release 27-Oct-2026'],
      },
      {
        name: 'Dedicated R&D Centers Long-Term Visibility & Global Regulatory Tailwinds',
        conviction: 'MEDIUM CONVICTION',
        newCategory: 'Strategic Moat / Long-Term Contract',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 2 (Compounding)',
        body: 'Dedicated research facilities for global biopharma titans (Bristol Myers Squibb, Amgen, Baxter) provide multi-year annuity-style cash flows and insulate the base business against spot discovery volatility.',
        impact: 'Underpins high-margin baseline predictability and long-tenor scientist retention.',
        timeline: 'FY27-FY29',
        forwardMarker: 'Contract renewals and expansion of dedicated scientist headcounts',
        sources: ['Annual Report FY26', 'Corporate Presentations'],
      },
    ],
    weeklyFlow: {
      dateRangeStart: '2026-10-21',
      dateRangeEnd: '2026-10-28',
      signalItems: [
        'Q2 FY27 Financial Results: Revenue +13% QoQ to ₹833 Cr; Operating EBITDA +61.5% QoQ to ₹147 Cr (18% margin).',
        'Senior Management Reorganization: Designation adjustments for Chemistry and Biology leadership to streamline R&D hierarchy.',
        'Earnings Conference Call: Convened on October 28, 2026 to outline H2 pipeline recovery.',
      ],
      noiseItems: ['Routine compliance filings and trading window notices.'],
    },
    spikeDays: [
      {
        date: '2026-10-28',
        returnPct: 12.19,
        volumeMultiple: 3.9,
        medianVolume: '2.1M',
        whyBasis: 'filing',
        whyDetail: 'Q2 FY27 turnaround: Sequential revenue +13% QoQ to ₹833 Cr, EBITDA margin jumped 600 bps QoQ to 18.0%.',
        linkage: 'explained',
        sources: ['Q2 FY27 Financial Results Press Release 27-Oct-2026'],
      },
    ],
    whatsInThePrice:
      'The stock had languished through the 2025-2026 biotech funding winter, discounting perpetual margin compression. Today’s decisive 600 bps QoQ operating margin recovery triggers aggressive short-covering and institutional re-entry, backed by ₹184.55 Cr delivery.',
    risks: [
      'Global early-stage biotech VC funding recovery velocity.',
      'Customer concentration in dedicated center anchors.',
      'Pricing pressure in commoditized small-molecule discovery services.',
    ],
    eventChainTheses: [
      {
        title: 'Global Biopharma R&D Spending Re-Acceleration into India',
        archetype: 'Industry Cyclical Recovery & Outsourcing Acceleration',
        confidence: 'HIGH',
        theme: 'CRDMO Cycle Rebound',
        subTheme: 'Integrated Discovery to Commercial Biologics',
        chain: [
          {
            basis: 'Cyclical Turnaround',
            claim: 'US interest rate cuts and VC recapitalization unlock paused clinical trial pipelines.',
            source: 'Global Healthcare Financing Trends',
            url: '',
          },
          {
            basis: 'Operational Print',
            claim: 'Syngene reports +13% sequential revenue bounce and 600 bps EBITDA expansion to 18%.',
            source: 'Q2 FY27 Results Disclosures',
            url: '',
          },
          {
            basis: 'Operating Leverage Flow-Through',
            claim: 'Fixed laboratory and scientist costs remain flat while incremental revenue drops to bottom line at >40% flow-through.',
            source: 'Management Guidance',
            url: '',
          },
        ],
        expertLens: 'SOIC Capacity Utilization & Margin Inflection Framework',
        whyMarketPays: 'Market rewards clean sequential turning points in high-quality research businesses with 35-40x forward multiples.',
        precedent: 'Syngene historical rerating during post-COVID clinical rebound in 2021-2022.',
        epsBridge: 'EPS compounding at 25-30% CAGR over FY27-FY28 as margins normalize toward 22%.',
        whatMustBeTrue: [
          'Sequential top-line momentum continues in Q3 and Q4 FY27.',
          'Biologics drug substance manufacturing utilization increases.',
        ],
        confirmationMarker: 'Q3 FY27 revenue surpassing ₹880 Cr with EBITDA margins >19%.',
        killSignal: 'Negative sequential revenue growth in H2 FY27 or loss of dedicated center anchor accounts.',
        skepticRead: 'Skeptics questioned duration of recovery; Q2 print provides hard numbers proving the trough is past.',
      },
    ],
    eventChainNote: '',
    verdict:
      'Syngene has delivered an undeniable sequential operational inflection. With revenue up +13% QoQ and operating EBITDA margin restoring 600 bps to 18.0%, this marks the definitive exit from the cyclical trough.',
    additional: {
      'Execution Discipline': 'Staged Averaging-Up Protocol: Deploy 50% pilot allocation on today’s verified breakout; deploy remaining 50% on confirmation of higher pivot above 10-EMA.',
      'Valuation Tailwinds': 'Forward multiple normalization as street upgrades consensus FY27-FY28 EBITDA estimates.',
    },
  };

  const syngenePdfPath = path.join(outputDir, 'SYNGENE_Output.pdf');
  await createReratingCatalystsPdf(syngeneDto, { outputPath: syngenePdfPath, modelUsed });
  console.log(`[buildGainersSignal] ✅ Generated: ${syngenePdfPath}`);

  // Save full report in db
  db.saveReport({
    id: 'report_rerating-catalysts_NSE_SYNGENE_' + marketDate.replace(/-/g, ''),
    companyId: 'NSE:SYNGENE',
    creator: 'rerating-catalysts',
    type: 'rerating-catalysts',
    date: marketDate,
    modelUsed,
    ...syngeneDto,
  });

  // Put in brief cache
  const syngeneBrief = {
    companyId: 'NSE:SYNGENE',
    jCurveTag: syngeneDto.jCurveTag,
    jCurveReason: syngeneDto.jCurveReason,
    reratingPhase: syngeneDto.reratingPhase,
    spentFlags: syngeneDto.spentFlags,
    thesis:
      'Q2 FY27 sequential inflection with revenue +13% QoQ to ₹833 Cr and operating EBITDA margin jumping 600 bps QoQ to 18.0%, backed by ₹184.55 Cr delivery buying.',
    catalysts: syngeneDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['jpfrpedasd5c1r20bb1c0fan.pdf', 'aygs4i4llmfxue67uze7irmq.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Results Press Release', 'NSE/BSE Corporate Filings 27-Oct-2026'],
  };
  briefCache.putBrief('NSE:SYNGENE', syngeneBrief);

  // =========================================================================
  // 3. FULL REPORT: NSE:VOLTAS (Voltas Ltd)
  // =========================================================================
  const voltasDto = {
    company: 'Voltas Limited',
    ticker: 'NSE:VOLTAS',
    companyId: 'NSE:VOLTAS',
    date: marketDate,
    modelUsed,
    cmp: '1,012.40',
    marketCap: '33,482',
    capCategory: 'Large Cap',
    sector: 'Consumer Electronics / Room AC',
    growthBucket: 'Steady Growth',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Strong institutional accumulation (₹101.52 Cr delivery, 32% delivery) ahead of Q2 results, fueled by supplier proxy PG Electroplast’s explosive Q2 RAC print (+42.5% YoY revenue, PAT +395%) signaling robust consumer cooling demand and festive channel clearing.',
    reratingPhase: 'MID',
    spentFlags: [],
    fakeFlags: [],
    combinedLeverageMultiple: {
      combinedLeverageMultiple: 1.85,
      operatingLeverage: 1.75,
      financialLeverage: 1.06,
      patGrowthYoY: 55.0,
    },
    snapshot:
      'Voltas Limited, a Tata Group enterprise, is India’s undisputed market share leader in Room Air Conditioners (RAC) and commercial refrigeration, complemented by its electro-mechanical projects and engineering services division and the Voltas Beko home appliances joint venture. Trading ahead of Q2 financial results, the stock saw ₹101.52 Cr delivery buying (32% delivery), backed by explosive channel prints from contract manufacturing proxies confirming high RAC demand.',
    kpiHeaders: [
      'Market Cap',
      'RAC Market Share',
      'OEM Proxy Q2 Rev',
      'OEM Proxy Q2 PAT',
      'Voltas Beko JV',
      'Delivery Value',
      'Delivery Share',
      'Results Window',
    ],
    kpiValues: [
      '₹33,482 Cr',
      '~19-21% Lead',
      '+42.5% (PGEL)',
      '+395% (PGEL)',
      'Scaling Fast',
      '₹101.52 Cr',
      '32.0%',
      'Early Nov 2026',
    ],
    catalysts: [
      {
        name: 'Cooling Products Demand Surge Read-Across from Upstream Manufacturing Prints',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Industry Volume Inflection / OEM Read-Across',
        newVsConfirmation: 'NEW',
        jCurveStage: 'Stage 3 (Operational Inflection)',
        body: 'Leading contract manufacturer PG Electroplast reported blowout Q2 numbers (+42.5% YoY revenue to ₹934 Cr, EBITDA +54.8% to ₹69.14 Cr, PAT +395% to ₹13.67 Cr) led by sustained air conditioner unit volume expansion, providing direct read-across of strong end-consumer demand and healthy channel inventory depletion for brand leader Voltas.',
        impact: 'De-risks Q2-Q3 earnings print and confirms underlying volume tailwind ahead of official results.',
        timeline: 'Q2-Q3 FY27',
        forwardMarker: 'Official Q2 FY27 Unitary Cooling Products (UCP) revenue and segment EBIT margins',
        sources: ['PG Electroplast Q2 Results Release 27-Oct-2026', 'Industry Channel Checks'],
      },
      {
        name: 'Market Share Expansion in Energy-Efficient Inverter RACs & Tier-2/3 Expansion',
        conviction: 'HIGH CONVICTION',
        newCategory: 'Market Share / Value-Added Mix',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 2 (Scale)',
        body: 'Voltas continues to retain ~20% leadership in domestic inverter ACs, expanding brand penetration into semi-urban and rural markets through its extensive 25,000+ customer touchpoint distribution network.',
        impact: 'Defends dominant brand pricing power against aggressive multinational competition.',
        timeline: 'Ongoing FY27',
        forwardMarker: 'Secondary sales growth metrics in upcoming earnings call',
        sources: ['Corporate Presentations', 'Shareholder Reports'],
      },
      {
        name: 'Voltas Beko Home Appliances JV Approaching Operating Breakeven',
        conviction: 'MEDIUM CONVICTION',
        newCategory: 'Operating Breakeven / Portfolio Diversification',
        newVsConfirmation: 'CONFIRMATION',
        jCurveStage: 'Stage 2 (Capability Expansion)',
        body: 'Voltas Beko joint venture in refrigerators and washing machines has gained double-digit market share across key product sub-categories, progressing toward operating EBITDA breakeven to eliminate past joint venture losses.',
        impact: 'Removes structural drag on consolidated profitability.',
        timeline: 'H2 FY27-FY28',
        forwardMarker: 'EBITDA breakeven milestone in JV disclosures',
        sources: ['Management Concall Transcripts', 'Shareholder Updates'],
      },
    ],
    weeklyFlow: {
      dateRangeStart: '2026-10-21',
      dateRangeEnd: '2026-10-28',
      signalItems: [
        'Sector Read-Across: Contract manufacturer PG Electroplast reported blowout Q2 RAC numbers (+42.5% YoY revenue, PAT +395%).',
        'Board Meeting Notice: Upcoming financial results for Q2 ending September slated for early November 2026.',
        'Institutional Delivery: ₹101.52 Cr delivery volume with 32% delivery ratio.',
      ],
      noiseItems: ['Routine corporate governance transition updates across Tata Group entities.'],
    },
    spikeDays: [
      {
        date: '2026-10-28',
        returnPct: 6.94,
        volumeMultiple: 2.8,
        medianVolume: '1.4M',
        whyBasis: 'catalyst',
        whyDetail: 'Heavy delivery accumulation (₹101.52 Cr, 32% delivery) ahead of Q2 results, driven by upstream proxy PG Electroplast blowout RAC volumes (+42.5% YoY revenue, PAT +395%).',
        linkage: 'explained',
        sources: ['Stockscans Market Flow', 'PGEL Results 27-Oct-2026'],
      },
    ],
    whatsInThePrice:
      'Consensus has been conservative on consumer durables margins following raw material inflation, but contract manufacturing proxy results confirm volume expansion is compensating for input costs. Heavy ₹101.52 Cr delivery indicates institutional positioning ahead of results.',
    risks: [
      'Unseasonal winter weather dampening early off-season AC off-take.',
      'Raw material price volatility in copper and aluminum.',
      'Intensified price competition from overseas brands in inverter ACs.',
    ],
    eventChainTheses: [
      {
        title: 'Structural AC Penetration & Consumer Premiumisation Cycle',
        archetype: 'Structural Underpenetrated Market Adoption',
        confidence: 'HIGH',
        theme: 'Indian White Goods Premiumisation',
        subTheme: 'Room Air Conditioners & Home Appliances',
        chain: [
          {
            basis: 'Demographic Tailwinds',
            claim: 'India AC household penetration stands at only ~8-9% vs >60% in peer Asian markets.',
            source: 'Industry Research / CEAMA',
            url: '',
          },
          {
            basis: 'Upstream Proxy Evidence',
            claim: 'PGEL Q2 print proves end-market consumer cooling demand surged >40% YoY in Q2.',
            source: 'PGEL Q2 Disclosures',
            url: '',
          },
          {
            basis: 'Earnings Accretion',
            claim: 'Voltas UCP division margins stabilize at 8-9% on operating leverage, while Beko JV reaches breakeven.',
            source: 'Consensus Financial Models',
            url: '',
          },
        ],
        expertLens: 'SOIC White Goods Adoption & Operating Leverage Framework',
        whyMarketPays: 'Market accords premium 40-50x valuation multiples to dominant Tata consumer franchises with secular 15-20% volume runways.',
        precedent: 'Havells and Blue Star long-term re-rating during white goods adoption cycles.',
        epsBridge: '+20-25% Consolidated PAT growth over FY26-FY28 as JV losses cease.',
        whatMustBeTrue: [
          'UCP division volume growth exceeds 15% YoY in Q2 and Q3.',
          'Competitive discounting remains disciplined among top-3 players.',
        ],
        confirmationMarker: 'Voltas Q2 earnings release demonstrating market share retention >20% and UCP EBIT margins >8%.',
        killSignal: 'Sharp margin collapse in UCP segment below 6% or aggressive share loss.',
        skepticRead: 'Skeptics cite unseasonal weather, but upstream prints prove channel inventory is clear.',
      },
    ],
    eventChainNote: '',
    verdict:
      'Voltas is primed for earnings surprise following verified contract-manufacturer read-across. With ₹101.52 Cr delivery backing and 32% delivery share ahead of Q2 results, accumulation indicates strong smart-money positioning.',
    additional: {
      'Execution Discipline': 'Staged Averaging-Up Protocol: Deploy 50% pilot allocation ahead of results; deploy remaining 50% post-earnings confirmation.',
      'Valuation Tailwinds': 'Valuation rerating supported by clean channel inventories and Voltas Beko breakeven inflection.',
    },
  };

  const voltasPdfPath = path.join(outputDir, 'VOLTAS_Output.pdf');
  await createReratingCatalystsPdf(voltasDto, { outputPath: voltasPdfPath, modelUsed });
  console.log(`[buildGainersSignal] ✅ Generated: ${voltasPdfPath}`);

  // Save full report in db
  db.saveReport({
    id: 'report_rerating-catalysts_NSE_VOLTAS_' + marketDate.replace(/-/g, ''),
    companyId: 'NSE:VOLTAS',
    creator: 'rerating-catalysts',
    type: 'rerating-catalysts',
    date: marketDate,
    modelUsed,
    ...voltasDto,
  });

  // Put in brief cache
  const voltasBrief = {
    companyId: 'NSE:VOLTAS',
    jCurveTag: voltasDto.jCurveTag,
    jCurveReason: voltasDto.jCurveReason,
    reratingPhase: voltasDto.reratingPhase,
    spentFlags: voltasDto.spentFlags,
    thesis:
      'Institutional accumulation (₹101.52 Cr delivery, 32% delivery) ahead of Q2 results, driven by upstream proxy PG Electroplast blowout RAC volumes (+42.5% YoY revenue, PAT +395%).',
    catalysts: voltasDto.catalysts.map((c) => ({
      name: c.name,
      conviction: c.conviction,
      timeline: c.timeline,
    })),
    sourceFilingIds: ['voltas_q2_preread'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['PG Electroplast Q2 Results Release 27-Oct-2026', 'Stockscans Market Flow'],
  };
  briefCache.putBrief('NSE:VOLTAS', voltasBrief);

  // =========================================================================
  // 4. BRIEFS FOR RANKS 4-10 (Step 6 brief cache)
  // =========================================================================
  console.log('[buildGainersSignal] Saving brief cache entries for ranks 4-10...');

  // Rank 4: NSE:PGEL
  const pgelBrief = {
    companyId: 'NSE:PGEL',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 Results demonstrate accelerating revenue growth (+42.5% YoY to ₹933.88 Cr), EBITDA +54.8% YoY to ₹69.14 Cr, and PAT jumping +395% YoY to ₹13.67 Cr on aggressive RAC backward integration.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Blowout Q2 FY27 performance with revenue +42.5% YoY to ₹933.88 Cr and PAT nearly quadrupling (+395% YoY) on heavy ₹95.58 Cr delivery conviction.',
    catalysts: [
      { name: 'RAC & EMS Capacity Utilization Surge (+42.5% YoY revenue)', conviction: 'HIGH CONVICTION', timeline: 'H2 FY27' },
      { name: 'Backward Integration & Plastic Molding Operating Leverage (EBITDA +54.8%)', conviction: 'HIGH CONVICTION', timeline: 'FY27-FY28' },
      { name: 'Step-Down Subsidiary NGM Capex Expansion', conviction: 'MEDIUM CONVICTION', timeline: 'FY27-FY28' },
    ],
    sourceFilingIds: ['nz82fq1f2sfo3nj3xl4w5b3i.pdf', '4oz435ovl62kv6ccxlj4gge9.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Q2 FY27 Press Release 27-Oct-2026', 'Financial Results Q2 FY27'],
  };
  briefCache.putBrief('NSE:PGEL', pgelBrief);

  // Rank 5: NSE:ZEEL
  const zeelBrief = {
    companyId: 'NSE:ZEEL',
    jCurveTag: 'MODERATE',
    jCurveReason:
      'Corporate leadership overhaul with appointment of Suraj Singh as Business Head of Zee Studios to revitalize theatrical and streaming production monetization.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Leadership restructuring in Zee Studios positions content pipeline for theatrical and digital licensing monetisation, supported by ₹52.36 Cr delivery accumulation.',
    catalysts: [
      { name: 'Zee Studios Strategic Restructuring & Leadership Appointment', conviction: 'MEDIUM CONVICTION', timeline: 'Q3-Q4 FY27' },
      { name: 'Broadcast Ad-Revenue Stabilization Post-Festive Season', conviction: 'MEDIUM CONVICTION', timeline: 'H2 FY27' },
    ],
    sourceFilingIds: ['j2ohh514gwveqveoq9wfm8iu.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Reg 30 Filing 21-Oct-2026'],
  };
  briefCache.putBrief('NSE:ZEEL', zeelBrief);

  // Rank 7: NSE:SUDEEPPHRM
  const sudeepphrmBrief = {
    companyId: 'NSE:SUDEEPPHRM',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Landmark Gujarat FDA approval authorises commercial operations at new 51,200 MT annual capacity pharma greenfield facility at 179 Nandesari, alongside approval of Q2 FY27 results.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Regulatory milestone with FDA approval unlocking 51,200 MT greenfield capacity at Nandesari, transforming production scale across pharma excipients and specialty nutrition on ₹40.19 Cr delivery.',
    catalysts: [
      { name: 'Gujarat FDA Approval for 51,200 MT Greenfield Pharma Facility at Nandesari', conviction: 'HIGH CONVICTION', timeline: 'Immediate H2 FY27' },
      { name: 'High-Barrier Excipients & Specialty Nutrition Export Expansion', conviction: 'HIGH CONVICTION', timeline: 'FY27-FY28' },
      { name: 'Q2 FY27 Unaudited Financial Results Approval', conviction: 'MEDIUM CONVICTION', timeline: 'Q2 FY27' },
    ],
    sourceFilingIds: ['hszw9ro4ja5kepjff8dlrbbq.pdf', '7qddv6wscef9a7shqwq3svf3.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['FDA Approval Press Release 26-Oct-2026', 'Q2 Results Filing 28-Oct-2026'],
  };
  briefCache.putBrief('NSE:SUDEEPPHRM', sudeepphrmBrief);

  // Rank 8: NSE:AARTIDRUGS
  const aartidrugsBrief = {
    companyId: 'NSE:AARTIDRUGS',
    jCurveTag: 'MODERATE',
    jCurveReason:
      'Pre-results accumulation (₹39.86 Cr delivery) ahead of Board Meeting scheduled for November 3, 2026 to approve Q2 FY27 financial results amid broad API sector re-rating.',
    reratingPhase: 'MID',
    spentFlags: [],
    thesis:
      'Pre-earnings accumulation with board meeting scheduled in 6 days (03/11/2026) for Q2 results, benefiting from API sector export demand and chemical input price recovery.',
    catalysts: [
      { name: 'Q2 FY27 Results Board Meeting Intimation (Scheduled 03-Nov-2026)', conviction: 'MEDIUM CONVICTION', timeline: '03-Nov-2026' },
      { name: 'API Realization Recovery & Operating Margin Stabilization', conviction: 'MEDIUM CONVICTION', timeline: 'H2 FY27' },
    ],
    sourceFilingIds: ['hk6sf3a7xjr0ihwim0dvfl7b.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Board Meeting Notice 27-Oct-2026'],
  };
  briefCache.putBrief('NSE:AARTIDRUGS', aartidrugsBrief);

  // Rank 9: NSE:LUMAXTECH
  const lumaxtechBrief = {
    companyId: 'NSE:LUMAXTECH',
    jCurveTag: 'STRONG',
    jCurveReason:
      'Q2 FY27 consolidated revenue jumped +35% YoY (+14% QoQ) to ₹1,556 Cr with EBITDA of ₹228 Cr, while Board approved setting up a new Mechatronics manufacturing facility at Manesar, Haryana.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'Consolidated revenue expanded +35% YoY to ₹1,556 Cr with EBITDA at ₹228 Cr, complemented by greenfield Mechatronics plant capex approval at Manesar on ₹30.71 Cr delivery.',
    catalysts: [
      { name: 'Greenfield Mechatronics Plant Approval at Manesar, Haryana', conviction: 'HIGH CONVICTION', timeline: 'FY27-FY28' },
      { name: 'Consolidated Q2 Revenue Surge (+35% YoY to ₹1,556 Cr, EBITDA ₹228 Cr)', conviction: 'HIGH CONVICTION', timeline: 'H2 FY27' },
      { name: 'IAC India Integration & High-Value Interior Systems Content-Per-Vehicle Gains', conviction: 'MEDIUM CONVICTION', timeline: 'FY27-FY28' },
    ],
    sourceFilingIds: ['jmksz0cky8kab7w71zrkq2nz.pdf', 'abvtxfawxcjrl9nv9wbpeofq.pdf', 'ec83hlk23xevhxzxqv3osda5.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['Investor Release 24-Oct-2026', 'Mechatronics Facility Intimation 24-Oct-2026'],
  };
  briefCache.putBrief('NSE:LUMAXTECH', lumaxtechBrief);

  // Rank 10: BSE:PPEL
  const ppelBrief = {
    companyId: 'BSE:PPEL',
    jCurveTag: 'STRONG',
    jCurveReason:
      'H1 FY27 Revenue surged +68% YoY to ₹210.1 Cr with operating EBITDA of ₹39.6 Cr (19% margin) and PAT of ₹24.9 Cr (12% margin) on 64.11% delivery backing.',
    reratingPhase: 'EARLY',
    spentFlags: [],
    thesis:
      'High-precision casting specialist nearly doubles H1 top-line (+68% YoY to ₹210.1 Cr) with 19% operating EBITDA margins, backed by massive 64.11% delivery conviction.',
    catalysts: [
      { name: 'H1 FY27 Revenue Surge (+68% YoY to ₹210.1 Cr) & 19% EBITDA Margin', conviction: 'HIGH CONVICTION', timeline: 'H2 FY27' },
      { name: 'Installed Capacity of ~13,800 MT Melting and Magnesium R&D Facility', conviction: 'HIGH CONVICTION', timeline: 'FY27-FY28' },
      { name: 'SME IPO Proceeds Deployment into Precision Machining Capex', conviction: 'MEDIUM CONVICTION', timeline: 'H2 FY27' },
    ],
    sourceFilingIds: ['i3m4xl98qtcg1l27ividj3ml.pdf', 'z2f448pj7muajvcqvsuf1m9i.pdf'],
    builtAt: new Date().toISOString(),
    modelUsed,
    contextUsed: ['H1 FY27 Financial Results 22-Oct-2026', 'BSE Filings'],
  };
  briefCache.putBrief('BSE:PPEL', ppelBrief);

  // =========================================================================
  // 5. STEP 4 RESEARCH DTOs (Top 20 from seed)
  // =========================================================================
  console.log('[buildGainersSignal] Saving Step 4 research DTOs...');

  const researchItems = [
    {
      companyId: 'NSE:MIDWESTLTD',
      research_axis: 'delivery_pct',
      tier: 'WATCH',
      trigger: 'Dominant Granite Mining Exporter with Captive Black Galaxy Reserves',
      trigger_quantified: 'Delivered ₹12.32 Cr at 74.69% delivery ratio with +8.76% return.',
      summary: 'Midwest Limited witnessed high-conviction accumulation with 74.69% delivery ratio as the vertically integrated export leader in premium Absolute Black and Black Galaxy granite.',
      linkage: 'explained',
      why: {
        text: 'Accumulation in premium natural stone and black granite export monopolist with dominant captive quarry concessions across AP/Telangana.',
        basis: 'catalyst',
        sources: ['Stockscans Company Overview', 'Market Flow Data'],
      },
      contextUsed: ['Stockscans Corporate Profile'],
    },
    {
      companyId: 'BSE:PPEL',
      research_axis: 'delivery_pct',
      tier: 'ACT',
      trigger: 'H1 FY27 Financial Results Beat & Precision Casting Margin Expansion',
      trigger_quantified: 'H1 FY27 revenue rose +68% YoY to ₹210.1 Cr, EBITDA reached ₹39.6 Cr (19% margin), and PAT hit ₹24.9 Cr on 64.11% delivery.',
      summary: 'Poojaa Precision Engg delivered stellar H1 numbers with 68% revenue growth and 19% EBITDA margin, backed by heavy ₹23.83 Cr delivery volume (64.11% delivery).',
      linkage: 'explained',
      why: {
        text: 'H1 FY27 revenue surged +68% YoY to ₹210.1 Cr with 19% operating EBITDA margin (₹39.6 Cr) and PAT of ₹24.9 Cr following BSE SME listing.',
        basis: 'filing',
        sources: ['H1 FY27 Results 22-Oct-2026'],
      },
      contextUsed: ['BSE Reg 33 Filings 22-Oct-2026'],
    },
    {
      companyId: 'NSE:SHREEPUSHK',
      research_axis: 'delivery_pct',
      tier: 'ACT',
      trigger: 'Board Meeting Scheduled for Q2 Results & Potential Preferential Issue Fundraise',
      trigger_quantified: 'Board meeting in 5 days (02/11/2026) for results and fundraise on 48.79% delivery (₹6.05 Cr).',
      summary: 'Shree Pushkar Chemicals intimated Board meeting scheduled for November 2, 2026 to approve Q2 results AND evaluate fundraising via Preferential Issue, triggering strong pre-results buying.',
      linkage: 'explained',
      why: {
        text: 'Board Meeting scheduled for November 2, 2026 to approve Q2 results and evaluate potential fund raising by way of Preferential Issue, alongside analyst meet intimation.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 27-Oct-2026', 'Analyst Meet Notice 28-Oct-2026'],
      },
      contextUsed: ['BSE/NSE Reg 30 Filings 27-28 Oct 2026'],
    },
    {
      companyId: 'NSE:SUDEEPPHRM',
      research_axis: 'delivery_pct',
      tier: 'ACT',
      trigger: 'Gujarat FDA Approval for 51,200 MT Greenfield Facility & Q2 Results Approval',
      trigger_quantified: '51,200 MT annual capacity approved at Nandesari, backing ₹40.19 Cr delivery (44.06% delivery).',
      summary: 'Sudeep Pharma received FDA approval for its new pharma greenfield facility at 179 Nandesari (51,200 MT capacity) and approved Q2 unaudited results, confirming major capacity commercialisation.',
      linkage: 'explained',
      why: {
        text: 'Gujarat FDA approval received authorizing commercial manufacturing operations at new 51,200 MT greenfield facility at 179 Nandesari, alongside Q2 FY27 results approval.',
        basis: 'filing',
        sources: ['FDA Approval Press Release 26-Oct-2026', 'Q2 Results Filing 28-Oct-2026'],
      },
      contextUsed: ['Reg 30 Disclosures 26-28 Oct 2026'],
    },
    {
      companyId: 'NSE:SMSPHARMA',
      research_axis: 'delivery_pct',
      tier: 'WATCH',
      trigger: 'Pre-Results Board Meeting Intimation for Q2 Results',
      trigger_quantified: 'Board meeting in 7 days (04/11/2026) on 43.90% delivery (₹15.85 Cr).',
      summary: 'SMS Pharmaceuticals rallied +7.37% on 43.90% delivery after intimating Board meeting on November 4, 2026 to approve Q2 FY27 results amid strong API sector momentum.',
      linkage: 'explained',
      why: {
        text: 'Board Meeting scheduled for November 4, 2026 (7 days away) to approve Q2 FY27 results, supported by 43.9% delivery backing.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 28-Oct-2026'],
      },
      contextUsed: ['NSE Reg 29 Intimation 28-Oct-2026'],
    },
    {
      companyId: 'NSE:TIPSMUSIC',
      research_axis: 'delivery_pct',
      tier: 'WATCH',
      trigger: 'Digital Streaming Royalty Operating Leverage & Q2 Results Beat',
      trigger_quantified: 'Q2 revenue grew +35% YoY to ₹120.1 Cr with 70.5% EBITDA margin on ₹48.04 Cr delivery (37.43%).',
      summary: 'Tips Music continued high-margin compounding in digital streaming music publishing, delivering ₹48.04 Cr delivery on sustained streaming consumption growth.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results show 35% YoY revenue growth to ₹120.1 Cr, operating EBITDA margin of 70.5%, and PAT +23% YoY to ₹65.5 Cr, backed by interim dividend approval.',
        basis: 'catalyst',
        sources: ['Q2 FY27 Results Filing 16-Oct-2026', 'Cached EPS Brief'],
      },
      contextUsed: ['Q2 Results 16-Oct-2026', 'Stockscans AI Growth Catalysts'],
    },
    {
      companyId: 'NSE:HUBTOWN',
      research_axis: 'delivery_pct',
      tier: 'NOTED',
      trigger: 'Imminent Board Meeting for Q2 Results',
      trigger_quantified: 'Board meeting scheduled for tomorrow (29/10/2026) on 32.90% delivery (₹18.90 Cr, +15.24%).',
      summary: 'Hubtown rallied +15.24% on ₹18.90 Cr delivery ahead of its Board Meeting scheduled for October 29, 2026 to consider Q2 FY27 results.',
      linkage: 'explained',
      why: {
        text: 'Board Meeting scheduled for October 29, 2026 (tomorrow, 1 day countdown) to approve Q2 standalone and consolidated financial results.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 26-Oct-2026'],
      },
      contextUsed: ['BSE Reg 29 Intimation 26-Oct-2026'],
    },
    {
      companyId: 'NSE:VOLTAS',
      research_axis: 'delivery_pct',
      tier: 'WATCH',
      trigger: 'RAC OEM Manufacturing Read-Across & Pre-Results Buying',
      trigger_quantified: 'Delivered ₹101.52 Cr (32.0% delivery) ahead of Q2 results on supplier PGEL blowout print (+42.5% rev, +395% PAT).',
      summary: 'Voltas saw heavy institutional accumulation of ₹101.52 Cr (32% delivery) ahead of early November Q2 earnings, buoyed by contract-manufacturing proxy PG Electroplast blowout RAC volumes.',
      linkage: 'explained',
      why: {
        text: 'Heavy delivery accumulation (₹101.52 Cr, 32% delivery) ahead of Q2 results, driven by upstream proxy PG Electroplast blowout RAC volumes (+42.5% YoY revenue, PAT +395%).',
        basis: 'catalyst',
        sources: ['PG Electroplast Q2 Results Release 27-Oct-2026', 'Stockscans Market Flow'],
      },
      contextUsed: ['PGEL Q2 Disclosures 27-Oct-2026'],
    },
    {
      companyId: 'NSE:DCMSRIND',
      research_axis: 'delivery_pct',
      tier: 'NOTED',
      trigger: 'Exchange Price Movement Clarification & Momentum Continuation',
      trigger_quantified: 'Delivered ₹6.80 Cr (30.27% delivery, +10.06% return).',
      summary: 'DCM Shriram Industries moved +10.06% following exchange price movement clarification, driven by momentum in sugar and industrial chemicals.',
      linkage: 'unexplained',
      why: {
        text: 'No material corporate filing in 14 days beyond routine price movement clarification; price momentum in sugar and alcohol operations.',
        basis: 'none',
        sources: ['Exchange Clarification Letter 23-Oct-2026'],
      },
      contextUsed: ['BSE Disclosures Oct 2026'],
    },
    {
      companyId: 'NSE:LUMAXTECH',
      research_axis: 'delivery_pct',
      tier: 'WATCH',
      trigger: 'New Mechatronics Facility at Manesar & Q2 Revenue Jump (+35% YoY)',
      trigger_quantified: 'Q2 revenue reached ₹1,556 Cr (+35% YoY), EBITDA ₹228 Cr, on ₹30.71 Cr delivery (27.39%).',
      summary: 'Lumax Auto Technologies reported +35% YoY Q2 revenue growth to ₹1,556 Cr and announced Board approval for a new Mechatronics manufacturing plant at Manesar, Haryana.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 consolidated revenue jumped +35% YoY (+14% QoQ) to ₹1,556 Cr with EBITDA of ₹228 Cr, while Board approved setting up a new Mechatronics manufacturing facility at Manesar, Haryana.',
        basis: 'filing',
        sources: ['Investor Release 24-Oct-2026', 'Mechatronics Plant Intimation 24-Oct-2026'],
      },
      contextUsed: ['Reg 30 Filings 24-Oct-2026'],
    },
    {
      companyId: 'NSE:PPLPHARMA',
      research_axis: 'delivery_value',
      tier: 'ACT',
      trigger: 'Q2 FY27 Financial Results Beat & EBITDA Margin Expansion (+350 bps)',
      trigger_quantified: 'Q2 revenue surged +28% YoY to ₹2,617 Cr, EBITDA rose +72% YoY to ₹385 Cr on record ₹422.54 Cr delivery.',
      summary: 'Piramal Pharma triggered massive institutional conviction with ₹422.54 Cr delivery after Q2 revenue jumped +28% YoY and EBITDA expanded +72% YoY with 350 bps margin expansion to 14.7%.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results beat: Revenue +28% YoY to ₹2,617 Cr, EBITDA +72% YoY to ₹385 Cr with 350 bps margin expansion to 14.7%, adding 22 new customers in H1.',
        basis: 'filing',
        sources: ['Q2 FY27 Press Release 27-Oct-2026', 'Results Filing 27-Oct-2026'],
      },
      contextUsed: ['Q2 FY27 Results 27-Oct-2026'],
    },
    {
      companyId: 'NSE:SYNGENE',
      research_axis: 'delivery_value',
      tier: 'ACT',
      trigger: 'Q2 FY27 Sequential Turnaround & 600 bps EBITDA Margin Rebound',
      trigger_quantified: 'Sequential revenue up +13% QoQ to ₹833 Cr, Operating EBITDA surged +61.5% QoQ to ₹147 Cr on ₹184.55 Cr delivery.',
      summary: 'Syngene International posted decisive sequential recovery with revenue up +13% QoQ and operating EBITDA margin improving from 12% to 18% (+600 bps), supported by ₹184.55 Cr delivery.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 sequential turnaround: Revenue +13% QoQ to ₹833 Cr, Operating EBITDA jumped +61.5% QoQ to ₹147 Cr with a 600 bps margin rebound to 18.0%.',
        basis: 'filing',
        sources: ['Q2 FY27 Press Release 27-Oct-2026'],
      },
      contextUsed: ['Q2 FY27 Results 27-Oct-2026'],
    },
    {
      companyId: 'NSE:PGEL',
      research_axis: 'delivery_value',
      tier: 'ACT',
      trigger: 'Q2 FY27 Blowout Numbers: Revenue +42.5% YoY, PAT +395% YoY',
      trigger_quantified: 'Revenue reached ₹933.88 Cr (+42.5% YoY), PAT jumped to ₹13.67 Cr (+395% YoY) on ₹95.58 Cr delivery.',
      summary: 'PG Electroplast rallied +7.16% on ₹95.58 Cr delivery as Q2 revenues surged +42.5% YoY to ₹933.88 Cr and EBITDA rose +54.8% YoY on aggressive RAC and EMS expansion.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results: Revenues grew +42.5% YoY to ₹933.88 Cr, EBITDA rose +54.8% YoY to ₹69.14 Cr, and PAT skyrocketed +395% YoY to ₹13.67 Cr.',
        basis: 'filing',
        sources: ['Q2 FY27 Press Release 27-Oct-2026', 'Results Filing 27-Oct-2026'],
      },
      contextUsed: ['Q2 FY27 Results Disclosures 27-Oct-2026'],
    },
    {
      companyId: 'NSE:ZEEL',
      research_axis: 'delivery_value',
      tier: 'ACT',
      trigger: 'Zee Studios Leadership Overhaul to Scale Theatrical & Digital Monetization',
      trigger_quantified: 'Suraj Singh appointed Business Head of Zee Studios; stock rallied +6.98% on ₹52.36 Cr delivery.',
      summary: 'Zee Entertainment Enterprises restructured leadership with the appointment of Suraj Singh as Business Head of Zee Studios, backed by strong ₹52.36 Cr institutional delivery.',
      linkage: 'explained',
      why: {
        text: 'Appointment of Suraj Singh as Business Head of Zee Studios to revitalize theatrical and digital content monetization, backed by ₹52.36 Cr delivery accumulation.',
        basis: 'filing',
        sources: ['Reg 30 Filing 21-Oct-2026'],
      },
      contextUsed: ['NSE Reg 30 Disclosure 21-Oct-2026'],
    },
    {
      companyId: 'NSE:AARTIDRUGS',
      research_axis: 'delivery_value',
      tier: 'WATCH',
      trigger: 'Pre-Results Accumulation Ahead of November 3 Board Meeting',
      trigger_quantified: 'Delivered ₹39.86 Cr (+11.35% return) ahead of results in 6 days.',
      summary: 'Aarti Drugs rallied +11.35% with ₹39.86 Cr delivery following Board meeting notice scheduled for November 3, 2026 to approve Q2 FY27 audited results.',
      linkage: 'explained',
      why: {
        text: 'Pre-results accumulation ahead of Board Meeting scheduled for November 3, 2026 (6 days countdown) to approve Q2 FY27 financial results.',
        basis: 'pre_result',
        sources: ['Board Meeting Notice 27-Oct-2026'],
      },
      contextUsed: ['BSE Reg 29 Notice 27-Oct-2026'],
    },
    {
      companyId: 'NSE:DEEPA',
      research_axis: 'delivery_value',
      tier: 'WATCH',
      trigger: 'Q2 Results Acceleration & Festive Retail Jewellery Momentum',
      trigger_quantified: 'Q2 revenue grew +24.6% YoY to ₹625.6 Cr, PAT surged +37.1% YoY to ₹37.3 Cr on ₹20.99 Cr delivery.',
      summary: 'Deepa Jewellers posted strong Q2 results with revenue up +24.6% YoY to ₹625.6 Cr and PAT jumping +37.1% YoY to ₹37.3 Cr, heading into a seasonally peak H2.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 results print: Revenue +24.6% YoY to ₹625.6 Cr, EBITDA +17.1% YoY to ₹45.3 Cr, and PAT +37.1% YoY to ₹37.3 Cr.',
        basis: 'filing',
        sources: ['Q2 FY27 Results 26-Oct-2026', 'Investor Presentation 26-Oct-2026'],
      },
      contextUsed: ['Reg 30 Presentation 26-Oct-2026'],
    },
    {
      companyId: 'NSE:PNGSREVA',
      research_axis: 'delivery_value',
      tier: 'WATCH',
      trigger: 'Explosive Festive Dussehra Sales Update & Store Network Expansion',
      trigger_quantified: 'Dussehra sales surged +62.4% YoY to ₹12.19 Cr; Navratri/Dussehra sales reached ₹38.53 Cr (+35.01% YoY) on ₹20.04 Cr delivery.',
      summary: 'PNGS Reva Diamond Jewellery reported a blowout festive sales update with Dussehra revenue jumping +62.4% YoY to ₹12.19 Cr and expanded its retail footprint to 39 stores.',
      linkage: 'explained',
      why: {
        text: 'Dussehra sales jumped +62.4% YoY to ₹12.19 Cr and Navratri/Dussehra sales grew +35.01% YoY to ₹38.53 Cr, expanding retail network to 39 stores with new Jaipur COCO store.',
        basis: 'filing',
        sources: ['Festive Sales Update 21-Oct-2026'],
      },
      contextUsed: ['Reg 30 Filing 21-Oct-2026'],
    },
    {
      companyId: 'NSE:SBFC',
      research_axis: 'delivery_value',
      tier: 'NOTED',
      trigger: 'Steady Q2 AUM Compounding in MSME Secured Lending',
      trigger_quantified: 'Delivered ₹15.82 Cr on +9.63% return following Q2 results release.',
      summary: 'SBFC Finance saw steady accumulation of ₹15.82 Cr delivery following its Q2 FY27 results print, reflecting resilient micro-enterprise secured lending demand.',
      linkage: 'explained',
      why: {
        text: 'Q2 FY27 financial results release confirming healthy secured MSME portfolio expansion and stable asset quality.',
        basis: 'filing',
        sources: ['Financial Results 24-Oct-2026'],
      },
      contextUsed: ['Q2 FY27 Results Disclosures 24-Oct-2026'],
    },
    {
      companyId: 'NSE:JYOTISTRUC',
      research_axis: 'delivery_value',
      tier: 'NOTED',
      trigger: 'Mega Turnkey HVDC Transmission Order Win from PGCIL (₹648.91 Cr)',
      trigger_quantified: '₹648.91 Cr turnkey HVDC transmission order from PGCIL (52.7% of market cap) on ₹14.01 Cr delivery (+14.43%).',
      summary: 'Jyoti Structures won a massive ₹648.91 Cr order from Power Grid Corporation for ±800 kV HVDC Barmer-II transmission line in Gujarat, representing over half its entire market cap.',
      linkage: 'explained',
      why: {
        text: 'Award of major ±800 kV HVDC Bipole Barmer-II transmission line turnkey contract valued at ₹648.91 Cr from Power Grid Corporation of India (PGCIL).',
        basis: 'filing',
        sources: ['Order Win Notification 28-Oct-2026'],
      },
      contextUsed: ['Reg 30 Filing 28-Oct-2026'],
    },
    {
      companyId: 'NSE:HUHTAMAKI',
      research_axis: 'delivery_value',
      tier: 'NOTED',
      trigger: 'Q3 & 9M Financial Results Surge (Sales +23.7% YoY, 20% Upper Circuit)',
      trigger_quantified: 'Q3 net sales rose +23.7% YoY to ₹748.1 Cr, 9M EBIT grew +22% YoY to ₹152.8 Cr, locking 20% upper circuit on ₹9.15 Cr delivery.',
      summary: 'Huhtamaki India locked in 20% upper circuit after reporting Q3 net sales of ₹748.1 Cr (+23.7% YoY) and 9M EBIT of ₹152.8 Cr (+22% YoY) driven by FMCG packaging volume acceleration.',
      linkage: 'explained',
      why: {
        text: 'Q3 2026 net sales rose +23.7% YoY to ₹748.1 Cr and 9M EBIT surged +22% YoY to ₹152.8 Cr on volume growth and operating efficiency, locking 20% upper circuit.',
        basis: 'filing',
        sources: ['Q3 Results Press Release 27-Oct-2026'],
      },
      contextUsed: ['Q3 2026 Results Disclosures 27-Oct-2026'],
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

  console.log(`[buildGainersSignal] ✅ Saved all ${researchItems.length} Step 4 research DTOs.`);
  console.log('[buildGainersSignal] Complete.');
}

main().catch((err) => {
  console.error('[buildGainersSignal] Fatal error:', err);
  process.exit(1);
});
