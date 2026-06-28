'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadEnv, argValue } = require('./env');

const SCHEMA_VERSION = 'cowork-drive-store.v1';
const DEFAULT_OWNER_EMAIL = 'djplearner@gmail.com';
const DEFAULT_DRIVE_SUBPATH = path.join('StockMarket', 'cowork-jobs', 'v1');
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
  return path.resolve(expandHome(explicit || path.join(__dirname, '..', 'data')));
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
  return Boolean(resolveDriveRoot());
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseIsoDayFromLocalRel(rel) {
  let m = rel.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = rel.match(/sec_bhavdata_full_(\d{2})(\d{2})(20\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
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

  if (/^delivery_cache\/sec_bhavdata_full_\d{8}\.csv$/.test(rel)) {
    return {
      kind: 'source-cache',
      category: 'nse-delivery-bhavcopy',
      localRel: rel,
      driveRel: posixJoin('market-data', 'nse-delivery', year, month, name),
      date: isoDay,
      retention: 'cache-keep',
      producer: 'insightValidator',
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

  return null;
}

function classifyDriveDocument(driveRel) {
  const rel = posixRel(driveRel);
  const name = path.posix.basename(rel);

  if (rel === 'notes/current_run.txt') {
    return classifyLocalDocument('notes/.current_run');
  }

  let m = rel.match(/^notes\/snapshots\/\d{4}\/\d{2}\/(notes_.*\.json)$/);
  if (m) return classifyLocalDocument(`notes/${m[1]}`);

  m = rel.match(/^gainers\/(\d{4})\/(\d{2})\/(\d{2})\/gainers_raw\.json$/);
  if (m) return classifyLocalDocument(`daily_gainers/${m[1]}-${m[2]}-${m[3]}_gainers_raw.json`);

  m = rel.match(/^gainers\/(\d{4})\/(\d{2})\/(\d{2})\/insights\.json$/);
  if (m) return classifyLocalDocument(`daily_gainers/${m[1]}-${m[2]}-${m[3]}_insights.json`);

  m = rel.match(/^market-data\/nse-delivery\/\d{4}\/\d{2}\/(sec_bhavdata_full_\d{8}\.csv)$/);
  if (m) return classifyLocalDocument(`delivery_cache/${m[1]}`);

  if (rel === 'reference/bse_scrip_codes.json') {
    return classifyLocalDocument('delivery_cache/bse_scrip_codes.json');
  }

  m = rel.match(/^validation\/sector-context\/\d{4}\/\d{2}\/(sector_context_\d{8}\.json)$/);
  if (m) return classifyLocalDocument(`validation/${m[1]}`);

  m = rel.match(/^validation\/ignored-log\/\d{4}\/\d{2}\/(ignored_log_\d{8}\.json)$/);
  if (m) return classifyLocalDocument(`validation/${m[1]}`);

  if (rel === 'validation/ledger/ledger.json') return classifyLocalDocument('validation/ledger.json');
  if (rel === 'validation/proposals/proposals.md') return classifyLocalDocument('validation/proposals.md');
  if (rel === 'legacy/company_notes.json') return classifyLocalDocument('company_notes.json');

  if (rel.startsWith('_meta/')) return null;
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
    driveRel: doc.driveRel,
    storeRel,
    contentType: contentTypeFor(doc.driveRel),
    sizeBytes: stat.size,
    sha256: sha256(absPath),
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
  return walkFiles(driveRoot)
    .map((abs) => {
      const rel = posixRel(path.relative(driveRoot, abs));
      const doc = classifyDriveDocument(rel);
      return doc ? { ...doc, abs } : null;
    })
    .filter(Boolean);
}

function writeMetadata(driveRoot, dataRoot) {
  const docs = localDocuments(dataRoot).map((doc) => documentDto(doc, doc.abs, doc.driveRel));
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
        folders: {
          'notes/snapshots/YYYY/MM': 'watchlist insight snapshots',
          'gainers/YYYY/MM/DD': 'daily gainers raw and classified outputs',
          'market-data/nse-delivery/YYYY/MM': 'NSE delivery bhavcopy cache',
          'validation/*': 'insight validation ledger, logs, sector context, proposals',
          reference: 'small refreshable reference caches',
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

function syncToDrive({ dataRoot = resolveDataRoot(), driveRoot = resolveDriveRoot(), dryRun = false } = {}) {
  if (process.env.COWORK_DRIVE_SYNC === '0') {
    return { enabled: false, disabled: true, copied: 0, indexed: 0, driveRoot: driveRoot || null, dataRoot };
  }

  const root = ensureDriveRoot(driveRoot);
  if (!root) return { enabled: false, copied: 0, indexed: 0, driveRoot: null, dataRoot };

  let copied = 0;
  for (const doc of localDocuments(dataRoot)) {
    const dst = path.join(root, ...doc.driveRel.split('/'));
    if (copyIfNewer(doc.abs, dst, dryRun)) copied += 1;
  }
  const indexed = dryRun ? localDocuments(dataRoot).length : writeMetadata(root, dataRoot);
  return { enabled: true, direction: 'push', copied, indexed, driveRoot: root, dataRoot };
}

function syncFromDrive({ dataRoot = resolveDataRoot(), driveRoot = resolveDriveRoot(), dryRun = false } = {}) {
  if (process.env.COWORK_DRIVE_SYNC === '0') {
    return { enabled: false, disabled: true, copied: 0, driveRoot: driveRoot || null, dataRoot };
  }

  if (!driveRoot || !fs.existsSync(driveRoot)) {
    if (process.env.COWORK_DRIVE_STRICT === '1') {
      throw new Error('Drive root does not exist. Run data:init after mounting Google Drive.');
    }
    return { enabled: false, copied: 0, driveRoot: driveRoot || null, dataRoot };
  }

  let copied = 0;
  for (const doc of driveDocuments(driveRoot)) {
    const dst = path.join(dataRoot, ...doc.localRel.split('/'));
    if (copyIfNewer(doc.abs, dst, dryRun)) copied += 1;
  }
  return { enabled: true, direction: 'pull', copied, driveRoot, dataRoot };
}

async function withDriveDataSync(label, fn) {
  syncFromDrive();
  try {
    return await fn();
  } finally {
    const result = syncToDrive();
    if (result.enabled && process.env.COWORK_DRIVE_LOG === '1') {
      process.stderr.write(
        `[cowork-drive] ${label || 'job'} synced ${result.copied} file(s) to ${result.driveRoot}\n`
      );
    }
  }
}

function doctor() {
  const dataRoot = resolveDataRoot();
  const driveRoot = resolveDriveRoot();
  return {
    schemaVersion: SCHEMA_VERSION,
    ownerEmail: process.env.COWORK_DRIVE_EMAIL || DEFAULT_OWNER_EMAIL,
    dataRoot,
    dataRootExists: fs.existsSync(dataRoot),
    driveRoot,
    driveRootExists: Boolean(driveRoot && fs.existsSync(driveRoot)),
    driveSyncEnabled: isDriveSyncEnabled(),
    localDocumentCount: localDocuments(dataRoot).length,
    driveDocumentCount: driveRoot && fs.existsSync(driveRoot) ? driveDocuments(driveRoot).length : 0,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCli(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'doctor';
  if (cmd === 'doctor') return printJson(doctor());
  if (cmd === 'init') {
    const root = ensureDriveRoot();
    if (!root) {
      throw new Error('Set COWORK_DRIVE_ROOT to your Google Drive folder before running init');
    }
    writeMetadata(root, resolveDataRoot());
    return printJson(doctor());
  }
  if (cmd === 'pull') return printJson(syncFromDrive());
  if (cmd === 'push') return printJson(syncToDrive());
  if (cmd === 'sync') {
    const pull = syncFromDrive();
    const push = syncToDrive();
    return printJson({ pull, push });
  }
  if (cmd === 'manifest') {
    return printJson(localDocuments(resolveDataRoot()).map((doc) => documentDto(doc, doc.abs, doc.driveRel)));
  }
  process.stderr.write('Usage: driveDataStore.js [doctor|init|pull|push|sync|manifest]\n');
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
  resolveDataRoot,
  resolveDriveRoot,
  syncFromDrive,
  syncToDrive,
  withDriveDataSync,
  doctor,
  runCli,
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
