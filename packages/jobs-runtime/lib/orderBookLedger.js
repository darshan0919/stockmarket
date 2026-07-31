'use strict';

/**
 * orderBookLedger.js — the per-company cumulative order-book record.
 * data/cache/order-book-ledger/<safeCompanyId>.json
 *
 * `base` = the last concall-derived outstanding order book (a point-in-time
 * fact, immutable once set — see concallNotesStore's cached `orderBook`
 * field, which is the source of truth this is copied from).
 * `announcementsApplied` = every order-win announcement dated AFTER the
 * base's quarter that has contributed a delta, each recorded exactly once
 * (id = ssUrl) — this list is append-only and is the dedup guard against
 * ever double-counting an announcement.
 * `cumulative` = base.valueCr + sum(announcementsApplied[].deltaCr),
 * recomputed deterministically from the two fields above — never hand-set.
 * `cumulative.quantities` = the same idea for non-monetary units (MW, Km,
 * MTPA...). These are kept in SEPARATE per-unit buckets and never summed
 * across units, because 450 MW and 385 Km have no common denominator — a
 * single "total" across them would be meaningless. The rupee figure stays
 * the primary number; quantities describe what the money buys.
 * `cumulative.executionWindow` = earliest start / latest end across applied
 * announcements that stated a timeline — an indication of how far out the
 * book is committed, not a promise that delivery is evenly spread.
 * `cumulative.rangeLowCr` / `rangeHighCr` = the same total widened by wins
 * that disclosed only a SEBI size band ("Large", i.e. INR 250 to 600 Cr)
 * instead of a figure. `valueCr` stays the firm number and never absorbs a
 * guess; the range is what can honestly be said around it. Bands quoted in a
 * foreign currency widen nothing and are listed in `cumulative.foreignBands`
 * in their own denomination, because converting them would require an FX rate
 * this pipeline refuses to invent.
 * `watermark` = the latest announcement date considered, so the next run
 * only asks Stockscans for announcements newer than this.
 * `history` = append-only audit log of every change to this record.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { safeName } = require('./concallNotesStore');
const { normalizeUnit } = require('./orderPdfExtractor');

function file(companyId) {
  return path.join(db.cachePath('order-book-ledger'), `${safeName(companyId)}.json`);
}

function get(companyId) {
  const f = file(companyId);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return null;
  }
}

function write(companyId, ledger) {
  const f = file(companyId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp.${process.pid}`;
  ledger.updatedAt = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmp, f);
  return ledger;
}

/** Per-unit totals across applied announcements. Never summed across units. */
function sumQuantities(applied) {
  const byUnit = new Map();
  for (const a of applied) {
    for (const q of a.quantities || []) {
      if (!q || !q.unit || !Number.isFinite(q.value)) continue;
      // Fold here too, not just at extraction time, so ledgers written by an
      // earlier version don't keep "km" and "Km" as separate buckets forever.
      const unit = normalizeUnit(q.unit);
      byUnit.set(unit, (byUnit.get(unit) || 0) + q.value);
    }
  }
  return [...byUnit.entries()]
    .map(([unit, value]) => ({ unit, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
}

/** Earliest start / latest end across applied announcements that stated one. */
function executionWindow(applied) {
  const windows = applied.map((a) => a.timeline).filter((t) => t && t.startDate && t.endDate);
  if (!windows.length) return null;
  return {
    earliestStart: windows.map((t) => t.startDate).sort()[0],
    latestEnd: windows
      .map((t) => t.endDate)
      .sort()
      .slice(-1)[0],
    withTimeline: windows.length,
    withoutTimeline: applied.length - windows.length,
  };
}

/**
 * Rupee-expressible band spread contributed by wins with no stated value,
 * plus the foreign-currency bands that cannot be folded into a rupee total.
 */
function bandSpread(applied) {
  let low = 0;
  let high = 0;
  let count = 0;
  const foreign = [];
  for (const a of applied) {
    const b = a.valueBand;
    if (!b || typeof b !== 'object') continue;
    if (b.lowCr === null || b.lowCr === undefined) {
      if (b.text) foreign.push({ date: a.date, band: b.text, currency: b.currency || null });
      continue;
    }
    count += 1;
    low += b.lowCr;
    // An open-ended top band ("Above 1,000") has no ceiling, so neither does
    // the total — represented as null rather than pinned to the floor.
    high = high === null || b.highCr === null ? null : high + b.highCr;
  }
  return { low, high, count, foreign };
}

function recompute(ledger) {
  const applied = ledger.announcementsApplied || [];
  const deltaSum = applied.reduce((s, a) => s + (a.deltaCr || 0), 0);
  const firm = Math.round(((ledger.base ? ledger.base.valueCr : 0) + deltaSum) * 100) / 100;
  const band = bandSpread(applied);
  ledger.cumulative = {
    valueCr: firm,
    unit: 'cr',
    rangeLowCr: Math.round((firm + band.low) * 100) / 100,
    rangeHighCr: band.high === null ? null : Math.round((firm + band.high) * 100) / 100,
    bandOnlyCount: band.count,
    foreignBands: band.foreign,
    quantities: sumQuantities(applied),
    executionWindow: executionWindow(applied),
    asOfDate: ledger.watermark || (ledger.base ? ledger.base.sourceQuarterEndDate : null),
    computedAt: new Date().toISOString(),
  };
  return ledger;
}

/** Set/replace the base (only called once per quarter — a new concall replaces the old base and clears applied announcements, since the new base already reflects them). */
function setBase(companyId, base) {
  let ledger = get(companyId) || {
    companyId,
    base: null,
    announcementsApplied: [],
    watermark: null,
    history: [],
  };
  ledger.base = base;
  ledger.announcementsApplied = []; // the new base's own quarter already includes prior order wins — reset
  ledger.watermark = base.sourceQuarterEndDate;
  ledger.history = ledger.history || [];
  ledger.history.push({
    timestamp: new Date().toISOString(),
    trigger: 'new-base',
    valueCr: base.valueCr,
    note: `base set from ${base.sourceType} ${base.sourceQuarter}`,
  });
  recompute(ledger);
  return write(companyId, ledger);
}

/**
 * Retract a base that a later, better-informed verdict says was never a
 * company-wide total (e.g. the extractor had mistaken a segment bullet for
 * one). Without this the ledger would keep serving the superseded figure
 * forever, because `ensureBase()` short-circuits on any base whose quarter
 * matches the latest concall.
 *
 * The wins applied on top are dropped with it: they were deltas against a
 * base that no longer exists, and a bare sum of them is not an order book.
 * Nothing is deleted from disk — the record and its history survive, which
 * is what makes the retraction auditable.
 *
 * @param {string} companyId
 * @param {string} reason - why the prior base was retracted
 */
function clearBase(companyId, reason) {
  const ledger = get(companyId);
  if (!ledger || !ledger.base) return ledger;
  const prior = ledger.base.valueCr;
  ledger.base = null;
  ledger.announcementsApplied = [];
  ledger.history = ledger.history || [];
  ledger.history.push({
    timestamp: new Date().toISOString(),
    trigger: 'base-retracted',
    valueCr: null,
    note: `prior base ₹${prior} Cr retracted — ${reason}`,
  });
  recompute(ledger);
  return write(companyId, ledger);
}

/**
 * Append one announcement's contribution (no-op, idempotent, if ssUrl already applied).
 * @param {string} companyId
 * @param {Object} entry
 * @param {string} entry.ssUrl - dedup key
 * @param {string} entry.date - YYYY-MM-DD
 * @param {number|null} entry.deltaCr - null when the filing states no figure
 * @param {string} entry.title
 * @param {Object} [entry.valueBand] - the SEBI size band for filings that
 *   disclose only a class: {band, jurisdiction, currency, lowCr, highCr,
 *   text}. Carried so a re-sync doesn't discard the one piece of value
 *   information such a filing gives. `lowCr`/`highCr` are null for a band
 *   quoted in a foreign currency.
 * @param {Array<{unit: string, value: number}>} [entry.quantities] - non-monetary units
 * @param {Object} [entry.timeline] - {startDate, endDate, durationMonths, basis}
 * @param {string} [entry.confidence]
 * @param {boolean} [entry.isAggregate] - a period-total filing, not a single order
 * @param {string} [entry.source] - which tier resolved it: title|pdf|llm
 */
function applyAnnouncement(
  companyId,
  { ssUrl, date, deltaCr, title, valueBand, quantities, timeline, confidence, isAggregate, source }
) {
  const ledger = get(companyId);
  if (!ledger || !ledger.base)
    throw new Error(`No base set for ${companyId} — call setBase() first.`);
  if (ledger.announcementsApplied.some((a) => a.ssUrl === ssUrl)) return ledger; // already applied — idempotent
  ledger.announcementsApplied.push({
    ssUrl,
    date,
    deltaCr,
    title,
    valueBand: valueBand || null,
    quantities: quantities || [],
    timeline: timeline || null,
    confidence: confidence || null,
    isAggregate: !!isAggregate,
    source: source || null,
    appliedAt: new Date().toISOString(),
  });
  if (!ledger.watermark || date > ledger.watermark) ledger.watermark = date;
  ledger.history.push({
    timestamp: new Date().toISOString(),
    trigger: 'announcement-applied',
    valueCr: null,
    note:
      Number.isFinite(deltaCr) && deltaCr !== 0
        ? `+${deltaCr} Cr from ${ssUrl} (${date})`
        : `${ssUrl} (${date}) applied with no disclosed value${valueBand ? ` — band: ${valueBand.text || valueBand}` : ''}`,
  });
  recompute(ledger);
  ledger.history[ledger.history.length - 1].valueCr = ledger.cumulative.valueCr;
  return write(companyId, ledger);
}

/** Advance the watermark even when an announcement contributed no delta (still must never be re-processed). */
function advanceWatermark(companyId, date) {
  const ledger = get(companyId);
  if (!ledger) return null;
  if (!ledger.watermark || date > ledger.watermark) {
    ledger.watermark = date;
    write(companyId, ledger);
  }
  return ledger;
}

module.exports = {
  get,
  setBase,
  clearBase,
  applyAnnouncement,
  advanceWatermark,
  recompute,
  file,
  sumQuantities,
  executionWindow,
  bandSpread,
};
