#!/usr/bin/env node
'use strict';

/**
 * packages/jobs-runtime/postCloseScanInsights.js
 *
 * Companion script for the `post-close-scan-insights` skill. Owns the parts
 * of the pipeline that are SPECIFIC to an ad-hoc, non-watchlist announcement
 * scan (fetch-to-cutoff pagination, noise filter, categorisation, heavy-doc
 * routing). Everything else — reading a PDF, loading company notes, writing
 * an insight note, marking an announcement processed — is deliberately NOT
 * duplicated here: it already exists in `watchlistInsights.js` and this
 * script's own SKILL.md instructs the caller to shell out to those same
 * commands, exactly as the original ad-hoc run in chat did by hand. See
 * skills/_shared/conventions.md §17 ("never think or write the same thing
 * twice") — this is the DEPENDENCIES-check outcome for this skill.
 *
 * Commands:
 *   fetch-scan [--window-hours N]   -> JSON array of raw announcements since cutoff
 *   filter-noise <fetch-scan.json>  -> {kept, dropped} after noise-keyword filter
 *   categorise <filter-noise kept>  -> adds {category, heavyDocument, pdfUrl}
 *   send-digest <insights.json>     -> emails a significance-grouped HTML digest
 *   commit-window                   -> durably advances the resumable window cursor (call after a healthy run)
 */

const fs = require('fs');
const axios = require('axios');
const { StockscansAuth } = require('../../stock-api/src/auth/stockscansAuth');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const ist = require('./lib/ist');
const tradingCalendar = require('./lib/tradingCalendar');
const db = require('./lib/db');
const { stockscans } = require('@stock/api');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const { withRetry } = require('@stock/api/utils/concurrency');
// resend-with-market-data (see cmdResendWithMarketData) reuses gainers-signal's
// already-proven NSE/BSE delivery lookup rather than re-implementing it — same
// "never think or write the same thing twice" rule as everywhere else in this
// file. gainersScanner.js gates its own CLI auto-invocation behind
// `require.main === module`, so requiring it here for its exports is inert.
const { fetchDeliveryPerSymbol, fetchPrices, pick, toFloat } = require('./gainersScanner');
const {
  shouldIgnoreAnnouncement,
  matchedNoiseKeyword,
} = require('../../stock-api/src/utils/announcementNoiseFilter');
const {
  categoriseAnnouncement,
  HEAVY_DOCUMENT_CATEGORIES,
  HIGH_CONVICTION_CATEGORIES,
} = require('./lib/announcementTaxonomy');
const { NotesDb } = require('./lib/notesDb');

const BASE_URL = 'https://www.stockscans.in';
const PAGE_SIZE = 30; // documented convention (see bulkAnnouncementScan.js) — not the response's self-inflating `total`

// User-supplied "LineExpandView" redirect/expand icon (external-link button on
// each digest card, see buildDigestHtml). Referenced in the HTML as
// `cid:expand-icon` and sent as a real MIME attachment (see cmdSendDigest) —
// NOT a data: URI in any form. Confirmed 2026-08-27 (both directly in Gmail,
// via Chrome DevTools inspection of the live rendered DOM): Gmail's inbound
// HTML sanitizer strips the `src` attribute from any `<img src="data:...">`
// entirely — `img.src` came back as an empty string and `img.outerHTML` had
// no src attribute at all, regardless of whether the data URI was
// `image/png;base64` or `image/svg+xml;base64`. A `cid:` reference to a real
// attached MIME part is the only reliable way Gmail supports for inlining a
// small icon without hosting it on an external URL (see nodemailer's
// attachments-with-cid docs). Rendered to PNG via `sharp` (proper SVG
// rasterizer, unlike ImageMagick's built-in parser which mangled this path's
// curve shorthand) at 28x27 @ ~4x density for retina sharpness at the
// rendered 12x12 display size. Regenerate if the icon design changes:
//   node -e "require('sharp')(Buffer.from(SVG_STRING), {density:300}).resize(28,27).png().toBuffer().then(b => console.log(b.toString('base64')))"
// (EXPAND_ICON_CID / EXPAND_ICON_PNG_BASE64 now imported from lib/thesisCardEmail.js
// below — the icon belongs with the renderer that references it.)

// ── Scan universe: resolved LIVE from the user's saved announcement-scans ──
//
// Until 2026-09-04 this file hardcoded a literal `DEFAULT_SCAN` object — a
// snapshot of the ad-hoc filter set used for the very first manual run
// (2026-08-19). That snapshot immediately started drifting: Darshan tunes
// this universe in the Stockscans UI (mcap ceiling, institutional-holding
// floor, liquidity), and every tune silently failed to reach the nightly
// job because the job was reading a copy frozen in source. The universe is
// the user's decision, not the code's — so the code now asks for it.
//
// SOURCE OF TRUTH: `GET /api/user/announcement-scans`, the saved-scan named
// `SCAN_SOURCE_NAME`. Confirmed live 2026-09-04: the response is
// `{announcementScans: [{scanId, scanName, filters, industry, index,
// watchlistIds, searchFilters, announcementType, alerts, searchMode,
// companyIds}], subscription}` — note it does NOT include `companyFilters`,
// which `announcements/scan` expects, so it is defaulted in below.
const SCAN_SOURCE_NAME = 'Signals - DND';
const SCAN_CACHE_PATH = 'cache/post-close-scan-insights-scan.json';

// LAST-RESORT frozen fallback, used ONLY when both the API and the cache are
// unavailable. This is deliberately the CURRENT (2026-09-04) shape of the
// "Signals - DND" saved scan, not the old `Test` scan, so a fallback run
// still scans approximately the right universe rather than a year-old one.
// It is NOT the source of truth and must never be edited to "change the
// universe" — edit the saved scan in Stockscans instead.
const FALLBACK_SCAN = {
  scanId: '7e07567f7867028e90a6e368',
  scanName: SCAN_SOURCE_NAME,
  filters: [
    { left: 'Market Capitalization', sign: '>=', right: '300' },
    { left: 'Retail Holdings * Market Capitalization', sign: '>=', right: '5000' },
    { left: 'Close Price', sign: '>=', right: 'EMA 200D' },
    { left: 'FII Holdings + DII Holdings', sign: '>=', right: '0' },
    { left: 'Market Capitalization', sign: '<', right: '70000' },
  ],
  industry: [],
  index: [],
  watchlistIds: [],
  searchFilters: [],
  announcementType: 'All',
  alerts: false,
  searchMode: 'quick',
  companyIds: [],
  companyFilters: [],
};

