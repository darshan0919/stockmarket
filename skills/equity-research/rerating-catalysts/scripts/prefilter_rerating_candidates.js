#!/usr/bin/env node
'use strict';

/**
 * prefilter_rerating_candidates.js — Stage 0 of the rerating-catalysts scale
 * funnel (skills/_shared/scale-funnel-pattern.md).
 *
 * Zero-LLM, deterministic gate: for a batch of companies (a Stockscans saved
 * scan, or an explicit ticker list), decide which ones have *something new*
 * to look at since the last time rerating-catalysts ran on them. Companies
 * with nothing new are dropped before any document is fetched or read --
 * this is the step that keeps a "run this for 100s of companies daily" ask
 * from turning into 100s of full flagship-model syntheses.
 *
 * "Something new" is judged the same way Phase 1 of rerating-catalysts
 * itself already frames document acquisition, restated as machine-checkable
 * predicates:
 *
 *   - A new Result/PPT/Transcript/announcement has been filed since the
 *     last `rerating-catalysts` report's `date` for this company (checked
 *     via db.find('reports', {companyId, type: 'rerating-catalysts'}) for
 *     the prior run, then a live announcements/document fetch for what's
 *     filed since).
 *   - No prior `rerating-catalysts` report exists at all (first run --
 *     always a candidate; there is nothing to diff against).
 *   - A numeric delta is present on the scan row itself (if resolved via
 *     --scan-url): 1D/1W return spikes, or (when the scan carries it)
 *     shareholding/price columns moving meaningfully -- these are the same
 *     signals watchlist-catalyst-scanner's priceVolumeAlerts() already
 *     treats as worth a look.
 *
 * This script does NOT classify or read any filing text -- that is
 * explicitly Stage 1's job (extract_rerating_excerpts.js) and Stage 3's job
 * (rerating-catalysts itself). It only answers yes/no per company, plus a
 * one-line reason, so the caller knows which handful of names to actually
 * spend tokens on.
 *
 * Usage:
 *   node prefilter_rerating_candidates.js --scan-url <stockscans saved-scan URL> [--days 7]
 *   node prefilter_rerating_candidates.js --tickers NSE:A,NSE:B [--days 7]
 *
 * Output (stdout): JSON array, one entry per company:
 *   {
 *     companyId, ticker,
 *     candidate: true|false,
 *     reason: "new Result filed 2026-08-14 (no rerating-catalysts report exists)"
 *            | "no rerating-catalysts report on file -- first run" | "quiet: no new filings since last run (2026-08-08)",
 *     lastReport: { id, date } | null,
 *     newFilings: [{ type, date }],
 *     priceFlag: { ret1d, ret1w } | null
 *   }
 */
const path = require('path');
const { resolveUniverse } = require('../../../../stock-api/src/analyzers/runScan.js');
const { fetchAnnouncements } = require('../../../../stock-api/src/fetchers/announcementsFetcher.js');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

const PRICE_RET_1D = 7.0;
const PRICE_RET_1W = 12.0;

function parseArgs(argv) {
  const out = { days: 7 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan-url') out.scanUrl = argv[++i];
    else if (a === '--tickers') out.tickers = argv[++i].split(',').map((t) => t.trim());
    else if (a === '--days') out.days = parseInt(argv[++i], 10);
  }
  return out;
}

function lastReratingReport(companyId) {
  const rows = db.find('reports', {
    companyId,
    type: 'rerating-catalysts',
    limit: 1,
    sort: 'date',
  });
  if (!rows || !rows.length) return null;
  const r = rows[0];
  return { id: r.id, date: r.date };
}

