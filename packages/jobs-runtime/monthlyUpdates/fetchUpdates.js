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
const {
  shouldIgnoreAnnouncement,
} = require('../../../stock-api/src/utils/announcementNoiseFilter.js');
const { extractPdfText } = require('./pdfText.js');

const SCAN_ID = '0b85d5ecbd43531ee2f10213';
const SCAN_NAME = 'Monthly Updates';
const SEARCH_FILTERS = [
  // Core Business Updates
  'Business Update',
  'Quarterly Update',
  // Auto / Commercial Vehicles / Machinery
  'Monthly Sales',
  'Sales Performance',
  'Sales Volume',
  'Production and Sales',
  // Mining, Metals & Steel
  'Physical Performance',
  'Production and Despatch',
  'Production and Offtake',
  // Banking, Small Finance Banks & NBFCs
  'Provisional Business Figures',
  'Provisional Figures',
  'Disbursement Update',
  // Ports & Logistics
  'Cargo Volumes',
  'Traffic Performance',
  // Power & Renewables
  'Generation Performance',
  'Monthly Generation',
  // Real Estate & Infrastructure
  'Operational Update',
  'Operational Performance',
  // Aviation & Transport
  'Traffic Statistics',
];

// announcements/scan pages at 30 (documented in bulkAnnouncementScan.js).
const PAGE_SIZE = 30;
// ~240/quarter measured live; 12 pages (=360) gives headroom without an
// unbounded crawl. `total` is NOT used to size this — it is confirmed
// self-inflating for this endpoint (conventions §16).
const MAX_PAGES = 12;
// Stockscans enforces a hard limit of 12 searchFilters per announcement scan request.
const MAX_SEARCH_FILTERS_PER_CHUNK = 10;
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

const RETRY_OPTS = { retries: 6, baseDelayMs: 2000 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFilterHash(filters = SEARCH_FILTERS) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify([...filters].sort()))
    .digest('hex')
    .slice(0, 10);
}

