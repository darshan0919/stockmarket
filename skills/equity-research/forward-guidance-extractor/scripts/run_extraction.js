#!/usr/bin/env node
'use strict';

/**
 * Executes Phases 1 to 4 of forward-guidance-extractor for the fetched batch:
 * - Computes absolute <-> relative values (Phase 2)
 * - Persists each company's forward-guidance DTO (Phase 3)
 * - Builds consolidated Excel workbook (Phase 4)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const RUN_DIR = path.resolve(REPO_ROOT, 'data/runs/guidance_scan_429918e3098ce660baec9f22');
const manifestPath = path.join(RUN_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const EXTRACTIONS = {
  'NSE:ICICIGI': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [],
  },
  'NSE:HDBFS': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Key Metrics',
        metric: 'ROA',
        period_guided: 'Ongoing',
        absolute_value: 2.5,
        absolute_unit: '%',
        relative_pct: null,
        base_value: 2.5,
        base_period: 'Q1 FY27',
        base_value_source_quote: 'ROA (annualized): 2.5%, similar to Q4FY26 [5]',
        quote: 'ROA: Focus clearly to be at 2.5% [11]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
    ],
  },
  'NSE:MRPL': {
    quarter: 'Q3FY26',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Key Metrics',
        metric: 'Capacity',
        period_guided: 'FY26',
        absolute_value: 250.0,
        absolute_unit: 'outlets',
        relative_pct: 25.0,
        base_value: 200.0,
        base_period: 'Q3 FY26',
        base_value_source_quote:
          'Retail outlets: 200 achieved, targeting ~250 by fiscal year-end [3][8]',
        quote: 'Retail outlet count: Reach ~250 outlets by end of FY26 [3]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Capacity',
        period_guided: 'FY29',
        absolute_value: 500.0,
        absolute_unit: 'outlets',
        relative_pct: null,
        base_value: 200.0,
        base_period: 'Q3 FY26',
        base_value_source_quote:
          'Retail outlets: 200 achieved, targeting ~250 by fiscal year-end [3][8]',
        quote: 'Retail outlet count: Reach 500 outlets (conservative) within 3 years [8][9]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'new',
      },
    ],
  },
  'NSE:TATATECH': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [],
  },
  'NSE:EMMVEE': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Margins',
        metric: 'EBITDA',
        period_guided: 'FY27',
        absolute_value: 2400.0,
        absolute_unit: 'cr',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'FY27 EBITDA target: ~₹2,400 cr, by close of FY27 [11]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Capacity',
        period_guided: 'FY27',
        absolute_value: 16.3,
        absolute_unit: 'GW',
        relative_pct: 58.3,
        base_value: 10.3,
        base_period: 'Q1 FY27',
        base_value_source_quote: 'Installed module capacity: 10.3 GW [5]',
        quote: 'Total manufacturing capacity: ~16.3 GW modules by end of FY27 [4][5]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Capacity',
        period_guided: 'FY27',
        absolute_value: 8.9,
        absolute_unit: 'GW',
        relative_pct: 202.7,
        base_value: 2.94,
        base_period: 'Q1 FY27',
        base_value_source_quote: 'Installed cell capacity: 2.94 GW TOPCon [5]',
        quote: 'Total manufacturing capacity: ~8.9 GW cells by end of FY27 [4][5]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Order Book',
        period_guided: 'Next 18 months',
        absolute_value: 7.0,
        absolute_unit: 'GW',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'Order execution: ~7+ GW of orders to be executed over next 18 months [6]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'new',
      },
    ],
  },
  'NSE:THELEELA': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Margins',
        metric: 'EBITDA Margin',
        period_guided: 'FY27',
        absolute_value: 50.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: 41.0,
        base_period: 'Q1 FY27',
        base_value_source_quote: 'Operating EBITDA margin: 41%, record Q1 margin [4][6]',
        quote:
          'Full-year EBITDA margin: Maintain ~50% and marginally grow YoY as RevPAR grows [17][18]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'EBITDA',
        period_guided: 'FY27',
        absolute_value: null,
        absolute_unit: 'cr',
        relative_pct: 17.0,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'FY27 EBITDA growth guidance: mid-to-high teens [12]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'EBITDA',
        period_guided: 'FY30',
        absolute_value: 2000.0,
        absolute_unit: 'cr',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'FY30 EBITDA target: INR 2,000 crore; on track [18][19][21]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
    ],
  },
  'NSE:CEATLTD': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Top Line',
        metric: 'Sales',
        period_guided: 'Q2 FY27',
        absolute_value: null,
        absolute_unit: '%',
        relative_pct: 5.0,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote:
          'Price hikes in replacement: Further 4-6% increase, continuing through July and August [6][7]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'EBITDA Margin',
        period_guided: 'H2 FY27 onward',
        absolute_value: 12.5,
        absolute_unit: '%',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'Camso margin normalization: Return to earlier-indicated 12-13% level [11][12]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'Gross Profit Margin',
        period_guided: 'H2 FY27',
        absolute_value: 40.5,
        absolute_unit: '%',
        relative_pct: null,
        base_value: 33.9,
        base_period: 'Q1 FY27',
        base_value_source_quote:
          'Consolidated gross margin: 33.9%, contracted ~575 bps sequentially [3][4]',
        quote:
          'Gross margin recovery: Hold price to recover to normal 40-41% level if RM falls [11]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Capacity',
        period_guided: 'FY31',
        absolute_value: 53000.0,
        absolute_unit: 'tyres/day',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote:
          'Two-wheeler capacity expansion: Additional 53,000 tyres/day via ₹1,205 crore capex by FY31 [5]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
    ],
  },
  'NSE:ELECON': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Top Line',
        metric: 'Revenue',
        period_guided: 'FY27',
        absolute_value: null,
        absolute_unit: 'cr',
        relative_pct: 11.0,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote:
          'Full year FY27 revenue growth guidance: Low double-digit consolidated revenue growth [6]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'EBITDA Margin',
        period_guided: 'FY27',
        absolute_value: 23.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'MHE division sustainable EBITDA margin expectation: 22% to 24% for the year [7]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'EBITDA Margin',
        period_guided: 'FY28',
        absolute_value: 24.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'Gear division EBITDA margin target: ~24% [12][18]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Top Line',
        metric: 'Revenue',
        period_guided: 'FY30',
        absolute_value: 5000.0,
        absolute_unit: 'cr',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'FY30 revenue target: ₹5,000 crores, challenging but still achievable [17]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
    ],
  },
  'NSE:BAJAJCON': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Margins',
        metric: 'EBITDA Margin',
        period_guided: 'Ongoing',
        absolute_value: 22.5,
        absolute_unit: '%',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'EBITDA margin range: Happy operating in low to mid 20s ongoing [8]',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'new',
      },
    ],
  },
  'NSE:ACCENTMIC': {
    quarter: 'Q4FY26',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Top Line',
        metric: 'Revenue',
        period_guided: 'At peak utilization (undated)',
        absolute_value: 150.0,
        absolute_unit: 'cr',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote:
          'Phase 1 peak revenue: Approximately ₹150 cr at full capacity, plus/minus 5-10%, at peak utilization (undated)',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Utilisation',
        period_guided: 'FY27',
        absolute_value: 55.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote:
          'Phase 1 first-year utilization: 50–60% of peak capacity on a per-day basis, over 9 months of production in FY27',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'new',
      },
    ],
  },
  'NSE:BIRLAMONEY': {
    quarter: 'Q1FY27',
    date: '2026-10-14',
    items: [
      {
        metric_category: 'Key Metrics',
        metric: 'Order Book',
        period_guided: 'Next 6–8 quarters',
        absolute_value: 100000.0,
        absolute_unit: 'cr',
        relative_pct: 92.9,
        base_value: 51833.0,
        base_period: 'Q1 FY27',
        base_value_source_quote:
          'Housing finance AUM: ₹51,833 cr, up 50% YoY and 9% QoQ; crossed ₹50,000 cr milestone [4][5]',
        quote: 'HFC AUM target: Close to INR1 lakh crore in next 6–8 quarters',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'ROE',
        period_guided: 'Exit FY27',
        absolute_value: 13.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: 11.2,
        base_period: 'Q1 FY27',
        base_value_source_quote: 'Housing finance ROE: 11.2% [4][5]',
        quote: 'HFC ROE target: Exit FY27 near 13%, reach 15% in 6–8 quarters',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Margins',
        metric: 'Operating Profit Margin',
        period_guided: 'FY27',
        absolute_value: 100.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: 106.0,
        base_period: 'Q1 FY27',
        base_value_source_quote:
          'Health insurance combined ratio (IFRS): 106% vs 107% in Q4 FY26 [7][8]',
        quote: 'Health insurance combined ratio: Achieve 100% on IFRS basis this financial year',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Key Metrics',
        metric: 'Capacity',
        period_guided: 'March 2027',
        absolute_value: 250.0,
        absolute_unit: 'branches',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'NBFC gold loan branch rollout: 200–300 stand-alone branches by March 2027',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'reaffirmed',
      },
      {
        metric_category: 'Top Line',
        metric: 'Revenue',
        period_guided: 'Next three years',
        absolute_value: null,
        absolute_unit: 'cr',
        relative_pct: 20.0,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: 'Life insurance individual FIP growth: 20%-plus CAGR over next three years',
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'new',
      },
      {
        metric_category: 'Margins',
        metric: 'Net Profit Margin',
        period_guided: "In three years' time",
        absolute_value: 20.0,
        absolute_unit: '%',
        relative_pct: null,
        base_value: null,
        base_period: null,
        base_value_source_quote: null,
        quote: "Life insurance VNB margin target: Above 20% in three years' time",
        confidence: 'explicit',
        source: 'ConcallNotes',
        qoq_status: 'new',
      },
    ],
  },
};

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\{\{bid:\d+\}\}/g, '').replace(/\[\d+\](?:\[\d+\])*/g, '').trim();
}

