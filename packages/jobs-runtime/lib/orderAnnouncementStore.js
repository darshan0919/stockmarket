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
const { safeName } = require('./concallNotesStore');

function dir(companyId) {
  return path.join(db.cachePath('order-announcements'), safeName(companyId));
}

function keyFor(ssUrl, date) {
  // ssUrl is normally unique per filing; fall back to date if a filing has
  // no ssUrl (text-only announcements do occur — treat date as the id then,
  // there's at most one such record per exact date in practice).
  const base = ssUrl ? String(ssUrl).replace(/\.pdf$/i, '') : `nodoc_${date}`;
  return base.replace(/[^A-Za-z0-9_-]+/g, '_');
}

function file(companyId, ssUrl, date) {
  return path.join(dir(companyId), `${keyFor(ssUrl, date)}.json`);
}

function has(companyId, ssUrl, date) {
  return fs.existsSync(file(companyId, ssUrl, date));
}

function get(companyId, ssUrl, date) {
  const f = file(companyId, ssUrl, date);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }
}

/**
 * Persist the processing verdict for one announcement. Shape:
 * { companyId, ssUrl, date, title, description,
 *   isOrderAnnouncement, extraction: {deltaCr,unit,...}|null,
 *   needsLlmFallback, processedAt }
 */
function save(companyId, ssUrl, date, record) {
  const d = dir(companyId);
  fs.mkdirSync(d, { recursive: true });
  const f = file(companyId, ssUrl, date);
  const tmp = `${f}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ companyId, ssUrl, date, processedAt: new Date().toISOString(), ...record }, null, 2));
  fs.renameSync(tmp, f);
  return f;
}

/** Every processed announcement id (ssUrl-derived key) for a company — the dedup set. */
function processedKeys(companyId) {
  const d = dir(companyId);
  if (!fs.existsSync(d)) return new Set();
  return new Set(fs.readdirSync(d).filter((f) => f.endsWith('.json') && !f.includes('.tmp.')).map((f) => f.replace(/\.json$/, '')));
}

/**
 * Every cached announcement still awaiting LLM resolution — recomputed from
 * disk each call (not "newly seen this run"), so a caller never loses track
 * of an unresolved item just because the watermark has since moved past its
 * date. Once a caller resolves one (see recordResolution), it drops out of
 * this list permanently.
 */
function unresolved(companyId) {
  const d = dir(companyId);
  if (!fs.existsSync(d)) return [];
  const out = [];
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json') || f.includes('.tmp.')) continue;
    const rec = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
    if (rec.needsLlmFallback) out.push(rec);
  }
  return out.sort((a, b) => String(a.date).localeCompare(b.date));
}

/** A skill calls this after an LLM resolves a needsLlmFallback announcement. Permanent, cached, never re-asked. */
function recordResolution(companyId, ssUrl, date, { deltaCr, unit = 'cr', reasoning }) {
  const existing = get(companyId, ssUrl, date) || {};
  const record = {
    ...existing,
    extraction: { deltaCr, unit, value: deltaCr, confidence: 'llm-resolved', reasoning },
    needsLlmFallback: false,
  };
  save(companyId, ssUrl, date, record);
  return record;
}

module.exports = { has, get, save, processedKeys, keyFor, unresolved, recordResolution };
