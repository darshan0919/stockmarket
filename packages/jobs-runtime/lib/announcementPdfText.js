'use strict';

/**
 * announcementPdfText.js — extract the text layer from an order-announcement
 * PDF, with a permanent on-disk cache.
 *
 * Why pdfjs-dist and not pdf-parse: `pdf-parse` was tried first for this and
 * "crashed unpredictably" (see docs/ORDER_BOOK_EXTRACTION.md), which is why
 * announcement PDFs went unread for so long and the gap was mistaken for an
 * OCR problem. It isn't one. A live check over every pending filing for
 * NSE:NCC and NSE:RVNL (2026-07-31) found 8/8 carry a real embedded text
 * layer — exchange filings are generated from templates, not scanned. So the
 * cheap, deterministic path works and no rasterise+OCR tier is needed.
 *
 * OCR is therefore deliberately NOT implemented here. If a scanned filing
 * ever shows up it surfaces as `{ scanned: true }` and the caller routes it
 * to the LLM fallback queue rather than silently reporting "no value".
 *
 * Layout: data/cache/announcement-pdf-text/<safeCompanyId>/<ssUrl-key>.json
 * @see {@link docs/ORDER_BOOK_EXTRACTION.md} for the surrounding pipeline.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { safeName } = require('./concallNotesStore');
const { keyFor } = require('./orderAnnouncementStore');

/**
 * Below this many characters a PDF is treated as having no usable text layer.
 * A genuine one-page Reg-30 filing runs 1,100+ chars; the shortest real one
 * observed in the live sample was 1,129. 200 leaves a wide margin while still
 * catching a scan that yields only stray header glyphs.
 */
const MIN_TEXT_CHARS = 200;

function dir(companyId) {
  return path.join(db.cachePath('announcement-pdf-text'), safeName(companyId));
}

function file(companyId, ssUrl, date) {
  return path.join(dir(companyId), `${keyFor(ssUrl, date)}.json`);
}

/** Cached text for one announcement PDF, or null on a miss. */
function get(companyId, ssUrl, date) {
  const f = file(companyId, ssUrl, date);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return null; // corrupt entry — treat as a miss so the caller can refetch
  }
}

function save(companyId, ssUrl, date, record) {
  const d = dir(companyId);
  fs.mkdirSync(d, { recursive: true });
  const f = file(companyId, ssUrl, date);
  const tmp = `${f}.tmp.${process.pid}`;
  fs.writeFileSync(
    tmp,
    JSON.stringify(
      { companyId, ssUrl, date, fetchedAt: new Date().toISOString(), ...record },
      null,
      2
    )
  );
  fs.renameSync(tmp, f);
  db.trackTouched(f);
  return record;
}

/**
 * Pull the text layer out of a PDF buffer, page by page.
 * @param {Buffer} buf
 * @returns {Promise<string>}
 */
async function textFromBuffer(buf) {
  // pdfjs-dist ships ESM only; the legacy build is the CommonJS-friendly one.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  await doc.destroy();
  return pages.join('\n');
}

/**
 * Cache-first text for one announcement PDF. A second call for the same
 * filing makes zero network calls — the text layer of a published filing is
 * immutable, so it is only ever fetched and parsed once.
 *
 * @param {string} companyId
 * @param {string} ssUrl - bare Stockscans document filename
 * @param {string} date - YYYY-MM-DD
 * @param {Object} [deps]
 * @param {Object} [deps.client] - injectable Stockscans client (tests)
 * @returns {Promise<{text: string, chars: number, scanned: boolean, error?: string}>}
 */
async function fetchText(companyId, ssUrl, date, { client } = {}) {
  const cached = get(companyId, ssUrl, date);
  if (cached) return cached;

  const stockscans = client || require('@stock/api').stockscans;
  let record;
  try {
    const buf = await stockscans.fetchPdf(stockscans.s3PdfUrl(ssUrl), 45000);
    const text = await textFromBuffer(buf);
    const chars = text.replace(/\s+/g, ' ').trim().length;
    record = { text, chars, scanned: chars < MIN_TEXT_CHARS };
  } catch (e) {
    // A fetch/parse failure is NOT cached as "no text" — that would
    // permanently poison the record for a transient network blip. Return it
    // uncached so the next run retries.
    return { text: '', chars: 0, scanned: false, error: e.message };
  }
  save(companyId, ssUrl, date, record);
  return record;
}

module.exports = { fetchText, textFromBuffer, get, save, file, MIN_TEXT_CHARS };
