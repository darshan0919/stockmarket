#!/usr/bin/env node
'use strict';

/**
 * migrateToV2.js — one-time migration of legacy stores into Data Ecosystem v2
 * (docs/DATA_ECOSYSTEM.md §7). Sources:
 *   1. legacy jobs/data/ layout (hydrate first: `node scripts/pullFromDrive.js` /
 *      legacy data:pull so Drive jobs/v1 content is present locally)
 *   2. data/theses/ (thesis engine local mirror)
 *   3. packages/jobs-runtime/data/company-master.json → cache/
 *
 * Idempotent: deterministic record ids → re-running upserts, never duplicates.
 * Non-destructive: reads sources, writes v2 collections; deletes NOTHING.
 * Unmappable files → listed in _meta/migration/manifest.json (quarantine).
 *
 * Usage: node migrateToV2.js [--source <dir>] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, argValue, hasFlag } = require('../lib/env');
loadEnv();
const db = require('../lib/db');

const REPO = path.join(__dirname, '..', '..', '..');
const SRC = path.resolve(argValue('--source') || path.join(REPO, 'jobs', 'data'));
const THESES = path.join(REPO, 'data', 'theses');
const MASTER = path.join(__dirname, '..', 'data', 'company-master.json');
const DRY = hasFlag('--dry-run');

const manifest = { migrated: {}, skippedDerivable: [], quarantined: [], errors: [] };
const bump = (k, n = 1) => {
  manifest.migrated[k] = (manifest.migrated[k] || 0) + n;
};

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const listFiles = (dir) => {
  const out = [];
  const visit = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) visit(abs);
      else out.push(abs);
    }
  };
  visit(dir);
  return out;
};
const rel = (abs) => path.relative(SRC, abs).split(path.sep).join('/');

let masterMod = null;
function companyIdFor(ticker, name) {
  if (ticker) return `NSE:${String(ticker).toUpperCase().trim()}`;
  if (!masterMod) {
    try {
      masterMod = require('../lib/companyMaster');
    } catch (_) {
      masterMod = false;
    }
  }
  if (masterMod && name) {
    const hit = masterMod.findInText(String(name));
    if (hit) return hit.companyId;
  }
  return null;
}

// ── handlers ─────────────────────────────────────────────────────────────────

function migrateGainersInsights(file) {
  const j = readJson(file);
  const date = j.market_date || path.basename(file).slice(0, 10);
  const records = (j.signals || [])
    .map((s) => ({
      type: 'gainer',
      date,
      companyId: s.companyId || companyIdFor(s.ticker, s.name),
      creator: s.creator || 'gainers-signal',
      creationTime: s.creationTime,
      modifiedTime: s.modifiedTime,
      name: s.name,
      industry: s.industry,
      return_1d: s.return_1d,
      market_cap_cr: s.market_cap_cr,
      primary_driver: s.primary_driver,
      conviction: s.conviction,
      evidence: s.evidence,
      delivery: s.delivery,
      summary: `${s.ticker} +${s.return_1d}% — ${s.primary_driver} (${s.conviction})`,
    }))
    .filter((r) => r.companyId);
  if (!DRY && records.length) db.appendEvents(records);
  bump('events:gainer', records.length);
}

function migrateTweetInsights(file) {
  const j = readJson(file);
  const date =
    (path.basename(file).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] ||
    String(j.generatedAt || '').slice(0, 10);
  const records = (j.signals || [])
    .map((s) => ({
      ...s,
      type: 'tweet',
      date,
      summary: s.text ? String(s.text).slice(0, 300) : undefined,
    }))
    .filter((r) => r.companyId && r.conviction !== 'NOISE');
  if (!DRY && records.length) db.appendEvents(records, { creator: 'tweet-signals' });
  bump('events:tweet', records.length);
}

const MONTHS = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};
/** Normalize "06-07-2026" (DD-MM-YYYY) / "06-Jul-2026" / ISO → "YYYY-MM-DD". */
function normDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()])
    return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

function migrateDealsDigest(file) {
  const j = readJson(file);
  const date = normDate(j.date);
  if (!date) return manifest.quarantined.push(rel(file));
  const rows = [];
  const add = (arr, subtype) => (arr || []).forEach((r) => rows.push({ ...r, subtype }));
  add(j.bulkBlock && j.bulkBlock.bulk, 'bulk');
  add(j.bulkBlock && j.bulkBlock.block, 'block');
  add(j.sast && j.sast.rows, 'sast');
  add(j.insider && j.insider.rows, 'insider');
  const records = rows.map((r) => ({
    ...r,
    type: 'deal',
    subtype: r.subtype,
    date: normDate(r.date) || date, // row dates come as "06-Jul-2026"
    companyId:
      r.companyId || companyIdFor(r.symbol || r.ticker, r.companyName || r.company || r.name),
    creator: 'daily-deals-digest',
    summary: [
      r.subtype,
      r.symbol || r.companyName || r.company,
      r.client || r.clientName || r.acquirer || r.personName,
      r.qty || r.quantity,
      r.price || r.avgPrice,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 300),
  }));
  if (!DRY && records.length) db.appendEvents(records);
  bump('events:deal', records.length);
  if (!rows.length) bump('events:deal-empty-day', 1);
}

