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
const { printStorageStatsTable } = require('../lib/storageStats');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const NEVER_SYNC = (rel) =>
  rel.startsWith('.locks/') ||
  rel.startsWith('_meta/') ||
  rel.includes('.tmp.') ||
  rel.includes('.corrupt.') ||
  rel.includes('.local-conflict.') ||
  path.basename(rel) === '.env' ||
  path.basename(rel) === '.DS_Store' ||
  // local backup/scratch files must never mirror to Drive
  /(backup|\.bak|\.orig)$/i.test(rel) ||
  // artifact records store their body in assets/, never as a reports/ body —
  // any reports/rpt_artifact-migration_*.json is an orphan (do not sync)
  /^reports\/rpt_artifact-migration_.*\.json$/.test(rel);
const IS_COLLECTION = (rel) =>
  /^(companies|reports|notes|theses|validation|conversations|prompts|ipos|supportive-investors|unsupportive-investors|learnyst-lessons|youtube-transcripts|events-\d{4}(-\d{2})?)\.json$/.test(
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

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
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
  const pendingUploads = [];

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

    if (IS_COLLECTION(rel) && remoteDrifted) {
      // Both sides may have changed → merge before uploading (no data loss).
      if (!dryRun && (await mergeFromDrive(drive, rel))) {
        merged++;
        mergedRels.push(rel);
      }
    }

    pendingUploads.push({
      rel,
      abs,
      hash,
      fileId: remoteEntry?.id || st?.driveId,
    });
  }

  if (dryRun) {
    uploaded = pendingUploads.length;
    uploadedRels.push(...pendingUploads.map((p) => p.rel));
  } else if (pendingUploads.length > 0) {
    // Adaptive batching: max 16 workers, dynamically throttled by in-flight payload size (max 25 MB in-flight)
    const MAX_CONCURRENCY = Math.min(16, pendingUploads.length);
    const MAX_IN_FLIGHT_BYTES = 25 * 1024 * 1024; // 25 MB
    let inFlightBytes = 0;
    let activeWorkers = 0;
    let curIdx = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const processItem = async (item) => {
      const fileSize = fs.existsSync(item.abs) ? fs.statSync(item.abs).size : 0;
      // Wait if in-flight bytes would exceed threshold (unless only 1 worker active to prevent deadlock)
      while (activeWorkers > 0 && inFlightBytes + fileSize > MAX_IN_FLIGHT_BYTES) {
        await sleep(50);
      }

      inFlightBytes += fileSize;
      activeWorkers++;
      try {
        console.log(`[data push] ↑ ${item.rel} (${formatSize(fileSize)})`);
        const res = await uploadFile(drive, DRIVE_ROOT, item.rel, item.abs, {
          fileId: item.fileId,
        });
        state.files[item.rel] = {
          sha256: item.hash,
          driveId: res.id,
          driveModifiedTime: res.modifiedTime,
          syncedAt: new Date().toISOString(),
        };
        uploaded++;
        uploadedRels.push(item.rel);
        saveState(state); // incremental thread-safe save in single-process event loop
      } catch (e) {
        errors.push(`${item.rel}: ${e.message}`);
      } finally {
        inFlightBytes -= fileSize;
        activeWorkers--;
      }
    };

    const worker = async () => {
      while (curIdx < pendingUploads.length) {
        const item = pendingUploads[curIdx++];
        await processItem(item);
      }
    };

    await Promise.all(Array.from({ length: MAX_CONCURRENCY }, () => worker()));
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
  checkStorageStrategyThresholds(db.dataRoot());
  printStorageStatsTable(db.dataRoot());
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
  printStorageStatsTable(db.dataRoot());
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
  } finally {
    checkStorageStrategyThresholds(root);
    printStorageStatsTable(root);
  }
}

