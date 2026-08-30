'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_CHARS = 8000;

/**
 * OCR a scanned (image-only) PDF via the system `pdftoppm` (poppler) + `tesseract`
 * CLIs. Returns '' if either binary is unavailable or OCR fails — the caller treats
 * that as "no OCR text available," NOT as "this document has no content" (see
 * pdfToTextWithMeta's ocrAttempted/ocrFailed flags below, which the caller must
 * surface rather than silently falling back to the announcement description).
 *
 * This was previously stubbed to always return '' regardless of what was installed
 * (a lazy `require.resolve('tesseract.js')` that always failed because tesseract.js
 * was never an actual dependency) — every scanned/image-only announcement PDF
 * silently degraded to empty text with no signal that OCR was even attempted.
 * Fixed 2026-08-24 after a post-close-scan-insights run marked 4 SAST disclosure
 * PDFs "routine" without ever reading their (non-empty, OCR-able) content.
 */
function ocrPdf(buf) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi_ocr_'));
  const pdfPath = path.join(tmpDir, 'doc.pdf');
  const imgPrefix = path.join(tmpDir, 'page');
  try {
    fs.writeFileSync(pdfPath, buf);
    execFileSync('pdftoppm', ['-png', '-r', '150', pdfPath, imgPrefix], { stdio: 'pipe' });
    const pages = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort();
    if (pages.length === 0) return '';
    const texts = pages.map((f) => {
      try {
        return execFileSync('tesseract', [path.join(tmpDir, f), 'stdout'], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        return '';
      }
    });
    return texts.join('\n\n');
  } catch {
    return '';
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
  let isScannedDocument = false;
  let ocrFailed = false;
  if (text.trim().length < 80) {
    const ocr = ocrPdf(buf);
    if (ocr.trim().length > text.trim().length) {
      text = `[OCR-extracted — scanned PDF]\n${ocr}`;
      isScannedDocument = true;
    } else {
      // Text layer was near-empty AND OCR produced nothing usable (binaries
      // missing, or a genuinely blank/corrupt page image). This is NOT the
      // same as "short document" — callers must not treat it as "read, nothing
      // there" and must escalate rather than defaulting to routine/mark-processed.
      ocrFailed = text.trim().length < 20;
    }
  }
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n\n[... truncated — original length: ${text.length} chars]`;
  }
  return { text, numPages, isScannedDocument, ocrFailed };
}

module.exports = { pdfToText, pdfToTextWithMeta };
