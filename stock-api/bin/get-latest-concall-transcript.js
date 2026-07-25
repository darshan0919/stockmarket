#!/usr/bin/env node
'use strict';

/**
 * Primary entrypoint for concall-transcript-extractor. Script-first waterfall:
 *
 *   0. Compute "the latest quarter" = current quarter MINUS 1 (Indian FY:
 *      July => currently Q2 => latest = Q1). See ../src/utils/fiscalQuarter.js.
 *   1. GATE: does Stockscans' documents API have a Result filed for that
 *      quarter? If not, results aren't out yet — stop here, nothing else in
 *      this pipeline can be trusted (a "transcript" without results would be
 *      either stale or wrong).
 *   2. Is the OFFICIAL Transcript document for that quarter already filed?
 *      If yes, done — that's always the best source, no need to go further.
 *   3. Try Perplexity Finance (Quartr-sourced) — if it has a final,
 *      speaker-attributed transcript for the matching fiscalYear/fiscalPeriod
 *      event, use it directly. No further transcription needed; this tier
 *      IS a verbatim transcript, not just an audio pointer.
 *   4. Fall back to the recording-announcement pipeline (search for a
 *      "Recording" announcement, download its PDF) and hand off to the
 *      Chrome-MCP-driven NotebookLM step described in SKILL.md — this script
 *      cannot do that step itself (see SKILL.md for why).
 *
 * Every tier after 0/1 is tried in order and falls through silently to the
 * next on failure — a failure at tier 2 or 3 is expected/normal, not an error
 * to surface loudly, EXCEPT the tier-1 gate, which is a hard stop.
 *
 * Usage (single company — latest quarter):
 *   node get-latest-concall-transcript.js <TICKER> [--out-dir <dir>] [--force]
 *
 * Usage (single company — explicit quarter):
 *   node get-latest-concall-transcript.js <TICKER> --quarter Q1FY27 [--out-dir <dir>] [--force]
 *
 * Usage (bulk — multiple companies/quarters in one call):
 *   node get-latest-concall-transcript.js --bulk '[{"ticker":"NSE:X","quarter":"Q1FY27"},...]' [--out-dir <dir>] [--force]
 *   node get-latest-concall-transcript.js --bulk-file companies.json [--out-dir <dir>] [--force]
 *
 *   Bulk input JSON: array of {ticker: string, quarter?: string} objects.
 *   If quarter is omitted, latestCompletedQuarter() is used for that entry.
 *
 * Output (stdout, JSON) — single mode, one of:
 *   { status: "db-hit",                    ticker, quarter, id, summary }
 *   { status: "results-not-out",           ticker, quarter }
 *   { status: "official-transcript-exists", ticker, quarter, document: {...} }
 *   { status: "saved", tier: "perplexity-quartr", ticker, quarter, id, filesTouched }
 *   { status: "needs-recording-pipeline",  ticker, quarter, recording: {...} }
 *
 * Output (stdout, JSON) — bulk mode:
 *   Array of the above objects, one per input entry. Processing continues on
 *   per-entry errors (non-zero exit only if all entries fail).
 */

const path = require('path');
const fs = require('fs');
const { StockscansClient } = require('../src/clients/StockscansClient.js');
const { PerplexityClient, toPerplexityTicker } = require('../src/clients/PerplexityClient.js');
const { latestCompletedQuarter, parseQuarterString } = require('../src/utils/fiscalQuarter.js');
const { findRecordingAnnouncement } = require('./find-earnings-recording.js');
const { saveTranscript } = require('./save-concall-transcript.js');

function parseArgs(argv) {
  const out = { outDir: process.cwd(), force: false, quarter: null, bulk: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--force') out.force = true;
    else if (a === '--quarter') out.quarter = argv[++i]; // e.g. Q1FY27
    else if (a === '--bulk') out.bulk = JSON.parse(argv[++i]); // inline JSON array
    else if (a === '--bulk-file') out.bulk = JSON.parse(fs.readFileSync(argv[++i], 'utf8')); // file path
    else rest.push(a);
  }
  out.ticker = rest[0] || null;
  return out;
}

/**
 * Tier 0: check local DB for an existing early transcript for this
 * ticker + quarter. Reads the reports.json index directly (no network).
 * Returns the index entry if found, null otherwise.
 */
