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
const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const ist = require('./lib/ist');
const tradingCalendar = require('./lib/tradingCalendar');
const db = require('./lib/db');
const { stockscans } = require('@stock/api');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
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
const EXPAND_ICON_CID = 'expand-icon';
const EXPAND_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABwAAAAbCAYAAABvCO8sAAAACXBIWXMAAC4jAAAuIwF4pT92AAAB9UlEQVRIie2WQUsVURTHp1RaZBIYrQIXbmtRUi4fGHPO+HiY8865hCQIkueML9wVEVjzQURcuAsVgiKqTYt0UUHtokXfoFSKQlyo3Kczb3oqM+/N1CI68F8M9575cf/33HOv4+SMcrXWhyxvgPQzkrw/UqyrwPoKSO/GiejLFTAyDST304QkwcjI5BmbBxRMIutuJpFuO6VS2Amsi5mTYsm8BZZMrRtI17LmOcgy2zpMd4EljNxxx8dPA+nrTMC69/vL3QQKKmCmB9Lk+sFFx3FOJPcyK9RB1p2Djxd5C8i7NdODrO/SgNGGPs8NpOAysnz9K8C63STrjf/Jjz8GrK+M9FuioJ65fnAeWN8WDrTn9zcY6VPPmzllx0o3Js4272kuoOdPXUXWjQZMVgZEupJzro/e6UXSD/HBbxcIRq+lwaKojMk5IJ1DI/faAh6ykXW5GWaM6QCjj5D1QRiGJxvJLQJtNSZhyLJ01Mq8qpajOa4JhtoCHir9Y2A2kHQsdqAaUMtAz799wba/hI2PbeM/bj7mBbokg1lhhQCjn3istTRYYcBWAv8D8Z+1FFi/Hwx8irp8MUB5GAONusmBl4kG/Mt2kiKEjbtxy94YMXDYyCVg/dnOyy2T7A3RHN5N6QeSBWT5iCxf8sq+BIHkCVRltJm1B8bvvqa7dbSrAAAAAElFTkSuQmCC';

