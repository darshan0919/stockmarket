'use strict';

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../index');
const { safeTicker } = require('./documentsFetcher');

const API_PAGE_SIZE = 30;

async function fetchAnnouncementsPage(ticker, offset = 0) {
  // Use the standard companyAnnouncements client method which maps to the same backend logic
  const payload = { companyIds: [ticker], offset };
  const data = await stockscans.companyAnnouncements(payload, { 
    referer: `https://www.stockscans.in/company/${encodeURIComponent(ticker)}` 
  });
  return data.companyAnnouncements || [];
}

async function* iterAnnouncements(ticker, { maxPages = 5, stopBefore = null } = {}) {
  for (let page = 0; page < maxPages; page++) {
    const offset = page * API_PAGE_SIZE;
    const rows = await fetchAnnouncementsPage(ticker, offset);
    if (!rows || rows.length === 0) return;

    for (const r of rows) {
      if (stopBefore && r.date && r.date < stopBefore) return;
      yield r;
    }

    if (rows.length < API_PAGE_SIZE) return;

    // Polite delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

function matchesQuery(ann, patterns) {
  if (!patterns || patterns.length === 0) return true;
  const haystack = `${ann.title || ''} ${ann.description || ''}`;
  return patterns.every(p => p.test(haystack));
}

function inDateRange(ann, start, end) {
  const d = ann.date || '';
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function announcementFilename(ticker, ann) {
  const date = ann.date || 'unknown';
  let title = (ann.title || '').replace(/[^A-Za-z0-9]+/g, '_').substring(0, 40);
  title = title.replace(/_+$/, '');
  return `${safeTicker(ticker)}_announcement_${date}_${title}.pdf`;
}

/**
 * High-level modular function to fetch corporate announcements.
 */
async function fetchAnnouncements(ticker, options = {}) {
  const {
    search = [],
    start,
    end,
    maxPages = 5,
    maxResults = 50,
    outputDir = './stock_announcements',
    listOnly = false
  } = options;

  const patterns = (Array.isArray(search) ? search : [search]).map(s => new RegExp(s, 'i'));
  const matched = [];
  let seen = 0;

  for await (const ann of iterAnnouncements(ticker, { maxPages, stopBefore: start })) {
    seen++;
    if (!inDateRange(ann, start, end)) continue;
    if (!matchesQuery(ann, patterns)) continue;
    matched.push(ann);
    if (matched.length >= maxResults) break;
  }

  if (listOnly) {
    return { matched, seen };
  }

  const outDir = path.resolve(outputDir);
  fs.mkdirSync(outDir, { recursive: true });

  const fetched = [];
  const skipped = [];

  for (const ann of matched) {
    const ssUrl = ann.ssUrl;
    if (!ssUrl) {
      skipped.push({ ...ann, reason: 'no PDF attached' });
      continue;
    }
    const fname = announcementFilename(ticker, ann);
    const dest = path.join(outDir, fname);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      fetched.push({
        ...ann,
        filename: fname,
        path: dest,
        size_bytes: fs.statSync(dest).size,
        cached: true
      });
      continue;
    }

    try {
      const url = stockscans.s3PdfUrl(ssUrl);
      const buf = await stockscans.fetchPdf(url);
      fs.writeFileSync(dest, buf);
      fetched.push({
        ...ann,
        filename: fname,
        path: dest,
        size_bytes: buf.length,
        cached: false
      });
    } catch (e) {
      skipped.push({ ...ann, reason: String(e) });
    }
  }

  const manifest = {
    ticker,
    fetched_at: new Date().toISOString(),
    search,
    start,
    end,
    announcements: fetched,
    skipped
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { fetched, skipped, manifest, manifestPath, seen };
}

module.exports = {
  fetchAnnouncements,
  iterAnnouncements,
  matchesQuery,
  inDateRange,
  announcementFilename
};