function findInDb(ticker, yyyymm) {
  try {
    const idxPath = path.join(__dirname, '../../data/reports.json');
    if (!fs.existsSync(idxPath)) return null;
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    const entries = Array.isArray(idx) ? idx : Object.values(idx);
    return (
      entries.find(
        (r) =>
          r.type === 'concall-transcript-early' &&
          r.companyId === ticker &&
          r.id.includes(yyyymm)
      ) || null
    );
  } catch {
    return null; // don't let a corrupt index block the pipeline
  }
}

/**
 * Tier 1 gate + tier 2 check: read Stockscans documents(), find this quarter's
 * Result and Transcript entries.
 */
async function checkStockscansDocuments(client, ticker, yyyymm) {
  const { documents } = await client.documents(ticker);
  const docs = documents || [];
  // Accept Result OR PPT as evidence that results are out — some companies
  // (e.g. OneSource) publish their investor PPT on results day while the
  // standalone Result PDF is indexed by Stockscans with a lag of hours/days.
  const result = docs.find(
    (d) => (d.documentType === 'Result' || d.documentType === 'PPT') && d.date === yyyymm
  );
  const transcript = docs.find((d) => d.documentType === 'Transcript' && d.date === yyyymm);
  return { result, transcript };
}

/**
 * Tier 3: Perplexity. Returns { ok: true, paragraphs, sourceUrl } on success
 * (raw `paragraphs`, NOT flattened text — saveTranscript builds the fixed
 * segments/fullText schema from these directly via transcriptSchema.js, so
 * per-turn timing/speaker data isn't lost to a flatten-then-reparse round
 * trip), or { ok: false, reason } — NEVER throws, since this tier is
 * explicitly soft/best-effort (see PerplexityClient.js / perplexityAuth.js).
 */
async function tryPerplexity(ticker, quarter) {
  let pplxTicker;
  try {
    pplxTicker = toPerplexityTicker(ticker);
  } catch (e) {
    return { ok: false, reason: e.message };
  }

  const client = new PerplexityClient();
  let events;
  try {
    events = await client.earningsEvents(pplxTicker);
  } catch (e) {
    return { ok: false, reason: `earningsEvents failed: ${e.message}` };
  }

  const event = (events || []).find(
    (ev) => ev.fiscalYear === quarter.fiscalYear && ev.fiscalPeriod === quarter.fiscalPeriod
  );
  if (!event) {
    return {
      ok: false,
      reason: `No matching Perplexity event for FY${quarter.fiscalYear} ${quarter.fiscalPeriod}`,
    };
  }
  // NOTE: deliberately NOT gating on event.actualRevenue/actualEps here — live
  // testing (2026-07-24, STLTECH.NS eventId 656796, same-day call) showed a
  // transcript can already be `status: "final"` while the events-list actuals
  // are still null (they lag). The transcript-fetch call below is the real
  // "is it ready" signal; trust that instead.

  let data;
  try {
    data = await client.transcript(pplxTicker, event.id);
  } catch (e) {
    return { ok: false, reason: `transcript fetch failed: ${e.message}` };
  }

  if (data.status !== 'final' || !data.paragraphs || !data.paragraphs.length) {
    return { ok: false, reason: `Transcript not ready (status: ${data.status})` };
  }

  return {
    ok: true,
    paragraphs: data.paragraphs,
    sourceUrl:
      data.audio || `https://www.perplexity.ai/finance/${pplxTicker}/earnings?eventId=${event.id}`,
  };
}

/**
 * Core single-company waterfall. Accepts an already-resolved `quarter` object
 * so callers can pass either the computed latest or an explicit parsed quarter.
 * Uses a shared `client` when provided (bulk mode) to avoid re-authenticating
 * for every entry.
 *
 * @param {string} ticker
 * @param {object} quarter - {yyyymm, fiscalYear, fiscalPeriod, quarterEndDate}
 * @param {{outDir: string, force: boolean, client?: object}} opts
 * @returns {Promise<object>} - result object (never throws; errors are returned as {status:"error"})
 */
