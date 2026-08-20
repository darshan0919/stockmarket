#!/usr/bin/env node
'use strict';

/**
 * monthly-sales-tracker / run.js
 *
 * Master orchestrator: download → extract → predict → render
 *
 * Usage:
 *   node run.js --ticker NSE:TMPV
 *   node run.js --ticker NSE:TMCV
 *   node run.js --ticker NSE:TMPV --announcements ./announcements.json
 *   node run.js --ticker NSE:TMPV --skip-download    (if PDFs already present)
 *   node run.js --ticker NSE:TMPV --exclude-outliers
 *   node run.js --ticker NSE:TMPV --open             (open HTML on finish)
 *
 * Steps:
 *  1. download-sales-pdfs.js   — fetch PDFs from Stockscans
 *  2. extract-sales-data.py    — parse PDFs, extract unit series
 *  3. predict-financials.js    — OLS regression + July standalone prediction
 *  4. render-report.js         — Chart.js HTML report
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL_DIR = __dirname;

// ── Helpers ───────────────────────────────────────────────────────────────────
function step(n, label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Step ${n}/4 : ${label}`);
  console.log('─'.repeat(60));
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || REPO_ROOT,
    env: { ...process.env },
  });
  if (result.status !== 0) {
    console.error(`\n✗ Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help')) {
    console.log(`
Monthly Sales Tracker — Full Pipeline

Usage:
  node run.js --ticker NSE:TMPV [options]

Options:
  --ticker <T>               Required. E.g. NSE:TMPV, NSE:TMCV
  --announcements <f.json>   Pre-supplied announcement JSON (skips API fetch)
  --skip-download            Skip step 1 (PDFs already in place)
  --exclude-outliers         Exclude flagged outlier quarters from regression
  --open                     Auto-open the HTML report when done
  --help                     Show this help
`);
    process.exit(0);
  }

  const tickerIdx = argv.indexOf('--ticker');
  if (tickerIdx === -1) {
    console.error('Error: --ticker is required');
    process.exit(1);
  }
  const ticker = argv[tickerIdx + 1];
  const skipDownload = argv.includes('--skip-download');
  const excludeOutliers = argv.includes('--exclude-outliers');
  const doOpen = argv.includes('--open');
  const annIdx = argv.indexOf('--announcements');
  const annFile = annIdx !== -1 ? argv[annIdx + 1] : null;

  const safeTicker = ticker.replace(/[^A-Za-z0-9]+/g, '_');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Monthly Sales Tracker — ${ticker.padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const t0 = Date.now();

  // ── Step 1: Download PDFs ─────────────────────────────────────────────────
  if (skipDownload) {
    console.log('\n  Step 1/4 : Download  [SKIPPED — --skip-download]');
  } else {
    step(1, 'Download monthly sales PDFs');
    const dlArgs = ['--ticker', ticker];
    if (annFile) dlArgs.push('--announcements', annFile);
    run('node', [path.join(SKILL_DIR, 'download-sales-pdfs.js'), ...dlArgs]);
  }

  // ── Step 2: Extract data from PDFs ────────────────────────────────────────
  step(2, 'Extract unit sales from PDFs');
  const pyExe = process.platform === 'win32' ? 'python' : 'python3';
  run(pyExe, [path.join(SKILL_DIR, 'extract-sales-data.py'), '--ticker', ticker]);

  // ── Step 3: Predict financials ────────────────────────────────────────────
  step(3, 'OLS regression + standalone monthly prediction');
  const predArgs = ['--ticker', ticker];
  if (excludeOutliers) predArgs.push('--exclude-outliers');
  run('node', [path.join(SKILL_DIR, 'predict-financials.js'), ...predArgs]);

  // ── Step 4: Render HTML report ────────────────────────────────────────────
  step(4, 'Render interactive HTML report');
  const renderArgs = ['--ticker', ticker];
  if (doOpen) renderArgs.push('--open');
  run('node', [path.join(SKILL_DIR, 'render-report.js'), ...renderArgs]);

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const outDir = path.join(REPO_ROOT, 'data', 'assets', 'monthly-sales-tracker');
  const reports = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).filter((f) => f.startsWith(safeTicker) && f.endsWith('.html'))
    : [];
  const latestReport = reports.sort().reverse()[0];

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  ✅ Complete in ${elapsed}s`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  if (latestReport) {
    console.log(`\n   📊 Report: ${path.join(outDir, latestReport)}`);
  }
  console.log('\n  To run for TMCV:');
  console.log('    node run.js --ticker NSE:TMCV');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
