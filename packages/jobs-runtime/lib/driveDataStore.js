'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadEnv, argValue } = require('./env');
const driveApi = require('@stock/cloud-utils');

const SCHEMA_VERSION = 'cowork-drive-store.v1';
const DEFAULT_OWNER_EMAIL = 'djplearner@gmail.com';
const DEFAULT_DRIVE_SUBPATH = path.join('StockMarket', 'jobs', 'v1');
const COPY_MTIME_TOLERANCE_MS = 1000;

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function posixJoin(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

function posixRel(p) {
  return p.split(path.sep).join('/');
}

function resolveDataRoot() {
  const explicit =
    process.env.COWORK_DATA_DIR ||
    process.env.WI_DATA_DIR ||
    (process.env.GAINERS_OUTPUT_DIR ? path.dirname(process.env.GAINERS_OUTPUT_DIR) : null) ||
    (process.env.IV_CACHE_DIR ? path.dirname(process.env.IV_CACHE_DIR) : null);
  // jobs/data/ stays in the jobs/ directory (only runtime code moved to
  // packages/jobs-runtime/), so the default must reach back to the repo root.
  return path.resolve(expandHome(explicit || path.join(__dirname, '..', '..', '..', 'jobs', 'data')));
}

function detectGoogleDriveBase(email = DEFAULT_OWNER_EMAIL) {
  const candidates = [
    path.join(os.homedir(), 'Library', 'CloudStorage', `GoogleDrive-${email}`, 'My Drive'),
    path.join(os.homedir(), 'Library', 'CloudStorage', `GoogleDrive-${email}`),
    path.join(os.homedir(), 'Google Drive'),
    path.join(os.homedir(), 'My Drive'),
  ];
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory()) || null;
}

function resolveDriveRoot() {
  const explicit = process.env.COWORK_DRIVE_ROOT;
  if (explicit) return path.resolve(expandHome(explicit));

  const owner = process.env.COWORK_DRIVE_EMAIL || DEFAULT_OWNER_EMAIL;
  const base = detectGoogleDriveBase(owner);
  return base ? path.join(base, DEFAULT_DRIVE_SUBPATH) : null;
}

function isDriveSyncEnabled() {
  if (process.env.COWORK_DRIVE_SYNC === '0') return false;
  return Boolean(resolveDriveRoot()) || driveApi.isApiConfigured();
}

/**
 * Detect which transport mode is available.
 * @returns {'api' | 'local-mount' | 'disabled'}
 */
