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

/**
 * Image clean-up before Tesseract, via ImageMagick (`convert`). Returns the cleaned PNG, or the input when `convert` is missing
 * or fails, so OCR still runs.
 *   gray   grayscale + contrast normalise
 *   clean  gray + deskew + binarise + erase long table rules (they are read as | _ and glue rows together)
 */
function prepImage(png, prep, { timeoutMs = 60000 } = {}) {
  if (!prep || prep === 'none') return png;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfx_prep_'));
  const f = (n) => path.join(dir, n);
  const run = (args) => execFileSync('convert', args, { timeout: timeoutMs, stdio: 'pipe' });
  try {
    fs.writeFileSync(f('in.png'), png);
    if (prep === 'gray') {
      run([f('in.png'), '-colorspace', 'Gray', '-normalize', f('out.png')]);
    } else if (prep === 'clean') {
      run([
        f('in.png'),
        '-colorspace',
        'Gray',
        '-normalize',
        '-deskew',
        '40%',
        '-threshold',
        '60%',
        f('base.png'),
      ]);
      // rules = long horizontal or vertical runs of ink; painted white over the page
      run([f('base.png'), '-negate', '-morphology', 'Open', 'Rectangle:60x1', f('hor.png')]);
      run([f('base.png'), '-negate', '-morphology', 'Open', 'Rectangle:1x60', f('ver.png')]);
      run([f('hor.png'), f('ver.png'), '-compose', 'Lighten', '-composite', f('rules.png')]);
      run([f('base.png'), f('rules.png'), '-compose', 'Lighten', '-composite', f('out.png')]);
    } else return png;
    return fs.readFileSync(f('out.png'));
  } catch {
    return png;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Tesseract OCR of one page (Tier 2). Defaults: 200 dpi, `--psm 6` (keeps table rows on one line), no clean-up.
 * opts: {dpi, psm, prep: 'none'|'gray'|'clean'}. Returns '' on failure.
 */
function ocrPage(file, page, { dpi = 200, psm = 6, prep = 'none', timeoutMs = 60000 } = {}) {
  let png;
  try {
    png = prepImage(renderPagePng(file, page, { dpi, timeoutMs }), prep, { timeoutMs });
  } catch {
    return '';
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfx_ocr_'));
  try {
    const img = path.join(dir, 'page.png');
    fs.writeFileSync(img, png);
    const raw = execFileSync(
      'tesseract',
      [img, 'stdout', '--psm', String(psm), '-c', 'preserve_interword_spaces=1'],
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
