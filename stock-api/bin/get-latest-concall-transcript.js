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
const { findRecordingAnnouncement, findRecordingAnnouncementsBulk } = require('./find-earnings-recording.js');
const { saveTranscript } = require('./save-concall-transcript.js');
const { mapWithConcurrency } = require('../src/utils/concurrency.js');
const { scanAnnouncementsForCompanies, computeReleaseQuarterDate } = require('../src/utils/bulkAnnouncementScan.js');

// Bulk-mode fan-out for the Perplexity tier (no bulk API exists there, so we
// bound concurrency instead of firing 1000 requests at once or awaiting them
// one at a time). Perplexity's cookie/cf_clearance auth is explicitly
// fragile (see SKILL.md tier 3 notes) — keep this conservative rather than
// maximizing throughput; a banned session costs far more time than it saves.
const BULK_CONCURRENCY = parseInt(process.env.CONCALL_BULK_CONCURRENCY || '5', 10);

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
 * Historical-quarter path — deliberately DIFFERENT from the current-quarter
 * waterfall, per explicit product decision: for a quarter that isn't the
 * current results season, the Result/PPT must already exist (a historical
 * quarter can't still be "not reported"), so the Tier-1 gate is skipped
 * entirely, and Perplexity/NotebookLM are never attempted — those tiers
 * exist to beat Stockscans' official filing to the punch, which is
 * meaningless for a quarter that reported long ago. This function only
 * ever looks for the transcript (Tier 0 DB, then Tier 2 official Transcript
 * — via bulk scan first, falling back to the authoritative per-company
 * `documents()` check for anything the bulk scan didn't confirm).
 *
 * Never throws for a scan/lookup failure on an individual entry — records
 * the entry as `status: "error"` and reports via `onWarning`, so one bad
 * entry doesn't abort the rest of the batch.
 *
 * @param {Array<{ticker: string, quarter: object}>} entries
 * @param {Object} opts
 * @param {import('../src/clients/StockscansClient.js').StockscansClient} opts.client
 * @param {boolean} opts.force
 * @param {(message: string) => void} opts.onWarning
 * @returns {Promise<Map<string, object>>} ticker -> final result object
 */
async function resolveHistoricalEntries(entries, { client, force, onWarning }) {
  const results = new Map();

  // Tier 0: DB first, no network, same as the current-quarter path.
  const remaining = [];
  for (const e of entries) {
    const existing = !force && findInDb(e.ticker, e.quarter.yyyymm);
    if (existing) {
      results.set(e.ticker, {
        status: 'db-hit',
        ticker: e.ticker,
        quarter: e.quarter,
        id: existing.id,
        summary: existing.summary,
        note: `Transcript already saved in local DB (${existing.id}). Re-run with --force to bypass.`,
      });
    } else {
      remaining.push(e);
    }
  }
  if (!remaining.length) return results;

  // Group by reporting quarter — one bulk scan covers every company sharing
  // a quarter, rather than a separate scan per (company, quarter) pair.
  const byQuarter = new Map();
  for (const e of remaining) {
    if (!byQuarter.has(e.quarter.yyyymm)) byQuarter.set(e.quarter.yyyymm, []);
    byQuarter.get(e.quarter.yyyymm).push(e);
  }

  for (const [yyyymm, group] of byQuarter) {
    const scanQuarterDate = computeReleaseQuarterDate(yyyymm);
    const tickers = group.map((g) => g.ticker);

    let announcements = [];
    try {
      announcements = await scanAnnouncementsForCompanies({
        client,
        companyIds: tickers,
        quarterDate: scanQuarterDate,
        announcementType: 'Earnings Call',
        searchFilters: ['Transcript'],
        onWarning: (msg) => onWarning(`[historical ${yyyymm}] ${msg}`),
      });
    } catch (err) {
      onWarning(`[historical ${yyyymm}] bulk scan threw unexpectedly: ${err.message} — falling back to per-company documents() for all ${tickers.length} companies in this quarter.`);
    }

    const foundByTicker = new Map();
    for (const a of announcements) {
      if (!tickers.includes(a.companyId)) continue;
      if (!(a.title || '').toLowerCase().includes('transcript')) continue;
      const prev = foundByTicker.get(a.companyId);
      if (!prev || new Date(a.date) > new Date(prev.date)) foundByTicker.set(a.companyId, a);
    }

    for (const e of group) {
      const doc = foundByTicker.get(e.ticker);
      if (doc) {
        results.set(e.ticker, {
          status: 'official-transcript-exists',
          ticker: e.ticker,
          quarter: e.quarter,
          document: { documentType: 'Transcript', ssUrl: doc.ssUrl, date: doc.date },
          note: 'Found via bulk announcements/scan (historical quarter — see computeReleaseQuarterDate in bulkAnnouncementScan.js for the quarterDate calculation). Use stock-documents-fetcher to download it.',
        });
        continue;
      }
      // Bulk scan didn't confirm it — verify against the authoritative
      // per-company documents() API before concluding "not found". This is
      // the safety net for the quarterDate heuristic above being wrong for
      // this particular company/quarter.
      try {
        const { transcript } = await checkStockscansDocuments(client, e.ticker, e.quarter.yyyymm);
        if (transcript) {
          results.set(e.ticker, {
            status: 'official-transcript-exists',
            ticker: e.ticker,
            quarter: e.quarter,
            document: transcript,
            note: 'Found via per-company documents() fallback (the bulk-scan quarterDate heuristic missed this one).',
          });
        } else {
          results.set(e.ticker, {
            status: 'historical-transcript-not-found',
            ticker: e.ticker,
            quarter: e.quarter,
            note: `No official Transcript found for ${e.quarter.fiscalPeriod} FY${e.quarter.fiscalYear} via bulk scan or documents(). Per policy, historical quarters do not fall back to Perplexity/NotebookLM (those tiers exist only to race ahead of Stockscans' own filing, which doesn't apply to an already-reported quarter).`,
          });
        }
      } catch (err) {
        onWarning(`[historical ${e.ticker}] documents() fallback check failed: ${err.message}`);
        results.set(e.ticker, { status: 'error', ticker: e.ticker, quarter: e.quarter, error: `historical transcript check failed: ${err.message}` });
      }
    }
  }

  return results;
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
async function fetchOne(ticker, quarter, { outDir, force, client: sharedClient, resultsMap, deferTier4 = false } = {}) {
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

    // ── Tier 1 gate + Tier 2 ────────────────────────────────────────────────
    // Bulk fast path: if the caller pre-fetched a resultsDocumentsMap() whose
    // quarterDate matches this entry's quarter, use the map lookup (one-time
    // ~11-call fetch shared across every company in the run) instead of a
    // per-company documents() call. Falls back to the per-company check for
    // any quarter that isn't "the current results season" — resultsDocuments
    // has no historical-quarter override (confirmed via live testing: passing
    // quarterDate/quarter returns HTTP 400 "Extra inputs are not permitted").
    //
    // Bug fixed 2026-07-26: a ticker ABSENT from the map used to be treated
    // as "results not out" directly. That's wrong — confirmed live that
    // /api/company/results/documents' own dataset is incomplete (its
    // self-reported `total` and our paginated map size agreed at 502, yet
    // SGMART/SGFIN/TINNARUBR all had Result+PPT+Transcript already filed via
    // a direct per-company documents() call and simply weren't in that
    // 502). The bulk map is a fast AFFIRMATIVE source (if present, trust it)
    // but must never be trusted as a negative — same principle already
    // applied to the historical bulk scan and Tier-4 bulk scan elsewhere in
    // this file. So a map miss now falls back to the authoritative
    // per-company check before concluding results aren't out, rather than
    // taking the map's silence as proof.
    let result, transcript;
    if (resultsMap && resultsMap.quarterDate === quarter.yyyymm) {
      const doc = resultsMap.byCompanyId.get(ticker);
      if (doc) {
        result = doc.resultSsUrl ? doc : null;
        transcript = doc.transcriptSsUrl ? { documentType: 'Transcript', ssUrl: doc.transcriptSsUrl, date: quarter.yyyymm } : null;
      } else {
        ({ result, transcript } = await checkStockscansDocuments(client, ticker, quarter.yyyymm));
      }
    } else {
      ({ result, transcript } = await checkStockscansDocuments(client, ticker, quarter.yyyymm));
    }

    if (!result) {
      return {
        status: 'results-not-out',
        ticker,
        quarter,
        note: `No Result or PPT filed for ${quarter.fiscalPeriod} FY${quarter.fiscalYear} (${quarter.yyyymm}) yet — stopping here. Verified via per-company documents() (not just the bulk map), so this should be a real "not out yet" rather than a map coverage gap.`,
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
    // In bulk mode this is deferred: main() collects every entry that falls
    // through to here and resolves them in one pass via
    // findRecordingAnnouncementsBulk (batched scanAnnouncements calls, <=10
    // companies/call) instead of one announcements() call per company here.
    if (deferTier4) {
      return {
        status: 'needs-recording-pipeline-deferred',
        ticker,
        quarter,
        perplexitySkipReason: pplx.reason,
      };
    }

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

    // Collected across every bulk step below. Per Darshan's explicit call:
    // no single missed/broken scenario should halt the rest of the run —
    // record it here and surface it at the end instead of throwing.
    const warnings = [];

    // Authenticate once, share the client across all entries
    const client = new StockscansClient();
    await client.validateAuth();

    // Resolve each entry's quarter up front and split into two populations:
    // "current results season" entries (quarter omitted, or explicitly equal
    // to latestCompletedQuarter()) get the full current-quarter waterfall
    // (bulk gate + Perplexity + deferred Tier 4). Everything else is a
    // historical quarter — per product decision, those skip the Result/PPT
    // gate and Perplexity/NotebookLM entirely and go straight to a
    // transcript-only bulk lookup (see resolveHistoricalEntries).
    const latest = latestCompletedQuarter();
    const entries = [];
    const results = [];
    for (const entry of bulk) {
      if (!entry.ticker) {
        results.push({ status: 'error', entry, error: 'Missing ticker in bulk entry' });
        entries.push(null);
        continue;
      }
      try {
        const q = entry.quarter ? parseQuarterString(entry.quarter) : latest;
        entries.push({ ticker: entry.ticker, quarter: q, isHistorical: q.yyyymm !== latest.yyyymm });
        results.push(null); // placeholder, filled in below
      } catch (e) {
        results.push({ status: 'error', ticker: entry.ticker, error: e.message });
        entries.push(null);
      }
    }

    const currentQuarterEntries = entries.filter((e) => e && !e.isHistorical);
    const historicalEntries = entries.filter((e) => e && e.isHistorical);

    let resultsMap = null;
    if (currentQuarterEntries.length) {
      try {
        // One-time ~11-call paginated fetch (see StockscansClient.resultsDocumentsMap)
        // replacing what would otherwise be one documents() call per company for
        // every entry targeting the current results season.
        resultsMap = await client.resultsDocumentsMap();
      } catch (err) {
        warnings.push(
          `Bulk results-documents map fetch failed: ${err.message}. Falling back to per-company documents() calls for all ${currentQuarterEntries.length} current-quarter entries — this run will be slower and may hit rate limits.`
        );
      }
    }

    const fetchResults = await mapWithConcurrency(currentQuarterEntries, BULK_CONCURRENCY, async (e) => {
      // deferTier4: don't let each company independently call the
      // announcements() search — collect the ones that need it below and
      // resolve them in one batched pass via findRecordingAnnouncementsBulk.
      return fetchOne(e.ticker, e.quarter, { outDir, force, client, resultsMap, deferTier4: true });
    });

    const currentQuarterResultByTicker = new Map();
    for (let i = 0; i < currentQuarterEntries.length; i++) {
      const e = currentQuarterEntries[i];
      const settled = fetchResults[i];
      currentQuarterResultByTicker.set(
        e.ticker,
        settled.ok ? settled.value : { status: 'error', ticker: e.ticker, quarter: e.quarter, error: settled.error.message }
      );
    }

    // ── Deferred Tier 4: resolve every "fell through to recording search"
    // entry in one batched pass (watchlist-backed bulk scan) instead of one
    // announcements() call per company.
    const pendingTier4 = [...currentQuarterResultByTicker.values()].filter(
      (r) => r.status === 'needs-recording-pipeline-deferred'
    );
    if (pendingTier4.length) {
      let recordingMap = new Map();
      try {
        // Bug fixed 2026-07-26: this used to pass r.quarter.yyyymm (the
        // period's own end-month) directly as the scan's quarterDate. Per
        // Darshan's confirmation, quarterDate filters on RELEASE date, not
        // the period represented — passing the raw period-end risked
        // matching a stale prior-quarter recording that happened to share
        // the scan window, not the target quarter's actual recording (this
        // is exactly what surfaced during testing: a match came back for a
        // company's OLDER quarter's recording). Must use
        // computeReleaseQuarterDate() here too, same as the historical path.
        recordingMap = await findRecordingAnnouncementsBulk(
          pendingTier4.map((r) => ({ ticker: r.ticker, quarterDate: computeReleaseQuarterDate(r.quarter.yyyymm), quarter: r.quarter })),
          { outDir, client, onWarning: (msg) => warnings.push(`[tier4] ${msg}`) }
        );
      } catch (err) {
        warnings.push(`[tier4] Bulk recording search failed entirely: ${err.message}. All ${pendingTier4.length} pending entries reported as not-found — verify manually if needed.`);
      }
      for (const r of pendingTier4) {
        const recording = recordingMap.get(r.ticker) || { found: false, ticker: r.ticker };
        currentQuarterResultByTicker.set(r.ticker, {
          status: 'needs-recording-pipeline',
          ticker: r.ticker,
          quarter: r.quarter,
          perplexitySkipReason: r.perplexitySkipReason,
          recording,
          note: recording.found
            ? `Continue with SKILL.md steps 3-4 (Read the PDF, find the recording link, transcribe via NotebookLM through Chrome MCP), then run: node save-concall-transcript.js ${r.ticker} ${r.quarter.yyyymm} <transcript.txt> --fiscal-year ${r.quarter.fiscalYear} --fiscal-period ${r.quarter.fiscalPeriod}` +
              (recording.labelConfirmed === false
                ? ` This recording's own title/description didn't mention ${r.quarter.fiscalPeriod}FY${r.quarter.fiscalYear} explicitly — double-check it's actually the right quarter before transcribing (see warnings).`
                : '')
            : 'No recording announcement found either — nothing more this pipeline can do automatically for this quarter yet.',
        });
      }
    }

    // ── Historical-quarter entries: transcript-only bulk lookup, no
    // Result/PPT gate, no Perplexity/NotebookLM (see resolveHistoricalEntries).
    let historicalResultByTicker = new Map();
    if (historicalEntries.length) {
      try {
        historicalResultByTicker = await resolveHistoricalEntries(historicalEntries, {
          client,
          force,
          onWarning: (msg) => warnings.push(msg),
        });
      } catch (err) {
        warnings.push(`Historical-quarter resolution failed entirely: ${err.message}. All ${historicalEntries.length} historical entries reported as errors.`);
        for (const e of historicalEntries) {
          historicalResultByTicker.set(e.ticker, { status: 'error', ticker: e.ticker, quarter: e.quarter, error: err.message });
        }
      }
    }

    // Stitch everything back into the original input order. `entries[i]` and
    // `results[i]` were built in lockstep above (entries[i] is null exactly
    // when results[i] already holds a parse/validation error), so they stay
    // aligned by index — no separate counter needed.
    for (let i = 0; i < results.length; i++) {
      const e = entries[i];
      if (!e) continue; // pre-existing parse/validation error already in results[i]
      results[i] = e.isHistorical ? historicalResultByTicker.get(e.ticker) : currentQuarterResultByTicker.get(e.ticker);
    }

    console.log(JSON.stringify(results, null, 2));
    if (warnings.length) {
      console.error(JSON.stringify({ warnings }, null, 2));
    }
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
