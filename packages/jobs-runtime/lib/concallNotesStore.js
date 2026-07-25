'use strict';

/**
 * concallNotesStore.js — permanent, quarter-keyed cache of Stockscans'
 * AI-synthesized concall notes (`/api/company/concall-notes/{companyId}/{ssUrl}`).
 *
 * Distinct from stockscansContext.js's cache: that one is a 7-day-TTL bundle of
 * three different endpoints, keyed only by companyId, always the *latest*
 * transcript. This store is keyed by companyId+quarter, NEVER expires (a past
 * quarter's concall notes are immutable), and is the DB-first cache the
 * order-book extraction pipeline reads before spending one of Stockscans'
 * 600 concall-notes API calls/month.
 *
 * Layout: data/cache/concall-notes/<safeCompanyId>/<date>.json
 * where <date> is the Transcript document's `date` field ("YYYYMM").
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

function safeName(companyId) {
  return String(companyId || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}

function dir(companyId) {
  return path.join(db.cachePath('concall-notes'), safeName(companyId));
}

function file(companyId, date) {
  return path.join(dir(companyId), `${date}.json`);
}

/** True if we already have this company+quarter on disk. */
function has(companyId, date) {
  return fs.existsSync(file(companyId, date));
}

/** Read a stored bundle, or null if not present. */
function get(companyId, date) {
  const f = file(companyId, date);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return null; // corrupt entry — treat as a miss, caller may refetch
  }
}

/**
 * Persist a bundle. Shape:
 * { companyId, date, documentType: 'Transcript', ssUrl, finalReport, companyName,
 *   fetchedAt, source: 'live'|'manual' }
 */
function save(companyId, date, bundle) {
  const d = dir(companyId);
  fs.mkdirSync(d, { recursive: true });
  const f = file(companyId, date);
  const tmp = `${f}.tmp.${process.pid}`;
  fs.writeFileSync(
    tmp,
    JSON.stringify({ companyId, date, fetchedAt: new Date().toISOString(), ...bundle }, null, 2)
  );
  fs.renameSync(tmp, f);
  return f;
}

/**
 * Cache-first accessors for the order-book EXTRACTION RESULT, stored as an
 * `orderBook` field on the same per-quarter record (never a separate file —
 * the extraction result and the source text it came from must never drift
 * apart). Once `orderBook` is present, the extractor is never re-run for
 * that companyId+date; callers should always check `getOrderBook()` before
 * calling into lib/orderBookExtractor.js.
 */
function getOrderBook(companyId, date) {
  const bundle = get(companyId, date);
  return bundle ? bundle.orderBook || null : null;
}

/** Merge an extraction result onto the existing bundle (never overwrites finalReport). */
function saveOrderBook(companyId, date, orderBookResult) {
  const bundle = get(companyId, date);
  if (!bundle)
    throw new Error(`No concall-notes record for ${companyId} ${date} — fetch it first.`);
  bundle.orderBook = { ...orderBookResult, computedAt: new Date().toISOString() };
  return save(companyId, date, bundle);
}

/** List every quarter we hold on file for a company, sorted oldest→newest. */
function listQuarters(companyId) {
  const d = dir(companyId);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith('.json') && !f.includes('.tmp.'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/** Every company directory currently cached (for corpus-wide mining scripts). */
function listCompanies() {
  const root = db.cachePath('concall-notes');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((f) => fs.statSync(path.join(root, f)).isDirectory());
}

module.exports = {
  has,
  get,
  save,
  listQuarters,
  listCompanies,
  safeName,
  getOrderBook,
  saveOrderBook,
};
