#!/usr/bin/env node
'use strict';

/**
 * Step 1-2 of the concall-transcript-extractor workflow (script-first, no LLM).
 *
 * 1. Search the company's corporate announcements for the word "Recording"
 *    using client.announcements() with client-side keyword filter (the dedicated
 *    /api/company/announcements/search endpoint returns 404 and is broken).
 *    Companies file a short "Recording of <Company> Earnings Conference Call"
 *    announcement within hours of the call, well before the polished Transcript
 *    PDF shows up in the documents API.
 * 2. Return early with { found: false } if no such announcement exists yet.
 * 3. Resolve the announcement's ssUrl to the full S3 PDF URL and download it
 *    locally so the caller (Claude, reading the PDF) can pull out the actual
 *    recording link (mp3/mp4/webpage) embedded in the filing.
 *
 * Usage:
 *   node find-earnings-recording.js <TICKER> [--out-dir <dir>] [--since-days N]
 *
 * Output (stdout, JSON):
 *   { found: false, ticker }
 *   { found: true, ticker, announcement: {...}, pdfPath: "/abs/path.pdf" }
 */

const path = require('path');
const fs = require('fs');
const { StockscansClient } = require('../src/clients/StockscansClient.js');
const { mapWithConcurrency, withRetry } = require('../src/utils/concurrency.js');
const { scanAnnouncementsForCompanies } = require('../src/utils/bulkAnnouncementScan.js');

const DOWNLOAD_CONCURRENCY = parseInt(process.env.CONCALL_SCAN_CONCURRENCY || '3', 10);

function parseArgs(argv) {
  const out = { ticker: null, outDir: process.cwd(), sinceDays: 10 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--since-days') out.sinceDays = parseInt(argv[++i], 10);
    else rest.push(a);
  }
  out.ticker = rest[0];
  return out;
}

/**
 * Composable version of the CLI — used both by `main()` below and by
 * `get-latest-concall-transcript.js` (tier 3 of the waterfall) so the search +
 * download logic lives in exactly one place.
 * @param {string} ticker
 * @param {Object} [opts]
 * @param {string} [opts.outDir=process.cwd()]
 * @param {number} [opts.sinceDays=10]
 * @param {StockscansClient} [opts.client] - Inject for reuse/tests.
 * @returns {Promise<{found:false,ticker:string}|{found:true,ticker:string,announcement:Object,pdfUrl:string,pdfPath:string}>}
 */