function migrateWatchlistSync(file) {
  const j = readJson(file);
  const date = j.date || (path.basename(file).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
  if (!date) return manifest.quarantined.push(rel(file));
  const record = {
    type: 'watchlist-sync',
    date,
    creator: 'watchlist-sync',
    scanName: j.scanName,
    watchlistName: j.watchlistName,
    watchlistId: j.watchlistId,
    added: j.added,
    removed: j.removed,
    finalCount: j.desiredFinalCount,
    changes: (j.records || []).map((r) => ({ companyId: r.companyId, change: r.change })),
    summary: `${j.watchlistName}: +${j.added} / -${j.removed} (${j.desiredFinalCount} total)`,
  };
  if (!DRY) db.appendEvents([record]);
  bump('events:watchlist-sync');
}

/** insights-batch: flat array of { companyId, note:{...} } items. */
function migrateInsightsBatch(file) {
  const items = readJson(file);
  const batch = [];
  for (const item of Array.isArray(items) ? items : []) {
    const cid = item.companyId || item.ticker;
    const note = item.note || {};
    if (!cid || !(note.insight || note.text)) continue;
    batch.push({
      companyId: cid,
      type: note.type || 'insight',
      creator: 'watchlist-insights',
      date: String(note.date || note.creationTime || '').slice(0, 10) || undefined,
      creationTime: note.creationTime,
      text: note.insight || note.text,
      sourceAnnouncement: note.announcementId || undefined,
      announcementTitle: note.announcementTitle || undefined,
    });
  }
  if (!DRY && batch.length) db.appendNotes(batch);
  bump('notes', batch.length);
}

function migrateNotesDb(file) {
  const j = readJson(file);
  const companies = j.companies || {};
  const batch = [];
  for (const [cid, c] of Object.entries(companies)) {
    if (c.businessSummary) {
      batch.push({
        companyId: cid,
        type: 'business-summary',
        creator: 'watchlist-insights',
        date: String(c.lastUpdated || '').slice(0, 10) || undefined,
        text: c.businessSummary,
      });
    }
    for (const note of Array.isArray(c.notes) ? c.notes : []) {
      const text = note.insight || note.text || note.note || JSON.stringify(note);
      batch.push({
        companyId: cid,
        type: note.category || note.type || 'insight',
        creator: note.creator || 'watchlist-insights',
        date:
          String(note.date || note.creationTime || note.addedAt || '').slice(0, 10) || undefined,
        creationTime: note.creationTime || note.addedAt,
        text,
        sourceAnnouncement: note.announcementId || note.attachment || undefined,
      });
    }
  }
  if (!DRY && batch.length) db.appendNotes(batch);
  bump('notes', batch.length);
}

function migrateValidationLedger(file) {
  const j = readJson(file);
  const days = j.days || {};
  const batch = [];
  for (const [date, day] of Object.entries(days)) {
    const results = day.results || {};
    for (const [symbol, res] of Object.entries(results)) {
      batch.push({
        date,
        symbol,
        companyId: companyIdFor(symbol) || `NSE:${symbol}`,
        creator: 'insight-validation',
        ...(typeof res === 'object' ? res : { value: res }),
        marketMedian1d: day.marketMedian1d,
      });
    }
  }
  if (!DRY && batch.length) db.appendValidations(batch);
  bump('validation', batch.length);
}

function migrateTheses() {
  if (!fs.existsSync(THESES)) return;
  for (const dir of fs.readdirSync(THESES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const ticker = dir.name.toUpperCase();
    const cid = `NSE:${ticker}`;
    const tPath = path.join(THESES, dir.name, 'thesis.json');
    if (fs.existsSync(tPath)) {
      const thesis = readJson(tPath);
      delete thesis.sync_pending;
      if (!DRY)
        db.saveThesis(cid, thesis, { creator: thesis.creator || 'investment-thesis-engine' });
      bump('theses');
    }
    const hPath = path.join(THESES, dir.name, 'history.jsonl');
    if (fs.existsSync(hPath) && !DRY) {
      const dest = path.join(db.dataRoot(), 'thesis-history.jsonl');
      const existing = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
      for (const line of fs.readFileSync(hPath, 'utf8').split('\n').filter(Boolean)) {
        if (!existing.includes(line)) fs.appendFileSync(dest, line + '\n'); // idempotent
      }
      bump('thesis-history-lines');
    }
  }
}

function migrateCacheFile(file, destName) {
  if (!DRY) fs.copyFileSync(file, db.cachePath(destName));
  bump(`cache:${destName}`);
}

function migrateAsset(file) {
  if (!DRY) fs.copyFileSync(file, db.assetPath(path.basename(file)));
  bump('assets(no-DTO)');
}

/** Enrich companies.json stubs with identity from the Kite master cache. */
function enrichCompanies() {
  let master;
  try {
    master = readJson(db.cachePath('company-master.json'));
  } catch (_) {
    return;
  }
  const byId = new Map();
  for (const c of master.companies || []) {
    if (c.nseTicker) byId.set(`NSE:${c.nseTicker.toUpperCase()}`, c);
    byId.set(c.companyId, c);
  }
  const file = db.collectionFile('companies');
  db.withLock('companies', () => {
    const companies = db.loadFile(file);
    let enriched = 0;
    for (const [cid, c] of Object.entries(companies)) {
      const m = byId.get(cid);
      if (!m || c.name) continue;
      c.name = m.companyName;
      c.nseTicker = m.nseTicker;
      c.bseScripCode = m.bseTicker;
      c.keywords = m.keywords || [];
      if (m.companyId !== cid) c.aliases = [...new Set([...(c.aliases || []), m.companyId])];
      c.modifiedTime = require('../lib/ist').nowIstIso();
      enriched++;
    }
    if (!DRY) db.writeFileAtomic(file, companies);
    bump('companies-enriched', enriched);
  });
}

// ── routing ──────────────────────────────────────────────────────────────────

function route(file) {
  const r = rel(file);
  const base = path.basename(file);
  try {
    if (/daily_gainers\/.*_insights\.json$/.test(r) || /unindexed\/gainers-insights\//.test(r))
      return migrateGainersInsights(file);
    if (/tweet_signals\/.*_insights\.json$/.test(r)) return migrateTweetInsights(file);
    if (/deals_digest\/.*\.json$/.test(r)) return migrateDealsDigest(file);
    if (/watchlist_sync\/.*\.json$/.test(r) || /unindexed\/watchlist-sync\/.*\.json$/.test(r))
      return migrateWatchlistSync(file);
    if (
      /entities\/watchlist-notes\/.*\/current\/meta\.json$/.test(r) ||
      /^notes\/notes_.*\.json$/.test(r) ||
      /unindexed\/watchlist-notes\/.*\.json$/.test(r) ||
      /unindexed\/company-notes-legacy\/.*\.json$/.test(r)
    )
      return migrateNotesDb(file);
    if (/insights-batch\/.*\.json$/.test(r)) return migrateInsightsBatch(file);
    if (
      /entities\/validation\/main\/ledger\/meta\.json$/.test(r) ||
      /unindexed\/validation-ledger\//.test(r)
    )
      return migrateValidationLedger(file);
    if (
      /bse-scrip-codes\//.test(r) ||
      /scrip_codes\/meta\.json$/.test(r) ||
      base === 'bse_scrip_codes.json'
    )
      return migrateCacheFile(file, 'bse-scrip-codes.json');
    if (/sector-context\//.test(r)) return migrateCacheFile(file, `sector-context-${base}`);
    if (/documents\/reports\/.*\.html$/.test(r)) return migrateAsset(file);
    if (/documents\/(validation|unindexed\/validation-proposals)\/.*\.md$/.test(r))
      return migrateAsset(file);
    // Derivable / transient — deliberately not migrated:
    // (entity /history/ files are StorageService auto-backups of state we migrate
    //  from /current/; gainers_raw / tweets_raw / market-data are re-fetchable)
    if (
      /\/history\/\d+\.json$|_gainers_raw\.json$|gainers_raw_\d+\.json$|_tweets_raw|gainers-raw\/|market-data\/|ignored-announcements\/|ignored_log|ignored-log\/|\.current_run$|routine-tracking\/|(^|\/)\.env$|\.DS_Store$/.test(
        r
      )
    ) {
      return manifest.skippedDerivable.push(r);
    }
    manifest.quarantined.push(r);
  } catch (e) {
    manifest.errors.push(`${r}: ${e.message}`);
  }
}

function run() {
  console.log(`[migrate] source=${SRC} → dataRoot=${db.dataRoot()}${DRY ? ' (DRY RUN)' : ''}`);
  db.init();
  if (fs.existsSync(MASTER)) migrateCacheFile(MASTER, 'company-master.json');
  for (const f of listFiles(SRC)) route(f);
  migrateTheses();
  enrichCompanies();

  const outDir = path.join(db.dataRoot(), '_meta', 'migration');
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, `manifest-${Date.now()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('[migrate] migrated:', JSON.stringify(manifest.migrated));
  console.log(
    `[migrate] skipped-derivable: ${manifest.skippedDerivable.length}, quarantined: ${manifest.quarantined.length}, errors: ${manifest.errors.length}`
  );
  manifest.quarantined.slice(0, 30).forEach((q) => console.log(`  ? ${q}`));
  manifest.errors.forEach((e) => console.error(`  ! ${e}`));
  console.log(`[migrate] manifest: ${manifestPath}`);
  console.log('[migrate] next: node scripts/rebuildLinks.js && node scripts/data.js push');
}

run();
