#!/usr/bin/env node
'use strict';

/**
 * preprocessQueue.js — decide which documents need a Filing Extract, and hand
 * them out in bounded batches.
 *
 * The scheduling idea this implements (docs/PREPROCESSING_PIPELINE_PLAN.md §5):
 * you cannot pre-process "today's gainers", because that list does not exist
 * until the scan runs. So don't try. Pre-process by DOCUMENT ARRIVAL across a
 * standing universe and accept speculative work — extraction is cheap enough to
 * be speculative, judgment is not. A document extracted and never used costs one
 * cheap-agent batch slot; a document NOT extracted costs a flagship slot, or (as
 * today) a `log-heavy-skip` and no read at all.
 *
 * This script is pure logic — no model, no judgment. It resolves the window,
 * lists what arrived, drops noise, assigns a profile, subtracts what is already
 * extracted, and emits batches. The extraction itself is the `document-preprocessor`
 * skill's job, run by whichever cheap agent executes it.
 *
 * Commands:
 *   next     [--limit N] [--batch-size N] [--window-hours N] [--profile p]
 *   backfill --days N [--limit N] [--batch-size N] [--profile p]
 *   status
 *   commit
 *
 * `next` does NOT advance the cursor — `commit` does, and only after a healthy
 * extraction run (conventions §19). Committing on fetch would permanently drop
 * every document whose extraction failed.
 */

const { loadEnv, argValue } = require('./lib/env');
const db = require('./lib/db');
const docExtracts = require('./lib/docExtracts');
const windowCursorFactory = require('./lib/windowCursor');
const taxonomy = require('./lib/announcementTaxonomy');
const { matchedNoiseKeyword } = require('@stock/api/utils/announcementNoiseFilter');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const { resolveScan, paginateScanToCutoff, parseAnnDateToUtc } = require('./postCloseScanInsights');

const BASE_URL = 'https://www.stockscans.in';

// Its OWN cursor, deliberately not post-close's. The two jobs cover the same
// universe but answer different questions and fail independently: a failed
// extraction run must not hold back the digest's cursor, and a digest that
// skipped a slot must not make this job re-extract documents it already has.
const JOB_NAME = 'document-preprocessing';

// How far back a run reaches when the cursor is fresh or stale. 26h so a single
// missed overnight run is recovered without an explicit --window-hours.
const FLOOR_HOURS = 26;

const DEFAULT_BATCH_SIZE = 20;

/**
 * Map an announcement's taxonomy category to an extraction profile.
 *
 * The four HEAVY_DOCUMENT_CATEGORIES are precisely the ones
 * `post-close-scan-insights` skips today (`log-heavy-skip`, 438 of them over 21
 * days, never read) — they get their own profiles, which is the entire point of
 * the exercise. Everything else is an `announcement`.
 */
/**
 * The server-side `announcementType` enum value that scopes a scan to one heavy
 * document class. Confirmed enum (docs/stockscans-api-schemas.md): "All",
 * "Financial Results", "Earnings Call", "Presentation", "Annual Report".
 *
 * Using it is not just an optimisation. Measured over a live 7-day window
 * (2026-09-04):
 *
 *   unscoped ("All")      ~80 pages  ->  47 heavy documents found
 *   scoped (4 passes)      18 pages  -> 188 heavy documents found
 *
 * Four times fewer requests AND four times the recall. The recall gap is the
 * important half: the unscoped walk hits `MAX_PAGES` and truncates the window
 * silently, so it never reaches most of what was filed. Scoping to a document
 * class shrinks the result set below the cap, which is what makes the walk
 * complete rather than merely cheaper.
 */
const ANNOUNCEMENT_TYPE_FOR_PROFILE = {
  result: 'Financial Results',
  transcript: 'Earnings Call',
  ppt: 'Presentation',
  annual_report: 'Annual Report',
};

function profileFor(category) {
  switch (category) {
    case 'results':
      return 'result';
    case 'concall_transcript':
      return 'transcript';
    case 'investor_presentation':
      return 'ppt';
    case 'annual_report':
      return 'annual_report';
    default:
      return 'announcement';
  }
}

