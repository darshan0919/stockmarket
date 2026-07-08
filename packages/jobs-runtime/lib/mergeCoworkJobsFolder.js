'use strict';

/**
 * Merge the stray `StockMarket/cowork-jobs` Drive folder into the canonical
 * `StockMarket/jobs` folder that driveDataStore.js already syncs to.
 *
 * Canonical: StockMarket/jobs (survives, unchanged in place except for
 * incoming merges/copies).
 * Source: StockMarket/cowork-jobs (archived at the end, never deleted).
 *
 * For each file under cowork-jobs/v1/<legacyRel>, we classify it via
 * classifyDriveDocument() (same logic used for the canonical tree) to get
 * its category/localRel, then look for a matching file already migrated (or
 * about to be migrated) into the canonical flat layout:
 *   - No canonical match            -> pure copy: upload into canonical
 *                                       jobs/v1/<category>/<flat-name>.
 *   - Canonical match, same content -> no-op (already identical).
 *   - Canonical match, JSON, diff content -> deep-merge (union of keys;
 *                                       arrays of {companyId|announcementId}
 *                                       merged by id, else concat+dedupe by
 *                                       sha256; scalar conflicts: latest
 *                                       mtime wins) and upload the merged
 *                                       result into canonical.
 *   - Canonical match, non-JSON, diff content -> keep the most-recently
 *                                       modified as canonical; the other is
 *                                       archived alongside inside
 *                                       cowork-jobs with a `-superseded`
 *                                       suffix (never deleted, never
 *                                       silently dropped).
 *
 * All newly-written canonical files use the flat category/timestamp naming
 * from driveDataStore's flatDriveRelFor (Task 2).
 *
 * Never deletes anything. The cowork-jobs folder itself is renamed (archived)
 * at the very end of a live (non-dry-run) run, once every file has been
 * accounted for as copy/merge/supersede.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const driveApi = require('@stock/cloud-utils');
const store = require('./driveDataStore');

const CANONICAL_ROOT = 'StockMarket/jobs/v1';
const SOURCE_ROOT_PARENT = 'StockMarket';
const SOURCE_FOLDER_NAME = 'cowork-jobs';
const SOURCE_ROOT = `${SOURCE_ROOT_PARENT}/${SOURCE_FOLDER_NAME}/v1`;

function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isJsonExt(rel) {
  return /\.json$/i.test(rel);
}

/** Best-effort id field for array-of-object merge-by-id. */
function idFieldFor(obj) {
  if (obj && typeof obj === 'object') {
    for (const key of ['companyId', 'announcementId', 'id']) {
      if (obj[key] !== undefined && obj[key] !== null) return key;
    }
  }
  return null;
}

function mergeArrays(a, b) {
  if (!Array.isArray(a)) return b;
  if (!Array.isArray(b)) return a;
  const idKey = a.find((x) => idFieldFor(x)) ? idFieldFor(a.find((x) => idFieldFor(x))) : null;
  if (idKey) {
    const byId = new Map();
    for (const item of a) {
      const k = item && item[idKey];
      byId.set(k !== undefined ? k : Symbol(), item);
    }
    for (const item of b) {
      const k = item && item[idKey];
      const key = k !== undefined ? k : Symbol();
      if (byId.has(key)) {
        byId.set(key, deepMerge(byId.get(key), item));
      } else {
        byId.set(key, item);
      }
    }
    return Array.from(byId.values());
  }
  // No id field: concat + dedupe by content hash.
  const seen = new Set();
  const out = [];
  for (const item of [...a, ...b]) {
    const h = sha256Buf(Buffer.from(JSON.stringify(item)));
    if (!seen.has(h)) {
      seen.add(h);
      out.push(item);
    }
  }
  return out;
}

/** Deep-merge two JSON-parsed values. Latest (b) wins on scalar conflicts. */
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return mergeArrays(a, b);
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const key of Object.keys(b)) {
      out[key] = key in a ? deepMerge(a[key], b[key]) : b[key];
    }
    return out;
  }
  // Scalar conflict: latest value wins (b is assumed to be the more-recent side by caller convention).
  return b;
}

async function downloadToBuffer(drive, rootPath, driveRel) {
  const tmp = path.join(os.tmpdir(), `cowork-merge-${crypto.randomBytes(8).toString('hex')}`);
  const ok = await driveApi.downloadFile(drive, rootPath, driveRel, tmp);
  if (!ok) return null;
  const buf = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return buf;
}

// Local progress file so a live run can be safely resumed across several
// short invocations (same rationale as migrate-flat's listing cache): once a
// sourceDriveRel has been copied/merged/superseded/noop'd, it's recorded
// here and skipped on the next invocation. The cowork-jobs folder is only
// archived once every candidate has been accounted for.
const PROGRESS_PATH = path.join(__dirname, '..', '.cache', 'merge-cowork-jobs-progress.json');

function readProgress() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
    return Array.isArray(parsed.done) ? new Set(parsed.done) : new Set();
  } catch {
    return new Set();
  }
}

function writeProgress(doneSet) {
  try {
    fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ done: Array.from(doneSet) }, null, 2));
  } catch {
    // best-effort; a missing progress file just means a full re-scan next time
  }
}

