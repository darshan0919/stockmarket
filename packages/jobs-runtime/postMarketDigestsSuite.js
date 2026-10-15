#!/usr/bin/env node
'use strict';

/**
 * postMarketDigestsSuite.js — Post-Market Watchlist Sync, Company Master Sync & Daily Digests Suite.
 *
 * Sequentially executes:
 *   1. Watchlist updater (Near Highs, Upcoming Results, RS watchlists)
 *   2. Company master sync (Stockscans universe + Kite instruments reconciliation)
 *   3. Deals digest (Bulk, Block, SAST Reg 29, Insider PIT trades -> emails Deals report)
 *   4. Daily gainers digest (Top daily gainers by sector/industry -> emails Gainers report)
 *   5. Near highs digest (Stocks within 5% of 52W high -> emails Near Highs report)
 *   6. Data push (idempotent git push of updated data caches)
 *
 * Each digest preserves its own HTML email delivery and JSON DTO output.
 */

const { execSync } = require('child_process');
const path = require('path');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');

const rootDir = path.resolve(__dirname, '../..');

/**
 * Runs a command and buffers output, printing step header.
 * @param {string} cmd
 * @param {string} stepName
 * @param {Record<string, string>} [extraEnv]
 */
function runStep(cmd, stepName, extraEnv = {}) {
  console.log(`\n======================================================`);
  console.log(`▶ Running Step: ${stepName}`);
  console.log(`  Command: ${cmd}`);
  console.log(`======================================================`);
  try {
    execSync(cmd, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    return { ok: true };
  } catch (err) {
    console.error(`❌ Step failed: ${stepName}`, err.message);
    return { ok: false, error: err.message };
  }
}

async function main() {
  loadEnv(argValue('--env-file'));
  const suiteResults = {};
  const noPush = process.argv.includes('--no-push');
  const noEmail = process.argv.includes('--no-email');
  const emailFlag = noEmail ? ' --no-email' : '';

  // 1. Post-Market Watchlist Sync
  suiteResults.watchlistUpdater = runStep('yarn watchlist-updater', 'Post-Market Watchlist Sync', {
    STOCKMARKET_JOB_NAME: 'watchlist-sync-stockmarket',
  });

  // 2. Company Master Sync
  suiteResults.companyMasterSync = runStep('yarn company-master-sync', 'Company Master Sync', {
    STOCKMARKET_JOB_NAME: 'daily-company-master-sync',
  });

  // 3. Deals Digest (sends its own email)
  suiteResults.dealsDigest = runStep(
    `yarn deals-digest --job daily-deals-digest${emailFlag}`,
    'Daily Deals Digest',
    { STOCKMARKET_JOB_NAME: 'daily-deals-digest' }
  );

  // 4. Daily Gainers Digest (sends its own email)
  suiteResults.gainersDigest = runStep(
    `yarn daily-gainers-digest${emailFlag}`,
    'Daily Gainers Digest',
    { STOCKMARKET_JOB_NAME: 'daily-gainers-digest' }
  );

  // 5. Near Highs Digest (sends its own email)
  suiteResults.nearHighsDigest = runStep(
    `yarn near-highs-digest${emailFlag}`,
    'Near Highs Digest',
    { STOCKMARKET_JOB_NAME: 'near-highs-digest' }
  );

  // 6. Data Push
  if (!noPush) {
    suiteResults.dataPush = runStep('yarn data:push', 'Idempotent Data Push');
  }

  console.log('\n======================================================');
  console.log('✅ Post-Market Digests Suite Run Complete:');
  console.log(JSON.stringify(suiteResults, null, 2));
  console.log('======================================================\n');

  const failedSteps = Object.entries(suiteResults).filter(([_, r]) => !r.ok);
  if (failedSteps.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const jobName = resolveJobName('post-market-digests-suite');
  main()
    .catch((err) => {
      console.error('Fatal error in postMarketDigestsSuite:', err);
      process.exit(1);
    })
    .finally(() => {
      apiUsageTracker.printSummary(jobName);
    });
}

module.exports = { main };
