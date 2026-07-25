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

module.exports = { main, findRecordingAnnouncement };
