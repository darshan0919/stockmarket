#!/usr/bin/env node
'use strict';

/**
 * company-financials.js -- historical P&L actuals (12 quarters, ~7 fiscal
 * years, TTM) + comparator baselines for one or many companies, parsed from
 * the Stockscans company page (there is no JSON API for these numbers; see
 * src/analyzers/companyFinancials.js). Deterministic Extraction: no LLM.
 *
 * Usage:
 *   node company-financials.js --companies NSE:AVALON,NSE:IFBIND [--force] [--concurrency 5]
 *   node company-financials.js --companies-file tickers.json --out actuals.json
 *
 *   --companies-file  JSON array of tickers, or of {ticker|companyId: "NSE:X"} objects
 *   --force           bypass the 24h cache (use right after a new result is filed)
 *   --out <path>      write JSON there instead of stdout (stdout then gets a one-line summary)
 *   --job <name>      API-usage attribution (STOCKMARKET_JOB_NAME env wins; conventions.md §21)
 *
 * Output: array, one entry per requested company (input order preserved),
 *   { companyId, ok: true, data: { layout, basis, quarters, years, ttm, baselines, warnings, fromCache } }
 *   { companyId, ok: false, error }
 * A per-company failure never aborts the batch; exit code is non-zero only
 * when every company failed.
 */

const fs = require('fs');
const { loadEnv, argValue, hasFlag } = require('../../packages/jobs-runtime/lib/env.js');
const apiUsageTracker = require('../../packages/jobs-runtime/lib/apiUsageTracker');
const { resolveJobName } = require('../../packages/jobs-runtime/lib/scriptJobName');
const { StockscansClient } = require('../src/clients/StockscansClient.js');
const { getCompanyFinancials } = require('../src/analyzers/companyFinancials.js');
const { mapWithConcurrency } = require('../src/utils/concurrency.js');

function readTickers() {
  const inline = argValue('--companies');
  if (inline)
    return inline
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const file = argValue('--companies-file');
  if (file) {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    return arr.map((x) => (typeof x === 'string' ? x : x.ticker || x.companyId)).filter(Boolean);
  }
  return [];
}

async function main() {
  loadEnv(argValue('--env-file'));
  const tickers = [...new Set(readTickers())];
  if (!tickers.length) {
    console.error(
      'Usage: node company-financials.js (--companies NSE:A,NSE:B | --companies-file f.json) [--force] [--concurrency N] [--out path] [--job name]'
    );
    process.exit(1);
  }

  const jobName = resolveJobName('company-financials');
  const client = new StockscansClient();
  client.setJobName(jobName);
  const force = hasFlag('--force');
  const concurrency = Number(argValue('--concurrency') || 5);

  const settled = await mapWithConcurrency(tickers, concurrency, (t) =>
    getCompanyFinancials(t, { client, force })
  );
  const results = settled.map((s, i) =>
    s.ok
      ? { companyId: tickers[i], ok: true, data: s.value }
      : { companyId: tickers[i], ok: false, error: s.error.message }
  );

  const out = argValue('--out');
  if (out) {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({ out, requested: tickers.length, ok: results.filter((r) => r.ok).length })
    );
  } else {
    console.log(JSON.stringify(results, null, 2));
  }
  await apiUsageTracker.flush(jobName);
  if (results.every((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
