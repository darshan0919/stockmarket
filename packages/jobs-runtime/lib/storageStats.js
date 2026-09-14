'use strict';

/**
 * storageStats.js — Generates and formats collection and cache storage statistics.
 *
 * Scans all stores across data/ and returns a structured breakdown:
 * - Collection: Name / relative path
 * - Scope: Collection | Transcripts | Cache | Runs
 * - Total Size: Human-readable bytes (KB / MB)
 * - File Count: Number of files
 * - Storage Design: Strategy (Quarterly JSONL, 16 Hex Shards, Single JSONL, etc.)
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function getDirStats(dirPath, filterFn = () => true) {
  if (!fs.existsSync(dirPath)) return { bytes: 0, count: 0 };
  let bytes = 0;
  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.includes('.tmp.') || e.name.includes('.corrupt.'))
      continue;
    const full = path.join(dirPath, e.name);
    if (e.isFile() && filterFn(e.name, full)) {
      try {
        bytes += fs.statSync(full).size;
        count++;
      } catch (_) {
        // file unreadable or unlinked concurrently
      }
    } else if (e.isDirectory() && filterFn(e.name, full)) {
      const sub = getDirStats(full, filterFn);
      bytes += sub.bytes;
      count += sub.count;
    }
  }
  return { bytes, count };
}

function getFileStats(filePath) {
  if (!fs.existsSync(filePath)) return { bytes: 0, count: 0 };
  try {
    return { bytes: fs.statSync(filePath).size, count: 1 };
  } catch (_) {
    // file unreadable or unlinked concurrently
    return { bytes: 0, count: 0 };
  }
}

/**
 * Collect storage statistics across all stores in dataRoot.
 * @param {string} [dataRoot]
 * @returns {Array<{ collection: string, scope: string, totalBytes: number, fileCount: number, storageDesign: string }>}
 */
function getCollectionStorageStats(dataRoot = db.dataRoot()) {
  const root = dataRoot;
  const stats = [];

  // Helper to add a row
  function addRow(collection, scope, totalBytes, fileCount, storageDesign) {
    stats.push({
      collection,
      scope,
      totalBytes,
      fileCount,
      storageDesign,
    });
  }

  // 1. Primary Collections
  // Reports
  const rptDir = getDirStats(path.join(root, 'reports'), (f) => f.endsWith('.jsonl'));
  const rptIdx = getFileStats(path.join(root, 'reports.json'));
  addRow(
    'reports',
    'Collection',
    rptDir.bytes + rptIdx.bytes,
    rptDir.count + rptIdx.count,
    'Quarterly JSONL'
  );

  // Conversations
  const convDir = getDirStats(path.join(root, 'conversations'), (f) => f.endsWith('.jsonl'));
  const convIdx = getFileStats(path.join(root, 'conversations.json'));
  addRow(
    'conversations',
    'Collection',
    convDir.bytes + convIdx.bytes,
    convDir.count + convIdx.count,
    'Annual JSONL'
  );

  // Events
  const evtStats = getDirStats(root, (f) => /^events-\d{4}\.json$/.test(f));
  addRow('events', 'Collection', evtStats.bytes, evtStats.count, 'Annual JSON');

  // Companies
  const compStats = getFileStats(path.join(root, 'companies.json'));
  addRow('companies', 'Collection', compStats.bytes, compStats.count, 'Single JSON');

  // Notes
  const notesStats = getFileStats(path.join(root, 'notes.json'));
  addRow('notes', 'Collection', notesStats.bytes, notesStats.count, 'Single JSON');

  // Theses
  const thesisStats = getFileStats(path.join(root, 'theses.json'));
  const thesisHist = getFileStats(path.join(root, 'thesis-history.jsonl'));
  addRow(
    'theses',
    'Collection',
    thesisStats.bytes + thesisHist.bytes,
    thesisStats.count + thesisHist.count,
    'Single JSON + History'
  );

  // Validation
  const valStats = getFileStats(path.join(root, 'validation.json'));
  addRow('validation', 'Collection', valStats.bytes, valStats.count, 'Single JSON');

  // Prompts
  const promptStats = getFileStats(path.join(root, 'prompts.json'));
  addRow('prompts', 'Collection', promptStats.bytes, promptStats.count, 'Single JSON');

  // IPOs
  const ipoStats = getFileStats(path.join(root, 'ipos.json'));
  addRow('ipos', 'Collection', ipoStats.bytes, ipoStats.count, 'Single JSON');

  // Investors
  const supStats = getFileStats(path.join(root, 'supportive-investors.json'));
  const unsupStats = getFileStats(path.join(root, 'unsupportive-investors.json'));
  addRow(
    'investors',
    'Collection',
    supStats.bytes + unsupStats.bytes,
    supStats.count + unsupStats.count,
    'Single JSON'
  );

  // Tasks
  const taskStats = getFileStats(path.join(root, 'tasks.json'));
  addRow('tasks', 'Collection', taskStats.bytes, taskStats.count, 'Single JSON');

  // 2. Transcripts
  // Learnyst Lessons
  const lytDir = getDirStats(path.join(root, 'learnyst-lessons'), (f) => f.endsWith('.jsonl'));
  const lytIdx = getFileStats(path.join(root, 'learnyst-lessons.json'));
  addRow(
    'learnyst-lessons',
    'Transcripts',
    lytDir.bytes + lytIdx.bytes,
    lytDir.count + lytIdx.count,
    '16 Hex Shards'
  );

  // YouTube Transcripts
  const yttDir = getDirStats(path.join(root, 'youtube-transcripts'), (f) => f.endsWith('.jsonl'));
  const yttIdx = getFileStats(path.join(root, 'youtube-transcripts.json'));
  addRow(
    'youtube-transcripts',
    'Transcripts',
    yttDir.bytes + yttIdx.bytes,
    yttDir.count + yttIdx.count,
    '16 Hex Shards'
  );

  // 3. Cache Stores
  const cacheSharded = [
    { name: 'cache/pdf-text', design: '16 Hex Shards' },
    { name: 'cache/pdf-text-full', design: '16 Hex Shards' },
    { name: 'cache/monthly-updates-text', design: '16 Hex Shards' },
  ];
  for (const cs of cacheSharded) {
    const s = getDirStats(path.join(root, cs.name), (f) => f.endsWith('.jsonl'));
    addRow(cs.name, 'Cache', s.bytes, s.count, cs.design);
  }

  const cacheSingle = [
    { name: 'cache/monthly-updates-parsed', design: 'Single JSONL' },
    { name: 'cache/doc-extracts', design: 'Single JSONL / Category' },
    { name: 'cache/stockscans-context', design: 'Single JSONL' },
    { name: 'cache/company-baselines', design: 'Single JSONL' },
    { name: 'cache/event-reaction', design: 'Single JSONL' },
    { name: 'cache/order-announcements', design: 'Single JSONL' },
    { name: 'cache/concall-notes', design: 'Single JSONL' },
    { name: 'cache/rerating-catalysts', design: 'Single JSONLs' },
    { name: 'cache/gainers-scanner', design: 'Single JSONL' },
    { name: 'cache/monthly-updates-scan', design: 'Single JSONL' },
  ];
  for (const cs of cacheSingle) {
    const s = getDirStats(path.join(root, cs.name), (f) => f.endsWith('.jsonl'));
    addRow(cs.name, 'Cache', s.bytes, s.count, cs.design);
  }

  // 4. Runs
  const runsStreams = getDirStats(path.join(root, 'runs'), (f) => f.endsWith('.jsonl'));
  addRow('runs/daily-streams', 'Runs', runsStreams.bytes, runsStreams.count, 'Annual Streams');

  const runsSeeds = getDirStats(path.join(root, 'runs'), (f) => f.includes('_research_seed_'));
  addRow('runs/research-seeds', 'Runs', runsSeeds.bytes, runsSeeds.count, 'Dated Daily Dumps');

  return stats;
}

