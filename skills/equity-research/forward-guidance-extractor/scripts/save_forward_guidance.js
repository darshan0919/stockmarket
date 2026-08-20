#!/usr/bin/env node
'use strict';

/**
 * Step 4 (deterministic, no LLM) for forward-guidance-extractor.
 *
 * Persists one company's extracted forward-guidance as a report DTO, per
 * docs/DATA_RULES.md §2 ("Analysis/report DTO" row -> reports.json +
 * reports/<id>.json body, via db.saveReport). This is the ONLY code path
 * allowed to write this data -- never hand-write data/reports*.json.
 *
 * type = "forward-guidance" distinguishes this from the raw
 * "concall-transcript-early"/official Transcript records the guidance was
 * read from -- this record stores the ANALYST OUTPUT (extracted + computed
 * guidance), not the source document itself.
 *
 * Usage:
 *   node save_forward_guidance.js --ticker NSE:X --quarter Q1FY27 \
 *     --date 2026-07-15 --guidance-file enriched.json \
 *     [--transcript-id rpt_...] [--transcript-available true|false] \
 *     [--stale-note "Q4FY26 guidance referenced but that transcript is not in DB"]
 *
 * `enriched.json` is the array produced by compute_guidance_value.py.
 *
 * Prints the saved DTO id and the touched-files manifest (DATA_RULES.md §7).
 * The skill's final step must still run `node packages/jobs-runtime/scripts/data.js push`.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../../../packages/jobs-runtime/lib/db.js');
const { buildCompanyContext } = require('../../../../packages/jobs-runtime/lib/companyContext.js');

function parseArgs(argv) {
  const out = { transcriptId: null, transcriptAvailable: true, staleNote: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticker') out.ticker = argv[++i];
    else if (a === '--quarter') out.quarter = argv[++i];
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--guidance-file') out.guidanceFile = argv[++i];
    else if (a === '--transcript-id') out.transcriptId = argv[++i];
    else if (a === '--transcript-available') out.transcriptAvailable = argv[++i] !== 'false';
    else if (a === '--stale-note') out.staleNote = argv[++i];
    else if (a === '--model') out.model = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ticker || !args.quarter || !args.date || !args.guidanceFile) {
    console.error(
      'Usage: node save_forward_guidance.js --ticker <T> --quarter <Q> --date <YYYY-MM-DD> --guidance-file <path> [--transcript-id <id>] [--transcript-available true|false] [--stale-note <text>]'
    );
    process.exit(1);
  }

  const guidance = JSON.parse(fs.readFileSync(args.guidanceFile, 'utf8'));
  let context = { reports: [], notes: [], thesis: null, events: [], validations: [] };
  try {
    context = buildCompanyContext(args.ticker) || context;
  } catch (e) {
    // buildCompanyContext is best-effort context, not a hard dependency
    console.error(`buildCompanyContext failed for ${args.ticker}: ${e.message}`);
  }
  const contextUsed = [
    ...(context.reports || []).map((r) => r.id),
    ...(context.notes || []).map((n) => n.id),
  ].filter(Boolean);

  const dto = {
    companyId: args.ticker,
    type: 'forward-guidance',
    date: args.date,
    creator: 'forward-guidance-extractor',
    quarter: args.quarter,
    sourceTranscriptId: args.transcriptId,
    transcriptAvailable: args.transcriptAvailable,
    staleGuidanceNote: args.staleNote,
    guidance,
    contextUsed,
    summary: `${guidance.length} confirmed forward-guidance point(s) extracted for ${args.ticker} (${args.quarter})`,
  };
  // modelUsed (skills/tooling/output-dto-standard/SKILL.md): the guidance values
  // above were extracted by an LLM reading the transcript (Phase 2/3), even though
  // this save step itself is deterministic — so the DTO still needs it.
  if (args.model) dto.modelUsed = args.model;

  const id = db.saveReport(dto);
  const touched = db.touchedFiles ? db.touchedFiles() : [];
  console.log(
    JSON.stringify(
      { id, ticker: args.ticker, quarter: args.quarter, touchedFiles: touched },
      null,
      2
    )
  );
}

main();
