#!/usr/bin/env node
'use strict';

/**
 * gainersWatchlistTtlSync.js — CLI entry point for
 * lib/gainersWatchlistTtl.js's syncGainersWatchlist(). Reads today's
 * qualified gainers set from the run's gainers_raw_{date}.json (the same
 * quality-filtered `passed` list gainersScanner.js writes — see its Step 1e),
 * syncs the "Daily Gainers" Stockscans watchlist against it, and applies the
 * 10-day TTL / reset-on-reappearance logic documented in that module.
 *
 * Run as its own step, after gainersScanner.js and before/after the
 * classifier (order doesn't matter relative to the classifier — this reads
 * the raw file, not the classifier's output) — see
 * skills/equity-research/gainers-signal/SKILL.md's Run order table.
 *
 * Usage: node gainersWatchlistTtlSync.js [--date YYYY-MM-DD] [--env-file <path>]
 */

const path = require('path');
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const dbV2 = require('./lib/db');
const { resolveJobName } = require('./lib/scriptJobName');
const { syncGainersWatchlist } = require('./lib/gainersWatchlistTtl');
const StorageService = require('@stock/cloud-utils').StorageService;
const apiUsageTracker = require('./lib/apiUsageTracker');

function log(s) {
  process.stdout.write(s);
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dateArg = argValue('--date');

  const jobName = resolveJobName('daily-gainers-signal-stockmarket');
  if (typeof stockscans.setJobName === 'function') stockscans.setJobName(jobName);

  const marketDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : new Date();

  // Same path construction gainersScanner.js itself uses to WRITE this file
  // (StorageService.getEventDtoPaths) — hand-rolling the YYYYMMDD suffix
  // separately risked an off-by-one-day filename, since that helper uses
  // local getFullYear()/getMonth()/getDate(), not UTC.
  const { jsonPath } = StorageService.getEventDtoPaths('gainers_raw', marketDate);
  const rawPath = path.join(dbV2.dataRoot(), jsonPath);
  // StorageService.saveJson shards runs/gainers_raw_*.json into
  // runs/gainers-raw-2026.jsonl (see StorageService.parseShardedPath) — a
  // raw require() of the literal .json path no longer finds the file.
  // readJson() is sharding-aware and falls back to a literal file read when
  // the path isn't sharded, so it's correct for both layouts.
  const raw = StorageService.readJson(jsonPath);
  if (!raw) {
    log(`[gainers-watchlist-ttl-sync] could not read ${jsonPath} (resolved: ${rawPath}): not found\n`);
    log('[gainers-watchlist-ttl-sync] run gainersScanner.js first — nothing to sync.\n');
    process.exitCode = 1;
    return;
  }

  // `gainers` is the DTO's quality-filtered/enriched set (gainersScanner.js's
  // `enriched`, built only from `gainersFiltered`) — already the "qualified"
  // bar the rest of this pipeline uses; no separate `passed` key exists in
  // this DTO shape.
  const qualified = (raw.gainers || []).map((g) => g.ticker || g.companyId).filter(Boolean);

  if (!qualified.length) {
    log('[gainers-watchlist-ttl-sync] 0 qualified names in today’s raw file — nothing to sync.\n');
  }

  const result = await syncGainersWatchlist(qualified, {
    marketDate,
    client: stockscans,
    creator: 'gainers-signal',
    log,
  });

  log(
    `[gainers-watchlist-ttl-sync] watchlistId=${result.watchlistId} added=${result.added.length} removed=${result.removed.length} activeAfter=${result.activeAfter}\n`
  );
  log(
    `[gainers-watchlist-ttl-sync] companies.json: +${result.stateWriteStats.inserted} ~${result.stateWriteStats.updated} =${result.stateWriteStats.unchanged}\n`
  );
}

if (require.main === module) {
  const jobNameForFlush = resolveJobName('daily-gainers-signal-stockmarket');
  main()
    .catch((e) => {
      console.error('[gainers-watchlist-ttl-sync] FAILED:', e);
      process.exitCode = 1;
    })
    .finally(() => apiUsageTracker.flush(jobNameForFlush));
}

module.exports = { main };
