#!/usr/bin/env node
'use strict';

/**
 * compute-pat-bridge.js -- Deterministic PAT-to-EPS accretion & dilution analyzer CLI.
 *
 * Implements the financial arithmetic for post-close-scan-insights Rule 4b.
 * Prevents LLM arithmetic hallucinations and rounding errors.
 *
 * Usage:
 *   node bin/compute-pat-bridge.js '{"raiseAmount":800,"debtRepaid":600,"interestRate":0.11,"currentPat":300,"currentShares":20,"issuePrice":310}'
 *   node bin/compute-pat-bridge.js --raise-amount 800 --debt-repaid 600 --interest-rate 11 --current-pat 300 --current-shares 20 --issue-price 310
 *   node bin/compute-pat-bridge.js --file inputs.json [--human]
 */

const fs = require('fs');
const { computePatBridge } = require('../src/analyzers/patBridge.js');

function parseArgs() {
  const argv = process.argv.slice(2);
  let inputs = {};
  let human = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--human') {
      human = true;
    } else if (arg === '--file' && argv[i + 1]) {
      const content = fs.readFileSync(argv[++i], 'utf8');
      inputs = { ...inputs, ...JSON.parse(content) };
    } else if (arg.startsWith('{')) {
      try {
        inputs = { ...inputs, ...JSON.parse(arg) };
      } catch (err) {
        console.error('Failed to parse inline JSON argument:', err.message);
        process.exit(1);
      }
    } else if (arg === '--raise-amount' && argv[i + 1]) {
      inputs.raiseAmount = Number(argv[++i]);
    } else if (arg === '--debt-repaid' && argv[i + 1]) {
      inputs.debtRepaid = Number(argv[++i]);
    } else if (arg === '--interest-rate' && argv[i + 1]) {
      inputs.interestRate = Number(argv[++i]);
    } else if (arg === '--tax-rate' && argv[i + 1]) {
      inputs.taxRate = Number(argv[++i]);
    } else if (arg === '--issue-price' && argv[i + 1]) {
      inputs.issuePrice = Number(argv[++i]);
    } else if (arg === '--current-pat' && argv[i + 1]) {
      inputs.currentPat = Number(argv[++i]);
    } else if (arg === '--current-shares' && argv[i + 1]) {
      inputs.currentShares = Number(argv[++i]);
    } else if (arg === '--new-shares' && argv[i + 1]) {
      inputs.newShares = Number(argv[++i]);
    } else if (arg === '--incremental-depreciation' && argv[i + 1]) {
      inputs.incrementalDepreciation = Number(argv[++i]);
    } else if (arg === '--operating-contribution' && argv[i + 1]) {
      inputs.operatingContribution = Number(argv[++i]);
    }
  }

  return { inputs, human };
}

function main() {
  const { inputs, human } = parseArgs();
  const res = computePatBridge(inputs);
  if (human) {
    console.log(res.auditSummary);
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
}

if (require.main === module) {
  main();
}