// Normalise a saved-scan record into the exact shape
// `POST /api/company/announcements/scan` accepts. `scanId`/`scanName` are
// REQUIRED by that endpoint (see docs/stockscans-api-schemas.md — omitting
// them is a hard 400), and `companyFilters` is absent from the saved-scan
// response but expected by the scan endpoint, so both are filled in here
// rather than at each call site.
function normaliseSavedScan(saved) {
  return {
    scanId: saved.scanId,
    scanName: saved.scanName,
    filters: saved.filters || [],
    industry: saved.industry || [],
    index: saved.index || [],
    watchlistIds: saved.watchlistIds || [],
    searchFilters: saved.searchFilters || [],
    announcementType: saved.announcementType || 'All',
    alerts: saved.alerts === true,
    searchMode: saved.searchMode || 'quick',
    companyIds: saved.companyIds || [],
    companyFilters: saved.companyFilters || [],
  };
}

/**
 * Resolve this run's scan universe, newest-first with two degradations, so a
 * transient Stockscans outage narrows correctness rather than failing the
 * whole night:
 *
 *   1. LIVE — GET /api/user/announcement-scans, pick `SCAN_SOURCE_NAME`.
 *      On success the resolved scan is written to `SCAN_CACHE_PATH` so the
 *      next degraded run has something recent to fall back to, and so the
 *      run report can show exactly which filter set was used.
 *   2. CACHE — the last successfully-resolved copy. Still the user's real
 *      filters, just possibly a few days stale; the returned `source` says
 *      so, and the skill surfaces that in the run report (a silently stale
 *      universe is the failure mode this whole change exists to remove).
 *   3. FALLBACK — the frozen literal above. Loud, last resort.
 *
 * Returns `{scan, source, resolvedAtIso, scanName, filterCount}` — never
 * just the scan, because every caller needs to be able to REPORT which of
 * the three it got.
 */
async function resolveScan() {
  const StorageService = require('@stock/cloud-utils').StorageService;
  try {
    const { data } = await axios.get(`${BASE_URL}/api/user/announcement-scans`, {
      headers: authHeaders(),
      timeout: 30000,
    });
    const list = Array.isArray(data)
      ? data
      : data.announcementScans || data.scans || data.data || [];
    const saved = list.find((s) => String(s.scanName || s.name || '').trim() === SCAN_SOURCE_NAME);
    if (!saved) {
      // A missing scan is NOT a network problem — it means the scan was
      // renamed or deleted, which the user needs to know about explicitly
      // rather than have papered over by a cache hit. Name every scan we
      // DID see, so the fix (rename it back, or update SCAN_SOURCE_NAME) is
      // obvious from the error alone.
      throw new Error(
        `saved announcement-scan "${SCAN_SOURCE_NAME}" not found. Available: ` +
          list.map((s) => JSON.stringify(s.scanName || s.name)).join(', ')
      );
    }
    const scan = normaliseSavedScan(saved);
    const resolved = {
      scan,
      source: 'live',
      resolvedAtIso: new Date().toISOString(),
      scanName: scan.scanName,
      filterCount: scan.filters.length,
    };
    StorageService.init();
    await StorageService.saveJson(SCAN_CACHE_PATH, resolved);
    return resolved;
  } catch (err) {
    process.stderr.write(`[WARN] live scan resolution failed: ${err.message}\n`);
    try {
      StorageService.init();
      const cached = StorageService.readJson(SCAN_CACHE_PATH);
      if (cached && cached.scan && (cached.scan.filters || []).length) {
        process.stderr.write(
          `[WARN] falling back to cached scan resolved ${cached.resolvedAtIso}\n`
        );
        return { ...cached, source: 'cache', cacheResolvedAtIso: cached.resolvedAtIso };
      }
    } catch (e) {
      process.stderr.write(`[WARN] scan cache unreadable: ${e.message}\n`);
    }
    process.stderr.write('[WARN] falling back to the FROZEN in-source scan definition\n');
    return {
      scan: FALLBACK_SCAN,
      source: 'fallback',
      resolvedAtIso: new Date().toISOString(),
      scanName: FALLBACK_SCAN.scanName,
      filterCount: FALLBACK_SCAN.filters.length,
    };
  }
}

async function cmdResolveScan() {
  loadEnv();
  const resolved = await resolveScan();
  process.stdout.write(JSON.stringify(resolved, null, 2));
}

function currentQuarterDate(date = new Date()) {
  // Same "next calendar quarter from filing date" semantics documented in
  // bulkAnnouncementScan.js computeReleaseQuarterDate — but since this scan
  // is about TODAY's/recent filings, we just want the quarter bucket the
  // most recent filings land in, which is simply the current IST calendar
  // quarter-end.
  const d = ist.istDate(date);
  const m = d.getUTCMonth(); // 0-11
  const q = Math.floor(m / 3); // 0..3
  const endMonth = (q + 1) * 3; // 3,6,9,12
  return `${d.getUTCFullYear()}${String(endMonth).padStart(2, '0')}`;
}

/**
 * Deterministic FLOOR: "since the most recent 3:30 PM IST market close
 * strictly before now". This is the anchor floor, not the final answer — see
 * `resolveCutoffUtc` below, which also consults the resumable cursor so a
 * run never re-fetches announcements an earlier run already committed.
 *
 * "Most recent 3:30 PM IST market close" means the most recent REAL trading
 * day's close — not just "yesterday", and not just "the last weekday".
 * Two separate non-trading-day gaps would otherwise cause a silent skip:
 *   - Weekends (fixed 2026-08-23): Monday's ~2 AM run naively looks back to
 *     only Sunday 3:30 PM, missing everything filed Friday evening through
 *     the weekend (weekend NCLT orders and SAST disclosures do land on
 *     non-trading days).
 *   - NSE/BSE trading holidays (fixed 2026-08-23): the morning after ANY
 *     midweek holiday has the identical problem — e.g. a run on the day
 *     after Diwali looks back to the holiday's 3:30 PM instead of the prior
 *     trading day's.
 * `tradingCalendar.lastTradingDayOnOrBefore` (backed by NSE's public
 * holiday-master API, cached in `data/cache/trading-holidays-<year>.json`,
 * refreshed weekly) walks back over both weekends AND holidays, so every
 * calendar day's run resolves to the same last-real-trading-day close a
 * human would expect.
 */
async function defaultCutoffUtc(now = new Date()) {
  const d = ist.istDate(now);
  const today1530 = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 30, 0)
  );
  let cutoffIst = today1530;
  if (d.getTime() < today1530.getTime()) {
    cutoffIst = new Date(today1530.getTime() - 24 * 60 * 60 * 1000);
  }
  // Walk back over weekends AND holidays so the cutoff always lands on the
  // most recent real-trading-day close, not merely "yesterday's" or "the
  // last weekday's".
  cutoffIst = await tradingCalendar.lastTradingDayOnOrBefore(cutoffIst);
  // cutoffIst is a UTC-typed Date holding IST wall-clock fields (istDate's
  // convention) — convert back to a real UTC instant.
  return new Date(cutoffIst.getTime() - (5 * 60 + 30) * 60 * 1000);
}