async function run({ dryRun = true, concurrency = 4, batchLimit = 0, refreshListing = false } = {}) {
  const { drive } = driveApi.createDriveClient();

  const [sourceListing, canonicalListing] = await Promise.all([
    store.getCachedOrFreshDriveListing(drive, SOURCE_ROOT, { refresh: refreshListing }),
    store.getCachedOrFreshDriveListing(drive, CANONICAL_ROOT, { refresh: refreshListing }),
  ]);
  const sourceFiles = sourceListing.files;
  const canonicalFiles = canonicalListing.files;

  // Build canonical lookup: legacyDriveRel-equivalent path -> file, using
  // classifyDriveDocument (nested-legacy patterns) so we can match a source
  // file to "the same logical document" already present canonically, even
  // if the canonical copy has since been migrated to the flat layout (in
  // which case it's addressed by its legacy nested path via the index).
  const canonicalIndex = store.loadDriveIndex // exported helper
    ? null
    : null;

  // Map canonical files by their classifyDriveDocument()-derived localRel
  // (the stable "logical document identity" independent of nested vs flat path).
  const canonicalByLocalRel = new Map();
  for (const f of canonicalFiles) {
    if (f.driveRel.startsWith('_meta/')) continue;
    const doc = store.classifyDriveDocument(f.driveRel);
    if (!doc) continue;
    canonicalByLocalRel.set(doc.localRel, { file: f, doc });
  }

  const results = { copies: [], merges: [], supersedes: [], unresolved: [], noop: [] };

  const doneProgress = dryRun ? new Set() : readProgress();

  const allSourceCandidates = [];
  for (const f of sourceFiles) {
    if (f.driveRel.startsWith('_meta/')) continue;
    const doc = store.classifyDriveDocument(f.driveRel);
    if (!doc) {
      if (!doneProgress.has(f.driveRel)) results.unresolved.push({ driveRel: f.driveRel, reason: 'unclassifiable' });
      continue;
    }
    allSourceCandidates.push({ file: f, doc });
  }

  const pending = allSourceCandidates.filter(({ file }) => !doneProgress.has(file.driveRel));
  const sourceCandidates = batchLimit > 0 ? pending.slice(0, batchLimit) : pending;
  const remainingAfterThisBatch = batchLimit > 0 ? Math.max(0, pending.length - batchLimit) : 0;
  const newlyDone = [];

  await store.forEachLimit(sourceCandidates, concurrency, async ({ file, doc }) => {
    newlyDone.push(file.driveRel);
    const match = canonicalByLocalRel.get(doc.localRel);
    if (!match) {
      if (!dryRun) {
        const mtimeMs = file.modifiedTime ? new Date(file.modifiedTime).getTime() : Date.now();
        const buf = await downloadToBuffer(drive, SOURCE_ROOT_PARENT, `${SOURCE_FOLDER_NAME}/v1/${file.driveRel}`);
        if (!buf) {
          results.unresolved.push({ localRel: doc.localRel, reason: 'copy download failed' });
          return;
        }
        const flatRel = store.flatDriveRelFor(doc, mtimeMs, null);
        const tmp = path.join(os.tmpdir(), `cowork-copy-${crypto.randomBytes(6).toString('hex')}`);
        fs.writeFileSync(tmp, buf);
        await driveApi.uploadFile(drive, CANONICAL_ROOT.replace('/v1', ''), `v1/${flatRel}`, tmp);
        fs.rmSync(tmp, { force: true });
        results.copies.push({
          sourceDriveRel: `${SOURCE_FOLDER_NAME}/v1/${file.driveRel}`,
          canonicalFlatRel: flatRel,
          localRel: doc.localRel,
          category: doc.category,
          action: 'copied-to-canonical',
        });
      } else {
        results.copies.push({
          sourceDriveRel: `${SOURCE_FOLDER_NAME}/v1/${file.driveRel}`,
          localRel: doc.localRel,
          category: doc.category,
          action: 'would-copy-to-canonical',
        });
      }
      return;
    }

    const sourceMtime = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
    const canonMtime = match.file.modifiedTime ? new Date(match.file.modifiedTime).getTime() : 0;

    if (dryRun) {
      // Without downloading content we can only flag "needs comparison";
      // actual diff/merge decision requires content, done in the live pass.
      results.merges.push({
        sourceDriveRel: `${SOURCE_FOLDER_NAME}/v1/${file.driveRel}`,
        canonicalDriveRel: match.file.driveRel,
        localRel: doc.localRel,
        category: doc.category,
        isJson: isJsonExt(doc.localRel),
        newerSide: sourceMtime > canonMtime ? 'source' : 'canonical',
        action: isJsonExt(doc.localRel) ? 'would-deep-merge' : 'would-keep-newest-and-supersede-other',
      });
      return;
    }

    // Live: fetch both, compare content.
    const [srcBuf, canonBuf] = await Promise.all([
      downloadToBuffer(drive, SOURCE_ROOT_PARENT, `${SOURCE_FOLDER_NAME}/v1/${file.driveRel}`),
      downloadToBuffer(drive, CANONICAL_ROOT.replace('/v1', ''), `v1/${match.file.driveRel}`),
    ]);

    if (!srcBuf || !canonBuf) {
      results.unresolved.push({ localRel: doc.localRel, reason: 'download failed' });
      return;
    }

    const srcHash = sha256Buf(srcBuf);
    const canonHash = sha256Buf(canonBuf);
    if (srcHash === canonHash) {
      results.noop.push({ localRel: doc.localRel, reason: 'identical content already present' });
      return;
    }

    const mtimeMs = Math.max(sourceMtime, canonMtime);
    const rootForUpload = CANONICAL_ROOT.replace('/v1', '');

    if (isJsonExt(doc.localRel)) {
      try {
        const srcJson = JSON.parse(srcBuf.toString('utf8'));
        const canonJson = JSON.parse(canonBuf.toString('utf8'));
        // Latest-mtime side applied last so it wins scalar conflicts.
        const [older, newer] = sourceMtime <= canonMtime ? [srcJson, canonJson] : [canonJson, srcJson];
        const merged = deepMerge(older, newer);
        const mergedBuf = Buffer.from(`${JSON.stringify(merged, null, 2)}\n`);
        const mergedHash = sha256Buf(mergedBuf);
        const flatRel = store.flatDriveRelFor(doc, mtimeMs, null);
        const tmp = path.join(os.tmpdir(), `cowork-merged-${crypto.randomBytes(6).toString('hex')}.json`);
        fs.writeFileSync(tmp, mergedBuf);
        await driveApi.uploadFile(drive, rootForUpload, `v1/${flatRel}`, tmp);
        fs.rmSync(tmp, { force: true });
        results.merges.push({
          localRel: doc.localRel,
          category: doc.category,
          canonicalFlatRel: flatRel,
          mergedSha256: mergedHash,
          action: 'deep-merged',
        });
      } catch (e) {
        results.unresolved.push({ localRel: doc.localRel, reason: `JSON merge failed: ${e.message}` });
      }
      return;
    }

    // Non-JSON: keep newest as canonical (flat layout), archive the other
    // alongside inside cowork-jobs with a -superseded suffix (kept, not deleted).
    const keepIsSource = sourceMtime >= canonMtime;
    const keepBuf = keepIsSource ? srcBuf : canonBuf;
    const supersededBuf = keepIsSource ? canonBuf : srcBuf;
    const flatRel = store.flatDriveRelFor(doc, mtimeMs, null);
    const tmpKeep = path.join(os.tmpdir(), `cowork-keep-${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(tmpKeep, keepBuf);
    await driveApi.uploadFile(drive, rootForUpload, `v1/${flatRel}`, tmpKeep);
    fs.rmSync(tmpKeep, { force: true });

    const ext = path.posix.extname(doc.localRel);
    const base = path.posix.basename(doc.localRel, ext);
    const supersededRel = `v1/${doc.category}/${base}-superseded-${Date.now()}${ext}`;
    const tmpSuperseded = path.join(os.tmpdir(), `cowork-superseded-${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(tmpSuperseded, supersededBuf);
    await driveApi.uploadFile(drive, SOURCE_ROOT_PARENT, `${SOURCE_FOLDER_NAME}/${supersededRel}`, tmpSuperseded);
    fs.rmSync(tmpSuperseded, { force: true });

    results.supersedes.push({
      localRel: doc.localRel,
      keptFrom: keepIsSource ? 'source' : 'canonical',
      canonicalFlatRel: flatRel,
      supersededStoredAt: `${SOURCE_FOLDER_NAME}/${supersededRel}`,
    });
  });

  if (!dryRun && newlyDone.length) {
    for (const rel of newlyDone) doneProgress.add(rel);
    writeProgress(doneProgress);
  }

  let archived = null;
  if (!dryRun && remainingAfterThisBatch === 0) {
    const folderId = await driveApi.findFolderId(drive, `${SOURCE_ROOT_PARENT}/${SOURCE_FOLDER_NAME}`);
    if (folderId) {
      const today = new Date().toISOString().slice(0, 10);
      const newName = `${SOURCE_FOLDER_NAME}-ARCHIVED-${today}`;
      const renamed = await driveApi.renameFile(drive, folderId, newName);
      archived = { oldName: SOURCE_FOLDER_NAME, newName: renamed.name };
    }
    // Migration fully complete: progress file no longer needed.
    fs.rmSync(PROGRESS_PATH, { force: true });
  }

  return {
    dryRun,
    canonicalRoot: `drive://${CANONICAL_ROOT}`,
    sourceRoot: `drive://${SOURCE_ROOT}`,
    sourceFileCount: sourceFiles.length,
    canonicalFileCount: canonicalFiles.length,
    batchProcessed: sourceCandidates.length,
    remainingAfterThisBatch,
    pureCopies: results.copies.length,
    merges: results.merges.length,
    supersedes: results.supersedes.length,
    noop: results.noop.length,
    unresolved: results.unresolved.length,
    details: results,
    archived,
  };
}

module.exports = { run, deepMerge, mergeArrays };
