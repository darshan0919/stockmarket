'use strict';

/**
 * orderBookRollup.js — bring the per-company unexecuted-order-book ledger up
 * to date for a handful of companies, cheaply and concurrently-safely.
 *
 * Used by lib/orderCardEnrichment.js for the top-ranked order cards of a
 * digest (Darshan's ask, 2026-09-30: "total unexecuted order book with this
 * new order"). Per-company work reuses the existing tracker pipeline verbatim
 * (`ensureBase`, `processNewAnnouncements`, the ledger, the events write path);
 * this module only decides WHICH announcements to feed it and when.
 *
 * Feed strategy, and why it is two-tier:
 *  - Fast path (daily): ONE batched Stockscans announcement search with
 *    `announcementType: "Orders / Contracts"` for all companies at once,
 *    one call-set per release quarter since the earliest watermark
 *    (`quarterDate` is mandatory on that endpoint; >10 companies transparently
 *    use the throwaway-watchlist pattern, see stock-api bulkAnnouncementScan).
 *  - Recall backstop (weekly per company): the unfiltered company history,
 *    from the base quarter's end. Measured 2026-09-30: the "Orders /
 *    Contracts" bucket missed NCC's 30-Jun-2026 "Order(s) received during
 *    June 2026" filing that the unfiltered feed carries. Without the
 *    backstop such a miss would silently understate the book forever.
 *
 * All state is keyed by companyId (per-company lock + per-company ledger
 * file); nothing here is module-level, so concurrent slots cannot interfere.
 */

const ledger = require('./orderBookLedger');
const annStore = require('./orderAnnouncementStore');
const obEvents = require('./orderBookEvents');
const { withLock } = require('./keyedLock');

const DAY_MS = 86400000;
const SWEEP_EVERY_DAYS = 7;
const ORDERS_ANNOUNCEMENT_TYPE = 'Orders / Contracts';

/**
 * Calendar-quarter-end `quarterDate` ("YYYYMM") containing an ISO date.
 * @param {string} iso YYYY-MM-DD
 * @returns {string}
 */
function quarterDateOf(iso) {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  return `${y}${String(Math.ceil(m / 3) * 3).padStart(2, '0')}`;
}

/**
 * Every calendar-quarter `quarterDate` from the one containing `sinceIso`
 * through the one containing `todayIso`, oldest first.
 * @param {string} sinceIso
 * @param {string} todayIso
 * @returns {string[]}
 */