// RESUMABLE CURSOR (added 2026-08-23, ported to the shared module
// 2026-08-23) — same pattern as watchlist-insights' WINDOW_CURSOR_PATH,
// applied here because the original "no cursor needed" reasoning turned out
// to be wrong: this skill DOES have same-cycle runs close enough together to
// double-process. Concretely — if a run ever fires on a Saturday or Sunday
// (e.g. a manual catch-up, or the schedule changes), it commits a cursor at
// Saturday-evening's actual fetch boundary. Without a cursor, Monday's run
// would recompute its window from `defaultCutoffUtc` alone (Friday's close)
// and re-fetch/re-process everything Saturday's run already handled —
// harmless in that `mark-processed` dedupes at the announcement level, but
// wasteful (re-reads PDFs, re-asks the model to judge significance) and the
// exact kind of repeated work `skills/_shared/conventions.md` §17 says to
// design out, not tolerate. See `lib/windowCursor.js` for the shared,
// reusable version of this — this is now the SECOND consumer (after
// watchlist-insights) proving out the extraction, and the STANDARD pattern
// any new recurring job with expensive per-item processing should reach for
// from the start rather than re-deriving. commit-window is called only
// after a run's digest send succeeds (see skill's Step 4/5) — never on a
// partial failure, so a failed run's un-processed announcements stay
// reachable by the next run instead of being silently dropped.
const windowCursor = require('./lib/windowCursor')('post-close-scan-insights');

/**
 * Resolve this run's actual cutoff via the shared cursor module: the LATER
 * of the anchor floor (`defaultCutoffUtc` — last real trading day's 3:30 PM
 * close) and the last-committed cursor, if any and if not stale beyond the
 * safety cap. "Later" is correct here because a committed cursor means
 * "everything up to here is already handled" — moving the cutoff any
 * earlier than that would re-fetch already-processed announcements, which
 * is exactly the double-processing this cursor exists to prevent. If the
 * cursor is somehow OLDER than the anchor floor (e.g. a genuinely missed
 * multi-day run, or a first-ever run with a stale seed), the anchor floor
 * wins instead — the floor is never allowed to widen this job's window past
 * "since last trading day's close" on its own; use --window-hours for that.
 */
async function resolveCutoffUtc(now, windowHoursArg) {
  const floorMs = (await defaultCutoffUtc(now)).getTime();
  const startMs = await windowCursor.resolveWindowStartMs({ now, floorMs, windowHoursArg });
  return new Date(startMs);
}

// TIMEZONE OF `createdAt` — CORRECTED 2026-09-04. Read this before touching it.
//
// The Stockscans `announcements/scan` API returns `createdAt` as a bare ISO
// datetime with no zone marker (e.g. "2026-09-04T01:10:10.809903"). A
// 2026-08-31 change to this file concluded that bare field was already UTC
// and parsed it as such. That conclusion was WRONG — it was drawn from a
// single observation ("createdAt looked ~10 minutes ahead of wall-clock UTC")
// that is also consistent with several other explanations. The field is IST.
//
// Re-verified 2026-09-04 on a 1,014-announcement unfiltered sample, three
// independent ways, all agreeing:
//
//   1. `createdAt`'s own calendar date equals the separate coarse `date`
//      field for 1013/1014 items (99.9%). Under the UTC reading — i.e.
//      shifting createdAt by +5:30 to get an IST date — that agreement
//      collapses to 204/1014 (20%). The API would not ship a `date` field
//      that disagrees with its own `createdAt` on 80% of rows.
//   2. The newest `createdAt` in the sample was 2026-09-04T01:10:10, fetched
//      when wall-clock UTC was 2026-09-03T22:59. Under the UTC reading that
//      is a timestamp 2h11m in the FUTURE, which is impossible. Under the
//      IST reading it is 3h19m in the past — consistent.
//   3. Under the IST reading, filing activity clusters 09:00-01:00 IST and
//      goes silent 01:10-09:00 IST, which is what an Indian exchange filing
//      feed actually looks like. Under the UTC reading the same data claims
//      the market files most heavily at 23:00-06:30 IST and files NOTHING
//      during the 09:15-15:30 session — not credible.
//
// Why the direction of the old bug matters: parsing an IST timestamp as UTC
// places every announcement 5.5 hours LATER than it really happened. Against
// a "since last close" cutoff that is over-inclusive (items appear newer, so
// more of them clear the cutoff) rather than lossy — which is why it never
// produced an obviously-empty digest and went unnoticed. But it also means
// the resumable cursor was advancing to boundaries that did not correspond
// to real filing times, so "everything up to here is handled" was not
// actually true at the claimed instant. Correctness of the multi-slot
// intraday windows (see the slot design in the skill) depends entirely on
// this being right, which is why it is fixed here rather than tolerated.
//
// `ist.parseCreatedAtMs`, used by other jobs-runtime scripts, makes the
// SAME bare-timestamp assumption for note `createdAt` values — but those are
// written by this repo via `ist.nowIstIso()` (genuinely IST), so that helper
// is correct for its own inputs and is deliberately left alone.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function parseAnnDateToUtc(str) {
  if (!str) return null;
  // An explicit zone marker is authoritative — trust it and don't shift.
  if (/[+-]\d{2}:\d{2}$/.test(str) || /Z$/.test(str)) return new Date(str);
  const m = String(str).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, dd, h, mi, sec] = m.map(Number);
    // Bare = IST wall clock -> subtract the offset to get the real instant.
    return new Date(Date.UTC(y, mo - 1, dd, h, mi, sec) - IST_OFFSET_MS);
  }
  // Date-only "YYYY-MM-DD" (the coarse `date` field) — treat as IST midnight,
  // the most conservative reading: it can only make an item look OLDER than
  // it is, so a same-day item is never wrongly excluded from a window that
  // starts before that midnight.
  const dOnly = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dOnly) {
    const [, y, mo, dd] = dOnly.map(Number);
    return new Date(Date.UTC(y, mo - 1, dd) - IST_OFFSET_MS);
  }
  return new Date(str);
}

function authHeaders() {
  const auth = new StockscansAuth({ envPath: `${__dirname}/../../.env` });
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: BASE_URL,
    cookie: `authtoken=${auth.getToken()}`,
    referer: `${BASE_URL}/announcement-scans`,
  };
}