function detectTransport() {
  if (process.env.COWORK_DRIVE_SYNC === '0') return 'disabled';
  if (resolveDriveRoot()) return 'local-mount';
  if (driveApi.isApiConfigured()) return 'api';
  return 'disabled';
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── Flat + MongoDB-like Drive layout (Task 2) ──────────────────────────────
//
// Each classifyLocalDocument() `category` is a flat Drive "collection"
// folder (no year/month/day nesting underneath it). Every file inside a
// collection is named after its own last-modified timestamp, formatted
// DD-MM-YYYY-HH-MM-SS-Z (UTC, literal 'Z' suffix), which keeps documents
// naturally sortable within the folder the same way MongoDB ObjectIds sort
// by embedded timestamp. The real metadata (category/kind/producer/date/
// original localRel/sha256) is never inferred from the flat path - it lives
// in `_meta/documents.jsonl`, the collection's index, exactly like a Mongo
// collection's documents carry their own fields rather than being addressed
// by physical location.

/**
 * Format a millisecond timestamp as DD-MM-YYYY-HH-MM-SS-Z (UTC).
 * @param {number} mtimeMs
 * @returns {string}
 */
function formatFlatTimestamp(mtimeMs) {
  const d = new Date(mtimeMs);
  const pad = (n) => String(n).padStart(2, '0');
  const DD = pad(d.getUTCDate());
  const MO = pad(d.getUTCMonth() + 1);
  const YYYY = d.getUTCFullYear();
  const HH = pad(d.getUTCHours());
  const MI = pad(d.getUTCMinutes());
  const SS = pad(d.getUTCSeconds());
  return `${DD}-${MO}-${YYYY}-${HH}-${MI}-${SS}-Z`;
}

/**
 * Compute the flat Drive-relative path for a classified document.
 * `${category}/${DD-MM-YYYY-HH-MM-SS-Z}[-hash6].${ext}`
 *
 * @param {object} doc - result of classifyLocalDocument (needs .category, .driveRel/.localRel for ext)
 * @param {number} mtimeMs - file's last-modified time in ms
 * @param {string} [contentHashHex] - full sha256 hex; first 6 chars used as a collision-breaker suffix
 * @returns {string}
 */
function flatDriveRelFor(doc, mtimeMs, contentHashHex) {
  const extSource = doc.driveRel || doc.localRel || '';
  const ext = path.posix.extname(extSource); // includes leading '.', may be ''
  const ts = formatFlatTimestamp(mtimeMs);
  const suffix = contentHashHex ? `-${contentHashHex.slice(0, 6)}` : '';
  return `${doc.category}/${ts}${suffix}${ext}`;
}

/**
 * Assign collision-free flat driveRel paths to a batch of classified+stat'd
 * docs (each needs .category, .driveRel/.localRel, .abs). Two files landing
 * in the same collection within the same second get a content-hash suffix
 * appended, mirroring how Mongo ObjectIds stay unique even when generated in
 * the same tick.
 *
 * @param {Array<object>} docs
 * @returns {Map<object, string>} doc -> flat driveRel
 */
function assignFlatPaths(docs) {
  const used = new Set();
  const result = new Map();
  for (const doc of docs) {
    const stat = fs.statSync(doc.abs);
    let rel = flatDriveRelFor(doc, stat.mtimeMs, null);
    if (used.has(rel)) {
      const hash = sha256(doc.abs);
      rel = flatDriveRelFor(doc, stat.mtimeMs, hash);
      // Extremely unlikely second collision (same second + same hash prefix); if it
      // still collides, widen the hash suffix until unique.
      let hashLen = 6;
      while (used.has(rel) && hashLen < hash.length) {
        hashLen += 2;
        rel = flatDriveRelFor(doc, stat.mtimeMs, hash.slice(0, hashLen));
      }
    }
    used.add(rel);
    result.set(doc, rel);
  }
  return result;
}

function parseIsoDayFromLocalRel(rel) {
  let m = rel.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = rel.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = rel.match(/_(\d{2})(\d{2})(20\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = rel.match(/notes_(\d{2})-(\d{2})-(\d{2})_/);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function ymdParts(isoDay) {
  if (!isoDay) return { year: 'unknown-year', month: 'unknown-month', day: 'unknown-day' };
  const [year, month, day] = isoDay.split('-');
  return { year, month, day };
}

function contentTypeFor(rel) {
  if (rel.endsWith('.json')) return 'application/json';
  if (rel.endsWith('.jsonl')) return 'application/x-ndjson';
  if (rel.endsWith('.csv')) return 'text/csv';
  if (rel.endsWith('.md')) return 'text/markdown';
  if (rel.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function classifyLocalDocument(localRel) {
  const rel = posixRel(localRel);
  const name = path.posix.basename(rel);
  const isoDay = parseIsoDayFromLocalRel(rel);
  const { year, month, day } = ymdParts(isoDay);

  let m;
  if ((m = rel.match(/^agent-outputs\/(.*)$/))) {
    return {
      kind: 'agent-output',
      category: 'skills',
      localRel: rel,
      driveRel: `agent-outputs/${m[1]}`,
      date: null,
      retention: 'keep',
      producer: 'skills',
    };
  }

  if (rel === 'notes/current.json') {
    return {
      kind: 'state',
      category: 'watchlist-notes',
      localRel: rel,
      driveRel: 'notes/current.json',
      date: null,
      retention: 'source-of-truth',
      producer: 'watchlistInsights',
    };
  }

  if (/^notes\/events\/\d{4}-\d{2}\.jsonl$/.test(rel)) {
    const monthStr = name.substring(0, 7); // YYYY-MM
    return {
      kind: 'event-log',
      category: 'watchlist-notes-events',
      localRel: rel,
      driveRel: `notes/events/${monthStr}.jsonl`,
      date: monthStr,
      retention: 'keep',
      producer: 'watchlistInsights',
    };
  }

  if (rel === 'notes/.current_run') {
    return {
      kind: 'pointer',
      category: 'notes',
      localRel: rel,
      driveRel: 'notes/current_run.txt',
      date: null,
      retention: 'latest-pointer',
      producer: 'watchlistInsights',
    };
  }

  if (/^notes\/notes_.*\.json$/.test(rel)) {
    return {
      kind: 'snapshot',
      category: 'watchlist-notes',
      localRel: rel,
      driveRel: posixJoin('notes', 'snapshots', year, month, name),
      date: isoDay,
      retention: 'keep',
      producer: 'watchlistInsights',
    };
  }

  if (/^daily_gainers\/\d{4}-\d{2}-\d{2}_gainers_raw\.json$/.test(rel)) {
    return {
      kind: 'daily-report',
      category: 'gainers-raw',
      localRel: rel,
      driveRel: posixJoin('gainers', year, month, day, 'gainers_raw.json'),
      date: isoDay,
      retention: 'keep',
      producer: 'gainersScanner',
    };
  }

  if (/^daily_gainers\/\d{4}-\d{2}-\d{2}_insights\.json$/.test(rel)) {
    return {
      kind: 'daily-report',
      category: 'gainers-insights',
      localRel: rel,
      driveRel: posixJoin('gainers', year, month, day, 'insights.json'),
      date: isoDay,
      retention: 'keep',
      producer: 'gainers_classifier',
    };
  }

  if (rel === 'delivery_cache/bse_scrip_codes.json') {
    return {
      kind: 'reference-cache',
      category: 'bse-scrip-codes',
      localRel: rel,
      driveRel: 'reference/bse_scrip_codes.json',
      date: null,
      retention: 'cache-refreshable',
      producer: 'gainersScanner',
    };
  }

  if (/^validation\/sector_context_\d{8}\.json$/.test(rel)) {
    return {
      kind: 'daily-context',
      category: 'sector-context',
      localRel: rel,
      driveRel: posixJoin('validation', 'sector-context', year, month, name),
      date: isoDay,
      retention: 'cache-keep',
      producer: 'insightValidator',
    };
  }

  if (/^validation\/ignored_log_\d{8}\.json$/.test(rel)) {
    return {
      kind: 'daily-log',
      category: 'ignored-announcements',
      localRel: rel,
      driveRel: posixJoin('validation', 'ignored-log', year, month, name),
      date: isoDay,
      retention: 'keep',
      producer: 'watchlistInsights',
    };
  }

  if (rel === 'validation/ledger.json') {
    return {
      kind: 'ledger',
      category: 'validation-ledger',
      localRel: rel,
      driveRel: 'validation/ledger/ledger.json',
      date: null,
      retention: 'source-of-truth',
      producer: 'insightValidator',
    };
  }

  if (rel === 'validation/gainers_ledger.json') {
    return {
      kind: 'ledger',
      category: 'gainers-validation-ledger',
      localRel: rel,
      driveRel: 'validation/gainers-ledger/gainers_ledger.json',
      date: null,
      retention: 'source-of-truth',
      producer: 'insightValidator',
    };
  }

  if (rel === 'validation/proposals.md') {
    return {
      kind: 'proposal-log',
      category: 'validation-proposals',
      localRel: rel,
      driveRel: 'validation/proposals/proposals.md',
      date: null,
      retention: 'source-of-truth',
      producer: 'insightValidator',
    };
  }

  if (/^watchlist_sync\/\d{4}-\d{2}-\d{2}_.*_watchlist_sync\.json$/.test(rel)) {
    return {
      kind: 'daily-report',
      category: 'watchlist-sync',
      localRel: rel,
      driveRel: posixJoin('watchlist-sync', year, month, day, name),
      date: isoDay,
      retention: 'keep',
      producer: 'watchlist-sync',
    };
  }

  if (rel === 'company_notes.json') {
    return {
      kind: 'legacy-snapshot',
      category: 'company-notes-legacy',
      localRel: rel,
      driveRel: 'legacy/company_notes.json',
      date: null,
      retention: 'legacy',
      producer: 'watchlistInsights',
    };
  }

  // Investment-thesis engine's local mirror (data/theses/): mirrors the paired
  // Drive DB folder 1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL. Same relative path on Drive.
  if (/^data\/theses\//.test(rel)) {
    return {
      kind: 'thesis-record',
      category: 'investment-theses',
      localRel: rel,
      driveRel: rel,
      date: isoDay,
      retention: 'keep',
      producer: 'thesis-engine',
    };
  }

  // Modern structured layout (StorageService/DataStore writes entities/, events/,
  // documents/): mirror the same relative path on Drive. Without this catch-all,
  // offloadToDrive indexed only the legacy patterns above yet wiped the whole data
  // root — silently deleting un-uploaded files (e.g. NSE delivery CSVs, watchlist
  // notes entity history, deals digests).
  if (/^(entities|events|documents)\//.test(rel)) {
    return {
      kind: 'structured',
      category: rel.split('/').slice(0, 2).join('/'),
      localRel: rel,
      driveRel: rel,
      date: isoDay,
      retention: 'keep',
      producer: 'storage-service',
    };
  }

  return null;
}

/**
 * Load the `_meta/documents.jsonl` index into a Map keyed by storeRel (the
 * flat driveRel), so classifyDriveDocument can look up full metadata for
 * files that live under the new flat layout (where the path alone no longer
 * encodes category/kind/producer/date - see flatDriveRelFor above).
 * @param {string} metaJsonlPath - absolute local path to a documents.jsonl file
 * @returns {Map<string, object>}
 */
function loadDriveIndex(metaJsonlPath) {
  const index = new Map();
  if (!metaJsonlPath || !fs.existsSync(metaJsonlPath)) return index;
  const lines = fs.readFileSync(metaJsonlPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const doc = JSON.parse(line);
      if (doc.storeRel) index.set(doc.storeRel, doc);
    } catch {
      // skip malformed line
    }
  }
  return index;
}

/**
 * Classify a Drive-relative path back into local document metadata.
 *
 * Flat-layout files (Task 2): the parent folder is the category, but the
 * filename (a timestamp, optionally hash-suffixed) does not encode
 * kind/producer/date/localRel, so those are looked up in `index`
 * (from `_meta/documents.jsonl`). If the file isn't in the index (e.g. it
 * predates indexing, or the index is stale), we fall back to a best-effort
 * "unindexed" classification using just the category folder name.
 *
 * Legacy nested-path files (pre-migration) are still recognized by their
 * old year/month/day patterns for backward compatibility, since Task 2's
 * migration leaves old files in place rather than deleting them.
 *
 * @param {string} driveRel
 * @param {Map<string, object>} [index] - result of loadDriveIndex()
 */
function classifyDriveDocument(driveRel, index) {
  const rel = posixRel(driveRel);
  const name = path.posix.basename(rel);

  if (index && index.has(rel)) {
    const indexed = index.get(rel);
    return {
      kind: indexed.kind,
      category: indexed.category,
      localRel: indexed.localRel,
      driveRel: indexed.storeRel,
      date: indexed.date,
      retention: indexed.retention,
      producer: indexed.producer,
    };
  }

  if (rel === 'notes/current.json') {
    return classifyLocalDocument('notes/current.json');
  }

  let m;
  if ((m = rel.match(/^agent-outputs\/(.*)$/))) {
    return classifyLocalDocument(`agent-outputs/${m[1]}`);
  }

  if (/^notes\/events\/\d{4}-\d{2}\.jsonl$/.test(rel)) {
    return classifyLocalDocument(rel);
  }

  if (rel === 'notes/current_run.txt') {
    return classifyLocalDocument('notes/.current_run');
  }

  m = rel.match(/^notes\/snapshots\/\d{4}\/\d{2}\/(notes_.*\.json)$/);
  if (m) return classifyLocalDocument(`notes/${m[1]}`);

  m = rel.match(/^gainers\/(\d{4})\/(\d{2})\/(\d{2})\/gainers_raw\.json$/);
  if (m) return classifyLocalDocument(`daily_gainers/${m[1]}-${m[2]}-${m[3]}_gainers_raw.json`);

  m = rel.match(/^gainers\/(\d{4})\/(\d{2})\/(\d{2})\/insights\.json$/);
  if (m) return classifyLocalDocument(`daily_gainers/${m[1]}-${m[2]}-${m[3]}_insights.json`);

  if (rel === 'reference/bse_scrip_codes.json') {
    return classifyLocalDocument('delivery_cache/bse_scrip_codes.json');
  }

  m = rel.match(/^validation\/sector-context\/\d{4}\/\d{2}\/(sector_context_\d{8}\.json)$/);
  if (m) return classifyLocalDocument(`validation/${m[1]}`);

  m = rel.match(/^validation\/ignored-log\/\d{4}\/\d{2}\/(ignored_log_\d{8}\.json)$/);
  if (m) return classifyLocalDocument(`validation/${m[1]}`);

  m = rel.match(/^watchlist-sync\/\d{4}\/\d{2}\/\d{2}\/(\d{4}-\d{2}-\d{2}_.*_watchlist_sync\.json)$/);
  if (m) return classifyLocalDocument(`watchlist_sync/${m[1]}`);

  if (rel === 'validation/ledger/ledger.json') return classifyLocalDocument('validation/ledger.json');
  if (rel === 'validation/gainers-ledger/gainers_ledger.json') return classifyLocalDocument('validation/gainers_ledger.json');
  if (rel === 'validation/proposals/proposals.md') return classifyLocalDocument('validation/proposals.md');
  if (rel === 'legacy/company_notes.json') return classifyLocalDocument('company_notes.json');

  // Modern structured layout: Drive path === local path.
  if (/^(entities|events|documents)\//.test(rel)) return classifyLocalDocument(rel);

  if (rel.startsWith('_meta/')) return null;

  // Flat-layout file (category/DD-MM-YYYY-HH-MM-SS-Z[-hash].ext) not present
  // in the index: best-effort fallback so we don't silently drop it. Content-
  // based re-classification by extension is as far as we can safely infer
  // without the index; category (the parent folder) is trustworthy since it
  // IS the collection name.
  const parts = rel.split('/');
  if (parts.length === 2 && /^\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{2}-Z(-[0-9a-f]{6,})?\.\w+$/.test(parts[1])) {
    const category = parts[0];
    return {
      kind: 'unindexed',
      category,
      localRel: `documents/unindexed/${category}/${name}`,
      driveRel: rel,
      date: null,
      retention: 'keep',
      producer: 'unknown',
    };
  }

  return null;
}

function walkFiles(root) {
  if (!root || !fs.existsSync(root)) return [];
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  };
  visit(root);
  return out;
}

function documentDto(doc, absPath, storeRel) {
  const stat = fs.statSync(absPath);
  const sha = sha256(absPath);
  // storeRel, when not explicitly given, is computed centrally from category
  // + mtime + content hash (flat layout) rather than trusted from
  // classifyLocalDocument()'s legacy nested driveRel.
  const flatRel = storeRel || flatDriveRelFor(doc, stat.mtimeMs, null);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `${doc.category}:${doc.localRel}`,
    ownerEmail: process.env.COWORK_DRIVE_EMAIL || DEFAULT_OWNER_EMAIL,
    kind: doc.kind,
    category: doc.category,
    producer: doc.producer,
    date: doc.date,
    retention: doc.retention,
    localRel: doc.localRel,
    // legacyDriveRel: the old year/month/day-nested path this doc would have
    // used pre-flat-migration; kept for cross-referencing during Task 2 migration.
    legacyDriveRel: doc.driveRel,
    driveRel: flatRel,
    storeRel: flatRel,
    contentType: contentTypeFor(doc.driveRel),
    sizeBytes: stat.size,
    sha256: sha,
    modifiedAt: stat.mtime.toISOString(),
    indexedAt: new Date().toISOString(),
  };
}

function copyIfNewer(src, dst, dryRun = false) {
  if (!fs.existsSync(src)) return false;
  const srcStat = fs.statSync(src);
  const dstExists = fs.existsSync(dst);
  let shouldCopy = !dstExists;

  if (dstExists) {
    const dstStat = fs.statSync(dst);
    shouldCopy =
      srcStat.mtimeMs > dstStat.mtimeMs + COPY_MTIME_TOLERANCE_MS ||
      (srcStat.size !== dstStat.size && srcStat.mtimeMs >= dstStat.mtimeMs - COPY_MTIME_TOLERANCE_MS);

    if (
      !shouldCopy &&
      srcStat.size === dstStat.size &&
      Math.abs(srcStat.mtimeMs - dstStat.mtimeMs) <= COPY_MTIME_TOLERANCE_MS
    ) {
      shouldCopy = sha256(src) !== sha256(dst);
    }
  }

  if (!shouldCopy) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    fs.utimesSync(dst, srcStat.atime, srcStat.mtime);
  }
  return true;
}

function localDocuments(dataRoot = resolveDataRoot()) {
  return walkFiles(dataRoot)
    .map((abs) => {
      const rel = posixRel(path.relative(dataRoot, abs));
      const doc = classifyLocalDocument(rel);
      return doc ? { ...doc, abs } : null;
    })
    .filter(Boolean);
}

function driveDocuments(driveRoot = resolveDriveRoot()) {
  const index = loadDriveIndex(path.join(driveRoot || '', '_meta', 'documents.jsonl'));
  return walkFiles(driveRoot)
    .map((abs) => {
      const rel = posixRel(path.relative(driveRoot, abs));
      const doc = classifyDriveDocument(rel, index);
      return doc ? { ...doc, abs } : null;
    })
    .filter(Boolean);
}

function writeMetadata(driveRoot, dataRoot) {
  const rawDocs = localDocuments(dataRoot);
  const flatPaths = assignFlatPaths(rawDocs);
  const docs = rawDocs.map((doc) => documentDto(doc, doc.abs, flatPaths.get(doc)));
  const metaDir = path.join(driveRoot, '_meta');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(
    path.join(metaDir, 'database.json'),
    `${JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        ownerEmail: process.env.COWORK_DRIVE_EMAIL || DEFAULT_OWNER_EMAIL,
        dataRoot,
        driveRoot,
        documentCount: docs.length,
        updatedAt: new Date().toISOString(),
        layout: 'flat-mongo-v1',
        folders: {
          '<category>/': [
            'Flat "collection" per category (e.g. gainers-raw, gainers-insights, watchlist-notes,',
            'sector-context, ignored-announcements, validation-ledger, documents/deals_digest, ...).',
            'No further year/month/day nesting inside a category folder.',
            'Each file is named after its own last-modified time, formatted',
            'DD-MM-YYYY-HH-MM-SS-Z (UTC, literal Z suffix), original extension kept',
            '(e.g. gainers-raw/08-07-2026-14-30-05-Z.json). On a same-second collision',
            'within a category, a 6-hex-char sha256 suffix is appended:',
            'gainers-raw/08-07-2026-14-30-05-Z-a1b2c3.json.',
            'The flat filename alone does NOT encode category/kind/producer/date -',
            'those live only in _meta/documents.jsonl (the index), the same way a',
            'MongoDB document carries its own fields rather than being addressed by path.',
          ].join(' '),
          '_meta/database.json': 'this file - describes the layout',
          '_meta/documents.jsonl': 'the index: one JSON line per document mapping its flat storeRel back to full metadata (category, kind, producer, date, original localRel, sha256, timestamps)',
        },
        legacyFolders: {
          'notes/snapshots/YYYY/MM': '(pre-flat-migration, left in place, not written to anymore) watchlist insight snapshots',
          'gainers/YYYY/MM/DD': '(pre-flat-migration, left in place, not written to anymore) daily gainers raw and classified outputs',
          'validation/*': '(pre-flat-migration, left in place, not written to anymore) insight validation ledger, logs, sector context, proposals',
          reference: '(pre-flat-migration, left in place, not written to anymore) small refreshable reference caches',
          legacy: 'pre-v1 compatibility files',
        },
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(metaDir, 'documents.jsonl'),
    docs.map((d) => JSON.stringify(d)).join('\n') + (docs.length ? '\n' : '')
  );
  return docs.length;
}

function ensureDriveRoot(driveRoot = resolveDriveRoot()) {
  if (!driveRoot) {
    if (process.env.COWORK_DRIVE_STRICT === '1') {
      throw new Error('COWORK_DRIVE_ROOT is not set and no Google Drive folder was detected');
    }
    return null;
  }
  fs.mkdirSync(driveRoot, { recursive: true });
  return driveRoot;
}

// ── Local-mount sync (original, synchronous) ──────────────────────────────────

function syncToDriveLocal({ dataRoot = resolveDataRoot(), driveRoot = resolveDriveRoot(), dryRun = false } = {}) {
  const root = ensureDriveRoot(driveRoot);
  if (!root) return { enabled: false, copied: 0, indexed: 0, driveRoot: null, dataRoot, transport: 'local-mount' };

  let copied = 0;
  const docs = localDocuments(dataRoot);
  const flatPaths = assignFlatPaths(docs);
  for (const doc of docs) {
    const dst = path.join(root, ...flatPaths.get(doc).split('/'));
    if (copyIfNewer(doc.abs, dst, dryRun)) copied += 1;
  }
  const indexed = dryRun ? docs.length : writeMetadata(root, dataRoot);
  return { enabled: true, direction: 'push', copied, indexed, driveRoot: root, dataRoot, transport: 'local-mount' };
}

function syncFromDriveLocal({ dataRoot = resolveDataRoot(), driveRoot = resolveDriveRoot(), dryRun = false } = {}) {
  if (!driveRoot || !fs.existsSync(driveRoot)) {
    if (process.env.COWORK_DRIVE_STRICT === '1') {
      throw new Error('Drive root does not exist. Run data:init after mounting Google Drive.');
    }
    return { enabled: false, copied: 0, driveRoot: driveRoot || null, dataRoot, transport: 'local-mount' };
  }

  let copied = 0;
  for (const doc of driveDocuments(driveRoot)) {
    const dst = path.join(dataRoot, ...doc.localRel.split('/'));
    if (copyIfNewer(doc.abs, dst, dryRun)) copied += 1;
  }
  return { enabled: true, direction: 'pull', copied, driveRoot, dataRoot, transport: 'local-mount' };
}

// ── API-mode sync (async, uses googleapis) ────────────────────────────────────

const DEFAULT_API_CONCURRENCY = 20;

/**
 * Run `fn` over `items` with at most `limit` in flight at once.
 * Each `fn(item)` result is ignored here - callers track outcomes via closures.
 */
async function forEachLimit(items, limit, fn) {
  let idx = 0;
  const n = Math.max(1, Math.min(limit, items.length || 1));
  async function worker() {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
}

async function syncToDriveApi({
  dataRoot = resolveDataRoot(),
  dryRun = false,
  concurrency = Number(process.env.COWORK_DRIVE_CONCURRENCY) || DEFAULT_API_CONCURRENCY,
} = {}) {
  const { drive } = driveApi.createDriveClient();
  const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;
  const docs = localDocuments(dataRoot);
  const flatPaths = assignFlatPaths(docs);
  let copied = 0;

  if (dryRun) {
    copied = docs.length;
  } else {
    await forEachLimit(docs, concurrency, async (doc) => {
      const flatRel = flatPaths.get(doc);
      try {
        await driveApi.uploadFile(drive, rootPath, flatRel, doc.abs);
        copied += 1;
      } catch (e) {
        process.stderr.write(`[cowork-drive-api] upload failed ${flatRel}: ${e.message}\n`);
      }
    });
    if (!dryRun) writeMetadata(os.tmpdir(), dataRoot); // best-effort local cache of the index; real _meta upload happens via uploadFile below
    await forEachLimit(['database.json', 'documents.jsonl'], 2, async (name) => {
      try {
        await driveApi.uploadFile(drive, rootPath, `_meta/${name}`, path.join(os.tmpdir(), '_meta', name));
      } catch (e) {
        process.stderr.write(`[cowork-drive-api] upload failed _meta/${name}: ${e.message}\n`);
      }
    });
  }

  return {
    enabled: true,
    direction: 'push',
    copied,
    indexed: docs.length,
    driveRoot: `drive://${rootPath}`,
    dataRoot,
    transport: 'api',
  };
}

async function syncFromDriveApi({
  dataRoot = resolveDataRoot(),
  dryRun = false,
  concurrency = Number(process.env.COWORK_DRIVE_CONCURRENCY) || DEFAULT_API_CONCURRENCY,
} = {}) {
  const { drive } = driveApi.createDriveClient();
  const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;

  let remoteFiles;
  try {
    remoteFiles = await driveApi.listAllFiles(drive, rootPath);
  } catch (e) {
    if (process.env.COWORK_DRIVE_STRICT === '1') {
      throw new Error(`Failed to list Drive files: ${e.message}`);
    }
    return { enabled: false, copied: 0, driveRoot: `drive://${rootPath}`, dataRoot, transport: 'api', error: e.message };
  }

  // Fetch the index first (small file) so flat-layout files can be classified
  // via their metadata rather than the (metadata-less) flat filename.
  const metaIndexTmp = path.join(os.tmpdir(), `cowork-drive-index-${process.pid}.jsonl`);
  let index = new Map();
  try {
    const gotIndex = await driveApi.downloadFile(drive, rootPath, '_meta/documents.jsonl', metaIndexTmp);
    if (gotIndex) index = loadDriveIndex(metaIndexTmp);
  } catch {
    // index unavailable - flat files without nested-legacy patterns fall back to 'unindexed'
  }

  const toFetch = remoteFiles
    .filter((file) => !file.driveRel.startsWith('_meta/'))
    .map((file) => ({ file, doc: classifyDriveDocument(file.driveRel, index) }))
    .filter(({ doc }) => Boolean(doc));

  let copied = 0;

  if (dryRun) {
    copied = toFetch.length;
  } else {
    await forEachLimit(toFetch, concurrency, async ({ file, doc }) => {
      const localPath = path.join(dataRoot, ...doc.localRel.split('/'));
      try {
        const downloaded = await driveApi.downloadFile(drive, rootPath, file.driveRel, localPath);
        if (downloaded) copied += 1;
      } catch (e) {
        process.stderr.write(`[cowork-drive-api] download failed ${file.driveRel}: ${e.message}\n`);
      }
    });
  }

  return {
    enabled: true,
    direction: 'pull',
    copied,
    driveRoot: `drive://${rootPath}`,
    dataRoot,
    transport: 'api',
  };
}

// ── Flat-layout migration (Task 2) ─────────────────────────────────────────
//
// Walks the existing nested drive://StockMarket/jobs/v1 tree (API mode only)
// and re-uploads each file into the new flat category/timestamp layout,
// verifying via sha256 after upload. Old nested files are left in place -
// this migration is purely additive; nothing is deleted or overwritten
// out from under the legacy tree.

const FLAT_NAME_RE = /\/\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{2}-Z(-[0-9a-f]{6,})?\.\w+$/;

// ── Local disk cache for Drive listings ────────────────────────────────────
//
// `driveApi.listAllFiles()` walks the whole Drive tree (~30-40s for this
// dataset), which blows past short per-invocation timeouts when migrate-flat
// is run repeatedly in small batches. Cache the listing to a local JSON file
// with a short TTL so repeated batch invocations reuse the same listing
// instead of re-walking Drive every time. The cache is updated in place
// after each live (non-dry-run) batch so migrated files aren't re-processed
// on the next call, and it can be forced to refresh via --refresh-listing.

const DRIVE_LISTING_CACHE_DIR = path.join(__dirname, '..', '.cache');
const DRIVE_LISTING_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function driveListingCachePath(rootPath) {
  const safe = rootPath.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(DRIVE_LISTING_CACHE_DIR, `drive-listing-${safe}.json`);
}

function readDriveListingCache(rootPath) {
  const cachePath = driveListingCachePath(rootPath);
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.files) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDriveListingCache(rootPath, files) {
  const cachePath = driveListingCachePath(rootPath);
  try {
    fs.mkdirSync(DRIVE_LISTING_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), rootPath, files }, null, 2));
  } catch {
    // best-effort cache write; failures here shouldn't break migration
  }
}

