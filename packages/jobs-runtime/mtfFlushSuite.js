#!/usr/bin/env node
'use strict';

/**
 * mtfFlushSuite.js — MTF Flush Trading Suite.
 *
 * Sequentially executes:
 *   1. MTF flush daily (Scans today's new MTF flush entries, scores them, and alerts new signals)
 *   2. MTF flush recovery (Verifies whether price recovery occurred for last 7 days of signals)
 *   3. MTF flush outcomes (Tracks realised 5/10/20-session returns as signals mature)
 *   4. Data push (idempotent git push)
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

  // 1. MTF Flush Daily
  suiteResults.mtfFlushDaily = runStep('yarn mtf-flush-daily', 'MTF Flush Daily', {
    STOCKMARKET_JOB_NAME: 'mtf-flush-daily',
  });

  // 2. MTF Flush Recovery
  suiteResults.mtfFlushRecovery = runStep(
    'yarn mtf-flush-recovery',
    'MTF Flush Recovery (7-Day Check)',
    { STOCKMARKET_JOB_NAME: 'mtf-flush-recovery' }
  );

  // 3. MTF Flush Outcomes
  suiteResults.mtfFlushOutcomes = runStep(
    'yarn mtf-flush-outcomes',
    'MTF Flush Outcomes (Realised Returns)',
    { STOCKMARKET_JOB_NAME: 'mtf-flush-outcomes' }
  );

  // 4. Data Push
  if (!noPush) {
    suiteResults.dataPush = runStep('yarn data:push', 'Idempotent Data Push');
  }

  console.log('\n======================================================');
  console.log('✅ MTF Flush Suite Complete:');
  console.log(JSON.stringify(suiteResults, null, 2));
  console.log('======================================================\n');

  const failedSteps = Object.entries(suiteResults).filter(([_, r]) => !r.ok);
  if (failedSteps.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const jobName = resolveJobName('mtf-flush-suite-daily');
  main()
    .catch((err) => {
      console.error('Fatal error in mtfFlushSuite:', err);
      process.exit(1);
    })
    .finally(() => {
      apiUsageTracker.flush(jobName);
    });
}

module.exports = { main };
