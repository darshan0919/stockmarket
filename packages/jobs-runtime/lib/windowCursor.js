'use strict';

/**
 * Shared resumable-window-cursor helper.
 *
 * THE STANDARD PATTERN for any recurring/scheduled job that fetches a
 * time-windowed slice of external data (announcements, transcripts, PPTs,
 * tweets, deals, etc.) and does EXPENSIVE per-item work on it (reading a
 * PDF, an LLM judgment call, sending a notification). Without a cursor,
 * every run recomputes its lookback window from "now" alone, so two runs
 * landing closer together than the window is wide — a manual catch-up
 * followed by the next scheduled run, a weekend/holiday-adjacent gap, a
 * retried failure — silently re-do that expensive work on the same items.
 * `mark-processed`-style per-item dedup guards against re-EMAILING or
 * re-WRITING a duplicate note, but by the time you know an item is a
 * duplicate you've often already paid for the PDF read and the LLM call
 * that produced the note you're about to discard. The cursor exists to
 * avoid paying that cost at all, not just to avoid a duplicate write.
 *
 * Extracted 2026-08-23 from the two hand-rolled copies of this pattern
 * (`watchlistInsights.js`'s WINDOW_CURSOR_PATH/PENDING_WINDOW_PATH pair, and
 * `postCloseScanInsights.js`'s port of the same) per
 * `skills/_shared/conventions.md` §17 — a pattern proven twice independently
 * should become a shared module the THIRD time it's needed, not a third
 * hand-rolled copy. See conventions.md's "Resumable window cursor" section
 * for when to reach for this vs. when a simpler per-item dedup is enough.
 *
 * USAGE — three calls, one per pipeline stage:
 *
 *   const wc = require('./lib/windowCursor')('my-job-name');
 *
 *   // Stage 1 (fetch step): resolve this run's actual window start.
 *   const windowStartMs = await wc.resolveWindowStartMs({
 *     now,
 *     floorMs: myDeterministicFloorMs(now), // e.g. "last trading day's close", or "24h ago"
 *     windowHoursArg,                        // explicit --window-hours override, or null
 *     key: 'optional-scoping-key',           // omit for a single fixed universe
 *   });
 *   // ... fetch everything since windowStartMs ...
 *   await wc.savePendingWindow({ windowEndMs: now.getTime(), key });
 *
 *   // Stage 2 (after a CONFIRMED HEALTHY run only — never on partial failure):
 *   await wc.commitWindow({ key });
 *
 * A cursor file lives at `data/cache/<jobName>-cursor.json` (or
 * `<jobName>-cursor-<key>.json` when a key is used, for jobs with more than
 * one independently-cursored universe — e.g. watchlist-insights' per-
 * watchlist-combo cursors). A pending-window marker at the equivalent
 * `-pending-window[-<key>].json` path records each fetch's own invocation
 * time so `commitWindow` advances to exactly what that fetch covered, never
 * to "now" recomputed at commit time (which could silently skip anything
 * published between the fetch and the commit).
 */

const StorageService = require('@stock/cloud-utils').StorageService;

// Same safety cap both existing implementations used: a cursor this stale
// is almost certainly a bug (or a genuinely long outage), not something to
// silently backfill through — surface it as an error demanding an explicit
// --window-hours catch-up instead.
const DEFAULT_MAX_CURSOR_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function paths(jobName, key) {
  const suffix = key ? `-${key}` : '';
  return {
    cursor: `cache/${jobName}-cursor${suffix}.json`,
    pending: `cache/${jobName}-pending-window${suffix}.json`,
  };
}

/**
 * @param {string} jobName - stable, filesystem-safe identifier for this job
 *   (e.g. 'post-close-scan-insights', 'mna-tracker'). Used to namespace the
 *   cache files so unrelated jobs' cursors never collide.
 * @param {object} [opts]
 * @param {number} [opts.maxCursorLookbackMs] - override the 30-day staleness cap.
 */