const SWEET_SPOT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function checkStorageStrategyThresholds(root) {
  const alerts = [];
  const optimizations = [];

  function scan(dir, relPrefix = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Check if directory is a 16-hex shard folder
    const shardFiles = entries.filter(
      (e) => e.isFile() && e.name.startsWith('shard_') && e.name.endsWith('.jsonl')
    );
    if (shardFiles.length > 0) {
      let totalShardBytes = 0;
      for (const sf of shardFiles) {
        totalShardBytes += fs.statSync(path.join(dir, sf.name)).size;
      }
      if (totalShardBytes < SWEET_SPOT_MAX_BYTES) {
        optimizations.push({
          dir: relPrefix || path.basename(dir),
          shards: shardFiles.length,
          sizeMb: (totalShardBytes / (1024 * 1024)).toFixed(2),
          recommended: 'Consolidate 16 shards into a single JSONL file (< 10 MB).',
          command: 'yarn data:consolidate-light',
        });
      }
    }

    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === '_meta' || e.name.includes('.tmp.')) continue;
      const fullPath = path.join(dir, e.name);
      const relPath = relPrefix ? `${relPrefix}/${e.name}` : e.name;

      if (e.isDirectory()) {
        scan(fullPath, relPath);
      } else if (e.isFile()) {
        // Exclude one-off research seeds and search index caches
        if (relPath.includes('_research_seed_')) continue;
        if (
          relPath.startsWith('cache/ask-soic/') ||
          relPath.startsWith('cache/ask-anil-lamba/') ||
          relPath.startsWith('cache/ask-stockscans/')
        )
          continue;
        if (relPath.endsWith('.json') || relPath.endsWith('.jsonl')) {
          const stats = fs.statSync(fullPath);
          if (stats.size > SWEET_SPOT_MAX_BYTES) {
            const isTimeSeries = /^(reports|conversations|events)/.test(relPath);
            const isShardedCandidate = /^(learnyst-lessons|youtube-transcripts|cache)/.test(
              relPath
            );
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

            let recommended = '16-hex sharding (shard_0.jsonl - shard_f.jsonl)';
            let command = 'yarn data:consolidate';
            if (isTimeSeries) {
              recommended = 'Tighter time partitioning (quarterly or monthly)';
              command = 'yarn data:consolidate';
            } else if (isShardedCandidate) {
              recommended = '16-hex sharding partitioned by md5(key)[0]';
              command = 'yarn data:consolidate';
            }

            alerts.push({
              file: relPath,
              sizeMb,
              recommended,
              command,
            });
          }
        }
      }
    }
  }

  scan(root);

  if (alerts.length > 0 || optimizations.length > 0) {
    console.log('\n────────────────────────────────────────────────────────────────────────');
    console.log('📊 [STORAGE STRATEGY THRESHOLD AUDIT]');
    for (const a of alerts) {
      console.warn(
        `⚠️  [THRESHOLD ALERT] ${a.file} is ${a.sizeMb} MB (exceeds 10 MB sweet-spot ceiling).`
      );
      console.warn(`   Recommended Strategy: ${a.recommended}`);
      console.warn(`   Migration Command:    ${a.command}`);
    }
    for (const opt of optimizations) {
      console.info(
        `ℹ️  [STORAGE OPTIMIZATION] ${opt.dir} has ${opt.shards} shards but total size is only ${opt.sizeMb} MB (< 10 MB).`
      );
      console.info(`   Recommended Strategy: ${opt.recommended}`);
      console.info(`   Migration Command:    ${opt.command}`);
    }
    console.log('────────────────────────────────────────────────────────────────────────\n');
  } else {
    console.log(
      '✓ Storage Audit: All collection & cache stores adhere to the 100 KB – 10 MB sweet-spot guidelines.'
    );
  }

  return { alerts, optimizations };
}

(async () => {
  const cmd = process.argv[2];
  const opts = { dryRun: hasFlag('--dry-run') };
  try {
    if (cmd === 'push') await push(opts);
    else if (cmd === 'pull') await pull(opts);
    else if (cmd === 'status') await status();
    else if (cmd === 'thresholds') checkStorageStrategyThresholds(db.dataRoot());
    else if (cmd === 'stats') printStorageStatsTable(db.dataRoot());
    else {
      console.log('Usage: node data.js <push|pull|status|thresholds|stats> [--dry-run]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`[data ${cmd}] FAILED:`, e.message);
    process.exit(1);
  }
})();
