#!/usr/bin/env node
'use strict';

/**
 * backfillAnnouncementSignalsWatchlistTtl.js — ONE-OFF backfill for the
 * "Announcement Signals" watchlist TTL feature
 * (lib/announcementSignalsWatchlistTtl.js), run once on introduction so the
 * feature doesn't start from an empty watchlist despite
 * post-close-scan-insights/watchlist-insights having real history.
 *
 * Modeled directly on scripts/backfillGainersWatchlistTtl.js — same shape,
 * same reasons for being a separate script from the daily sync (a backfill
 * needs each company's addedDate to be its actual first-QUALIFYING date
 * within the lookback window, not today, so the day-counter reflects real
 * elapsed history from day one).
 *
 * Source of truth: `notes` collection, `type: 'announcement'` — every
 * persisted thesis-card note from ANY skill that writes through
 * watchlistInsights.js's add-note (post-close-scan-insights, watchlist-
 * insights, announcement-insights, announcement-info-classifier all share
 * this one collection — conventions.md §21). "Qualifies" is recomputed here
 * with the exact same `computeSignalScore` function the live thesis card
 * uses (lib/thesisCardEmail.js) — never a separate/approximate re-derivation
 * of the score, so a backfilled company's inclusion always agrees with what
 * its card would have shown had this feature existed on the day it was
 * written.
 *
 * Usage: node scripts/backfillAnnouncementSignalsWatchlistTtl.js [--days 7] [--dry-run] [--env-file <path>]
 */

const { loadEnv, argValue } = require('../lib/env');
const dbV2 = require('../lib/db');
const { stockscans } = require('@stock/api');
const { resolveJobName } = require('../lib/scriptJobName');
const apiUsageTracker = require('../lib/apiUsageTracker');
const { computeSignalScore } = require('../lib/thesisCardEmail');
const {
  resolveWatchlistId,
  toDateStr,
  daysBetween,
  TTL_DAYS,
  STATE_KEY,
  SIGNAL_SCORE_THRESHOLD,
} = require('../lib/announcementSignalsWatchlistTtl');

function log(s) {
  process.stdout.write(s);
}

/** A note's own calendar date — `date` when the envelope set one, else the
 * date portion of `creationTime` (the single write-timestamp field per
 * conventions.md §22 — never a second `createdAt`). */
function noteDateStr(n) {
  return String(n.date || n.creationTime || '').slice(0, 10);
}

async function main() {
  loadEnv(argValue('--env-file'));
  const lookbackDays = Number(argValue('--days') || TTL_DAYS);
  const dryRun = process.argv.includes('--dry-run');

  const jobName = resolveJobName('post-close-scan-insights-adhoc-nightly');
  if (typeof stockscans.setJobName === 'function') stockscans.setJobName(jobName);

  const today = toDateStr(new Date());
  const cutoff = toDateStr(new Date(Date.now() - lookbackDays * 86400000));

  log(`[backfill] window: ${cutoff} .. ${today} (${lookbackDays} calendar days back)\n`);
  log(
    `[backfill] qualifying bar: signalScore > ${SIGNAL_SCORE_THRESHOLD} (card shows "> 6.0/10")\n`
  );

  // notes.json is a single (not year-sharded) collection at this data volume
  // — an unfiltered type-scoped find() then a client-side date-string filter
  // is simpler and cheap here, same reasoning backfillGainersWatchlistTtl.js
  // gives for its own events pull.
  const allAnnouncementNotes = dbV2.find('notes', { type: 'announcement' }) || [];
  const inWindow = allAnnouncementNotes.filter((n) => {
    const d = noteDateStr(n);
    return d >= cutoff && d <= today;
  });
  log(
    `[backfill] ${inWindow.length} announcement notes in window across ${new Set(inWindow.map(noteDateStr)).size} date(s)\n`
  );

  // Score every note with the SAME function the live card uses, then keep
  // only companies with at least one note clearing the bar.
  const byCompany = new Map();
  for (const n of inWindow) {
    const cid = n.companyId;
    if (!cid) continue;
    const score = computeSignalScore(n);
    if (score <= SIGNAL_SCORE_THRESHOLD) continue;
    const d = noteDateStr(n);
    const prev = byCompany.get(cid);
    if (!prev) {
      byCompany.set(cid, { firstSeen: d, lastSeen: d, bestScore: score, qualifyingNotes: 1 });
    } else {
      if (d < prev.firstSeen) prev.firstSeen = d;
      if (d > prev.lastSeen) prev.lastSeen = d;
      if (score > prev.bestScore) prev.bestScore = score;
      prev.qualifyingNotes += 1;
    }
  }
  log(
    `[backfill] ${byCompany.size} unique companies cleared score > ${SIGNAL_SCORE_THRESHOLD} in window\n`
  );

  // Anyone whose first-QUALIFYING date is already >= TTL_DAYS old as of today
  // is stale even before the backfill runs — include with active:false
  // (never silently drop history), and do NOT add to the live watchlist.
  const toActivate = [];
  const toRecordExpired = [];
  for (const [cid, v] of byCompany) {
    const age = daysBetween(v.firstSeen, today);
    const rec = {
      id: cid,
      companyId: cid,
      creator: 'backfill-announcement-signals-watchlist-ttl',
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
    if (age < TTL_DAYS) toActivate.push({ cid, rec, age, score: v.bestScore });
    else toRecordExpired.push({ cid, rec, age, score: v.bestScore });
  }

  log(
    `[backfill] ${toActivate.length} still within ${TTL_DAYS}d (will be added to the watchlist), ${toRecordExpired.length} already past TTL (state recorded as expired, NOT added)\n`
  );

  if (dryRun) {
    log('[backfill] --dry-run: no writes performed. Sample of what would be written:\n');
    for (const { cid, age, score } of toActivate.slice(0, 15)) {
      log(`  ${cid}: age=${age}d, score=${score.toFixed(0)}, active=true\n`);
    }
    return;
  }

  // Read-before-write for every OTHER state key on these company records —
  // same discipline lib/announcementSignalsWatchlistTtl.js's own top comment
  // mandates for the daily sync.
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
