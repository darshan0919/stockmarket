#!/usr/bin/env node
'use strict';

/**
 * Persist quarterly-result-extractor's per-company output (fetch manifest +
 * income-statement signal scan + tone/guidance/strategic excerpts) as a
 * durable DB record, so a later, separate invocation of
 * quarterly-result-analysis can read it without depending on the same /tmp
 * files or session still existing.
 *
 * Saves ONE record, ALWAYS -- including a genuine "results not out yet"
 * outcome (manifest.notYetOut). This lets quarterly-result-analysis tell
 * "never run" (no record at all -> auto-invoke this skill or prompt the
 * user) apart from "run, results genuinely not filed yet" (record exists,
 * notYetOut: true -> don't re-run, just say so).
 *
 * Usage:
 *   node save_result_documents.js --manifest <manifest.json> \
 *     --signals <income_statement_signals.json> \
 *     --excerpts <excerpts.json> \
 *     [--model-used claude-sonnet-5]     # only if Step 3 involved LLM judgment beyond recall
 */
const fs = require('fs');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

function parseArgs(argv) {
  const out = { manifest: null, signals: null, excerpts: null, creator: 'quarterly-result-extractor' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--signals') out.signals = argv[++i];
    else if (a === '--excerpts') out.excerpts = argv[++i];
    else if (a === '--creator') out.creator = argv[++i];
  }
  return out;
}

function readJsonIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    console.error('Usage: save_result_documents.js --manifest <manifest.json> [--signals <file>] [--excerpts <file>]');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const signals = readJsonIfExists(args.signals);
  const excerpts = readJsonIfExists(args.excerpts);
  const today = new Date().toISOString().slice(0, 10);

  const dto = {
    creator: args.creator,
    type: 'quarterly-result-documents',
    date: today,
    companyId: manifest.companyId || manifest.ticker,
    quarter: manifest.quarter || null,
    found: manifest.found,
    transcriptMissing: !!manifest.transcriptMissing,
    notYetOut: !!manifest.notYetOut,
    incomeStatementSignals: signals || null,
    toneExcerpts: excerpts ? excerpts.toneExcerpts || [] : [],
    guidanceExcerpts: excerpts ? excerpts.guidanceExcerpts || [] : [],
    strategicExcerpts: excerpts ? excerpts.strategicExcerpts || [] : [],
    possiblyDropped: excerpts ? excerpts.possiblyDropped || [] : [],
    excerptsPending: !excerpts && !manifest.notYetOut,
    summary: manifest.notYetOut
      ? `Results not yet filed for ${manifest.ticker}`
      : `Fetched ${Object.entries(manifest.found || {}).filter(([, v]) => v).map(([k]) => k).join('+')} for ${manifest.quarter || 'latest quarter'}`,
    contextUsed: [],
    // no modelUsed: Step 1/2/4 are pure script, Step 3 is recall-first
    // excerpting (not judgment) -- see SKILL.md's cheap-tier note. Pass
    // --model-used explicitly only if that convention changes.
  };

  const id = db.saveReport(dto);
  console.log(JSON.stringify({ companyId: dto.companyId, id, notYetOut: dto.notYetOut }, null, 2));
}

main();
