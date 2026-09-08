'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Default cap for the SHORT-announcement path this module was originally written
// for (a Reg-30 filing is a few thousand chars; 8000 was never a constraint there).
// It is a hard constraint for anything longer, so callers that genuinely need a
// whole document pass `maxChars` explicitly — see pdfToTextWithMeta.
const MAX_CHARS = 8000;

// Hard wall-clock caps on the OCR subprocesses. `execFileSync` with no
// `timeout` blocks forever if the child hangs — confirmed live 2026-09-08: a
// gainers-signal run stuck indefinitely on ONE 7.5MB PDF during Step 2a's
// per-announcement content classification, silently blocking every other
// document behind it in the same batch (mapWithConcurrency awaits the whole
// batch before anything downstream sees progress). Rendering pages
// (`pdftoppm`) and reading each one (`tesseract`) are bounded separately so a
// many-page scan degrades to "OCR failed for this document" — caught by the
// existing try/catch and surfaced via `ocrFailed`/`content_unavailable`
// (see scan-signal-pipeline.md's "Strength is never judged from a title") —
// rather than hanging the process that would otherwise report that finding.
const PDFTOPPM_TIMEOUT_MS = 25000;
const TESSERACT_TIMEOUT_MS = 20000;
// Belt-and-suspenders cap on pdfToTextWithMeta as a whole (text-layer parse +
// OCR fallback combined). Comfortably above PDFTOPPM_TIMEOUT_MS + a few
// TESSERACT_TIMEOUT_MS page-reads, so it should never fire ahead of the more
// specific subprocess timeouts above under normal OCR — it exists for the
// residual risk in `pdf-parse` itself (pure JS/WASM, no subprocess for
// `timeout` to bound), which is a plausible second hang source given the
// "Cannot load @napi-rs/canvas" degraded-path warning observed alongside the
// 2026-09-08 incident.
const OVERALL_EXTRACTION_TIMEOUT_MS = 90000;

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
    execFileSync('pdftoppm', ['-png', '-r', '150', pdfPath, imgPrefix], {
      stdio: 'pipe',
      timeout: PDFTOPPM_TIMEOUT_MS,
    });
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
          timeout: TESSERACT_TIMEOUT_MS,
        });
      } catch {
        // Timeout (SIGTERM) or a genuine tesseract failure on this one page —
        // both degrade to "no text from this page" rather than propagating,
        // so a single bad page doesn't sink pages that DID OCR successfully.
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
    return execFileSync('pdftotext', [tmp, '-'], { encoding: 'utf8', timeout: PDFTOPPM_TIMEOUT_MS });
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
 * Truncation is the sharp edge here. The default 8000-char cap suits the short
 * announcements this was built for, but silently decapitates a long document: an
 * annual report read at the default returns its covering letter and nothing else
 * (observed 2026-09-04 — 8,000 chars returned from a 951,309-char filing, so the
 * RPT tables, contingent liabilities and auditor notes were never in the text a
 * downstream extractor was handed). Pass `maxChars: Infinity` when the whole
 * document is the point, and ALWAYS check `truncated` on the result rather than
 * assuming a returned string is complete.
 *
 * @param {Buffer} buf
 * @param {Object} [opts]
 * @param {number} [opts.maxChars=8000] cap; pass Infinity for the whole document
 * @returns {Promise<{text, numPages, isScannedDocument, ocrFailed, truncated, originalChars}>}
 */
async function pdfToTextWithMeta(buf, { maxChars = MAX_CHARS } = {}) {
  return Promise.race([
    _pdfToTextWithMetaInner(buf, maxChars),
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            text: '',
            numPages: null,
            isScannedDocument: false,
            // Distinguishable from a "tried OCR and got nothing" ocrFailed —
            // this means the WHOLE extraction (including the plain text-layer
            // path) never finished at all within budget. See
            // OVERALL_EXTRACTION_TIMEOUT_MS's header comment for the incident
            // this guards against: pdf-parse (pure JS, no subprocess to time
            // out at the execFileSync layer) is a second, independent place
            // this module could in principle hang, and a caller iterating a
            // batch of documents (gainersScanner's classifyAnnouncementsByContent)
            // must never have ONE stuck document block every other document
            // behind it in the same batch.
            ocrFailed: true,
            truncated: false,
            originalChars: 0,
            extractionTimedOut: true,
          }),
        OVERALL_EXTRACTION_TIMEOUT_MS
      )
    ),
  ]);
}

async function _pdfToTextWithMetaInner(buf, maxChars) {
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
  // `truncated` and `originalChars` are returned explicitly so a caller can never
  // mistake a decapitated document for a complete one. The marker line inside the
  // text was the only previous signal, and nothing read it.
  const originalChars = text.length;
  const truncated = originalChars > maxChars;
  if (truncated) {
    text = `${text.slice(0, maxChars)}\n\n[... truncated — original length: ${originalChars} chars]`;
  }
  return { text, numPages, isScannedDocument, ocrFailed, truncated, originalChars };
}

module.exports = { pdfToText, pdfToTextWithMeta };
