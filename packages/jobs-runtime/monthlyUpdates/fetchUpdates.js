'use strict';
/**
 * Extraction pass for the monthly-business-update tracker (conventions §17:
 * this file is pure logic — fetch, cache, extract text. No judgment.)
 *
 * Scope: the user's saved announcement scan "Monthly Updates"
 * (scanId 0b85d5ecbd43531ee2f10213), whose searchFilters are
 * ["Quarterly Update","Monthly Business Update","Business Updates for",
 *  "Business Update for","Business Update"]. Live-measured 2026-09-04:
 * ~240 announcements/quarter across ~171 companies, of which ~77 land on
 * the 1st-3rd of a month — the "reporting day" cohort this tracker targets.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../lib/db.js');
const { mapWithConcurrency, withRetry } = require('../../../stock-api/src/utils/concurrency.js');
const { sanitizeCompanyId } = require('../../../stock-api/src/utils/companyId.js');
const { extractPdfText } = require('./pdfText.js');

const SCAN_ID = '0b85d5ecbd43531ee2f10213';
const SCAN_NAME = 'Monthly Updates';
const SEARCH_FILTERS = [
  'Quarterly Update',
  'Monthly Business Update',
  'Business Updates for',
  'Business Update for',
  'Business Update',
];

// announcements/scan pages at 30 (documented in bulkAnnouncementScan.js).
const PAGE_SIZE = 30;
// ~240/quarter measured live; 12 pages (=360) gives headroom without an
// unbounded crawl. `total` is NOT used to size this — it is confirmed
// self-inflating for this endpoint (conventions §16).
const MAX_PAGES = 12;
// Rate-limit budget. Live-observed 2026-09-04: a 6-wide scan fan-out running
// alongside a 6-wide PDF fan-out drove Stockscans into sustained HTTP 429s,
// and — because a rejected page was being read as "end of data" — that
// surfaced as a SILENTLY SHORT result set (107 announcements instead of 372)
// rather than an error. Both halves of that bug are fixed: pages now fail
// loudly (see scanQuarter), and the fan-out below is sized to stay under the
// limit. Quarters are fetched one at a time; within a quarter, pages go 3-wide.
const SCAN_CONCURRENCY = 3;
const PDF_CONCURRENCY = 4;
const QUARTER_CONCURRENCY = 1;

// 429s here are a sustained budget limit, not a transient blip, so the retry
// ladder is deeper and slower than the library default (3 x 500ms): six
// attempts starting at 1.5s backs off to ~48s, which clears the window.
const RETRY_OPTS = { retries: 6, baseDelayMs: 1500 };

function buildScan() {
  return {
    scanId: SCAN_ID,
    scanName: SCAN_NAME,
    filters: [],
    industry: [],
    index: [],
    watchlistIds: [],
    searchFilters: SEARCH_FILTERS,
    announcementType: 'All',
    alerts: false,
    searchMode: 'quick',
    companyIds: [],
    companyFilters: [],
  };
}

/**
 * Fetch every page of the scan for one calendar quarter. Page 1 is fetched
 * alone (to fast-path the single-page case), then the remainder fire in
 * parallel with a bounded fan-out, per conventions §16.
 */
