#!/usr/bin/env node
'use strict';

/**
 * StockScans Watchlist Auto-Updater — Node port of watchlist_updater.py.
 *
 * Fetches ALL companies from the Chartist Near High Scan (paginated), excludes
 * the Radar watchlist, replaces the target watchlist by diff, and emails a
 * notification. Behaviour is preserved 1:1; the only addition is `--dry-run`,
 * which computes and prints the diff without applying or emailing.
 *
 * Usage:
 *   node watchlistUpdater.js [--dry-run] [--env-file <path>]
 *
 * Config (env or --env-file): STOCKSCANS_AUTH_TOKEN, GOOGLE_APP_PASSWORD.
 */

const fs = require('fs');
const path = require('path');
const { stockscans } = require('@stock/api');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, hasFlag, argValue } = require('./lib/env');

/**
 * Lazily resolve the saved-scan helper (lives in the `screener-api` package).
 * Custom scans must run with THEIR OWN saved filters, not the hardcoded
 * Near-High payload — `runScan` sends the payload's filters, so a different
 * scanId alone would silently reuse the wrong filters. Walk up from here to
 * find the module regardless of monorepo layout.
 */
function loadSavedScanHelper() {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(
      dir,
      'screener-api/src/features/screener/stockscansSavedScan.js'
    );
    if (fs.existsSync(candidate)) return require(candidate);
    dir = path.dirname(dir);
  }
  throw new Error(
    'Could not locate screener-api/.../stockscansSavedScan.js for saved-scan fetch'
  );
}

// ── Configuration (identical to the Python job) ───────────────────────────────

// Defaults preserve the original nightly "Near Highs" behaviour. The scan and
// target-watchlist IDs are parameterizable via `--scan-id` / `--watchlist-id`
// (or the main() opts) so this job is agnostic of any specific pairing — the
// caller supplies the mapping.
const DEFAULT_SCAN_ID = '9493efc2c969d602c5dedbe2';
const DEFAULT_SCAN_NAME = 'Chartist Near High Scan';
const DEFAULT_WATCHLIST_ID = '0a365ec2139aa6ca7f74c250';
const DEFAULT_WATCHLIST_NAME = 'Near Highs';
const PAGE_SIZE = 50;

const DEFAULT_RADAR_WATCHLIST_ID = '7ca0e1a60c3fd0d8b1ab61ce';
const RADAR_WATCHLIST_NAME = 'Radar';

