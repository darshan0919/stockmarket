'use strict';

/**
 * Page-level helpers for the result-table router: per-page text, page ranking, page rendering and OCR.
 * Everything shells out to poppler / tesseract with explicit timeouts and a large `maxBuffer`
 * (the default 1 MiB silently truncated long annual reports, found 2026-10-03).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_BUFFER = 256 * 1024 * 1024;

/** Layout text per page (1-based pages -> array index + 1). */
function pageTexts(file, { timeoutMs = 60000 } = {}) {
  const t = execFileSync('pdftotext', ['-layout', '-q', file, '-'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_BUFFER,
  });
  const pages = t.split('\f');
  if (pages.length && pages[pages.length - 1].trim() === '') pages.pop();
  return pages;
}

const RESULT_KEYWORDS = [
  /total\s+income/i,
  /profit.{0,40}before\s+(?:exceptional|tax)/i,
  /revenue\s+from\s+operations?/i,
  /\bparticulars\b/i,
  /employee\s+benefit/i,
  /finance\s+costs?/i,
  /earnings?\s+per\s+(?:equity\s+)?share/i,
  /total\s+expenses?/i,
];

/** How many distinct result-table keywords the page carries (0-8). Pure function of the page text. */
function scoreResultPage(text) {
  return RESULT_KEYWORDS.filter((re) => re.test(text)).length;
}

/** Page numbers (1-based) best-first, only pages with at least `minScore` keywords. */
function rankResultPages(pages, { top = 6, minScore = 3 } = {}) {
  return pages
    .map((t, i) => ({ page: i + 1, score: scoreResultPage(t) }))
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, top);
}

/** Render one page to PNG bytes. */
function renderPagePng(file, page, { dpi = 150, timeoutMs = 30000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfx_'));
  try {
    execFileSync(
      'pdftoppm',
      [
        '-png',
        '-r',
        String(dpi),
        '-f',
        String(page),
        '-l',
        String(page),
        '-singlefile',
        file,
        path.join(dir, 'p'),
      ],
      {
        timeout: timeoutMs,
        stdio: 'pipe',
      }
    );
    return fs.readFileSync(path.join(dir, 'p.png'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Tesseract OCR of one page (Tier 2). `--psm 6` keeps table rows on one line. Returns '' on failure. */
function ocrPage(file, page, { dpi = 200, timeoutMs = 60000 } = {}) {
  let png;
  try {
    png = renderPagePng(file, page, { dpi, timeoutMs });
  } catch {
    return '';
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfx_ocr_'));
  try {
    const img = path.join(dir, 'page.png');
    fs.writeFileSync(img, png);
    const raw = execFileSync(
      'tesseract',
      [img, 'stdout', '--psm', '6', '-c', 'preserve_interword_spaces=1'],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    // Table rules are read as | _ [ ] { } and break the row parser; they carry no data.
    return raw.replace(/[|_[\]{}]+/g, ' ').replace(/[ \t]+$/gm, '');
  } catch {
    return '';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  pageTexts,
  scoreResultPage,
  rankResultPages,
  renderPagePng,
  ocrPage,
  MAX_BUFFER,
};
