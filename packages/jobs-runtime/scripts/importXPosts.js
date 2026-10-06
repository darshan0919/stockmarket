#!/usr/bin/env node
'use strict';

/**
 * Import X timeline captures into the `x-posts` KB collection.
 *
 * Input: JSON files produced by tools/x-timeline-capture/capture.js, shape
 *   { handle, name?, capturedAt, rows: [...] }
 * (Chrome saves them as x-capture-<handle>-<date>.json in ~/Downloads.)
 *
 * Pure script, no LLM, no API keys. Idempotent: ids are deterministic per
 * (handle, rootId), so re-importing an overlapping capture upserts.
 *
 * Usage:
 *   node importXPosts.js <file.json> [<file2.json> ...]
 *   node importXPosts.js --dir ~/Downloads        # every x-capture-*.json in dir
 *   node importXPosts.js --dir ~/Downloads --dry-run
 */

const fs = require('fs');
const path = require('path');
const { buildDocs } = require('../lib/xPosts');
const { commitRows } = require('../lib/xCapture');

function parseArgs(argv) {
  const out = { files: [], dir: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else out.files.push(a);
  }
  return out;
}

function listCaptureFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^x-capture-.*\.json$/.test(f))
    .map((f) => path.join(dir, f));
}

function importFile(file, { dryRun }) {
  const cap = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!cap.handle || !Array.isArray(cap.rows)) {
    throw new Error(`${file}: expected { handle, rows[] }`);
  }
  const docs = buildDocs(cap.rows, cap.handle, { name: cap.name });
  const kinds = docs.reduce((m, d) => ((m[d.kind] = (m[d.kind] || 0) + 1), m), {});
  const dates = docs
    .map((d) => d.publishedAt)
    .filter(Boolean)
    .sort();
  const summary = {
    file: path.basename(file),
    handle: cap.handle,
    rows: cap.rows.length,
    docs: docs.length,
    kinds,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
  };
  if (!dryRun) {
    // Same write path as the extension: raw cache + touched-thread rebuild + coverage.
    const own = cap.rows
      .filter((r) => String(r.by || '').toLowerCase() === cap.handle.toLowerCase() && !r.pinned)
      .map((r) => new Date(r.at).getTime())
      .filter((t) => !Number.isNaN(t));
    const coverage = own.length
      ? {
          fromMs: Math.min(...own),
          toMs: new Date(cap.capturedAt || Date.now()).getTime(),
          exhausted: false,
        }
      : undefined;
    summary.commit = commitRows(cap.handle, cap.rows, { name: cap.name, coverage });
  }
  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = [...args.files];
  if (args.dir)
    files.push(...listCaptureFiles(path.resolve(args.dir.replace(/^~/, process.env.HOME))));
  if (!files.length) {
    console.error('No capture files given. Use <file...> or --dir <folder>.');
    process.exit(1);
  }
  for (const f of files) console.log(JSON.stringify(importFile(f, args)));
  if (args.dryRun) console.log('(dry run — nothing written)');
}

if (require.main === module) main();
module.exports = { importFile, listCaptureFiles };
