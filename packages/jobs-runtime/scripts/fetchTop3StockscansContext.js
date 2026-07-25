#!/usr/bin/env node
'use strict';

/**
 * fetchTop3StockscansContext.js — companion to gainersClassifier.js's Step 3.5
 * (see skills/equity-research/gainers-signal/SKILL.md).
 *
 * Reads the top-3 context seed (data/runs/gainers_top3_context_{YYYYMMDD}.json,
 * written by gainersClassifier.js) and enriches each of the 3 companies in
 * place with live Stockscans research context (growth catalysts, business
 * overview, latest concall notes) via lib/stockscansContext.js.
 *
 * Kept separate from gainersClassifier.js on purpose: that file is
 * deterministic/no-external-API by design (see its header comment) and runs
 * for the full ~40-80 daily signals; this one makes live network calls and is
 * only ever needed for the 3 companies getting a briefing report.
 *
 * Usage: node scripts/fetchTop3StockscansContext.js [YYYYMMDD] [--env-file <path>]
 *   (default date: the most recent gainers_top3_context_*.json on disk)
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, argValue } = require('../lib/env');
loadEnv(argValue('--env-file'));
const db = require('../lib/db');
const { fetchStockscansContext } = require('../lib/stockscansContext');

function resolveSeedFile(runsDir) {
  const dateArg = process.argv[2] && /^\d{8}$/.test(process.argv[2]) ? process.argv[2] : null;
  if (dateArg) return path.join(runsDir, `gainers_top3_context_${dateArg}.json`);
  const files = fs.existsSync(runsDir)
    ? fs
        .readdirSync(runsDir)
        .filter((f) => /^gainers_top3_context_\d{8}\.json$/.test(f))
        .sort()
    : [];
  if (!files.length) {
    throw new Error(
      `No gainers_top3_context_*.json in ${runsDir} — run gainersClassifier.js (Step 2) first.`
    );
  }
  return path.join(runsDir, files[files.length - 1]);
}

async function main() {
  const runsDir = path.join(db.dataRoot(), 'runs');
  const file = resolveSeedFile(runsDir);
  if (!fs.existsSync(file)) throw new Error(`Seed file not found: ${file}`);

  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const companies = seed.companies || [];
  for (const c of companies) {
    process.stderr.write(`[enrich] fetching Stockscans context for ${c.companyId}...\n`);
    c.stockscans = await fetchStockscansContext(c.companyId);
  }
  fs.writeFileSync(file, JSON.stringify(seed, null, 2));

  process.stdout.write(
    `${JSON.stringify(
      {
        file: path.basename(file),
        companies: companies.map((c) => ({
          companyId: c.companyId,
          fromCache: c.stockscans.fromCache,
          hasGrowthCatalysts: !!c.stockscans.growthCatalysts,
          hasBusinessOverview: !!c.stockscans.businessOverview,
          hasConcallNotes: !!c.stockscans.concallNotes,
          errors: c.stockscans.errors,
        })),
      },
      null,
      2
    )}\n`
  );
}

module.exports = { main, resolveSeedFile };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
