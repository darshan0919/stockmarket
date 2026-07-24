#!/usr/bin/env node
'use strict';

/**
 * Step 5 of the concall-transcript-extractor workflow (script-first, no LLM).
 *
 * Persists a verbatim earnings-call transcript as a report DTO, per
 * docs/DATA_RULES.md. This is deliberately the ONLY code path allowed to
 * write this data — never write data/reports*.json by hand.
 *
 * Storage destination (docs/DATA_RULES.md §2): "Analysis/report DTO" row →
 * reports.json + reports/<id>.json body, via db.saveReport(dto).
 * type = "concall-transcript-early" distinguishes this from Stockscans' own
 * official "Transcript" PDF filing (documentType === "Transcript" in the
 * documents API) — this record exists to capture the transcript BEFORE that
 * official filing shows up (or duplicate it for Perplexity's segment-level
 * detail even once it does).
 *
 * FIXED CONTENT SCHEMA — every record, regardless of which tier produced it,
 * stores the transcript body as `{segments, fullText, participants, stats}`
 * via `transcriptSchema.js`'s `buildTranscriptContent()`. This is what makes
 * the collection robust/uniform across sources: a downstream reader never
 * needs to branch on `transcriptSource` to know how to parse the content —
 * only to know how much to trust it. See transcriptSchema.js for the exact
 * shape of a segment.
 *
 * Usage (CLI — always the NotebookLM/plain-text tier):
 *   node save-concall-transcript.js <TICKER> <QUARTER_DATE YYYYMM> <transcript.txt> \
 *     [--source-url <recording-url>] [--announcement-date YYYY-MM-DD]
 *
 * Programmatic usage (any tier — see saveTranscript() below) is what
 * get-latest-concall-transcript.js actually calls; it passes structured
 * `segments`/`paragraphs` directly when available (Perplexity) instead of
 * round-tripping through flattened text and re-parsing it.
 *
 * Ends by printing the touched-files manifest (docs/DATA_RULES.md §7). Caller
 * (the skill) must still run `node packages/jobs-runtime/scripts/data.js push`
 * as the final step of the run.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../packages/jobs-runtime/lib/db.js');
const { buildCompanyContext } = require('../../packages/jobs-runtime/lib/companyContext.js');
const { buildTranscriptContent } = require('../src/utils/transcriptSchema.js');

function parseArgs(argv) {
  const out = { sourceUrl: null, announcementDate: null, fiscalYear: null, fiscalPeriod: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source-url') out.sourceUrl = argv[++i];
    else if (a === '--announcement-date') out.announcementDate = argv[++i];
    else if (a === '--fiscal-year') out.fiscalYear = parseInt(argv[++i], 10);
    else if (a === '--fiscal-period') out.fiscalPeriod = argv[++i];
    else rest.push(a);
  }
  [out.ticker, out.quarterDate, out.transcriptPath] = rest;
  return out;
}

/**
 * Composable version — used by both the CLI (`main`) and
 * `get-latest-concall-transcript.js`. Pass exactly ONE of `segments` /
 * `paragraphs` / `transcript` (raw text) — see transcriptSchema.js's
 * `buildTranscriptContent()` for what each produces. Prefer `paragraphs`
 * (Perplexity's native shape) or `segments` over flattened text whenever the
 * caller already has structured data — don't round-trip through text and
 * re-parse it.
 * @param {Object} args
 * @param {string} args.ticker
 * @param {string} args.quarterDate - YYYYMM
 * @param {string} [args.transcript] - Raw text (NotebookLM output, or manually pasted).
 * @param {Array<Object>} [args.segments] - Pre-normalized segments.
 * @param {Array<Object>} [args.paragraphs] - Perplexity/Quartr's raw `paragraphs` array.
 * @param {string} [args.source] - Where this transcript came from — one of
 *   "stockscans-official" | "perplexity-quartr" | "notebooklm-audio". Recorded
 *   on the DTO as `transcriptSource` so downstream skills know how much to
 *   trust it and whether a better version might still be coming.
 * @param {number} [args.fiscalYear]
 * @param {'Q1'|'Q2'|'Q3'|'Q4'} [args.fiscalPeriod]
 * @param {string} [args.sourceUrl]
 * @param {string} [args.announcementDate] - YYYY-MM-DD
 * @returns {Promise<{ok:true,id:string,quarterDate:string,ticker:string,filesTouched:*}>}
 */
