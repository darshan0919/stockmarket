#!/usr/bin/env node
'use strict';

/**
 * Watchlist Insights Engine — Node port of watchlist_insights.py.
 *
 * CLI utility for the daily watchlist insights task: handles all I/O-heavy work
 * (Stockscans API, PDF parsing, notes JSON I/O, email). Claude orchestrates the AI
 * analysis. All Stockscans access goes through @stock/api.
 *
 * Usage: node watchlistInsights.js <command> [args] [--window-hours <n>] [--env-file <path>]
 *   fetch-announcements <watchlistIds> | read-pdf <url> | read-pdf-with-meta <url> | get-company-notes <id> | add-note [json]
 *   mark-processed <companyId> <announcementId> | list-companies | insight-template <cat> [--depth quick|standard|deep]
 *   send-summary [html] | build-digest <watchlistIds> | send-digest <watchlistIds> | commit-window <watchlistIds> | init-notes
 *
 * insight-template's actual template CONTENT lives in the announcement-insights skill
 * (skills/equity-research/announcement-insights/references/templates/) — this command is
 * just an I/O loader for it, shared by watchlist-insights, gainers-signal, and any other
 * caller. --depth defaults to 'standard'; demerger/merger/acquisition/management_change
 * are HIGH_CONVICTION_CATEGORIES (see lib/announcementTaxonomy.js) with their own 'deep'
 * variant — see skills/equity-research/announcement-insights/SKILL.md.
 *
 * <watchlistIds> is a required, comma-separated list of watchlist IDs (e.g. "id1,id2,id3").
 * This job is agnostic of which watchlists it scans — the caller (skill/task) decides.
 *
 * --window-hours <n> (optional) forces an explicit lookback window for
 * fetch-announcements / build-digest / send-digest — e.g. a deliberate wider catch-up:
 *   node watchlistInsights.js send-digest id1,id2,id3 --window-hours 72
 * With NO flag, the window is resolved deterministically (see resolveWindowHours /
 * the "Deterministic default window" comment near DEFAULT_WINDOW_HOURS below): it
 * always reaches back at least to the previous calendar day's 8AM IST (this job's
 * scheduled run time), and further back still if `commit-window` shows the last
 * confirmed-complete run was even older than that — so a delayed or failed run
 * never silently drops announcements just because "24h before now" doesn't cover
 * the real gap. Call `commit-window <watchlistIds>` as the run's final step, and
 * ONLY once the digest is confirmed healthy (see the skill's Step 3) — committing
 * after a partial failure would let the next run's window skip past whatever
 * didn't get processed.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { stockscans, S3_BASE_URL } = require('@stock/api');
const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const { NotesDb } = require('./lib/notesDb');
const { pdfToTextWithMeta } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const StorageService = require('@stock/cloud-utils').StorageService;
const ist = require('./lib/ist');
const {
  loadNoiseKeywords,
  shouldIgnoreAnnouncement: sharedShouldIgnoreAnnouncement,
  matchedNoiseKeyword: sharedMatchedNoiseKeyword,
} = require('@stock/api/utils/announcementNoiseFilter');

// Data Ecosystem v2: notes → notes collection (via NotesDb→lib/db.js),
// ignored-announcements log → data/cache/ (regenerable review aid).
const db = new NotesDb();

// NOTE: this job is agnostic of which watchlists it scans — watchlistIds must be passed
// in by the caller (CLI arg / skill input), never hardcoded here. See parseWatchlistIds().
function buildAnnouncementsPayload(watchlistIds) {
  return {
    scan: {
      scanId: '',
      scanName: 'Watchlist Scan',
      filters: [],
      industry: [],
      index: [],
      watchlistIds,
      searchFilters: [],
      announcementType: 'All',
      alerts: false,
      searchMode: 'full',
      companyIds: [],
      companyFilters: [],
    },
    offset: 0,
    quarterDate: '',
  };
}

/** Parse a comma-separated watchlistIds string (CLI arg) into a non-empty array. Throws if empty/missing. */
function parseWatchlistIds(raw) {
  const ids = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    throw new Error(
      'watchlistIds required: pass one or more comma-separated watchlist IDs, e.g. "fetch-announcements id1,id2,id3"'
    );
  }
  return ids;
}

/**
 * Read the optional `--window-hours <n>` CLI flag (falls back to DEFAULT_WINDOW_HOURS,
 * currently 24). Lets any run (scheduled or ad-hoc) widen the lookback window — e.g. a
 * missed-day catch-up — without a bespoke script: `send-digest <ids> --window-hours 72`.
 */
