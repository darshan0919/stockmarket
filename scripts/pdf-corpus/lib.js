'use strict';

/**
 * Shared helpers for the PDF corpus tooling (docs/PDF_OCR_EXTRACTION_PLAN.md section 3c).
 * Everything is keyed by explicit arguments: no "current run" globals, so several chunks or
 * processes can run side by side. Corpus files live under data/pdf-corpus/ (git-ignored).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CORPUS_DIR = process.env.PDF_CORPUS_DIR || path.join(ROOT, 'data', 'pdf-corpus');

const p = (...parts) => path.join(CORPUS_DIR, ...parts);

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Read a JSONL file into an array; missing file -> []. Bad lines are skipped, never fatal. */
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch (_) {
      /* a torn last line from an interrupted chunk */
    }
  }
  return out;
}

/** Append rows as whole lines in ONE write so an interrupted chunk cannot leave half a row mid-file. */
function appendJsonl(file, rows) {
  if (!rows.length) return;
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function writeJsonAtomic(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Stable 0-99 bucket from a string (company-level split: the same company always lands in the same split). */
function bucket(str) {
  return (
    parseInt(crypto.createHash('sha1').update(String(str)).digest('hex').slice(0, 8), 16) % 100
  );
}

/** train 70 / dev 15 / test 15, by company, stable as the corpus grows. */
function splitOf(companyId) {
  const b = bucket(companyId);
  return b < 70 ? 'train' : b < 85 ? 'dev' : 'test';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run `fn` over `items` with at most `n` in flight; stops taking new items after `deadline` (ms epoch). */
async function pool(items, n, fn, deadline = Infinity) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length && Date.now() < deadline) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
  return i; // items started
}

/**
 * Classify a PDF as text-layer / scanned / hybrid from its own text layer (poppler, no OCR).
 * A page counts as "text" when it yields at least MIN_CHARS characters. Returns null if poppler fails.
 */
const MIN_CHARS = 40;
function classifyPdf(file) {
  let pages = 0;
  try {
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8', timeout: 20000 });
    pages = Number((/^Pages:\s+(\d+)/m.exec(info) || [])[1] || 0);
  } catch (_) {
    return null;
  }
  if (!pages) return null;
  let text;
  try {
    text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (_) {
    return { pages, form: 'unreadable', textPages: 0, chars: 0 };
  }
  const perPage = text.split('\f');
  if (perPage.length && !perPage[perPage.length - 1].trim()) perPage.pop();
  const textPages = perPage.filter((t) => t.replace(/\s+/g, '').length >= MIN_CHARS).length;
  const share = textPages / pages;
  const form = share >= 0.9 ? 'text' : share <= 0.1 ? 'scanned' : 'hybrid';
  return { pages, textPages, form, chars: text.length };
}

const monthEnd = (yyyymm) => {
  const y = Number(String(yyyymm).slice(0, 4));
  const m = Number(String(yyyymm).slice(4, 6));
  if (!y || !m) return null;
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

module.exports = {
  ROOT,
  CORPUS_DIR,
  p,
  ensureDir,
  readJsonl,
  appendJsonl,
  writeJsonAtomic,
  sha256,
  bucket,
  splitOf,
  sleep,
  pool,
  classifyPdf,
  monthEnd,
};