/**
 * SLOTS (added 2026-09-04). This job now runs several times a trading day —
 * during the session as well as after it — instead of once at 2 AM. `--slot`
 * is a LABEL, not a separate cursor: all slots deliberately share ONE cursor,
 * because they are consecutive slices of the same continuous stream. A run at
 * 12:30 should start exactly where the 09:45 run stopped, and per-slot
 * cursors would each independently reach back to the trading-day floor and
 * re-cover the same ground — the precise rework this cursor exists to
 * prevent. The label only steers how the window is described to the reader
 * (email subject, digest header) so consecutive digests are distinguishable
 * in an inbox rather than five identically-titled mails.
 *
 * See the skill's "Slot schedule" section for the slot times and the
 * heatmap evidence behind them.
 */
const SLOT_LABELS = {
  'pre-open': 'Pre-open (overnight + early filings)',
  'mid-session': 'Mid-session',
  'late-session': 'Late session',
  'post-close': 'Post-close',
  night: 'Late evening / night',
  adhoc: 'Ad-hoc run',
};

/**
 * Paginate the resolved scan back to `cutoffUtc` and return everything in window.
 *
 * Extracted from `cmdFetchScan` so a second consumer — `preprocessQueue.js` —
 * can walk the same universe with the same tolerant stop condition WITHOUT
 * re-implementing it and without triggering `cmdFetchScan`'s cursor side effect.
 * That side effect is the reason a simple shell-out would be wrong: `fetch-scan`
 * writes the pending-window marker `commit-window` reads back, and a second
 * caller invoking it would silently repoint post-close's cursor at the wrong
 * window (the skill's own docs warn "don't call fetch-scan twice for the same
 * cycle"). Pagination is a fact about the API; the cursor is post-close's state.
 * Only the first belongs to both callers — conventions §17.
 *
 * Returns `pagesFetched` and `hitPageCap` alongside the results. The cap is a
 * safety stop, but stopping at it means the window was TRUNCATED — and a silently
 * truncated window makes a run's absences meaningless in exactly the way this
 * skill's own rules warn about. Callers must surface `hitPageCap`, not ignore it.
 *
 * @returns {Promise<{all: Array, inWindow: Array, pagesFetched: number, hitPageCap: boolean}>}
 */
async function paginateScanToCutoff({ scan, cutoffUtc, quarterDate }) {
  const all = [];
  const inWindow = [];
  let offset = 0;
  let page = 0;
  let consecutiveZeroPages = 0;
  const MAX_PAGES = 80; // safety cap, not a trust boundary — see stop conditions below
  // Number of consecutive zero-in-window pages required before trusting
  // we've genuinely walked past the cutoff. >1 because a single page has
  // been observed to come back entirely out-of-window even when newer
  // in-window items exist elsewhere in the result set (API ordering is not
  // reliably newest-first) — see 2026-08-31 incident.
  const CONSECUTIVE_ZERO_PAGES_TO_STOP = 2;

  while (page < MAX_PAGES) {
    const payload = { scan, offset, quarterDate };
    // Retry on 429/5xx with backoff. Stockscans rate-limits this endpoint, and
    // an unretried throw here aborts the whole pagination — losing a window
    // rather than pausing for it. That mattered little when one job called this
    // a few times a day; `preprocessQueue.js` now walks the same scan every 30
    // minutes, so a transient 429 must be a pause, not a failed run.
    const { data } = await withRetry(
      () =>
        axios.post(`${BASE_URL}/api/company/announcements/scan`, payload, {
          headers: authHeaders(),
          timeout: 30000,
        }),
      { retries: 3, baseDelayMs: 1500 }
    );
    const items = data.announcements || data.documents || data.items || [];
    if (!items.length) break;
    all.push(...items);

    let pageInWindowCount = 0;
    for (const item of items) {
      const dt = parseAnnDateToUtc(item.createdAt || item.date);
      if (dt && dt.getTime() >= cutoffUtc.getTime()) {
        inWindow.push({ ...item, __parsedUtc: dt.toISOString() });
        pageInWindowCount += 1;
      }
    }
    offset += items.length;
    page += 1;
    if (items.length < PAGE_SIZE) break; // short page = last page
    // Do NOT stop on the first out-of-window item within a page — the API's
    // newest-first ordering has been observed to be unreliable (a page can
    // contain zero in-window items even though later/earlier pages do, see
    // 2026-08-31 incident where offset=0 returned 30 items all older than
    // cutoff despite newer items existing in the true universe). A single
    // zero-in-window page is NOT sufficient evidence we've walked past the
    // cutoff — require CONSECUTIVE_ZERO_PAGES_TO_STOP in a row before
    // trusting it, so one unlucky/misordered page can't silently truncate
    // the whole window to empty.
    if (pageInWindowCount === 0) {
      consecutiveZeroPages += 1;
      if (consecutiveZeroPages >= CONSECUTIVE_ZERO_PAGES_TO_STOP) break;
    } else {
      consecutiveZeroPages = 0;
    }
  }

  return { all, inWindow, pagesFetched: page, hitPageCap: page >= MAX_PAGES };
}

async function cmdFetchScan(argv) {
  loadEnv(argValue('--env-file', argv));
  const windowHoursArg = argValue('--window-hours', argv);
  const slot = argValue('--slot', argv) || 'adhoc';
  const now = new Date();
  const cutoffUtc = await resolveCutoffUtc(now, windowHoursArg);
  const quarterDate = currentQuarterDate(now);
  // Resolve the universe from the user's saved scan (see resolveScan) rather
  // than a literal frozen in this file.
  const resolvedScan = await resolveScan();

  const { all, inWindow } = await paginateScanToCutoff({
    scan: resolvedScan.scan,
    cutoffUtc,
    quarterDate,
  });

  // Record this fetch's windowEnd (= this invocation's "now", not the
  // cutoff) as the pending marker — commit-window reads it back so the
  // cursor advances to exactly what THIS run actually covered, never to
  // "now" recomputed at commit time (which could silently skip anything
  // filed in between fetch and commit).
  await windowCursor.savePendingWindow({
    windowEndMs: now.getTime(),
    extra: { committedForCutoffMs: cutoffUtc.getTime(), slot },
  });

  process.stdout.write(
    JSON.stringify(
      {
        cutoffUtc: cutoffUtc.toISOString(),
        // Human-readable window bounds in IST, so the skill never has to do
        // its own timezone arithmetic to fill --cutoff-human (getting that
        // wrong silently mislabels the email's own claimed window).
        windowStartIstHuman: ist.nowIstHuman(cutoffUtc),
        windowEndIstHuman: ist.nowIstHuman(),
        slot,
        slotLabel: SLOT_LABELS[slot] || slot,
        // Which universe actually got scanned, and whether it came from the
        // live saved scan, a stale cache, or the frozen fallback. The skill
        // MUST surface a non-'live' source in its run report — a silently
        // stale universe is exactly what switching to the API was meant to
        // eliminate, and a cache/fallback run has quietly reintroduced it.
        scanSource: resolvedScan.source,
        scanName: resolvedScan.scanName,
        scanFilterCount: resolvedScan.filterCount,
        scanResolvedAtIso: resolvedScan.resolvedAtIso,
        quarterDate,
        totalFetched: all.length,
        inWindow,
      },
      null,
      2
    )
  );
}

