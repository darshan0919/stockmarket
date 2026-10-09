'use strict';

const fs = require('fs');
const path = require('path');
const {
  createResearchReport,
  createDrhpPdf,
  createForensicPdf,
  createConcallPdf,
  createSectorReport,
  createPeerComparisonPdf,
  createCredibilityWidget,
  createMarketShareWidget,
  createGrowthTriggersPdf,
  createQuarterlyResultPdf,
  createReratingCatalystsPdf,
} = require('../src/index');

describe('Report Generators', () => {
  const tmpDir = path.join(__dirname, 'tmp_out');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should export all generator functions', () => {
    expect(typeof createResearchReport).toBe('function');
    expect(typeof createDrhpPdf).toBe('function');
    expect(typeof createForensicPdf).toBe('function');
    expect(typeof createConcallPdf).toBe('function');
    expect(typeof createSectorReport).toBe('function');
    expect(typeof createPeerComparisonPdf).toBe('function');
    expect(typeof createCredibilityWidget).toBe('function');
    expect(typeof createMarketShareWidget).toBe('function');
    expect(typeof createGrowthTriggersPdf).toBe('function');
    expect(typeof createQuarterlyResultPdf).toBe('function');
    expect(typeof createReratingCatalystsPdf).toBe('function');
  });

  it('should execute HTML based generators successfully', () => {
    const credPath = path.join(tmpDir, 'cred.html');
    createCredibilityWidget({ output_path: credPath, company_name: 'Test' });
    expect(fs.existsSync(credPath)).toBe(true);

    const sharePath = path.join(tmpDir, 'share.html');
    createMarketShareWidget({ output_path: sharePath, industry: 'Test' });
    expect(fs.existsSync(sharePath)).toBe(true);
  });

  it('should generate quarterly-result HTML with deterministic layout and NBFC quality checks', async () => {
    const qrPath = path.join(tmpDir, 'quarterly_result.html');
    const mockDto = {
      company: 'Poonawalla Fincorp Ltd',
      ticker: 'NSE:POONAWALLA',
      quarter: 'Q2 FY27',
      date: '2026-10-09',
      cmp: '385.50',
      marketCap: '29850',
      sector: 'Financial Services / NBFC',
      kpiStrip: [
        { label: 'AUM', value: '₹34,500 Cr', subtext: '+42% YoY', tone: 'pos' },
        { label: 'Net RoA', value: '4.6%', subtext: 'Guided: >4.0%', tone: 'pos' },
        { label: 'Gross NPA', value: '0.82%', subtext: '-15 bps QoQ', tone: 'pos' },
        { label: 'Updated P/B', value: '3.4x', subtext: 'BVPS: ₹113.4', tone: 'neutral' },
      ],
      statementHealth: {
        income: { grade: 'CLEAN', brief: 'NII grew 38% YoY with stable NIMs.' },
        balanceSheet: { grade: 'CLEAN', brief: 'CRAR at 31.4%, debt/equity 2.2x.' },
        cashflow: {
          grade: 'CLEAN',
          brief: 'Loan disbursement gap funded fully by bank lines and equity.',
        },
      },
      verdictChips: ['AUM EXPANSION', 'CLEAN ASSET QUALITY', 'PREMIUM ROA CORRIDOR'],
      isNbfc: true,
      nbfcQualityChecks: {
        roaTree: {
          nim: 10.2,
          feeIncome: 3.1,
          opexToAssets: 4.8,
          creditCostToAssets: 1.2,
          netRoa: 4.6,
        },
        assetQuality: { grossNpa: 0.82, netNpa: 0.38, mob30Dpd: '0.45%', pcr: 74 },
        capitalAdequacy: { crar: 31.4, tier1: 29.8, debtToEquity: 2.2 },
        updatedBookValue: {
          bvps: 113.4,
          priorBvps: 98.2,
          pbRatio: 3.4,
          priorPb: 4.1,
          benchmark: 'Premium justified by >4.5% RoA',
        },
        growthFundingGap:
          'Negative CFO of ₹2,100 Cr funded smoothly by debt issue and surplus net worth.',
      },
      basket1: {
        growthDrivers: [
          { text: 'Secured MSME and LAP originations grew 55% YoY.', tag: 'STRUCTURAL' },
        ],
        marginTriggers: [{ text: 'Cost of funds declined 12 bps to 7.88%.', tag: 'STRUCTURAL' }],
      },
      basket2: {
        businessRisks: [
          {
            text: 'Unsecured personal loan delinquencies rising in small ticket cohort.',
            severity: 'MED',
          },
        ],
        commentaryRisks: [
          {
            text: 'Management hedged FY28 disbursement targets.',
            evasionType: 'Dilution Hedge',
            severity: 'LOW',
          },
        ],
      },
      basket3: {
        tone: {
          label: 'CONFIDENT',
          quote: 'We are on track to deliver 35-40% CAGR without compromising asset quality.',
        },
        narrativeShift:
          'Shifted focus from digital-only direct lending to partnered branch distribution.',
      },
      peadRead: {
        verdict: 'PEAD_CANDIDATE',
        pricedIn: false,
        gates: { g1: 'Beats consensus AUM by 4%', g2: 'P&L quality high' },
      },
      monitoringChecklist: [
        {
          num: 1,
          kpi: '6 MOB 30+ DPD',
          threshold: '< 0.60%',
          horizon: 'Q3 FY27',
          source: 'Investor Presentation',
        },
      ],
      additional: {
        peerComparison: [
          { company: 'Poonawalla', roa: '4.6%', pb: '3.4x' },
          { company: 'Bajaj Finance', roa: '4.4%', pb: '4.8x' },
        ],
      },
    };

    const res = await createQuarterlyResultPdf(mockDto, { outputPath: qrPath });
    expect(fs.existsSync(qrPath)).toBe(true);
    expect(res.html).toContain('QUARTERLY RESULT ANALYSIS');
    expect(res.html).toContain('Poonawalla Fincorp Ltd');
    expect(res.html).toContain('NBFC & Financial Institution Quality Audit');
    expect(res.html).toContain('RoA Tree Decomposition');
    expect(res.html).toContain('vs Prior: 4.1x');
    expect(res.html).toContain('vs Prior: ₹98.2');
    expect(res.html).toContain('PEAD_CANDIDATE');
    expect(res.html).toContain('Additional Nuance & Improvisation');
    expect(res.html).toContain('Bajaj Finance');
  });

  it('should render forward guidance table with base values, targets, % change, derived bottom-line and unguided guardrail', async () => {
    const qrGuidancePath = path.join(tmpDir, 'qr_guidance.html');
    const mockDto = {
      company: 'Poonawalla Fincorp Ltd',
      ticker: 'NSE:POONAWALLA',
      quarter: 'Q2 FY27',
      date: '2026-10-09',
      cmp: '385.50',
      marketCap: '29850',
      guidanceTable: [
        {
          metric: 'AUM',
          currentValue: '₹34,500 Cr',
          guidedValue: '₹48,000 Cr',
          pctChange: '+39.1%',
          timeline: 'FY28',
          nature: 'DIRECTLY GUIDED',
          derivationBasis: 'Concall: Target 35-40% CAGR on secured assets',
        },
        {
          metric: 'Book Value (Net Worth)',
          currentValue: '₹8,780 Cr',
          guidedValue: '₹12,100 Cr',
          pctChange: '+37.8%',
          timeline: 'FY28',
          nature: 'DERIVED',
          derivationBasis:
            'Derived: Base Net Worth + Projected 2-yr PAT at 4.6% RoA with 85% retention',
        },
        {
          metric: 'Credit Cost',
          currentValue: '1.2%',
          guidedValue: '—',
          pctChange: '—',
          timeline: 'FY28',
          nature: 'UNGUIDED',
          derivationBasis: 'Dependencies unguided — no extrapolation',
        },
      ],
    };

    const res = await createQuarterlyResultPdf(mockDto, { outputPath: qrGuidancePath });
    expect(fs.existsSync(qrGuidancePath)).toBe(true);
    expect(res.html).toContain('Forward Guidance & Bottom-Line Accrual Table');
    expect(res.html).toContain('Current Value (Base)');
    expect(res.html).toContain('Guided Value (Target)');
    expect(res.html).toContain('% Change');
    expect(res.html).toContain('+39.1%');
    expect(res.html).toContain('DIRECTLY GUIDED');
    expect(res.html).toContain('Book Value (Net Worth)');
    expect(res.html).toContain('DERIVED');
    expect(res.html).toContain('+37.8%');
    expect(res.html).toContain('UNGUIDED');
    expect(res.html).toContain('Dependencies unguided — no extrapolation');
  });

  it('should generate rerating-catalysts HTML with deterministic J-curve banner and core triggers', async () => {
    const rcPath = path.join(tmpDir, 'rerating_catalysts.html');
    const mockDto = {
      company: 'Zen Technologies Ltd',
      ticker: 'NSE:ZENTEC',
      date: '2026-10-09',
      cmp: '1750.00',
      marketCap: '14800',
      capCategory: 'Mid Cap',
      sector: 'Defence / Aerospace',
      growthBucket: 'Hyper-Growth',
      jCurveTag: 'STRONG',
      jCurveReason:
        'Naval simulator order book inflection and export shipments commercialising in Q3.',
      reratingPhase: 'IN_PROGRESS',
      combinedLeverageMultiple: {
        combinedLeverageMultiple: 3.8,
        operatingLeverage: 2.9,
        financialLeverage: 1.3,
        patGrowthYoY: 88,
      },
      snapshot:
        'Leading designer and manufacturer of combat training simulators and anti-drone systems.',
      kpiHeaders: [
        'FY Rev',
        'FY PAT',
        'EBITDA Mgn',
        'ROE',
        'ROCE',
        'Debt',
        'PE (TTM)',
        'Div Yield',
      ],
      kpiValues: ['440 Cr', '135 Cr', '38.5%', '32.1%', '39.4%', 'Zero', '58x', '0.2%'],
      catalysts: [
        {
          name: 'Export Anti-Drone System Shipments',
          body: 'Export orders of ₹350 Cr entering billing cycle in H2 with EBITDA margins exceeding 42%.',
          newCategory: ['LARGE_ORDERS', 'EXPORT_SCALE'],
          newVsConfirmation: 'NEW',
          impact: '+₹180 Cr incremental rev in FY27',
          timeline: 'Q3 FY27 - Q4 FY27',
          conviction: 'HIGH CONVICTION',
          jCurveStage: 'Inflection',
          forwardMarker: 'Q3 export revenue cross ₹85 Cr',
          sources: ['Transcript Q1 FY27', 'BSE Filing 22-Aug-2026'],
        },
      ],
      spikeDays: [
        {
          date: '2026-09-18',
          returnPct: 7.8,
          volumeMultiple: 3.4,
          whyBasis: 'filing',
          whyDetail: 'Major European defence exhibition MOU announced',
          linkage: 'explained',
        },
      ],
      whatsInThePrice:
        'Consensus models domestic simulators; export anti-drone annuity revenue not in numbers.',
      risks: ['Ministry of Defence procurement cycle delay.', 'Component export licensing timing.'],
      verdict:
        'Strong candidate for forward EPS acceleration with high combined operating leverage.',
      additional: {
        orderBookBreakdown: {
          domesticSimulator: '₹620 Cr',
          antiDrone: '₹480 Cr',
          exports: '₹340 Cr',
        },
      },
    };

    const res = await createReratingCatalystsPdf(mockDto, { outputPath: rcPath });
    expect(fs.existsSync(rcPath)).toBe(true);
    expect(res.html).toContain('RE-RATING CATALYSTS');
    expect(res.html).toContain('Zen Technologies Ltd');
    expect(res.html).toContain('J-CURVE: STRONG');
    expect(res.html).toContain('Export Anti-Drone System Shipments');
    expect(res.html).toContain('3-Step Exit Protocol');
    expect(res.html).toContain('Additional Nuance & Improvisation');
    expect(res.html).toContain('Domestic Simulator');
  });
});
