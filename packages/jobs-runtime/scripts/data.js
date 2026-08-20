#!/usr/bin/env node
'use strict';

/**
 * data.js — idempotent two-way sync between local data/ and Drive
 * `StockMarket/data/v2` (env DATA_V2_DRIVE_ROOT to override).
 * Replaces offloadToDrive.js for the v2 ecosystem (docs/DATA_ECOSYSTEM.md §5).
 *
 *   node data.js push [--dry-run]   # upload changed files; prune assets/ + runs/ locally after confirm
 *   node data.js pull [--dry-run]   # hydrate/refresh local mirror from Drive
 *   node data.js status             # what would change, incl. conflicts
 *
 * No-duplicate guarantees:
 *  - uploadFile() updates the existing Drive fileId when the name exists (never
 *    creates "name (1)" copies).
 *  - _meta/sync-state.json keeps per-file sha256 + driveId + syncedAt; unchanged
 *    files are skipped entirely (double-push / double-pull are no-ops).
 *  - When BOTH sides changed since last sync, id-keyed collections are merged
 *    record-by-record (newest modifiedTime per record wins; ties → lexically
 *    larger record hash). Non-mergeable files: local wins on push, Drive wins on
 *    pull, and the overwritten side is first checkpointed — never silent-dropped.
 *
 * Lifecycle (docs/DATA_ECOSYSTEM.md §5): EVERYTHING under data/ is pushed and
 * KEPT locally (full local mirror — nothing is deleted after upload), and pull
 * hydrates everything including cache/, assets/ and runs/.
 * Only .locks/, _meta/, *.tmp.*, *.corrupt.* are never synced.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { loadEnv, hasFlag } = require('../lib/env');
loadEnv();
const db = require('../lib/db');
const {
  createDriveClient,
  uploadFile,
  downloadFile,
  listAllFiles,
  isApiConfigured,
} = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const NEVER_SYNC = (rel) =>
  rel.startsWith('.locks/') ||
  rel.startsWith('_meta/') ||
  rel.includes('.tmp.') ||
  rel.includes('.corrupt.') ||
  path.basename(rel) === '.env' ||
  path.basename(rel) === '.DS_Store' ||
  // local backup/scratch files must never mirror to Drive
  /(backup|\.bak|\.orig)$/i.test(rel) ||
  // artifact records store their body in assets/, never as a reports/ body —
  // any reports/rpt_artifact-migration_*.json is an orphan (do not sync)
  /^reports\/rpt_artifact-migration_.*\.json$/.test(rel);
const IS_COLLECTION = (rel) =>
  /^(companies|reports|notes|theses|validation|conversations|prompts|ipos|supportive-investors|unsupportive-investors|learnyst-lessons|events-\d{4}-\d{2})\.json$/.test(
    rel
  );

// ── sync-state ───────────────────────────────────────────────────────────────

const statePath = () => path.join(db.dataRoot(), '_meta', 'sync-state.json');
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (_) {
    return { files: {} };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  db.writeFileAtomic(statePath(), state);
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

// ── reporting helpers ────────────────────────────────────────────────────────
// "skipped" is the expected steady-state outcome (file already matches last
// sync) — not a failure. These helpers turn the flat counters into a
// folder-level breakdown so a run is easy to sanity-check at a glance.

/** rel path -> top-level bucket, e.g. "learnyst-lessons/x.json" -> "learnyst-lessons/" */
function bucketOf(rel) {
  const slash = rel.indexOf('/');
  return slash === -1 ? rel : `${rel.slice(0, slash)}/`;
}

function tally(rels) {
  const byBucket = {};
  for (const rel of rels) {
    const b = bucketOf(rel);
    byBucket[b] = (byBucket[b] || 0) + 1;
  }
  return byBucket;
}

function printBreakdown(label, rels, sample = 5) {
  if (!rels.length) return;
  const byBucket = tally(rels);
  const lines = Object.entries(byBucket)
    .sort((a, b) => b[1] - a[1])
    .map(([b, n]) => `${b} (${n})`);
  console.log(`[data ${label}] by folder: ${lines.join(', ')}`);
  rels.slice(0, sample).forEach((r) => console.log(`  ${label === 'push' ? '↑' : '↓'} ${r}`));
  if (rels.length > sample) console.log(`  … and ${rels.length - sample} more`);
}

function walkLocal() {
  const root = db.dataRoot();
  const out = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) visit(abs);
      else out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  };
  visit(root);
  return out.filter((rel) => !NEVER_SYNC(rel));
}

// ── record-level merge for collections ───────────────────────────────────────

const recHash = (r) => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex');

