#!/usr/bin/env node
'use strict';

/**
 * Step 1 (deterministic, no LLM) for guidance-document-fetcher.
 *
 * For each company, checks which of {Transcript, PPT, Result} exist for the
 * target quarter and downloads whichever do, converting each to plain text
 * via `pdftotext`. This is the ONLY fetch step in the pipeline -- it always
 * tries every configured document type per company (never conditionally
 * skips PPT because a transcript was found, or vice versa); downstream
 * skills decide how to weigh multiple sources, this script's only job is
 * "get everything that exists onto disk as text".
 *
 * No LLM involvement anywhere in this script -- pure API calls, file I/O,
 * and a system `pdftotext` call.
 *
 * Usage:
 *   node fetch_guidance_documents.js --tickers-file companies.json \
 *     --types Transcript,PPT,Result --out-dir /tmp/guidance_docs
 *
 *   node fetch_guidance_documents.js --tickers NSE:A,NSE:B --quarter Q4FY26 \
 *     --out-dir /tmp/guidance_docs
 *
 * companies.json (for --tickers-file): [{"ticker":"NSE:A","quarter":"Q4FY26"}, ...]
 * `quarter` per-entry is optional; omitted entries use `latestCompletedQuarter()`.
 *
 * Output (stdout): JSON array, one entry per ticker:
 *   {
 *     ticker, quarter,
 *     found: { Transcript: true, PPT: true, Result: false },
 *     textPaths: { Transcript: "/tmp/.../NSE_A_Transcript_202603.txt", PPT: "..." },
 *     retriedPriorQuarter: false
 *   }
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { StockscansClient } = require('../../../../stock-api/src/clients/StockscansClient.js');
const { fetchDocuments } = require('../../../../stock-api/src/fetchers/documentsFetcher.js');
const { latestCompletedQuarter, parseQuarterString } = require('../../../../stock-api/src/utils/fiscalQuarter.js');

const DEFAULT_TYPES = ['Transcript', 'PPT', 'Result'];

function parseArgs(argv) {
  const out = { tickers: null, tickersFile: null, quarter: null, types: DEFAULT_TYPES, outDir: '/tmp/guidance_docs' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tickers') out.tickers = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--tickers-file') out.tickersFile = argv[++i];
    else if (a === '--quarter') out.quarter = argv[++i];
    else if (a === '--types') out.types = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--out-dir') out.outDir = argv[++i];
  }
  return out;
}

function safeName(ticker) {
  return ticker.replace(/[:\-]/g, '_');
}

async function findAndFetchOne(client, ticker, quarterYyyymm, types, outDir) {
  const { documents } = await client.documents(ticker);
  const found = {};
  const matches = {};
  for (const t of types) {
    const hit = (documents || []).find((d) => d.documentType === t && d.date === quarterYyyymm && d.ssUrl);
    found[t] = !!hit;
    if (hit) matches[t] = hit;
  }
  const anyFound = Object.values(found).some(Boolean);
  if (!anyFound) return { found, textPaths: {} };

  const tickerDir = path.join(outDir, safeName(ticker));
  fs.mkdirSync(tickerDir, { recursive: true });

  const typesToFetch = Object.keys(matches);
  const res = await fetchDocuments(ticker, {
    types: typesToFetch,
    startDate: quarterYyyymm,
    endDate: quarterYyyymm,
    outputDir: tickerDir,
  });

  const textPaths = {};
  for (const doc of res.fetched || []) {
    const txtPath = doc.path.replace(/\.pdf$/i, '.txt');
    try {
      execSync(`pdftotext -layout "${doc.path}" "${txtPath}"`);
      textPaths[doc.documentType] = txtPath;
    } catch (e) {
      // pdftotext failure is a real gap -- surface it, don't silently drop the type.
      textPaths[doc.documentType] = null;
    }
  }
  return { found, textPaths };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tickers && !args.tickersFile) {
    console.error('Usage: fetch_guidance_documents.js (--tickers NSE:A,NSE:B | --tickers-file companies.json) [--quarter Q4FY26] [--types Transcript,PPT,Result] [--out-dir <dir>]');
    process.exit(1);
  }

  let entries;
  if (args.tickersFile) {
    entries = JSON.parse(fs.readFileSync(args.tickersFile, 'utf8'));
  } else {
    entries = args.tickers.map((t) => ({ ticker: t, quarter: args.quarter || null }));
  }

  const client = new StockscansClient();
  await client.validateAuth();

  const latest = latestCompletedQuarter();
  const results = [];

  for (const entry of entries) {
    const usedDefault = !entry.quarter;
    let quarter = entry.quarter ? parseQuarterString(entry.quarter) : latest;
    let { found, textPaths } = await findAndFetchOne(client, entry.ticker, quarter.yyyymm, args.types, args.outDir);
    let retriedPriorQuarter = false;

    // If nothing at all was found AND the quarter was defaulted (not
    // explicitly requested), the default "latest completed quarter" may
    // point at a quarter nobody has reported yet (e.g. an "upcoming
    // results" watchlist) -- retry once against the PRIOR completed
    // quarter before giving up. Still zero-LLM, just a second script call.
    if (usedDefault && !Object.values(found).some(Boolean)) {
      const priorYear = quarter.fiscalPeriod === 'Q1' ? quarter.fiscalYear - 1 : quarter.fiscalYear;
      const priorPeriod = { Q1: 'Q4', Q2: 'Q1', Q3: 'Q2', Q4: 'Q3' }[quarter.fiscalPeriod];
      const priorStr = `${priorPeriod}FY${String(priorYear).slice(-2)}`;
      try {
        const priorQuarter = parseQuarterString(priorStr);
        const retry = await findAndFetchOne(client, entry.ticker, priorQuarter.yyyymm, args.types, args.outDir);
        if (Object.values(retry.found).some(Boolean)) {
          found = retry.found;
          textPaths = retry.textPaths;
          quarter = priorQuarter;
          retriedPriorQuarter = true;
        }
      } catch (e) {
        // leave as the original (empty) result if the prior-quarter string doesn't parse
      }
    }

    results.push({
      ticker: entry.ticker,
      quarter: `${quarter.fiscalPeriod}FY${String(quarter.fiscalYear).slice(-2)}`,
      quarterYyyymm: quarter.yyyymm,
      found,
      textPaths,
      retriedPriorQuarter,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', error: err.message }, null, 2));
  process.exit(1);
});
