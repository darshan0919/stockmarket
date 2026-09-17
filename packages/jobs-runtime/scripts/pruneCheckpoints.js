#!/usr/bin/env node
'use strict';

/**
 * pruneCheckpoints.js — Maintenance script to clean up old collection checkpoints.
 *
 * Scans `data/_meta/checkpoints/`, groups checkpoints by collection, keeps the
 * latest N snapshots (default 1) per collection, and deletes all older files.
 * Also cleans stray *.corrupt.* and *.tmp.* leftovers from data/.
 *
 * Usage:
 *   yarn data:prune-checkpoints [--keep 1] [--dry-run]
 *   node packages/jobs-runtime/scripts/pruneCheckpoints.js [--keep 1] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { hasFlag, argValue } = require('../lib/env');

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function pruneCheckpoints() {
  const isDryRun = hasFlag('--dry-run');
  const keepCount = Math.max(1, parseInt(argValue('--keep') || '1', 10));

  const root = db.dataRoot();
  const cpDir = path.join(root, '_meta', 'checkpoints');

  console.log(`[prune-checkpoints] Target directory: ${cpDir}`);
  console.log(`[prune-checkpoints] Keeping latest ${keepCount} snapshot(s) per collection`);
  if (isDryRun) console.log(`[prune-checkpoints] DRY RUN enabled — no files will be deleted`);

  let totalDeletedFiles = 0;
  let totalBytesFreed = 0;

  if (fs.existsSync(cpDir)) {
    const allFiles = fs.readdirSync(cpDir);
    const byCollection = new Map();

    for (const f of allFiles) {
      if (!f.endsWith('.json')) continue;
      const m = f.match(/^(.+)\.(\d+)\.json$/);
      if (!m) continue;
      const col = m[1];
      const ts = Number(m[2]);
      if (!byCollection.has(col)) byCollection.set(col, []);
      byCollection.get(col).push({ filename: f, timestamp: ts });
    }

    console.log(
      `\nFound ${allFiles.length} checkpoint file(s) across ${byCollection.size} collection(s):\n`
    );

    for (const [col, list] of byCollection.entries()) {
      // Sort ascending by timestamp
      list.sort((a, b) => a.timestamp - b.timestamp);

      if (list.length <= keepCount) {
        console.log(`  - ${col}: ${list.length} file(s) (all kept)`);
        continue;
      }

      const toKeep = list.slice(-keepCount);
      const toDelete = list.slice(0, list.length - keepCount);

      let colFreed = 0;
      for (const item of toDelete) {
        const fullPath = path.join(cpDir, item.filename);
        try {
          const sz = fs.statSync(fullPath).size;
          colFreed += sz;
          totalBytesFreed += sz;
          totalDeletedFiles++;
          if (!isDryRun) {
            fs.unlinkSync(fullPath);
          }
        } catch (e) {
          console.error(`    [!] Error deleting ${item.filename}: ${e.message}`);
        }
      }

      console.log(
        `  - ${col}: pruned ${toDelete.length} old checkpoint(s) (${formatBytes(colFreed)}), kept ${toKeep.length} latest`
      );
    }
  } else {
    console.log(`[prune-checkpoints] Checkpoint directory does not exist: ${cpDir}`);
  }

  // Also sweep stray *.corrupt.* and *.tmp.* leftovers from data/
  try {
    const rootFiles = fs.readdirSync(root);
    const strayFiles = rootFiles.filter(
      (f) => f.includes('.corrupt.') || (f.includes('.tmp.') && !f.startsWith('.'))
    );
    if (strayFiles.length > 0) {
      console.log(`\nFound ${strayFiles.length} stray crash/temporary file(s) in ${root}:`);
      for (const sf of strayFiles) {
        const p = path.join(root, sf);
        try {
          const sz = fs.statSync(p).size;
          totalBytesFreed += sz;
          totalDeletedFiles++;
          if (!isDryRun) {
            fs.unlinkSync(p);
          }
          console.log(
            `  - ${isDryRun ? '[dry-run] would delete' : 'deleted'} ${sf} (${formatBytes(sz)})`
          );
        } catch (e) {
          console.error(`    [!] Error deleting ${sf}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error(`[!] Error scanning data root for strays: ${e.message}`);
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log(
    `[prune-checkpoints] Summary: ${isDryRun ? 'Would delete' : 'Deleted'} ${totalDeletedFiles} file(s), freeing ${formatBytes(totalBytesFreed)}.`
  );
  console.log('────────────────────────────────────────────────────────\n');
}

if (require.main === module) {
  pruneCheckpoints();
}

module.exports = { pruneCheckpoints };