async function findRecordingAnnouncement(
  ticker,
  { outDir = process.cwd(), sinceDays = 10, client } = {}
) {
  const c = client || new StockscansClient();
  await c.validateAuth();

  const since = new Date(Date.now() - sinceDays * 86400000);

  // NOTE: searchAnnouncements (/api/company/announcements/search) returns HTTP
  // 404 in the current Stockscans API. Use client.announcements() instead and
  // filter client-side for "Recording" in the title/description.
  const result = await c.announcements([ticker], 0);

  const matches = (result.companyAnnouncements || result.announcements || [])
    .filter((a) => a.ssUrl)
    .filter((a) => {
      const title = (a.title || a.subject || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      return title.includes('recording') || desc.includes('recording');
    })
    .filter((a) => {
      const t = new Date(a.createdAt || a.date);
      return !isNaN(t) ? t >= since : true;
    })
    // newest first
    .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

  if (!matches.length) {
    return { found: false, ticker };
  }

  const announcement = matches[0];
  const pdfUrl = c.s3PdfUrl(announcement.ssUrl);
  const buf = await c.fetchPdf(pdfUrl);

  fs.mkdirSync(outDir, { recursive: true });
  const safeTicker = ticker.replace(/[^a-z0-9]/gi, '_');
  const pdfPath = path.join(outDir, `${safeTicker}_recording_announcement.pdf`);
  fs.writeFileSync(pdfPath, buf);

  return { found: true, ticker, announcement, pdfUrl, pdfPath };
}

/**
 * Build the text variants a company might use to label a given quarter in
 * an announcement title/description, e.g. `{fiscalYear: 2027, fiscalPeriod:
 * "Q1"}` -> ["Q1FY27", "Q1 FY27", "Q1FY2027", "Q1 FY2027", "Q1 FY 2027"].
 * Used to prefer a scan match that actually names the target quarter over
 * just taking the newest keyword hit in the scan window (see
 * findRecordingAnnouncementsBulk's IMPORTANT note above). Companies are
 * inconsistent about spacing/2-vs-4-digit year, so this deliberately casts
 * a wide net of plausible variants rather than one canonical form; matching
 * is a confidence signal, not a strict requirement — the caller still uses
 * the newest keyword match if nothing names the quarter explicitly.
 * @param {{fiscalYear: number, fiscalPeriod: string}} quarter
 * @returns {string[]} uppercase label variants
 */
function buildQuarterLabels({ fiscalYear, fiscalPeriod }) {
  if (!fiscalYear || !fiscalPeriod) return [];
  const yy = String(fiscalYear).slice(-2);
  const yyyy = String(fiscalYear);
  return [
    `${fiscalPeriod}FY${yy}`,
    `${fiscalPeriod} FY${yy}`,
    `${fiscalPeriod}FY${yyyy}`,
    `${fiscalPeriod} FY${yyyy}`,
    `${fiscalPeriod} FY ${yyyy}`,
  ].map((s) => s.toUpperCase());
}

/**
 * Bulk equivalent of {@link findRecordingAnnouncement} for many companies at
 * once — the Tier-4 fallback in get-latest-concall-transcript.js used to
 * call `client.announcements([ticker], 0)` once per company here, which is
 * exactly the "1000 companies = 1000 calls" problem. This instead uses
 * {@link scanAnnouncementsForCompanies} (bulk `/api/company/announcements/scan`,
 * batching via a temporary watchlist above 10 companies — see that module
 * for why a chunk-of-10 loop is the wrong fix) with `searchFilters` for
 * recording keywords, so N companies costs O(1) calls (create+scan+delete)
 * instead of N or even ceil(N/10).
 *
 * Also more precise than the single-company path: `scanAnnouncementsForCompanies`
 * scopes results to `quarterDate` and stops early once every requested
 * company has a match, whereas {@link findRecordingAnnouncement} only had a
 * rolling `sinceDays` window with no quarter awareness.
 *
 * Never throws for a scan/watchlist failure — reports via `onWarning` and
 * treats the affected companies as unresolved (`found: false`) rather than
 * aborting the whole run; the caller should surface these warnings to the
 * user since "not found" here can mean "genuinely absent" OR "the bulk scan
 * itself failed", which are different situations.
 *
 * IMPORTANT — quarterDate vs. target quarter are NOT the same thing here.
 * `quarterDate` scopes the *scan window* (the calendar quarter the recording
 * was likely released in — see `computeReleaseQuarterDate` in
 * `bulkAnnouncementScan.js`); it does NOT guarantee every match within that
 * window is actually ABOUT the quarter the caller wants. A company that
 * files late, or has multiple recent recordings, can have more than one
 * "recording"-keyword match in the same scan window. Pass `quarter` (the
 * `{fiscalYear, fiscalPeriod}` the caller actually wants) per entry so
 * matches can be checked against the quarter label the announcement itself
 * names (e.g. "Q4FY26") — this is what caught a real bug during development
 * where a scan returned a company's OLDER quarter's recording that
 * coincidentally fell in the same scan window as the target quarter.
 *
 * @param {Array<{ticker: string, quarterDate: string, quarter?: {fiscalYear: number, fiscalPeriod: string}}>} entries - quarterDate is the release-quarter scan window (see computeReleaseQuarterDate), NOT the target reporting period
 * @param {Object} [opts]
 * @param {string} [opts.outDir=process.cwd()]
 * @param {StockscansClient} [opts.client]
 * @param {(message: string) => void} [opts.onWarning]
 * @returns {Promise<Map<string, {found:false,ticker:string}|{found:true,ticker:string,announcement:Object,pdfUrl:string,pdfPath:string,labelConfirmed:boolean}>>}
 */
async function findRecordingAnnouncementsBulk(
  entries,
  { outDir = process.cwd(), client, onWarning = () => {} } = {}
) {
  const c = client || new StockscansClient();
  if (!client) await c.validateAuth();

  const out = new Map();
  if (!entries.length) return out;

  const quarterByTicker = new Map();
  for (const e of entries) if (e.quarter) quarterByTicker.set(e.ticker, e.quarter);

  // scanAnnouncementsForCompanies takes one quarterDate per call — group
  // entries that share a scan window so each call covers every company for
  // that window in one shot, rather than a separate call per (company, window).
  const byQuarter = new Map();
  for (const e of entries) {
    if (!byQuarter.has(e.quarterDate)) byQuarter.set(e.quarterDate, []);
    byQuarter.get(e.quarterDate).push(e.ticker);
  }

  const matchesByTicker = new Map();
  for (const e of entries) matchesByTicker.set(e.ticker, []);

  for (const [quarterDate, tickers] of byQuarter) {
    const announcements = await scanAnnouncementsForCompanies({
      client: c,
      companyIds: tickers,
      quarterDate,
      searchFilters: ['Audio Recording', 'Call Recording', 'Recording', 'Link of Recording'],
      onWarning,
    });
    for (const a of announcements) {
      if (!a.ssUrl || !matchesByTicker.has(a.companyId)) continue;
      const title = (a.title || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      if (title.includes('recording') || desc.includes('recording')) {
        matchesByTicker.get(a.companyId).push(a);
      }
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  const downloadTargets = [];
  for (const [ticker, matches] of matchesByTicker) {
    if (!matches.length) {
      out.set(ticker, { found: false, ticker });
      continue;
    }
    // Prefer a match whose own title/description names the target quarter
    // (e.g. "Q4FY26") over just taking the newest keyword match — a company
    // can have more than one "recording" announcement in the same scan
    // window, and only one of them is actually about the quarter we want.
    const quarter = quarterByTicker.get(ticker);
    const labels = quarter ? buildQuarterLabels(quarter) : [];
    const labelMatches = labels.length
      ? matches.filter((a) =>
          labels.some((l) => `${a.title || ''} ${a.description || ''}`.toUpperCase().includes(l))
        )
      : [];
    const pool = labelMatches.length ? labelMatches : matches;
    const labelConfirmed = labelMatches.length > 0;
    if (!labelConfirmed && labels.length) {
      onWarning(
        `${ticker}: found a "recording" announcement but none of its title/description mention ${labels.join('/')} — ` +
          `taking the newest match anyway, but verify it's actually for the intended quarter before transcribing it.`
      );
    }
    const announcement = [...pool].sort(
      (a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    )[0];
    downloadTargets.push({ ticker, announcement, labelConfirmed });
  }

  const downloads = await mapWithConcurrency(
    downloadTargets,
    DOWNLOAD_CONCURRENCY,
    async ({ ticker, announcement }) => {
      const pdfUrl = c.s3PdfUrl(announcement.ssUrl);
      const buf = await withRetry(() => c.fetchPdf(pdfUrl));
      const safeTicker = ticker.replace(/[^a-z0-9]/gi, '_');
      const pdfPath = path.join(outDir, `${safeTicker}_recording_announcement.pdf`);
      fs.writeFileSync(pdfPath, buf);
      return { ticker, announcement, pdfUrl, pdfPath };
    }
  );

  for (let i = 0; i < downloadTargets.length; i++) {
    const { ticker, labelConfirmed } = downloadTargets[i];
    const settled = downloads[i];
    if (settled.ok) {
      out.set(ticker, { found: true, ticker, labelConfirmed, ...settled.value });
    } else {
      onWarning(`PDF download failed for ${ticker}: ${settled.error.message}`);
      out.set(ticker, { found: false, ticker, error: settled.error.message });
    }
  }

  return out;
}

async function main() {
  const { ticker, outDir, sinceDays } = parseArgs(process.argv.slice(2));
  if (!ticker) {
    console.error('Usage: find-earnings-recording.js <TICKER> [--out-dir <dir>] [--since-days N]');
    process.exit(1);
  }
  const result = await findRecordingAnnouncement(ticker, { outDir, sinceDays });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ found: false, error: err.message }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  main,
  findRecordingAnnouncement,
  findRecordingAnnouncementsBulk,
  buildQuarterLabels,
};
