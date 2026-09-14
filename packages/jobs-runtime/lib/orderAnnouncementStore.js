'use strict';

/**
 * orderAnnouncementStore.js — permanent, per-announcement cache. Every
 * announcement this pipeline has ever looked at (order-related or not) is
 * recorded here keyed by companyId+ssUrl, so it is NEVER re-fetched-and-
 * classified twice. A "not an order announcement" verdict is just as
 * cacheable as a successful value extraction — both are terminal facts
 * about that specific announcement.
 *
 * Layout: data/cache/order-announcements/<safeCompanyId>/<ssUrl-without-ext>.json
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { StorageService } = require('@stock/cloud-utils');
const { safeName } = require('./concallNotesStore');

function _dir(companyId) {
  return path.join(db.cachePath('order-announcements'), safeName(companyId));
}

function keyFor(ssUrl, date) {
  // ssUrl is normally unique per filing; fall back to date if a filing has
  // no ssUrl (text-only announcements do occur — treat date as the id then,
  // there's at most one such record per exact date in practice).
  const base = ssUrl ? String(ssUrl).replace(/\.pdf$/i, '') : `nodoc_${date}`;
  return base.replace(/[^A-Za-z0-9_-]+/g, '_');
}

function _file(companyId, ssUrl, date) {
  return path.join(_dir(companyId), `${keyFor(ssUrl, date)}.json`);
}

function has(companyId, ssUrl, date) {
  return get(companyId, ssUrl, date) !== null;
}

function get(companyId, ssUrl, date) {
  return StorageService.readJson(
    `cache/order-announcements/${safeName(companyId)}/${keyFor(ssUrl, date)}.json`
  );
}

/**
 * Persist the processing verdict for one announcement. Shape:
 * { companyId, ssUrl, date, title, description,
 *   isOrderAnnouncement, extraction: {deltaCr,unit,...}|null,
 *   needsLlmFallback, processedAt }
 */
function save(companyId, ssUrl, date, record) {
  const rel = `cache/order-announcements/${safeName(companyId)}/${keyFor(ssUrl, date)}.json`;
  StorageService.saveJson(rel, {
    companyId,
    ssUrl,
    date,
    processedAt: new Date().toISOString(),
    ...record,
  });
  return path.join(db.dataRoot(), rel);
}

function loadAllRecords(companyId) {
  const single = path.join(db.cachePath('order-announcements'), 'announcements.jsonl');
  if (!fs.existsSync(single)) return [];
  try {
    const lines = fs.readFileSync(single, 'utf8').split('\n');
    const safeComp = safeName(companyId);
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line.trim());
      if (rec.companyId === companyId || (rec._key && rec._key.startsWith(safeComp + '/'))) {
        out.push(rec);
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

/** Every processed announcement id (ssUrl-derived key) for a company — the dedup set. */
function processedKeys(companyId) {
  const records = loadAllRecords(companyId);
  return new Set(records.map((r) => keyFor(r.ssUrl, r.date)));
}

/**
 * Every cached announcement still awaiting LLM resolution — recomputed from
 * disk each call (not "newly seen this run"), so a caller never loses track
 * of an unresolved item just because the watermark has since moved past its
 * date. Once a caller resolves one (see recordResolution), it drops out of
 * this list permanently.
 */
function unresolved(companyId) {
  const records = loadAllRecords(companyId);
  return records
    .filter((r) => r.needsLlmFallback)
    .sort((a, b) => String(a.date).localeCompare(b.date));
}

/** A skill calls this after an LLM resolves a needsLlmFallback announcement. Permanent, cached, never re-asked. */
function recordResolution(
  companyId,
  ssUrl,
  date,
  { deltaCr, unit = 'cr', reasoning, quantities = [], timeline = null, valueBand = null }
) {
  const existing = get(companyId, ssUrl, date) || {};
  const record = {
    ...existing,
    extraction: {
      deltaCr,
      unit,
      value: deltaCr,
      confidence: 'llm-resolved',
      source: 'llm',
      quantities,
      timeline,
      // Set when the filing discloses only a SEBI size band. A null deltaCr
      // alongside a band means "genuinely not stated", which is a different
      // fact from "not yet read" — and it must not be re-queued as the latter.
      valueBand,
      reasoning,
    },
    needsLlmFallback: false,
  };
  save(companyId, ssUrl, date, record);
  return record;
}

module.exports = { has, get, save, processedKeys, keyFor, unresolved, recordResolution };
