#!/usr/bin/env node
'use strict';

/**
 * soicSetupsRotationSweep.js — SOIC Setups, Breadth, Sector Rotation & Exits Suite.
 *
 * Sequentially executes:
 *   1. Technical setups daily (RS>=90 leaders scanned for E1 base-breakout and E2 pullback)
 *   2. Sector clusters daily (S1 near-high concentration per industry)
 *   3. Sector rotation daily (S3 focus-name concentration and S2 relative strength)
 *   4. Valuation stretch daily (SOIC V1 stretch flag over liquid universe)
 *   5. Exit watch daily (Watchlist exit signals X1-X7)
 *   6. Funnel gaps daily (QoQ earnings gap lists)
 *   7. Signal ledger digest (emails consolidated digest only if new transitions occurred)
 *   8. Data push (idempotent git push)
 */

const { execSync } = require('child_process');
const path = require('path');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');

const rootDir = path.resolve(__dirname, '../..');

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

  // 1. Technical Setups
  suiteResults.technicalSetups = runStep(
    'yarn technical-setups-daily',
    'Technical Setups Daily (E1/E2)',
    { STOCKMARKET_JOB_NAME: 'technical-setups-daily' }
  );

  // 2. Sector Clusters
  suiteResults.sectorClusters = runStep(
    'yarn sector-clusters-daily',
    'Sector Clusters Daily (S1)',
    { STOCKMARKET_JOB_NAME: 'sector-clusters-daily' }
  );

  // 3. Sector Rotation
  suiteResults.sectorRotation = runStep(
    'yarn sector-rotation-daily',
    'Sector Rotation Daily (S2/S3)',
    { STOCKMARKET_JOB_NAME: 'sector-rotation-daily' }
  );

  // 4. Valuation Stretch
  suiteResults.valuationStretch = runStep(
    'yarn valuation-stretch-daily',
    'Valuation Stretch Daily (V1)',
    { STOCKMARKET_JOB_NAME: 'valuation-stretch-daily' }
  );

  // 5. Exit Watch
  suiteResults.exitWatch = runStep('yarn exit-watch-daily', 'Exit Watch Daily (X1-X7)', {
    STOCKMARKET_JOB_NAME: 'exit-watch-daily',
  });

  // 6. Funnel Gaps
  suiteResults.funnelGaps = runStep('yarn funnel-gaps-daily', 'Funnel Gaps Daily', {
    STOCKMARKET_JOB_NAME: 'funnel-gaps-daily',
  });

  // 7. Signal Ledger Digest
  suiteResults.ledgerDigest = runStep(
    `yarn signal-ledger-digest${emailFlag}`,
    'Signal Ledger Digest',
    { STOCKMARKET_JOB_NAME: 'soic-setups-rotation-daily' }
  );

  // 8. Data Push
  if (!noPush) {
    suiteResults.dataPush = runStep('yarn data:push', 'Idempotent Data Push');
  }

  console.log('\n======================================================');
  console.log('✅ SOIC Setups, Rotation & Exits Suite Complete:');
  console.log(JSON.stringify(suiteResults, null, 2));
  console.log('======================================================\n');

  const failedSteps = Object.entries(suiteResults).filter(([_, r]) => !r.ok);
  if (failedSteps.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const jobName = resolveJobName('soic-setups-rotation-daily');
  main()
    .catch((err) => {
      console.error('Fatal error in soicSetupsRotationSweep:', err);
      process.exit(1);
    })
    .finally(() => {
      apiUsageTracker.flush(jobName);
    });
}

module.exports = { main };
