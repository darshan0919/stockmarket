'use strict';

/**
 * learnystPdfText.js — permanent OCR/text-extraction cache for Learnyst lesson
 * attachment PDFs (skill: ask-soic's "attachments" gap, closed 2026-09-19).
 *
 * Why this exists: `data/assets/learnyst-attachments/*.pdf` (376 files as of
 * 2026-09-19) are local-only downloads (rule §6 — re-fetchable/local source
 * documents are never synced under `data/` as raw files) fetched by
 * `learnystTranscriptRefresh.js`. Their TEXT, once extracted, is exactly the
 * kind of "heavy frequently-read derivable" rule §6 puts in `data/cache/` —
 * extracting it is a one-time cost (many are scanned slide decks needing the
 * `pdftoppm`+`tesseract` OCR path in `@stock/cloud-utils`'s `pdfToTextWithMeta`,
 * which is genuinely slow per page), and every future skill/query that needs
 * an attachment's text (ask-soic, concept-transcript-integrator, or a fresh
 * one-off) gets a file read instead of paying that cost again.
 *
 * Layout: data/cache/learnyst-pdf-text/<sha256(attachmentPath)[0:32]>.json,
 * sharded into 16 hex-keyed JSONL files by StorageService on `data:push` (same
 * mechanism as `pdf-text`/`pdf-text-full` — see StorageService.js's
 * `parseShardedPath`, extended 2026-09-19 to include `learnyst-pdf-text`).
 *
 * Keyed on the ATTACHMENT PATH (e.g.
 * "assets/learnyst-attachments/SOIC-Power_of_Compounding__4__lyst9855.pdf"),
 * not a URL — these are local files with no stable source URL, but the path
 * itself is a stable, unique identifier per `db.hasLearnystAttachment()`'s
 * existing dedup key (`att.src`, the same string `learnystTranscriptRefresh.js`
 * already uses to decide whether to re-download).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { StorageService, pdfToTextWithMeta } = require('@stock/cloud-utils');

/** Below this many extracted characters, treat the PDF as needing OCR review. */
const MIN_TEXT_CHARS = 40;

function sourceHash(attachmentPath) {
  return crypto.createHash('sha256').update(String(attachmentPath)).digest('hex').slice(0, 32);
}

/** Relative (to data/) path StorageService keys and shards on. */
function relCachePath(attachmentPath) {
  return `cache/learnyst-pdf-text/${sourceHash(attachmentPath)}.json`;
}

/** Absolute path — for callers (e.g. ask-soic's search script) that want fs access directly. */
function absCachePath(attachmentPath) {
  return path.join(db.cachePath('learnyst-pdf-text'), `${sourceHash(attachmentPath)}.json`);
}

/** Cached extraction for one attachment, or null on a miss. */
function get(attachmentPath) {
  StorageService.init();
  return StorageService.readJson(relCachePath(attachmentPath));
}

/**
 * Extract (with OCR fallback) + cache the text of one Learnyst attachment PDF.
 * Cache-first: a second call for the same attachment is a file read, zero
 * subprocess spend. Pass `force: true` to re-extract (e.g. after a genuine
 * OCR-quality fix to cloud-utils' pdfText.js).
 *
 * @param {string} attachmentPath - e.g. att.src / attachmentPaths[i], the same
 *   string learnystTranscriptRefresh.js already uses as its dedup key.
 * @param {Object} [opts]
 * @param {boolean} [opts.force]
 * @returns {Promise<{text, numPages, isScannedDocument, ocrFailed, chars, extractedAt}>}
 */
async function extractAndCache(attachmentPath, { force = false } = {}) {
  if (!force) {
    const cached = get(attachmentPath);
    if (cached) return cached;
  }

  const absPdfPath = db.learnystAttachmentPath(path.basename(attachmentPath));
  if (!fs.existsSync(absPdfPath)) {
    return {
      text: '',
      numPages: null,
      isScannedDocument: false,
      ocrFailed: false,
      chars: 0,
      error: `attachment not found on disk: ${absPdfPath}`,
    };
  }

  const buf = fs.readFileSync(absPdfPath);
  const { text, numPages, isScannedDocument, ocrFailed, truncated, originalChars } =
    await pdfToTextWithMeta(buf, { maxChars: Infinity }); // whole document — these are analyst references, not short filings

  const record = {
    attachmentPath,
    attachmentFile: path.basename(attachmentPath),
    text,
    chars: originalChars,
    numPages,
    isScannedDocument: Boolean(isScannedDocument),
    ocrFailed: Boolean(ocrFailed),
    truncated: Boolean(truncated), // should always be false at maxChars:Infinity; kept for schema parity with pdf-text
    thin: originalChars < MIN_TEXT_CHARS,
    extractedAt: new Date().toISOString(),
  };

  StorageService.init();
  await StorageService.saveJson(relCachePath(attachmentPath), record);
  return record;
}

/**
 * Batch-extract every attachment referenced in learnyst-lessons.json that
 * doesn't already have a cache entry. Returns per-file outcomes plus a
 * summary — the shape `scripts/ocrLearnystAttachments.js` prints and the
 * shape ask-soic's SKILL.md references when explaining the OCR cache.
 *
 * @param {string[]} attachmentPaths - deduped list to process
 * @param {Object} [opts]
 * @param {boolean} [opts.force]
 * @param {(done:number, total:number, file:string) => void} [opts.onProgress]
 */
async function extractAllAndCache(attachmentPaths, { force = false, onProgress } = {}) {
  const results = [];
  let done = 0;
  for (const p of attachmentPaths) {
    const alreadyCached = !force && Boolean(get(p));
    const rec = await extractAndCache(p, { force });
    results.push({ attachmentPath: p, alreadyCached, ...rec });
    done += 1;
    if (onProgress) onProgress(done, attachmentPaths.length, p);
  }
  const summary = {
    total: results.length,
    fromCache: results.filter((r) => r.alreadyCached).length,
    newlyExtracted: results.filter((r) => !r.alreadyCached && !r.error).length,
    scanned: results.filter((r) => r.isScannedDocument).length,
    ocrFailed: results.filter((r) => r.ocrFailed).length,
    thin: results.filter((r) => r.thin).length,
    missing: results.filter((r) => r.error).length,
  };
  return { results, summary };
}

module.exports = {
  MIN_TEXT_CHARS,
  sourceHash,
  relCachePath,
  absCachePath,
  get,
  extractAndCache,
  extractAllAndCache,
};