async function newFilingsSince(companyId, sinceDate, days) {
  // Reuse the same window logic rerating-catalysts Phase 1 already uses for
  // its own 7-day announcement pull, but bound the *start* by whichever is
  // later: (today - days) or the day after the last report -- so a company
  // whose last report is 3 weeks old still only reports what's genuinely
  // new since that report, not a re-flagged stale window.
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - days);
  let startDate = windowStart;
  if (sinceDate) {
    const sd = new Date(sinceDate);
    if (sd > startDate) startDate = sd;
  }
  const startStr = startDate.toISOString().substring(0, 10);

  let anns;
  try {
    anns = await fetchAnnouncements(companyId, { startDate: startStr, outputDir: null });
  } catch (e) {
    return { error: e.message, filings: [] };
  }
  const rows = (anns && anns.announcements) || anns || [];
  const filings = (Array.isArray(rows) ? rows : []).map((a) => ({
    type: a.type || a.announcementType || 'Announcement',
    date: (a.date || '').substring(0, 10),
    title: a.title || '',
  }));
  return { filings };
}

async function evaluateCompany(companyId, scanRow) {
  const last = lastReratingReport(companyId);
  const days = 7;
  const { filings, error } = await newFilingsSince(companyId, last && last.date, days);

  let priceFlag = null;
  if (scanRow) {
    const r1d = scanRow['Returns 1D'];
    const r1w = scanRow['Returns 1W'];
    if ((r1d !== undefined && Math.abs(r1d) >= PRICE_RET_1D) ||
        (r1w !== undefined && Math.abs(r1w) >= PRICE_RET_1W)) {
      priceFlag = { ret1d: r1d, ret1w: r1w };
    }
  }

  if (!last) {
    return {
      companyId,
      candidate: true,
      reason: 'no rerating-catalysts report on file -- first run',
      lastReport: null,
      newFilings: filings,
      priceFlag,
      fetchError: error || null,
    };
  }

  if (filings.length > 0) {
    return {
      companyId,
      candidate: true,
      reason: `${filings.length} new filing(s) since last report (${last.date}): ${filings
        .slice(0, 3)
        .map((f) => `${f.type} ${f.date}`)
        .join(', ')}${filings.length > 3 ? ', ...' : ''}`,
      lastReport: last,
      newFilings: filings,
      priceFlag,
      fetchError: error || null,
    };
  }

  if (priceFlag) {
    return {
      companyId,
      candidate: true,
      reason: `no new filings, but price/volume flag (1D ${priceFlag.ret1d ?? 'n/a'}%, 1W ${priceFlag.ret1w ?? 'n/a'}%) -- worth a check even absent a filing`,
      lastReport: last,
      newFilings: [],
      priceFlag,
      fetchError: error || null,
    };
  }

  return {
    companyId,
    candidate: false,
    reason: `quiet: no new filings since last report (${last.date})`,
    lastReport: last,
    newFilings: [],
    priceFlag: null,
    fetchError: error || null,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let companies = [];

  if (opts.scanUrl) {
    const universe = await resolveUniverse(opts.scanUrl);
    companies = universe.companies || [];
  } else if (opts.tickers) {
    companies = opts.tickers.map((t) => ({ companyId: t }));
  } else {
    console.error('Usage: --scan-url <url> | --tickers NSE:A,NSE:B [--days 7]');
    process.exit(1);
  }

  const byId = {};
  for (const c of companies) if (c.companyId) byId[c.companyId] = c;

  const results = [];
  // Sequential, not parallel -- this is a light per-company announcements
  // call (already the pattern rerating-catalysts itself uses per-company),
  // and staying sequential avoids hammering the Stockscans API across a
  // large batch. If batch size becomes a real bottleneck, wrap in
  // mapWithConcurrency (see stock-api/src/utils/concurrency.js) the same
  // way guidance-document-extractor does for its own bulk calls.
  for (const companyId of Object.keys(byId)) {
    const row = byId[companyId];
    // eslint-disable-next-line no-await-in-loop
    const res = await evaluateCompany(companyId, row);
    results.push(res);
  }

  const nCandidates = results.filter((r) => r.candidate).length;
  console.error(
    `[prefilter] ${results.length} companies scanned -> ${nCandidates} candidate(s) for rerating-catalysts Stage 3, ${
      results.length - nCandidates
    } quiet (skipped).`
  );
  process.stdout.write(JSON.stringify(results, null, 1));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}

module.exports = { evaluateCompany, lastReratingReport, newFilingsSince };
