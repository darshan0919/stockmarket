#!/usr/bin/env node
'use strict';

/**
 * Step 1 of quarterly-result-extractor (post mode): download the TARGET quarter's PPT +
 * Result + Transcript for ONE company, plus the prior quarter's Transcript only when no
 * history pack covers it (`--skip-prior`).
 *
 * The target quarter comes from the company's own document list (lib/resultHistory/period.js
 * `resolveResultMode`): `--quarter YYYYMM` > `--date YYYY-MM-DD` (latest quarter completed as of
 * that date) > the newest filed Result. One `documents()` call decides everything; downloads
 * go through `fetchDocuments` scoped to that exact quarter, so a Q2 run can never pick up a
 * Q1 deck. If the target quarter's Result is not filed yet the manifest says `notYetOut`.
 *
 * Usage:
 *   node fetch_result_documents.js --companyId NSE:SWARAJENG --out-dir /tmp/NSE_SWARAJENG_qra_docs
 *     [--date 2026-10-21 | --quarter 202609] [--skip-prior]
 *
 * Output (stdout, JSON): the manifest — redirect to <out-dir>/manifest.json.
 */
const path = require('path');
const fs = require('fs');
const { loadEnv, argValue, hasFlag } = require('../../../../packages/jobs-runtime/lib/env');
const { fetchDocuments } = require('../../../../stock-api/src/fetchers/documentsFetcher.js');
const {
  resolveResultMode,
  docsBefore,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/period');

/**
 * Download every document of `types` for exactly one quarter.
 * @returns {Promise<Array<Object>>} fetched docs
 */
async function fetchQuarter(companyId, types, yyyymm, outDir) {
  const res = await fetchDocuments(companyId, {
    types,
    startDate: yyyymm,
    endDate: yyyymm,
    lastN: 1,
    outputDir: outDir,
  });
  return res.fetched || [];
}

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const companyId = argValue('--companyId', process.argv) || argValue('--ticker', process.argv);
  const outDir = argValue('--out-dir', process.argv);
  if (!companyId || !outDir) {
    console.error(
      'Usage: fetch_result_documents.js --companyId NSE:X --out-dir <dir> [--date YYYY-MM-DD | --quarter YYYYMM] [--skip-prior]'
    );
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const date = argValue('--date', process.argv);

  const { matched: docList } = await fetchDocuments(companyId, { listOnly: true });
  const resolved = resolveResultMode(docList, {
    targetQuarter: argValue('--quarter', process.argv),
    date,
  });

  const manifest = {
    ticker: companyId,
    companyId,
    date: date || null,
    quarter: resolved.targetQuarter,
    mode: resolved.mode,
    latestFiledQuarter: resolved.latestFiledQuarter,
    found: { PPT: false, Result: false, Transcript: false, PriorTranscript: false },
    transcriptMissing: false,
    pdfPaths: {},
  };

  if (resolved.mode === 'pre') {
    manifest.notYetOut = true;
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  for (const doc of await fetchQuarter(
    companyId,
    ['PPT', 'Result', 'Transcript'],
    resolved.targetQuarter,
    outDir
  )) {
    manifest.found[doc.documentType] = true;
    manifest.pdfPaths[doc.documentType] = doc.path;
  }
  manifest.transcriptMissing = !manifest.found.Transcript;

  if (!hasFlag('--skip-prior', process.argv)) {
    const prior = docsBefore(docList, 'Transcript', resolved.targetQuarter, 1)[0];
    if (prior) {
      const got = await fetchQuarter(
        companyId,
        ['Transcript'],
        String(prior.date),
        path.join(outDir, 'prior')
      );
      if (got[0]) {
        manifest.found.PriorTranscript = true;
        manifest.pdfPaths.PriorTranscript = got[0].path;
      }
    }
  }

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
