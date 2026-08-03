#!/usr/bin/env node
'use strict';

/**
 * monthly-sales-tracker / download-sales-pdfs.js
 *
 * Downloads monthly-sales press-release PDFs for a given ticker from Stockscans.
 *
 * Two modes:
 *   1. --announcements <json-file>  — use a pre-supplied array of announcement objects
 *      (each must have { ssUrl, date, description/title })
 *   2. (auto)                       — fetch announcements matching "Monthly Sales"
 *      from the Stockscans API for the last N pages
 *
 * Usage:
 *   node download-sales-pdfs.js --ticker NSE:TMPV
 *   node download-sales-pdfs.js --ticker NSE:TMPV --announcements ./tmpv-announcements.json
 *   node download-sales-pdfs.js --ticker NSE:TMCV
 *   node download-sales-pdfs.js --ticker NSE:TMPV --list-only
 *
 * Output:
 *   data/runs/monthly-sales-tracker/<ticker>/pdfs/<date>_<month>.pdf
 *   data/runs/monthly-sales-tracker/<ticker>/manifest.json
 */

const fs = require('fs');
const path = require('path');

// Resolve repo root (this file lives 3 levels deep from repo root)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
require('dotenv').config({ path: path.join(REPO_ROOT, '.env') });

const { stockscans } = require(path.join(REPO_ROOT, 'stock-api', 'src', 'index.js'));

// ── Announcement filter ────────────────────────────────────────────────────────
const SALES_PATTERNS = [
  /monthly sales/i,
  /press release.*monthly/i,
];

function isSalesAnnouncement(ann) {
  const text = `${ann.title || ''} ${ann.description || ''}`;
  return SALES_PATTERNS.some((p) => p.test(text));
}

// ── URL builder (mirrors documentsFetcher convention, §12 in conventions.md) ──
function buildPdfUrl(ssUrl) {
  return `https://www.stockscans.in/document/${ssUrl}`;
}

// ── Safe filename from announcement ──────────────────────────────────────────
function buildFilename(ann) {
  const date = ann.date || 'unknown';
  // Extract month name from description if possible
  const monthMatch = ann.description
    ? ann.description.match(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
      )
    : null;
  const monthTag = monthMatch ? `${monthMatch[1]}_${monthMatch[2]}` : date;
  return `${date}_${monthTag}.pdf`;
}

// ── Core download ─────────────────────────────────────────────────────────────
async function downloadPdfs(ticker, announcements, outDir, listOnly) {
  fs.mkdirSync(outDir, { recursive: true });

  const fetched = [];
  const skipped = [];

  for (const ann of announcements) {
    if (!ann.ssUrl) {
      skipped.push({ ...ann, reason: 'no ssUrl' });
      continue;
    }

    const fname = buildFilename(ann);
    const dest = path.join(outDir, fname);

    if (listOnly) {
      fetched.push({ ...ann, filename: fname, path: dest, cached: false, listOnly: true });
      continue;
    }

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`  ✓ cached  ${fname}`);
      fetched.push({
        ...ann,
        filename: fname,
        path: dest,
        size_bytes: fs.statSync(dest).size,
        cached: true,
      });
      continue;
    }

    try {
      const url = buildPdfUrl(ann.ssUrl);
      console.log(`  ↓ ${fname}  (${url})`);
      const buf = await stockscans.fetchPdf(url);
      fs.writeFileSync(dest, buf);
      fetched.push({
        ...ann,
        filename: fname,
        path: dest,
        size_bytes: buf.length,
        cached: false,
      });
      // Polite delay
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn(`  ✗ failed  ${fname}: ${e.message}`);
      skipped.push({ ...ann, reason: String(e) });
    }
  }

  return { fetched, skipped };
}

