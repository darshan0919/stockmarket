'use strict';

/**
 * announcementSignalsWatchlistTtl.js — keeps the Stockscans "Announcement
 * Signals" watchlist in sync with a rolling 7-day window of companies whose
 * post-close-scan-insights thesis card cleared a signal-score bar, with the
 * day-counter resetting if a name drops off and then requalifies.
 *
 * This is the SAME pattern as `gainersWatchlistTtl.js` (built 2026-09-22 for
 * the "Daily Gainers" watchlist) — Darshan's explicit ask was to reuse that
 * design rather than re-derive a second one. Only three things differ:
 *   1. TTL is 7 calendar days here, not 10 (Darshan's ask for this feature).
 *   2. The watchlist is "Announcement Signals" (confirmed live 2026-09-23:
 *      watchlistId a14f9a7be29447f3921fb819, currently empty — created once
 *      by hand, not by this script, exactly like "Daily Gainers" was).
 *   3. "Qualifies" means a card's `signalScore` (0-100, computed by
 *      `computeSignalScore` in lib/thesisCardEmail.js) is > 60 — i.e. the
 *      score shown on the card as "X.X/10" reads > 6.0 — rather than
 *      "cleared gainers-signal's own quality filter".
 *
 * Design (mirrors gainersWatchlistTtl.js exactly):
 *   1. Every company post-close-scan-insights scores > 60 in a given
 *      send-digest run gets added to the "Announcement Signals" Stockscans
 *      watchlist (a real, persistent, user-visible watchlist).
 *   2. A company is removed once 7 CALENDAR days have passed since it was
 *      (re)added.
 *   3. If a company requalifies in a LATER run after having been removed (or
 *      while still tracked but past-due for removal), its day-counter
 *      resets — `addedDate` becomes today again, not the original add date.
 *
 * State lives in `companies.json` → `state.announcementSignalsWatchlistTtl`,
 * the same per-company machine-state row gainersWatchlistTtl.js uses for its
 * own key (skills/_shared/conventions.md §2) — no new collection needed, and
 * the same "always read-modify-write the FULL state object, never a bare
 * `{state: {...}}` patch" discipline applies (db.upsertMany shallow-merges at
 * the top level only, so a bare patch would clobber
 * `state.gainersWatchlistTtl` for any company both skills track).
 *
 * "No deletes, ever, in a write path" governs the LOCAL state record (a
 * removed company's state entry is marked `active: false`, never deleted).
 * Removing a company from the actual Stockscans watchlist — an external
 * resource reached via the API — is a normal, intended part of this feature.
 */

const dbV2 = require('./db');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');

const TTL_DAYS = 7;
const WATCHLIST_NAME = 'Announcement Signals';
// Confirmed live 2026-09-23 — see resolveWatchlistId's fallback-by-name
// lookup below, which is what actually resolves this at runtime; recorded
// here only as a comment for anyone reading this file, same as
// gainersWatchlistTtl.js's own doc comment for "Daily Gainers".
const KNOWN_WATCHLIST_ID = 'a14f9a7be29447f3921fb819';
const STATE_KEY = 'announcementSignalsWatchlistTtl';
// Score bar: computeSignalScore is 0-100; the card renders it scaled to
// "X.X/10" (see signalScoreChipHtml in lib/thesisCardEmail.js). Darshan's ask
// was "score > 6" in that displayed 0-10 vocabulary, i.e. raw score > 60 —
// this is deliberately > not >=, so a card sitting exactly at the S2/S3
// tier boundary (signalScore 60, chip "6.0/10") does NOT qualify, matching
// "greater than 6" literally rather than "6 or higher".
const SIGNAL_SCORE_THRESHOLD = 60;

/** `Date` → `YYYY-MM-DD`, UTC-safe (matches gainersWatchlistTtl.js's own
 * toDateStr — calendar-date arithmetic only, no IST-hour boundary logic
 * needed since additions/removals happen once per digest send, not
 * intraday). */
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
 * Resolve (and cache, in-process only) the "Announcement Signals"
 * watchlistId — same resolve-by-name-else-create fallback
 * gainersWatchlistTtl.js's resolveWatchlistId uses, so a different
 * Stockscans account (or a renamed/deleted watchlist) doesn't hard-fail
 * this module.
 */