function formatQuarter(qStr) {
  if (!qStr) return 'Ongoing';
  if (/^Q[1-4]FY\d\d$/i.test(qStr)) return qStr.toUpperCase();
  const m = String(qStr).match(/^(\d{4})(\d{2})$/);
  if (!m) return qStr;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month === 3) return `Q4FY${String(year).slice(2)}`;
  if (month === 6) return `Q1FY${String(year + 1).slice(2)}`;
  if (month === 9) return `Q2FY${String(year + 1).slice(2)}`;
  if (month === 12) return `Q3FY${String(year + 1).slice(2)}`;
  return qStr;
}

function parseGuidanceRow(commitmentRaw, specificsRaw, timelineRaw) {
  const commitment = cleanText(commitmentRaw);
  const specifics = cleanText(specificsRaw);
  const timeline = cleanText(timelineRaw);

  if (!specifics && !commitment) return null;
  const combined = (commitment + ' ' + specifics).toLowerCase();

  // Zero-assumption rule: must contain a digit
  if (!/\d/.test(specifics) && !/\d/.test(commitment)) return null;

  // Filter out non-quantified noise
  const skipPhrases = [
    'breakeven on direct cost',
    'no plans',
    'underway',
    'revamped platform',
    'selectively evaluate',
    'in preparation',
    'subjudice',
  ];
  if (
    skipPhrases.some((p) => combined.includes(p)) &&
    !/\d+\s*(?:%|cr|crore|bps|lakh|gw|mw|tonnes|mt|outlets|branches)/i.test(specifics)
  ) {
    return null;
  }

  let cat = null;
  let metric = null;

  // Top Line
  if (
    /revenue|top\s*line|topline|sales\s*growth|disbursement|aum\s*growth|loan\s*growth|fip\s*growth/i.test(
      combined
    )
  ) {
    cat = 'Top Line';
    if (/volume/i.test(combined)) metric = 'Volume';
    else if (/disbursement/i.test(combined)) metric = 'Disbursement';
    else if (/aum/i.test(combined)) metric = 'AUM';
    else if (/sales/i.test(combined)) metric = 'Sales';
    else metric = 'Revenue';
  } else if (/volume/i.test(combined) && (/growth|mt|tonnes/i.test(combined))) {
    cat = 'Top Line';
    metric = 'Volume';
  }
  // Margins
  else if (
    /ebitda\s*margin|operating\s*margin|gross\s*margin|pat\s*margin|vnb\s*margin|net\s*margin|nim|spread|combined\s*ratio|cost-to-income|cost\s*to\s*income/i.test(
      combined
    )
  ) {
    cat = 'Margins';
    if (/gross/i.test(combined)) metric = 'Gross Profit Margin';
    else if (/ebitda\s*margin/i.test(combined)) metric = 'EBITDA Margin';
    else if (/operating|combined\s*ratio|cost-to-income|cost\s*to\s*income/i.test(combined))
      metric = 'Operating Profit Margin';
    else if (/vnb|net\s*margin|pat\s*margin/i.test(combined)) metric = 'Net Profit Margin';
    else if (/nim|spread/i.test(combined)) metric = 'NIM';
    else metric = 'EBITDA Margin';
  } else if (
    /ebitda/i.test(combined) &&
    !/margin/i.test(combined) &&
    /cr|crore|target|reach|growth|%/i.test(combined)
  ) {
    cat = 'Margins';
    metric = 'EBITDA';
  }
  // Bottom Line
  else if (/pat\s*growth|net\s*profit|profit\s*after\s*tax|eps/i.test(combined)) {
    cat = 'Bottom Line';
    metric = /eps/i.test(combined) ? 'EPS' : 'PAT';
  }
  // Balance Sheet
  else if (/debt|deleveraging|capex|cash\s*flow|free\s*cash\s*flow/i.test(combined)) {
    cat = 'Balance Sheet';
    if (/capex/i.test(combined)) metric = 'Capex';
    else if (/cash\s*flow/i.test(combined)) metric = 'Cash Flow';
    else metric = 'Debt';
  }
  // Key Metrics
  else if (
    /capacity|utilisation|utilization|order\s*book|order\s*inflow|order\s*pipeline|order\s*execution|roe|roa|roce|branches|outlets|store\s*count/i.test(
      combined
    )
  ) {
    cat = 'Key Metrics';
    if (/capacity/i.test(combined)) metric = 'Capacity';
    else if (/utilis|utiliz/i.test(combined)) metric = 'Utilisation';
    else if (/order/i.test(combined)) metric = 'Order Book';
    else if (/roce/i.test(combined)) metric = 'ROCE';
    else if (/roe/i.test(combined)) metric = 'ROE';
    else if (/roa/i.test(combined)) metric = 'ROA';
    else if (/branch|outlet|store/i.test(combined)) metric = 'Capacity';
    else metric = 'Order Book';
  } else if (/aum/i.test(combined) && /reach|target|cr|crore|lakh\s*crore/i.test(combined)) {
    cat = 'Key Metrics';
    metric = 'Order Book';
  }

  if (!cat || !metric) return null;

  // Number / range extraction
  const pctRange = specifics.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/i
  );
  const singlePct = specifics.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  const bpsRange = specifics.match(/(\d+(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*bps/i);
  const singleBps = specifics.match(/(\d+(?:\.\d+)?)\s*bps/i);
  const crRange = specifics.match(
    /(?:₹|inr|rs\.?)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:cr|crore|crores)/i
  );
  const singleCr = specifics.match(
    /(?:₹|inr|rs\.?)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:cr|crore|crores)/i
  );
  const unitMatch = specifics.match(
    /(\d+(?:\.\d+)?)\s*(gw|mw|tonnes|mt|outlets|branches|tyres\/day)/i
  );

  let absVal = null;
  let absUnit = null;
  let relPct = null;

  if (
    metric.toLowerCase().includes('margin') ||
    ['NIM', 'ROA', 'ROE', 'ROCE', 'Utilisation'].includes(metric)
  ) {
    absUnit = '%';
    if (pctRange)
      absVal = Math.round(((parseFloat(pctRange[1]) + parseFloat(pctRange[2])) / 2.0) * 100) / 100;
    else if (singlePct) absVal = parseFloat(singlePct[1]);
    else if (bpsRange)
      absVal =
        Math.round((((parseFloat(bpsRange[1]) + parseFloat(bpsRange[2])) / 2.0) / 100) * 100) / 100;
    else if (singleBps) absVal = parseFloat(singleBps[1]) / 100;
  } else if (/growth|cagr/i.test(combined) || (singlePct && !singleCr && !unitMatch)) {
    if (pctRange)
      relPct = Math.round(((parseFloat(pctRange[1]) + parseFloat(pctRange[2])) / 2.0) * 100) / 100;
    else if (singlePct) relPct = parseFloat(singlePct[1]);
  } else if (crRange) {
    absUnit = 'cr';
    const v1 = parseFloat(crRange[1].replace(/,/g, ''));
    const v2 = parseFloat(crRange[2].replace(/,/g, ''));
    absVal = Math.round(((v1 + v2) / 2.0) * 100) / 100;
  } else if (singleCr) {
    absUnit = 'cr';
    absVal = parseFloat(singleCr[1].replace(/,/g, ''));
  } else if (unitMatch) {
    absVal = parseFloat(unitMatch[1]);
    absUnit = unitMatch[2];
  }

  if (absVal === null && relPct === null) return null;

  return {
    metric_category: cat,
    metric,
    period_guided: timeline || 'Ongoing',
    absolute_value: absVal,
    absolute_unit: absUnit,
    relative_pct: relPct,
    base_value: null,
    base_period: null,
    base_value_source_quote: null,
    quote: `${commitment}: ${specifics} [${timeline || 'Ongoing'}]`,
    confidence: 'explicit',
    source: 'ConcallNotes',
    qoq_status: 'new',
  };
}

