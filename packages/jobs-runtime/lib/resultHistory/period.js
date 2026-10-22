'use strict';

/**
 * period.js — which quarter a quarterly-result run is about, and whether that quarter's
 * result is already filed (`post`) or still upcoming (`pre`).
 *
 * Decided from the company's own Stockscans document list (`StockscansClient.documents`),
 * whose Result/PPT/Transcript `date` field is the quarter-end "YYYYMM" — never from the
 * calendar alone, because laggard filers (Q1 results filed in mid-August) would otherwise
 * be classified against the wrong quarter. Pure functions; every input is explicit.
 */

const { latestCompletedQuarter } = require('@stock/api/utils/fiscalQuarter');

const YYYYMM_RE = /^\d{6}$/;

/**
 * Quarter-end YYYYMM strings present for one document type, newest first.
 * @param {Array<{documentType: string, date: string}>} docList
 * @param {string} type 'Result' | 'PPT' | 'Transcript'
 * @returns {string[]}
 */
function quartersOf(docList, type) {
  const set = new Set(
    (docList || [])
      .filter((d) => d && d.documentType === type && YYYYMM_RE.test(String(d.date)))
      .map((d) => String(d.date))
  );
  return [...set].sort().reverse();
}

/**
 * Shift a quarter-end YYYYMM by `n` quarters (negative = earlier).
 * @param {string} yyyymm
 * @param {number} n
 * @returns {string}
 */
function shiftQuarter(yyyymm, n) {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4, 6));
  const idx = y * 12 + (m - 1) + 3 * n;
  return `${Math.floor(idx / 12)}${String((idx % 12) + 1).padStart(2, '0')}`;
}

/**
 * ISO date of a quarter end ("202609" → "2026-09-30").
 * @param {string} yyyymm
 * @returns {string}
 */
function quarterEndIso(yyyymm) {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4, 6));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Target quarter implied by a business date: the latest quarter completed as of that date.
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} YYYYMM
 */
function quarterForDate(isoDate) {
  return latestCompletedQuarter(new Date(`${isoDate}T12:00:00`)).yyyymm;
}

/**
 * Resolve the run's target quarter and mode.
 *
 * - Explicit `targetQuarter` (or one derived from `date`): `post` iff a Result exists for it.
 * - Otherwise: if the newest filed Result is at least the latest completed calendar quarter,
 *   the run is `post` for that quarter; else it is `pre` for the quarter after the newest
 *   filed one (the upcoming result).
 *
 * @param {Array<Object>} docList Stockscans documents for the company
 * @param {Object} [opts]
 * @param {string} [opts.targetQuarter] YYYYMM override
 * @param {string} [opts.date] YYYY-MM-DD business date (scheduled jobs)
 * @param {Date} [opts.now]
 * @returns {{mode: 'pre'|'post', targetQuarter: string|null, latestFiledQuarter: string|null}}
 */
function resolveResultMode(docList, { targetQuarter = null, date = null, now = new Date() } = {}) {
  const filed = quartersOf(docList, 'Result');
  const latestFiledQuarter = filed[0] || null;
  const explicit = targetQuarter || (date ? quarterForDate(date) : null);
  if (explicit) {
    return {
      mode: filed.includes(explicit) ? 'post' : 'pre',
      targetQuarter: explicit,
      latestFiledQuarter,
    };
  }
  const latestCompleted = latestCompletedQuarter(now).yyyymm;
  if (latestFiledQuarter && latestFiledQuarter >= latestCompleted) {
    return { mode: 'post', targetQuarter: latestFiledQuarter, latestFiledQuarter };
  }
  return {
    mode: 'pre',
    targetQuarter: latestFiledQuarter ? shiftQuarter(latestFiledQuarter, 1) : latestCompleted,
    latestFiledQuarter,
  };
}

/**
 * Documents of `type` strictly before the target quarter, newest first (the "history" side).
 * @param {Array<Object>} docList
 * @param {string} type
 * @param {string} targetQuarter YYYYMM
 * @param {number} [limit]
 * @returns {Array<Object>}
 */
function docsBefore(docList, type, targetQuarter, limit = Infinity) {
  return (docList || [])
    .filter(
      (d) =>
        d &&
        d.documentType === type &&
        d.ssUrl &&
        YYYYMM_RE.test(String(d.date)) &&
        String(d.date) < targetQuarter
    )
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

module.exports = {
  quartersOf,
  shiftQuarter,
  quarterEndIso,
  quarterForDate,
  resolveResultMode,
  docsBefore,
};
