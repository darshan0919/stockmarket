#!/usr/bin/env node
/**
 * One-off maintenance: backfill missing NSE<>BSE identity fields on
 * data/companies.json records from the refreshed data/cache/company-master.json,
 * and fix malformed ids (double exchange-prefix bug, e.g. "NSE:NSE:DIGITIDE" ->
 * "NSE:DIGITIDE", "NSE:BSE:FERMENTA" -> "BSE:FERMENTA").
 *
 * Root cause of malformed ids: some writer path did `NSE:${companyId}` where
 * companyId already carried an exchange prefix. This script repairs existing
 * data; it does not fix the writer (out of scope here).
 *
 * Usage: node backfillCompanyIdentity.js [--dry-run]
 */
const path = require('path');
const db = require('../lib/db');
const master = require('../lib/companyMaster');

const dryRun = process.argv.includes('--dry-run');

function canonicalId(id) {
  const m = String(id).match(/^(NSE|BSE):(NSE|BSE):(.+)$/);
  if (m) return `${m[2]}:${m[3]}`; // drop the wrongly-prepended outer prefix
  return id;
}

function lookupMaster(id) {
  const [exch, ticker] = String(id).split(':');
  if (exch === 'NSE') return master.findByTicker(ticker);
  if (exch === 'BSE') return master.findByScripCode(ticker);
  return null;
}

function mergeRecord(a, b) {
  // a = kept record, b = duplicate being merged in. Union links, keep earliest
  // creationTime, prefer non-null identity fields, keep newest modifiedTime.
  const out = { ...a };
  for (const k of ['name', 'sector', 'industry', 'isin', 'nseTicker', 'bseScripCode']) {
    if (!out[k] && b[k]) out[k] = b[k];
  }
  out.links = out.links || {};
  const bl = b.links || {};
  for (const k of new Set([...Object.keys(out.links), ...Object.keys(bl)])) {
    const av = Array.isArray(out.links[k]) ? out.links[k] : [];
    const bv = Array.isArray(bl[k]) ? bl[k] : [];
    out.links[k] = [...new Set([...av, ...bv])];
  }
  out.manual = { ...(b.manual || {}), ...(a.manual || {}) };
  out.watchlist = out.watchlist || b.watchlist;
  out.creationTime = [a.creationTime, b.creationTime].filter(Boolean).sort()[0] || a.creationTime;
  out.modifiedTime = [a.modifiedTime, b.modifiedTime].filter(Boolean).sort().slice(-1)[0] || a.modifiedTime;
  return out;
}

function main() {
  const file = db.collectionFile('companies');
  const run = () => {
    const raw = db.loadFile(file);
    const before = summarize(raw);

    // Pass 1: fix malformed ids, merging into canonical key.
    const fixed = {};
    for (const [id, rec] of Object.entries(raw)) {
      const canon = canonicalId(id);
      rec.id = canon;
      if (fixed[canon]) {
        fixed[canon] = mergeRecord(fixed[canon], rec);
      } else {
        fixed[canon] = rec;
      }
    }

    // Pass 2: backfill identity fields from master by canonical id.
    let backfilled = 0;
    for (const [id, rec] of Object.entries(fixed)) {
      const needsBackfill = !rec.name || !rec.nseTicker || !rec.bseScripCode;
      if (!needsBackfill) continue;
      const m = lookupMaster(id);
      if (!m) continue;
      let changed = false;
      if (!rec.name && m.companyName) { rec.name = m.companyName; changed = true; }
      if (!rec.nseTicker && m.nseTicker) { rec.nseTicker = m.nseTicker; changed = true; }
      if (!rec.bseScripCode && m.bseTicker) { rec.bseScripCode = m.bseTicker; changed = true; }
      if (changed) backfilled++;
    }

    const after = summarize(fixed);

    console.log(JSON.stringify({
      idsFixed: Object.keys(raw).length - Object.keys(fixed).length + Object.values(raw).filter(r => r.id !== canonicalId(r.id)).length,
      malformedIdsFound: Object.keys(raw).filter(id => id !== canonicalId(id)).length,
      recordsBackfilled: backfilled,
      before, after,
      dryRun,
    }, null, 2));

    if (!dryRun) {
      db.writeFileAtomic(file, fixed);
      console.log('Wrote', file);
    }
  };

  if (dryRun) {
    run();
  } else {
    db.withLock('companies', run);
  }
}

function summarize(obj) {
  const arr = Object.values(obj);
  return {
    total: arr.length,
    nullName: arr.filter((r) => !r.name).length,
    hasNse: arr.filter((r) => r.nseTicker).length,
    hasBse: arr.filter((r) => r.bseScripCode).length,
    hasBoth: arr.filter((r) => r.nseTicker && r.bseScripCode).length,
  };
}

main();
