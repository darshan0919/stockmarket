#!/usr/bin/env node
'use strict';

/**
 * build.js — assembles the RVNL / NCC / KIRLOSENG order-book comparison from
 * artifacts the repo pipeline already produced, so the numbers in answer.md
 * are reproducible rather than hand-copied.
 *
 * Inputs (all on disk, no network):
 *   data/cache/order-book-ledger/<companyId>.json   — base + wins + cumulative
 *   data/cache/order-announcements/<companyId>/*    — per-filing counterparty text
 * Revenue is passed in below because it comes from Screener's consolidated
 * P&L, which this repo reads as HTML rather than caching as a table.
 *
 * @see docs/ORDER_BOOK_EXTRACTION.md
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../../../../../..');
const OUT = __dirname;

/** FY26 consolidated sales (Rs Cr) from Screener's profit-loss table, Mar 2026 column. */
const FY26_REVENUE_CR = { 'NSE:RVNL': 20412, 'NSE:NCC': 20823, 'NSE:KIRLOSENG': 7701 };

const NAMES = {
  'NSE:RVNL': 'Rail Vikas Nigam Ltd',
  'NSE:NCC': 'NCC Ltd',
  'NSE:KIRLOSENG': 'Kirloskar Oil Engines Ltd',
};

const ledgerPath = (id) => path.join(REPO, 'data/cache/order-book-ledger', `${id}.json`);
const annDir = (id) => path.join(REPO, 'data/cache/order-announcements', id);

/** Counterparty text lives on the announcement record, not the ledger entry. */
function announcementDetail(companyId, ssUrl) {
  const dir = annDir(companyId);
  if (!fs.existsSync(dir)) return {};
  for (const f of fs.readdirSync(dir)) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (rec.ssUrl === ssUrl || f.startsWith(ssUrl.replace(/\.pdf$/, ''))) {
      return {
        description: rec.description || null,
        confidence: rec.extraction ? rec.extraction.confidence : null,
        source: rec.extraction ? rec.extraction.source : null,
        isAggregate: rec.extraction ? !!rec.extraction.isAggregate : false,
        components: rec.extraction ? rec.extraction.components || [] : [],
      };
    }
  }
  return {};
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const companies = Object.keys(NAMES).map((companyId) => {
  const led = JSON.parse(fs.readFileSync(ledgerPath(companyId), 'utf8'));
  const wins = (led.announcementsApplied || []).map((w) => ({
    date: w.date,
    valueCr: w.deltaCr,
    ssUrl: w.ssUrl,
    quantities: (w.quantities || []).map((q) => ({ unit: q.unit, value: q.value })),
    executionWindow: w.timeline
      ? { months: w.timeline.durationMonths, endDate: w.timeline.endDate, basis: w.timeline.basis }
      : null,
    ...announcementDetail(companyId, w.ssUrl),
  }));
  wins.sort((a, b) => a.date.localeCompare(b.date));

  const revenueCr = FY26_REVENUE_CR[companyId];
  const inflowCr = round(wins.reduce((s, w) => s + w.valueCr, 0));
  // Window runs from the concall's quarter-end to the last filing date we have
  // for this company. Using the ledger watermark instead would overstate the
  // window for NCC, whose July aggregate letter is not filed yet.
  const windowStart = led.base.sourceQuarterEndDate;
  const windowEnd = wins.length ? wins[wins.length - 1].date : led.cumulative.asOfDate;
  const windowDays = Math.max(daysBetween(windowStart, windowEnd), 1);
  const annualisedInflowCr = wins.length ? round((inflowCr * 365) / windowDays) : 0;

  return {
    companyId,
    name: NAMES[companyId],
    base: {
      valueCr: led.base.valueCr,
      label: led.base.label,
      quarter: led.base.sourceQuarter,
      asOf: led.base.sourceQuarterEndDate,
      sourceLine: led.base.sourceLine,
      // KIRLOSENG's disclosed figure is a two-product carve-out, not a
      // company-wide backlog — the ratio below is not comparable without it.
      isCompanyWideTotal: companyId !== 'NSE:KIRLOSENG',
    },
    newOrdersSinceLastConcall: {
      count: wins.length,
      totalCr: inflowCr,
      windowStart,
      windowEnd,
      windowDays,
      annualisedInflowCr,
      wins,
    },
    currentOrderBookCr: led.cumulative.valueCr,
    quantities: led.cumulative.quantities,
    executionWindow: led.cumulative.executionWindow,
    fy26RevenueCr: revenueCr,
    bookToBill: round(led.cumulative.valueCr / revenueCr),
    inflowToRevenue: round(annualisedInflowCr / revenueCr),
    watermark: led.watermark,
  };
});

const result = {
  generatedAt: new Date().toISOString(),
  question:
    'Order-book comparison and revenue visibility ranking: NSE:RVNL vs NSE:NCC vs NSE:KIRLOSENG',
  method: {
    orderBook:
      'packages/jobs-runtime/orderBookSync.js — base = latest concall-declared order book, plus every Reg-30 order-win filing since that quarter end, values read from the filing PDF text layer',
    revenue: 'Screener consolidated P&L, FY26 (Mar 2026) Sales',
    baseQuarterForAll: '202603 (Q4 FY26 concall)',
  },
  companies,
  ranking: {
    byBookToBill: companies
      .filter((c) => c.base.isCompanyWideTotal)
      .sort((a, b) => b.bookToBill - a.bookToBill)
      .map((c) => ({ companyId: c.companyId, bookToBill: c.bookToBill })),
    verdict: 'NSE:RVNL',
    verdictReason:
      'Largest absolute backlog (Rs 1.05 lakh Cr), highest book-to-bill (5.1x vs NCC 4.2x), longest visible execution tail (to Dec 2029), and the fastest post-concall order intake. NCC is a close second and carries the better-quality book per rupee (74% escalation-protected, 7 verticals, no single-client dependency) but management withdrew FY27 guidance. KIRLOSENG is not an order-book business and is excluded from the ratio ranking.',
  },
  caveats: [
    'The base is net of work already executed but the post-concall deltas are gross, so a running total drifts slightly high between concalls. The next concall resets it.',
    "KIRLOSENG's Rs 798 Cr is labelled 'Order Book (Specialized) — Combined NPCIL & Marine', a two-product carve-out, not a company-wide backlog. Its 0.10x is a disclosure artefact, not a measure of weak visibility.",
    'NCC files one aggregate letter per month, so its intake is only visible through June 2026; the July letter is not out yet. RVNL files per order and its intake runs through 28 July 2026. The two intake windows are therefore not the same length and are annualised separately.',
    "NCC's June aggregate (Rs 534.85 Cr) was extracted at 'medium' confidence — the only figure of the ten below not at 'high'.",
    'Execution windows are derived from the stated duration anchored on the filing date, not from stated start/end dates.',
    "RVNL's ledger carries both a 'km' and a 'Km' quantity bucket (41.04 and 385) that should be one bucket — a canonicalisation gap in the ledger, not a double-counted rupee figure.",
  ],
};

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result.ranking, null, 2) + '\n');
for (const c of result.companies) {
  process.stdout.write(
    `${c.companyId}: book=${c.currentOrderBookCr} rev=${c.fy26RevenueCr} b2b=${c.bookToBill} inflow=${c.newOrdersSinceLastConcall.totalCr} (${c.newOrdersSinceLastConcall.count} wins, ${c.newOrdersSinceLastConcall.windowDays}d) ann=${c.newOrdersSinceLastConcall.annualisedInflowCr} i2r=${c.inflowToRevenue}\n`
  );
}
