'use strict';

/**
 * Tiny concurrency helpers for bulk API fan-out — no external dependency
 * (p-limit, bottleneck, etc.) needed for the batch sizes this codebase deals
 * with (dozens to low hundreds of chunks per bulk run).
 *
 * Why this exists: several bulk pipelines (concall-transcript-extractor,
 * announcement scans) need to hit a rate-limited third-party API N times
 * where N is "number of batches", not "number of companies" — but N is still
 * too large to safely fire all at once (Stockscans/Perplexity will 429 or
 * ban the session), and too large to run one-at-a-time without wasting
 * wall-clock time. A bounded worker pool is the simplest correct answer.
 */

/**
 * Run `worker(item, index)` over `items` with at most `concurrency` in
 * flight at once. Preserves input order in the returned array. A single
 * item throwing does NOT abort the others — the error is returned in place
 * of a result exactly like Promise.allSettled, so callers can decide
 * per-item whether to retry/skip/fail the whole run.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<Array<{ok: true, value: R} | {ok: false, error: Error}>>}
 */
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, runNext);
  await Promise.all(workers);
  return results;
}

/**
 * Retry `fn` with exponential backoff on 429/5xx (or any error, if
 * `retryAll` is set) — for rate-limited or flaky third-party APIs where a
 * transient failure shouldn't sink the whole batch.
 *
 * @template R
 * @param {() => Promise<R>} fn
 * @param {Object} [opts]
 * @param {number} [opts.retries=3]
 * @param {number} [opts.baseDelayMs=500]
 * @param {boolean} [opts.retryAll=false] - retry on any error, not just 429/5xx
 * @returns {Promise<R>}
 */
async function withRetry(fn, { retries = 3, baseDelayMs = 500, retryAll = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const retryable = retryAll || status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === retries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Split an array into fixed-size chunks — used to respect hard server caps
 * (e.g. announcements/scan's companyFilters accepts at most 10 entries,
 * confirmed by live testing 2026-07-26: 11 unique ids -> 400 "List should
 * have at most 10 items").
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

module.exports = { mapWithConcurrency, withRetry, chunk };
