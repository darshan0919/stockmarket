'use strict';

/**
 * ocrLearnystAttachments.js — batch OCR/text-extract every Learnyst lesson
 * attachment PDF and persist the result in the reusable `learnyst-pdf-text`
 * cache (see lib/learnystPdfText.js for the store's rationale/layout).
 *
 * Run via: yarn learnyst-ocr-attachments [--force] [--limit N]
 *
 * Extraction pass only (conventions.md §17) — this script does no reasoning,
 * it just fetches the source (local file), runs the existing OCR/text-layer
 * pipeline (@stock/cloud-utils' pdfToTextWithMeta, which already shells out to
 * pdftoppm+tesseract for scanned pages), and writes the cache entry. Any skill
 * reading the cached text afterward is where judgment/synthesis happens.
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { extractAllAndCache } = require('../lib/learnystPdfText');

function argValue(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  return argv[i + 1];
}

/**
 * Read-only metadata scan — deliberately NOT going through db.js's
 * find()/collection machinery (that's for writes needing envelope/locking
 * semantics). learnyst-lessons.json is read directly here, the same way
 * ask-soic's own search_soic.py already does for this exact file.
 */
function attachmentPathsFromLessons({ maxSizeBytes = null } = {}) {
  const metaPath = db.collectionFile('learnyst-lessons');
  const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const lessons = Object.values(raw);
  const paths = new Set();
  for (const l of lessons) {
    if (l.hasAttachments && Array.isArray(l.attachmentPaths)) {
      for (const p of l.attachmentPaths) paths.add(p);
    }
  }
  let out = [...paths].sort();
  if (maxSizeBytes != null) {
    const skipped = [];
    out = out.filter((p) => {
      const abs = db.learnystAttachmentPath(path.basename(p));
      try {
        const size = fs.statSync(abs).size;
        if (size > maxSizeBytes) {
          skipped.push({ path: p, sizeMB: Math.round(size / 1024 / 1024) });
          return false;
        }
        return true;
      } catch (_) {
        return true; // let extractAllAndCache report the missing-file case
      }
    });
    if (skipped.length) {
      console.log(`Skipping ${skipped.length} attachment(s) over the --max-size-mb cap:`);
      for (const s of skipped) console.log(`  - ${s.path} (${s.sizeMB} MB)`);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const limitArg = argValue(argv, '--limit', null);
  const limit = limitArg ? parseInt(limitArg, 10) : null;
  const offsetArg = argValue(argv, '--offset', '0');
  const offset = parseInt(offsetArg, 10) || 0;
  const maxSizeMbArg = argValue(argv, '--max-size-mb', null);
  const maxSizeBytes = maxSizeMbArg ? parseFloat(maxSizeMbArg) * 1024 * 1024 : null;

  let attachmentPaths = attachmentPathsFromLessons({ maxSizeBytes });
  attachmentPaths = attachmentPaths.slice(offset);
  if (limit) attachmentPaths = attachmentPaths.slice(0, limit);

  console.log(
    `Extracting text for ${attachmentPaths.length} Learnyst attachment PDF(s)` +
      (force ? ' (--force: re-extracting even if cached)' : ' (cache-first)') +
      '...'
  );

  const { results, summary } = await extractAllAndCache(attachmentPaths, {
    force,
    onProgress: (done, total, file) => {
      if (done % 25 === 0 || done === total) {
        console.log(`  [${done}/${total}] ${path.basename(file)}`);
      }
    },
  });

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  const errored = results.filter((r) => r.error);
  if (errored.length) {
    console.log('\nMissing/errored attachments (not on disk locally):');
    for (const r of errored) console.log(`  - ${r.attachmentPath}: ${r.error}`);
  }

  console.log(
    `\nCache: data/cache/learnyst-pdf-text/ (${summary.newlyExtracted} new, ${summary.fromCache} already cached).`
  );
  console.log('Run `yarn data:push` to sync the new cache entries to Drive.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
