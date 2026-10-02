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
        } catch (_) {
          /* another waiter broke it first */
        }
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