/**
 * Durably advance the resumable window cursor to the exact windowEnd that
 * the most recent `fetch-scan` call used (read from the pending-window
 * marker it wrote — never "now", which would silently skip anything
 * published between that fetch and this commit). Call this only once a run
 * is confirmed healthy — i.e. after Step 4's send-digest succeeds (or,
 * with `email` off, after Step 3's mark-processed/add-note calls all
 * complete without error) — same rule as watchlist-insights' commit-window:
 * committing after a partially-failed run would permanently drop whatever
 * didn't get processed, since the next run's window would no longer reach
 * back far enough to see it.
 */
async function cmdCommitWindow() {
  const cursor = await windowCursor.commitWindow();
  process.stdout.write(
    JSON.stringify({ status: 'ok', lastCommittedAtIso: cursor.lastCommittedAtIso }, null, 2)
  );
}

// Tag-and-keep, never drop: this used to route a title/description keyword
// match straight to `dropped` and out of the pipeline for good — the same
// pre-read exclusion mechanism that made gainers-signal miss PC Jeweller's
// debt-clearance update and Jindal Worldwide's showroom-rollout press release
// on 2026-09-04 (see announcementTaxonomy.js's `filterNoise` doc comment).
// Every item now stays in `kept` with `noiseFlagged`/`noiseKeyword` set, so
// `cmdCategorise` and the actual read/insight step downstream still see it.
// `dropped` is kept as an EMPTY array for backward compatibility with any
// caller destructuring `{kept, dropped}` — nothing is ever pushed there
// anymore, since nothing is dropped pre-read. A reader who wants "how many
// were noise-flagged" should count `kept.filter(i => i.noiseFlagged)` instead.
function cmdFilterNoise(argv) {
  const file = argv[0];
  if (!file) throw new Error('filter-noise requires a fetch-scan output JSON file path');
  const { inWindow } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const kept = inWindow.map((item) => {
    const match = matchedNoiseKeyword(item);
    return { ...item, noiseFlagged: !!match, noiseKeyword: match || null };
  });
  process.stdout.write(JSON.stringify({ kept, dropped: [] }, null, 2));
}

// `ssUrl` IS the announcementId convention used everywhere else in this
// codebase (see watchlistInsights.js announcementId()) — the PDF's storage
// key never changes across re-fetches, so it's a stable dedupe key.
function isAlreadyProcessed(notes, companyId, announcementId) {
  const co = notes.companies && notes.companies[companyId];
  if (!co) return false;
  if ((co.processedAnnouncements || []).includes(announcementId)) return true;
  const byUsecase = co.processedByUsecase || {};
  return Object.entries(byUsecase).some(
    ([usecase, ids]) =>
      usecase.startsWith(ANNOUNCEMENT_INSIGHTS_USECASE_PREFIX) &&
      (ids || []).includes(announcementId)
  );
}

// 2026-08-31 fix: this command previously had NO memory of prior runs at
// all — it just categorised whatever fetch-scan/filter-noise handed it, with
// zero check against the notes DB's processedAnnouncements/processedByUsecase
// state. That meant the ONLY thing preventing a re-processed (duplicate)
// announcement-insights note for the same announcementId was the orchestrating
// agent remembering to check manually before calling add-note — nothing
// enforced it in code. Confirmed in production: NSE:STLTECH/VARROC/RAMRAT
// each ended up with two near-identical announcement-insights:standard notes
// for the exact same announcementId, ~4 hours apart, because a later run
// re-selected and re-processed an announcement that was already fully
// processed and marked. Every categorised item now carries `alreadyProcessed`
// so callers (and any orchestrator) have a deterministic, code-enforced
// signal to skip re-processing rather than relying on memory across runs.
const ANNOUNCEMENT_INSIGHTS_USECASE_PREFIX = 'announcement-insights';

