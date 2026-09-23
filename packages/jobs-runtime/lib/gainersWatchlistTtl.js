'use strict';

/**
 * gainersWatchlistTtl.js — keeps the Stockscans "Daily Gainers" watchlist in
 * sync with a rolling 10-day window of names gainers-signal actually flagged
 * as qualified that day, with the day-counter resetting if a name drops off
 * and then reappears.
 *
 * Design (per Darshan, 2026-09-22):
 *   1. Every company gainers-signal qualifies today gets added to the
 *      "Daily Gainers" Stockscans watchlist (a real, persistent watchlist —
 *      NOT the throwaway per-run kind conventions §14 documents for scoping
 *      a bulk API call; this one is a standing, user-visible list).
 *   2. A company is removed from that watchlist once 10 CALENDAR days have
 *      passed since it was (re)added.
 *   3. If a company reappears in a later gainers-signal run AFTER having
 *      been removed (or while still tracked but past-due for removal), its
 *      day-counter resets — `addedDate` becomes today again, not the
 *      original add date.
 *
 * State lives in `companies.json` → `state.gainersWatchlistTtl`, per
 * skills/_shared/conventions.md §2's documented (previously unused) row for
 * "Per-company machine state" — no new collection needed. `db.upsertMany`
 * shallow-merges `{...prev, ...record}` at the TOP level only, so this
 * module always reads the full existing company record first and writes
 * back a full `state` object (never a bare `{state: {gainersWatchlistTtl}}`
 * patch) — otherwise a shallow merge would silently clobber `state.<other
 * skill's key>` for any company another skill also tracks state for.
 *
 * "No deletes, ever, in a write path" (conventions §5 / DATA_RULES §5)
 * governs the LOCAL state record: a removed company's state entry is marked
 * `active: false`, never deleted. Removing a company from the actual
 * Stockscans watchlist (an external resource reached via the API, not a
 * local data/ write) is a normal, intended part of this feature and is NOT
 * what that rule is about.
 */

const dbV2 = require('./db');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');

const TTL_DAYS = 10;
const WATCHLIST_NAME = 'Daily Gainers';
const STATE_KEY = 'gainersWatchlistTtl';

/** `Date` → `YYYY-MM-DD`, UTC-safe (matches how marketDate is handled elsewhere
 * in this pipeline — calendar-date arithmetic only, no IST-hour boundary logic
 * needed since additions/removals are once-a-day, not intraday). */
