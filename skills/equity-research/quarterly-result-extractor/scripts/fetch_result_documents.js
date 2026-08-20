#!/usr/bin/env node
'use strict';

/**
 * Fetches the latest PPT + Result + Transcript (and the prior quarter's
 * Transcript, for narrative-shift comparison) for ONE company, wrapping the
 * same two primitives the old single-skill quarterly-result-analysis Phase 1
 * called inline: `documentsFetcher.js` (fetchDocuments) for PPT/Result, and
 * `get-concall-transcript-url.js` (ConcallTranscriptResolver) for the
 * Transcript, since Stockscans guarantees a Transcript document for every
 * reported quarter now.
 *
 * Usage:
 *   node fetch_result_documents.js --ticker NSE:SWARAJENG --out-dir /tmp/NSE_SWARAJENG_qra_docs
 *
 * Output (stdout, JSON): the manifest — redirect to <out-dir>/manifest.json.
 */
const fs = require('fs');
const path = require('path');
const { fetchDocuments } = require('../../../../stock-api/src/fetchers/documentsFetcher.js');
const {
  ConcallTranscriptResolver,
} = require('../../../../stock-api/bin/get-concall-transcript-url.js');

function parseArgs(argv) {
  const out = { ticker: null, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticker') out.ticker = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ticker || !args.outDir) {
    console.error('Usage: fetch_result_documents.js --ticker NSE:X --out-dir <dir>');
    process.exit(1);
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  const manifest = {
    ticker: args.ticker,
    companyId: args.ticker,
    found: { PPT: false, Result: false, Transcript: false, PriorTranscript: false },
    transcriptMissing: false,
    // PDF paths only -- fetchDocuments downloads PDFs, it does not extract text.
    // Run each path through stock-api/src/utils/pdfUtils.js (the same text
    // extraction every other document-consuming skill uses) before Steps 2/3.
    pdfPaths: {},
  };

  // 1. PPT + Result, latest quarter only. lastN:1 is mandatory here: without it,
  // fetchDocuments returns every historical PPT/Result filing sorted newest-first,
  // and the manifest-building loop below overwrites pdfPaths[type] on each iterate
  // -- last-in-array wins, which is the OLDEST doc, not the latest. (Found + fixed
  // 2026-08-09: was silently returning a 2+ year stale Result/PPT.)
  const ppRes = await fetchDocuments(args.ticker, {
    types: ['PPT', 'Result'],
    lastN: 1,
    outputDir: args.outDir,
  });
  for (const doc of ppRes.fetched || []) {
    manifest.found[doc.documentType] = true;
    manifest.pdfPaths[doc.documentType] = doc.path;
  }

  // 2. Latest Transcript: resolve first (guaranteed to exist post-results)
  const resolver = new ConcallTranscriptResolver();
  let latestQuarter = null;
  try {
    const resolved = await resolver.singleCompanyQuarter(args.ticker);
    if (resolved && !resolved.error) {
      latestQuarter = resolved.quarter;
      // Same last-wins-in-iteration hazard as the PPT/Result fetch above:
      // without lastN:1 this returns every historical Transcript and the
      // loop below keeps the oldest, not the newest.
      const tRes = await fetchDocuments(args.ticker, {
        types: ['Transcript'],
        lastN: 1,
        outputDir: args.outDir,
      });
      for (const doc of tRes.fetched || []) {
        manifest.found.Transcript = true;
        manifest.pdfPaths.Transcript = doc.path;
      }
    } else {
      manifest.transcriptMissing = true;
    }
  } catch (e) {
    manifest.transcriptMissing = true;
  }

  if (!manifest.found.PPT && !manifest.found.Result && manifest.transcriptMissing) {
    manifest.notYetOut = true;
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  // 3. Prior quarter's Transcript (last-n 2) — for narrative-shift comparison.
  // Which entry is "prior" depends on whether step 2 already got the newest
  // quarter: if it did, the second (older) --last-n 2 entry is prior; if
  // step 2 failed (transcriptMissing), the first (newest) --last-n 2 entry
  // IS the prior quarter — don't double-count it as "latest".
  try {
    const priorRes = await fetchDocuments(args.ticker, {
      types: ['Transcript'],
      lastN: 2,
      outputDir: path.join(args.outDir, 'prior'),
    });
    const docs = priorRes.fetched || [];
    const priorDoc = manifest.found.Transcript ? docs[1] : docs[0];
    if (priorDoc) {
      manifest.found.PriorTranscript = true;
      manifest.pdfPaths.PriorTranscript = priorDoc.path;
    }
  } catch (e) {
    // prior transcript is a nice-to-have for narrative-shift; don't fail the fetch over it
  }

  manifest.quarter = latestQuarter;
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