function currentQuarterDate(now = new Date()) {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function buildQueue({ windowHoursArg, profileFilter }) {
  const windowCursor = windowCursorFactory(JOB_NAME);
  const now = new Date();
  const floorMs = now.getTime() - FLOOR_HOURS * 3600 * 1000;
  const startMs = await windowCursor.resolveWindowStartMs({ now, floorMs, windowHoursArg });
  const cutoffUtc = new Date(startMs);

  const scan = await resolveScan();

  // Scope the scan server-side when we're after ONE heavy document class. This is
  // the path a backfill takes, and it is where the cost and the truncation both
  // live — see ANNOUNCEMENT_TYPE_FOR_PROFILE for the measured difference.
  const scopedType = profileFilter ? ANNOUNCEMENT_TYPE_FOR_PROFILE[profileFilter] : null;
  const scanBody = scopedType ? { ...scan.scan, announcementType: scopedType } : scan.scan;

  const { all, inWindow, pagesFetched, hitPageCap } = await paginateScanToCutoff({
    scan: scanBody,
    cutoffUtc,
    quarterDate: currentQuarterDate(now),
  });

  const stats = {
    announcementType: scopedType || scan.scan.announcementType || 'All',
    pagesFetched,
    // A capped walk means the window was truncated and this run's "nothing else
    // was filed" is not a finding. Narrow the window or scope by --profile.
    hitPageCap,
    totalFetched: all.length,
    inWindow: inWindow.length,
    noiseDropped: 0, // announcement-profile only — see the filter call below
    heavyDocs: 0,
    profileDisabled: 0, // neither served nor shadow
    shadowQueued: 0,
    alreadyExtracted: 0,
    queued: 0,
  };

  const seen = new Set();
  const items = [];
  for (const a of inWindow) {
    // Categorise BEFORE filtering noise — the order is load-bearing, see below.
    const category = taxonomy.categoriseAnnouncement(a.title, a.description);
    const profile = profileFor(category);
    if (profileFilter && profile !== profileFilter) continue;

    // The SAME shared noise filter post-close and watchlist-insights use — one
    // list, one answer, never a forked copy (conventions §17). But it is applied
    // ONLY to `announcement`-profile items, and that exception is deliberate.
    //
    // The keyword list contains "Annual Report" and "Investor Presentation" as
    // TITLE noise. In a 20-hour live window that dropped 45 of 47 annual reports
    // and all 3 investor presentations (measured 2026-09-04). For the digest that
    // is correct: it would `log-heavy-skip` them anyway, so filtering them early
    // saves a step. For THIS job it would be self-defeating — those documents are
    // the entire reason the pipeline exists, and applying the filter to them would
    // have silently guaranteed the heavy-doc profiles never received a single
    // document while every counter still looked healthy.
    //
    // The distinction is that those keywords do not assert "this document is
    // contentless". They assert "the announcement digest does not want a card for
    // this" — a ROUTING decision belonging to the digest, not an objective fact
    // about the filing. Extraction and routing are different questions, so they
    // get different answers from the same list. Filter noise out of the cards;
    // never out of the corpus.
    if (profile === 'announcement' && matchedNoiseKeyword(a)) {
      stats.noiseDropped += 1;
      continue;
    }

    // Queue both SERVED and SHADOW profiles — a shadow profile must extract in
    // order to be calibrated at all. What shadow does NOT get is readers:
    // `docExtracts.get()` returns null for it, so nothing downstream can consume
    // an uncalibrated extract (see the two-switch note in docExtracts.js).
    if (!docExtracts.isQueued(profile)) {
      stats.profileDisabled += 1;
      continue;
    }

    if (profile !== 'announcement') stats.heavyDocs += 1;
    if (docExtracts.isShadow(profile)) stats.shadowQueued += 1;

    const sourceUrl = a.pdfUrl || (a.ssUrl ? `${BASE_URL}/document/${a.ssUrl}` : null);
    if (!sourceUrl || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);

    // An invalidated record (e.g. extracted under an instruction set later
    // found to be wrong) does not count as "already extracted" — it must be
    // re-queued so the next extraction pass can overwrite it via put().
    if (docExtracts.has(profile, sourceUrl) && !docExtracts.isInvalidated(profile, sourceUrl)) {
      stats.alreadyExtracted += 1;
      continue;
    }

    const dt = parseAnnDateToUtc(a.createdAt || a.date);
    items.push({
      profile,
      category,
      sourceUrl,
      announcementId: a.ssUrl || null,
      companyId: sanitizeCompanyId(a.companyId || ''),
      name: a.name || null,
      title: a.title || null,
      description: a.description || null,
      filedAtUtc: dt ? dt.toISOString() : null,
      highConviction: taxonomy.isHighConviction(category),
    });
  }

  // Priority order, because `--limit` slices this list and a bounded run should
  // spend its budget where a missed extraction costs most:
  //   1. heavy documents — the whole reason this pipeline exists; nothing else
  //      reads them at all today.
  //   2. high-conviction categories (demerger/merger/acquisition/mgmt change).
  //   3. newest first — a filing from an hour ago is more likely to be asked
  //      about by tonight's slot than one from yesterday morning.
  const rank = (i) => (i.profile !== 'announcement' ? 0 : 2) + (i.highConviction ? 0 : 1);
  items.sort(
    (a, b) => rank(a) - rank(b) || String(b.filedAtUtc).localeCompare(String(a.filedAtUtc))
  );

  stats.queued = items.length;
  return { cutoffUtc, scan, items, stats, windowCursor, now };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function cmdNext(argv) {
  loadEnv(argValue('--env-file', argv));
  const limit = argValue('--limit', argv) ? Number(argValue('--limit', argv)) : null;
  const batchSize = Number(argValue('--batch-size', argv) || DEFAULT_BATCH_SIZE);
  const profileFilter = argValue('--profile', argv);
  const windowHoursArg = argValue('--window-hours', argv);

  const { cutoffUtc, scan, items, stats, windowCursor, now } = await buildQueue({
    windowHoursArg,
    profileFilter,
  });

  const selected = limit ? items.slice(0, limit) : items;

  // Record the pending marker now, exactly as post-close does: the cursor must
  // later advance to what THIS run actually covered, never to a "now" recomputed
  // at commit time, which would silently skip anything filed in between.
  await windowCursor.savePendingWindow({
    windowEndMs: now.getTime(),
    extra: { committedForCutoffMs: cutoffUtc.getTime() },
  });

  process.stdout.write(
    JSON.stringify(
      {
        cutoffUtc: cutoffUtc.toISOString(),
        scanSource: scan.source,
        scanName: scan.scanName,
        stats: { ...stats, selected: selected.length, truncated: selected.length < items.length },
        batchSize,
        batches: chunk(selected, batchSize),
        extractDir: db.cachePath('doc-extracts'),
      },
      null,
      2
    )
  );
}

/**
 * Walk back over a stretch of ALREADY-COVERED time and queue anything still
 * missing an extract, without touching the incremental cursor.
 *
 * This exists because of a hole that would otherwise be silent and permanent.
 * `next` skips any document whose profile is gated off (`stats.profileDisabled`)
 * and then the cursor advances past it. So on the day a heavy profile finally
 * passes its calibration gate, every Result, PPT, transcript and annual report
 * filed while it was gated — weeks of them, ~50/day — sits behind the cursor and
 * would never be extracted. The pipeline would look healthy and quietly have no
 * history at all for exactly the document types it was built for.
 *
 * **Enabling a profile therefore REQUIRES a backfill run for the period it was
 * gated.** That instruction is in the skill's Step 5; this command is what it
 * calls.
 *
 * Critically, this does NOT write a pending-window marker. `commit` must only
 * ever advance the cursor to what an incremental `next` covered — a backfill
 * reaching back 30 days that then committed would jump the cursor forward to
 * now and drop everything the next incremental run should have seen. Backfill
 * reads history; it never speaks for the present.
 */
async function cmdBackfill(argv) {
  loadEnv(argValue('--env-file', argv));
  const days = Number(argValue('--days', argv) || 7);
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');
  const limit = argValue('--limit', argv) ? Number(argValue('--limit', argv)) : null;
  const batchSize = Number(argValue('--batch-size', argv) || DEFAULT_BATCH_SIZE);
  const profileFilter = argValue('--profile', argv);

  // windowHoursArg bypasses both the floor and the cursor by contract
  // (conventions §19's explicit-catch-up escape hatch) — which is exactly the
  // semantics a backfill needs.
  const { cutoffUtc, scan, items, stats } = await buildQueue({
    windowHoursArg: days * 24,
    profileFilter,
  });

  const selected = limit ? items.slice(0, limit) : items;
  process.stdout.write(
    JSON.stringify(
      {
        mode: 'backfill',
        days,
        cutoffUtc: cutoffUtc.toISOString(),
        scanSource: scan.source,
        cursorUntouched: true,
        stats: { ...stats, selected: selected.length, truncated: selected.length < items.length },
        batchSize,
        batches: chunk(selected, batchSize),
      },
      null,
      2
    )
  );
}

async function cmdStatus() {
  const windowCursor = windowCursorFactory(JOB_NAME);
  process.stdout.write(
    JSON.stringify(
      { job: JOB_NAME, cursor: windowCursor.readCursor(), extracts: docExtracts.stats() },
      null,
      2
    )
  );
}

async function cmdCommit() {
  const windowCursor = windowCursorFactory(JOB_NAME);
  const cursor = await windowCursor.commitWindow();
  process.stdout.write(
    JSON.stringify({ status: 'ok', lastCommittedAtIso: cursor.lastCommittedAtIso }, null, 2)
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = { next: cmdNext, backfill: cmdBackfill, status: cmdStatus, commit: cmdCommit };
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(`Usage: preprocessQueue.js <${Object.keys(commands).join('|')}> [args]\n`);
    process.exit(1);
  }
  await fn(rest);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`[preprocess-queue] fatal: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { buildQueue, profileFor, JOB_NAME };
