'use strict';

/**
 * orderBookEvents.js — the DATABASE write path for the order book.
 *
 * Division of responsibility (per docs/DATA_RULES.md §1–2):
 *
 *  - `data/cache/order-book-ledger/` holds the running cumulative total. That
 *    is DERIVED state — it can be rebuilt from base + deltas at any time — so
 *    it stays in cache, not the database.
 *  - The database holds the FACTS the derivation is built from, because those
 *    are dated market occurrences that are expensive to re-establish and must
 *    survive a cache wipe: each order win, and each order book figure a
 *    company declared on a concall.
 *
 * Both are dated, company-scoped occurrences, which is exactly what the
 * `events` collection is for — so this adds two new `type` values rather than
 * a new collection (DATA_RULES §2 prefers a new type over a new collection,
 * and a new collection here would duplicate what events already models):
 *
 *  - `order-win`            — one order announcement, with value/units/timeline
 *  - `order-book-declared`  — the unexecuted order book stated at a concall
 *
 * Ids are derived from the source document (`ssUrl` / quarter) rather than
 * from the summary text, so re-running the job never creates a duplicate and
 * a corrected extraction updates the existing record in place.
 *
 * @see {@link docs/DATA_ECOSYSTEM.md} for the collection layout
 * @see {@link docs/ORDER_BOOK_EXTRACTION.md} for the extraction pipeline
 */

const db = require('./db');

const CREATOR = 'order-book-tracker';

/** Compact human summary — what shows up in listings and digests. */
function winSummary({ companyId, valueCr, quantities, timeline, isAggregate }) {
  // A filing that discloses only a SEBI size band ("Large") states no figure
  // at all, and printing "₹undefined Cr" in a digest reads as a bug rather
  // than as the disclosure gap it actually is.
  const amount = Number.isFinite(valueCr) ? `₹${valueCr} Cr` : 'value not disclosed';
  const parts = [`${companyId} order win ${amount}`];
  if (isAggregate) parts[0] += ' (period aggregate)';
  if (quantities && quantities.length) {
    parts.push(quantities.map((q) => `${q.value} ${q.unit}`).join(', '));
  }
  if (timeline && timeline.endDate) parts.push(`exec by ${timeline.endDate}`);
  return parts.join(' — ');
}

/**
 * Persist order-win records.
 *
 * @param {string} companyId
 * @param {Array<Object>} wins - each {ssUrl, date, valueCr, quantities, timeline,
 *   confidence, source, title, isAggregate, components}
 * @returns {{inserted: number, updated: number, unchanged: number}}
 */
function saveOrderWins(companyId, wins) {
  if (!wins || !wins.length) return { inserted: 0, updated: 0, unchanged: 0 };
  const records = wins.map((w) => {
    // The ledger calls this field `deltaCr` (it is an addition to a running
    // total) while the event schema calls it `valueCr`. Accepting both keeps
    // the two callers — the sync job, which passes ledger entries, and
    // recordAnnouncementResolution, which passes event-shaped ones — from
    // silently writing `valueCr: undefined`.
    const valueCr = Number.isFinite(w.valueCr) ? w.valueCr : (w.deltaCr ?? null);
    return {
      // ssUrl is the filing's identity — same filing always lands on same id.
      id: db.makeId('evt', CREATOR, companyId, w.date, `order-win|${w.ssUrl}`),
      type: 'order-win',
      date: w.date,
      companyId,
      creator: CREATOR,
      summary: winSummary({ ...w, valueCr, companyId }),
      valueCr,
      unit: 'cr',
      // A filing can name its size band without naming a number; recording
      // the band keeps that partial disclosure usable downstream.
      valueBand: w.valueBand || null,
      quantities: w.quantities || [],
      executionTimeline: w.timeline || null,
      confidence: w.confidence || null,
      extractionSource: w.source || null,
      isAggregate: !!w.isAggregate,
      components: w.components || [],
      title: w.title || null,
      ssUrl: w.ssUrl,
      retracted: !!w.retracted,
      retractionReason: w.retractionReason || null,
    };
  });
  return db.appendEvents(records, { creator: CREATOR });
}

/**
 * Mark an already-written order-win event as not an order win after all.
 *
 * Records are never removed (DATA_RULES forbids deletes in a write path), so
 * a misclassification is corrected by upserting the same id with `retracted`
 * set — the mistake stays auditable while dropping out of every read.
 *
 * @param {string} companyId
 * @param {Object} win - {ssUrl, date, title}
 * @param {string} reason - why this is not a commercial order win
 */
function retractOrderWin(companyId, { ssUrl, date, title }, reason) {
  return saveOrderWins(companyId, [
    { ssUrl, date, title, valueCr: null, retracted: true, retractionReason: reason },
  ]);
}

/**
 * Persist the unexecuted order book a company declared on its latest concall.
 *
 * @param {string} companyId
 * @param {Object} base - the ledger base {valueCr, unit, sourceQuarter,
 *   sourceQuarterEndDate, label, sourceLine}
 */
function saveDeclaredOrderBook(companyId, base) {
  if (!base || !Number.isFinite(base.valueCr)) {
    return { inserted: 0, updated: 0, unchanged: 0 };
  }
  const record = {
    id: db.makeId(
      'evt',
      CREATOR,
      companyId,
      base.sourceQuarterEndDate,
      `ob-declared|${base.sourceQuarter}`
    ),
    type: 'order-book-declared',
    date: base.sourceQuarterEndDate,
    companyId,
    creator: CREATOR,
    summary: `${companyId} declared unexecuted order book ₹${base.valueCr} Cr as of ${base.sourceQuarter} concall`,
    valueCr: base.valueCr,
    unit: base.unit || 'cr',
    label: base.label || null,
    sourceQuarter: base.sourceQuarter,
    sourceType: base.sourceType || 'concall',
    sourceLine: base.sourceLine || null,
  };
  return db.appendEvents([record], { creator: CREATOR });
}

/** Every order win on record for a company, newest first. Retracted ones are excluded. */
function findOrderWins(companyId, { since, includeRetracted = false } = {}) {
  return db
    .find('events', { companyId, type: 'order-win', since })
    .filter((e) => includeRetracted || !e.retracted)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Every declared order book figure on record for a company, newest first. */
function findDeclaredOrderBooks(companyId) {
  return db
    .find('events', { companyId, type: 'order-book-declared' })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

module.exports = {
  saveOrderWins,
  retractOrderWin,
  saveDeclaredOrderBook,
  findOrderWins,
  findDeclaredOrderBooks,
  winSummary,
  CREATOR,
};
