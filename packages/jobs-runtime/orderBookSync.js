#!/usr/bin/env node
'use strict';

/**
 * orderBookSync.js — keeps the order-book database fresh for every company on
 * the Radar watchlist.
 *
 * For each company it runs the same cache-first orchestrator a human would
 * invoke by hand (scripts/orderbook/getCompanyOrderBook.js), which means the
 * job is cheap to re-run: a company with no new concall and no new filings
 * makes zero network calls and recomputes nothing. That property is what lets
 * this run daily without burning the Stockscans concall-notes quota
 * (600 calls/month across the whole account).
 *
 * Durable facts land in the events collection as `order-win` and
 * `order-book-declared` records; the running cumulative stays in the cache
 * ledger as derived state. See lib/orderBookEvents.js for why the split.
 *
 * A company failing is never fatal — order books are independent, and one bad
 * ticker shouldn't cost the other forty their refresh. Failures are collected
 * and reported in the run summary.
 *
 * Usage:
 *   node orderBookSync.js [--watchlist-id <id>] [--companies NSE:A,NSE:B]
 *                         [--limit N] [--concurrency N] [--dry-run]
 *                         [--force-recompute] [--env-file <path>]
 *
 * `--force-recompute` re-judges cached concall verdicts against the current
 * extractor. It costs no API calls (the concall text is already cached) and
 * is the right thing to run after the extraction rules change.
 *
 * @see {@link docs/ORDER_BOOK_EXTRACTION.md}
 * @see {@link skills/equity-research/order-book-tracker/SKILL.md}
 */

const { loadEnv, argValue, hasFlag } = require('./lib/env');

// The Radar watchlist — the curated set worth tracking order books for.
const RADAR_WATCHLIST_ID = '7ca0e1a60c3fd0d8b1ab61ce';
const DEFAULT_CONCURRENCY = 4;
const CREATOR = 'order-book-sync';

/** Extract companyIds from a watchlist `table` (row 0 = headers). */
function companyIdsFromTable(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  const idIdx = table[0].indexOf('companyId');
  if (idIdx < 0) return [];
  return table.slice(1).map((row) => row[idIdx]);
}

/** Run `fn` over `items` with at most `limit` in flight. Order of results is preserved. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @param {Object} [opts]
 * @param {Object} [opts.client] - injectable Stockscans client (tests)
 * @param {string} [opts.watchlistId]
 * @param {string[]} [opts.companies] - bypass the watchlist entirely
 * @param {number} [opts.limit] - cap companies processed (smoke runs)
 * @param {number} [opts.concurrency]
 * @param {boolean} [opts.dryRun] - resolve the universe but don't touch data
 * @param {Function} [opts.log]
 */
async function main(opts = {}) {
  const {
    client,
    watchlistId = RADAR_WATCHLIST_ID,
    companies,
    limit,
    concurrency = DEFAULT_CONCURRENCY,
    dryRun = false,
    forceRecompute = false,
    log = (m) => process.stderr.write(`[order-book-sync] ${m}\n`),
  } = opts;

  const stockscans = client || require('@stock/api').stockscans;
  const { getCompanyOrderBook } = require('./scripts/orderbook/getCompanyOrderBook');
  const db = require('./lib/db');

  let universe = companies;
  if (!universe) {
    log(`fetching Radar watchlist ${watchlistId}`);
    const data = await stockscans.watchlistTable(watchlistId);
    universe = companyIdsFromTable(data.table || []);
  }
  universe = [...new Set(universe.filter(Boolean))];
  if (limit) universe = universe.slice(0, limit);
  log(`${universe.length} companies to refresh`);

  if (dryRun) {
    return { dryRun: true, companies: universe, refreshed: [], failed: [] };
  }

  const refreshed = [];
  const failed = [];
  const needsAttention = [];
  const notApplicable = [];

  await mapLimit(universe, concurrency, async (companyId) => {
    try {
      const res = await getCompanyOrderBook(companyId, {
        client: stockscans,
        forceRecompute,
      });
      if (!res.ok) {
        // `noOrderBookDisclosed` is a settled answer (the company doesn't
        // report an order book), so it belongs in `notApplicable` rather than
        // in the queue of things a human or an LLM still needs to look at —
        // otherwise the same names resurface every single day.
        if (res.reason === 'noOrderBookDisclosed') {
          notApplicable.push({ companyId, quarter: res.quarter });
        } else {
          needsAttention.push({ companyId, reason: res.reason, note: res.note });
        }
        return;
      }
      refreshed.push({
        companyId,
        cumulativeCr: res.cumulative.valueCr,
        baseQuarter: res.base.sourceQuarter,
        newWins: res.newlyAppliedAnnouncements.length,
        healed: (res.healedFromFallback || []).length,
        pending: res.pendingLlmFallback.length,
        quantities: res.cumulative.quantities,
      });
      if (res.pendingLlmFallback.length) {
        needsAttention.push({
          companyId,
          reason: 'pendingLlmFallback',
          count: res.pendingLlmFallback.length,
          items: res.pendingLlmFallback.map((p) => ({
            ssUrl: p.ssUrl,
            date: p.date,
            reason: p.reason,
          })),
        });
      }
    } catch (e) {
      failed.push({ companyId, error: e.message });
    }
  });

  // One audit record per run, so the health of the pipeline is queryable
  // rather than only visible in whatever console captured this run.
  const today = new Date().toISOString().slice(0, 10);
  db.appendEvents(
    [
      {
        type: 'order-book-sync',
        date: today,
        creator: CREATOR,
        summary: `Order book sync: ${refreshed.length} refreshed, ${needsAttention.length} need attention, ${notApplicable.length} n/a, ${failed.length} failed`,
        watchlistId,
        companiesConsidered: universe.length,
        refreshedCount: refreshed.length,
        notApplicableCount: notApplicable.length,
        totalNewWins: refreshed.reduce((s, r) => s + r.newWins, 0),
        totalHealed: refreshed.reduce((s, r) => s + r.healed, 0),
        pendingCount: needsAttention.filter((n) => n.reason === 'pendingLlmFallback').length,
        failed,
      },
    ],
    { creator: CREATOR }
  );

  log(
    `refreshed=${refreshed.length} attention=${needsAttention.length} n/a=${notApplicable.length} failed=${failed.length}`
  );
  return { companies: universe, refreshed, needsAttention, notApplicable, failed, date: today };
}

module.exports = { main, companyIdsFromTable, mapLimit, RADAR_WATCHLIST_ID };

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  const companiesArg = argValue('--companies');
  main({
    watchlistId: argValue('--watchlist-id') || undefined,
    companies: companiesArg ? companiesArg.split(',').map((s) => s.trim()) : undefined,
    limit: argValue('--limit') ? parseInt(argValue('--limit'), 10) : undefined,
    concurrency: argValue('--concurrency') ? parseInt(argValue('--concurrency'), 10) : undefined,
    dryRun: hasFlag('--dry-run'),
    forceRecompute: hasFlag('--force-recompute'),
  })
    .then((res) => {
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
