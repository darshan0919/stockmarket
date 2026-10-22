#!/usr/bin/env node
'use strict';

/**
 * soicMacroStructuralSweep.js — SOIC Macro & Structural Supply Signals Suite.
 *
 * Sequentially executes:
 *   1. Market regime daily (Nifty 500 breadth, macro indicators, FII/DII flows -> M1-M4)
 *   2. Liquidity supply daily (Block deal supply spikes, 20-session FII outflow -> L1/L2)
 *   3. Paper supply daily (Block selling, QIP/preferential fundraises in P/E>50 names -> V2)
 *   4. IPO supply daily (IPO 12-18m review window, lock-in expiries, OFS announcements)
 *   5. Signal ledger digest (emails consolidated digest only if new transitions occurred)
 *   6. Data push (idempotent git push)
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

  // 1. Market Regime
  suiteResults.marketRegime = runStep('yarn market-regime-daily', 'Market Regime Daily (M1-M4)', {
    STOCKMARKET_JOB_NAME: 'market-regime-daily',
  });

  // 2. Liquidity Supply
  suiteResults.liquiditySupply = runStep(
    'yarn liquidity-supply-daily',
    'Liquidity Supply Daily (L1-L2)',
    { STOCKMARKET_JOB_NAME: 'liquidity-supply-daily' }
  );

  // 3. Paper Supply
  suiteResults.paperSupply = runStep('yarn paper-supply-daily', 'Paper Supply Daily (V2)', {
    STOCKMARKET_JOB_NAME: 'paper-supply-daily',
  });

  // 4. IPO Supply
  suiteResults.ipoSupply = runStep('yarn ipo-supply-daily', 'IPO Supply Daily', {
    STOCKMARKET_JOB_NAME: 'ipo-supply-daily',
  });

  // 5. Policy Events Absorption (zero-LLM daily check)
  suiteResults.policyEventsAbsorption = runStep(
    'yarn workspace @stock/jobs-runtime policy-events run',
    'Policy Events Daily Price Absorption (P1)',
    { STOCKMARKET_JOB_NAME: 'soic-macro-structural-daily' }
  );

  // 6. Signal Ledger Digest (emails only if transitions since yesterday)
  suiteResults.ledgerDigest = runStep(
    `yarn signal-ledger-digest${emailFlag}`,
    'Signal Ledger Digest',
    { STOCKMARKET_JOB_NAME: 'soic-macro-structural-daily' }
  );

  // 6. Data Push
  if (!noPush) {
    suiteResults.dataPush = runStep('yarn data:push', 'Idempotent Data Push');
  }

  console.log('\n======================================================');
  console.log('✅ SOIC Macro & Structural Suite Complete:');
  console.log(JSON.stringify(suiteResults, null, 2));
  console.log('======================================================\n');

  const failedSteps = Object.entries(suiteResults).filter(([_, r]) => !r.ok);
  if (failedSteps.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const jobName = resolveJobName('soic-macro-structural-daily');
  main()
    .catch((err) => {
      console.error('Fatal error in soicMacroStructuralSweep:', err);
      process.exit(1);
    })
    .finally(() => {
      apiUsageTracker.flush(jobName);
    });
}

module.exports = { main };