// Deterministic default scan — the same ad-hoc universe used for the first
// manual run of this workflow (2026-08-19): mid/small-cap, price above its
// 200DMA, meaningful retail holding, liquid. Override by passing a full scan
// object via --scan-file if a different universe is ever wanted; the skill
// itself does not expose per-run scan editing since the nightly task always
// uses this fixed universe.
const DEFAULT_SCAN = {
  scanId: 'd5e2faa4cbed469c8624ce29',
  scanName: 'Test',
  filters: [
    { left: 'Market Capitalization', sign: '>=', right: '300' },
    { left: 'Market Capitalization', sign: '<', right: '50000' },
    { left: 'Close Price', sign: '>=', right: 'EMA 200D' },
    { left: 'Retail Holdings * Market Capitalization', sign: '>=', right: '5000' },
    { left: 'Volume SMA 20D * SMA 20D', sign: '>=', right: '50000000' },
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

function parseAnnDateToUtc(str) {
  if (!str) return null;
  if (/[+-]\d{2}:\d{2}$/.test(str) || /Z$/.test(str)) return new Date(str);
  const m = String(str).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, dd, h, mi, s] = m.map(Number);
    return new Date(Date.UTC(y, mo - 1, dd, h, mi, s) - (5 * 60 + 30) * 60 * 1000);
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

async function cmdFetchScan(argv) {
  loadEnv(argValue('--env-file', argv));
  const windowHoursArg = argValue('--window-hours', argv);
  const now = new Date();
  const cutoffUtc = await resolveCutoffUtc(now, windowHoursArg);
  const quarterDate = currentQuarterDate(now);

  const all = [];
  const inWindow = [];
  let offset = 0;
  let page = 0;
  const MAX_PAGES = 80; // safety cap, not a trust boundary — see stop conditions below

  while (page < MAX_PAGES) {
    const payload = { scan: DEFAULT_SCAN, offset, quarterDate };
    const { data } = await axios.post(`${BASE_URL}/api/company/announcements/scan`, payload, {
      headers: authHeaders(),
      timeout: 30000,
    });
    const items = data.announcements || data.documents || data.items || [];
    if (!items.length) break;
    all.push(...items);

    let crossedCutoff = false;
    for (const item of items) {
      const dt = parseAnnDateToUtc(item.createdAt || item.date);
      if (dt && dt.getTime() >= cutoffUtc.getTime()) {
        inWindow.push({ ...item, __parsedUtc: dt.toISOString() });
      } else {
        crossedCutoff = true;
      }
    }
    offset += items.length;
    page += 1;
    if (items.length < PAGE_SIZE) break; // short page = last page
    if (crossedCutoff) break; // results are newest-first — safe to stop once we've seen an out-of-window item
  }

  // Record this fetch's windowEnd (= this invocation's "now", not the
  // cutoff) as the pending marker — commit-window reads it back so the
  // cursor advances to exactly what THIS run actually covered, never to
  // "now" recomputed at commit time (which could silently skip anything
  // filed in between fetch and commit).
  await windowCursor.savePendingWindow({
    windowEndMs: now.getTime(),
    extra: { committedForCutoffMs: cutoffUtc.getTime() },
  });

  process.stdout.write(
    JSON.stringify(
      { cutoffUtc: cutoffUtc.toISOString(), quarterDate, totalFetched: all.length, inWindow },
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

function cmdFilterNoise(argv) {
  const file = argv[0];
  if (!file) throw new Error('filter-noise requires a fetch-scan output JSON file path');
  const { inWindow } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const kept = [];
  const dropped = [];
  for (const item of inWindow) {
    const match = matchedNoiseKeyword(item);
    if (match) dropped.push({ ...item, __droppedReason: match });
    else kept.push(item);
  }
  process.stdout.write(JSON.stringify({ kept, dropped }, null, 2));
}

function cmdCategorise(argv) {
  const file = argv[0];
  if (!file)
    throw new Error(
      'categorise requires a filter-noise output JSON file path (or {kept:[...]} shape)'
    );
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = raw.kept || raw;
  const out = items.map((item) => {
    const category = categoriseAnnouncement(item.title, item.description);
    return {
      companyId: item.companyId,
      name: item.name,
      title: item.title,
      description: item.description,
      category,
      heavyDocument: HEAVY_DOCUMENT_CATEGORIES.has(category),
      highConviction: HIGH_CONVICTION_CATEGORIES.has(category),
      ssUrl: item.ssUrl,
      pdfUrl: `${BASE_URL}/document/${item.ssUrl}`,
      createdAt: item.createdAt,
      date: item.date,
    };
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

const SIG_META = {
  high: { label: 'High significance', color: '#b42318', bg: '#fef3f2', border: '#fda29b' },
  medium: { label: 'Medium significance', color: '#b54708', bg: '#fffaeb', border: '#fec84b' },
  low: { label: 'Low significance', color: '#344054', bg: '#f9fafb', border: '#d0d5dd' },
};

// Tone system mirrors skills/_shared/pdf-design-guide.md's g/r/y/b palette
// (translated to inline styles since email clients strip <style> blocks —
// no CSS classes, every color must be inline per company convention). Card
// left-border + category chip use SIG_TONE (by significance, the dimension
// that actually matters for "should I read this"); category-chip label text
// still names the category so two same-tone categories stay distinguishable.
const SIG_TONE = {
  high: { chipBg: '#fcebeb', chipFg: '#791f1f', border: '#e24b4a' },
  medium: { chipBg: '#faeeda', chipFg: '#633806', border: '#ef9f27' },
  low: { chipBg: '#e6f1fb', chipFg: '#0c447c', border: '#3a85c9' },
};

const TAG_CHIP = { bg: '#f2f4f7', fg: '#475467', border: '#d0d5dd' };

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Category/tag values are stored snake_case ("shareholding_change") since
// that's the taxonomy's canonical machine-readable form (announcementTaxonomy.js),
// but the digest is a human-facing email — render them as "Shareholding
// Change" (every word capitalised, underscores to spaces) rather than raw
// snake_case or the old all-caps/monospace look.
function toTitleCase(s) {
  return String(s == null ? '' : s)
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function tagPillsHtml(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return tags
    .map(
      (t) =>
        `<span style="display:inline-block;font-size:10px;font-family:monospace;background:${TAG_CHIP.bg};color:${TAG_CHIP.fg};border:1px solid ${TAG_CHIP.border};border-radius:3px;padding:1.5px 6px;margin:0 4px 4px 0;">${esc(toTitleCase(t))}</span>`
    )
    .join('');
}

// Color-codes the numeric/date substance inside a thesis-chain step so the
// reader can spot the load-bearing fact without parsing the sentence — NOT
// the card border/chip (that already carries the significance tone). Escapes
// first, then wraps matches in the escaped string so `&amp;`-style entities
// never get re-matched or mangled. Three highlight classes, kept semantically
// distinct per pdf-design-guide.md's "color the direction that matters, not
// literal up/down": money/percentage amounts (amber — the quantum), dates/
// timelines (blue — the when), explicit EPS/PAT/margin deltas (green if the
// step's own wording reads positive, red if negative — a plain regex can't
// know direction reliably, so this only fires on an explicit +/- sign or an
// unambiguous up/down verb immediately adjacent to the number).
function highlightFacts(escapedText) {
  let out = escapedText;
  // Money amounts: ₹/Rs/Rs. followed by a number+cr/lakh/crore, or a bare
  // "12.5cr"/"₹500cr" style token.
  out = out.replace(
    /((?:₹|Rs\.?\s?)\s?[\d,]+(?:\.\d+)?\s?(?:cr|crore|lakh|lac|L|Cr)\b)/g,
    '<span style="color:#854f0b;font-weight:600;">$1</span>'
  );
  // Percentages.
  out = out.replace(
    /(\(?[+-]?[\d.]+%\)?)/g,
    '<span style="color:#854f0b;font-weight:600;">$1</span>'
  );
  // Explicit signed deltas not already caught above (e.g. "+2%" handled;
  // "up 2%"/"down 2%" phrasing gets its own directional color).
  out = out.replace(
    /\b(up|higher|increase[sd]?|grow[sn]?|beat)\b([^<.,;]{0,28}?\d[^<.,;]{0,10})/gi,
    '<span style="color:#0f6e56;font-weight:600;">$1$2</span>'
  );
  out = out.replace(
    /\b(down|lower|decrease[sd]?|declin\w*|dilut\w*|miss(?:e[sd])?)\b([^<.,;]{0,28}?\d[^<.,;]{0,10})/gi,
    '<span style="color:#a32d2d;font-weight:600;">$1$2</span>'
  );
  // Dates / quarter-year timelines: FY27, Q2FY27, "Aug 2026", "from FY28".
  out = out.replace(
    /\b((?:Q[1-4]\s?)?FY\s?\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2,4})\b/g,
    '<span style="color:#0c447c;font-weight:600;">$1</span>'
  );
  return out;
}

const EPS_TONE = {
  positive: { bg: '#eaf3de', fg: '#27500a', border: '#a9cf8a', icon: '▲' },
  negative: { bg: '#fcebeb', fg: '#791f1f', border: '#ecaaa9', icon: '▼' },
  neutral: { bg: '#e6f1fb', fg: '#0c447c', border: '#a7cdec', icon: '●' },
};

// Tone for the NEW/KNOWN/FOLLOW_UP claim chips rendered by
// infoClassificationHtml() below — NEW is the attention-getting color
// (this is the bucket that actually moves the market on surprise, per
// announcement-info-classifier's own framing), KNOWN is deliberately muted
// (already-priced-in, low reader attention needed), FOLLOW_UP sits between.
const INFO_CLASS_TONE = {
  NEW: { bg: '#fef3f2', fg: '#b42318', border: '#fda29b' },
  FOLLOW_UP: { bg: '#fffaeb', fg: '#b54708', border: '#fec84b' },
  KNOWN: { bg: '#f9fafb', fg: '#667085', border: '#d0d5dd' },
};

// Renders the "Returns 1D / Delivery % / Traded Delivery Value / Vol-vs-7D-Avg"
// market-data line used by resend-with-market-data (see cmdResendWithMarketData
// below) — same visual family as epsImpactHtml's chip, colored green/red by
// return sign like gainers-signal does. `it.marketData` is
// `{returns1d, deliveryPct, deliveryValueCr, volRatio7d}` (any field may be
// null when NSE/BSE/Stockscans had no data for that ticker — rendered as "—",
// never fabricated).
// Uses vertical-align:middle + explicit &nbsp;-separated spacing rather than
// flexbox gap, per this file's Gmail-sanitizer findings above (gap/align-items
// get silently stripped from inline styles in received mail).
function marketDataHtml(marketData) {
  if (!marketData) return '';
  const { returns1d, deliveryPct, deliveryValueCr, volRatio7d } = marketData;
  if (returns1d == null && deliveryPct == null && deliveryValueCr == null && volRatio7d == null)
    return '';
  const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
  const fmtCr = (v) => (v == null ? '—' : `₹${v.toFixed(1)} Cr`);
  const retColor = returns1d == null ? '#475467' : returns1d >= 0 ? '#067647' : '#b42318';
  // Same >=2.0x threshold gainersScanner.js's vol_spike boolean uses, just
  // against a 7-day (pre-announcement-day) window instead of its 20-day one —
  // colored so a volume spike alongside the announcement is visually obvious.
  const volColor = volRatio7d == null ? '#475467' : volRatio7d >= 2.0 ? '#b42318' : '#475467';
  return (
    `<div style="margin-top:8px;font-size:11.5px;font-family:monospace;color:#475467;">` +
    `<span style="display:inline-block;vertical-align:middle;">Returns 1D: <b style="color:${retColor};">${fmtPct(returns1d)}</b></span>` +
    `<span style="display:inline-block;vertical-align:middle;margin-left:12px;">Delivery: <b>${deliveryPct == null ? '—' : deliveryPct.toFixed(1) + '%'}</b></span>` +
    `<span style="display:inline-block;vertical-align:middle;margin-left:12px;">Delivery Value: <b>${fmtCr(deliveryValueCr)}</b></span>` +
    `<span style="display:inline-block;vertical-align:middle;margin-left:12px;">Vol/7D-Avg: <b style="color:${volColor};">${volRatio7d == null ? '—' : volRatio7d.toFixed(2) + 'x'}</b></span>` +
    `</div>`
  );
}

function epsImpactHtml(epsImpact) {
  if (!epsImpact || !epsImpact.direction) return '';
  const tone = EPS_TONE[epsImpact.direction] || EPS_TONE.neutral;
  const parts = [esc(epsImpact.magnitude || '')];
  if (epsImpact.timeline) parts.push(esc(epsImpact.timeline));
  const detail = parts.filter(Boolean).join(' &middot; ');
  const confidence = epsImpact.confidence
    ? ` <span style="opacity:0.7;">(${esc(epsImpact.confidence)} confidence)</span>`
    : '';
  return `<div style="display:inline-block;font-size:11.5px;font-weight:600;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};border-radius:4px;padding:3px 9px;margin-top:8px;">${tone.icon} EPS impact: ${detail}${confidence}</div>`;
}

// Renders the causal chain "this happened -> so this -> so this -> EPS
// impact" the user asked for. Falls back to a single-step chain built from
// the plain `insight` string when a note predates the thesisChain field
// (older cached notes) so old and new notes render consistently rather than
// the digest silently losing the body for anything generated before this
// schema existed.
function thesisChainHtml(it) {
  const steps = Array.isArray(it.thesisChain) && it.thesisChain.length
    ? it.thesisChain
    : String(it.insight || '')
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean);
  if (!steps.length) return '';
  return steps
    .map((step, i) => {
      // The arrow (added below for i>0) already implies causation/sequence —
      // strip a redundant leading "so"/"so that"/"and so" from non-first
      // steps rather than showing "-> so X" (defensive: covers both new
      // notes, which the _global.md prompt now tells not to prefix this way,
      // and older cached notes generated before that instruction existed).
      const cleanedStep =
        i === 0 ? step : String(step).replace(/^\s*(?:and\s+)?so(?:\s+that)?\s+/i, '');
      const escaped = highlightFacts(esc(cleanedStep));
      const arrow =
        i === 0
          ? ''
          : '<span style="color:#98a2b3;margin-right:6px;">&rarr;</span>';
      return `<div style="font-size:13px;line-height:1.6;color:#344054;margin-top:${i === 0 ? '8' : '4'}px;">${arrow}${escaped}</div>`;
    })
    .join('');
}


// Renders the NEW/KNOWN/FOLLOW_UP breakdown attached by Step 3.5 (top-5
// info-classified items only — see the SKILL.md) as `it.infoClassification`
// = `{claims: [{claim, bucket, priorSource}], verdict, baselineCoverage}`.
// Absent on every other card (the classifier only runs on 5 items a night),
// so this returns '' and the card renders exactly as it did before this
// field existed — same "old notes render fine" guarantee thesisChainHtml
// above already gives for its own optional field.
// Deliberately compact: a one-line verdict banner plus a claims list capped
// at 4 rows (a card is already dense with headline/chain/EPS/tags; the full
// per-claim citation detail lives in the persisted note, not the email) —
// if there are more than 4 claims, the last row says how many were omitted
// rather than silently truncating without saying so.
const INFO_CLASS_MAX_CLAIMS_SHOWN = 4;

function infoClassificationHtml(infoClassification) {
  if (!infoClassification || !Array.isArray(infoClassification.claims)) return '';
  const { claims, verdict, baselineCoverage } = infoClassification;
  if (!claims.length && !verdict) return '';

  const bucketChip = (bucket) => {
    const key = String(bucket || '').toUpperCase().replace(/[\s-]+/g, '_');
    const tone = INFO_CLASS_TONE[key] || INFO_CLASS_TONE.KNOWN;
    const label = key === 'FOLLOW_UP' ? 'FOLLOW-UP' : key;
    return `<span style="display:inline-block;vertical-align:middle;font-size:9.5px;font-weight:700;font-family:monospace;letter-spacing:0.03em;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};border-radius:3px;padding:1px 6px;margin-right:6px;white-space:nowrap;">${esc(label)}</span>`;
  };

  const shown = claims.slice(0, INFO_CLASS_MAX_CLAIMS_SHOWN);
  const omitted = claims.length - shown.length;
  const claimRows = shown
    .map((c) => {
      const src = c.priorSource
        ? ` <span style="color:#98a2b3;">(${esc(c.priorSource)})</span>`
        : '';
      return `<div style="font-size:11.5px;line-height:1.6;color:#475467;margin-top:3px;">${bucketChip(c.bucket)}${esc(c.claim || '')}${src}</div>`;
    })
    .join('');
  const omittedRow =
    omitted > 0
      ? `<div style="font-size:11px;color:#98a2b3;margin-top:3px;">+ ${omitted} more claim(s) — see saved note</div>`
      : '';

  const thin = baselineCoverage && baselineCoverage.thinBaseline;
  const thinBadge = thin
    ? ` <span style="font-size:10px;font-weight:700;color:#b54708;">(THIN BASELINE)</span>`
    : '';

  return `
    <div style="margin-top:10px;padding-top:9px;border-top:1px dashed #eaecf0;">
      <div style="font-size:11px;font-weight:700;color:#667085;text-transform:uppercase;letter-spacing:0.02em;">Info classification${thinBadge}</div>
      ${verdict ? `<div style="font-size:12.5px;font-weight:600;color:#101828;margin-top:4px;">${esc(verdict)}</div>` : ''}
      ${claimRows}
      ${omittedRow}
    </div>`;
}

// Pictorial run-summary footer: one tile per funnel stage so the whole
// night's routing outcome is graspable at a glance without reading every
// insight card. `stats` is caller-supplied (the orchestrating skill run,
// not this script, is the only place that knows the full funnel — see
// STATS_TILES below for the expected shape) since fetch-scan/filter-noise/
// categorise/send-digest are separate process invocations with no shared
// in-memory state. Added 2026-08-24 per Darshan's request: "mention the
// count for each category at the footer... total 26, insights 11, ocr
// failed 3, routine 5 etc, pictorial UI, single glance."
const STATS_TILES = [
  { key: 'total', icon: '📋', label: 'Total in window', color: '#344054' },
  { key: 'insights', icon: '✍️', label: 'Insights written', color: '#1b5e20' },
  { key: 'highConviction', icon: '🔥', label: 'High-conviction', color: '#b42318' },
  { key: 'heavyDocSkipped', icon: '📄', label: 'Heavy-doc skipped', color: '#667085' },
  { key: 'routine', icon: '💤', label: 'Routine (no note)', color: '#98a2b3' },
  { key: 'ocrFailed', icon: '⚠️', label: 'OCR failed / unread', color: '#b54708' },
  { key: 'noiseDropped', icon: '🧹', label: 'Noise-filtered out', color: '#98a2b3' },
];

function buildStatsFooterHtml(stats) {
  if (!stats || typeof stats !== 'object') return '';
  const tiles = STATS_TILES.filter(
    (t) => stats[t.key] !== undefined && stats[t.key] !== null
  );
  if (!tiles.length) return '';
  const cells = tiles
    .map(
      (t) => `
      <td style="padding:0 6px;text-align:center;vertical-align:top;">
        <div style="background:#fff;border:1px solid #eaecf0;border-radius:10px;padding:12px 10px;min-width:84px;">
          <div style="font-size:22px;line-height:1;">${t.icon}</div>
          <div style="font-size:20px;font-weight:700;color:${t.color};margin-top:6px;">${esc(stats[t.key])}</div>
          <div style="font-size:10px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:0.02em;margin-top:2px;">${esc(t.label)}</div>
        </div>
      </td>`
    )
    .join('');
  // OCR-failed tile gets a visible warning strip when non-zero, since that
  // count means "these announcements were never actually read" — the exact
  // failure mode this footer exists to make impossible to miss (2026-08-24).
  const ocrWarning =
    stats.ocrFailed > 0
      ? `<p style="font-size:12px;color:#b54708;background:#fffaeb;border:1px solid #fec84b;border-radius:8px;padding:8px 12px;margin:12px 0 0;">⚠️ ${esc(stats.ocrFailed)} announcement(s) could not be read (scanned PDF, OCR unavailable) and are NOT reflected as routine — flagged for manual follow-up.</p>`
      : '';
  return `
    <div style="margin-top:32px;border-top:1px solid #eaecf0;padding-top:16px;">
      <div style="font-size:12px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:10px;">Run summary</div>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:6px 0;"><tr>${cells}</tr></table>
      ${ocrWarning}
    </div>`;
}

// Within-bucket ranking score (Step "sort within significance" — added
// 2026-08-30 per Darshan's request that cards not just group by
// significance but also rank within a bucket, since "high" alone still
// spans a wide range of how much attention an item deserves). Purely
// additive and deterministic from fields already on the note payload — no
// LLM call, no extra fetch; this is exactly the kind of pure-logic scoring
// that belongs in the script per skills/_shared/conventions.md §17, not a
// second judgment pass by the model.
//
// Four components, each contributing an independent, capped amount so no
// single signal can dominate silently and the total is easy to reason
// about at a glance (0-100 nominal ceiling on the initial send; the resend
// pass adds a fifth, market-reaction component on top — see
// MARKET_REACTION_WEIGHT below):
//
//   1. Category (0-30): `high_conviction` is the taxonomy's OWN judgment
//      that this category structurally deserves deep attention
//      (demerger/merger/acquisition/management_change) — worth a flat,
//      large weight since it's a considered classification, not a proxy.
//   2. EPS-impact confidence (0-25): how directly the filing supports a
//      quantified number, per announcement-insights' own confidence
//      rubric (a disclosed rupee figure with a stated date is `high`; a
//      qualitative read with no hard number is `low`). A concretely
//      quantified item is more actionable than a vaguely-worded one at
//      the same significance level.
//   3. EPS-impact direction (0-10): a non-neutral directional call
//      (positive or negative) still beats "no EPS linkage at all" even
//      when magnitude/confidence is soft, since direction alone is a
//      usable signal.
//   4. Info-classification NEW-ness (0-35, only present on the ~5 items
//      Step 3.5 actually classifies): the fraction of claims bucketed
//      NEW, scaled to 35. This directly operationalizes the SOIC "new
//      information" framework this whole classifier exists for — within
//      the same significance bucket, an announcement that's mostly
//      genuinely NEW information should outrank one that's mostly
//      KNOWN/restated, even if both got tagged the same significance by
//      announcement-insights (which judges the EVENT's importance, not
//      how much of today's filing is actually new information about it).
//      Items with no infoClassification (the other ~95% of cards, since
//      this only runs on the nightly top 5) score 0 here — unaffected,
//      falls back to components 1-3 exactly as before this field existed.
const EPS_CONFIDENCE_WEIGHT = { high: 25, medium: 15, low: 8 };

// Market-reaction refinement — ONLY available on the resend-with-market-data
// pass (marketData is null/absent on the initial nightly send, see
// cmdResendWithMarketData's Step 4 above), so the initial email's order is
// fully reproducible from the note payload alone, while the morning resend
// can re-rank using what the market actually did overnight. Two capped
// sub-components so a single extreme value (e.g. a thinly-traded stock's
// noisy 1D return) can't swing the ranking on its own:
//   - |returns1d| scaled at 2 points per 1%, capped at 12 (i.e. maxes out
//     at a +/-6% move) — magnitude of reaction, not direction, since both a
//     surprise beat and a surprise miss are "the market found this
//     significant."
//   - volRatio7d >= 2.0x (the same threshold marketDataHtml's own coloring
//     uses to flag a volume spike) contributes a flat 8 — confirms the
//     price move was on real participation, not a thin/illiquid blip.
const MARKET_REACTION_RETURN_CAP = 12;
const MARKET_REACTION_VOLUME_SPIKE_BONUS = 8;

function computeRankScore(it) {
  let score = 0;

  if (it.high_conviction || it.highConviction) score += 30;

  const eps = it.epsImpact;
  if (eps && eps.confidence) {
    score += EPS_CONFIDENCE_WEIGHT[String(eps.confidence).toLowerCase()] || 0;
  }
  if (eps && eps.direction) {
    score += eps.direction === 'neutral' ? 3 : 10;
  }

  const ic = it.infoClassification;
  if (ic && Array.isArray(ic.claims) && ic.claims.length) {
    const newCount = ic.claims.filter(
      (c) => String(c.bucket || '').toUpperCase() === 'NEW'
    ).length;
    score += (newCount / ic.claims.length) * 35;
  }

  const md = it.marketData;
  if (md) {
    if (typeof md.returns1d === 'number') {
      score += Math.min(Math.abs(md.returns1d) * 2, MARKET_REACTION_RETURN_CAP);
    }
    if (typeof md.volRatio7d === 'number' && md.volRatio7d >= 2.0) {
      score += MARKET_REACTION_VOLUME_SPIKE_BONUS;
    }
  }

  return score;
}

function buildDigestHtml(insights, { cutoffIstHuman, runIstHuman, stats }) {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...insights].sort((a, b) => {
    const sigDiff = (order[a.significance] ?? 3) - (order[b.significance] ?? 3);
    if (sigDiff !== 0) return sigDiff;
    // Secondary key, within the same significance bucket: higher rank
    // score first (descending) — see computeRankScore above. A stable
    // sort (Array.prototype.sort is stable per spec since ES2019) keeps
    // ties in their original relative order rather than reshuffling them
    // run to run.
    return computeRankScore(b) - computeRankScore(a);
  });
  const groups = { high: [], medium: [], low: [] };
  for (const it of sorted) (groups[it.significance] || (groups[it.significance] = [])).push(it);

  const sections = ['high', 'medium', 'low']
    .filter((sig) => groups[sig] && groups[sig].length)
    .map((sig) => {
      const meta = SIG_META[sig];
      const tone = SIG_TONE[sig] || SIG_TONE.low;
      const cards = groups[sig]
        .map((it) => {
          // Drop any tag that duplicates the category chip already shown in
          // the header (e.g. category=fundraise + tags=[fundraise,...] used
          // to render "fundraise" twice on the same card) — the chip already
          // says it, the tag row should only add NEW information.
          const dedupedTags = Array.isArray(it.tags)
            ? it.tags.filter((t) => t !== it.category)
            : it.tags;
          const tagsHtml = tagPillsHtml(dedupedTags);
          const headline = it.headline
            ? highlightFacts(esc(it.headline))
            : highlightFacts(esc(String(it.insight || '').split(/(?<=[.!?])\s+/)[0] || ''));
          const chainHtml = thesisChainHtml(it);
          const epsHtml = epsImpactHtml(it.epsImpact);
          const marketHtml = marketDataHtml(it.marketData);
          const infoClassHtml = infoClassificationHtml(it.infoClassification);
          // Icon-only link button to the original filing, sitting in the
          // header row next to the category tag rather than as a full-width
          // footer link — the header is where the reader's eye already is.
          // References the icon via `cid:` (see EXPAND_ICON_CID above) — a
          // real MIME-attached image, not a data: URI, since Gmail strips
          // data: URIs from <img src> entirely (confirmed by direct DOM
          // inspection of the live rendered email). No border/background
          // chrome — just the icon.
          // Gmail's sanitizer strips flexbox alignment props (align-items,
          // gap) from inline styles — confirmed by inspecting the live
          // rendered DOM's computed style (both came back "normal"/0 despite
          // being set in the sent HTML). display:flex alone survives but
          // does nothing without align-items, so the icon defaulted to
          // vertical-align:baseline and looked like it was "hanging" above
          // the text line. Fixed by dropping flexbox entirely for this small
          // icon: inline-block + vertical-align:middle on BOTH the category
          // pill and the icon is the one alignment mechanism Gmail reliably
          // honors (it's table/inline layout, not flex).
          const linkBtn = it.pdfUrl
            ? `<a href="${esc(it.pdfUrl)}" target="_blank" title="View original filing" style="display:inline-block;vertical-align:middle;width:14px;height:14px;margin-left:8px;line-height:0;text-decoration:none;"><img src="cid:${EXPAND_ICON_CID}" width="14" height="14" alt="View filing" style="display:inline-block;vertical-align:middle;"/></a>`
            : '';
          // Display name: only append "(companyId)" when a distinct human
          // name exists — otherwise "NSE:ZEEL (NSE:ZEEL)" duplicates the
          // same string (companyId IS the ticker, there's no separate name).
          const displayName =
            it.name && it.name !== it.companyId ? `${it.name} (${it.companyId})` : it.companyId;
          return `
        <div style="background:#fff;border:1px solid #eaecf0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:13.5px;margin-right:10px;line-height:20px;">${stockscansLink(displayName, it.companyId, 'NSE', '#101828')}</div>
            <div style="white-space:nowrap;line-height:20px;">
              <span style="display:inline-block;vertical-align:middle;font-size:10.5px;font-weight:700;font-family:monospace;letter-spacing:0.03em;background:${tone.chipBg};color:${tone.chipFg};border-radius:3px;padding:2px 7px;white-space:nowrap;">${esc(toTitleCase(it.category))}</span>
              ${linkBtn}
            </div>
          </div>
          ${headline ? `<div style="font-size:14.5px;font-weight:600;line-height:1.45;color:#101828;margin-top:9px;">${headline}</div>` : ''}
          ${marketHtml}
          ${chainHtml}
          ${epsHtml}
          ${tagsHtml ? `<div style="margin-top:9px;">${tagsHtml}</div>` : ''}
          ${infoClassHtml}
        </div>`;
        })
        .join('');
      return `
      <div style="margin-bottom:28px;">
        <div style="border-bottom:2px solid ${meta.border};padding-bottom:6px;margin-bottom:12px;">
          <span style="font-size:15px;font-weight:700;color:${meta.color};text-transform:uppercase;">${meta.label}</span>
          <span style="font-size:12px;font-weight:600;color:${meta.color};background:${meta.bg};border:1px solid ${meta.border};border-radius:999px;padding:2px 10px;margin-left:8px;">${groups[sig].length}</span>
        </div>
        ${cards}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px;color:#101828;">
    <h2 style="margin:0 0 4px;">Post-Close Announcement Insights</h2>
    <p style="color:#667085;font-size:13px;margin:0 0 20px;">Window: ${esc(cutoffIstHuman)} &rarr; ${esc(runIstHuman)} &nbsp;&middot;&nbsp; ${insights.length} insight(s)</p>
    ${sections || '<p style="color:#667085;">No non-routine announcements in this window.</p>'}
    ${buildStatsFooterHtml(stats)}
  </body></html>`;
}

async function cmdSendDigest(argv) {
  loadEnv(argValue('--env-file', argv));
  const file = argv[0];
  if (!file) throw new Error('send-digest requires an insights JSON array file path');
  const insights = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cutoffIstHuman = argValue('--cutoff-human', argv) || '';
  const runIstHuman = ist.nowIstHuman();
  // --stats-file <path>: optional JSON {total, insights, highConviction,
  // heavyDocSkipped, routine, ocrFailed, noiseDropped} — the orchestrating
  // skill assembles this across Steps 1-3 (it's the only place that has
  // visibility into every funnel stage; see STATS_TILES above). Omit the
  // flag and the digest renders exactly as before (no footer).
  const statsFile = argValue('--stats-file', argv);
  const stats = statsFile ? JSON.parse(fs.readFileSync(statsFile, 'utf8')) : null;
  const html = buildDigestHtml(insights, { cutoffIstHuman, runIstHuman, stats });
  const highCount = insights.filter((i) => i.significance === 'high').length;
  const subject = `Post-Close Insights — ${ist.nowIstDate()}${highCount ? ` (${highCount} high-conviction)` : ''}`;
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
  const result = await sendHtmlEmail({ subject, htmlBody: html, attachments });
  process.stdout.write(
    JSON.stringify({ status: result.status || 'sent', subject, count: insights.length }, null, 2)
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
      companies = table.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
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
      marketData: {
        returns1d: m.returns1d != null ? m.returns1d : null,
        deliveryPct: d.available ? d.deliv_per : null,
        deliveryValueCr: d.available ? d.deliv_value_cr : null,
        volRatio7d: volRatioByTicker[cid] != null ? volRatioByTicker[cid] : null,
      },
    };
  });

  const cutoffIstHuman = `Re-send of ${dateArg}'s post-close digest, with end-of-day market data`;
  const runIstHuman = ist.nowIstHuman();
  const html = buildDigestHtml(insights, { cutoffIstHuman, runIstHuman, stats: null });
  const highCount = insights.filter((i) => i.significance === 'high').length;
  const subject = `Post-Close Insights — ${dateArg} (with market data)${highCount ? ` (${highCount} high-conviction)` : ''}`;
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
  const result = await sendHtmlEmail({ subject, htmlBody: html, attachments });
  process.stdout.write(
    JSON.stringify(
      {
        status: result.status || 'sent',
        subject,
        count: insights.length,
        tickersWithDelivery: Object.values(deliveryByTicker).filter((d) => d.available).length,
        tickersWithReturns: Object.values(marketByTicker).filter((m) => m.returns1d != null).length,
        tickersWithVolRatio: Object.values(volRatioByTicker).filter((v) => v != null).length,
      },
      null,
      2
    )
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = {
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

main().catch((err) => {
  process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
  process.exit(1);
});
