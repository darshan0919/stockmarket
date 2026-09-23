#!/usr/bin/env node
'use strict';

/**
 * extract_result_text.js — converts the fetched Result / PPT PDFs into
 * layout-preserving text files, deterministically, zero LLM.
 *
 * WHY THIS EXISTS. Step 1's manifest hands back `pdfPaths.Result` /
 * `pdfPaths.PPT` — file paths, not text. Nothing in this pipeline used to
 * turn those into `result.txt`/`ppt.txt` other than an agent running
 * `pdftotext -layout` by hand and reading the output (confirmed during the
 * 2026-09-23 SUPRIYA run — the SKILL.md's old wording, "run each through
 * stock-api/src/utils/pdfUtils.js", was simply wrong: pdfUtils.js is an
 * HTML-rendering helper for building the OUTPUT pdf, it has no PDF-reading
 * code at all). That made column-tabular reading a manual, judgment-free
 * step done by a model each run — exactly what conventions.md §17
 * (Extraction First) says must be a script.
 *
 * This script closes that gap: it is the one place `result.txt`/`ppt.txt`
 * get produced, using `pdfToLayoutTextWithMeta()` (cloud-utils/src/pdfText.js)
 * so multi-column financial tables survive as column-aligned rows — the same
 * property extract_statements.js (Step 2.6) already depends on for BS/CF,
 * and extract_income_statement.js (Step 2) now depends on for the P&L.
 *
 * Heavy-profile rule (preprocessing_truncation_bug guard #1): a `result`
 * filing is read with maxChars: Infinity, always — never the 8000-char
 * short-announcement default. A truncated Result filing would silently drop
 * the P&L table itself.
 *
 * Usage:
 *   node extract_result_text.js \
 *     --result-pdf "$DOCS_DIR/Result.pdf" \
 *     --ppt-pdf "$DOCS_DIR/PPT.pdf" \
 *     --out-dir "$DOCS_DIR"
 *
 * Either --result-pdf or --ppt-pdf may be omitted (Step 1 doesn't guarantee
 * both exist for every filing window). Writes result.txt / ppt.txt into
 * --out-dir and prints a JSON summary to stdout: which files were written,
 * and each source's truncated/ocrFailed/isScannedDocument flags so a caller
 * can decide whether to trust what got written rather than assuming success.
 */

const fs = require('fs');
const path = require('path');
const { pdfToLayoutTextWithMeta } = require('../../../../cloud-utils/src/pdfText.js');

function parseArgs(argv) {
  const out = { resultPdf: null, pptPdf: null, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--result-pdf') out.resultPdf = argv[++i];
    else if (a === '--ppt-pdf') out.pptPdf = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
  }
  return out;
}

async function extractOne(label, pdfPath, outPath) {
  if (!pdfPath) return { label, skipped: true, reason: 'no path supplied' };
  if (!fs.existsSync(pdfPath)) {
    return { label, skipped: true, reason: `file not found: ${pdfPath}` };
  }
  const buf = fs.readFileSync(pdfPath);
  const meta = await pdfToLayoutTextWithMeta(buf, { maxChars: Infinity });
  fs.writeFileSync(outPath, meta.text, 'utf8');
  return {
    label,
    written: outPath,
    chars: meta.originalChars,
    isScannedDocument: meta.isScannedDocument,
    ocrFailed: meta.ocrFailed,
    truncated: meta.truncated, // always false at maxChars: Infinity — kept for shape parity
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outDir) {
    process.stdout.write(JSON.stringify({ error: '--out-dir is required' }) + '\n');
    process.exit(1);
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  const results = await Promise.all([
    extractOne('Result', args.resultPdf, path.join(args.outDir, 'result.txt')),
    extractOne('PPT', args.pptPdf, path.join(args.outDir, 'ppt.txt')),
  ]);

  process.stdout.write(JSON.stringify({ results }, null, 2) + '\n');
}

if (require.main === module) {
  main().catch((err) => {
    process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  });
}

module.exports = { extractOne };
