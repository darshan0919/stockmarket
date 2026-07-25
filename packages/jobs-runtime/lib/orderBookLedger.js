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
 * `watermark` = the latest announcement date considered, so the next run
 * only asks Stockscans for announcements newer than this.
 * `history` = append-only audit log of every change to this record.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { safeName } = require('./concallNotesStore');

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

function recompute(ledger) {
  const deltaSum = (ledger.announcementsApplied || []).reduce((s, a) => s + (a.deltaCr || 0), 0);
  ledger.cumulative = {
    valueCr: Math.round(((ledger.base ? ledger.base.valueCr : 0) + deltaSum) * 100) / 100,
    unit: 'cr',
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

/** Append one announcement's contribution (no-op, idempotent, if ssUrl already applied). */
function applyAnnouncement(companyId, { ssUrl, date, deltaCr, title }) {
  const ledger = get(companyId);
  if (!ledger || !ledger.base)
    throw new Error(`No base set for ${companyId} — call setBase() first.`);
  if (ledger.announcementsApplied.some((a) => a.ssUrl === ssUrl)) return ledger; // already applied — idempotent
  ledger.announcementsApplied.push({
    ssUrl,
    date,
    deltaCr,
    title,
    appliedAt: new Date().toISOString(),
  });
  if (!ledger.watermark || date > ledger.watermark) ledger.watermark = date;
  ledger.history.push({
    timestamp: new Date().toISOString(),
    trigger: 'announcement-applied',
    valueCr: null,
    note: `+${deltaCr} Cr from ${ssUrl} (${date})`,
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

module.exports = { get, setBase, applyAnnouncement, advanceWatermark, recompute, file };