async function fetchOne(ticker, quarter, { outDir, force, client: sharedClient } = {}) {
  try {
    // ── Tier 0: already in our DB? ─────────────────────────────────────────
    const existing = !force && findInDb(ticker, quarter.yyyymm);
    if (existing) {
      return {
        status: 'db-hit',
        ticker,
        quarter,
        id: existing.id,
        summary: existing.summary,
        note: `Transcript already saved in local DB (${existing.id}). Use readReport(id) or data/reports/${existing.id}.json. Re-run with --force to bypass.`,
      };
    }

    const client = sharedClient || new StockscansClient();
    if (!sharedClient) await client.validateAuth();

    // ── Tier 1 gate ─────────────────────────────────────────────────────────
    const { result, transcript } = await checkStockscansDocuments(client, ticker, quarter.yyyymm);
    if (!result) {
      return {
        status: 'results-not-out',
        ticker,
        quarter,
        note: `No Result or PPT filed for ${quarter.fiscalPeriod} FY${quarter.fiscalYear} (${quarter.yyyymm}) yet — stopping here.`,
      };
    }

    // ── Tier 2: official transcript already exists ──────────────────────────
    if (transcript) {
      return {
        status: 'official-transcript-exists',
        ticker,
        quarter,
        document: transcript,
        note: 'Stockscans already has the official Transcript filed — use stock-documents-fetcher to download it, no need to go further.',
      };
    }

    // ── Tier 3: Perplexity (Quartr) ─────────────────────────────────────────
    const pplx = await tryPerplexity(ticker, quarter);
    if (pplx.ok) {
      const saved = await saveTranscript({
        ticker,
        quarterDate: quarter.yyyymm,
        paragraphs: pplx.paragraphs,
        source: 'perplexity-quartr',
        fiscalYear: quarter.fiscalYear,
        fiscalPeriod: quarter.fiscalPeriod,
        sourceUrl: pplx.sourceUrl,
      });
      return { status: 'saved', tier: 'perplexity-quartr', ticker, quarter, ...saved };
    }

    // ── Tier 4: recording announcement -> hand off for Chrome MCP + NotebookLM
    const recording = await findRecordingAnnouncement(ticker, {
      outDir: path.join(outDir || process.cwd(), 'recordings'),
      sinceDays: 30,
      client,
    });
    return {
      status: 'needs-recording-pipeline',
      ticker,
      quarter,
      perplexitySkipReason: pplx.reason,
      recording,
      note: recording.found
        ? `Continue with SKILL.md steps 3-4 (Read the PDF, find the recording link, transcribe via NotebookLM through Chrome MCP), then run: node save-concall-transcript.js ${ticker} ${quarter.yyyymm} <transcript.txt> --fiscal-year ${quarter.fiscalYear} --fiscal-period ${quarter.fiscalPeriod}`
        : 'No recording announcement found either — nothing more this pipeline can do automatically for this quarter yet.',
    };
  } catch (err) {
    return { status: 'error', ticker, quarter, error: err.message };
  }
}

async function main() {
  const { ticker, outDir, force, quarter: quarterArg, bulk } = parseArgs(process.argv.slice(2));

  // ── Bulk mode ─────────────────────────────────────────────────────────────
  if (bulk) {
    if (!Array.isArray(bulk) || bulk.length === 0) {
      console.error('--bulk / --bulk-file must be a non-empty JSON array of {ticker, quarter?} objects');
      process.exit(1);
    }

    // Authenticate once, share the client across all entries
    const client = new StockscansClient();
    await client.validateAuth();

    const results = [];
    for (const entry of bulk) {
      if (!entry.ticker) {
        results.push({ status: 'error', entry, error: 'Missing ticker in bulk entry' });
        continue;
      }
      let q;
      try {
        q = entry.quarter ? parseQuarterString(entry.quarter) : latestCompletedQuarter();
      } catch (e) {
        results.push({ status: 'error', ticker: entry.ticker, error: e.message });
        continue;
      }
      const res = await fetchOne(entry.ticker, q, { outDir, force, client });
      results.push(res);
    }

    console.log(JSON.stringify(results, null, 2));
    const failed = results.filter((r) => r.status === 'error').length;
    if (failed === results.length) process.exit(1);
    return;
  }

  // ── Single mode ───────────────────────────────────────────────────────────
  if (!ticker) {
    console.error(
      'Usage:\n' +
        '  get-latest-concall-transcript.js <TICKER> [--quarter Q1FY27] [--out-dir <dir>] [--force]\n' +
        '  get-latest-concall-transcript.js --bulk \'[{"ticker":"NSE:X","quarter":"Q1FY27"},...]\' [--out-dir <dir>] [--force]\n' +
        '  get-latest-concall-transcript.js --bulk-file companies.json [--out-dir <dir>] [--force]'
    );
    process.exit(1);
  }

  let quarter;
  try {
    quarter = quarterArg ? parseQuarterString(quarterArg) : latestCompletedQuarter();
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }, null, 2));
    process.exit(1);
  }

  const result = await fetchOne(ticker, quarter, { outDir, force });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'error') process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: 'error', error: err.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { main, fetchOne, checkStockscansDocuments, tryPerplexity };
