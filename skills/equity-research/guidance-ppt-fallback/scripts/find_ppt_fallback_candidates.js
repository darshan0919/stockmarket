#!/usr/bin/env node
'use strict';

/**
 * Step 1 (deterministic, no LLM) for guidance-ppt-fallback.
 *
 * Scans the `reports` collection (via db.js) for forward-guidance DTOs at a
 * given quarter and returns the subset that still needs a PPT check: either
 * no transcript was available at all (`transcriptAvailable: false`), or a
 * transcript existed but yielded zero explicit guidance items
 * (`guidance: []`). A company already carrying a PPT-sourced record for the
 * SAME quarter (guidance items with `source: "PPT"`, or an empty PPT-checked
 * record — see forward-guidance-extractor's save_forward_guidance.js
 * `--transcript-available false` usage) is skipped by default, since Step 4
 * of guidance-ppt-fallback already ran for it; pass --force to re-check
 * anyway (e.g. a PPT was filed since the last run).
 *
 * Usage:
 *   node find_ppt_fallback_candidates.js --quarter Q4FY26
 *   node find_ppt_fallback_candidates.js --quarter Q4FY26 --tickers NSE:A,NSE:B
 *   node find_ppt_fallback_candidates.js --quarter Q4FY26 --force
 *
 * Output (stdout): JSON array of { ticker, quarter } candidates.
 */

const db = require('../../../../packages/jobs-runtime/lib/db.js');

function parseArgs(argv) {
  const out = { quarter: null, tickers: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quarter') out.quarter = argv[++i];
    else if (a === '--tickers') out.tickers = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--force') out.force = true;
  }
  if (!out.quarter) {
    console.error(
      'Usage: find_ppt_fallback_candidates.js --quarter Q4FY26 [--tickers NSE:A,NSE:B] [--force]'
    );
    process.exit(1);
  }
  return out;
}

function main() {
  const { quarter, tickers, force } = parseArgs(process.argv.slice(2));

  // Slim index entries (reports.json) only carry `date` (the calendar date the
  // record was WRITTEN, not the fiscal quarter it's ABOUT) — `quarter` only
  // lives in the full body. So pull every forward-guidance slim entry, then
  // load bodies and filter on the real `quarter` field there.
  const slim = db.find('reports', { type: 'forward-guidance' });
  const byTicker = new Map();
  for (const r of slim) {
    const full = db.readReport(r.id) || r;
    const ticker = full.companyId;
    if (full.quarter !== quarter) continue;
    if (tickers && !tickers.includes(ticker)) continue;
    // Keep the most recently modified record per ticker.
    const prev = byTicker.get(ticker);
    if (!prev || (full.modifiedTime || '') > (prev.modifiedTime || '')) byTicker.set(ticker, full);
  }

  const candidates = [];
  for (const [ticker, dto] of byTicker) {
    const guidance = dto.guidance || [];
    const hasPptAlready = guidance.some((g) => g.source === 'PPT') || dto.pptChecked === true;
    if (hasPptAlready && !force) continue;
    const noTranscript = dto.transcriptAvailable === false;
    const emptyGuidance = guidance.length === 0;
    if (noTranscript || emptyGuidance || force) {
      candidates.push({ ticker, quarter });
    }
  }

  // Tickers requested explicitly but with NO forward-guidance record at all
  // for this quarter (e.g. forward-guidance-extractor was never run on them)
  // still need a PPT check — include them too.
  if (tickers) {
    for (const t of tickers) {
      if (!byTicker.has(t)) candidates.push({ ticker: t, quarter });
    }
  }

  console.log(JSON.stringify(candidates, null, 2));
}

main();