// ── Auto-fetch announcements from API ─────────────────────────────────────────
async function autoFetchAnnouncements(ticker, maxPages = 10) {
  const PAGE_SIZE = 30;
  const matched = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE_SIZE;
    let rows;
    try {
      const data = await stockscans.companyAnnouncements(
        { companyIds: [ticker], offset },
        { referer: `https://www.stockscans.in/company/${encodeURIComponent(ticker)}` }
      );
      rows = data.companyAnnouncements || [];
    } catch (e) {
      console.warn(`  ⚠ failed to fetch page ${page}: ${e.message}`);
      break;
    }

    if (!rows.length) break;

    for (const r of rows) {
      if (isSalesAnnouncement(r)) matched.push(r);
    }

    if (rows.length < PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  return matched;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help')) {
    console.log(`Usage: node download-sales-pdfs.js [options]
Options:
  --ticker <NSE:TICKER>         Required. Ticker symbol (e.g. NSE:TMPV, NSE:TMCV)
  --announcements <file.json>   Optional. Pre-supplied announcement array JSON file
  --list-only                   Print list without downloading
  --max-pages <n>               Max API pages to scan (default: 10)
  --help                        Show this help`);
    process.exit(0);
  }

  const tickerIdx = argv.indexOf('--ticker');
  if (tickerIdx === -1) {
    console.error('Error: --ticker is required');
    process.exit(1);
  }
  const ticker = argv[tickerIdx + 1];
  const listOnly = argv.includes('--list-only');

  const annIdx = argv.indexOf('--announcements');
  const maxPagesIdx = argv.indexOf('--max-pages');
  const maxPages = maxPagesIdx !== -1 ? parseInt(argv[maxPagesIdx + 1], 10) : 10;

  // Safe ticker for directory name (NSE:TMPV → NSE_TMPV)
  const safeTicker = ticker.replace(/[^A-Za-z0-9]+/g, '_');
  const outDir = path.join(
    REPO_ROOT,
    'data',
    'runs',
    'monthly-sales-tracker',
    safeTicker,
    'pdfs'
  );

  console.log(`\n📥 Monthly Sales PDF Downloader`);
  console.log(`   Ticker : ${ticker}`);
  console.log(`   OutDir : ${outDir}`);
  console.log(`   Mode   : ${listOnly ? 'list-only' : 'download'}\n`);

  let announcements;

  if (annIdx !== -1) {
    // Use pre-supplied JSON
    const annFile = argv[annIdx + 1];
    announcements = JSON.parse(fs.readFileSync(annFile, 'utf8'));
    // Filter to only sales announcements
    announcements = announcements.filter(isSalesAnnouncement);
    // Deduplicate by ssUrl (keep earliest createdAt for revised versions)
    const seen = new Map();
    for (const a of announcements) {
      const key = a.ssUrl;
      if (!seen.has(key)) seen.set(key, a);
    }
    announcements = [...seen.values()];
    console.log(`   Source : pre-supplied file (${announcements.length} sales announcements)`);
  } else {
    console.log(`   Source : auto-fetch from Stockscans API (max ${maxPages} pages)`);
    announcements = await autoFetchAnnouncements(ticker, maxPages);
    console.log(`   Found  : ${announcements.length} monthly sales announcements`);
  }

  // Sort by date ascending
  announcements.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  console.log('\n  Announcements to process:');
  announcements.forEach((a, i) => {
    const monthMatch = (a.description || '').match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
    );
    const label = monthMatch ? `${monthMatch[1]} ${monthMatch[2]}` : a.date;
    console.log(`  [${i + 1}] ${a.date}  ${label}  (${a.ssUrl})`);
  });
  console.log('');

  const { fetched, skipped } = await downloadPdfs(ticker, announcements, outDir, listOnly);

  // Write manifest
  const manifestDir = path.join(REPO_ROOT, 'data', 'runs', 'monthly-sales-tracker', safeTicker);
  fs.mkdirSync(manifestDir, { recursive: true });

  const fetchedAt = new Date().toISOString();
  const manifest = {
    ticker,
    creator: 'monthly-sales-tracker/download-sales-pdfs',
    creationTime: fetchedAt,
    modifiedTime: fetchedAt,
    fetched_at: fetchedAt,
    total: fetched.length,
    skipped_count: skipped.length,
    pdfs: fetched,
    skipped,
  };

  const manifestPath = path.join(manifestDir, 'download-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Done`);
  console.log(`   Fetched : ${fetched.length}`);
  console.log(`   Skipped : ${skipped.length}`);
  console.log(`   Manifest: ${manifestPath}`);

  console.log('\n── Token-optimization note ─────────────────────────────────────────');
  console.log('   PDFs are cached by filename. Re-runs skip already-downloaded files.');
  console.log('   On re-runs, only the latest (new) announcements are fetched.');

  return manifest;
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  });
}

module.exports = { downloadPdfs, autoFetchAnnouncements, isSalesAnnouncement, buildPdfUrl };