async function saveTranscript({
  ticker, quarterDate, transcript, segments, paragraphs,
  source = 'notebooklm-audio', fiscalYear, fiscalPeriod, sourceUrl, announcementDate,
}) {
  if (!ticker || !quarterDate) {
    throw new Error('saveTranscript requires ticker and quarterDate');
  }
  if (!/^\d{6}$/.test(quarterDate)) {
    throw new Error(`QUARTER_DATE must be YYYYMM (e.g. 202609), got: ${quarterDate}`);
  }

  const content = buildTranscriptContent({ segments, paragraphs, rawText: transcript });
  if (content.stats.charCount < 200) {
    throw new Error(`Transcript looks too short (${content.stats.charCount} chars) — refusing to save. Check the source output before retrying.`);
  }

  // Context-first (docs/DATA_RULES.md §5): pull existing company context so the
  // DTO can record what was already known, and so downstream skills that read
  // buildCompanyContext() see this transcript's presence reflected via the link.
  const contextUsed = [];
  try {
    const ctx = await buildCompanyContext(ticker);
    if (ctx && ctx.id) contextUsed.push(ctx.id);
  } catch (e) {
    // Non-fatal — a first-ever record for a company has no prior context.
  }

  const id = db.makeId('rpt', 'concall-transcript-extractor', ticker, quarterDate, 'early');
  const sourceLabel = {
    'stockscans-official': "Stockscans' own official Transcript filing",
    'perplexity-quartr': 'Quartr (via Perplexity Finance), speaker-attributed',
    'notebooklm-audio': 'the earnings-call recording audio, transcribed via NotebookLM',
  }[source] || source;
  const dto = {
    id,
    creator: 'concall-transcript-extractor',
    type: 'concall-transcript-early',
    date: announcementDate || `${quarterDate.slice(0, 4)}-${quarterDate.slice(4, 6)}-01`,
    companyId: ticker,
    summary: `Verbatim earnings-call transcript for ${ticker} (${quarterDate}), sourced from ${sourceLabel}. ${content.stats.segmentCount} segments, ${content.stats.speakerCount} speakers, ~${content.stats.wordCount} words.`,
    contextUsed,
    transcriptSource: source,
    sourceUrl: sourceUrl || null,
    quarterDate,
    fiscalYear: fiscalYear || null,
    fiscalPeriod: fiscalPeriod || null,
    // Fixed content schema — see transcriptSchema.js. Every record has this
    // exact shape no matter which tier produced it.
    segments: content.segments,
    fullText: content.fullText,
    participants: content.participants,
    stats: content.stats,
  };

  db.saveReport(dto);

  const filesTouched = db.touchedFiles();
  return { ok: true, id, quarterDate, ticker, filesTouched };
}

async function main() {
  const { ticker, quarterDate, transcriptPath, sourceUrl, announcementDate, fiscalYear, fiscalPeriod } =
    parseArgs(process.argv.slice(2));

  if (!ticker || !quarterDate || !transcriptPath) {
    console.error(
      'Usage: save-concall-transcript.js <TICKER> <QUARTER_DATE YYYYMM> <transcript.txt> ' +
      '[--source-url <url>] [--announcement-date YYYY-MM-DD] [--fiscal-year YYYY] [--fiscal-period Q1..Q4]'
    );
    process.exit(1);
  }
  if (!fs.existsSync(transcriptPath)) {
    console.error(`Transcript file not found: ${transcriptPath}`);
    process.exit(1);
  }

  const transcript = fs.readFileSync(transcriptPath, 'utf8');
  // CLI usage is always the NotebookLM/plain-text tier (tiers 1/2 are saved
  // programmatically by get-latest-concall-transcript.js with their own source
  // and structured segments/paragraphs).
  const result = await saveTranscript({
    ticker, quarterDate, transcript, source: 'notebooklm-audio', sourceUrl, announcementDate, fiscalYear, fiscalPeriod,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { main, saveTranscript };