function extractGuidanceFromRaw(rawData) {
  const report = rawData.concallNotes?.finalReport || '';
  const match = report.match(
    /## Guidance & Commitments\s*\n\s*\|[^\n]+\|\s*\n\s*\|[^\n]+\|\s*\n((?:\|[^\n]+\|\s*\n)+)/
  );
  const items = [];

  if (match) {
    const lines = match[1].trim().split('\n');
    for (const line of lines) {
      const cols = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cols.length >= 3) {
        const item = parseGuidanceRow(cols[0], cols[1], cols[2]);
        if (item) items.push(item);
      }
    }
  }

  // Phase 1b: QoQ reconciliation against prior report
  const priorItems = rawData.priorReport?.guidance || [];
  for (const item of items) {
    const priorMatch = priorItems.find(
      (p) =>
        p.metric_category === item.metric_category &&
        p.metric === item.metric &&
        p.period_guided === item.period_guided
    );
    if (priorMatch) {
      const vCur = item.absolute_value !== null ? item.absolute_value : item.relative_pct;
      const vPrior =
        priorMatch.absolute_value !== null ? priorMatch.absolute_value : priorMatch.relative_pct;
      if (vCur !== null && vPrior !== null && Math.abs(vCur - vPrior) < 0.5) {
        item.qoq_status = 'reaffirmed';
      } else {
        item.qoq_status = 'revised';
      }
    } else {
      item.qoq_status = 'new';
    }
  }

  return {
    quarter: formatQuarter(rawData.quarter),
    date: '2026-10-14',
    items,
  };
}