function cmdCategorise(argv) {
  const file = argv[0];
  if (!file)
    throw new Error(
      'categorise requires a filter-noise output JSON file path (or {kept:[...]} shape)'
    );
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = raw.kept || raw;
  const notes = new NotesDb().load();
  const out = items.map((item) => {
    const category = categoriseAnnouncement(item.title, item.description);
    const announcementId = item.ssUrl;
    return {
      companyId: item.companyId,
      name: item.name,
      title: item.title,
      description: item.description,
      category,
      heavyDocument: HEAVY_DOCUMENT_CATEGORIES.has(category),
      highConviction: HIGH_CONVICTION_CATEGORIES.has(category),
      alreadyProcessed: isAlreadyProcessed(notes, item.companyId, announcementId),
      // Carried through from filter-noise — title-only, provisional. See that
      // command's doc comment: flagged items are still processed, never
      // silently excluded pre-read.
      noiseFlagged: !!item.noiseFlagged,
      noiseKeyword: item.noiseKeyword || null,
      ssUrl: item.ssUrl,
      pdfUrl: `${BASE_URL}/document/${item.ssUrl}`,
      createdAt: item.createdAt,
      date: item.date,
    };
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

// ── Card rendering lives in lib/thesisCardEmail.js ─────────────────────────
// The entire card/chip/highlight/footer/grouping layer that used to live here
// moved to `lib/thesisCardEmail.js` on 2026-09-03, unchanged, when Darshan
// asked for gainers-signal and volume-rocketing to use this same Thesis Card
// UX. Three copies of the Gmail-quirk knowledge baked into that markup (cid:
// icons, no flexbox, inline styles only) is exactly the duplication
// `skills/_shared/conventions.md` §17 forbids, so there is now one renderer
// and three callers. This file keeps only what is specific to a post-close
// ANNOUNCEMENT scan: fetching to a cutoff, noise-filtering, categorising,
// routing heavy documents, and the notes-DB merge below.
//
// Nothing about the rendered email changed in that move — the extraction was
// verified byte-identical against a fixture render before and after.
const {
  buildDigestHtml,
  dedupeInsights,
  groupInsightsByCompany,
  EXPAND_ICON_CID,
  EXPAND_ICON_PNG_BASE64,
  signalTierFor,
} = require('./lib/thesisCardEmail');

// Pull every already-persisted announcement-insights note whose creationTime
// falls at/after `cutoffMs`, across ALL companies in the notes DB — not just
// the ones this specific run freshly processed. This is what lets the
// digest include announcements that were already read/insighted by an
// earlier run today (e.g. a manual re-run, or watchlist-insights covering
// the same company) instead of only showing whatever this invocation's own
// insights-array file happened to contain. Only announcement-insights notes
// are eligible (usecase starts with "announcement-insights") — routine/
// noise-filtered items never got a note in the first place (per skill
// design: mark-processed with no add-note), so this can't accidentally
// resurrect noise.
//
// FIXED 2026-09-08: this used to read `n.createdAt`, a field that stopped
// being written to note records once the schema moved to creationTime-only
// (2026-09-07) — every note written since then silently failed the `=== null`
// check below and got dropped, so every digest sent after that migration
// rendered ZERO insights regardless of how many were actually written that
// run (caught in production: a full post-close run produced 42 notes, and
// this function returned none of them). `creationTime` is the note schema's
// one and only write-timestamp field now — see lib/db.js's appendNotes(),
// which deletes any stray `createdAt` at the write chokepoint, and
// notesDb.js's load(), which strips it from legacy records on read.
function collectCachedNotesSinceCutoff(cutoffMs) {
  const notesDb = new NotesDb();
  const notes = notesDb.load();
  const out = [];
  for (const [companyId, co] of Object.entries(notes.companies || {})) {
    for (const n of co.notes || []) {
      const usecase = n.usecase || '';
      if (!usecase.startsWith('announcement-insights')) continue;
      const createdMs = ist.parseCreatedAtMs(n.creationTime || n.date || '');
      if (createdMs === null || createdMs < cutoffMs) continue;
      if (!n.insight) continue; // no insight text = nothing worth rendering
      out.push({
        companyId,
        name: co.name || companyId,
        category: n.category || '',
        significance: n.significance || 'low',
        pdfUrl: n.pdfUrl || null,
        headline: n.headline || '',
        thesisChain: n.thesisChain || [],
        epsImpact: n.epsImpact || null,
        tags: n.tags || [],
        insight: n.insight,
        announcementId: n.announcementId || null,
        creationTime: n.creationTime || null,
      });
    }
  }
  return out;
}

async function cmdSendDigest(argv) {
  loadEnv(argValue('--env-file', argv));
  const file = argv[0];
  if (!file) throw new Error('send-digest requires an insights JSON array file path');
  const freshInsights = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cutoffIstHuman = argValue('--cutoff-human', argv) || '';
  const runIstHuman = ist.nowIstHuman();

  // Merge in cached notes since the resolved cutoff so the email always
  // reflects every candidate announcement since the last trading day's close,
  // even ones a prior run today already processed and cached — not just
  // whatever this invocation's own insights-array file contains. Dedupe via
  // the shared insightDedupeKey/dedupeInsights helpers (lib/thesisCardEmail.js) (announcementId, or
  // companyId+insight text for pre-announcementId notes) so a note that's
  // BOTH freshly passed in AND already in the notes DB doesn't render twice.
  // buildDigestHtml also runs this same dedup internally (belt-and-braces
  // against any future caller that skips it), so this pass mainly exists to
  // keep the reported `insights.length`/subject-line highCount accurate to
  // what's actually deduped, not just what buildDigestHtml renders.
  const now = new Date();
  const cutoffUtc = await resolveCutoffUtc(now, argValue('--window-hours', argv));
  const cachedInsights = collectCachedNotesSinceCutoff(cutoffUtc.getTime());
  const insights = dedupeInsights([...freshInsights, ...cachedInsights]);
  // --stats-file <path>: optional JSON {total, insights, highConviction,
  // heavyDocSkipped, routine, ocrFailed, noiseDropped} — the orchestrating
  // skill assembles this across Steps 1-3 (it's the only place that has
  // visibility into every funnel stage; see STATS_TILES in lib/thesisCardEmail.js). Omit the
  // flag and the digest renders exactly as before (no footer).
  const statsFile = argValue('--stats-file', argv);
  const stats = statsFile ? JSON.parse(fs.readFileSync(statsFile, 'utf8')) : null;
  // --slot <name>: label only (see SLOT_LABELS / cmdFetchScan) — it changes
  // how this window is described in the subject and header so five digests a
  // day are distinguishable in an inbox, and changes nothing about which
  // notes are selected.
  const slot = argValue('--slot', argv) || 'adhoc';
  const slotLabel = SLOT_LABELS[slot] || slot;
  // --knowledge-gaps <file>: optional JSON array of
  // {topic, whyItMattered, resolvedVia} the run had to reason outside the
  // knowledge base for (see the skill's "Knowledge-base gaps" step).
  const gapsFile = argValue('--knowledge-gaps', argv);
  const knowledgeGaps = gapsFile ? JSON.parse(fs.readFileSync(gapsFile, 'utf8')) : null;
  const html = buildDigestHtml(insights, {
    cutoffIstHuman,
    runIstHuman,
    stats,
    slotLabel,
    title: `Announcement Signals — ${slotLabel}`,
    knowledgeGaps,
  });
  // Compute subject-line/reported counts from the SAME grouped-by-company
  // view buildDigestHtml actually renders (not the pre-grouping filing-level
  // `insights`) — otherwise a company with 2 "high" filings that collapse
  // into 1 card would inflate highCount/count past what the email shows.
  const groupedForCount = groupInsightsByCompany(insights);
  // Subject reports the S1+S2 count rather than the raw `high` label count —
  // the tiers are what the email is now organised by, so the subject should
  // agree with the sections rather than quote a dimension the body no longer
  // groups on.
  const topTierCount = groupedForCount.filter((i) => signalTierFor(i).tier <= 2).length;
  const subject =
    `[${slotLabel}] Announcement Signals — ${ist.nowIstDate()}` +
    `${topTierCount ? ` (${topTierCount} S1/S2)` : ''}`;
  // cid-attach the expand icon (see EXPAND_ICON_CID/EXPAND_ICON_PNG_BASE64
  // above) only when at least one card actually references it, so a
  // digest with zero pdfUrls doesn't carry a dangling unused attachment.
  const needsIcon = insights.some((i) => i.pdfUrl);
  const attachments = needsIcon
    ? [
        {
          filename: 'expand-icon.png',
          content: Buffer.from(EXPAND_ICON_PNG_BASE64, 'base64'),
          contentType: 'image/png',
          cid: EXPAND_ICON_CID,
        },
      ]
    : undefined;
  const result = await sendHtmlEmail({
    subject,
    htmlBody: html,
    attachments,
    jobName: stockscans.http.jobName,
  });
  process.stdout.write(
    JSON.stringify(
      {
        status: result.status || 'sent',
        subject,
        slot,
        count: groupedForCount.length,
        filingCount: insights.length,
        tierCounts: groupedForCount.reduce((acc, i) => {
          const t = signalTierFor(i);
          acc[t.code] = (acc[t.code] || 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2
    )
  );
}

/**
 * resend-with-market-data [--date YYYY-MM-DD]
 *
 * Re-sends THIS MORNING's already-persisted post-close-scan-insights notes
 * (does NOT re-fetch announcements or re-run PDF analysis — see the skill's
 * "Data source" decision) with a "Returns 1D / Delivery % / Traded Delivery
 * Value / Vol-vs-7D-Avg" line appended per card, fetched fresh so the numbers
 * reflect a full trading day's settled data (this command is meant to run
 * late evening, well after the 2 AM morning run). The volume ratio is
 * (Total Volume on dateArg) : (avg daily Volume of the 7 trading days
 * strictly before dateArg).
 *
 * --date defaults to today (IST) — the same date filter used to find this
 * morning's notes via db.find('notes', {date, type:'announcement'}).
 */
async function cmdResendWithMarketData(argv) {
  loadEnv(argValue('--env-file', argv));
  // --date must be ISO "YYYY-MM-DD" to match how notes.date is stored
  // (see cmdAddNote in watchlistInsights.js: `date: ist.nowIstIso().slice(0,10)`
  // equivalent) — NOT ist.nowIstDate()'s human "27 Aug 2026" format, which
  // would silently match zero notes via db.find()'s exact string filter.
  const dateArg = argValue('--date', argv) || ist.istDate().toISOString().slice(0, 10);

  // Step 1 — load this morning's already-persisted notes for that date.
  // Reuses the sanctioned db.find() query path (docs/DATA_RULES.md) rather
  // than reading data/notes.json directly.
  const notes = db.find('notes', { date: dateArg, type: 'announcement' });
  if (!notes.length) {
    process.stdout.write(
      JSON.stringify({ status: 'skipped', reason: `no notes found for date ${dateArg}` }, null, 2)
    );
    return;
  }

  // Step 2 — fetch Returns 1D + Close price for exactly these companies via
  // a throwaway watchlist scan (same proven pattern gainersScanner.js and
  // guidance-document-extractor use for an arbitrary companyId list beyond
  // companyFilters' 10-id cap — see docs/stockscans-api-schemas.md).
  const tickers = [...new Set(notes.map((n) => sanitizeCompanyId(n.companyId)).filter(Boolean))];
  const marketByTicker = {};
  let watchlistId = null;
  try {
    const wl = await stockscans.createWatchlist(
      `post-close-market-data-${dateArg}-${Date.now()}`,
      tickers
    );
    watchlistId = wl.watchlistId;
    const payload = {
      ratiosType: 'Default',
      timePeriod: 'Latest',
      scan: {
        filters: [],
        index: [],
        industry: [],
        sector: [],
        tags: [],
        scanName: 'Post-Close Market Data',
        scanDescription: '',
        watchlistIds: [watchlistId],
      },
      watchlistIds: [watchlistId],
      order: 'desc',
      orderBy: 'Returns 1D',
      offset: 0,
    };
    const data = await stockscans.runScan(payload);
    let companies;
    if (data.table) {
      const table = data.table;
      const headers = table[0] || [];
      companies = table
        .slice(1)
        .map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
    } else {
      companies = data.companies || data.data || (Array.isArray(data) ? data : []);
    }
    for (const raw of companies) {
      const ticker = sanitizeCompanyId(
        String(pick(raw, 'companyId', 'ticker', 'nse_code', 'symbol', 'Ticker', 'NSE Code') || '')
      );
      if (!ticker) continue;
      marketByTicker[ticker] = {
        returns1d: toFloat(pick(raw, 'Returns 1D', 'return_1d', 'returnOneDay', '1DReturn')),
        close_price: toFloat(pick(raw, 'Close', 'close', 'lastPrice', 'price')),
        // Market cap comes along for free in the same scan response (same
        // `pick` aliases gainersScanner.js normaliseGainer uses) and is what
        // makes delivery VALUE interpretable — see the delivery/mcap note in
        // Step 4 below.
        market_cap_cr: toFloat(
          pick(raw, 'Market Capitalization', 'market_cap', 'marketCap', 'mcap')
        ),
      };
    }
  } finally {
    // Always clean up the throwaway watchlist, success or failure — this is
    // a real resource in the user's Stockscans account, not scoped/ephemeral.
    if (watchlistId) {
      try {
        await stockscans.deleteWatchlist(watchlistId);
      } catch (e) {
        process.stderr.write(`[WARN] failed to delete throwaway watchlist: ${e.message}\n`);
      }
    }
  }

  // Step 3 — Delivery % / Delivery Value via NSE/BSE, reusing
  // gainersScanner.js's fetchDeliveryPerSymbol (needs {ticker, close_price}
  // shaped inputs, same shape normaliseGainer() there produces).
  const gainerShaped = tickers.map((ticker) => ({
    ticker,
    close_price: (marketByTicker[ticker] && marketByTicker[ticker].close_price) || 0,
  }));
  const deliveryByTicker = await fetchDeliveryPerSymbol(gainerShaped);

  // Step 3b — Volume Ratio: (Total Volume on dateArg) : (avg daily Volume of
  // the 7 trading days strictly BEFORE dateArg). Reuses gainersScanner.js's
  // fetchPrices/aggregateToDaily (same daily-candle source its own 20-day
  // vol_spike_ratio is built from — see priceActionSignals there) rather than
  // re-implementing an OHLCV fetch — per skills/_shared/conventions.md §17.
  // fetchPrices has no `before` param (it always returns the latest
  // PRICE_HISTORY_CANDLES trading days), so this only resolves correctly when
  // dateArg is on or near the latest available session — true for this
  // command's normal same-evening use, but a `--date` far in the past may
  // legitimately fall outside the window and correctly resolve to null below.
  const volRatioByTicker = {};
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const candles = await fetchPrices(ticker);
        if (!candles.length || candles[0]._error) return;
        const idx = candles.findIndex((c) => c.date === dateArg);
        if (idx === -1 || idx < 1) return; // dateArg not in window, or no prior days to average
        const todayV = toFloat(candles[idx].volume);
        const priorWindow = candles.slice(Math.max(0, idx - 7), idx).map((c) => toFloat(c.volume));
        const validPrior = priorWindow.filter((v) => v != null);
        if (!validPrior.length || todayV == null) return;
        const avgPriorV = validPrior.reduce((s, v) => s + v, 0) / validPrior.length;
        if (!avgPriorV) return;
        volRatioByTicker[ticker] = Math.round((todayV / avgPriorV) * 100) / 100;
      } catch (e) {
        process.stderr.write(`[WARN] volume ratio fetch failed for ${ticker}: ${e.message}\n`);
      }
    })
  );

  // Step 4 — attach marketData onto each note and re-render the digest.
  const insights = notes.map((n) => {
    const cid = sanitizeCompanyId(n.companyId);
    const m = marketByTicker[cid] || {};
    const d = deliveryByTicker[cid] || {};
    return {
      companyId: n.companyId,
      name: n.name || n.companyId,
      category: n.category,
      significance: n.significance,
      headline: n.headline,
      insight: n.insight,
      thesisChain: n.thesisChain,
      epsImpact: n.epsImpact,
      tags: n.tags,
      pdfUrl: n.pdfUrl,
      // Carry announcementId through so dedupeInsights (invoked inside
      // buildDigestHtml) can use its strong per-filing key instead of
      // falling back to companyId+insight text — this field was previously
      // dropped here, which is part of why a genuinely duplicate note (two
      // DB entries, same announcementId, from the pre-2026-08-31 gap) could
      // still slip past a weaker text-based dedupe if either copy's insight
      // text had drifted even slightly between the two runs that created them.
      announcementId: n.announcementId || null,
      // Delivery %, delivery value and volume ratio were already here. Market
      // cap and delivery-value-as-%-of-mcap are added (2026-09-04) for the
      // same reason gainers-signal added them to its own metric line: an
      // absolute delivery figure is not comparable across the market cap
      // range this scan spans (₹300cr to ₹70,000cr). ₹40cr of delivery is
      // conviction in a ₹500cr company and rounding error in a ₹40,000cr one,
      // so the percentage-of-mcap column is the one that actually says whether
      // real money moved on the announcement. Both axes are shown together,
      // never one alone — delivery % alone misleads at both ends of the range
      // (see the gainers-signal SKILL.md discussion of exactly this).
      marketData: {
        returns1d: m.returns1d != null ? m.returns1d : null,
        deliveryPct: d.available ? d.deliv_per : null,
        deliveryValueCr: d.available ? d.deliv_value_cr : null,
        volRatio7d: volRatioByTicker[cid] != null ? volRatioByTicker[cid] : null,
        marketCapCr: m.market_cap_cr != null ? m.market_cap_cr : null,
        // Computed here rather than in the renderer so the value is on the
        // note payload and can be sorted/audited, and so a missing input
        // yields null (not 0) — a company we could not measure must never
        // sort as though we measured it and found nothing.
        deliveryValuePctOfMcap:
          d.available && d.deliv_value_cr != null && m.market_cap_cr > 0
            ? Math.round((d.deliv_value_cr / m.market_cap_cr) * 10000) / 100
            : null,
      },
    };
  });

  const cutoffIstHuman = `Full day ${dateArg}, all slots, with settled end-of-day market data`;
  const runIstHuman = ist.nowIstHuman();
  // The resend is deliberately the ONE email that spans the whole day rather
  // than a single slot's window: the intraday slot digests each cover their
  // own non-overlapping window (that's what keeps them free of repetition),
  // so nothing else in the day gives a consolidated view. Here that view is
  // worth the repetition, because it is re-ranked by what the market actually
  // did — the same set of announcements ordered by a genuinely new dimension,
  // not the same list sent twice.
  const html = buildDigestHtml(insights, {
    cutoffIstHuman,
    runIstHuman,
    stats: null,
    slotLabel: 'Day recap · market-validated',
    title: 'Announcement Signals — Day Recap',
  });
  // Same grouped-count fix as cmdSendDigest: report card-level counts (what
  // the email actually shows), not raw per-filing note counts. Also route
  // through dedupeInsights explicitly here (not just inside buildDigestHtml)
  // so a resend of a date whose notes DB contains legacy duplicates (from
  // before the 2026-08-31 alreadyProcessed fix existed) reports the true,
  // deduped ticker/company count rather than the raw db.find() row count.
  const dedupedForCount = dedupeInsights(insights);
  const groupedForCount = groupInsightsByCompany(dedupedForCount);
  const topTierCount = groupedForCount.filter((i) => signalTierFor(i).tier <= 2).length;
  const subject =
    `[Day recap] Announcement Signals — ${dateArg} (market-validated)` +
    `${topTierCount ? ` (${topTierCount} S1/S2)` : ''}`;
  const needsIcon = insights.some((i) => i.pdfUrl);
  const attachments = needsIcon
    ? [
        {
          filename: 'expand-icon.png',
          content: Buffer.from(EXPAND_ICON_PNG_BASE64, 'base64'),
          contentType: 'image/png',
          cid: EXPAND_ICON_CID,
        },
      ]
    : undefined;
  const result = await sendHtmlEmail({
    subject,
    htmlBody: html,
    attachments,
    jobName: stockscans.http.jobName,
  });
  process.stdout.write(
    JSON.stringify(
      {
        status: result.status || 'sent',
        subject,
        count: groupedForCount.length,
        filingCount: dedupedForCount.length,
        rawNoteCount: insights.length,
        duplicatesCollapsed: insights.length - dedupedForCount.length,
        tickersWithDelivery: Object.values(deliveryByTicker).filter((d) => d.available).length,
        tickersWithReturns: Object.values(marketByTicker).filter((m) => m.returns1d != null).length,
        tickersWithVolRatio: Object.values(volRatioByTicker).filter((v) => v != null).length,
        tickersWithMcap: Object.values(marketByTicker).filter((m) => m.market_cap_cr != null)
          .length,
      },
      null,
      2
    )
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = {
    'resolve-scan': cmdResolveScan,
    'fetch-scan': cmdFetchScan,
    'filter-noise': cmdFilterNoise,
    categorise: cmdCategorise,
    'send-digest': cmdSendDigest,
    'commit-window': cmdCommitWindow,
    'resend-with-market-data': cmdResendWithMarketData,
  };
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(
      `Usage: postCloseScanInsights.js <${Object.keys(commands).join('|')}> [args]\n`
    );
    process.exit(1);
  }
  await fn(rest);
}

// Exported for tests only (the CLI dispatch above is the real entrypoint).
// parseAnnDateToUtc's IST-vs-UTC behaviour is the single most consequential
// assumption in this file — see its own comment block — so it is testable
// rather than only observable through a live API call.
module.exports = {
  parseAnnDateToUtc,
  normaliseSavedScan,
  resolveScan,
  paginateScanToCutoff,
  SCAN_SOURCE_NAME,
  FALLBACK_SCAN,
  collectCachedNotesSinceCutoff,
};

// Guarded so requiring this module (for its exports, or from a test) does not
// run the CLI and exit — same pattern gainersScanner.js uses, noted at the top
// of this file.
if (require.main === module) {
  const jobName = resolveJobName('post-close-scan-insights');
  stockscans.setJobName(jobName);
  main()
    .catch((err) => {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
