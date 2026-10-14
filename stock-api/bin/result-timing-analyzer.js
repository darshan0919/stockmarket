#!/usr/bin/env node
'use strict';

/**
 * result-timing-analyzer.js -- Analyzes historical financial results declaration
 * timings, market session distribution (market hours vs post-market), day-of-week
 * preferences, and reporting turnaround for any listed company using official
 * exchange data (NSE primary, BSE fallback).
 *
 * Usage:
 *   node bin/result-timing-analyzer.js --company MRPL [--quarters 12] [--json]
 *   node bin/result-timing-analyzer.js --company NSE:TCS --out result_timing.json
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, argValue, hasFlag } = require('../../packages/jobs-runtime/lib/env.js');
const {
  analyzeResultTimings,
  formatSummaryTable,
} = require('../src/analyzers/resultTimingAnalyzer');

async function main() {
  loadEnv(argValue('--env-file'));

  const company = argValue('--company') || argValue('--symbol') || process.argv[2];
  if (!company || company.startsWith('-')) {
    console.error(
      'Usage: yarn workspace @stock/api result-timing-analyzer --company <SYMBOL> [--quarters 12] [--json] [--out <path>]'
    );
    console.error('Examples:');
    console.error('  yarn workspace @stock/api result-timing-analyzer --company MRPL');
    console.error(
      '  yarn workspace @stock/api result-timing-analyzer --company NSE:TCS --quarters 16'
    );
    process.exit(1);
  }

  const quartersArg = argValue('--quarters');
  const quarters = quartersArg ? parseInt(quartersArg, 10) : 12;
  const isJson = hasFlag('--json');
  const outPath = argValue('--out');

  try {
    const dto = await analyzeResultTimings(company, { quarters });

    if (outPath) {
      const fullPath = path.resolve(process.cwd(), outPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(dto, null, 2), 'utf8');
      console.log(`Saved result timing analysis to ${fullPath}`);
    }

    if (isJson) {
      console.log(JSON.stringify(dto, null, 2));
    } else {
      console.log(formatSummaryTable(dto));
    }
  } catch (err) {
    console.error(`Error analyzing result timings for ${company}:`, err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