function parseWindowHours(argv = process.argv) {
  const raw = argValue('--window-hours', argv);
  if (raw === null) return DEFAULT_WINDOW_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--window-hours must be a positive number, got "${raw}"`);
  }
  return n;
}

// ── Insignificance filter ─────────────────────────────────────────────────────
// The keyword list moved to the shared, single, app-agnostic
// @stock/api/utils/announcementNoiseFilter module (backed by
// stock-api/src/data/announcement-noise-keywords.json — editable via the app UI)
// so the exact same list is used here and by the announcement-scans page. See
// isNoise/matchedNoiseKeyword below, which always re-read the file fresh via
// loadNoiseKeywords() so an app edit takes effect on this job's next run without
// a restart. INSIGNIFICANT_KEYWORDS below is only a point-in-time snapshot taken
// at process start, kept for backward compat with any external caller expecting
// this export — prefer loadNoiseKeywords() for anything that needs live values.
const INSIGNIFICANT_KEYWORDS = loadNoiseKeywords().titleKeywordsToIgnore;

// ── Categorisation ────────────────────────────────────────────────────────────
// Owned by lib/announcementTaxonomy.js so this job and the gainers pipeline share
// ONE definition of what each announcement is. Re-exported below for back-compat.
const {
  CATEGORY_RULES,
  categoriseAnnouncement,
  HIGH_CONVICTION_CATEGORIES,
  isHeavyDocumentCategory,
  heavyDocumentSkipReason,
} = require('./lib/announcementTaxonomy');

// ── Insight templates ───────────────────────────────────────────────────────
// Single source of truth for template CONTENT is the announcement-insights skill
// (skills/equity-research/announcement-insights/references/), not this file.
// watchlistInsights.js is a thin I/O loader: it locates the repo root and reads
// the markdown template straight from disk so watchlist-insights, gainers-signal,
// and any other caller are always reading the identical, single copy. Editing a
// template = editing the .md file in that skill's references/templates/ dir —
// never here.

const ANNOUNCEMENT_INSIGHTS_TEMPLATES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'skills',
  'equity-research',
  'announcement-insights',
  'references',
  'templates'
);

function readTemplateFile(fileName) {
  const p = path.join(ANNOUNCEMENT_INSIGHTS_TEMPLATES_DIR, fileName);
  return fs.readFileSync(p, 'utf8');
}

/**
 * insightTemplate(category, depth)
 *   depth: 'quick' | 'standard' (default) | 'deep'
 * High-conviction categories (demerger/merger/acquisition/management_change) have
 * both a `<category>.standard.md` and `<category>.deep.md` file; `deep` is the
 * recommended default for those four when the caller has time to spend judgment,
 * per skills/equity-research/announcement-insights/SKILL.md. `quick` is a runtime
 * instruction (not a separate file) applied uniformly across all categories.
 */
function insightTemplate(category, depth = 'standard') {
  const cat = (category || 'general').trim().toLowerCase();
  const d = (depth || 'standard').trim().toLowerCase();
  const globalRules = readTemplateFile('_global.md');

  let body;
  const isHighConviction = HIGH_CONVICTION_CATEGORIES.has(cat);
  if (isHighConviction && d === 'deep') {
    body = readTemplateFile(`${cat}.deep.md`);
  } else if (isHighConviction) {
    body = readTemplateFile(`${cat}.standard.md`);
  } else {
    try {
      body = readTemplateFile(`${cat}.md`);
    } catch (e) {
      body = readTemplateFile('general.md');
    }
  }

  const quickSuffix =
    d === 'quick'
      ? '\n\nDEPTH OVERRIDE: quick — write 1-2 sentences only (what happened + the hard ' +
        'numbers + significance tag). Skip trend synthesis, valuation math, and the ' +
        '"what to watch" clause. Use only when explicitly time-boxed by the caller.'
      : '';

  return `${globalRules}\n${body}${quickSuffix}\n`;
}

// ── Usecase scoping (docs/DATA_RULES.md-adjacent convention, see notesDb.js) ───
//
// A "usecase" identifies WHAT was extracted from an announcement, not WHO
// called for it: `<generating-skill>:<depth-or-variant>`, e.g.
// "announcement-insights:standard", "announcement-insights:deep",
// "gainers-signal:quick". Two orchestrators that both call announcement-insights
// at the same depth for the same category SHOULD share a cache entry (same
// extraction, same template) — that's why the key is keyed on the skill doing
// the actual reading/writing (announcement-insights), not on watchlist-insights
// vs gainers-signal vs whichever orchestrator happened to invoke it. A skill
// with genuinely different extraction logic (different template, different
// output shape) must use its own usecase prefix so its notes/processed-markers
// never collide with — or get shadowed by — another skill's for the same
// announcement. See NotesDb.buildNoteIndex/getNoteForUsecase.
const ANNOUNCEMENT_INSIGHTS_SKILL = 'announcement-insights';

/** The default usecase for a given category+depth, when a caller doesn't pass one explicitly. */
function defaultUsecase(category, depth) {
  const cat = (category || 'general').trim().toLowerCase();
  const d = depth || (HIGH_CONVICTION_CATEGORIES.has(cat) ? 'deep' : 'standard');
  return `${ANNOUNCEMENT_INSIGHTS_SKILL}:${d}`;
}

/** True if `usecase` belongs to the `prefix` family (exact match, or "prefix:variant"). */
function usecaseMatchesPrefix(usecase, prefix) {
  return usecase === prefix || usecase.startsWith(`${prefix}:`);
}

// ── Announcement helpers ──────────────────────────────────────────────────────

function announcementId(ann) {
  const companyId = ann.companyId || '';
  const title = ann.title || ann.subject || ann.headline || '';
  const dateStr = ann.date || ann.createdAt || '';
  const ssUrl = ann.ssUrl || '';
  return ssUrl || `${companyId}_${dateStr}_${title.slice(0, 30)}`;
}

// title/description are checked separately (not as a combined blob) — see
// announcementNoiseFilter.js for why. matchedNoiseKeyword returns just the
// keyword string here (not the {keyword, field} shape) to keep this job's
// existing call sites (which only log the keyword) unchanged.
function isNoise(title, description) {
  return sharedShouldIgnoreAnnouncement({ title, description });
}

function matchedNoiseKeyword(title, description) {
  const match = sharedMatchedNoiseKeyword({ title, description });
  return match ? match.keyword : null;
}

async function logIgnoredAnnouncement(ann, matchedKw) {
  StorageService.init();
  const dateStr = ist.istYmd(); // YYYYMMDD
  const logPath = `cache/ignored-announcements_${dateStr}.json`;

  let existing = StorageService.readJson(logPath) || [];
  const title = ann.title || ann.subject || ann.headline || '';
  existing.push({
    companyId: ann.companyId || '',
    name: ann.name || ann.companyName || '',
    title,
    description: String(ann.description || '').slice(0, 300),
    matchedKeyword: matchedKw,
    createdAt: ann.createdAt || '',
  });
  await StorageService.saveJson(logPath, existing, false);
}

/**
 * Log a heavy-document skip (results/concall_transcript/investor_presentation/
 * annual_report) the same way logIgnoredAnnouncement logs noise — for
 * visibility, not enforcement. This is what powers the digest email's "Skipped
 * (heavy documents)" section and insight-validation's review of whether a skip
 * looks wrong. Mirrors logIgnoredAnnouncement's file-per-day cache pattern
 * deliberately, so both logs read the same way to a human or a script.
 */
async function logHeavyDocumentSkip(ann) {
  StorageService.init();
  const dateStr = ist.istYmd(); // YYYYMMDD
  const logPath = `cache/heavy-doc-skips_${dateStr}.json`;
  let existing = StorageService.readJson(logPath) || [];
  existing.push({
    companyId: ann.companyId || '',
    name: ann.name || '',
    title: ann.title || '',
    category: ann.category || '',
    reason: ann.heavyDocumentSkipReason || '',
    announcementId: ann.announcementId || '',
    date: ann.date || '',
  });
  await StorageService.saveJson(logPath, existing, false);
  return existing.length;
}

async function cmdLogHeavySkip(jsonStr) {
  const ann = JSON.parse(jsonStr);
  const count = await logHeavyDocumentSkip(ann);
  process.stdout.write(JSON.stringify({ status: 'ok', totalSkippedToday: count }));
}

function readHeavySkips(dateStr = ist.istYmd()) {
  StorageService.init();
  const logPath = `cache/heavy-doc-skips_${dateStr}.json`;
  return StorageService.readJson(logPath) || [];
}

function cmdGetHeavySkips() {
  process.stdout.write(JSON.stringify(readHeavySkips()));
}

// Default lookback window, in hours, for gatherInwindowRaw / fetch-announcements /
// build-digest / send-digest. Override per-call via the windowHours param, or from the
// CLI via `--window-hours <n>` (see argValue in lib/env.js). Kept as a named constant
// (not re-hardcoded per call site) so a one-off catch-up run never requires a new script.
const DEFAULT_WINDOW_HOURS = 24;

// ── Deterministic default window (never just "24h before whenever this runs") ──
//
// The job is scheduled for ~8AM IST daily. A plain "last 24h" default silently
// drops announcements whenever a run is late or was skipped entirely: a run
// delayed to 2PM the same day only looks back to 2PM the day before, missing
// the 8AM-2PM slice that the *previous* day's on-time run already covered by
// the time IT looked back 24h from ITS (earlier) invocation. Two mechanisms
// close that gap, both deterministic (no reliance on "now" alone):
//   1. ANCHOR FLOOR — the default window never starts later than the previous
//      calendar day's 8AM IST, regardless of what time today's run actually
//      fires. A same-day delay just means a longer (safe, dedup'd) window.
//   2. RESUMABLE CURSOR — `commit-window` (called once a run is confirmed
//      healthy) persists the exact windowEnd that run used. If a later run
//      finds that cursor is OLDER than the anchor floor (i.e. one or more
//      entire scheduled runs were missed/failed), the window reaches back to
//      the cursor instead — covering the full gap, however many days long.
// Re-processing already-seen announcements is harmless: cmdFetchAnnouncements
// already dedupes against each company's processedAnnouncements (see below).
const ANCHOR_HOUR_IST = 8;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
// Safety cap: a cursor stale beyond this is treated as an error rather than a
// silent multi-week backfill — almost certainly a bug (or a genuinely large
// outage) that a human should look at with an explicit --window-hours run.
const MAX_CURSOR_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const WINDOW_CURSOR_PATH = 'cache/watchlist-insights-cursor.json';
const PENDING_WINDOW_PATH = 'cache/watchlist-insights-pending-window.json';

/** Most recent 8AM-IST clock boundary at or before `now` (real epoch ms). */
function mostRecentEightAmIstMs(now) {
  const shifted = ist.istDate(now); // Date with UTC fields = IST wall-clock
  const boundaryShiftedMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    ANCHOR_HOUR_IST,
    0,
    0,
    0
  );
  let boundaryRealMs = boundaryShiftedMs - IST_OFFSET_MS;
  if (boundaryRealMs > now.getTime()) boundaryRealMs -= 24 * 60 * 60 * 1000;
  return boundaryRealMs;
}

/** Anchor floor: the previous calendar day's 8AM IST (this job's scheduled run time). */
function defaultWindowFloorMs(now) {
  return mostRecentEightAmIstMs(now) - 24 * 60 * 60 * 1000;
}

/** Stable cursor-file key for a watchlistIds combo (order-independent). */
function windowCursorKey(watchlistIds) {
  return [...watchlistIds].sort().join(',');
}

function readWindowCursor() {
  StorageService.init();
  return StorageService.readJson(WINDOW_CURSOR_PATH) || {};
}

/**
 * Resolve how many hours back this run's window should reach.
 * `--window-hours <n>` (explicit) always wins, unchanged from before — use it
 * for a deliberate one-off catch-up wider than the deterministic default.
 * With no flag, the default is `(now - windowStartMs) / 1h` where
 * windowStartMs = min(anchor floor, last-committed cursor) — see the
 * "Deterministic default window" comment above DEFAULT_WINDOW_HOURS.
 */
function resolveWindowHours(now, watchlistIds, argv = process.argv) {
  const raw = argValue('--window-hours', argv);
  if (raw !== null) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`--window-hours must be a positive number, got "${raw}"`);
    }
    return n;
  }
  const floorMs = defaultWindowFloorMs(now);
  const key = windowCursorKey(watchlistIds);
  const entry = readWindowCursor()[key];
  let windowStartMs = floorMs;
  if (entry && Number.isFinite(entry.lastCommittedAtMs)) {
    if (now.getTime() - entry.lastCommittedAtMs > MAX_CURSOR_LOOKBACK_MS) {
      throw new Error(
        `watchlist-insights cursor for watchlists [${key}] is stale beyond the ` +
          `${MAX_CURSOR_LOOKBACK_MS / (24 * 60 * 60 * 1000)}-day safety cap (last committed ` +
          `${new Date(entry.lastCommittedAtMs).toISOString()}). Re-run explicitly with ` +
          `--window-hours <n> covering the real gap, then call commit-window to reset the cursor.`
      );
    }
    // Whichever reaches further back wins — the anchor floor guarantees "at
    // least since yesterday's 8AM IST" even on a fresh/never-committed
    // cursor; the cursor extends that further back after a real multi-day gap.
    windowStartMs = Math.min(floorMs, entry.lastCommittedAtMs);
  }
  return (now.getTime() - windowStartMs) / (60 * 60 * 1000);
}

async function gatherInwindowRaw(
  client = stockscans,
  now = new Date(),
  watchlistIds,
  windowHours = DEFAULT_WINDOW_HOURS
) {
  if (!Array.isArray(watchlistIds) || !watchlistIds.length) {
    throw new Error(
      'watchlistIds required: gatherInwindowRaw(client, now, watchlistIds, windowHours?)'
    );
  }
  try {
    await client.validateAuth();
  } catch (e) {
    const errorMsg = `Auth validation failed: ${e.message}`;
    await sendHtmlEmail({
      subject: `Watchlist Insights - ❌ Auth Failed`,
      htmlBody: `<p><b>Time:</b> ${ist.nowIstHuman()}</p><p><b>Error:</b> ${errorMsg}</p><p>Please update STOCKSCANS_AUTH_TOKEN in .env.</p>`,
    });
    throw e;
  }

  const cutoffMs = now.getTime() - windowHours * 60 * 60 * 1000;
  const qdate = ist.quarterDate(now);
  const allRaw = [];
  let offset = 0;
  let pageSize = null;
  // Safety guard, scaled to the requested window: a 24h window is never thousands of
  // pages, so scale the page budget linearly with windowHours. Prevents an unbounded
  // loop if the upstream keeps returning a full, in-window page.
  const MAX_PAGES = Math.max(200, Math.ceil((200 * windowHours) / DEFAULT_WINDOW_HOURS));

  for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
    const payload = buildAnnouncementsPayload(watchlistIds);
    payload.quarterDate = qdate;
    payload.offset = offset;
    const data = await client.scanAnnouncements(payload);
    const page =
      data && typeof data === 'object' && !Array.isArray(data)
        ? data.announcements || []
        : data || [];
    if (!page.length) break;
    if (pageSize === null) pageSize = page.length;
    allRaw.push(...page);

    const lastCreated = ist.parseCreatedAtMs(page[page.length - 1].createdAt || '');
    if (lastCreated !== null && lastCreated < cutoffMs) break;
    if (page.length < pageSize) break;
    offset += page.length;
  }

  return allRaw.filter((ann) => {
    const created = ist.parseCreatedAtMs(ann.createdAt || '');
    return !(created !== null && created < cutoffMs);
  });
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdFetchAnnouncements(watchlistIdsArg, client = stockscans) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const now = new Date();
  const windowHours = resolveWindowHours(now, watchlistIds);
  // Which usecase FAMILY this caller's "already processed, don't return it
  // again" check applies to. Defaults to the shared announcement-insights
  // family (covers standard/deep/quick — whichever depth Step 2 ends up using
  // per item) so today's only real caller (watchlist-insights) is unaffected.
  // A different orchestrator with genuinely different extraction logic should
  // pass its OWN --usecase-prefix so it never mistakes "some other skill
  // already looked at this" for "I already looked at this" — see the usecase
  // scoping comment above defaultUsecase().
  const usecasePrefix = argValue('--usecase-prefix', process.argv) || ANNOUNCEMENT_INSIGHTS_SKILL;
  const notes = db.load();
  const allRaw = await gatherInwindowRaw(client, now, watchlistIds, windowHours);
  const results = [];
  for (const ann of allRaw) {
    const companyId = ann.companyId || '';
    const name = ann.name || ann.companyName || '';
    const title = ann.title || ann.subject || ann.headline || '';
    const dateStr = ann.date || ann.createdAt || '';
    const ssUrl = ann.ssUrl || '';
    const description = ann.description || '';
    const annId = announcementId(ann);
    const pdfUrl = ssUrl ? `${S3_BASE_URL}${ssUrl}` : '';

    const noiseKw = matchedNoiseKeyword(title, description);
    if (noiseKw !== null) {
      await logIgnoredAnnouncement(ann, noiseKw);
      continue;
    }

    const co = NotesDb.getCompany(notes, companyId);
    const processedByUsecase = (co && co.processedByUsecase) || {};
    let alreadyProcessedForThisUsecase = Object.entries(processedByUsecase).some(
      ([usecase, ids]) => usecaseMatchesPrefix(usecase, usecasePrefix) && (ids || []).includes(annId)
    );
    // Back-compat bridge: THIS specific announcement may have been marked
    // processed before usecase-scoping existed, in which case it's in the
    // flat legacy array but in none of the usecase buckets. Historically the
    // ONLY writer of that legacy array was this same announcement-insights
    // pipeline, so — but only when checking the announcement-insights prefix
    // itself, never a different skill's usecase — treat that as "already
    // processed" rather than silently reprocessing every pre-migration
    // announcement the first time a widened window reaches back far enough
    // to see it again. A newer, usecase-tagged entry for a DIFFERENT id on
    // the same company doesn't affect this — the check is per-annId.
    if (
      !alreadyProcessedForThisUsecase &&
      usecasePrefix === ANNOUNCEMENT_INSIGHTS_SKILL &&
      co &&
      (co.processedAnnouncements || []).includes(annId) &&
      !Object.values(processedByUsecase).some((ids) => (ids || []).includes(annId))
    ) {
      alreadyProcessedForThisUsecase = true;
    }
    if (alreadyProcessedForThisUsecase) continue;

    const category = categoriseAnnouncement(title, description);
    const heavyDocument = isHeavyDocumentCategory(category);
    results.push({
      announcementId: annId,
      companyId,
      ticker: companyId,
      name,
      title,
      description,
      date: dateStr,
      ssUrl,
      pdfUrl,
      category,
      // Deterministic (script-side) classification of whether this announcement
      // is a heavy dedicated-workflow document (results/transcript/investor
      // presentation/annual report). watchlist-insights' orchestration skips
      // read-pdf + announcement-insights entirely for these and just logs the
      // skip — see HEAVY_DOCUMENT_CATEGORIES in lib/announcementTaxonomy.js and
      // watchlist-insights' SKILL.md Step 2.
      heavyDocument,
      heavyDocumentSkipReason: heavyDocument ? heavyDocumentSkipReason(category) : null,
      hasNotes: co !== null,
      noteCount: co ? (co.notes || []).length : 0,
    });
  }
  // Record the exact window THIS run used so a later `commit-window` call can
  // durably advance the cursor to precisely this windowEnd — not whenever
  // commit-window happens to be invoked, which could otherwise silently skip
  // anything published in between (see resolveWindowHours' doc comment).
  StorageService.init();
  await StorageService.saveJson(PENDING_WINDOW_PATH, {
    watchlistKey: windowCursorKey(watchlistIds),
    windowStartMs: now.getTime() - windowHours * 60 * 60 * 1000,
    windowEndMs: now.getTime(),
    windowHours,
    computedAtIso: now.toISOString(),
  });
  process.stdout.write(JSON.stringify(results));
}

// ── Shared raw-PDF-text cache (Tier 1 — unconditionally shared, no usecase) ────
//
// Unlike insights (Tier 2, usecase-scoped — see defaultUsecase/getNoteForUsecase
// above), the raw extracted TEXT of a PDF is an objective fact about the
// document, not a judgment call — it doesn't matter whether watchlist-insights,
// gainers-signal, or some future skill is asking for it, the answer is the
// same. Every caller sharing this cache means a PDF already fetched+parsed by
// ANY skill today is never fetched+parsed again by a different one. Keyed on a
// hash of the URL (not the announcementId) since read-pdf/read-pdf-with-meta
// only ever receive a URL — this makes the cache correct even for a caller
// that doesn't know or care about announcementIds at all.
const HEAVY_PARSE_PAGE_THRESHOLD = 4;

function pdfCachePath(url) {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
  return `cache/pdf-text/${hash}.json`;
}

async function readOrFetchPdfMeta(url) {
  StorageService.init();
  const cachePath = pdfCachePath(url);
  const cached = StorageService.readJson(cachePath);
  if (cached && typeof cached.text === 'string') {
    return { text: cached.text, numPages: cached.numPages ?? null, isHeavyParse: Boolean(cached.isHeavyParse) };
  }
  const buf = await stockscans.fetchPdf(url, 60000);
  const { text, numPages } = await pdfToTextWithMeta(buf);
  const isHeavyParse = typeof numPages === 'number' && numPages > HEAVY_PARSE_PAGE_THRESHOLD;
  await StorageService.saveJson(cachePath, {
    pdfUrl: url,
    text,
    numPages,
    isHeavyParse,
    fetchedAtIso: new Date().toISOString(),
  });
  return { text, numPages, isHeavyParse };
}

async function cmdReadPdf(url) {
  if (!url || url === 'null') {
    process.stdout.write('');
    return;
  }
  const { text } = await readOrFetchPdfMeta(url);
  process.stdout.write(text);
}

/**
 * Same as read-pdf but returns {text, numPages, isHeavyParse} as JSON instead
 * of raw text — this is what announcement-insights' Step 1 uses instead of
 * plain read-pdf, so a caller (watchlist-insights) can flag "not skip-listed
 * by category, but still turned out to be a >4-page document" for the digest's
 * Heavy Parse Highlights section without a second PDF fetch. numPages is null
 * when it couldn't be derived (poppler-CLI fallback) — treat that as unknown,
 * not as "not heavy". Shares the same cache as read-pdf (see readOrFetchPdfMeta).
 */
async function cmdReadPdfWithMeta(url) {
  if (!url || url === 'null') {
    process.stdout.write(JSON.stringify({ text: '', numPages: null, isHeavyParse: false }));
    return;
  }
  const { text, numPages, isHeavyParse } = await readOrFetchPdfMeta(url);
  process.stdout.write(JSON.stringify({ text, numPages, isHeavyParse }));
}

function cmdGetCompanyNotes(companyId) {
  const co = NotesDb.getCompany(db.load(), companyId);
  process.stdout.write(JSON.stringify(co));
}

async function cmdAddNote(noteJsonStr) {
  const payload = JSON.parse(noteJsonStr);
  const notes = db.load();
  const co = NotesDb.ensureCompany(
    notes,
    payload.companyId,
    payload.ticker || '',
    payload.name || ''
  );
  if (payload.businessSummary) co.businessSummary = payload.businessSummary;
  let noteId = null;
  const noteData = payload.note;
  if (noteData) {
    // Deterministic safety net for HIGH_CONVICTION_CATEGORIES (demerger/merger/
    // acquisition/management_change): never let one slip through as low/routine
    // or untagged just because the model forgot — see the significance-floor and
    // high_conviction-tag rule in announcement-insights' _global.md template.
    // This is enforcement, not judgment — the actual analysis is still the
    // caller's job, this just guards the floor deterministically.
    const category = (noteData.category || '').trim().toLowerCase();
    // Which usecase produced this note — defaults to the announcement-insights
    // family at the depth implied by category (deep for high-conviction,
    // standard otherwise) so existing callers that don't pass this explicitly
    // yet keep working exactly as before. New/other callers should always
    // pass their own explicit usecase (e.g. "gainers-signal:quick") rather
    // than relying on this default, which is announcement-insights-specific.
    const usecase = noteData.usecase || defaultUsecase(category, noteData.depth);
    let significance = noteData.significance || 'routine';
    let tags = Array.isArray(noteData.tags) ? [...noteData.tags] : [];
    if (HIGH_CONVICTION_CATEGORIES.has(category)) {
      if (significance === 'routine' || significance === 'low') significance = 'medium';
      if (!tags.includes('high_conviction')) tags.push('high_conviction');
    }
    // numPages/isHeavyParse come from announcement-insights' Step 1
    // (read-pdf-with-meta) and get stored on the note itself — this is what
    // lets send-digest deterministically render the "Heavy Parse Highlights"
    // section (>4 pages, NOT a skip-listed category) without a second
    // PDF fetch or a separate log file. See watchlist-insights' SKILL.md.
    const numPages = Number.isFinite(noteData.numPages) ? noteData.numPages : null;
    const isHeavyParse = noteData.isHeavyParse === true || (typeof numPages === 'number' && numPages > 4);
    if (isHeavyParse && !tags.includes('heavy_parse')) tags.push('heavy_parse');
    const entry = {
      id: NotesDb.uuid(),
      createdAt: ist.nowIstIso(),
      type: noteData.type || 'manual',
      announcementId: noteData.announcementId ?? null,
      announcementTitle: noteData.announcementTitle ?? null,
      pdfUrl: noteData.pdfUrl ?? null,
      insight: noteData.insight || '',
      significance,
      tags,
      category: noteData.category || '',
      announcementDescription: noteData.announcementDescription || '',
      numPages,
      isHeavyParse,
      usecase,
    };
    co.notes.push(entry);
    noteId = entry.id;
  }
  co.lastUpdated = ist.nowIstIso();
  co.modifiedTime = co.lastUpdated; // output-dto-standard envelope field
  await db.save(notes);
  process.stdout.write(
    JSON.stringify({ status: 'ok', companyId: payload.companyId, noteId, usecase: noteData ? noteData.usecase || defaultUsecase(noteData.category, noteData.depth) : null })
  );
}

/**
 * mark-processed <companyId> <announcementId> [usecase]
 * `usecase` defaults to the shared announcement-insights baseline (unchanged
 * behavior for existing callers), but should be passed explicitly whenever
 * the caller isn't going through the standard announcement-insights template
 * pipeline — e.g. `heavy-doc-skip` for a heavy-document skip-log entry (never
 * actually read/insight-generated, so it must NOT block a different skill,
 * like quarterly-result-analysis, from later processing that same document
 * under its own usecase), or `<your-skill>:<variant>` for anything else.
 * Always writes both the legacy flat `processedAnnouncements` array (kept for
 * any caller still reading that directly) AND the usecase-scoped map that
 * fetch-announcements' skip-check actually consults.
 */
async function cmdMarkProcessed(companyId, annId, usecase = ANNOUNCEMENT_INSIGHTS_SKILL) {
  const notes = db.load();
  const co = NotesDb.ensureCompany(notes, companyId);
  if (!co.processedAnnouncements.includes(annId)) co.processedAnnouncements.push(annId);
  co.processedByUsecase ||= {};
  const bucket = (co.processedByUsecase[usecase] ||= []);
  if (!bucket.includes(annId)) bucket.push(annId);
  co.lastUpdated = ist.nowIstIso();
  co.modifiedTime = co.lastUpdated; // output-dto-standard envelope field
  await db.save(notes);
  process.stdout.write(JSON.stringify({ status: 'ok', usecase }));
}

function cmdListCompanies() {
  const notes = db.load();
  const result = Object.values(notes.companies || {}).map((co) => ({
    companyId: co.companyId,
    ticker: co.ticker || '',
    name: co.name || '',
    noteCount: (co.notes || []).length,
    lastUpdated: co.lastUpdated,
  }));
  process.stdout.write(JSON.stringify(result));
}

function cmdInsightTemplate(category = 'general') {
  const depth = argValue('--depth', process.argv) || 'standard';
  process.stdout.write(insightTemplate(category, depth));
}

function cmdInitNotes() {
  db.initRun();
  process.stdout.write(
    JSON.stringify({ status: 'ready', file: db.getLatestFile(), dir: 'entities' })
  );
}

async function sendHtml(htmlBody, subject = `📊 Watchlist Insights — ${ist.nowIstHuman()}`) {
  return sendHtmlEmail({ subject, htmlBody });
}

async function cmdSendSummary(htmlBody) {
  process.stdout.write(JSON.stringify(await sendHtml(htmlBody)));
}

// ── Full 24h digest ───────────────────────────────────────────────────────────

/**
 * Look up the note this digest should show for an announcement, given the
 * category-implied usecase (deep for high-conviction, standard otherwise).
 * IMPORTANT — this must never be used to FILTER an announcement out of the
 * digest, only to decide which cached note (if any) to display alongside it.
 * The caller (collectDigest) always keeps every in-window, non-noise
 * announcement in the output regardless of what this returns — an
 * already-cached announcement is shown WITH its cached insight, never
 * dropped just because it isn't "new". Falls back, in order: (1) the exact
 * usecase this category/depth implies, (2) any other announcement-insights:*
 * note (covers a depth choice that varied run-to-run for the same category),
 * (3) the single newest note regardless of usecase, so a genuinely different
 * skill's note is still surfaced rather than shown blank — `insightUsecase`
 * on the returned entry always says which one actually matched, so a reader
 * (or another script) can tell "this is a standard watchlist-insights note"
 * apart from "this is someone else's note, shown as a fallback".
 */
function pickDigestNote(idx, aid, category) {
  const entry = idx[aid];
  if (!entry) return { note: null, usecase: null };
  const wantedUsecase = defaultUsecase(category);
  if (entry.byUsecase[wantedUsecase]) {
    return { note: entry.byUsecase[wantedUsecase][0], usecase: wantedUsecase };
  }
  const anyAnnouncementInsights = Object.entries(entry.byUsecase).find(([uc]) =>
    usecaseMatchesPrefix(uc, ANNOUNCEMENT_INSIGHTS_SKILL)
  );
  if (anyAnnouncementInsights) {
    return { note: anyAnnouncementInsights[1][0], usecase: anyAnnouncementInsights[0] };
  }
  if (entry.latest) {
    const [latestNote] = entry.latest;
    return { note: latestNote, usecase: latestNote.usecase || NotesDb.LEGACY_USECASE };
  }
  return { note: null, usecase: null };
}

async function collectDigest(client, watchlistIds, windowHours = DEFAULT_WINDOW_HOURS) {
  client = client || stockscans;
  const notes = db.load();
  const idx = NotesDb.buildNoteIndex(notes);
  const seen = new Set();
  const digest = [];
  for (const ann of await gatherInwindowRaw(client, new Date(), watchlistIds, windowHours)) {
    const title = ann.title || ann.subject || ann.headline || '';
    const description = ann.description || '';
    if (isNoise(title, description)) continue;
    const aid = announcementId(ann);
    if (seen.has(aid)) continue;
    seen.add(aid);
    const ssUrl = ann.ssUrl || '';
    const category = categoriseAnnouncement(title, description);
    // Every in-window, non-noise announcement is kept below regardless of
    // whether a cached note was found — see pickDigestNote's doc comment.
    const { note, usecase } = pickDigestNote(idx, aid, category);
    digest.push({
      announcementId: aid,
      companyId: ann.companyId || '',
      ticker: ann.companyId || '',
      name: ann.name || ann.companyName || '',
      title,
      description,
      date: ann.date || ann.createdAt || '',
      pdfUrl: ssUrl ? `${S3_BASE_URL}${ssUrl}` : '',
      category,
      insight: (note || {}).insight || '',
      significance: note ? note.significance || '' : '',
      tags: note ? note.tags || [] : [],
      hasInsight: Boolean(note && note.insight),
      needsInsight: !(note && note.insight),
      // Which usecase's note is being shown (null if none found yet) — lets a
      // JSON consumer reference/cross-check the source instead of assuming
      // the text came from today's expected depth. See pickDigestNote.
      insightUsecase: usecase,
      noteId: note ? note.id || null : null,
      // Heavy Parse Highlights (Step 0 in announcement-insights): a note whose
      // category was NOT skip-listed but whose PDF still turned out >4 pages.
      // Rendered as a separate digest section so insight-validation can review
      // whether that category deserves its own skip rule.
      isHeavyParse: Boolean(note && note.isHeavyParse),
      numPages: note ? note.numPages ?? null : null,
    });
  }
  return digest;
}

function buildDigestHtml(digest, windowHours = DEFAULT_WINDOW_HOURS, watchlistIds = [], heavySkips = []) {
  const dateStr = ist.nowIstDate();
  const buckets = { high: [], medium: [], low: [] };
  for (const d of digest) {
    const sig = (d.significance || 'low').toLowerCase();
    if (sig === 'routine') continue;
    (buckets[sig] || buckets.low).push(d);
  }
  const sections = [
    ['high', '🔴 High Significance', '#e53e3e'],
    ['medium', '🟡 Medium Significance', '#d69e2e'],
    ['low', '🟢 Low Significance', '#38a169'],
  ];
  const nCompanies = new Set(digest.map((d) => d.companyId)).size;
  const windowLabel = windowHours === 24 ? 'last 24h' : `last ${windowHours}h`;
  const watchlistLinks = watchlistIds.length
    ? watchlistIds
        .map(
          (id, i) =>
            `<a href="https://www.stockscans.in/watchlist/${id}" style="color:#999;text-decoration:none">Watchlist ${i + 1}</a>`
        )
        .join(' &nbsp;·&nbsp; ')
    : '';
  const parts = [
    `<p><b>${digest.length} announcements across ${nCompanies} companies (${windowLabel}).</b></p>`,
  ];
  for (const [key, heading, color] of sections) {
    const items = buckets[key];
    if (!items.length) continue;
    parts.push(`<h3>${heading}</h3>`);
    for (const d of items) {
      const insight = d.insight || d.description || '(no stored insight)';
      const tags = (d.tags || []).join(', ');
      const pdf = d.pdfUrl ? ` | <a href="${d.pdfUrl}">PDF</a>` : '';
      parts.push(
        `<div style="margin-bottom:16px;border-left:3px solid ${color};padding-left:12px">` +
          `<b>${stockscansLink(`${d.name} (${d.ticker})`, d.ticker, 'NSE')} — ${d.title}</b><br>${insight}<br>` +
          `<small>Tags: ${tags}${pdf}</small></div>`
      );
    }
  }
  parts.push(
    '<p style="color:#999;font-size:12px">Routine announcements suppressed. ' +
      'Insights for previously-seen announcements are read from company_notes.json.</p>'
  );

  // ── Heavy Parse Highlights: NOT skip-listed by category, but the PDF still
  // turned out >4 pages. Deterministic — no LLM judgment involved, just
  // filtering notes already tagged isHeavyParse/heavy_parse by add-note. ──────
  const heavyParseItems = digest.filter((d) => d.isHeavyParse);
  if (heavyParseItems.length) {
    parts.push('<h3>📄 Heavy Parse Highlights (&gt;4 pages, not skip-listed)</h3>');
    parts.push(
      '<p style="color:#999;font-size:12px">These categories aren\'t in ' +
        'HEAVY_DOCUMENT_CATEGORIES, but the actual filing still needed heavy parsing — ' +
        'insight-validation reviews this list for candidate skip-rule additions.</p>'
    );
    for (const d of heavyParseItems) {
      parts.push(
        `<div style="margin-bottom:8px;font-size:13px">` +
          `${stockscansLink(`${d.name} (${d.ticker})`, d.ticker, 'NSE')} — ${d.title} ` +
          `<i>[${d.category}, ${d.numPages ?? '?'} pages]</i></div>`
      );
    }
  }

  // ── Skipped (heavy-document category, never PDF-parsed at all) ─────────────
  if (heavySkips.length) {
    parts.push('<h3>🚫 Skipped (heavy-document category — not parsed)</h3>');
    parts.push(
      '<p style="color:#999;font-size:12px">Skipped by category before any PDF fetch — ' +
        'if something genuine was missed here, flag it so the category rule can be ' +
        'corrected.</p>'
    );
    for (const s of heavySkips) {
      parts.push(
        `<div style="margin-bottom:8px;font-size:13px">` +
          `${stockscansLink(`${s.name} (${s.companyId})`, s.companyId, 'NSE')} — ${s.title} ` +
          `<i>[${s.category}]</i><br><span style="color:#999">${s.reason}</span></div>`
      );
    }
  }

  if (watchlistLinks) {
    parts.push(
      `<p style="font:11px Arial;color:#999;margin:16px 0 0;border-top:1px solid #eee;padding-top:8px">Source: ${watchlistLinks}</p>`
    );
  }
  return parts.join('\n');
}

async function cmdBuildDigest(watchlistIdsArg, client = stockscans) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const windowHours = resolveWindowHours(new Date(), watchlistIds);
  const digest = await collectDigest(client, watchlistIds, windowHours);
  const heavySkips = readHeavySkips();
  process.stdout.write(
    JSON.stringify({
      digest,
      heavySkips,
      heavyParseCount: digest.filter((d) => d.isHeavyParse).length,
    })
  );
}

async function cmdSendDigest(watchlistIdsArg, client = stockscans) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const windowHours = resolveWindowHours(new Date(), watchlistIds);
  const digest = await collectDigest(client, watchlistIds, windowHours);
  const heavySkips = readHeavySkips();
  const missing = digest.filter((d) => d.needsInsight).map((d) => d.announcementId);
  const roundedHours = Math.round(windowHours * 10) / 10;
  const windowLabel = roundedHours === 24 ? '' : ` (${roundedHours}h)`;
  const status = await sendHtml(
    buildDigestHtml(digest, windowHours, watchlistIds, heavySkips),
    `📊 Watchlist Insights${windowLabel} — ${ist.nowIstDate()}`
  );
  Object.assign(status, {
    totalAnnouncements: digest.length,
    withInsight: digest.filter((d) => d.hasInsight).length,
    missingInsight: missing.length,
    missingIds: missing,
  });
  process.stdout.write(JSON.stringify(status));
}

/**
 * Durably advance the resumable window cursor to the exact windowEnd that the
 * most recent `fetch-announcements` call for these watchlistIds used (read
 * from the pending-window marker it wrote — never "now", which would silently
 * skip anything published between that fetch and this commit). Call this only
 * once a run is confirmed healthy (see the skill's Step 3 digest health check)
 * — committing after a partially-failed run would permanently drop whatever
 * didn't get processed, since the next run's window would no longer reach
 * back far enough to see it.
 */
async function cmdCommitWindow(watchlistIdsArg) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const key = windowCursorKey(watchlistIds);
  StorageService.init();
  const pending = StorageService.readJson(PENDING_WINDOW_PATH);
  if (!pending || pending.watchlistKey !== key) {
    throw new Error(
      `commit-window: no matching pending window for watchlists [${key}] — call fetch-announcements ` +
        `for these exact watchlistIds earlier in this run before committing.`
    );
  }
  const cursor = readWindowCursor();
  cursor[key] = {
    lastCommittedAtMs: pending.windowEndMs,
    lastCommittedAtIso: new Date(pending.windowEndMs).toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
  await StorageService.saveJson(WINDOW_CURSOR_PATH, cursor);
  process.stdout.write(
    JSON.stringify({ status: 'ok', watchlistKey: key, lastCommittedAtIso: cursor[key].lastCommittedAtIso })
  );
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const COMMANDS = {
  'fetch-announcements': [cmdFetchAnnouncements, 1],
  'read-pdf': [cmdReadPdf, 1],
  'read-pdf-with-meta': [cmdReadPdfWithMeta, 1],
  'get-company-notes': [cmdGetCompanyNotes, 1],
  'add-note': [cmdAddNote, 0],
  'mark-processed': [cmdMarkProcessed, 3],
  'log-heavy-skip': [cmdLogHeavySkip, 1],
  'get-heavy-skips': [cmdGetHeavySkips, 0],
  'list-companies': [cmdListCompanies, 0],
  'insight-template': [cmdInsightTemplate, 1],
  'send-summary': [cmdSendSummary, 0],
  'build-digest': [cmdBuildDigest, 1],
  'send-digest': [cmdSendDigest, 1],
  'commit-window': [cmdCommitWindow, 1],
  'init-notes': [cmdInitNotes, 0],
};

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function runCli(argv) {
  const cmd = argv[0];
  if (!cmd || !COMMANDS[cmd]) {
    process.stdout.write(
      `Usage: watchlistInsights.js <command> [args]\nCommands: ${Object.keys(COMMANDS).join(', ')}\n`
    );
    process.exit(1);
  }
  const [fn, nArgs] = COMMANDS[cmd];
  let args = nArgs ? argv.slice(1, 1 + nArgs) : [];
  // stdin-or-arg commands
  if ((cmd === 'add-note' || cmd === 'send-summary') && !argv[1]) args = [readStdin()];
  else if (cmd === 'add-note' || cmd === 'send-summary') args = [argv[1]];
  try {
    await fn(...args);
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: e.message, command: cmd }));
    process.exit(1);
  }
}

module.exports = {
  categoriseAnnouncement,
  insightTemplate,
  announcementId,
  isNoise,
  matchedNoiseKeyword,
  gatherInwindowRaw,
  buildDigestHtml,
  collectDigest,
  cmdFetchAnnouncements,
  cmdBuildDigest,
  cmdSendDigest,
  cmdCommitWindow,
  parseWatchlistIds,
  parseWindowHours,
  resolveWindowHours,
  mostRecentEightAmIstMs,
  defaultWindowFloorMs,
  windowCursorKey,
  cmdMarkProcessed,
  cmdAddNote,
  defaultUsecase,
  usecaseMatchesPrefix,
  pickDigestNote,
  ANNOUNCEMENT_INSIGHTS_SKILL,
  readOrFetchPdfMeta,
  pdfCachePath,
  DEFAULT_WINDOW_HOURS,
  CATEGORY_RULES,
  INSIGNIFICANT_KEYWORDS,
  runCli,
  db,
};

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  // v2: no wrap-around Drive sync — run `yarn data:push` (scripts/data.js) after the job.
  runCli(process.argv.slice(2)).catch((e) => {
    process.stderr.write(JSON.stringify({ error: e.message, command: 'cli' }));
    process.exit(1);
  });
}