/** Build the scan payload for a given scan id/name (filters are constant). */
function buildScanPayload(scanId, scanName) {
  return {
    ratiosType: 'Performance',
    timePeriod: 'Latest',
    scan: {
      scanId,
      scanName,
      scanDescription: 'Chartist Scan',
      industry: [],
      index: [],
      sector: [],
      tags: [],
      watchlistIds: [],
      filters: [
        { left: '52WH Distance', sign: '<', right: '20' },
        { left: '52WL Distance', sign: '>', right: '50' },
        { left: 'Close Price', sign: '>=', right: 'EMA 200D' },
        { left: 'Volume SMA 50D * SMA 50D', sign: '>=', right: '50000000' },
        { left: 'Market Capitalization', sign: '>=', right: '500' },
        { left: 'Market Capitalization', sign: '<', right: '50000' },
      ],
      alertFrequency: null,
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset: 0,
  };
}

// ── Pure helpers (exported for parity tests) ──────────────────────────────────

/** Format an IST timestamp like "2026-06-27 04:39 PM IST". */
function nowIst(date = new Date()) {
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const y = ist.getUTCFullYear();
  const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  let h = ist.getUTCHours();
  const min = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${y}-${mo}-${d} ${String(h).padStart(2, '0')}:${min} ${ampm} IST`;
}

/** Extract companyIds from a scan/watchlist `table` (row 0 = headers). */
function companyIdsFromTable(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  const idIdx = table[0].indexOf('companyId');
  if (idIdx < 0) return [];
  return table.slice(1).map((row) => row[idIdx]);
}

/**
 * Compute the add/remove diff (both sorted ascending), matching the Python
 * set-difference semantics exactly.
 * @param {Set<string>|string[]} desired
 * @param {Set<string>|string[]} current
 * @returns {{ add: string[], remove: string[] }}
 */
function computeDiff(desired, current) {
  const d = new Set(desired);
  const c = new Set(current);
  const add = [...d].filter((x) => !c.has(x)).sort();
  const remove = [...c].filter((x) => !d.has(x)).sort();
  return { add, remove };
}

/** Paginate the scan and return all companyIds. */
async function fetchAllCompanies(
  scanId = DEFAULT_SCAN_ID,
  scanName = DEFAULT_SCAN_NAME,
  client = stockscans,
  log = console.log
) {
  // Non-default scan → use its OWN saved definition/filters (correctness).
  // Default nightly scan → keep the proven hardcoded-filter path below.
  if (scanId && scanId !== DEFAULT_SCAN_ID) {
    const { fetchCompanyIdsFromSavedScanUrl } = loadSavedScanHelper();
    log(`  Using saved-scan definition for scanId=${scanId} (custom scan)`);
    const r = await fetchCompanyIdsFromSavedScanUrl(scanId);
    const ids = r.companyIds || r;
    log(
      `  Total companies in scan: ${r.meta?.total ?? ids.length}` +
        (r.meta?.scanName ? ` ('${r.meta.scanName}')` : '')
    );
    log(`  ✓ Total fetched: ${ids.length} companies`);
    return ids;
  }

  const companyIds = [];
  let offset = 0;
  let total = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const payload = buildScanPayload(scanId, scanName);
    payload.offset = offset;

    const data = await client.runScan(payload, scanId);

    if (total === null) {
      total = data.total || 0;
      log(`  Total companies in scan: ${total}`);
    }

    const batch = companyIdsFromTable(data.table || []);
    if (batch.length === 0) break;
    companyIds.push(...batch);
    log(
      `  Fetched offset=${offset}: ${batch.length} companies ` +
        `(cumulative: ${companyIds.length}/${total})`
    );

    if (companyIds.length >= total || batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return companyIds;
}

/** Fetch companyIds from any watchlist. */
async function fetchWatchlistCompanyIds(watchlistId, client = stockscans) {
  const data = await client.watchlistTable(watchlistId);
  return new Set(companyIdsFromTable(data.table || []));
}

// ── Output DTO (skills/tooling/output-dto-standard) ───────────────────────────

/**
 * Persist the day's "what changed" as the canonical JSON DTO, written BEFORE
 * the summary email is composed — the email is a render of this file, not an
 * independent second source of facts. One record per ticker that was added or
 * removed, each carrying the standard envelope (companyId/creationTime/
 * modifiedTime/creator).
 */
function writeSyncDto({ scanName, watchlistName, watchlistId, before, excluded, desiredCount, itemsToAdd, itemsToRemove, now }) {
  const dataRoot = path.join(__dirname, '..', '..', 'jobs', 'data', 'watchlist_sync');
  fs.mkdirSync(dataRoot, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const records = [
    ...itemsToAdd.map((companyId) => ({
      companyId,
      change: 'added',
      watchlistId,
      watchlistName,
      scanName,
      creationTime: nowIso,
      modifiedTime: nowIso,
      creator: 'watchlist-sync',
    })),
    ...itemsToRemove.map((companyId) => ({
      companyId,
      change: 'removed',
      watchlistId,
      watchlistName,
      scanName,
      creationTime: nowIso,
      modifiedTime: nowIso,
      creator: 'watchlist-sync',
    })),
  ];
  const dto = {
    date: dateStr,
    runAt: now,
    scanName,
    watchlistName,
    watchlistId,
    companiesFromScan: before,
    excludedInRadar: excluded,
    desiredFinalCount: desiredCount,
    added: itemsToAdd.length,
    removed: itemsToRemove.length,
    records,
  };
  const safeName = String(watchlistName || 'watchlist').replace(/[^a-z0-9]+/gi, '_');
  const outPath = path.join(dataRoot, `${dateStr}_${safeName}_watchlist_sync.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(dto, null, 2)}\n`);
  return outPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main({
  scanId = DEFAULT_SCAN_ID,
  scanName = DEFAULT_SCAN_NAME,
  watchlistId = DEFAULT_WATCHLIST_ID,
  watchlistName = DEFAULT_WATCHLIST_NAME,
  radarId = DEFAULT_RADAR_WATCHLIST_ID,
  client = stockscans,
  dryRun = false,
  log = console.log,
} = {}) {
  const SCAN_NAME = scanName;
  const WATCHLIST_NAME = watchlistName;
  const WATCHLIST_ID = watchlistId;
  const RADAR_WATCHLIST_ID = radarId;
  const now = nowIst();
  log(`\n${'='.repeat(55)}`);
  log(`  StockScans Watchlist Updater  —  ${now}${dryRun ? '  [DRY RUN]' : ''}`);
  log(`${'='.repeat(55)}`);
  // Step 0 — validate auth
  try {
    await client.validateAuth();
  } catch (e) {
    log(`  ✗ Auth validation failed: ${e.message}`);
    if (!dryRun) {
      await sendHtmlEmail({
        subject: 'StockScans Watchlist Update - ❌ Auth Failed',
        htmlBody: `<p><b>Time:</b> ${now}</p><p><b>Error:</b> ${e.message}</p><p>Please update STOCKSCANS_AUTH_TOKEN in .env.</p>`,
      });
    }
    throw e;
  }

  // Step 1 — fetch all companies
  log(`\n[Step 1] Fetching companies from ${SCAN_NAME}...`);
  let companyIds;
  try {
    companyIds = await fetchAllCompanies(scanId, scanName, client, log);
    log(`  ✓ Total fetched: ${companyIds.length} companies`);
  } catch (e) {
    log(`  ✗ Scan fetch failed: ${e.message}`);
    if (!dryRun) {
      await sendHtmlEmail({
        subject: 'StockScans Watchlist Update - ❌',
        htmlBody: `<p><b>Time:</b> ${now}</p><p><b>Stage:</b> Scan fetch failed</p>` +
          `<p><b>Error:</b> ${e.message}</p><p>Watchlist was <b>NOT modified</b>.</p>`,
      });
    }
    throw e;
  }
  if (companyIds.length === 0) {
    log('  ✗ Scan returned 0 companies — aborting.');
    throw new Error('scan returned 0 companies');
  }

  // Step 2 — exclude Radar
  log(`\n[Step 2] Fetching '${RADAR_WATCHLIST_NAME}' watchlist to exclude...`);
  let excluded = 0;
  const before = companyIds.length;
  try {
    const radarIds = await fetchWatchlistCompanyIds(RADAR_WATCHLIST_ID, client);
    log(`  ✓ ${radarIds.size} companies in '${RADAR_WATCHLIST_NAME}'`);
    companyIds = companyIds.filter((cid) => !radarIds.has(cid));
    excluded = before - companyIds.length;
    log(`  ✓ Excluded ${excluded} overlapping companies → ${companyIds.length} remaining`);
  } catch (e) {
    log(`  ✗ Radar fetch failed: ${e.message} — proceeding without exclusion`);
  }

  // Step 3 — current state + diff
  log(`\n[Step 3] Fetching current '${WATCHLIST_NAME}' watchlist state...`);
  let currentIds;
  try {
    currentIds = await fetchWatchlistCompanyIds(WATCHLIST_ID, client);
    log(`  ✓ Current watchlist has ${currentIds.size} companies`);
  } catch (e) {
    log(`  ✗ Watchlist fetch failed: ${e.message}`);
    if (!dryRun) {
      await sendHtmlEmail({
        subject: 'StockScans Watchlist Update - ❌',
        htmlBody: `<p><b>Time:</b> ${now}</p><p><b>Stage:</b> Current watchlist fetch failed</p>` +
          `<p><b>Error:</b> ${e.message}</p><p>Watchlist was <b>NOT modified</b>.</p>`,
      });
    }
    throw e;
  }

  const desiredIds = new Set(companyIds);
  const { add: itemsToAdd, remove: itemsToRemove } = computeDiff(desiredIds, currentIds);
  log(`  → To add: ${itemsToAdd.length}, To remove: ${itemsToRemove.length}`);

  if (dryRun) {
    log('\n[DRY RUN] Skipping update + email.');
    return { before, excluded, desired: desiredIds.size, add: itemsToAdd, remove: itemsToRemove };
  }

  // Persist the JSON DTO BEFORE the email — the notification is a render of
  // this file, never a second independent source of facts.
  const dtoPath = writeSyncDto({
    scanName: SCAN_NAME,
    watchlistName: WATCHLIST_NAME,
    watchlistId: WATCHLIST_ID,
    before,
    excluded,
    desiredCount: desiredIds.size,
    itemsToAdd,
    itemsToRemove,
    now,
  });
  log(`  ✓ Wrote sync DTO: ${dtoPath}`);

  // Step 4 — apply diff
  log(`\n[Step 4] Updating watchlist '${WATCHLIST_NAME}'...`);
  try {
    if (itemsToRemove.length) {
      await client.updateWatchlist(WATCHLIST_ID, 'delete', itemsToRemove);
      log(`  ✓ Deleted ${itemsToRemove.length} companies`);
    } else log('  ✓ Nothing to delete');
    if (itemsToAdd.length) {
      await client.updateWatchlist(WATCHLIST_ID, 'add', itemsToAdd);
      log(`  ✓ Added ${itemsToAdd.length} companies`);
    } else log('  ✓ Nothing to add');
  } catch (e) {
    log(`  ✗ Watchlist update failed: ${e.message}`);
    await sendHtmlEmail({
      subject: 'StockScans Watchlist Update - ❌',
      htmlBody: `<p><b>Time:</b> ${now}</p><p><b>Stage:</b> Watchlist add/delete failed</p>` +
        `<p><b>Error:</b> ${e.message}</p><p>To add: <b>${itemsToAdd.length}</b> | ` +
        `To remove: <b>${itemsToRemove.length}</b> — watchlist may be <b>partially updated</b>.</p>`,
    });
    throw e;
  }

  // Step 5 — notify
  log('\n[Step 5] Sending Gmail notification...');
  await sendHtmlEmail({
    subject: 'StockScans Watchlist Update - ✅',
    htmlBody:
      `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Time</b></td><td>${now}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Scan Name</b></td><td>${SCAN_NAME}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Watchlist Name</b></td><td>${WATCHLIST_NAME}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Companies from Scan</b></td><td>${before}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Excluded (in Radar)</b></td><td>${excluded}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Desired Final Count</b></td><td>${desiredIds.size}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Added</b></td><td>${itemsToAdd.length}</td></tr>` +
      `<tr><td style="padding:4px 12px 4px 0"><b>Removed</b></td><td>${itemsToRemove.length}</td></tr></table>`,
  });

  log(`\n${'='.repeat(55)}`);
  log(`  ✅ Done — added ${itemsToAdd.length}, removed ${itemsToRemove.length}, ` +
    `final count ~${desiredIds.size}`);
  log(`${'='.repeat(55)}\n`);
  return { before, excluded, desired: desiredIds.size, add: itemsToAdd, remove: itemsToRemove };
}

module.exports = {
  main,
  fetchAllCompanies,
  buildScanPayload,
  computeDiff,
  companyIdsFromTable,
  nowIst,
  DEFAULT_SCAN_ID,
  DEFAULT_WATCHLIST_ID,
  DEFAULT_RADAR_WATCHLIST_ID,
  PAGE_SIZE,
};

// CLI entry
if (require.main === module) {
  loadEnv(argValue('--env-file'));
  main({
    dryRun: hasFlag('--dry-run'),
    scanId: argValue('--scan-id') || undefined,
    watchlistId: argValue('--watchlist-id') || undefined,
    scanName: argValue('--scan-name') || undefined,
    watchlistName: argValue('--watchlist-name') || undefined,
    radarId: argValue('--radar-id') || undefined,
  }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
