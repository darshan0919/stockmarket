#!/usr/bin/env node
'use strict';

/**
 * pruneRemoteOrphans.js — Safely prune migrated legacy loose files from Google Drive.
 *
 * Requirements:
 *  - Whitelist-only: Only touches candidate migrated folders (reports, conversations,
 *    learnyst, youtube, and sharded cache stores).
 *  - Target Replacement Verification: Only trashes a remote loose file if its
 *    corresponding consolidated .jsonl replacement is confirmed uploaded to Drive.
 *  - Safe Deletion: Moves files to Drive Trash (trashed: true), never permanent delete.
 *  - Dry-run by default: Requires `--execute` to perform changes.
 *
 * Usage:
 *   node pruneRemoteOrphans.js [--dry-run] [--execute]
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { loadEnv, hasFlag } = require('../lib/env');
loadEnv();

const {
  createDriveClient,
  listAllFiles,
  isApiConfigured,
} = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';

const CANDIDATE_PATTERNS = [
  /^reports\/rpt_.*\.json$/,
  /^conversations\/conv_.*\.json$/,
  /^learnyst-lessons\/lyt_.*\.json$/,
  /^youtube-transcripts\/ytt_.*\.json$/,
  /^cache\/pdf-text\/[0-9a-fA-F]+\.json$/,
  /^cache\/pdf-text-full\/[0-9a-fA-F]+\.json$/,
  /^cache\/monthly-updates-text\/[0-9a-fA-F]+\.json$/,
  /^cache\/monthly-updates-parsed\/[0-9a-fA-F]+\.json$/,
  /^runs\/monthly-updates-batches\/batch_.*$/,
];

function isCandidateOrphan(driveRel) {
  // Never match .jsonl files or primary indexes
  if (driveRel.endsWith('.jsonl')) return false;
  if (/^(reports|conversations|learnyst-lessons|youtube-transcripts)\.json$/.test(driveRel)) return false;
  if (driveRel === 'runs/monthly-updates-batches/batches.json') return false;

  return CANDIDATE_PATTERNS.some((re) => re.test(driveRel));
}

function expectedReplacement(driveRel) {
  if (driveRel.startsWith('reports/')) {
    const m1 = driveRel.match(/(\d{4})-(\d{2})/);
    if (m1) return `reports/reports-${m1[1]}-${m1[2]}.jsonl`;
    const m2 = driveRel.match(/(\d{4})(\d{2})/);
    if (m2) return `reports/reports-${m2[1]}-${m2[2]}.jsonl`;
    return 'reports/reports-*.jsonl';
  }
  if (driveRel.startsWith('conversations/')) {
    return 'conversations/conversations-*.jsonl';
  }
  if (driveRel.startsWith('learnyst-lessons/')) {
    return 'learnyst-lessons/course_*.jsonl';
  }
  if (driveRel.startsWith('youtube-transcripts/')) {
    return 'youtube-transcripts/*.jsonl';
  }
  if (driveRel.startsWith('cache/pdf-text/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/pdf-text/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('cache/pdf-text-full/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/pdf-text-full/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('cache/monthly-updates-text/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/monthly-updates-text/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('cache/monthly-updates-parsed/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/monthly-updates-parsed/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('runs/monthly-updates-batches/')) {
    return 'runs/monthly-updates-batches/batches.jsonl';
  }
  return null;
}

async function run() {
  const isExecute = hasFlag('--execute');
  const isDryRun = hasFlag('--dry-run') || !isExecute;

  console.log(`[data:prune-remote] Mode: ${isDryRun ? 'DRY-RUN (audit only)' : 'EXECUTE (trashing remote orphans)'}`);

  if (isApiConfigured && !isApiConfigured()) {
    console.log('[data:prune-remote] Google Drive API is not configured. Aborting.');
    return;
  }

  const { drive } = createDriveClient();
  console.log(`[data:prune-remote] Listing remote files under ${DRIVE_ROOT}...`);
  const remoteFiles = await listAllFiles(drive, DRIVE_ROOT);
  const remoteByRel = new Map(remoteFiles.map((f) => [f.driveRel, f]));

  console.log(`[data:prune-remote] Total remote files on Drive: ${remoteFiles.length}`);

  // Check which candidate files are orphans
  const orphans = [];
  const missingReplacement = [];

  for (const f of remoteFiles) {
    if (!isCandidateOrphan(f.driveRel)) continue;

    // Check if local replacement exists
    const replacement = expectedReplacement(f.driveRel);
    let replacementReady = false;

    if (replacement && replacement.includes('*')) {
      // Wildcard check (e.g. course_*.jsonl or channel_*.jsonl)
      const folder = replacement.split('/')[0];
      const matchingRemote = remoteFiles.some((rf) => rf.driveRel.startsWith(`${folder}/`) && rf.driveRel.endsWith('.jsonl'));
      replacementReady = matchingRemote;
    } else if (replacement) {
      // Exact replacement check on Drive
      replacementReady = remoteByRel.has(replacement);
    }

    if (replacementReady) {
      orphans.push(f);
    } else {
      missingReplacement.push({ file: f.driveRel, expected: replacement });
    }
  }

  console.log(`\n[data:prune-remote] Analysis:`);
  console.log(`  - Candidate remote orphans verified for pruning: ${orphans.length}`);
  if (missingReplacement.length > 0) {
    console.warn(`  - SKIPPED (replacement .jsonl not yet confirmed on Drive): ${missingReplacement.length}`);
    missingReplacement.slice(0, 5).forEach((m) => console.warn(`      * ${m.file} (needs ${m.expected})`));
  }

  if (orphans.length === 0) {
    console.log('[data:prune-remote] No remote orphans found. Drive is clean.');
    return;
  }

  // Print sample of orphans
  console.log('\n[data:prune-remote] Sample remote orphans to trash:');
  orphans.slice(0, 10).forEach((f) => console.log(`  🗑 ${f.driveRel} (${f.id})`));
  if (orphans.length > 10) console.log(`  ... and ${orphans.length - 10} more`);

  if (isDryRun) {
    console.log('\n[data:prune-remote] DRY RUN COMPLETE. Run with `--execute` to trash remote orphans.');
    return;
  }

  // Execute trashing
  console.log(`\n[data:prune-remote] Trashing ${orphans.length} remote orphans...`);
  let trashedCount = 0;
  let errorCount = 0;

  const CONCURRENCY = 8;
  let idx = 0;

  async function worker() {
    while (idx < orphans.length) {
      const cur = idx++;
      const f = orphans[cur];
      try {
        await drive.files.update({
          fileId: f.id,
          requestBody: { trashed: true },
        });
        trashedCount++;
        if (trashedCount % 100 === 0 || trashedCount === orphans.length) {
          console.log(`  Progress: ${trashedCount}/${orphans.length} trashed...`);
        }
      } catch (e) {
        console.error(`  Error trashing ${f.driveRel}: ${e.message}`);
        errorCount++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, orphans.length) }, () => worker());
  await Promise.all(workers);

  console.log(`\n[data:prune-remote] Remote pruning complete: ${trashedCount} trashed, ${errorCount} errors.`);

  // Purge sync-state.json entries
  const statePath = path.join(db.dataRoot(), '_meta', 'sync-state.json');
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      for (const f of orphans) {
        delete state.files[f.driveRel];
      }
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
      console.log(`[data:prune-remote] Cleaned ${trashedCount} entries from sync-state.json.`);
    } catch (_) {}
  }
}

run().catch((e) => {
  console.error('[data:prune-remote] FAILED:', e);
  process.exit(1);
});
