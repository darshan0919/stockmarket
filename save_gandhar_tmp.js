'use strict';
const path = require('path');
const db = require(path.join(process.cwd(), 'packages/jobs-runtime/lib/db.js'));

const COMPANY = 'NSE:GANDHAR';
const CREATOR = 'consecutive-filings-diff';
const DATE = '2026-07-23';

const notes = [
  {
    companyId: COMPANY,
    type: 'result_analysis',
    creator: CREATOR,
    date: DATE,
    text: 'Q1FY27 consol PAT ₹205.9cr (+688% YoY), highest ever, driven almost entirely by gross margin spread expanding to ₹28,145/kl from ₹9,351/kl in Q4FY26 (3.0x QoQ). Volume grew only +7.8% YoY (PHPO +18%, PIO +28%, Lubricants stable, Channel partners -23.6%). Entire beat is margin/realization-led, not volume-led.',
  },
  {
    companyId: COMPANY,
    type: 'management_guidance',
    creator: CREATOR,
    date: DATE,
    text: 'On the verified Q1FY27 earnings call, JMD Ashesh Parik explicitly denied an inventory-gain explanation for the margin spike: "We don\'t carry that much of inventory to justify inventory gains... generally up to 30, 35, 40 days. The gains have mostly come in on account of being able to sell at higher prices." He guided margins "hopeful of remaining at this level or around this level" for the year — a clear upgrade from the Q4FY26 call\'s "~6% EBITDA margin" language. No numeric guidance was given for FY27 volume growth or tax rate on this call.',
  },
  {
    companyId: COMPANY,
    type: 'forensic_check',
    creator: CREATOR,
    date: DATE,
    text: 'Forensic check on Q1FY27 result: clean unmodified auditor opinion (K J K & Associates, FRN 112159W), no exceptional items, standalone effective tax rate 24.3% vs statutory 25.17% (sane), consol 21.9% explainable by UAE 9% corporate tax on Texol profits. Inventory-gain denial corroborated by ~36-day standalone inventory holding disclosed in prior filings. Overall rating GREEN-YELLOW.',
  },
  {
    companyId: COMPANY,
    type: 'governance_flag',
    creator: CREATOR,
    date: DATE,
    text: 'Two governance watch items from 22-Jul-26 board outcome: (1) independent director Mrs. Deena Asit Mehta (ex-IAS, ex-BPCL/ONGC, directly relevant petroleum-sector expertise) resigned; replaced as Risk Management Committee Chair by Mr. Shyam Chandrabhan Agrawal, an ophthalmic surgeon with no disclosed energy/finance background — a domain-expertise downgrade on a commodity-price-sensitive RMC. (2) MOA amended (Annexure C) inserting a broad new object clause permitting trading/investing/hedging/arbitraging in securities, bonds, derivatives, commodity derivatives and currencies, with no rationale disclosed — needs a direct question on intended scope.',
  },
  {
    companyId: COMPANY,
    type: 'valuation_note',
    creator: CREATOR,
    date: DATE,
    text: 'At CMP ₹283.42 (mkt cap ~₹2,775cr), TTM PE ~8.7x. FY27 PAT scenario range built from Q1 actual (₹205.9cr, locked in) plus Q2-Q4 modelled off the ONLY numeric-adjacent guidance given (margin "at or around" 16.2% for the year); volume growth and tax rate are NOT guided by management and were modelled using historical actuals (Q1FY27 volume +7.8% YoY, effective tax ~22-24%) as analyst assumptions, not company guidance. Bear ~₹360cr PAT (~7.7x fwd PE), Base ~₹580cr (~4.8x), Bull ~₹800cr (~3.5x). Watch Q2FY27 print as the direct test of management\'s on-record margin claim.',
  },
];

async function main() {
  const noteStats = db.appendNotes(notes);
  console.log('appendNotes stats:', JSON.stringify(noteStats));

  const reportDto = {
    creator: CREATOR,
    type: 'consecutive-filings-diff-forensic-check',
    date: DATE,
    companyId: COMPANY,
    summary:
      'Gandhar Oil Q1FY27 vs Q4FY26 filings diff + basic forensic check. Highest-ever PAT (₹206cr, +688% YoY) is margin/realization-driven not volume-driven (spread 3.0x QoQ to ₹28,145/kl). Verified Q1FY27 call: management denies inventory-gain framing, guides margin to hold near 16.2% for the year (no numeric volume/tax guidance given). Forensic check clean (unmodified audit, no exceptional items) with two governance yellow flags (RMC chair domain-expertise downgrade; unexplained MOA widening into financial-instrument trading). FY27 PAT scenarios: Bear ~₹360cr / Base ~₹580cr / Bull ~₹800cr against CMP ₹283.42.',
    contextUsed: [],
    sections: {
      plDiff: {
        revenue: { q4fy26: 1093.4, q1fy27: 1731.9, qoq: '+58.4%', yoy: '+91.8%' },
        ebitda: { q4fy26: 63.6, q1fy27: 281.3, margin_q4fy26: '5.8%', margin_q1fy27: '16.2%' },
        pat: { q4fy26: 37.0, q1fy27: 205.9, yoy: '+688%' },
        grossMarginSpreadPerKl: { q4fy26: 9351, q1fy27: 28145 },
      },
      operationalKpi: {
        phpoGrowthYoY: '+18%',
        pioGrowthYoY: '+28%',
        lubricantsGrowthYoY: 'stable',
        channelPartnersGrowthYoY: '-23.6%',
        capacityUtilisation: '97% on 2-shift basis, 3rd shift available',
      },
      concallVerified: {
        date: '2026-07-2x',
        keyQuoteInventory:
          "We don't carry that much of inventory to justify inventory gains... generally up to 30, 35, 40 days. The gains have mostly come in on account of being able to sell at higher prices.",
        keyQuoteMargin:
          'We are hopeful of the margins remaining at this level or around this level for the whole year.',
        numericGuidanceGiven: [
          'EBITDA margin: qualitative, ~16.2% "at or around this level" for the year',
        ],
        numericGuidanceNotGiven: ['FY27 volume growth %', 'blended tax rate %'],
      },
      forensicAccounting: {
        auditorOpinion: 'unmodified, clean, K J K & Associates FRN 112159W',
        exceptionalItems: 'nil',
        standaloneEffectiveTaxRate: '24.3%',
        consolEffectiveTaxRate: '21.9%',
        overallRating: 'GREEN-YELLOW',
        governanceFlags: [
          'RMC chair replaced with domain-inexperienced independent director',
          'MOA widened to permit financial-instrument trading, no rationale disclosed',
        ],
      },
      valuation: {
        cmp: 283.42,
        mktCapCr: 2775,
        ttmPE: 8.7,
        fy27PatScenarios: { bear: 360, base: 580, bull: 800 },
        fy27PeScenarios: { bear: 7.7, base: 4.8, bull: 3.5 },
      },
    },
  };
  const reportId = db.saveReport(reportDto);
  console.log('saveReport id:', reportId);

  console.log('touchedFiles:', JSON.stringify(db.touchedFiles ? db.touchedFiles() : 'n/a'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
