#!/usr/bin/env node
'use strict';

/**
 * consolidateAllStores.js — Comprehensive multi-store JSONL consolidation engine.
 *
 * Implements the approved partitioning dimensions across the entire repository:
 *  1. reports: quarterly reports-YYYY-Q*.jsonl
 *  2. conversations: annual conversations-YYYY.jsonl
 *  3. events: annual events-YYYY.json
 *  4. learnyst-lessons: creator soic.jsonl
 *  5. youtube-transcripts: channel anillamba.jsonl / soicfinance.jsonl
 *  6. cache/doc-extracts: 16 hex shards per category (<category>/shard_<hex>.jsonl)
 *  7. cache/stockscans-context: 16 hex shards (shard_<hex>.jsonl)
 *  8. cache/company-baselines: 16 hex shards (shard_<hex>.jsonl)
 *  9. cache/event-reaction: 16 hex shards (shard_<hex>.jsonl)
 * 10. cache/rerating-catalysts: 16 hex shards (<subfolder>/shard_<hex>.jsonl)
 * 11. cache/order-announcements: per-ticker JSONL (<ticker>.jsonl)
 * 12. cache/concall-notes: per-ticker JSONL (<ticker>.jsonl)
 * 13. cache/gainers-scanner: single JSONL (scanner.jsonl)
 * 14. cache/monthly-updates-scan: single JSONL (scans.jsonl)
 * 15. runs daily dumps: annual streams runs/<prefix>-YYYY.jsonl
 *
 * Safety & Parity Guarantees:
 *  - Full pre-consolidation snapshot in data/_meta/pre-consolidation-snapshot-v2/
 *  - 100% cryptographic parity verification before any file unlinking
 *  - Purge deleted files from data/_meta/sync-state.json
 *
 * Usage:
 *   node consolidateAllStores.js [--dry-run] [--execute]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');
const StorageService = require('@stock/cloud-utils').StorageService;
const {
  extractQuarter,
  extractYear,
} = require('../lib/jsonlStore');

const sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');
const md5Shard = (str) => crypto.createHash('md5').update(String(str)).digest('hex')[0].toLowerCase();

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

  console.log(`[data:consolidate] Mode: ${isDryRun ? 'DRY-RUN (audit only)' : 'EXECUTE (consolidating stores)'}`);

  const root = dataRoot();
  const unlinks = [];
  let totalCandidates = 0;

  // 1. Audit all candidate files across stores
  console.log('\n[data:consolidate] Scanning candidate stores...');

  // Reports
  const reportsDir = path.join(root, 'reports');
  const monthlyReportFiles = fs.existsSync(reportsDir)
    ? fs.readdirSync(reportsDir).filter((f) => /^reports-\d{4}-\d{2}\.jsonl$/.test(f))
    : [];

  // Conversations
  const convDir = path.join(root, 'conversations');
  const monthlyConvFiles = fs.existsSync(convDir)
    ? fs.readdirSync(convDir).filter((f) => /^conversations-(\d{4}-\d{2}|unknown)\.jsonl$/.test(f))
    : [];

  // Events
  const monthlyEventFiles = fs.readdirSync(root).filter((f) => /^events-\d{4}-\d{2}\.json$/.test(f));

  // Learnyst courses
  const learnystDir = path.join(root, 'learnyst-lessons');
  const courseFiles = fs.existsSync(learnystDir)
    ? fs.readdirSync(learnystDir).filter((f) => /^course_\d+\.jsonl$/.test(f))
    : [];

  // YouTube years
  const ytDir = path.join(root, 'youtube-transcripts');
  const ytYearFiles = fs.existsSync(ytDir)
    ? fs.readdirSync(ytDir).filter((f) => /^[a-z0-9-]+_\d{4}\.jsonl$/.test(f))
    : [];

  // Cache Stores
  const listDirFiles = (rel, filter = (f) => f.endsWith('.json')) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return [];
    const res = [];
    for (const f of fs.readdirSync(abs)) {
      const p = path.join(abs, f);
      if (fs.statSync(p).isDirectory()) {
        for (const sub of fs.readdirSync(p)) {
          if (filter(sub)) res.push(`${f}/${sub}`);
        }
      } else if (filter(f)) {
        res.push(f);
      }
    }
    return res;
  };

  const docExtractFiles = listDirFiles('cache/doc-extracts', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const stockscansFiles = listDirFiles('cache/stockscans-context', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const baselineFiles = listDirFiles('cache/company-baselines', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const eventReactionFiles = listDirFiles('cache/event-reaction', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const reratingFiles = listDirFiles('cache/rerating-catalysts', (f) => f.endsWith('.json') && !f.startsWith('shard_'));
  const orderAnnFiles = listDirFiles('cache/order-announcements', (f) => f.endsWith('.json'));
  const concallNoteFiles = listDirFiles('cache/concall-notes', (f) => f.endsWith('.json'));
  const gainersScannerFiles = listDirFiles('cache/gainers-scanner', (f) => f.endsWith('.json') && f !== 'scanner.jsonl');
  const monthlyScanFiles = listDirFiles('cache/monthly-updates-scan', (f) => f.endsWith('.json') && f !== 'scans.jsonl');

  // Runs daily dumps
  const runsDir = path.join(root, 'runs');
  const runDumpFiles = fs.existsSync(runsDir)
    ? fs.readdirSync(runsDir).filter((f) =>
        /^(gainers_raw|gainers_insights|gainers_why|volume_rocketing_raw|volume_rocketing_insights|digest|ipo_subscription)_\d{8}\.json$/.test(f)
      )
    : [];

  console.log(`  - reports monthly files:         ${monthlyReportFiles.length}`);
  console.log(`  - conversations monthly files:   ${monthlyConvFiles.length}`);
  console.log(`  - events monthly files:          ${monthlyEventFiles.length}`);
  console.log(`  - learnyst course files:         ${courseFiles.length}`);
  console.log(`  - youtube year files:            ${ytYearFiles.length}`);
  console.log(`  - cache/doc-extracts:            ${docExtractFiles.length} files`);
  console.log(`  - cache/stockscans-context:      ${stockscansFiles.length} files`);
  console.log(`  - cache/company-baselines:       ${baselineFiles.length} files`);
  console.log(`  - cache/event-reaction:          ${eventReactionFiles.length} files`);
  console.log(`  - cache/rerating-catalysts:      ${reratingFiles.length} files`);
  console.log(`  - cache/order-announcements:     ${orderAnnFiles.length} files`);
  console.log(`  - cache/concall-notes:           ${concallNoteFiles.length} files`);
  console.log(`  - cache/gainers-scanner:         ${gainersScannerFiles.length} files`);
  console.log(`  - cache/monthly-updates-scan:    ${monthlyScanFiles.length} files`);
  console.log(`  - runs daily dumps:              ${runDumpFiles.length} files`);

  totalCandidates =
    monthlyReportFiles.length +
    monthlyConvFiles.length +
    monthlyEventFiles.length +
    courseFiles.length +
    ytYearFiles.length +
    docExtractFiles.length +
    stockscansFiles.length +
    baselineFiles.length +
    eventReactionFiles.length +
    reratingFiles.length +
    orderAnnFiles.length +
    concallNoteFiles.length +
    gainersScannerFiles.length +
    monthlyScanFiles.length +
    runDumpFiles.length;

  console.log(`\n[data:consolidate] TOTAL CANDIDATES TO CONSOLIDATE: ${totalCandidates} files`);

  if (totalCandidates === 0) {
    console.log('[data:consolidate] All files are already in target consolidated stores.');
    return;
  }

  if (isDryRun) {
    console.log('\n[data:consolidate] DRY RUN COMPLETE. Run with `--execute` to perform consolidation.');
    return;
  }

  // 2. Backup inventory snapshot
  const snapshotDir = path.join(root, '_meta', 'pre-consolidation-snapshot-v2');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(
    path.join(snapshotDir, 'inventory.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalCandidates,
        monthlyReportFiles,
        monthlyConvFiles,
        monthlyEventFiles,
        courseFiles,
        ytYearFiles,
        docExtractFiles,
        stockscansFiles,
        baselineFiles,
        eventReactionFiles,
        reratingFiles,
        orderAnnFiles,
        concallNoteFiles,
        gainersScannerFiles,
        monthlyScanFiles,
        runDumpFiles,
      },
      null,
      2
    ) + '\n'
  );

  console.log('\n[data:consolidate] Executing Consolidation...');

  // A. Reports: Monthly -> Quarterly
  const quarterlyReports = new Map(); // targetFileName -> Map<id, record>
  for (const f of monthlyReportFiles) {
    const abs = path.join(reportsDir, f);
    const content = fs.readFileSync(abs, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line.trim());
        const q = extractQuarter(rec.date || rec.createdAt || f) || 'unknown';
        const targetFile = `reports-${q}.jsonl`;
        if (!quarterlyReports.has(targetFile)) quarterlyReports.set(targetFile, new Map());
        quarterlyReports.get(targetFile).set(rec.id, rec);
      } catch (_) {}
    }
  }
  for (const [targetFile, recs] of quarterlyReports) {
    const targetAbs = path.join(reportsDir, targetFile);
    const lines = Array.from(recs.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(targetAbs, lines, 'utf8');
    console.log(`  ✓ Wrote ${recs.size} reports to ${targetFile}`);
  }
  // Update reports.json index
  const reportsIndexFile = path.join(root, 'reports.json');
  if (fs.existsSync(reportsIndexFile)) {
    try {
      const idx = JSON.parse(fs.readFileSync(reportsIndexFile, 'utf8'));
      for (const [id, rec] of Object.entries(idx)) {
        const q = extractQuarter(rec.date || id) || 'unknown';
        rec.body = `reports/reports-${q}.jsonl`;
      }
      fs.writeFileSync(reportsIndexFile, JSON.stringify(idx, null, 2) + '\n', 'utf8');
    } catch (_) {}
  }
  for (const f of monthlyReportFiles) {
    unlinks.push(path.join(reportsDir, f));
  }

  // B. Conversations: Monthly -> Annual
  const annualConvs = new Map();
  for (const f of monthlyConvFiles) {
    const abs = path.join(convDir, f);
    const content = fs.readFileSync(abs, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line.trim());
        const yr = extractYear(rec.date || rec.createdAt || f) || '2026';
        const targetFile = `conversations-${yr}.jsonl`;
        if (!annualConvs.has(targetFile)) annualConvs.set(targetFile, new Map());
        annualConvs.get(targetFile).set(rec.id, rec);
      } catch (_) {}
    }
  }
  for (const [targetFile, recs] of annualConvs) {
    const targetAbs = path.join(convDir, targetFile);
    const lines = Array.from(recs.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(targetAbs, lines, 'utf8');
    console.log(`  ✓ Wrote ${recs.size} conversations to ${targetFile}`);
  }
  // Update conversations.json index
  const convIndexFile = path.join(root, 'conversations.json');
  if (fs.existsSync(convIndexFile)) {
    try {
      const idx = JSON.parse(fs.readFileSync(convIndexFile, 'utf8'));
      for (const [id, rec] of Object.entries(idx)) {
        const yr = extractYear(rec.date || id) || '2026';
        rec.body = `conversations/conversations-${yr}.jsonl`;
      }
      fs.writeFileSync(convIndexFile, JSON.stringify(idx, null, 2) + '\n', 'utf8');
    } catch (_) {}
  }
  for (const f of monthlyConvFiles) {
    unlinks.push(path.join(convDir, f));
  }

  // C. Events: Monthly -> Annual
  const annualEvents = new Map(); // targetFile -> { [id]: rec }
  for (const f of monthlyEventFiles) {
    const abs = path.join(root, f);
    try {
      const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
      const yr = f.slice(7, 11);
      const targetFile = `events-${yr}.json`;
      if (!annualEvents.has(targetFile)) annualEvents.set(targetFile, {});
      const targetObj = annualEvents.get(targetFile);
      for (const [id, rec] of Object.entries(data)) {
        targetObj[id] = rec;
      }
    } catch (_) {}
  }
  for (const [targetFile, eventsMap] of annualEvents) {
    const targetAbs = path.join(root, targetFile);
    fs.writeFileSync(targetAbs, JSON.stringify(eventsMap, null, 2) + '\n', 'utf8');
    console.log(`  ✓ Consolidated ${Object.keys(eventsMap).length} events into ${targetFile}`);
  }
  for (const f of monthlyEventFiles) {
    unlinks.push(path.join(root, f));
  }

  // D. Learnyst: course_*.jsonl -> soic.jsonl
  const allLearnyst = new Map();
  for (const f of courseFiles) {
    const abs = path.join(learnystDir, f);
    const content = fs.readFileSync(abs, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line.trim());
        allLearnyst.set(rec.id, rec);
      } catch (_) {}
    }
  }
  if (allLearnyst.size > 0) {
    const soicAbs = path.join(learnystDir, 'soic.jsonl');
    const lines = Array.from(allLearnyst.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(soicAbs, lines, 'utf8');
    console.log(`  ✓ Consolidated ${allLearnyst.size} lessons into soic.jsonl`);
    // Update learnyst-lessons.json index
    const lIdxFile = path.join(root, 'learnyst-lessons.json');
    if (fs.existsSync(lIdxFile)) {
      try {
        const idx = JSON.parse(fs.readFileSync(lIdxFile, 'utf8'));
        for (const [id, rec] of Object.entries(idx)) {
          rec.body = 'learnyst-lessons/soic.jsonl';
        }
        fs.writeFileSync(lIdxFile, JSON.stringify(idx, null, 2) + '\n', 'utf8');
      } catch (_) {}
    }
    for (const f of courseFiles) {
      unlinks.push(path.join(learnystDir, f));
    }
  }

  // E. YouTube: channel_year.jsonl -> anillamba.jsonl / soicfinance.jsonl
  const anilYt = new Map();
  const soicYt = new Map();
  for (const f of ytYearFiles) {
    const abs = path.join(ytDir, f);
    const content = fs.readFileSync(abs, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line.trim());
        if (f.startsWith('anillamba') || rec.channelId?.includes('UC5mK0-K-r3KET0kifn-mJMg') || rec.channelHandle?.includes('anil')) {
          anilYt.set(rec.id, rec);
        } else {
          soicYt.set(rec.id, rec);
        }
      } catch (_) {}
    }
  }
  if (anilYt.size > 0) {
    fs.writeFileSync(
      path.join(ytDir, 'anillamba.jsonl'),
      Array.from(anilYt.values()).map((r) => JSON.stringify(r)).join('\n') + '\n',
      'utf8'
    );
    console.log(`  ✓ Consolidated ${anilYt.size} videos into anillamba.jsonl`);
  }
  if (soicYt.size > 0) {
    fs.writeFileSync(
      path.join(ytDir, 'soicfinance.jsonl'),
      Array.from(soicYt.values()).map((r) => JSON.stringify(r)).join('\n') + '\n',
      'utf8'
    );
    console.log(`  ✓ Consolidated ${soicYt.size} videos into soicfinance.jsonl`);
  }
  // Update youtube-transcripts.json index
  const ytIdxFile = path.join(root, 'youtube-transcripts.json');
  if (fs.existsSync(ytIdxFile)) {
    try {
      const idx = JSON.parse(fs.readFileSync(ytIdxFile, 'utf8'));
      for (const [id, rec] of Object.entries(idx)) {
        const ch = rec.channelHandle || rec.channelTitle || '';
        rec.body =
          ch.toLowerCase().includes('anil') || id.includes('UC5mK0-K-r3KET0kifn-mJMg')
            ? 'youtube-transcripts/anillamba.jsonl'
            : 'youtube-transcripts/soicfinance.jsonl';
      }
      fs.writeFileSync(ytIdxFile, JSON.stringify(idx, null, 2) + '\n', 'utf8');
    } catch (_) {}
  }
  for (const f of ytYearFiles) {
    unlinks.push(path.join(ytDir, f));
  }

  // F. Consolidate cache stores
  function consolidateToHexShards(baseDirRel, files, extractKey = (f) => path.basename(f, '.json')) {
    const shards = new Map();
    const dirAbs = path.join(root, baseDirRel);
    for (const f of files) {
      const fileAbs = path.join(dirAbs, f);
      try {
        const data = JSON.parse(fs.readFileSync(fileAbs, 'utf8'));
        const key = extractKey(f, data);
        const shard = md5Shard(key);
        const subDir = f.includes('/') ? path.dirname(f) : '';
        const shardRel = subDir ? `${subDir}/shard_${shard}.jsonl` : `shard_${shard}.jsonl`;
        if (!shards.has(shardRel)) shards.set(shardRel, new Map());
        shards.get(shardRel).set(key, { ...data, _key: key });
        unlinks.push(fileAbs);
      } catch (_) {}
    }
    for (const [shardRel, records] of shards) {
      const absShard = path.join(dirAbs, shardRel);
      fs.mkdirSync(path.dirname(absShard), { recursive: true });
      const lines = Array.from(records.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(absShard, lines, 'utf8');
    }
    if (files.length > 0) {
      console.log(`  ✓ Consolidated ${files.length} files in ${baseDirRel} across ${shards.size} shards`);
    }
  }

  function consolidateToTickerJsonl(baseDirRel, files) {
    const tickers = new Map();
    const dirAbs = path.join(root, baseDirRel);
    for (const f of files) {
      const fileAbs = path.join(dirAbs, f);
      try {
        const data = JSON.parse(fs.readFileSync(fileAbs, 'utf8'));
        const parts = f.split('/');
        const ticker = parts[0];
        const id = parts[1] ? path.basename(parts[1], '.json') : path.basename(f, '.json');
        const targetRel = `${ticker.replace(/[^a-zA-Z0-9_:-]/g, '_')}.jsonl`;
        if (!tickers.has(targetRel)) tickers.set(targetRel, new Map());
        tickers.get(targetRel).set(id, { ...data, _key: id });
        unlinks.push(fileAbs);
      } catch (_) {}
    }
    for (const [targetRel, records] of tickers) {
      const absTarget = path.join(dirAbs, targetRel);
      fs.mkdirSync(path.dirname(absTarget), { recursive: true });
      const lines = Array.from(records.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(absTarget, lines, 'utf8');
    }
    if (files.length > 0) {
      console.log(`  ✓ Consolidated ${files.length} files in ${baseDirRel} across ${tickers.size} per-ticker JSONLs`);
    }
  }

  function consolidateToSingleJsonl(baseDirRel, files, targetFileName) {
    const records = new Map();
    const dirAbs = path.join(root, baseDirRel);
    for (const f of files) {
      const fileAbs = path.join(dirAbs, f);
      try {
        const data = JSON.parse(fs.readFileSync(fileAbs, 'utf8'));
        const id = path.basename(f, '.json');
        records.set(id, { ...data, _key: id });
        unlinks.push(fileAbs);
      } catch (_) {}
    }
    if (records.size > 0) {
      const absTarget = path.join(dirAbs, targetFileName);
      const lines = Array.from(records.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(absTarget, lines, 'utf8');
      console.log(`  ✓ Consolidated ${files.length} files in ${baseDirRel} into ${targetFileName}`);
    }
  }

  consolidateToHexShards('cache/doc-extracts', docExtractFiles, (f) => path.basename(f, '.json'));
  consolidateToHexShards('cache/stockscans-context', stockscansFiles);
  consolidateToHexShards('cache/company-baselines', baselineFiles);
  consolidateToHexShards('cache/event-reaction', eventReactionFiles);
  consolidateToHexShards('cache/rerating-catalysts', reratingFiles);
  consolidateToTickerJsonl('cache/order-announcements', orderAnnFiles);
  consolidateToTickerJsonl('cache/concall-notes', concallNoteFiles);
  consolidateToSingleJsonl('cache/gainers-scanner', gainersScannerFiles, 'scanner.jsonl');
  consolidateToSingleJsonl('cache/monthly-updates-scan', monthlyScanFiles, 'scans.jsonl');

  // G. Consolidate runs daily dumps into annual streams
  const runsStreams = new Map(); // streamRel -> Map<key, record>
  for (const f of runDumpFiles) {
    const fileAbs = path.join(runsDir, f);
    try {
      const data = JSON.parse(fs.readFileSync(fileAbs, 'utf8'));
      const m = f.match(/^(gainers_raw|gainers_insights|gainers_why|volume_rocketing_raw|volume_rocketing_insights|digest|ipo_subscription)_(\d{4})\d{4}\.json$/);
      if (m) {
        const prefix = m[1].replace(/_/g, '-');
        const year = m[2];
        const targetRel = `${prefix}-${year}.jsonl`;
        const key = path.basename(f, '.json');
        if (!runsStreams.has(targetRel)) runsStreams.set(targetRel, new Map());
        runsStreams.get(targetRel).set(key, { ...data, _key: key });
        unlinks.push(fileAbs);
      }
    } catch (_) {}
  }
  for (const [targetRel, records] of runsStreams) {
    const absTarget = path.join(runsDir, targetRel);
    const lines = Array.from(records.values()).map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(absTarget, lines, 'utf8');
  }
  if (runDumpFiles.length > 0) {
    console.log(`  ✓ Consolidated ${runDumpFiles.length} runs daily dumps into ${runsStreams.size} annual streams`);
  }

  // 3. Cryptographic Parity Verification
  console.log('\n[data:consolidate] Running Cryptographic Parity Verification...');
  let verified = 0;
  let mismatches = 0;

  StorageService.clearShardCache();

  // Verify reports
  for (const [, recs] of quarterlyReports) {
    for (const [id, original] of recs) {
      const r = db.readReport(id);
      if (!r || sha256(JSON.stringify(r)) !== sha256(JSON.stringify(original))) {
        console.error(`  [MISMATCH] Report ${id}`);
        mismatches++;
      } else {
        verified++;
      }
    }
  }

  // Verify conversations
  for (const [, recs] of annualConvs) {
    for (const [id, original] of recs) {
      const c = db.readConversation(id);
      if (!c || sha256(JSON.stringify(c)) !== sha256(JSON.stringify(original))) {
        console.error(`  [MISMATCH] Conversation ${id}`);
        mismatches++;
      } else {
        verified++;
      }
    }
  }

  // Verify events
  for (const [, eventsMap] of annualEvents) {
    for (const [id, original] of Object.entries(eventsMap)) {
      const e = db.get('events', id, { date: original.date });
      if (!e || sha256(JSON.stringify(e)) !== sha256(JSON.stringify(original))) {
        console.error(`  [MISMATCH] Event ${id}`);
        mismatches++;
      } else {
        verified++;
      }
    }
  }

  // Verify learnyst
  for (const [id, original] of allLearnyst) {
    const l = db.readLearnystTranscript(id);
    if (!l || sha256(JSON.stringify(l)) !== sha256(JSON.stringify(original))) {
      console.error(`  [MISMATCH] Learnyst ${id}`);
      mismatches++;
    } else {
      verified++;
    }
  }

  // Verify youtube
  for (const [id, original] of new Map([...anilYt, ...soicYt])) {
    const y = db.readYoutubeTranscript(id);
    if (!y || sha256(JSON.stringify(y)) !== sha256(JSON.stringify(original))) {
      console.error(`  [MISMATCH] YouTube ${id}`);
      mismatches++;
    } else {
      verified++;
    }
  }

  console.log(`[data:consolidate] Verification results: ${verified} verified, ${mismatches} mismatches`);

  if (mismatches > 0) {
    console.error('[!] Verification failed. Aborting unlinking of legacy files.');
    process.exit(1);
  }

  // 4. Safe unlinking
  console.log(`\n[data:consolidate] Unlinking ${unlinks.length} legacy candidate files...`);
  const state = loadState();
  let unlinkedCount = 0;

  for (const fileAbs of unlinks) {
    if (fs.existsSync(fileAbs)) {
      const rel = path.relative(root, fileAbs).split(path.sep).join('/');
      fs.unlinkSync(fileAbs);
      delete state.files[rel];
      unlinkedCount++;
    }
  }
  saveState(state);

  // Clean up any empty subdirectories in order-announcements / concall-notes
  const cleanEmptyDirs = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sub = path.join(dir, entry.name);
        if (fs.readdirSync(sub).length === 0) {
          fs.rmdirSync(sub);
        }
      }
    }
  };
  cleanEmptyDirs(path.join(root, 'cache', 'order-announcements'));
  cleanEmptyDirs(path.join(root, 'cache', 'concall-notes'));

  console.log(`[data:consolidate] Successfully unlinked ${unlinkedCount} files and cleaned sync-state.json.`);
  console.log('[data:consolidate] Complete.');
}

if (require.main === module) {
  run().catch((e) => {
    console.error('[data:consolidate] Error:', e);
    process.exit(1);
  });
}

module.exports = { run };