function scanCacheDir() {
  const dir = db.cachePath('monthly-updates-scan');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scanCacheFile(quarterDate, filterHash) {
  return path.join(scanCacheDir(), `${quarterDate}_${filterHash}.json`);
}

function getCurrentQuarterDate(now = new Date()) {
  const qEndMonth = (Math.floor(now.getUTCMonth() / 3) + 1) * 3;
  return `${now.getUTCFullYear()}${String(qEndMonth).padStart(2, '0')}`;
}

function isClosedQuarter(quarterDate, now = new Date()) {
  return quarterDate < getCurrentQuarterDate(now);
}

function readScanCache(quarterDate, filterHash, now = new Date(), ttlMs = 12 * 3600 * 1000) {
  const file = scanCacheFile(quarterDate, filterHash);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || !Array.isArray(data.items)) return null;
    if (isClosedQuarter(quarterDate, now)) return data.items;
    if (data.cachedAt && Date.now() - new Date(data.cachedAt).getTime() < ttlMs) {
      return data.items;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function writeScanCache(quarterDate, filterHash, items) {
  const file = scanCacheFile(quarterDate, filterHash);
  const data = {
    quarterDate,
    filterHash,
    cachedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
  fs.writeFileSync(file, JSON.stringify(data));
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildScan(filters = SEARCH_FILTERS) {
  return {
    scanId: SCAN_ID,
    scanName: SCAN_NAME,
    filters: [],
    industry: [],
    index: [],
    watchlistIds: [],
    searchFilters: filters,
    announcementType: 'All',
    alerts: false,
    searchMode: 'quick',
    companyIds: [],
    companyFilters: [],
  };
}

/**
 * Fetch announcements for a single chunk of searchFilters (<= 12 per Stockscans hard limit).
 */
async function scanQuarterChunk(client, quarterDate, filters) {
  const scan = buildScan(filters);
  const first = await withRetry(
    () => client.scanAnnouncements({ scan, offset: 0, quarterDate }),
    RETRY_OPTS
  );
  const firstItems = first.announcements || first.documents || first.items || [];
  if (firstItems.length < PAGE_SIZE) return firstItems;

  const offsets = [];
  for (let p = 1; p < MAX_PAGES; p++) offsets.push(p * PAGE_SIZE);
  const settled = await mapWithConcurrency(offsets, SCAN_CONCURRENCY, async (offset) => {
    const r = await withRetry(
      () => client.scanAnnouncements({ scan, offset, quarterDate }),
      RETRY_OPTS
    );
    return r.announcements || r.documents || r.items || [];
  });

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

/**
 * Fetch every page of the scan for one calendar quarter.
 * Automatically checks DB cache for closed quarters and chunks searchFilters to avoid 402/429 limits.
 */
async function scanQuarter(
  client,
  quarterDate,
  searchFilters = SEARCH_FILTERS,
  { force = false } = {}
) {
  const filterHash = getFilterHash(searchFilters);
  if (!force) {
    const cached = readScanCache(quarterDate, filterHash);
    if (cached) {
      return { items: cached, cached: true };
    }
  }

  const chunks = chunkArray(searchFilters, MAX_SEARCH_FILTERS_PER_CHUNK);
  const allChunkItems = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(800); // Cooling delay between filter chunks
    const items = await scanQuarterChunk(client, quarterDate, chunks[i]);
    allChunkItems.push(...items);
  }
  const deduped = dedupe(allChunkItems);
  writeScanCache(quarterDate, filterHash, deduped);
  return { items: deduped, cached: false };
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
    } catch (_) {
      /* corrupt cache entry — fall through and re-derive */
    }
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
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* non-fatal */
    }
  }
}

/**
 * Full extraction pass.
 * @returns {Promise<{announcements:Array, texts:Array, stats:Object}>}
 */
async function extractMonthlyUpdates(
  client,
  { months = 15, maxDayOfMonth = 3, force = false, quarters = null } = {}
) {
  const qs = quarters || quarterDatesForLastMonths(months);
  let scanCacheHits = 0;
  const quarterErrors = [];
  const pages = [];

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    try {
      const res = await scanQuarter(client, q, SEARCH_FILTERS, { force });
      if (res.cached) {
        scanCacheHits++;
      } else if (i < qs.length - 1) {
        // Cooling delay between live quarter scans to stay well under rate limits
        await sleep(1200);
      }
      pages.push(res.items || []);
    } catch (err) {
      quarterErrors.push({
        quarterDate: q,
        error: err && err.message ? err.message : 'unknown',
      });
      pages.push([]);
    }
  }

  const all = dedupe(pages.flat());
  // Filter out noise announcements (AGMs, postal ballots, dividends, investor presentations, etc.)
  // Reporting-day cohort filter removed to capture announcements filed on any day of the month.
  const kept = all.filter((ann) => !shouldIgnoreAnnouncement(ann));

  let cacheHits = 0;
  let ocrUsed = 0;
  const failures = [];
  const settledTexts = await mapWithConcurrency(kept, PDF_CONCURRENCY, async (ann) => {
    const t = await getAnnouncementText(client, ann, { force });
    if (!t.cached) await sleep(250); // Small pacing delay when downloading fresh PDFs
    if (t.cached) cacheHits++;
    if (t.method === 'ocr') ocrUsed++;
    return t;
  });
  const texts = settledTexts.map((res, i) => {
    if (res && res.ok) return res.value;
    const ann = kept[i] || {};
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
    console.warn(
      `[monthly-updates] ${quarterErrors.length} quarter(s) failed to scan:`,
      quarterErrors.map((q) => `${q.quarterDate} (${q.error})`).join(', ')
    );
  }

  return {
    announcements: kept,
    texts: texts.filter(Boolean),
    stats: {
      quarters: qs,
      scanned: all.length,
      kept: kept.length,
      noiseFiltered: all.length - kept.length,
      scanCacheHits,
      cacheHits,
      ocrUsed,
      reportingDayCohort: kept.length, // kept for backward compatibility with stats callers
      companies: new Set(kept.map((a) => sanitizeCompanyId(a.companyId))).size,
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
  getFilterHash,
  readScanCache,
  writeScanCache,
  isClosedQuarter,
  scanCacheFile,
  SCAN_ID,
  SCAN_NAME,
  SEARCH_FILTERS,
};