function releaseQuarters(sinceIso, todayIso) {
  const out = [];
  let y = +sinceIso.slice(0, 4);
  let q = Math.ceil(+sinceIso.slice(5, 7) / 3);
  const last = quarterDateOf(todayIso);
  for (let i = 0; i < 40; i++) {
    const code = `${y}${String(q * 3).padStart(2, '0')}`;
    out.push(code);
    if (code >= last) break;
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * @typedef {Object} LedgerRefresh
 * @property {boolean} ok - a usable base exists
 * @property {string} [reason] - why not (no order book disclosed, no concall notes, ...)
 * @property {Object|null} ledger - `orderBookLedger.get()` after the refresh
 * @property {number} unresolvedCount - filings since base whose value was unreadable
 * @property {string} [feedWarning] - the feed failed; the ledger may lag
 * @property {'bucket'|'full-sweep'|'none'} feed - which tier fed this refresh
 */

/**
 * Refresh the ledgers of `companyIds`.
 *
 * @param {string[]} companyIds
 * @param {Object} deps
 * @param {Object} deps.client - StockscansClient
 * @param {Function} deps.ensureBase - `(companyId) => Promise<{ok, reason?}>`
 * @param {Function} deps.processNewAnnouncements - `(companyId, since, {client, rows?}) => Promise`
 * @param {Function} deps.scanForCompanies - `bulkAnnouncementScan.scanAnnouncementsForCompanies`
 * @param {string} deps.today - YYYY-MM-DD (IST)
 * @param {Date} [deps.now]
 * @param {number} [deps.sweepEveryDays]
 * @returns {Promise<Map<string, LedgerRefresh>>}
 */
async function refreshOrderLedgers(companyIds, deps) {
  const { client, ensureBase, processNewAnnouncements, scanForCompanies, today } = deps;
  const now = deps.now || new Date();
  const sweepMs = (deps.sweepEveryDays || SWEEP_EVERY_DAYS) * DAY_MS;
  const results = new Map();
  const ids = [...new Set(companyIds)];

  // 1) Bases (cache-first inside ensureBase; one lock per company).
  const usable = [];
  for (const id of ids) {
    const base = await withLock(`order-ledger:${id}`, () => ensureBase(id));
    if (!base.ok) {
      results.set(id, {
        ok: false,
        reason:
          base.reason === 'noOrderBookDisclosed'
            ? 'company declares no order-book total'
            : base.reason === 'needsLlmFallback'
              ? 'order-book base awaiting agent resolution'
              : base.reason || 'no base',
        pendingBase:
          base.reason === 'needsLlmFallback'
            ? { quarter: base.quarter || null, llmFallbackPrompt: base.llmFallbackPrompt || null }
            : undefined,
        ledger: null,
        unresolvedCount: 0,
        feed: 'none',
      });
    } else {
      usable.push(id);
    }
  }

  // 2) Split into weekly full-sweep vs fast-path companies.
  const sweep = [];
  const fast = [];
  for (const id of usable) {
    const l = ledger.get(id);
    const last = l && l.lastFullSweepAt ? Date.parse(l.lastFullSweepAt) : NaN;
    (Number.isFinite(last) && now.getTime() - last < sweepMs ? fast : sweep).push(id);
  }

  // 3) Fast path: one batched feed for every fast company.
  const rowsByCompany = new Map();
  let feedWarning = null;
  if (fast.length) {
    const sinceOf = (id) => {
      const l = ledger.get(id);
      return l.watermark || l.base.sourceQuarterEndDate;
    };
    const earliest = fast.map(sinceOf).sort()[0];
    for (const quarterDate of releaseQuarters(earliest, today)) {
      const rows = await scanForCompanies({
        client,
        companyIds: fast,
        quarterDate,
        announcementType: ORDERS_ANNOUNCEMENT_TYPE,
        exhaustive: true,
        onWarning: (m) => {
          feedWarning = feedWarning || m;
        },
      });
      for (const r of rows) {
        if (!rowsByCompany.has(r.companyId)) rowsByCompany.set(r.companyId, []);
        rowsByCompany.get(r.companyId).push(r);
      }
    }
  }

  // 4) Apply, per company, under that company's lock.
  for (const id of usable) {
    const isSweep = sweep.includes(id);
    if (!isSweep && feedWarning) {
      // Never advance a watermark over a quarter whose fetch failed.
      results.set(id, {
        ok: true,
        ledger: ledger.get(id),
        unresolvedCount: annStore.unresolved(id).length,
        feedWarning,
        feed: 'none',
      });
      continue;
    }
    await withLock(`order-ledger:${id}`, async () => {
      const before = ledger.get(id);
      const since = isSweep
        ? before.base.sourceQuarterEndDate
        : before.watermark || before.base.sourceQuarterEndDate;
      await processNewAnnouncements(
        id,
        since,
        isSweep ? { client } : { client, rows: rowsByCompany.get(id) || [] }
      );
      if (isSweep) ledger.markSweep(id, now.toISOString());
      const after = ledger.get(id);
      obEvents.saveDeclaredOrderBook(id, after.base);
      obEvents.saveOrderWins(id, after.announcementsApplied || []);
    });
    results.set(id, {
      ok: true,
      ledger: ledger.get(id),
      unresolvedCount: annStore.unresolved(id).length,
      feed: isSweep ? 'full-sweep' : 'bucket',
    });
  }
  return results;
}

module.exports = {
  refreshOrderLedgers,
  releaseQuarters,
  quarterDateOf,
  ORDERS_ANNOUNCEMENT_TYPE,
  SWEEP_EVERY_DAYS,
};
