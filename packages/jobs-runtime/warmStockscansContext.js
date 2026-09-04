#!/usr/bin/env node
'use strict';

/**
 * warmStockscansContext.js — fill `data/cache/stockscans-context/` ahead of demand.
 *
 * Stockscans publishes three AI-synthesized research reports per company —
 * business overview, growth catalysts, and notes from the latest concall on file.
 * They are already written; we pay only an HTTP GET. `stockscansContext.js` has
 * wrapped them (with a 7-day disk cache) since it was written, but nothing ever
 * called it, so the cache stayed empty and the daily skills kept re-deriving from
 * source documents what Stockscans had already condensed.
 *
 * This job is the missing half. It resolves a standing universe, fetches every
 * company whose bundle is missing or stale, and writes the cache. Read paths
 * (`buildCompanyContext(id, {stockscans:true})`) are synchronous and cache-only
 * and never fetch — so if this job stops running, consumers degrade to what they
 * did before rather than silently putting a network call on a hot path.
 *
 * Zero LLM. Pure fetch + cache, per conventions §17 (Extraction is a script).
 *
 * Usage:
 *   yarn stockscans:warm                       # standing universe, stale-only
 *   yarn stockscans:warm --days 45             # widen the recency window
 *   yarn stockscans:warm --tickers NSE:A,NSE:B # explicit list
 *   yarn stockscans:warm --limit 200           # bound one run's work
 *   yarn stockscans:warm --force               # ignore TTL, refetch everything
 *   yarn stockscans:warm --universe-only       # print the resolved universe, fetch nothing
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./lib/env');
const db = require('./lib/db');
const { fetchStockscansContext, readCached, DEFAULT_TTL_DAYS } = require('./lib/stockscansContext');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');

// Bounded fan-out against Stockscans, per conventions §16. Each company costs up
// to 4 GETs (overview, catalysts, documents, concall-notes), so even 2 here is ~8
// in flight. Started at 6 and that reliably tripped the endpoints' rate limiter
// (429) partway through a few hundred companies, which — before the caching fix
// in stockscansContext.js — silently wrote "no research available" for every
// company it hit. This job has all day; there is no reason to run it hot.
const CONCURRENCY = 2;

// Circuit breaker. Once the far side is rate-limiting, continuing just converts
// the rest of the universe into failed requests at one-per-company cost. Stop and
// let the next scheduled run resume — the cache makes the work resumable for free.
const MAX_CONSECUTIVE_TRANSPORT_FAILURES = 8;
const DEFAULT_RECENCY_DAYS = 30;

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (f) => process.argv.includes(f);

function daysAgoIso(days) {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

/**
 * Resolve the standing universe from LOCAL data only — no API calls.
 *
 * "Which companies might we care about tomorrow" is answerable from what we
 * already looked at recently, and deriving it locally keeps this job runnable
 * (and testable) with no network and no auth. Three sources, unioned:
 *
 *   1. `data/runs/*_raw_*.json` — every company any scan surfaced recently. This
 *      is the closest thing we have to "the universe the daily skills draw from".
 *   2. recent events — anything the classifiers recorded.
 *   3. recent notes — anything we wrote an insight about.
 *
 * Deliberately NOT "every company in companies.json": that is thousands of lazy
 * stubs created by `linkToCompanies`, most of which no skill will ever ask about,
 * and warming them would spend the whole run's budget on names nobody reads.
 */
function resolveUniverse({ days }) {
  const since = daysAgoIso(days);
  const sinceMs = Date.now() - days * 864e5;
  // Insertion-ordered, NOT alphabetical. `--limit` slices this list, so its order
  // decides which companies a bounded run actually warms. Sorting alphabetically
  // (the first version of this) meant every limited run spent its whole budget on
  // BSE microcaps starting with A — names that mostly have no concall and no
  // catalyst report — and never reached the NSE mid-caps the daily skills ask
  // about. Order is by likelihood of being needed tomorrow: most recent scan
  // appearances first, then events, then notes.
  const ids = new Set();
  const bySource = { runs: 0, events: 0, notes: 0 };

  const add = (raw, src) => {
    if (!raw || typeof raw !== 'string') return;
    const id = sanitizeCompanyId(raw);
    if (!/^[A-Z]+:[A-Z0-9&._-]+$/i.test(id)) return;
    if (!ids.has(id)) bySource[src] += 1;
    ids.add(id);
  };

  // 1. Recent scan raw files, NEWEST FIRST — yesterday's gainers are the best
  // available predictor of what tomorrow's run will ask about.
  const runsPath = path.join(db.dataRoot(), 'runs');
  if (fs.existsSync(runsPath)) {
    const runFiles = fs
      .readdirSync(runsPath)
      .filter((f) => /_raw_\d{8}\.json$/.test(f))
      .map((f) => ({ f, full: path.join(runsPath, f) }))
      .filter((r) => {
        try {
          return fs.statSync(r.full).mtimeMs >= sinceMs;
        } catch (_) {
          return false;
        }
      })
      .sort((a, b) => b.f.localeCompare(a.f));
    for (const { full } of runFiles) {
      try {
        const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
        // Raw scan files are not one shape: gainers/volume-rocketing wrap their
        // rows under a scan-specific key (`gainers`, plus `excluded_by_quality_filter`),
        // others are a bare array. Rather than hardcode a key per producer — which
        // silently yields zero the day a new scan lands — take every top-level array
        // of objects and read `companyId`/`ticker` off each. Non-company arrays
        // contribute nothing because the id regex in `add()` rejects them.
        const lists = Array.isArray(raw)
          ? [raw]
          : Object.values(raw).filter(
              (v) => Array.isArray(v) && v.length && typeof v[0] === 'object'
            );
        for (const list of lists) for (const r of list) add(r && (r.companyId || r.ticker), 'runs');
      } catch (_) {
        /* a half-written or malformed run file must not abort the sweep */
      }
    }
  }

  // 2. Recent events.
  try {
    for (const e of db.find('events', { since })) add(e.companyId, 'events');
  } catch (_) {
    /* events collection may be absent in a fresh checkout */
  }

  // 3. Recent notes.
  try {
    for (const n of db.find('notes', {})) {
      const t = n.creationTime || n.createdAt || n.date || '';
      if (t.slice(0, 10) >= since) add(n.companyId, 'notes');
    }
  } catch (_) {
    /* same */
  }

  return { ids: [...ids], bySource };
}

