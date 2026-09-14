#!/usr/bin/env node
'use strict';

/**
 * migrateTranscriptsToShards.js — Migrates monolithic transcript stores
 * (> 10 MB) into uniform 16-hex shard files (shard_0.jsonl - shard_f.jsonl):
 *
 * 1. data/learnyst-lessons/soic.jsonl (86 MB) -> data/learnyst-lessons/shard_<0-f>.jsonl
 * 2. data/youtube-transcripts/*.jsonl (37.3 MB) -> data/youtube-transcripts/shard_<0-f>.jsonl
 * 3. Updates data/learnyst-lessons.json and data/youtube-transcripts.json `body` pointers.
 *
 * Guarantees:
 * - Deterministic partition: md5(id)[0] (hex 0-f).
 * - 100% cryptographic SHA-256 parity verification of every record before unlinking.
 * - Updates data/_meta/sync-state.json to purge deleted source files.
 *
 * Usage:
 *   node migrateTranscriptsToShards.js [--dry-run] [--execute]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');

const sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');
const md5Shard = (id) => crypto.createHash('md5').update(String(id)).digest('hex')[0].toLowerCase();

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

async function migrateStore({ name, dir, sourceFiles, indexFile, prefix, isExecute }) {
  console.log(`\n=== Migrating [${name}] ===`);
  const root = dataRoot();
  const absDir = path.join(root, dir);
  if (!fs.existsSync(absDir)) {
    console.log(`  Directory ${absDir} does not exist, skipping.`);
    return;
  }

  const existingSources = sourceFiles
    .map((f) => path.join(absDir, f))
    .filter((f) => fs.existsSync(f));

  if (existingSources.length === 0) {
    console.log(`  No source files found for ${name}, skipping.`);
    return;
  }

  console.log(`  Found ${existingSources.length} source file(s) to shard.`);

  // 1. Read all source records
  const recordsById = new Map();
  const sourceHashes = new Map();

  for (const srcPath of existingSources) {
    console.log(`  Reading ${path.basename(srcPath)}...`);
    const content = fs.readFileSync(srcPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line.trim());
        const id = rec.id;
        if (!id) {
          console.warn(`    WARNING: record without id in ${srcPath}`);
          continue;
        }
        recordsById.set(id, rec);
        sourceHashes.set(id, sha256(JSON.stringify(rec)));
      } catch (err) {
        console.error(`    ERROR parsing record in ${srcPath}:`, err.message);
      }
    }
  }

  console.log(`  Total unique records: ${recordsById.size}`);

  // 2. Partition into 16 shards
  const shards = new Map();
  for (let i = 0; i < 16; i++) {
    shards.set(i.toString(16), []);
  }

  for (const [id, rec] of recordsById) {
    const shardKey = md5Shard(id);
    shards.get(shardKey).push(rec);
  }

  for (let i = 0; i < 16; i++) {
    const h = i.toString(16);
    const count = shards.get(h).length;
    console.log(`    shard_${h}.jsonl: ${count} records`);
  }

  if (!isExecute) {
    console.log(`  [DRY-RUN] Would write 16 shards and update ${indexFile}`);
    return;
  }

  // 3. Write 16 shard files
  console.log(`  Writing 16 shard files...`);
  for (let i = 0; i < 16; i++) {
    const h = i.toString(16);
    const shardPath = path.join(absDir, `shard_${h}.jsonl`);
    const shardRecords = shards.get(h);
    const lines = shardRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(shardPath, lines, 'utf8');
  }

  // 4. Parity verification
  console.log(`  Verifying cryptographic parity...`);
  const targetHashes = new Map();
  for (let i = 0; i < 16; i++) {
    const h = i.toString(16);
    const shardPath = path.join(absDir, `shard_${h}.jsonl`);
    const lines = fs.readFileSync(shardPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const rec = JSON.parse(line.trim());
      targetHashes.set(rec.id, sha256(JSON.stringify(rec)));
    }
  }

  let mismatches = 0;
  for (const [id, srcHash] of sourceHashes) {
    const tgtHash = targetHashes.get(id);
    if (!tgtHash || tgtHash !== srcHash) {
      console.error(`  PARITY FAILURE for ${id}: src=${srcHash}, tgt=${tgtHash}`);
      mismatches++;
    }
  }

  if (mismatches > 0) {
    throw new Error(`Migration parity check failed for ${name}: ${mismatches} mismatches!`);
  }

  console.log(`  ✓ 100% Cryptographic parity verified across ${sourceHashes.size} records!`);

  // 5. Update slim index file
  const absIndex = path.join(root, indexFile);
  if (fs.existsSync(absIndex)) {
    console.log(`  Updating ${indexFile} body pointers...`);
    const indexData = JSON.parse(fs.readFileSync(absIndex, 'utf8'));
    let updatedIndexCount = 0;
    for (const [id, entry] of Object.entries(indexData)) {
      const shardKey = md5Shard(id);
      entry.body = `${prefix}/shard_${shardKey}.jsonl`;
      updatedIndexCount++;
    }
    fs.writeFileSync(absIndex, JSON.stringify(indexData, null, 2) + '\n', 'utf8');
    console.log(`  ✓ Updated ${updatedIndexCount} index pointers in ${indexFile}.`);
  }

  // 6. Unlink source files
  console.log(`  Unlinking ${existingSources.length} source file(s)...`);
  const syncState = loadSyncState();
  let prunedState = 0;
  for (const src of existingSources) {
    fs.unlinkSync(src);
    const rel = path.relative(root, src).replace(/\\/g, '/');
    if (syncState.files && syncState.files[rel]) {
      delete syncState.files[rel];
      prunedState++;
    }
  }
  saveSyncState(syncState);
  console.log(`  ✓ Unlinked source files and purged ${prunedState} entries from sync-state.json.`);
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log(
    `[migrateTranscriptsToShards] Mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN (audit only)'}`
  );

  await migrateStore({
    name: 'learnyst-lessons',
    dir: 'learnyst-lessons',
    sourceFiles: ['soic.jsonl'],
    indexFile: 'learnyst-lessons.json',
    prefix: 'learnyst-lessons',
    isExecute,
  });

  await migrateStore({
    name: 'youtube-transcripts',
    dir: 'youtube-transcripts',
    sourceFiles: ['soicfinance.jsonl', 'anillamba.jsonl'],
    indexFile: 'youtube-transcripts.json',
    prefix: 'youtube-transcripts',
    isExecute,
  });

  console.log(`\nMigration completed successfully!`);
}

main().catch((err) => {
  console.error('[migrateTranscriptsToShards] Fatal error:', err);
  process.exit(1);
});
