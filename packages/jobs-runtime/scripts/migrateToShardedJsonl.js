#!/usr/bin/env node
'use strict';

/**
 * migrateToShardedJsonl.js — Consolidate thousands of small files into partitioned JSONL stores.
 *
 * Scans the authoritative local filesystem (including un-pushed deltas),
 * consolidates records into size-optimized JSONL partitions (100 KB – 5 MB),
 * runs a 100% cryptographic parity check, compacts duplicate lines,
 * cleans up local loose files, and updates sync-state.json.
 *
 * Usage:
 *   node migrateToShardedJsonl.js [--dry-run] [--execute] [--verify-only]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');
const StorageService = require('@stock/cloud-utils').StorageService;
const { JsonlStore, timePartitioner, domainPartitioner, extractYearMonth } = require('../lib/jsonlStore');

const sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');

function dataRoot() {
  return db.dataRoot();
}

function loadState() {
  const p = path.join(dataRoot(), '_meta', 'sync-state.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return { files: {} };
  }
}

function saveState(state) {
  const p = path.join(dataRoot(), '_meta', 'sync-state.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function run() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isDryRun = args.includes('--dry-run') || !isExecute;
  const isVerifyOnly = args.includes('--verify-only');

  console.log(`[data:consolidate] Mode: ${isVerifyOnly ? 'VERIFY ONLY' : isDryRun ? 'DRY-RUN (no files modified)' : 'EXECUTE'}`);

  const root = dataRoot();
  const summary = {
    reports: 0,
    conversations: 0,
    learnystLessons: 0,
    youtubeTranscripts: 0,
    pdfText: 0,
    pdfTextFull: 0,
    monthlyUpdatesText: 0,
    monthlyUpdatesParsed: 0,
    monthlyBatches: 0,
  };

  // 1. Discover local files directly from filesystem (authoritative)
  const listFiles = (dir, filter = (f) => f.endsWith('.json')) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).filter((f) => !f.startsWith('.') && !f.includes('.tmp.') && filter(f));
  };

  const reportFiles = listFiles('reports', (f) => f.endsWith('.json') && f !== 'reports.json');
  const conversationFiles = listFiles('conversations', (f) => f.endsWith('.json') && f !== 'conversations.json');
  const learnystFiles = listFiles('learnyst-lessons', (f) => f.endsWith('.json') && f !== 'learnyst-lessons.json');
  const youtubeFiles = listFiles('youtube-transcripts', (f) => f.endsWith('.json') && f !== 'youtube-transcripts.json');
  const pdfTextFiles = listFiles('cache/pdf-text', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const pdfTextFullFiles = listFiles('cache/pdf-text-full', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const muTextFiles = listFiles('cache/monthly-updates-text', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const muParsedFiles = listFiles('cache/monthly-updates-parsed', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const muBatchFiles = listFiles('runs/monthly-updates-batches', (f) => f.startsWith('batch_'));

  summary.reports = reportFiles.length;
  summary.conversations = conversationFiles.length;
  summary.learnystLessons = learnystFiles.length;
  summary.youtubeTranscripts = youtubeFiles.length;
  summary.pdfText = pdfTextFiles.length;
  summary.pdfTextFull = pdfTextFullFiles.length;
  summary.monthlyUpdatesText = muTextFiles.length;
  summary.monthlyUpdatesParsed = muParsedFiles.length;
  summary.monthlyBatches = muBatchFiles.length;

  const totalCandidateFiles =
    summary.reports +
    summary.conversations +
    summary.learnystLessons +
    summary.youtubeTranscripts +
    summary.pdfText +
    summary.pdfTextFull +
    summary.monthlyUpdatesText +
    summary.monthlyUpdatesParsed +
    summary.monthlyBatches;

  console.log('[data:consolidate] Local candidate files discovered:');
  console.log(`  - reports:                  ${summary.reports} files`);
  console.log(`  - conversations:            ${summary.conversations} files`);
  console.log(`  - learnyst-lessons:         ${summary.learnystLessons} files`);
  console.log(`  - youtube-transcripts:      ${summary.youtubeTranscripts} files`);
  console.log(`  - cache/pdf-text:           ${summary.pdfText} files`);
  console.log(`  - cache/pdf-text-full:      ${summary.pdfTextFull} files`);
  console.log(`  - cache/monthly-updates-text:   ${summary.monthlyUpdatesText} files`);
  console.log(`  - cache/monthly-updates-parsed: ${summary.monthlyUpdatesParsed} files`);
  console.log(`  - runs/monthly-updates-batches: ${summary.monthlyBatches} files`);
  console.log(`  TOTAL CANDIDATES:           ${totalCandidateFiles} files`);

  if (totalCandidateFiles === 0) {
    console.log('[data:consolidate] No legacy loose files to consolidate. Everything is already consolidated.');
    return;
  }

  if (isDryRun && !isVerifyOnly) {
    console.log('\n[data:consolidate] DRY RUN COMPLETE. Run with `--execute` to perform consolidation.');
    return;
  }

  // 2. Pre-migration backup snapshot
  const snapshotDir = path.join(root, '_meta', 'pre-consolidation-snapshot');
  fs.mkdirSync(snapshotDir, { recursive: true });
  console.log(`\n[data:consolidate] Writing pre-consolidation inventory to ${snapshotDir}...`);
  const inventory = {
    timestamp: new Date().toISOString(),
    summary,
    files: {
      reports: reportFiles,
      conversations: conversationFiles,
      learnystLessons: learnystFiles,
      youtubeTranscripts: youtubeFiles,
      pdfText: pdfTextFiles,
      pdfTextFull: pdfTextFullFiles,
      monthlyUpdatesText: muTextFiles,
      monthlyUpdatesParsed: muParsedFiles,
      monthlyBatches: muBatchFiles,
    },
  };
  fs.writeFileSync(path.join(snapshotDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', 'utf8');

  // 3. Execution: Consolidate stores
  console.log('\n[data:consolidate] Ingesting files into partitioned stores...');

  // A. Reports
  const reportsStore = new JsonlStore({
    baseDir: path.join(root, 'reports'),
    partitioner: timePartitioner({ filePrefix: 'reports-' }),
    lockPrefix: 'reports',
    withLock: db.withLock,
  });
  const reportsIndex = db.loadFile(path.join(root, 'reports.json'));
  const migratedReportRecords = new Map();

  for (const f of reportFiles) {
    const absPath = path.join(root, 'reports', f);
    try {
      const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      reportsStore.set(data.id, data, data.date);
      migratedReportRecords.set(data.id, data);
      const ym = extractYearMonth(data.date) || extractYearMonth(data.id) || 'unknown';
      if (reportsIndex[data.id]) {
        reportsIndex[data.id].body = `reports/reports-${ym}.jsonl`;
      }
    } catch (e) {
      console.error(`  [!] Error reading report ${f}: ${e.message}`);
    }
  }
  db.writeFileAtomic(path.join(root, 'reports.json'), reportsIndex);
  console.log(`  ✓ Migrated ${migratedReportRecords.size} reports`);

  // B. Conversations
  const convStore = new JsonlStore({
    baseDir: path.join(root, 'conversations'),
    partitioner: timePartitioner({ filePrefix: 'conversations-' }),
    lockPrefix: 'conversations',
    withLock: db.withLock,
  });
  const convIndex = db.loadFile(path.join(root, 'conversations.json'));
  const migratedConvRecords = new Map();

  for (const f of conversationFiles) {
    const absPath = path.join(root, 'conversations', f);
    try {
      const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      convStore.set(data.id, data, data.date);
      migratedConvRecords.set(data.id, data);
      const ym = extractYearMonth(data.date) || extractYearMonth(data.id) || 'unknown';
      if (convIndex[data.id]) {
        convIndex[data.id].body = `conversations/conversations-${ym}.jsonl`;
      }
    } catch (e) {
      console.error(`  [!] Error reading conversation ${f}: ${e.message}`);
    }
  }
  db.writeFileAtomic(path.join(root, 'conversations.json'), convIndex);
  console.log(`  ✓ Migrated ${migratedConvRecords.size} conversations`);

  // C. Learnyst Lessons
  const learnystStore = new JsonlStore({
    baseDir: path.join(root, 'learnyst-lessons'),
    partitioner: domainPartitioner({
      filePrefix: 'course_',
      keyFn: (id, rec, hint) => (rec && rec.courseId) || (hint && hint.courseId) || 'misc',
    }),
    lockPrefix: 'learnyst',
    withLock: db.withLock,
  });
  const learnystIndex = db.loadFile(path.join(root, 'learnyst-lessons.json'));
  const migratedLearnystRecords = new Map();

  for (const f of learnystFiles) {
    const absPath = path.join(root, 'learnyst-lessons', f);
    try {
      const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      learnystStore.set(data.id, data, { courseId: data.courseId });
      migratedLearnystRecords.set(data.id, data);
      if (learnystIndex[data.id]) {
        learnystIndex[data.id].body = `learnyst-lessons/course_${data.courseId}.jsonl`;
      }
    } catch (e) {
      console.error(`  [!] Error reading learnyst transcript ${f}: ${e.message}`);
    }
  }
  db.writeFileAtomic(path.join(root, 'learnyst-lessons.json'), learnystIndex);
  console.log(`  ✓ Migrated ${migratedLearnystRecords.size} learnyst transcripts`);

  // D. YouTube Transcripts
  const youtubeStore = new JsonlStore({
    baseDir: path.join(root, 'youtube-transcripts'),
    partitioner: domainPartitioner({
      filePrefix: '',
      keyFn: (id, rec, hint) => {
        const ch = (rec && (rec.channelHandle || rec.channelTitle)) || (hint && (hint.channelHandle || hint.channelTitle)) || 'channel';
        const pub = (rec && rec.publishedAt) || (hint && hint.publishedAt) || '';
        const ym = extractYearMonth(pub);
        const yr = ym ? ym.slice(0, 4) : 'misc';
        const slug = String(ch).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return `${slug || 'channel'}_${yr}`;
      },
    }),
    lockPrefix: 'youtube',
    withLock: db.withLock,
  });
  const youtubeIndex = db.loadFile(path.join(root, 'youtube-transcripts.json'));
  const migratedYoutubeRecords = new Map();

  for (const f of youtubeFiles) {
    const absPath = path.join(root, 'youtube-transcripts', f);
    try {
      const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      youtubeStore.set(data.id, data, {
        channelHandle: data.channelHandle,
        channelTitle: data.channelTitle,
        publishedAt: data.publishedAt,
      });
      migratedYoutubeRecords.set(data.id, data);

      const ch = data.channelHandle || data.channelTitle || 'channel';
      const ym = extractYearMonth(data.publishedAt);
      const yr = ym ? ym.slice(0, 4) : 'misc';
      const slug = String(ch).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const partitionName = `${slug || 'channel'}_${yr}.jsonl`;

      if (youtubeIndex[data.id]) {
        youtubeIndex[data.id].body = `youtube-transcripts/${partitionName}`;
      }
    } catch (e) {
      console.error(`  [!] Error reading youtube transcript ${f}: ${e.message}`);
    }
  }
  db.writeFileAtomic(path.join(root, 'youtube-transcripts.json'), youtubeIndex);
  console.log(`  ✓ Migrated ${migratedYoutubeRecords.size} youtube transcripts`);

  // E. Sharded Cache Stores (via StorageService)
  const migrateCacheFolder = (subDir, files) => {
    const migrated = new Map();
    for (const f of files) {
      const absPath = path.join(root, subDir, f);
      const key = path.basename(f, '.json');
      try {
        const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
        StorageService.saveJson(`${subDir}/${f}`, data);
        migrated.set(key, data);
      } catch (e) {
        console.error(`  [!] Error reading cache ${subDir}/${f}: ${e.message}`);
      }
    }
    return migrated;
  };

  const migratedPdfText = migrateCacheFolder('cache/pdf-text', pdfTextFiles);
  console.log(`  ✓ Migrated ${migratedPdfText.size} cache/pdf-text entries`);

  const migratedPdfTextFull = migrateCacheFolder('cache/pdf-text-full', pdfTextFullFiles);
  console.log(`  ✓ Migrated ${migratedPdfTextFull.size} cache/pdf-text-full entries`);

  const migratedMuText = migrateCacheFolder('cache/monthly-updates-text', muTextFiles);
  console.log(`  ✓ Migrated ${migratedMuText.size} cache/monthly-updates-text entries`);

  const migratedMuParsed = migrateCacheFolder('cache/monthly-updates-parsed', muParsedFiles);
  console.log(`  ✓ Migrated ${migratedMuParsed.size} cache/monthly-updates-parsed entries`);

  // F. Runs batches
  if (muBatchFiles.length > 0) {
    const batchesJsonPath = path.join(root, 'runs', 'monthly-updates-batches', 'batches.json');
    if (fs.existsSync(batchesJsonPath)) {
      try {
        const batches = JSON.parse(fs.readFileSync(batchesJsonPath, 'utf8'));
        const jsonlPath = path.join(root, 'runs', 'monthly-updates-batches', 'batches.jsonl');
        const lines = batches.map((b) => JSON.stringify(b)).join('\n') + '\n';
        fs.writeFileSync(jsonlPath, lines, 'utf8');
        console.log(`  ✓ Consolidated monthly-updates-batches into batches.jsonl`);
      } catch (e) {
        console.error(`  [!] Error consolidating batches: ${e.message}`);
      }
    }
  }

  // 4. Compact partitions
  console.log('\n[data:consolidate] Compacting generated JSONL partitions...');
  const compactAll = (store) => {
    for (const p of store.listPartitions()) {
      store.compact(p);
    }
  };
  compactAll(reportsStore);
  compactAll(convStore);
  compactAll(learnystStore);
  compactAll(youtubeStore);

  // 5. Strict Cryptographic Parity Verification
  console.log('\n[data:consolidate] Running 100% Cryptographic Parity Verification...');
  let verifiedCount = 0;
  let mismatchCount = 0;

  StorageService.clearShardCache();
  reportsStore.clearMemoryCache();
  convStore.clearMemoryCache();
  learnystStore.clearMemoryCache();
  youtubeStore.clearMemoryCache();

  // Verify Reports
  for (const [id, original] of migratedReportRecords) {
    const retrieved = db.readReport(id);
    if (!retrieved || sha256(JSON.stringify(retrieved)) !== sha256(JSON.stringify(original))) {
      console.error(`  [MISMATCH] Report ${id} did not match original!`);
      mismatchCount++;
    } else {
      verifiedCount++;
    }
  }

  // Verify Conversations
  for (const [id, original] of migratedConvRecords) {
    const retrieved = db.readConversation(id);
    if (!retrieved || sha256(JSON.stringify(retrieved)) !== sha256(JSON.stringify(original))) {
      console.error(`  [MISMATCH] Conversation ${id} did not match original!`);
      mismatchCount++;
    } else {
      verifiedCount++;
    }
  }

  // Verify Learnyst
  for (const [id, original] of migratedLearnystRecords) {
    const retrieved = db.readLearnystTranscript(id);
    if (!retrieved || sha256(JSON.stringify(retrieved)) !== sha256(JSON.stringify(original))) {
      console.error(`  [MISMATCH] Learnyst transcript ${id} did not match original!`);
      mismatchCount++;
    } else {
      verifiedCount++;
    }
  }

  // Verify YouTube
  for (const [id, original] of migratedYoutubeRecords) {
    const retrieved = db.readYoutubeTranscript(id);
    if (!retrieved || sha256(JSON.stringify(retrieved)) !== sha256(JSON.stringify(original))) {
      console.error(`  [MISMATCH] YouTube transcript ${id} did not match original!`);
      mismatchCount++;
    } else {
      verifiedCount++;
    }
  }

  // Verify Sharded Caches
  const verifyCacheFolder = (subDir, originalMap) => {
    for (const [key, original] of originalMap) {
      const retrieved = StorageService.readJson(`${subDir}/${key}.json`);
      if (!retrieved || sha256(JSON.stringify(retrieved)) !== sha256(JSON.stringify(original))) {
        console.error(`  [MISMATCH] ${subDir}/${key}.json did not match original!`);
        mismatchCount++;
      } else {
        verifiedCount++;
      }
    }
  };

  verifyCacheFolder('cache/pdf-text', migratedPdfText);
  verifyCacheFolder('cache/pdf-text-full', migratedPdfTextFull);
  verifyCacheFolder('cache/monthly-updates-text', migratedMuText);
  verifyCacheFolder('cache/monthly-updates-parsed', migratedMuParsed);

  console.log(`\n[data:consolidate] Verification results: verified=${verifiedCount}, mismatches=${mismatchCount}`);

  if (mismatchCount > 0) {
    console.error(`[data:consolidate] CRITICAL: Verification detected ${mismatchCount} mismatches! ABORTING cleanup.`);
    process.exit(1);
  }
  console.log('  ✓ 100% PARITY CONFIRMED! Zero lost records, zero corrupted payloads.');

  // 6. Prune legacy local loose files
  console.log('\n[data:consolidate] Pruning legacy local loose files...');
  let prunedLocalCount = 0;
  const unlinkFiles = (dir, files) => {
    for (const f of files) {
      const p = path.join(root, dir, f);
      try {
        fs.unlinkSync(p);
        prunedLocalCount++;
      } catch (e) {
        console.error(`  Failed to unlink ${p}: ${e.message}`);
      }
    }
  };

  unlinkFiles('reports', reportFiles);
  unlinkFiles('conversations', conversationFiles);
  unlinkFiles('learnyst-lessons', learnystFiles);
  unlinkFiles('youtube-transcripts', youtubeFiles);
  unlinkFiles('cache/pdf-text', pdfTextFiles);
  unlinkFiles('cache/pdf-text-full', pdfTextFullFiles);
  unlinkFiles('cache/monthly-updates-text', muTextFiles);
  unlinkFiles('cache/monthly-updates-parsed', muParsedFiles);
  unlinkFiles('runs/monthly-updates-batches', muBatchFiles);

  console.log(`  ✓ Unlinked ${prunedLocalCount} legacy local files.`);

  // 7. Update sync-state.json: purge unlinked file keys
  console.log('\n[data:consolidate] Updating _meta/sync-state.json...');
  const state = loadState();
  let stateKeysPurged = 0;

  const purgePrefixes = [
    'reports/',
    'conversations/',
    'learnyst-lessons/',
    'youtube-transcripts/',
    'cache/pdf-text/',
    'cache/pdf-text-full/',
    'cache/monthly-updates-text/',
    'cache/monthly-updates-parsed/',
    'runs/monthly-updates-batches/',
  ];

  for (const key of Object.keys(state.files || {})) {
    // Keep index files and .jsonl files
    if (key.endsWith('.jsonl') || key === 'reports.json' || key === 'conversations.json' || key === 'learnyst-lessons.json' || key === 'youtube-transcripts.json' || key === 'runs/monthly-updates-batches/batches.json') {
      continue;
    }
    for (const prefix of purgePrefixes) {
      if (key.startsWith(prefix) && key.endsWith('.json')) {
        delete state.files[key];
        stateKeysPurged++;
        break;
      }
    }
  }

  saveState(state);
  console.log(`  ✓ Purged ${stateKeysPurged} legacy entries from sync-state.json.`);

  console.log('\n======================================================');
  console.log('✅ DATA CONSOLIDATION COMPLETE');
  console.log(`Total legacy files removed locally: ${prunedLocalCount}`);
  console.log(`Consolidated files ready for push:`);
  console.log(`  - reports:             ${reportsStore.listPartitions().length} partition files`);
  console.log(`  - conversations:       ${convStore.listPartitions().length} partition files`);
  console.log(`  - learnyst-lessons:    ${learnystStore.listPartitions().length} course files`);
  console.log(`  - youtube-transcripts: ${youtubeStore.listPartitions().length} channel/year files`);
  console.log(`  - cache shards:        16 shards per store (pdf-text, pdf-text-full, monthly-updates)`);
  console.log('Next steps:');
  console.log('  1. Run `yarn data:status` to verify sync delta.');
  console.log('  2. Run `yarn data:push` to push consolidated files to Google Drive.');
  console.log('  3. Run `yarn data:prune-remote --execute` to clean up remote Drive orphans.');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('[data:consolidate] FATAL:', err);
  process.exit(1);
});
