'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_CHARS = 8000;

/** OCR a scanned PDF (lazy tesseract.js). Returns '' if unavailable. */
async function ocrPdf() {
  // OCR requires heavyweight optional deps (tesseract.js + rendering). When they
  // aren't installed we degrade exactly like the Python (returns ''), so SAST-scan
  // PDFs simply fall back to the description rather than crashing.
  try {
    // eslint-disable-next-line global-require
    require.resolve('tesseract.js');
  } catch {
    return '';
  }
  return ''; // image rasterization path intentionally omitted unless deps are present
}

/** Fallback: pdftotext CLI (poppler) if present. Returns '' if unavailable/fails. */
function pdftotextCli(buf) {
  const tmp = path.join(os.tmpdir(), `wi_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmp, buf);
  try {
    return execFileSync('pdftotext', [tmp, '-'], { encoding: 'utf8' });
  } catch {
    return '';
  } finally {
    fs.existsSync(tmp) && fs.unlinkSync(tmp);
  }
}

/** Extract text (+ page count when derivable) from a normal (text-layer) PDF buffer. */
async function extractTextLayer(buf) {
  try {
    // eslint-disable-next-line global-require
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buf);
    const text = data.text || '';
    const numPages = Number.isFinite(data.numpages) ? data.numpages : null;
    // pdf-parse can load but still fail at runtime on some pages/environments
    // (e.g. missing canvas native bindings -> "DOMMatrix is not defined").
    // Treat a near-empty result the same as a hard failure and try poppler.
    if (text.trim().length >= 40) return { text, numPages };
    const cliText = pdftotextCli(buf);
    return cliText.trim().length > text.trim().length
      ? { text: cliText, numPages }
      : { text, numPages };
  } catch (e) {
    // Any pdf-parse failure (module missing, native-binding error, etc.) ->
    // fall back to the pdftotext CLI (poppler) if present. No reliable page
    // count from the CLI text alone, so numPages is null (treated as unknown,
    // not "not heavy" — see watchlist-insights' handling of a null numPages).
    return { text: pdftotextCli(buf), numPages: null };
  }
}

/**
 * Extract plain text from PDF bytes, mirroring watchlist_insights.py cmd_read_pdf:
 * text layer → OCR fallback if near-empty → truncate to ~8000 chars.
 * @param {Buffer} buf
 * @returns {Promise<string>}
 */
async function pdfToText(buf) {
  const { text: extracted } = await pdfToTextWithMeta(buf);
  return extracted;
}

/**
 * Same extraction as pdfToText, but also returns the page count when derivable
 * (pdf-parse's `numpages`; null if we fell back to the poppler CLI, which
 * doesn't expose one). Used by watchlist-insights to flag PDFs that needed
 * heavy parsing (>4 pages) even though their category wasn't skip-listed —
 * see HEAVY_DOCUMENT_CATEGORIES in packages/jobs-runtime/lib/announcementTaxonomy.js.
 * @param {Buffer} buf
 * @returns {Promise<{text: string, numPages: number|null}>}
 */
async function pdfToTextWithMeta(buf) {
  let { text, numPages } = await extractTextLayer(buf);
  if (text.trim().length < 80) {
    const ocr = await ocrPdf(buf);
    if (ocr.trim().length > text.trim().length) {
      text = `[OCR-extracted — scanned PDF]\n${ocr}`;
    }
  }
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n\n[... truncated — original length: ${text.length} chars]`;
  }
  return { text, numPages };
}

module.exports = { pdfToText, pdfToTextWithMeta };