async function scanQuarter(client, quarterDate) {
  const scan = buildScan();
  const first = await withRetry(() => client.scanAnnouncements({ scan, offset: 0, quarterDate }), RETRY_OPTS);
  const firstItems = first.announcements || first.documents || first.items || [];
  if (firstItems.length < PAGE_SIZE) return firstItems;

  const offsets = [];
  for (let p = 1; p < MAX_PAGES; p++) offsets.push(p * PAGE_SIZE);
  const settled = await mapWithConcurrency(offsets, SCAN_CONCURRENCY, async (offset) => {
    const r = await withRetry(() => client.scanAnnouncements({ scan, offset, quarterDate }), RETRY_OPTS);
    return r.announcements || r.documents || r.items || [];
  });

  // `mapWithConcurrency` returns allSettled-shaped {ok, value} wrappers in
  // input order — unwrap before use. A rejected page ends the in-order walk
  // rather than being silently skipped, so we never stitch a gap into the
  // middle of a newest-first sequence and mistake it for the end of data.
  // Re-apply the sequential early-exit as an in-order truncation so the
  // result is identical to what a sequential loop would have returned.
  const out = [...firstItems];
  for (const res of settled) {
    if (!res || !res.ok) break;
    const page = res.value || [];
    if (!page.length) break;
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

/** Calendar-quarter-end YYYYMM buckets covering the last `months` months. */
function quarterDatesForLastMonths(months, now = new Date()) {
  const set = new Set();
  for (let i = 0; i <= months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const qEndMonth = (Math.floor(d.getUTCMonth() / 3) + 1) * 3;
    set.add(`${d.getUTCFullYear()}${String(qEndMonth).padStart(2, '0')}`);
  }
  return [...set].sort();
}

/** Deduplicate by the announcement's own document identity. */
function dedupe(items) {
  const seen = new Map();
  for (const a of items) {
    const key = a.ssUrl || `${a.companyId}|${a.date}|${a.title}`;
    if (!seen.has(key)) seen.set(key, a);
  }
  return [...seen.values()];
}

/**
 * Keep only announcements filed on the "reporting day" cohort. Most monthly
 * sales filings land on the 1st; a filing made on a weekend/holiday 1st slips
 * to the 2nd or 3rd, so the default window is 1-3 rather than the 1st alone.
 */
function filterReportingDays(items, { maxDayOfMonth = 3 } = {}) {
  return items.filter((a) => {
    if (!a.date) return false;
    const day = Number(String(a.date).slice(8, 10));
    return day >= 1 && day <= maxDayOfMonth;
  });
}

function cacheKeyFor(ssUrl) {
  return crypto.createHash('sha1').update(String(ssUrl)).digest('hex').slice(0, 16);
}

/**
 * Text for one announcement, memoised on disk. The PDF itself is NEVER
 * persisted (DATA_RULES §1.1 — re-fetchable source documents are not stored);
 * only the extracted text lands in data/cache/, which is disposable by
 * definition and simply re-derived on a miss.
 */
async function getAnnouncementText(client, ann, { force = false } = {}) {
  const dir = db.cachePath('monthly-updates-text');
  fs.mkdirSync(dir, { recursive: true });
  const cacheFile = path.join(dir, `${cacheKeyFor(ann.ssUrl)}.json`);

  if (!force && fs.existsSync(cacheFile)) {
    try {
      const hit = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (hit && hit.text) return { ...hit, cached: true };
    } catch (_) { /* corrupt cache entry — fall through and re-derive */ }
  }

  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mu-pdf-'));
  const tmpPdf = path.join(tmpDir, 'doc.pdf');
  try {
    const buf = await withRetry(() => client.fetchPdf(client.s3PdfUrl(ann.ssUrl)), RETRY_OPTS);
    fs.writeFileSync(tmpPdf, buf);
    const res = await extractPdfText(tmpPdf);
    const record = {
      ssUrl: ann.ssUrl,
      companyId: sanitizeCompanyId(ann.companyId),
      date: ann.date,
      title: ann.title,
      description: ann.description,
      method: res.method,
      digits: res.digits,
      text: res.text,
      extractedAt: new Date().toISOString(),
    };
    fs.writeFileSync(cacheFile, JSON.stringify(record));
    return { ...record, cached: false };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

/**
 * Full extraction pass.
 * @returns {Promise<{announcements:Array, texts:Array, stats:Object}>}
 */
async function extractMonthlyUpdates(client, { months = 15, maxDayOfMonth = 3, force = false, quarters = null } = {}) {
  const qs = quarters || quarterDatesForLastMonths(months);
  const settledQuarters = await mapWithConcurrency(qs, QUARTER_CONCURRENCY, (q) => scanQuarter(client, q));
  const quarterErrors = [];
  const pages = settledQuarters.map((res, i) => {
    if (res && res.ok) return res.value || [];
    quarterErrors.push({ quarterDate: qs[i], error: res && res.error ? res.error.message : 'unknown' });
    return [];
  });
  const all = dedupe(pages.flat());
  const cohort = filterReportingDays(all, { maxDayOfMonth });

  let cacheHits = 0;
  let ocrUsed = 0;
  const failures = [];
  const settledTexts = await mapWithConcurrency(cohort, PDF_CONCURRENCY, async (ann) => {
    const t = await getAnnouncementText(client, ann, { force });
    if (t.cached) cacheHits++;
    if (t.method === 'ocr') ocrUsed++;
    return t;
  });
  const texts = settledTexts.map((res, i) => {
    if (res && res.ok) return res.value;
    const ann = cohort[i] || {};
    failures.push({
      companyId: ann.companyId,
      ssUrl: ann.ssUrl,
      error: res && res.error ? res.error.message : 'unknown',
    });
    return null;
  });

  if (quarterErrors.length) {
    // Surfaced, never swallowed: a failed quarter means the window is
    // incomplete, and a caller that persists a partial history would bake a
    // permanent hole into the trend charts.
    console.warn(`[monthly-updates] ${quarterErrors.length} quarter(s) failed to scan:`,
      quarterErrors.map((q) => `${q.quarterDate} (${q.error})`).join(', '));
  }

  return {
    announcements: cohort,
    texts: texts.filter(Boolean),
    stats: {
      quarters: qs,
      scanned: all.length,
      reportingDayCohort: cohort.length,
      companies: new Set(cohort.map((a) => sanitizeCompanyId(a.companyId))).size,
      cacheHits,
      ocrUsed,
      quarterErrors,
      failures,
    },
  };
}

module.exports = {
  extractMonthlyUpdates,
  scanQuarter,
  quarterDatesForLastMonths,
  filterReportingDays,
  getAnnouncementText,
  buildScan,
  SCAN_ID,
  SCAN_NAME,
  SEARCH_FILTERS,
};
