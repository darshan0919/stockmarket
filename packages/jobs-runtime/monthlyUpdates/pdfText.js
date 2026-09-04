'use strict';
/**
 * Text extraction for Monthly Update filings.
 *
 * Confirmed live 2026-09-04 on a 9-PDF sample of 1st-of-month "Monthly
 * Updates" announcements (TVSMOTOR, ASHOKLEY, NMDC, EICHERMOT, ATULAUTO,
 * FORCEMOT, VSTTILLERS, BONDADA, BRAHMINFRA): ALL nine carried a real
 * embedded text layer, and `pdftotext -layout` reproduced their sales
 * tables with column alignment intact. OCR was not needed for any of them.
 *
 * Hence the deliberate ordering here: text layer FIRST, OCR only as a
 * fallback for the genuinely-scanned filing. This matters at scale — the
 * text path is ~0.2s/PDF versus ~10-30s/PDF for a tesseract rasterise+OCR
 * pass, so defaulting to OCR would make a 240-announcement quarterly
 * backfill roughly two orders of magnitude slower for no accuracy gain
 * (an embedded text layer is exact; OCR of a digital PDF only introduces
 * transcription error).
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);

// A filing whose text layer yields fewer than this many digit characters is
// treated as image-only. Digits (not total chars) are the right signal: a
// scanned filing often still carries a text-layer letterhead or a digital
// signature block worth several hundred characters while containing none of
// the actual tabular numbers we need. VSTTILLERS — the leanest real filing in
// the sample — carried 846 total chars including ~120 digits, so this
// threshold sits well below any genuine text-layer filing observed.
const MIN_DIGITS_FOR_TEXT_LAYER = 40;

const OCR_TIMEOUT_MS = 120000;
const TEXT_TIMEOUT_MS = 30000;

function countDigits(s) {
  const m = String(s || '').match(/\d/g);
  return m ? m.length : 0;
}

/**
 * Extract text via the embedded text layer. `-layout` preserves column
 * geometry, which is what makes these sales tables readable downstream —
 * without it, multi-column rows collapse into an unparseable stream.
 */
async function extractTextLayer(pdfPath) {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', '-q', pdfPath, '-'], {
    timeout: TEXT_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout || '';
}

/**
 * OCR fallback: rasterise to greyscale PNGs then run tesseract per page.
 * Only reached when the text layer is absent/degenerate, so its cost is
 * paid only by filings that genuinely need it.
 */
async function extractViaOcr(pdfPath, { maxPages = 6, dpi = 200 } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mu-ocr-'));
  try {
    await execFileAsync(
      'pdftoppm',
      [
        '-png',
        '-gray',
        '-r',
        String(dpi),
        '-f',
        '1',
        '-l',
        String(maxPages),
        pdfPath,
        path.join(tmpDir, 'pg'),
      ],
      { timeout: OCR_TIMEOUT_MS }
    );
    const pages = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort();
    const out = [];
    for (const p of pages) {
      const { stdout } = await execFileAsync(
        'tesseract',
        [path.join(tmpDir, p), 'stdout', '--psm', '6'],
        { timeout: OCR_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
      );
      out.push(stdout || '');
    }
    return out.join('\n');
  } finally {
    // Best-effort cleanup of a scratch dir OUTSIDE data/ — the no-delete rule
    // in DATA_RULES §5 governs the data mirror, not an os.tmpdir() workspace.
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* non-fatal */
    }
  }
}

/**
 * @returns {Promise<{text:string, method:'text-layer'|'ocr'|'failed', digits:number, error?:string}>}
 */
async function extractPdfText(pdfPath, { allowOcr = true } = {}) {
  let text = '';
  try {
    text = await extractTextLayer(pdfPath);
  } catch (e) {
    text = '';
  }
  const digits = countDigits(text);
  if (digits >= MIN_DIGITS_FOR_TEXT_LAYER) {
    return { text, method: 'text-layer', digits };
  }
  if (!allowOcr) {
    return { text, method: 'failed', digits, error: 'no text layer and OCR disabled' };
  }
  try {
    const ocrText = await extractViaOcr(pdfPath);
    return { text: ocrText, method: 'ocr', digits: countDigits(ocrText) };
  } catch (e) {
    return { text, method: 'failed', digits, error: e.message };
  }
}

module.exports = {
  extractPdfText,
  extractTextLayer,
  extractViaOcr,
  countDigits,
  MIN_DIGITS_FOR_TEXT_LAYER,
};
