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
 * Usage:
 *   node get-latest-concall-transcript.js <TICKER> [--out-dir <dir>]
 *
 * Output (stdout, JSON) — one of:
 *   { status: "results-not-out", ticker, quarter }
 *   { status: "official-transcript-exists", ticker, quarter, document: {...} }
 *   { status: "saved", tier: "perplexity-quartr", ticker, quarter, id, filesTouched }
 *   { status: "needs-recording-pipeline", ticker, quarter, recording: {...} }
 *   { status: "needs-recording-pipeline", ticker, quarter, recording: { found: false } }
 */

const path = require('path');
const { StockscansClient } = require('../src/clients/StockscansClient.js');
const { PerplexityClient, toPerplexityTicker } = require('../src/clients/PerplexityClient.js');
const { latestCompletedQuarter } = require('../src/utils/fiscalQuarter.js');
const { findRecordingAnnouncement } = require('./find-earnings-recording.js');
const { saveTranscript } = require('./save-concall-transcript.js');

function parseArgs(argv) {
  const out = { outDir: process.cwd() };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-dir') out.outDir = argv[++i];
    else rest.push(a);
  }
  out.ticker = rest[0];
  return out;
}

/**
 * Tier 1 gate + tier 2 check: read Stockscans documents(), find this quarter's
 * Result and Transcript entries.
 */
async function checkStockscansDocuments(client, ticker, yyyymm) {
  const { documents } = await client.documents(ticker);
  const docs = documents || [];
  const result = docs.find((d) => d.documentType === 'Result' && d.date === yyyymm);
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

async function main() {
  const { ticker, outDir } = parseArgs(process.argv.slice(2));
  if (!ticker) {
    console.error('Usage: get-latest-concall-transcript.js <TICKER> [--out-dir <dir>]');
    process.exit(1);
  }

  const quarter = latestCompletedQuarter();
  const client = new StockscansClient();
  await client.validateAuth();

  // ── Tier 1 gate ──────────────────────────────────────────────────────────
  const { result, transcript } = await checkStockscansDocuments(client, ticker, quarter.yyyymm);
  if (!result) {
    console.log(
      JSON.stringify(
        {
          status: 'results-not-out',
          ticker,
          quarter,
          note: `No Result filed for ${quarter.fiscalPeriod} FY${quarter.fiscalYear} (${quarter.yyyymm}) yet — stopping here.`,
        },
        null,
        2
      )
    );
    return;
  }

  // ── Tier 2: official transcript already exists ──────────────────────────
  if (transcript) {
    console.log(
      JSON.stringify(
        {
          status: 'official-transcript-exists',
          ticker,
          quarter,
          document: transcript,
          note: 'Stockscans already has the official Transcript filed — use stock-documents-fetcher to download it, no need to go further.',
        },
        null,
        2
      )
    );
    return;
  }

  // ── Tier 3: Perplexity (Quartr) ──────────────────────────────────────────
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
    console.log(
      JSON.stringify(
        { status: 'saved', tier: 'perplexity-quartr', ticker, quarter, ...saved },
        null,
        2
      )
    );
    return;
  }

  // ── Tier 4: recording announcement -> hand off for Chrome MCP + NotebookLM ─
  const recording = await findRecordingAnnouncement(ticker, {
    outDir: path.join(outDir, 'recordings'),
    sinceDays: 30, // wider window here — we already know results are out
    client,
  });
  console.log(
    JSON.stringify(
      {
        status: 'needs-recording-pipeline',
        ticker,
        quarter,
        perplexitySkipReason: pplx.reason,
        recording,
        note: recording.found
          ? `Continue with SKILL.md steps 3-4 (Read the PDF, find the recording link, transcribe via NotebookLM through Chrome MCP), then run: node save-concall-transcript.js ${ticker} ${quarter.yyyymm} <transcript.txt> --fiscal-year ${quarter.fiscalYear} --fiscal-period ${quarter.fiscalPeriod}`
          : 'No recording announcement found either — nothing more this pipeline can do automatically for this quarter yet.',
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: 'error', error: err.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { main, checkStockscansDocuments, tryPerplexity };