async function main() {
  loadEnv(argValue('--env-file', null));

  const days = Number(argValue('--days', DEFAULT_RECENCY_DAYS));
  const ttlDays = Number(argValue('--ttl-days', DEFAULT_TTL_DAYS));
  const limit = argValue('--limit') ? Number(argValue('--limit')) : null;
  const force = hasFlag('--force');
  const explicit = argValue('--tickers');

  let universe;
  let bySource = null;
  if (explicit) {
    universe = explicit
      .split(',')
      .map((t) => sanitizeCompanyId(t.trim()))
      .filter(Boolean);
  } else {
    const r = resolveUniverse({ days });
    universe = r.ids;
    bySource = r.bySource;
  }

  if (hasFlag('--universe-only')) {
    console.log(JSON.stringify({ count: universe.length, bySource, universe }, null, 2));
    return;
  }

  // A cached-and-fresh bundle is skipped without a request. This is what makes the
  // job safe to schedule often: a run with nothing stale is a handful of file
  // reads, not a few hundred HTTP calls.
  const pending = force ? universe : universe.filter((id) => !readCached(id, { ttlDays }));
  const targets = limit ? pending.slice(0, limit) : pending;

  console.error(
    `[warm] universe ${universe.length} · already fresh ${universe.length - pending.length} · ` +
      `fetching ${targets.length}${limit && pending.length > limit ? ` (limited from ${pending.length})` : ''}`
  );

  const stats = {
    fetched: 0,
    cached: 0,
    notCachedTransport: 0,
    failed: 0,
    withOverview: 0,
    withCatalysts: 0,
    withConcallNotes: 0,
  };
  const partial = [];
  let consecutiveTransport = 0;
  let circuitOpen = false;

  await mapWithConcurrency(targets, CONCURRENCY, async (companyId) => {
    if (circuitOpen) return;
    try {
      const b = await fetchStockscansContext(companyId, { ttlDays, forceRefresh: force });
      stats.fetched += 1;

      if (b.cached) {
        stats.cached += 1;
        // Count coverage ONLY for bundles that were actually cached, matching
        // pct()'s denominator. Counting every fetch here while dividing by
        // `cached` produced a 124% "coverage" figure (observed 2026-09-04) —
        // a partially-rate-limited bundle contributed a numerator it was not
        // in the denominator for. A percentage over 100 is the cheapest
        // possible signal that a metric is lying; keep the two in one place.
        if (b.businessOverview) stats.withOverview += 1;
        if (b.growthCatalysts) stats.withCatalysts += 1;
        if (b.concallNotes) stats.withConcallNotes += 1;
        consecutiveTransport = 0;
        // A soft-empty error means "this source genuinely has nothing for this
        // company" — a normal, informative outcome (no transcript on file), not
        // breakage. Report it as coverage.
        const softEmpty = (b.errors || []).filter((e) => e.kind === 'empty');
        if (softEmpty.length) {
          partial.push({ companyId, notCovered: softEmpty.map((e) => e.source) });
        }
      } else {
        // Transport failure: nothing was written, so this company stays pending
        // for the next run. That is the correct outcome, not a silent gap.
        stats.notCachedTransport += 1;
        consecutiveTransport += 1;
        partial.push({ companyId, transportFailed: b.transportFailures });
        if (consecutiveTransport >= MAX_CONSECUTIVE_TRANSPORT_FAILURES) circuitOpen = true;
      }
    } catch (e) {
      stats.failed += 1;
      consecutiveTransport += 1;
      partial.push({ companyId, error: e.message });
      if (consecutiveTransport >= MAX_CONSECUTIVE_TRANSPORT_FAILURES) circuitOpen = true;
    }
  });

  if (circuitOpen) {
    console.error(
      `[warm] circuit breaker tripped after ${MAX_CONSECUTIVE_TRANSPORT_FAILURES} consecutive ` +
        'transport failures — stopping early. Nothing was cached for those companies; ' +
        'they stay pending and the next run resumes from here.'
    );
  }

  // Coverage is a share of bundles we actually CACHED, never of everything we
  // attempted — mixing rate-limited companies into the denominator understates
  // real coverage and makes a throttled run look like a data-quality problem.
  const pct = (n) => (stats.cached ? `${Math.round((n / stats.cached) * 100)}%` : 'n/a');
  console.log(
    JSON.stringify(
      {
        universeSize: universe.length,
        alreadyFresh: universe.length - pending.length,
        attempted: targets.length,
        ...stats,
        coverage: {
          businessOverview: pct(stats.withOverview),
          growthCatalysts: pct(stats.withCatalysts),
          concallNotes: pct(stats.withConcallNotes),
        },
        circuitBreakerTripped: circuitOpen,
        partial: partial.slice(0, 25),
        partialTotal: partial.length,
        cacheDir: db.cachePath('stockscans-context'),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[warm] fatal:', e.message);
    process.exit(1);
  });
}

module.exports = { resolveUniverse };