/**
 * Render the collection storage statistics as a formatted text table.
 * @param {Array<{ collection: string, scope: string, totalBytes: number, fileCount: number, storageDesign: string }>} stats
 * @returns {string}
 */
function renderStorageStatsTable(stats) {
  const colW = {
    collection: 30,
    scope: 13,
    totalSize: 12,
    fileCount: 12,
    storageDesign: 26,
  };

  const padR = (str, len) => String(str).padEnd(len);
  const padL = (str, len) => String(str).padStart(len);

  const topBorder = `┌${'─'.repeat(colW.collection + 2)}┬${'─'.repeat(colW.scope + 2)}┬${'─'.repeat(colW.totalSize + 2)}┬${'─'.repeat(colW.fileCount + 2)}┬${'─'.repeat(colW.storageDesign + 2)}┐`;
  const midBorder = `├${'─'.repeat(colW.collection + 2)}┼${'─'.repeat(colW.scope + 2)}┼${'─'.repeat(colW.totalSize + 2)}┼${'─'.repeat(colW.fileCount + 2)}┼${'─'.repeat(colW.storageDesign + 2)}┤`;
  const botBorder = `└${'─'.repeat(colW.collection + 2)}┴${'─'.repeat(colW.scope + 2)}┴${'─'.repeat(colW.totalSize + 2)}┴${'─'.repeat(colW.fileCount + 2)}┴${'─'.repeat(colW.storageDesign + 2)}┘`;

  const header = `│ ${padR('Collection', colW.collection)} │ ${padR('Scope', colW.scope)} │ ${padL('Total Size', colW.totalSize)} │ ${padL('File Count', colW.fileCount)} │ ${padR('Storage Design', colW.storageDesign)} │`;

  let grandBytes = 0;
  let grandFiles = 0;

  const rows = stats.map((r) => {
    grandBytes += r.totalBytes;
    grandFiles += r.fileCount;
    const fileCountStr = r.fileCount === 1 ? '1 file' : `${r.fileCount} files`;
    return `│ ${padR(r.collection, colW.collection)} │ ${padR(r.scope, colW.scope)} │ ${padL(formatBytes(r.totalBytes), colW.totalSize)} │ ${padL(fileCountStr, colW.fileCount)} │ ${padR(r.storageDesign, colW.storageDesign)} │`;
  });

  const totalRow = `│ ${padR('TOTAL (' + stats.length + ' stores)', colW.collection)} │ ${padR('All Scopes', colW.scope)} │ ${padL(formatBytes(grandBytes), colW.totalSize)} │ ${padL(grandFiles + ' files', colW.fileCount)} │ ${padR('100 KB – 10 MB Sweet Spot', colW.storageDesign)} │`;

  return [
    '',
    '📊 COLLECTION STORAGE DESIGN & SIZING SUMMARY',
    topBorder,
    header,
    midBorder,
    ...rows,
    midBorder,
    totalRow,
    botBorder,
    '',
  ].join('\n');
}

/**
 * Print the collection storage stats table to console.
 * @param {string} [dataRoot]
 */
function printStorageStatsTable(dataRoot = db.dataRoot()) {
  const stats = getCollectionStorageStats(dataRoot);
  console.log(renderStorageStatsTable(stats));
}

module.exports = {
  formatBytes,
  getCollectionStorageStats,
  renderStorageStatsTable,
  printStorageStatsTable,
};

if (require.main === module) {
  printStorageStatsTable();
}
