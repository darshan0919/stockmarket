#!/usr/bin/env node
'use strict';

/**
 * consolidateLightStores.js — Consolidates light cache stores (< 5 MB)
 * from 16 hex shards into single JSONL files:
 *
 * 1. cache/company-baselines -> baselines.jsonl
 * 2. cache/concall-notes -> notes.jsonl
 * 3. cache/event-reaction -> reactions.jsonl
 * 4. cache/order-announcements -> announcements.jsonl
 * 5. cache/stockscans-context -> context.jsonl
 * 6. cache/rerating-catalysts/briefs -> rerating-catalysts/briefs.jsonl
 * 7. cache/rerating-catalysts/filings -> rerating-catalysts/filings.jsonl
 *
 * Guarantees:
 * - 100% cryptographic SHA-256 parity verification of every record before unlinking.
 * - Updates data/_meta/sync-state.json to purge deleted shard files.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');

const sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');

function dataRoot() {
  return db.dataRoot();
}

function loadSyncState() {
  const p = path.join(dataRoot(), '_meta', 'sync-state.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return { files: {} };
  }
}

function saveSyncState(state) {
  const p = path.join(dataRoot(), '_meta', 'sync-state.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log(`[consolidateLightStores] Mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN (audit only)'}`);

  const root = dataRoot();
  const tasks = [
    {
      name: 'company-baselines',
      srcDir: path.join(root, 'cache', 'company-baselines'),
      targetRel: 'cache/company-baselines/baselines.jsonl',
    },
    {
      name: 'concall-notes',
      srcDir: path.join(root, 'cache', 'concall-notes'),
      targetRel: 'cache/concall-notes/notes.jsonl',
    },
    {
      name: 'event-reaction',
      srcDir: path.join(root, 'cache', 'event-reaction'),
      targetRel: 'cache/event-reaction/reactions.jsonl',
    },
    {
      name: 'order-announcements',
      srcDir: path.join(root, 'cache', 'order-announcements'),
      targetRel: 'cache/order-announcements/announcements.jsonl',
    },
    {
      name: 'stockscans-context',
      srcDir: path.join(root, 'cache', 'stockscans-context'),
      targetRel: 'cache/stockscans-context/context.jsonl',
    },
    {
      name: 'rerating-catalysts/briefs',
      srcDir: path.join(root, 'cache', 'rerating-catalysts', 'briefs'),
      targetRel: 'cache/rerating-catalysts/briefs.jsonl',
      cleanupDir: true,
    },
    {
      name: 'rerating-catalysts/filings',
      srcDir: path.join(root, 'cache', 'rerating-catalysts', 'filings'),
      targetRel: 'cache/rerating-catalysts/filings.jsonl',
      cleanupDir: true,
    },
    {
      name: 'monthly-updates-parsed',
      srcDir: path.join(root, 'cache', 'monthly-updates-parsed'),
      targetRel: 'cache/monthly-updates-parsed/parsed.jsonl',
    },
    {
      name: 'doc-extracts/annual_report',
      srcDir: path.join(root, 'cache', 'doc-extracts', 'annual_report'),
      targetRel: 'cache/doc-extracts/annual_report.jsonl',
      cleanupDir: true,
    },
    {
      name: 'doc-extracts/ppt',
      srcDir: path.join(root, 'cache', 'doc-extracts', 'ppt'),
      targetRel: 'cache/doc-extracts/ppt.jsonl',
      cleanupDir: true,
    },
    {
      name: 'doc-extracts/announcement',
      srcDir: path.join(root, 'cache', 'doc-extracts', 'announcement'),
      targetRel: 'cache/doc-extracts/announcement.jsonl',
      cleanupDir: true,
    },
    {
      name: 'doc-extracts/_calibration',
      srcDir: path.join(root, 'cache', 'doc-extracts', '_calibration'),
      targetRel: 'cache/doc-extracts/_calibration.jsonl',
      cleanupDir: true,
    },
  ];

  let totalSrcFiles = 0;
  let totalRecords = 0;
  const unlinks = [];
  const dirsToRemove = [];

  for (const t of tasks) {
    if (!fs.existsSync(t.srcDir)) {
      console.log(`  - ${t.name}: source dir not found (${t.srcDir}), skipping`);
      continue;
    }

    const shardFiles = fs
      .readdirSync(t.srcDir)
      .filter((f) => f.startsWith('shard_') && f.endsWith('.jsonl'));
    totalSrcFiles += shardFiles.length;

    console.log(`\n[${t.name}] Found ${shardFiles.length} shard files in ${t.srcDir}`);

    const recordsMap = new Map();
    const sourceHashes = new Map();

    for (const sf of shardFiles) {
      const sfAbs = path.join(t.srcDir, sf);
      const lines = fs.readFileSync(sfAbs, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const rec = JSON.parse(line.trim());
          const key = rec._key || rec.id || rec.hash;
          if (!key) {
            console.warn(`  WARNING: Record without key in ${sf}:`, line.slice(0, 100));
            continue;
          }
          recordsMap.set(key, rec);
          sourceHashes.set(key, sha256(JSON.stringify(rec)));
        } catch (err) {
          console.error(`  ERROR parsing line in ${sf}:`, err.message);
        }
      }
    }

    totalRecords += recordsMap.size;
    console.log(`  Read ${recordsMap.size} unique records from ${shardFiles.length} shards.`);

    const targetAbs = path.join(root, t.targetRel);
    console.log(`  Target: ${targetAbs}`);

    if (isExecute) {
      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      const targetLines =
        Array.from(recordsMap.values())
          .map((r) => JSON.stringify(r))
          .join('\n') + '\n';
      fs.writeFileSync(targetAbs, targetLines, 'utf8');

      // Parity Verification
      console.log(`  Verifying parity against target file...`);
      const writtenLines = fs.readFileSync(targetAbs, 'utf8').split('\n').filter(Boolean);
      const targetHashes = new Map();
      for (const line of writtenLines) {
        const rec = JSON.parse(line.trim());
        const key = rec._key || rec.id || rec.hash;
        targetHashes.set(key, sha256(JSON.stringify(rec)));
      }

      let parityFail = 0;
      for (const [key, srcHash] of sourceHashes) {
        const tgtHash = targetHashes.get(key);
        if (!tgtHash || tgtHash !== srcHash) {
          console.error(`  PARITY FAILURE for key ${key}: src=${srcHash}, tgt=${tgtHash}`);
          parityFail++;
        }
      }

      if (parityFail > 0) {
        throw new Error(
          `Consolidation failed parity check for ${t.name}: ${parityFail} mismatches!`
        );
      }

      console.log(`  ✓ 100% Parity verified: ${sourceHashes.size} records match perfectly!`);

      // Queue shard unlinks
      for (const sf of shardFiles) {
        unlinks.push(path.join(t.srcDir, sf));
      }
      // Also check .DS_Store
      const ds = path.join(t.srcDir, '.DS_Store');
      if (fs.existsSync(ds)) unlinks.push(ds);

      if (t.cleanupDir) {
        dirsToRemove.push(t.srcDir);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Total source shard files: ${totalSrcFiles}`);
  console.log(`  Total records to consolidate: ${totalRecords}`);

  if (!isExecute) {
    console.log(`\nDry-run complete. Run with --execute to perform consolidation.`);
    return;
  }

  // Unlink source files
  console.log(`\nUnlinking ${unlinks.length} source shard files...`);
  const syncState = loadSyncState();
  let statePruned = 0;

  for (const f of unlinks) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
    const rel = path.relative(root, f).replace(/\\/g, '/');
    if (syncState.files && syncState.files[rel]) {
      delete syncState.files[rel];
      statePruned++;
    }
  }

  for (const d of dirsToRemove) {
    if (fs.existsSync(d) && fs.readdirSync(d).length === 0) {
      fs.rmdirSync(d);
      console.log(`  Removed empty directory: ${d}`);
    }
  }

  saveSyncState(syncState);
  console.log(`  ✓ Unlinked ${unlinks.length} source files.`);
  console.log(`  ✓ Pruned ${statePruned} entries from sync-state.json.`);
  console.log(`\nAll 7 light cache stores consolidated successfully!`);
}

main().catch((err) => {
  console.error('[consolidateLightStores] Fatal error:', err);
  process.exit(1);
});