module.exports = function windowCursor(jobName, opts = {}) {
  if (!jobName || typeof jobName !== 'string') {
    throw new Error('windowCursor(jobName) requires a non-empty string job name');
  }
  const maxCursorLookbackMs = opts.maxCursorLookbackMs || DEFAULT_MAX_CURSOR_LOOKBACK_MS;

  function readCursor(key) {
    StorageService.init();
    return StorageService.readJson(paths(jobName, key).cursor) || null;
  }

  /**
   * Resolve this run's actual window-start: the LATER of the deterministic
   * floor and the last-committed cursor (if any, and not stale beyond the
   * safety cap) — a committed cursor means "everything up to here is
   * already handled," so the window must never start earlier than that or
   * it re-fetches/re-processes already-seen items. If the cursor is older
   * than the floor (a genuinely missed run, or a fresh/never-committed
   * cursor), the floor wins instead — the floor is the job's own contract
   * for "how far back do I go at minimum," and the cursor only ever
   * NARROWS that, never widens it, on its own. `--window-hours` (when
   * provided) bypasses both and answers directly, same as every existing
   * caller's explicit-catch-up escape hatch.
   *
   * @param {object} args
   * @param {Date} args.now
   * @param {number} args.floorMs - this job's own deterministic "at least this far back" floor, as an epoch ms Date value (not a duration)
   * @param {number|string|null} [args.windowHoursArg] - explicit --window-hours override; bypasses floor+cursor entirely
   * @param {string} [args.key] - scoping key for jobs with more than one independently-cursored universe
   * @returns {Promise<number>} resolved window-start as epoch ms
   */
  async function resolveWindowStartMs({ now, floorMs, windowHoursArg = null, key } = {}) {
    if (windowHoursArg !== null && windowHoursArg !== undefined) {
      const n = Number(windowHoursArg);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--window-hours must be a positive number, got "${windowHoursArg}"`);
      }
      return now.getTime() - n * 60 * 60 * 1000;
    }
    const cursor = readCursor(key);
    if (cursor && Number.isFinite(cursor.lastCommittedAtMs)) {
      if (now.getTime() - cursor.lastCommittedAtMs > maxCursorLookbackMs) {
        throw new Error(
          `${jobName} cursor${key ? ` [${key}]` : ''} is stale beyond the ${maxCursorLookbackMs / (24 * 60 * 60 * 1000)}-day ` +
            `safety cap (last committed ${new Date(cursor.lastCommittedAtMs).toISOString()}). Re-run explicitly with ` +
            `--window-hours <n> covering the real gap, then call commitWindow to reset the cursor.`
        );
      }
      return Math.max(floorMs, cursor.lastCommittedAtMs);
    }
    return floorMs;
  }

  /**
   * Record this fetch's own invocation time as the pending marker — call
   * once per fetch, right after computing/using the resolved window-start.
   * `commitWindow` reads this back rather than recomputing "now" at commit
   * time, so the cursor advances to exactly what this run covered.
   *
   * @param {object} args
   * @param {number} args.windowEndMs - this fetch's own "now" (NOT the resolved window-start)
   * @param {string} [args.key]
   * @param {object} [args.extra] - any additional fields worth persisting for debugging (e.g. the resolved cutoff, item counts)
   */
  async function savePendingWindow({ windowEndMs, key, extra = {} } = {}) {
    if (!Number.isFinite(windowEndMs)) {
      throw new Error('savePendingWindow requires a finite windowEndMs (epoch ms)');
    }
    StorageService.init();
    await StorageService.saveJson(paths(jobName, key).pending, {
      ...extra,
      windowEndMs,
      createdAtIso: new Date().toISOString(),
      ...(key ? { key } : {}),
    });
  }

  /**
   * Durably advance the cursor to the pending marker's windowEndMs. Call
   * this ONLY after the run is confirmed healthy (e.g. the digest send
   * succeeded, or all per-item processing completed without error) —
   * committing after a partial failure permanently drops whatever didn't
   * get processed, since the next run's window would no longer reach back
   * far enough to see it. Throws if no matching pending marker exists,
   * same guard `watchlistInsights.js`'s original commit-window used, so a
   * stray commitWindow call (no prior fetch in this run) fails loudly
   * instead of silently advancing to a stale or wrong marker.
   *
   * @param {object} args
   * @param {string} [args.key]
   * @returns {Promise<{lastCommittedAtMs:number, lastCommittedAtIso:string}>}
   */
  async function commitWindow({ key } = {}) {
    StorageService.init();
    const { pending: pendingPath, cursor: cursorPath } = paths(jobName, key);
    const pending = StorageService.readJson(pendingPath);
    if (!pending) {
      throw new Error(
        `${jobName} commitWindow: no pending window found${key ? ` for key [${key}]` : ''} — call the fetch step (savePendingWindow) earlier in this run before committing.`
      );
    }
    const cursorRecord = {
      lastCommittedAtMs: pending.windowEndMs,
      lastCommittedAtIso: new Date(pending.windowEndMs).toISOString(),
      updatedAtIso: new Date().toISOString(),
    };
    await StorageService.saveJson(cursorPath, cursorRecord);
    return cursorRecord;
  }

  return { resolveWindowStartMs, savePendingWindow, commitWindow, readCursor };
};