async function run() {
  const dtos = [];
  const computeScript = path.resolve(
    REPO_ROOT,
    'skills/equity-research/forward-guidance-extractor/scripts/compute_guidance_value.py'
  );
  const saveScript = path.resolve(
    REPO_ROOT,
    'skills/equity-research/forward-guidance-extractor/scripts/save_forward_guidance.js'
  );
  const buildScript = path.resolve(
    REPO_ROOT,
    'skills/equity-research/forward-guidance-extractor/scripts/build_guidance_workbook.py'
  );

  console.log(`Starting extraction processing for ${manifest.fetched.length} companies...`);

  for (let i = 0; i < manifest.fetched.length; i++) {
    const item = manifest.fetched[i];
    const ticker = item.companyId;
    let extraction = EXTRACTIONS[ticker];

    if (!extraction && item.rawFile && fs.existsSync(item.rawFile)) {
      const rawData = JSON.parse(fs.readFileSync(item.rawFile, 'utf8'));
      extraction = extractGuidanceFromRaw(rawData);
    }

    if (!extraction) {
      console.warn(`[${i + 1}/${manifest.fetched.length}] No extraction definition or raw file for ${ticker}`);
      continue;
    }

    const safeTicker = ticker.replace(/[^a-zA-Z0-9_-]/g, '_');
    const itemsFile = path.join(RUN_DIR, `${safeTicker}_items.json`);
    const enrichedFile = path.join(RUN_DIR, `${safeTicker}_enriched.json`);
    const scanRowFile = path.join(RUN_DIR, `${safeTicker}_scanrow.json`);

    fs.writeFileSync(itemsFile, JSON.stringify(extraction.items, null, 2), 'utf8');
    fs.writeFileSync(scanRowFile, JSON.stringify(item.scanRow || {}, null, 2), 'utf8');

    // Run Phase 2 compute
    const enrichedOutput = execSync(`python3 "${computeScript}" --batch "${itemsFile}"`, {
      encoding: 'utf8',
    });
    fs.writeFileSync(enrichedFile, enrichedOutput, 'utf8');

    // Run Phase 3 save
    const saveCmd = [
      'node',
      `"${saveScript}"`,
      '--ticker',
      `"${ticker}"`,
      '--quarter',
      `"${extraction.quarter}"`,
      '--date',
      `"${extraction.date}"`,
      '--guidance-file',
      `"${enrichedFile}"`,
      '--scan-row-file',
      `"${scanRowFile}"`,
      '--model',
      '"gemini-3.8-flash"',
      '--transcript-available',
      'true',
    ].join(' ');

    console.log(`[${i + 1}/${manifest.fetched.length}] Saving forward guidance for ${ticker} (${extraction.items.length} items)...`);
    const saveRes = JSON.parse(execSync(saveCmd, { encoding: 'utf8' }));

    const guidance = JSON.parse(fs.readFileSync(enrichedFile, 'utf8'));
    const dto = {
      id: saveRes.id,
      companyId: ticker,
      companyName: item.companyName || ticker,
      quarter: extraction.quarter,
      date: extraction.date,
      guidance,
      scanRow: item.scanRow || {},
    };
    dtos.push(dto);
  }

  // Phase 4: build workbook
  const allDtosFile = path.join(RUN_DIR, 'all_company_dtos.json');
  const missingFile = path.join(RUN_DIR, 'missing_companies.json');
  fs.writeFileSync(allDtosFile, JSON.stringify(dtos, null, 2), 'utf8');
  fs.writeFileSync(missingFile, JSON.stringify(manifest.missing || [], null, 2), 'utf8');

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outXlsx = path.resolve(REPO_ROOT, `Forward_Guidance_${todayStr}.xlsx`);

  console.log(`Building consolidated workbook at ${outXlsx}...`);
  const buildCmd = `python3 "${buildScript}" --dtos "${allDtosFile}" --missing "${missingFile}" --out "${outXlsx}"`;
  const buildRes = JSON.parse(execSync(buildCmd, { encoding: 'utf8' }));
  console.log('Build Workbook Result:', JSON.stringify(buildRes, null, 2));

  // Touch files manifest
  const touched = db.touchedFiles ? db.touchedFiles() : [];
  console.log('\n--- Files Touched ---');
  touched.forEach((f) => console.log('  ', f));
  console.log('  ', path.basename(outXlsx));

  console.log('\n--- Extraction Complete ---');
  console.log(`Total companies processed: ${manifest.fetched.length}`);
  console.log(
    `Companies with confirmed guidance: ${dtos.filter((d) => (d.guidance || []).length > 0).length}`
  );
  console.log(`Total guidance points extracted: ${buildRes.guidance_rows}`);
  console.log(`Missing companies listed: ${buildRes.missing_rows}`);
  console.log(`Consolidated Workbook: ${outXlsx}`);
}

run().catch((err) => {
  console.error('Extraction pipeline failed:', err);
  process.exit(1);
});