function mergeCollections(a, b) {
  const out = { ...a };
  let changed = false;
  for (const [id, rb] of Object.entries(b)) {
    const ra = out[id];
    if (!ra) {
      out[id] = rb;
      changed = true;
      continue;
    }
    const ta = String(ra.modifiedTime || '');
    const tb = String(rb.modifiedTime || '');
    let winner = ra;
    if (tb > ta) winner = rb;
    else if (tb === ta && recHash(rb) > recHash(ra)) winner = rb; // deterministic tie-break
    if (winner !== ra) {
      out[id] = winner;
      changed = true;
    }
  }
  return { merged: out, changed };
}

/** Pull Drive copy of a collection, merge with local, write local. Returns true if local changed. */
async function mergeFromDrive(drive, rel) {
  const tmp = path.join(os.tmpdir(), `v2merge-${Date.now()}-${path.basename(rel)}`);
  const ok = await downloadFile(drive, DRIVE_ROOT, rel, tmp);
  if (!ok) return false;
  let remote;
  try {
    remote = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const local = db.loadFile(path.join(db.dataRoot(), rel));
  const { merged, changed } = mergeCollections(local, remote);
  if (changed) {
    db.withLock(path.basename(rel, '.json'), () => {
      db.writeFileAtomic(path.join(db.dataRoot(), rel), merged);
    });
  }
  return changed;
}

// ── commands ─────────────────────────────────────────────────────────────────

async function push({ dryRun }) {
  const state = loadState();
  const { drive } = createDriveClient();
  const locals = walkLocal();
  const root = db.dataRoot();

  // Drive-side listing once, to detect remote drift for conflict handling.
  const remote = new Map((await listAllFiles(drive, DRIVE_ROOT)).map((f) => [f.driveRel, f]));

  let uploaded = 0,
    skipped = 0,
    merged = 0;
  const errors = [];
  const uploadedRels = [];
  const mergedRels = [];
  const skippedAlreadyOnDrive = []; // adopted-not-reuploaded (interrupted-push recovery)

  for (const rel of locals) {
    const abs = path.join(root, rel);
    const hash = sha256(abs);
    const st = state.files[rel];
    const remoteEntry = remote.get(rel);
    const remoteDrifted =
      remoteEntry &&
      st &&
      st.driveModifiedTime &&
      remoteEntry.modifiedTime !== st.driveModifiedTime;

    if (st && st.sha256 === hash && !remoteDrifted) {
      skipped++;
      continue;
    }

    // Already on Drive with identical content (e.g. interrupted previous push):
    // adopt into sync-state instead of re-uploading. Keeps re-runs convergent.
    if (remoteEntry && remoteEntry.md5 && remoteEntry.md5 === md5(abs) && !remoteDrifted) {
      state.files[rel] = {
        sha256: hash,
        driveId: remoteEntry.id,
        driveModifiedTime: remoteEntry.modifiedTime,
        syncedAt: new Date().toISOString(),
      };
      if (!dryRun) saveState(state);
      skipped++;
      skippedAlreadyOnDrive.push(rel);
      continue;
    }

    try {
      if (IS_COLLECTION(rel) && remoteDrifted) {
        // Both sides may have changed → merge before uploading (no data loss).
        if (!dryRun && (await mergeFromDrive(drive, rel))) {
          merged++;
          mergedRels.push(rel);
        }
      }
      if (dryRun) {
        uploaded++;
        uploadedRels.push(rel);
        continue;
      }
      const res = await uploadFile(drive, DRIVE_ROOT, rel, abs);
      state.files[rel] = {
        sha256: sha256(abs),
        driveId: res.id,
        // driveModifiedTime refreshed in the single post-push listing below
        syncedAt: new Date().toISOString(),
      };
      uploaded++;
      uploadedRels.push(rel);
      if (!dryRun) saveState(state); // incremental — interrupted pushes resume, never re-upload
    } catch (e) {
      errors.push(`${rel}: ${e.message}`);
    }
  }

  // Refresh driveModifiedTime in one listing (needed for future drift detection).
  if (!dryRun && uploaded) {
    const fresh = new Map((await listAllFiles(drive, DRIVE_ROOT)).map((f) => [f.driveRel, f]));
    for (const [rel, entry] of Object.entries(state.files)) {
      const f = fresh.get(rel);
      if (f) {
        entry.driveModifiedTime = f.modifiedTime;
        entry.driveId = f.id;
      }
    }
    saveState(state);
  }

  const alreadySynced = skipped - skippedAlreadyOnDrive.length;
  console.log(
    `[data push] uploaded=${uploaded} merged=${merged} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`
  );
  console.log(
    `[data push]   of ${skipped} skipped: ${alreadySynced} unchanged since last sync, ` +
      `${skippedAlreadyOnDrive.length} already present on Drive with identical content (adopted, not re-uploaded)`
  );
  printBreakdown('push', uploadedRels);
  if (mergedRels.length) {
    console.log(`[data push] merged collections (both sides changed): ${mergedRels.join(', ')}`);
  }
  if (uploaded === 0 && merged === 0) {
    console.log(
      '[data push] nothing to upload — every local file already matched the last-known Drive state. ' +
        'This is expected on a re-run right after a clean sync; it is not a failure.'
    );
  }
  if (errors.length) {
    console.error(`[data push] ${errors.length} error(s) — NOT pruning those files:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

async function pull({ dryRun }) {
  const state = loadState();
  const { drive } = createDriveClient();
  const root = db.dataRoot();
  const remote = await listAllFiles(drive, DRIVE_ROOT);
  let downloaded = 0,
    mergedN = 0,
    skipped = 0;
  const downloadedRels = [];
  const mergedRels = [];
  const conflictRels = [];

  for (const f of remote) {
    const rel = f.driveRel;
    if (NEVER_SYNC(rel)) continue;
    const abs = path.join(root, rel);
    const st = state.files[rel];
    const localExists = fs.existsSync(abs);
    const localChanged = localExists && (!st || sha256(abs) !== st.sha256);
    const remoteChanged = !st || st.driveModifiedTime !== f.modifiedTime;

    if (localExists && !remoteChanged) {
      skipped++;
      continue;
    }
    if (dryRun) {
      downloaded++;
      continue;
    }

    if (IS_COLLECTION(rel) && localChanged) {
      if (await mergeFromDrive(drive, rel)) {
        mergedN++;
        mergedRels.push(rel);
      }
    } else {
      if (localChanged && localExists) {
        // Non-mergeable conflict: keep the local version as evidence, Drive wins.
        fs.copyFileSync(abs, `${abs}.local-conflict.${Date.now()}`);
        conflictRels.push(rel);
        console.error(
          `[data pull] CONFLICT (non-collection): ${rel} — local copy saved as *.local-conflict.*`
        );
      }
      await downloadFile(drive, DRIVE_ROOT, rel, abs);
      downloaded++;
      downloadedRels.push(rel);
    }
    state.files[rel] = {
      sha256: sha256(abs),
      driveId: f.id,
      driveModifiedTime: f.modifiedTime,
      syncedAt: new Date().toISOString(),
    };
  }

  if (!dryRun) saveState(state);
  console.log(
    `[data pull] downloaded=${downloaded} merged=${mergedN} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`
  );
  printBreakdown('pull', downloadedRels);
  if (mergedRels.length) {
    console.log(`[data pull] merged collections (both sides changed): ${mergedRels.join(', ')}`);
  }
  if (conflictRels.length) {
    console.log(
      `[data pull] ${conflictRels.length} non-collection conflict(s), Drive won, local saved as *.local-conflict.*: ${conflictRels.join(', ')}`
    );
  }
  if (downloaded === 0 && mergedN === 0) {
    console.log(
      `[data pull] nothing new — all ${skipped} Drive-tracked files already matched local state. ` +
        'This is expected right after a push from this same machine; it is not a failure.'
    );
  }
}

async function status() {
  const state = loadState();
  const root = db.dataRoot();
  const locals = walkLocal();
  const localChanged = locals.filter((rel) => {
    const st = state.files[rel];
    return !st || sha256(path.join(root, rel)) !== st.sha256;
  });
  console.log(
    `[data status] local files: ${locals.length}; changed since last sync: ${localChanged.length}`
  );
  localChanged.slice(0, 50).forEach((r) => console.log(`  ~ ${r}`));
  if (isApiConfigured && !isApiConfigured()) {
    console.log('[data status] Drive API not configured — remote comparison skipped.');
    return;
  }
  try {
    const { drive } = createDriveClient();
    const remote = await listAllFiles(drive, DRIVE_ROOT);
    const remoteDrift = remote.filter((f) => {
      const st = state.files[f.driveRel];
      return st && st.driveModifiedTime && st.driveModifiedTime !== f.modifiedTime;
    });
    const remoteOnly = remote.filter((f) => !state.files[f.driveRel] && !NEVER_SYNC(f.driveRel));
    console.log(
      `[data status] remote files: ${remote.length}; drifted: ${remoteDrift.length}; not-yet-pulled: ${remoteOnly.length}`
    );
    remoteDrift.slice(0, 20).forEach((f) => console.log(`  ! ${f.driveRel} (changed on Drive)`));
    remoteOnly.slice(0, 20).forEach((f) => console.log(`  + ${f.driveRel}`));
  } catch (e) {
    console.log(`[data status] Drive unreachable: ${e.message}`);
  }
}

(async () => {
  const cmd = process.argv[2];
  const opts = { dryRun: hasFlag('--dry-run') };
  try {
    if (cmd === 'push') await push(opts);
    else if (cmd === 'pull') await pull(opts);
    else if (cmd === 'status') await status();
    else {
      console.log('Usage: node data.js <push|pull|status> [--dry-run]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`[data ${cmd}] FAILED:`, e.message);
    process.exit(1);
  }
})();