async function resolveWatchlistId(client, { log = () => {} } = {}) {
  const { watchlists = [] } = await client.watchlistsList();
  const existing = watchlists.find((w) => w.watchlistName === WATCHLIST_NAME);
  if (existing) return existing.watchlistId;
  log(
    `      [announcementSignalsWatchlistTtl] "${WATCHLIST_NAME}" watchlist not found — creating it\n`
  );
  const created = await client.createWatchlist(WATCHLIST_NAME, []);
  return created.watchlistId;
}

/**
 * Core sync. `scoredCards` = `[{companyId, signalScore}]` for every card THIS
 * send-digest run actually rendered (post-dedup, post-company-clubbing — the
 * same grouped view the digest's own subject-line S1/S2 count is computed
 * from in postCloseScanInsights.js's cmdSendDigest, so "qualifies" here can
 * never disagree with what significance level the email itself showed for
 * that company). Only companyId + signalScore are needed; everything else on
 * a card is irrelevant to this sync.
 *
 * Returns a summary object for the run report / files-touched manifest —
 * same shape as gainersWatchlistTtl.js's syncGainersWatchlist.
 */
async function syncAnnouncementSignalsWatchlist(
  scoredCards,
  { runDate, client, creator = 'post-close-scan-insights', log = () => {} } = {}
) {
  if (!client) {
    throw new Error('syncAnnouncementSignalsWatchlist requires { client } (a StockscansClient)');
  }
  const today = toDateStr(runDate || new Date());

  const qualified = [
    ...new Set(
      (scoredCards || [])
        .filter((c) => typeof c.signalScore === 'number' && c.signalScore > SIGNAL_SCORE_THRESHOLD)
        .map((c) => sanitizeCompanyId(c.companyId))
        .filter(Boolean)
    ),
  ];

  const watchlistId = await resolveWatchlistId(client, { log });

  // Read every currently-tracked company's state in one pass — same
  // read-before-write discipline as gainersWatchlistTtl.js, for the same
  // shallow-merge-safety reason (see top comment).
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
    }
    // Still active and within TTL — just bump lastSeenDate below, do NOT
    // reset addedDate (reappearing while already tracked and current isn't
    // a "reset" case — see gainersWatchlistTtl.js's identical note).

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
  // set: check TTL. Expired → remove from the watchlist, mark inactive. Not
  // expired → leave alone entirely (no write), same as gainersWatchlistTtl.js.
  const qualifiedSet = new Set(qualified);
  for (const c of tracked) {
    const st = c.state[STATE_KEY];
    if (!st.active || qualifiedSet.has(c.id)) continue;
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

  // 3) Apply to the real Stockscans watchlist. Additions/removals are
  // independent API calls — skip entirely rather than a no-op HTTP call.
  if (toAdd.length) {
    await client.updateWatchlist(watchlistId, 'add', toAdd);
    log(`      [announcementSignalsWatchlistTtl] added ${toAdd.length}: ${toAdd.join(', ')}\n`);
  }
  if (toRemove.length) {
    await client.updateWatchlist(watchlistId, 'delete', toRemove);
    log(
      `      [announcementSignalsWatchlistTtl] removed ${toRemove.length} (>= ${TTL_DAYS}d): ${toRemove.join(', ')}\n`
    );
  }

  // 4) Persist state. Never a bare `{state: {...}}` patch — see top comment.
  let stats = { inserted: 0, updated: 0, unchanged: 0 };
  if (stateUpdates.length) {
    stats = dbV2.upsertMany('companies', stateUpdates);
  }

  // Active-count after this run — same derivation gainersWatchlistTtl.js
  // uses (computed from the actual writes, not a before/after diff — a diff
  // has to correctly special-case "reappeared after expiry", which is
  // exactly the case a naive existence check gets wrong).
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
  syncAnnouncementSignalsWatchlist,
  resolveWatchlistId,
  toDateStr,
  daysBetween,
  TTL_DAYS,
  WATCHLIST_NAME,
  KNOWN_WATCHLIST_ID,
  STATE_KEY,
  SIGNAL_SCORE_THRESHOLD,
};