function toDateStr(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const a = Date.parse(`${fromStr}T00:00:00Z`);
  const b = Date.parse(`${toStr}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/**
 * Resolve (and cache, in-process only — not persisted) the "Daily Gainers"
 * watchlistId. Confirmed live 2026-09-22: this watchlist already exists in
 * Darshan's account (watchlistId 4ed5300cfd5cf0da356c0603, currently empty)
 * — created once by hand, not by this script. Falls back to creating it if
 * it's ever missing (e.g. a different Stockscans account), so this module
 * doesn't hard-fail on a fresh account.
 */
async function resolveWatchlistId(client, { log = () => {} } = {}) {
  const { watchlists = [] } = await client.watchlistsList();
  const existing = watchlists.find((w) => w.watchlistName === WATCHLIST_NAME);
  if (existing) return existing.watchlistId;
  log(`      [gainersWatchlistTtl] "${WATCHLIST_NAME}" watchlist not found — creating it\n`);
  const created = await client.createWatchlist(WATCHLIST_NAME, []);
  return created.watchlistId;
}

/**
 * Core sync. `qualifiedTickers` = companyIds gainers-signal qualified TODAY
 * (the same `gainersFiltered`/quality-filtered set the rest of the pipeline
 * uses — not the raw top-50, and not just ACT/WATCH; "qualified" is the
 * pipeline's own existing bar, reused rather than re-defined here).
 *
 * Returns a summary object for the run report / files-touched manifest.
 */
async function syncGainersWatchlist(
  qualifiedTickers,
  { marketDate, client, creator = 'gainers-signal', log = () => {} } = {}
) {
  if (!client) throw new Error('syncGainersWatchlist requires { client } (a StockscansClient)');
  const today = toDateStr(marketDate || new Date());
  const qualified = [...new Set((qualifiedTickers || []).map(sanitizeCompanyId))];

  const watchlistId = await resolveWatchlistId(client, { log });

  // Read every currently-tracked company's state in one pass, plus the
  // full existing record for anyone we're about to write (read-before-write,
  // per this module's own top comment on shallow-merge safety).
  const allCompanies = dbV2.find('companies', {}) || [];
  const tracked = allCompanies.filter((c) => c.state && c.state[STATE_KEY]);

  const toAdd = [];
  const toRemove = [];
  const stateUpdates = [];

  // 1) Today's qualified names: add if new, or RESET the counter if this
  // company's existing state is inactive (previously removed) or past-due.
  for (const cid of qualified) {
    const existing = allCompanies.find((c) => c.id === cid);
    const prevState = existing && existing.state && existing.state[STATE_KEY];
    const isReappearance = !prevState || prevState.active === false;

    if (isReappearance) {
      toAdd.push(cid);
    } else {
      // Still active and within TTL — just bump lastSeenDate, do NOT reset
      // addedDate. Reappearing while already tracked and current is not the
      // "reset" case Darshan described; that's for after it actually left.
    }

    const nextState = {
      addedDate: isReappearance ? today : prevState.addedDate,
      lastSeenDate: today,
      active: true,
      ttlDays: TTL_DAYS,
    };
    stateUpdates.push({
      id: cid,
      companyId: cid,
      creator,
      state: { ...(existing && existing.state), [STATE_KEY]: nextState },
    });
  }

  // 2) Everyone currently active and tracked but NOT in today's qualified
  // set: check TTL. Expired → remove from the watchlist, mark inactive.
  // Not expired → leave alone entirely (no write) so an untouched company's
  // modifiedTime doesn't churn every day for no reason.
  const qualifiedSet = new Set(qualified);
  for (const c of tracked) {
    const st = c.state[STATE_KEY];
    if (!st.active || qualifiedSet.has(c.id)) continue; // handled above, or already inactive
    const age = daysBetween(st.addedDate, today);
    if (age >= TTL_DAYS) {
      toRemove.push(c.id);
      stateUpdates.push({
        id: c.id,
        companyId: c.id,
        creator,
        state: { ...c.state, [STATE_KEY]: { ...st, active: false, removedDate: today } },
      });
    }
  }

  // 3) Apply to the real Stockscans watchlist. Additions and removals are
  // independent API calls (updateWatchlist's `action` is 'add' XOR
  // 'delete', not both in one call) — both are safe/idempotent to call with
  // an empty array, but skip entirely rather than make a no-op HTTP call.
  if (toAdd.length) {
    await client.updateWatchlist(watchlistId, 'add', toAdd);
    log(`      [gainersWatchlistTtl] added ${toAdd.length}: ${toAdd.join(', ')}\n`);
  }
  if (toRemove.length) {
    await client.updateWatchlist(watchlistId, 'delete', toRemove);
    log(
      `      [gainersWatchlistTtl] removed ${toRemove.length} (>= ${TTL_DAYS}d): ${toRemove.join(', ')}\n`
    );
  }

  // 4) Persist state. Never a bare `{state: {...}}` patch — see top comment.
  // `creator` is required by ensureEnvelope (conventions §21-style explicit
  // attribution, no silent default).
  let stats = { inserted: 0, updated: 0, unchanged: 0 };
  if (stateUpdates.length) {
    stats = dbV2.upsertMany('companies', stateUpdates);
  }

  // Active-count after this run: everyone tracked whose FINAL state (this
  // run's write if there is one, else their pre-existing state) is active.
  // Computed directly from the actual writes rather than a before/after diff
  // — a diff has to correctly special-case "reappeared after expiry" (still
  // counts as a net-new active, even though a state record already existed
  // for that id), which is exactly the case a naive
  // `tracked.some(id-already-exists)` check gets wrong.
  const finalStateById = new Map(tracked.map((c) => [c.id, c.state[STATE_KEY]]));
  for (const u of stateUpdates) finalStateById.set(u.id, u.state[STATE_KEY]);
  const activeAfter = [...finalStateById.values()].filter((s) => s.active).length;

  return {
    watchlistId,
    added: toAdd,
    removed: toRemove,
    stateWriteStats: stats,
    activeAfter,
  };
}

module.exports = {
  syncGainersWatchlist,
  resolveWatchlistId,
  toDateStr,
  daysBetween,
  TTL_DAYS,
  WATCHLIST_NAME,
  STATE_KEY,
};
