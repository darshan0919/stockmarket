#!/usr/bin/env node
'use strict';

/**
 * mnaTracker.js — Weekly Mergers and Acquisitions tracker
 *
 * Uses Stockscans API to search for corporate announcements related to
 * "merger", "demerger", "acquisition", "spin-off", "amalgamation", then asks
 * an LLM to extract deal terms and strategic rationale from the batch.
 *
 * RESUMABLE CURSOR (added 2026-08-23): this job used to re-fetch and
 * re-summarize whatever the M&A scan currently returned as "recent" on
 * every run, with no persisted state at all — two runs close together (a
 * manual catch-up followed by the next weekly run, or a retried failure)
 * would fully re-summarize the same overlapping announcements, paying for
 * a fresh ~80k-char LLM call over data already summarized minutes/days
 * earlier. Fixed per `skills/_shared/conventions.md` §19 using the shared
 * `lib/windowCursor.js` module — see that module's doc comment for the
 * general pattern, and `postCloseScanInsights.js` for the other consumer.
 *
 * Also fixed in this pass: the scan payload previously sent `scanId: ''`,
 * `quarterDate: ''`, and a single `offset: 0` call with no pagination —
 * `docs/stockscans-api-schemas.md` documents `scan.scanId`/`scan.scanName`
 * as REQUIRED (empty string returns HTTP 400) and `quarterDate` as the
 * top-level quarter filter, format "YYYYMM". Reused the same
 * `DEFAULT_SCAN_ID`/`DEFAULT_SCAN_NAME` placeholder constants
 * `bulkAnnouncementScan.js` uses for ad-hoc (non-saved) scans, and the same
 * cutoff-pagination shape `postCloseScanInsights.js` already uses (results
 * are newest-first; stop once a page crosses the window-start).
 */

const path = require('path');
const { StockscansClient } = require('@stock/api');
const { loadEnv } = require('./lib/env');
const { callAnthropic } = require('./lib/anthropicClient');
const ist = require('./lib/ist');
const windowCursor = require('./lib/windowCursor')('mna-tracker');

loadEnv(path.join(__dirname, '../../.env'));

const PAGE_SIZE = 30; // documented convention (see bulkAnnouncementScan.js) — not the response's self-inflating `total`
const MAX_PAGES = 40; // safety cap, not a trust boundary — see stop conditions in fetchNewAnnouncements
// Ad-hoc (non-saved) scan identity — accepted as a placeholder rather than
// actually scoping to that saved scan's filters (see docs/stockscans-api-schemas.md).
const DEFAULT_SCAN_ID = '59822b15a2859d183df3770d';
const DEFAULT_SCAN_NAME = 'Recordings';
// Deterministic floor: this job runs weekly, so "at least the last 7 days"
// is the minimum window regardless of cursor state — matches its own
// schedule cadence, same role `defaultCutoffUtc` plays in postCloseScanInsights.js.
const FLOOR_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function currentQuarterDate(date = new Date()) {
  const d = ist.istDate(date);
  const m = d.getUTCMonth();
  const q = Math.floor(m / 3);
  const endMonth = (q + 1) * 3;
  return `${d.getUTCFullYear()}${String(endMonth).padStart(2, '0')}`;
}

function parseAnnDateToUtc(str) {
  if (!str) return null;
  if (/[+-]\d{2}:\d{2}$/.test(str) || /Z$/.test(str)) return new Date(str);
  const m = String(str).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, dd, h, mi, s] = m.map(Number);
    return new Date(Date.UTC(y, mo - 1, dd, h, mi, s) - (5 * 60 + 30) * 60 * 1000);
  }
  return new Date(str);
}

/**
 * Build the M&A-insights prompt for a batch of announcement text.
 * @param {string} text - Combined announcement subjects/descriptions.
 * @returns {string} Prompt ready to pass to `callAnthropic`.
 */
