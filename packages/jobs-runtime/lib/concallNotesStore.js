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
const { StorageService } = require('@stock/cloud-utils');

function safeName(companyId) {
  return String(companyId || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}

function _dir(companyId) {
  return path.join(db.cachePath('concall-notes'), safeName(companyId));
}

function _file(companyId, date) {
  return path.join(_dir(companyId), `${date}.json`);
}

/** True if we already have this company+quarter on disk. */
function has(companyId, date) {
  return get(companyId, date) !== null;
}

/** Read a stored bundle, or null if not present. */
function get(companyId, date) {
  return StorageService.readJson(`cache/concall-notes/${safeName(companyId)}/${date}.json`);
}

/**
 * Persist a bundle. Shape:
 * { companyId, date, documentType: 'Transcript', ssUrl, finalReport, companyName,
 *   fetchedAt, source: 'live'|'manual' }
 */
function save(companyId, date, bundle) {
  const rel = `cache/concall-notes/${safeName(companyId)}/${date}.json`;
  StorageService.saveJson(rel, {
    companyId,
    date,
    fetchedAt: new Date().toISOString(),
    ...bundle,
  });
  return path.join(db.dataRoot(), rel);
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
  const single = path.join(db.cachePath('concall-notes'), 'notes.jsonl');
  if (!fs.existsSync(single)) return [];
  try {
    const lines = fs.readFileSync(single, 'utf8').split('\n');
    const safeComp = safeName(companyId);
    const quarters = new Set();
    for (const line of lines) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line.trim());
      if (rec.companyId === companyId || (rec._key && rec._key.startsWith(safeComp + '/'))) {
        if (rec.date) quarters.add(String(rec.date));
      }
    }
    return Array.from(quarters).sort();
  } catch (_) {
    return [];
  }
}

/** Every company directory currently cached (for corpus-wide mining scripts). */
function listCompanies() {
  const single = path.join(db.cachePath('concall-notes'), 'notes.jsonl');
  if (!fs.existsSync(single)) return [];
  try {
    const lines = fs.readFileSync(single, 'utf8').split('\n');
    const companies = new Set();
    for (const line of lines) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line.trim());
      if (rec.companyId) {
        companies.add(safeName(rec.companyId));
      } else if (rec._key) {
        companies.add(rec._key.split('/')[0]);
      }
    }
    return Array.from(companies).sort();
  } catch (_) {
    return [];
  }
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
