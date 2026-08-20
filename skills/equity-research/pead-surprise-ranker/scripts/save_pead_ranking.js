#!/usr/bin/env node
'use strict';

/**
 * Step 5 (deterministic, no LLM) for pead-surprise-ranker.
 *
 * Persists the ranked+scored screen as a report DTO, per docs/DATA_RULES.md
 * §2 ("Analysis/report DTO" row -> reports.json + reports/<id>.json body, via
 * db.saveReport). type = "pead-ranking". This is a multi-company report
 * (companyIds, not companyId) since it screens a whole batch at once.
 *
 * contextUsed is populated from the forward-guidance report ids the ranking
 * actually read (both forward-guidance-extractor's transcript-sourced items
 * and guidance-ppt-fallback's PPT-sourced items) -- per conventions.md §8,
 * every report generated FROM other reports must cite which ones.
 *
 * Usage:
 *   node save_pead_ranking.js --date 2026-08-06 --batch-name "Batch 1" \
 *     --ranked-file ranked.json --excluded-file excluded.json \
 *     --guidance-report-ids id1,id2,id3,... \
 *     --xlsx-path /tmp/PEAD_Ranking_20260806.xlsx \
 *     --model claude-sonnet-5
 */
const fs = require('fs');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') out.date = argv[++i];
    else if (a === '--batch-name') out.batchName = argv[++i];
    else if (a === '--ranked-file') out.rankedFile = argv[++i];
    else if (a === '--excluded-file') out.excludedFile = argv[++i];
    else if (a === '--guidance-report-ids')
      out.guidanceReportIds = argv[++i].split(',').filter(Boolean);
    else if (a === '--xlsx-path') out.xlsxPath = argv[++i];
    else if (a === '--model') out.model = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date || !args.rankedFile || !args.excludedFile || !args.model) {
    console.error(
      'Usage: node save_pead_ranking.js --date <YYYY-MM-DD> [--batch-name <name>] --ranked-file <path> --excluded-file <path> [--guidance-report-ids id1,id2,...] [--xlsx-path <path>] --model <model>'
    );
    process.exit(1);
  }

  const ranked = JSON.parse(fs.readFileSync(args.rankedFile, 'utf8'));
  const excluded = JSON.parse(fs.readFileSync(args.excludedFile, 'utf8'));
  const companyIds = [...ranked.map((r) => r.ticker), ...excluded.map((e) => e.ticker)];

  const dto = {
    companyIds,
    type: 'pead-ranking',
    date: args.date,
    creator: 'pead-surprise-ranker',
    batchName: args.batchName || null,
    ranked,
    excluded,
    xlsxPath: args.xlsxPath || null,
    modelUsed: args.model,
    summary: `PEAD surprise ranking over ${companyIds.length} companies (${ranked.length} ranked, ${excluded.length} excluded for no visibility)`,
    contextUsed: args.guidanceReportIds || [],
  };

  const id = db.saveReport(dto);
  console.log(
    JSON.stringify(
      { id, companyCount: companyIds.length, touchedFiles: db.touchedFiles() },
      null,
      2
    )
  );
}

main();