async function getCachedOrFreshDriveListing(drive, rootPath, { refresh = false } = {}) {
  if (!refresh) {
    const cached = readDriveListingCache(rootPath);
    if (cached && Date.now() - cached.fetchedAt < DRIVE_LISTING_CACHE_TTL_MS) {
      return { files: cached.files, fromCache: true, fetchedAt: cached.fetchedAt };
    }
  }
  const files = await driveApi.listAllFiles(drive, rootPath);
  writeDriveListingCache(rootPath, files);
  return { files, fromCache: false, fetchedAt: Date.now() };
}

async function migrateFlat({ dryRun = true, concurrency = 5, batchLimit = 0, refreshListing = false } = {}) {
  const { drive } = driveApi.createDriveClient();
  const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;

  const listing = await getCachedOrFreshDriveListing(drive, rootPath, { refresh: refreshListing });
  const remoteFiles = listing.files;
  const candidates = remoteFiles.filter((f) => !f.driveRel.startsWith('_meta/'));

  // Resumability: skip files whose legacy path is already recorded as
  // migrated in the index (migratedFrom), so this can be safely re-run in
  // small batches (e.g. across several short invocations) without redoing
  // already-verified work or creating duplicate flat copies.
  const alreadyMigrated = new Set();
  if (!dryRun) {
    const tmpIndexCheck = path.join(os.tmpdir(), `cowork-migrate-precheck-${process.pid}.jsonl`);
    try {
      const got = await driveApi.downloadFile(drive, rootPath, '_meta/documents.jsonl', tmpIndexCheck);
      if (got) {
        for (const line of fs.readFileSync(tmpIndexCheck, 'utf8').split('\n').filter(Boolean)) {
          try {
            const d = JSON.parse(line);
            if (d.migratedFrom) alreadyMigrated.add(d.migratedFrom);
          } catch {
            // skip malformed line
          }
        }
      }
    } catch {
      // no index yet
    } finally {
      fs.rmSync(tmpIndexCheck, { force: true });
    }
  }

  const toMigrate = [];
  for (const f of candidates) {
    if (FLAT_NAME_RE.test(`/${f.driveRel}`)) continue; // already flat - skip
    if (alreadyMigrated.has(f.driveRel)) continue; // resumed run - already migrated+verified
    const doc = classifyDriveDocument(f.driveRel); // legacy nested classification, no index needed
    if (!doc) continue;
    toMigrate.push({ file: f, doc });
  }
  const skippedAlreadyMigrated = alreadyMigrated.size;
  const remainingAfterThisBatch = batchLimit > 0 ? Math.max(0, toMigrate.length - batchLimit) : 0;
  const batch = batchLimit > 0 ? toMigrate.slice(0, batchLimit) : toMigrate;

  const used = new Set();
  const mappings = [];
  let migrated = 0;
  let collisions = 0;
  let failures = 0;
  const newIndexEntries = [];

  await forEachLimit(batch, concurrency, async ({ file, doc }) => {
    const tmpPath = path.join(os.tmpdir(), `cowork-migrate-${crypto.randomBytes(8).toString('hex')}`);
    try {
      const mtimeMs = file.modifiedTime ? new Date(file.modifiedTime).getTime() : Date.now();

      if (dryRun) {
        // Dry run: skip the (expensive) download/verify round-trip and only
        // compute the mapping from already-known listAllFiles metadata
        // (driveRel, modifiedTime). Collisions are flagged but not resolved
        // with a real content hash here - that only happens on the live run,
        // where the file is downloaded anyway.
        let newRel = flatDriveRelFor(doc, mtimeMs, null);
        let usedHash = false;
        if (used.has(newRel)) {
          usedHash = true;
          collisions += 1;
          newRel = `${newRel} (collision - real run will append content-hash suffix)`;
        }
        used.add(newRel);
        migrated += 1;
        mappings.push({ old: file.driveRel, new: newRel, category: doc.category, collisionFlagged: usedHash });
        return;
      }

      const ok = await driveApi.downloadFile(drive, rootPath, file.driveRel, tmpPath);
      if (!ok) {
        failures += 1;
        mappings.push({ old: file.driveRel, error: 'download failed' });
        return;
      }
      const hash = sha256(tmpPath);
      let newRel = flatDriveRelFor(doc, mtimeMs, null);
      let usedHash = false;
      if (used.has(newRel)) {
        newRel = flatDriveRelFor(doc, mtimeMs, hash);
        usedHash = true;
        collisions += 1;
      }
      used.add(newRel);

      {
        await driveApi.uploadFile(drive, rootPath, newRel, tmpPath);
        const verifyPath = `${tmpPath}.verify`;
        await driveApi.downloadFile(drive, rootPath, newRel, verifyPath);
        const verifyHash = fs.existsSync(verifyPath) ? sha256(verifyPath) : null;
        fs.rmSync(verifyPath, { force: true });
        if (verifyHash !== hash) {
          failures += 1;
          mappings.push({ old: file.driveRel, new: newRel, error: `verify mismatch (${verifyHash} != ${hash})` });
          return;
        }
        newIndexEntries.push({
          schemaVersion: SCHEMA_VERSION,
          id: `${doc.category}:${doc.localRel}`,
          ownerEmail: process.env.COWORK_DRIVE_EMAIL || DEFAULT_OWNER_EMAIL,
          kind: doc.kind,
          category: doc.category,
          producer: doc.producer,
          date: doc.date,
          retention: doc.retention,
          localRel: doc.localRel,
          legacyDriveRel: file.driveRel,
          driveRel: newRel,
          storeRel: newRel,
          contentType: contentTypeFor(newRel),
          sizeBytes: file.size,
          sha256: hash,
          modifiedAt: file.modifiedTime,
          indexedAt: new Date().toISOString(),
          migratedFrom: file.driveRel,
        });
      }

      migrated += 1;
      mappings.push({ old: file.driveRel, new: newRel, category: doc.category, collisionResolved: usedHash, sha256: hash });
    } catch (e) {
      failures += 1;
      mappings.push({ old: file.driveRel, error: e.message });
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });

  if (!dryRun && newIndexEntries.length) {
    const tmpIndex = path.join(os.tmpdir(), `cowork-migrate-index-${process.pid}.jsonl`);
    let existing = '';
    try {
      const got = await driveApi.downloadFile(drive, rootPath, '_meta/documents.jsonl', tmpIndex);
      if (got) existing = fs.readFileSync(tmpIndex, 'utf8');
    } catch {
      // no existing index yet
    }
    const appended = existing + newIndexEntries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(tmpIndex, appended);
    await driveApi.uploadFile(drive, rootPath, '_meta/documents.jsonl', tmpIndex);
    fs.rmSync(tmpIndex, { force: true });
  }

  // Keep the cached listing in sync so the next batch invocation (within the
  // TTL) doesn't need to re-walk Drive and doesn't re-offer already-migrated
  // files as candidates. Remove legacy files that were successfully migrated
  // in this batch, and add their new flat-layout counterparts.
  if (!dryRun && (migrated > 0 || failures > 0)) {
    const successfulOld = new Set(
      mappings.filter((m) => !m.error && m.old).map((m) => m.old)
    );
    if (successfulOld.size) {
      const cached = readDriveListingCache(rootPath);
      if (cached && Array.isArray(cached.files)) {
        const remaining = cached.files.filter((f) => !successfulOld.has(f.driveRel));
        const newEntries = mappings
          .filter((m) => !m.error && m.old && m.new)
          .map((m) => {
            const orig = remoteFiles.find((f) => f.driveRel === m.old);
            return orig ? { ...orig, driveRel: m.new } : null;
          })
          .filter(Boolean);
        writeDriveListingCache(rootPath, [...remaining, ...newEntries]);
      }
    }
  }

  return {
    dryRun,
    driveRoot: `drive://${rootPath}`,
    listingFromCache: listing.fromCache,
    listingFetchedAt: new Date(listing.fetchedAt).toISOString(),
    skippedAlreadyMigrated,
    totalCandidates: toMigrate.length,
    batchProcessed: batch.length,
    remainingAfterThisBatch,
    migrated,
    collisionsResolvedWithHash: collisions,
    failures,
    sampleMappings: mappings.slice(0, 10),
    mappings,
  };
}

// ── Transport-switching sync (picks local-mount or API) ───────────────────────

async function syncToDrive(opts = {}) {
  if (process.env.COWORK_DRIVE_SYNC === '0') {
    const dataRoot = opts.dataRoot || resolveDataRoot();
    return { enabled: false, disabled: true, copied: 0, indexed: 0, driveRoot: null, dataRoot };
  }

  // If driveRoot is explicitly provided, always use local-mount transport
  if (opts.driveRoot) return syncToDriveLocal(opts);

  const transport = detectTransport();
  if (transport === 'local-mount') return syncToDriveLocal(opts);
  if (transport === 'api') return syncToDriveApi(opts);

  const dataRoot = opts.dataRoot || resolveDataRoot();
  return { enabled: false, copied: 0, indexed: 0, driveRoot: null, dataRoot };
}

async function syncFromDrive(opts = {}) {
  if (process.env.COWORK_DRIVE_SYNC === '0') {
    const dataRoot = opts.dataRoot || resolveDataRoot();
    return { enabled: false, disabled: true, copied: 0, driveRoot: null, dataRoot };
  }

  // If driveRoot is explicitly provided, always use local-mount transport
  if (opts.driveRoot) return syncFromDriveLocal(opts);

  const transport = detectTransport();
  if (transport === 'local-mount') return syncFromDriveLocal(opts);
  if (transport === 'api') return syncFromDriveApi(opts);

  const dataRoot = opts.dataRoot || resolveDataRoot();
  return { enabled: false, copied: 0, driveRoot: null, dataRoot };
}

async function withDriveDataSync(label, fn) {
  await syncFromDrive();
  try {
    return await fn();
  } finally {
    const result = await syncToDrive();
    if (result.enabled && process.env.COWORK_DRIVE_LOG === '1') {
      process.stderr.write(
        `[cowork-drive] ${label || 'job'} synced ${result.copied} file(s) to ${result.driveRoot} (${result.transport || 'unknown'})\n`
      );
    }
  }
}

function doctor() {
  const dataRoot = resolveDataRoot();
  const driveRoot = resolveDriveRoot();
  const transport = detectTransport();
  return {
    schemaVersion: SCHEMA_VERSION,
    ownerEmail: process.env.COWORK_DRIVE_EMAIL || DEFAULT_OWNER_EMAIL,
    transport,
    dataRoot,
    dataRootExists: fs.existsSync(dataRoot),
    driveRoot: transport === 'api' ? `drive://${process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH}` : driveRoot,
    driveRootExists: transport === 'api' ? true : Boolean(driveRoot && fs.existsSync(driveRoot)),
    driveSyncEnabled: isDriveSyncEnabled(),
    apiConfigured: driveApi.isApiConfigured(),
    localDocumentCount: localDocuments(dataRoot).length,
    driveDocumentCount: driveRoot && fs.existsSync(driveRoot) ? driveDocuments(driveRoot).length : 0,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runCli(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'doctor';
  if (cmd === 'doctor') return printJson(doctor());
  if (cmd === 'init') {
    const transport = detectTransport();
    if (transport === 'api') {
      // For API mode, just verify connectivity
      printJson(doctor());
      return;
    }
    const root = ensureDriveRoot();
    if (!root) {
      throw new Error(
        'No Drive transport configured.\n' +
          'Either set COWORK_DRIVE_ROOT (local mount) or run `yarn cowork:data:auth` (API mode).'
      );
    }
    writeMetadata(root, resolveDataRoot());
    return printJson(doctor());
  }
  if (cmd === 'pull') return printJson(await syncFromDrive());
  if (cmd === 'push') return printJson(await syncToDrive());
  if (cmd === 'sync') {
    const pull = await syncFromDrive();
    const push = await syncToDrive();
    return printJson({ pull, push });
  }
  if (cmd === 'manifest') {
    const docs = localDocuments(resolveDataRoot());
    const flatPaths = assignFlatPaths(docs);
    return printJson(docs.map((doc) => documentDto(doc, doc.abs, flatPaths.get(doc))));
  }
  if (cmd === 'migrate-flat') {
    const dryRun = argv.includes('--dry-run');
    const refreshListing = argv.includes('--refresh-listing');
    const batchArg = argv.find((a) => a.startsWith('--batch='));
    const batchLimit = batchArg ? Number(batchArg.split('=')[1]) : 0;
    const result = await migrateFlat({ dryRun, batchLimit, refreshListing });
    return printJson(result);
  }
  if (cmd === 'merge-cowork-jobs') {
    const dryRun = argv.includes('--dry-run');
    const refreshListing = argv.includes('--refresh-listing');
    const batchArg = argv.find((a) => a.startsWith('--batch='));
    const batchLimit = batchArg ? Number(batchArg.split('=')[1]) : 0;
    const mergeCoworkJobsFolder = require('./mergeCoworkJobsFolder');
    const result = await mergeCoworkJobsFolder.run({ dryRun, batchLimit, refreshListing });
    return printJson(result);
  }
  process.stderr.write('Usage: driveDataStore.js [doctor|init|pull|push|sync|manifest|migrate-flat --dry-run|merge-cowork-jobs --dry-run]\n');
  process.exit(1);
}

function stripKnownArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env-file') {
      i += 1;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_OWNER_EMAIL,
  DEFAULT_DRIVE_SUBPATH,
  classifyLocalDocument,
  classifyDriveDocument,
  documentDto,
  localDocuments,
  driveDocuments,
  resolveDataRoot,
  resolveDriveRoot,
  detectTransport,
  syncFromDrive,
  syncToDrive,
  withDriveDataSync,
  doctor,
  runCli,
  formatFlatTimestamp,
  flatDriveRelFor,
  assignFlatPaths,
  loadDriveIndex,
  migrateFlat,
  sha256,
  sha256Buf,
  forEachLimit,
  getCachedOrFreshDriveListing,
};

if (require.main === module) {
  try {
    const argv = process.argv.slice(2);
    loadEnv(argValue('--env-file'));
    runCli(stripKnownArgs(argv));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
