#!/usr/bin/env node
'use strict';

/**
 * backfillGainersWatchlistTtl.js — ONE-OFF backfill for the "Daily Gainers"
 * watchlist TTL feature (lib/gainersWatchlistTtl.js), run once on
 * introduction so the feature doesn't start from an empty watchlist/state
 * despite gainers-signal having real history.
 *
 * What it does, and why it's a SEPARATE script from gainersWatchlistTtlSync.js
 * rather than a flag on it: the daily sync always uses TODAY as `addedDate`
 * for a newly-qualifying company. A backfill needs the OPPOSITE — each
 * company's addedDate must be its actual first-seen date within the lookback
 * window, so the day-counter reflects real elapsed history from day one
 * (a company first flagged 8 days ago must show ~2 days of runway left, not
 * a fresh 10) — different enough logic that bolting it onto the daily
 * script as a special mode would obscure both.
 *
 * Source of truth: `events` collection, `type: 'gainer'` (written by
 * gainersClassifier.js for every quality-filtered candidate, all tiers —
 * NOT just `in_email`/ACT+WATCH; confirmed live 2026-09-22 that NOTED-tier
 * events are written too, so filtering to in_email would have understated
 * the historical universe). Raw `gainers_raw_*.json` run files (the DTO the
 * live daily sync reads) are NOT durably retained — conventions §6 treats
 * them as re-fetchable run artifacts — so `gainer` events are the only
 * durable record of "who qualified on which day" available for a backfill.
 *
 * Usage: node scripts/backfillGainersWatchlistTtl.js [--days 10] [--dry-run] [--env-file <path>]
 */

const { loadEnv, argValue } = require('../lib/env');
const dbV2 = require('../lib/db');
const { stockscans } = require('@stock/api');
const { resolveJobName } = require('../lib/scriptJobName');
const apiUsageTracker = require('../lib/apiUsageTracker');
const {
  resolveWatchlistId,
  toDateStr,
  daysBetween,
  TTL_DAYS,
  STATE_KEY,
} = require('../lib/gainersWatchlistTtl');

function log(s) {
  process.stdout.write(s);
}

async function main() {
  loadEnv(argValue('--env-file'));
  const lookbackDays = Number(argValue('--days') || TTL_DAYS);
  const dryRun = process.argv.includes('--dry-run');

  const jobName = resolveJobName('daily-gainers-signal-stockmarket');
  if (typeof stockscans.setJobName === 'function') stockscans.setJobName(jobName);

  const today = toDateStr(new Date());
  const cutoff = toDateStr(new Date(Date.now() - lookbackDays * 86400000));

  log(`[backfill] window: ${cutoff} .. ${today} (${lookbackDays} calendar days back)\n`);

  // Pull a generous window of gainer events, then filter client-side by date
  // string — find()'s own `since` filter compares against date/creationTime
  // and events are annually partitioned, so a plain unfiltered find() with a
  // large limit is simpler and cheap at this volume (a few hundred rows).
  const events = dbV2.find('events', { type: 'gainer', limit: 100000 });
  const inWindow = events.filter((e) => e.date >= cutoff && e.date <= today);
  log(
    `[backfill] ${inWindow.length} gainer events in window across ${new Set(inWindow.map((e) => e.date)).size} run-date(s)\n`
  );

  const byCompany = new Map();
  for (const e of inWindow) {
    const cid = e.companyId;
    if (!cid) continue;
    const prev = byCompany.get(cid);
    if (!prev) {
      byCompany.set(cid, { firstSeen: e.date, lastSeen: e.date, name: e.name, ticker: e.ticker });
    } else {
      if (e.date < prev.firstSeen) prev.firstSeen = e.date;
      if (e.date > prev.lastSeen) prev.lastSeen = e.date;
    }
  }
  log(`[backfill] ${byCompany.size} unique companies in window\n`);

  // Anyone whose first-seen date is already >= TTL_DAYS old as of today is
  // stale even before the backfill runs — include them with active:false
  // (never silently drop history), and do NOT add them to the live
  // watchlist. This is a real branch even though today's actual data has
  // none (checked live 2026-09-22) — a backfill run on a different day, or
  // with a wider --days window, can hit it.
  const toActivate = [];
  const toRecordExpired = [];
  for (const [cid, v] of byCompany) {
    const age = daysBetween(v.firstSeen, today);
    const rec = {
      id: cid,
      companyId: cid,
      creator: 'backfill-gainers-watchlist-ttl',
      state: {
        [STATE_KEY]: {
          addedDate: v.firstSeen,
          lastSeenDate: v.lastSeen,
          active: age < TTL_DAYS,
          ttlDays: TTL_DAYS,
          ...(age >= TTL_DAYS ? { removedDate: today } : {}),
          backfilled: true,
        },
      },
    };
    if (age < TTL_DAYS) toActivate.push({ cid, rec, ticker: v.ticker, age });
    else toRecordExpired.push({ cid, rec, ticker: v.ticker, age });
  }

  log(
    `[backfill] ${toActivate.length} still within ${TTL_DAYS}d (will be added to the watchlist), ${toRecordExpired.length} already past TTL (state recorded as expired, NOT added)\n`
  );

  if (dryRun) {
    log('[backfill] --dry-run: no writes performed. Sample of what would be written:\n');
    for (const { cid, ticker, age } of toActivate.slice(0, 10)) {
      log(`  ${ticker || cid}: age=${age}d, active=true\n`);
    }
    return;
  }

  // Read-before-write for every OTHER state key on these company records —
  // do this by reading each company's current record before merging, exactly
  // as lib/gainersWatchlistTtl.js's own top comment mandates, so a company
  // some other skill already tracks state for doesn't lose it.
  const allExisting = dbV2.find('companies', {});
  const existingById = new Map(allExisting.map((c) => [c.id, c]));
  const stateUpdates = [...toActivate, ...toRecordExpired].map(({ cid, rec }) => {
    const existing = existingById.get(cid);
    return {
      ...rec,
      state: { ...(existing && existing.state), ...rec.state },
    };
  });

  const stats = dbV2.upsertMany('companies', stateUpdates);
  log(`[backfill] companies.json: +${stats.inserted} ~${stats.updated} =${stats.unchanged}\n`);

  // Real Stockscans watchlist write — only the still-active set.
  const watchlistId = await resolveWatchlistId(stockscans, { log });
  const idsToAdd = toActivate.map((x) => x.cid);
  if (idsToAdd.length) {
    await stockscans.updateWatchlist(watchlistId, 'add', idsToAdd);
    log(`[backfill] added ${idsToAdd.length} companies to watchlistId=${watchlistId}\n`);
  }

  apiUsageTracker.flush(jobName);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[backfill] FAILED:', e);
    process.exitCode = 1;
  });
}

module.exports = { main };
