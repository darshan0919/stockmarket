'use strict';

/**
 * keyedLock.js — tiny cross-process advisory lock keyed by a string.
 *
 * The order-book ledger is one read-modify-write JSON file per company. Two
 * processes (two scheduled slots, or a slot and `yarn order-book-sync`)
 * updating the SAME company at once could lose an applied win while the
 * watermark still advances past it — a silent undercount. Locking per company
 * key (never one global lock, never an "active job" global) keeps unrelated
 * companies fully parallel and makes concurrent runs correct by construction.
 *
 * Implementation: `fs.mkdirSync` is atomic; the lock is a directory under
 * `data/cache/locks/`. A lock older than `staleMs` is presumed dead (crashed
 * process) and is broken.
 *
 * FIXED 2026-10-06: a stale lock whose `fs.rmdirSync` fails for a reason
 * other than "already gone" (ENOENT) — most concretely, EPERM/EACCES when
 * the calling process lacks delete permission on `data/cache/locks/` —
 * used to be silently swallowed and retried with NO sleep and NO deadline
 * check, so the loop busy-spun forever (not bounded by `timeoutMs`, which
 * only applies to the "lock is young, just wait" branch below). Caught live
 * via `post-close-scan-insights`: 10 stale `order-ledger:*` lock directories
 * sat undeleted for 2-6+ days because the execution environment that hit
 * them that day had read/write but not delete rights on the connected
 * folder, so every run that picked one up span silently until an external
 * timeout killed the process. `rmdirSync` now only swallows ENOENT (another
 * waiter genuinely beat us to breaking it); any other error — a permission
 * problem being the one actually seen in production — throws immediately
 * with a diagnosis, so the failure is a one-line error instead of a
 * multi-minute unexplained hang.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` while holding the lock for `key`.
 *
 * @template T
 * @param {string} key - e.g. `order-ledger:NSE:RVNL`
 * @param {() => Promise<T>} fn
 * @param {Object} [opts]
 * @param {number} [opts.staleMs=120000] - break a lock older than this
 * @param {number} [opts.timeoutMs=60000] - give up waiting after this
 * @returns {Promise<T>}
 */
async function withLock(key, fn, { staleMs = 120000, timeoutMs = 60000 } = {}) {
  const dir = path.join(db.cachePath('locks'), key.replace(/[^A-Za-z0-9._-]/g, '_'));
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(dir).mtimeMs;
      } catch (_) {
        continue; // released between our mkdir and stat — retry immediately
      }
      if (age > staleMs) {
        try {
          fs.rmdirSync(dir);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            // Not "someone else already broke it" — we structurally cannot
            // remove this stale lock ourselves. Retrying would just busy-spin
            // forever (this branch predates `deadline`/`sleep`), so fail loud
            // and fast instead, with enough detail to fix the real cause
            // (almost always a filesystem permission issue) rather than
            // waiting out a silent multi-minute hang.
            throw new Error(
              `keyedLock: found a stale lock for "${key}" (age ${Math.round(age / 1000)}s, ` +
                `over the ${Math.round(staleMs / 1000)}s staleness cap) but could not remove ` +
                `it at ${dir} (${err.code || 'unknown'}: ${err.message}). This usually means ` +
                `this process lacks delete permission on data/cache/locks/ — grant it, or ` +
                `remove that directory manually, then retry.`
            );
          }
          /* ENOENT: another waiter already broke this stale lock — fine, retry mkdir. */
        }
        if (Date.now() > deadline) throw new Error(`keyedLock: timed out waiting for ${key}`);
        continue;
      }
      if (Date.now() > deadline) throw new Error(`keyedLock: timed out waiting for ${key}`);
      await sleep(150);
    }
  }
  try {
    return await fn();
  } finally {
    try {
      fs.rmdirSync(dir);
    } catch (_) {
      /* already broken as stale by another process */
    }
  }
}

module.exports = { withLock };
