#!/usr/bin/env node
'use strict';

/**
 * sync-company-sector-industry.js
 *
 * NOTE: This job has been combined into the daily company-master-sync job
 * (packages/jobs-runtime/companyMasterSync.js) which runs daily at 10:00 PM.
 * Prefer running:
 *   yarn company-master-sync
 *
 * This wrapper is maintained for backward compatibility.
 */

const { loadEnv, argValue, hasFlag } = require('../../packages/jobs-runtime/lib/env.js');
const {
  syncStockscansCompanies,
  fetchAllCompanies,
  normalizeRow,
  extractTable,
  scanPayload,
  withRateLimitRetry,
  COL,
} = require('../../packages/jobs-runtime/lib/stockscansCompanySync.js');

async function main() {
  loadEnv(argValue('--env-file'));
  console.error(
    '[sync-company-sector-industry] Note: This script is now integrated into "yarn company-master-sync".'
  );

  const dryRun = hasFlag('--dry-run');
  const resetCache = hasFlag('--reset-cache');
  const concurrency = Number(argValue('--concurrency') || 1);
  const pageDelayMs = Number(argValue('--page-delay-ms') || 5000);
  const maxPages = Number(argValue('--max-pages') || Infinity);

  const summary = await syncStockscansCompanies({
    dryRun,
    resetCache,
    concurrency,
    pageDelayMs,
    maxPages,
    log: (msg) => console.error(`[sync-company-sector-industry] ${msg}`),
  });

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = {
  syncStockscansCompanies,
  fetchAllCompanies,
  normalizeRow,
  extractTable,
  scanPayload,
  withRateLimitRetry,
  main,
  COL,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
