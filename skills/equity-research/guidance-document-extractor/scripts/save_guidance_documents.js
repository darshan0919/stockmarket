#!/usr/bin/env node
'use strict';

/**
 * Persist guidance-document-extractor's per-company output (fetch manifest +
 * cheap-model relevance-filtered excerpts) as a durable DB record, so a
 * later, separate invocation of forward-guidance-extractor can read it
 * without depending on the same /tmp files still existing.
 *
 * Saves ONE record per company, ALWAYS -- including companies where nothing
 * was found at all (found: {Transcript:false, PPT:false, Result:false}).
 * This is deliberate: it lets Stage 3 (forward-guidance-extractor)
 * distinguish "this company was never run through guidance-document-extractor"
 * (no record at all -> prompt the user to run it) from "it WAS run, but no
 * documents/guidance exist for it" (record exists with empty excerpts ->
 * just note a no-visibility exclusion, never re-prompt).
 *
 * Usage:
 *   node save_guidance_documents.js --manifest /tmp/guidance_fetch_manifest.json \
 *     --excerpts-dir /tmp/guidance_excerpts   # optional, one <ticker>_relevant_excerpts.json per company
 *
 * `--manifest` is the JSON array fetch_guidance_documents.js printed to
 * stdout (save it to a file first: `... > manifest.json`).
 */
const fs = require('fs');
const path = require('path');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

function parseArgs(argv) {
  const out = { manifest: null, excerptsDir: null, creator: 'guidance-document-extractor' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--excerpts-dir') out.excerptsDir = argv[++i];
    else if (a === '--creator') out.creator = argv[++i];
  }
  return out;
}

function safeName(ticker) {
  return ticker.replace(/[:\-]/g, '_');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    console.error('Usage: save_guidance_documents.js --manifest <fetch-output.json> [--excerpts-dir <dir>]');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  const saved = [];
  for (const entry of manifest) {
    let excerpts = null;
    if (args.excerptsDir) {
      const p = path.join(args.excerptsDir, `${safeName(entry.ticker)}_relevant_excerpts.json`);
      if (fs.existsSync(p)) {
        try {
          excerpts = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (e) {
          excerpts = null;
        }
      }
    }
    const anyFound = Object.values(entry.found || {}).some(Boolean);
    const dto = {
      creator: args.creator,
      type: 'guidance-documents',
      date: today,
      companyId: entry.companyId || entry.ticker,
      quarter: entry.quarter,
      quarterYyyymm: entry.quarterYyyymm,
      found: entry.found,
      textPaths: entry.textPaths,
      retriedPriorQuarter: !!entry.retriedPriorQuarter,
      excerpts: excerpts ? excerpts.excerpts || [] : [],
      excerptsPending: args.excerptsDir ? !excerpts : true, // true = relevance-filter step hasn't run/saved yet
      scanRow: entry.scanRow || null,
      // no LLM involvement in THIS record's authorship (fetch is pure script;
      // excerpts, if present, were authored by the cheap-model filter pass
      // and that model should be attributed by whatever writes --excerpts-dir,
      // not invented here) -- explicitly no `modelUsed` on the fetch-only path.
      summary: anyFound
        ? `Fetched: ${Object.entries(entry.found).filter(([, v]) => v).map(([k]) => k).join('+')} for ${entry.quarter}`
        : `No Transcript/PPT/Result found for ${entry.quarter} (attempted, genuinely unavailable)`,
      contextUsed: [],
    };
    const id = db.saveReport(dto);
    saved.push({ companyId: dto.companyId, id, anyFound });
  }

  console.log(JSON.stringify({ saved: saved.length, records: saved }, null, 2));
}

main();