function buildMnaPrompt(text) {
  return `You are a financial analyst tracking M&A activities. Extract and summarize all Mergers, Demergers, Acquisitions, Spin-offs, and Amalgamations from the following announcements. Focus on identifying the target companies, the deal values (if any), and most importantly, the "Strategic Rationale" behind each move:

Announcements:
${text.substring(0, 80000)}
`;
}

/**
 * Paginate the M&A scan, stopping once a page crosses `cutoffMs` (results
 * are newest-first — same stop condition postCloseScanInsights.js uses).
 * Returns only items at/after the cutoff.
 */
async function fetchNewAnnouncements(client, cutoffMs, now = new Date()) {
  const quarterDate = currentQuarterDate(now);
  const inWindow = [];
  let offset = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    const payload = {
      scan: {
        scanId: DEFAULT_SCAN_ID,
        scanName: DEFAULT_SCAN_NAME,
        filters: [],
        industry: [],
        index: [],
        watchlistIds: [],
        searchFilters: [],
        announcementType: 'All',
        alerts: false,
        searchMode: 'full',
        companyIds: [],
        companyFilters: [],
        query: 'merger OR demerger OR acquisition OR spin-off OR amalgamation',
      },
      offset,
      quarterDate,
    };
    const data = await client.scanAnnouncements(payload, { optionalAuth: true });
    const items = data?.announcements || data?.documents || data?.items || [];
    if (!items.length) break;

    let crossedCutoff = false;
    for (const item of items) {
      const dt = parseAnnDateToUtc(item.date || item.createdAt);
      if (dt && dt.getTime() >= cutoffMs) {
        inWindow.push(item);
      } else {
        crossedCutoff = true;
      }
    }
    offset += items.length;
    page += 1;
    if (items.length < PAGE_SIZE) break; // short page = last page
    if (crossedCutoff) break; // newest-first — safe to stop once we've seen an out-of-window item
  }
  return inWindow;
}

async function runMnaTracker({ windowHoursArg = null } = {}) {
  console.log('Starting M&A Tracker...');
  const client = new StockscansClient();
  const now = new Date();

  const floorMs = now.getTime() - FLOOR_LOOKBACK_MS;
  const startMs = await windowCursor.resolveWindowStartMs({ now, floorMs, windowHoursArg });
  console.log(
    `Fetching M&A announcements since ${new Date(startMs).toISOString()} (floor: ${new Date(floorMs).toISOString()}).`
  );

  try {
    const items = await fetchNewAnnouncements(client, startMs, now);
    console.log(`Found ${items.length} new M&A announcement(s) since last run.`);

    if (items.length > 0) {
      const combinedText = items
        .map(
          (i) =>
            `[${i.companyName || i.ticker || i.companyId}] ${i.title || i.subject}\n${i.description}`
        )
        .join('\n\n');
      console.log('Generating AI Insights for M&A...');
      const insights = await callAnthropic(buildMnaPrompt(combinedText));
      if (insights) {
        console.log('\n--- M&A Insights ---\n');
        console.log(insights);
        console.log('\n--------------------\n');
      }
    } else {
      console.log('Nothing new to summarize — skipping the LLM call.');
    }

    // Commit only after the fetch+summarize path completed without error —
    // an empty window is still safe to commit (there was genuinely nothing
    // to miss), but a thrown error below must NOT advance the cursor, or
    // the next run's window would no longer reach back far enough to
    // retry whatever this run failed to process.
    await windowCursor.savePendingWindow({ windowEndMs: now.getTime() });
    await windowCursor.commitWindow();
    console.log('M&A Tracker completed successfully.');
  } catch (err) {
    console.error('Failed to run M&A Tracker:', err.message);
    console.error(
      'Cursor NOT committed — next run will retry this same window (plus whatever is new since).'
    );
  }
}

if (require.main === module) {
  const windowHoursArg = (() => {
    const i = process.argv.indexOf('--window-hours');
    return i >= 0 ? process.argv[i + 1] : null;
  })();
  runMnaTracker({ windowHoursArg }).catch(console.error);
}

module.exports = { runMnaTracker };
