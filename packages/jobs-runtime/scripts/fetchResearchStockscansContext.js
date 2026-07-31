#!/usr/bin/env node
'use strict';

/**
 * fetchResearchStockscansContext.js — OPTIONAL enrichment for gainers-signal
 * Step 4 (see skills/equity-research/gainers-signal/SKILL.md).
 *
 * Reads the top-20 research seed (data/runs/gainers_research_seed_{YYYYMMDD}.json,
 * written by gainersClassifier.js) and enriches each company in place with live
 * Stockscans research context (growth catalysts, business overview, latest
 * concall notes) via lib/stockscansContext.js.
 *
 * NOT part of the default daily flow. Step 4's normal path is announcement-PDF
 * reading, which is where the actionable trigger detail actually lives; this adds
 * ~3 network calls per company and is worth running only when you need the
 * business background too — e.g. an unfamiliar name reached ACT tier, or you're
 * investigating why a cluster formed. Disk-cached 7 days, so a same-day re-run is
 * a cache hit rather than a re-fetch.
 *
 * Kept separate from gainersClassifier.js on purpose: that file is
 * deterministic/no-external-API by design.
 *
 * Usage: node scripts/fetchResearchStockscansContext.js [YYYYMMDD] [--env-file <path>]
 *   (default date: the most recent gainers_research_seed_*.json on disk)
 *   Add `--limit N` to enrich only the first N companies (default: all).
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, argValue } = require('../lib/env');
loadEnv(argValue('--env-file'));
const db = require('../lib/db');
const { fetchStockscansContext } = require('../lib/stockscansContext');

function resolveSeedFile(runsDir) {
  const dateArg = process.argv[2] && /^\d{8}$/.test(process.argv[2]) ? process.argv[2] : null;
  if (dateArg) return path.join(runsDir, `gainers_research_seed_${dateArg}.json`);
  const files = fs.existsSync(runsDir)
    ? fs
        .readdirSync(runsDir)
        .filter((f) => /^gainers_research_seed_\d{8}\.json$/.test(f))
        .sort()
    : [];
  if (!files.length) {
    throw new Error(
      `No gainers_research_seed_*.json in ${runsDir} — run gainersClassifier.js (Step 2) first.`
    );
  }
  return path.join(runsDir, files[files.length - 1]);
}

async function main() {
  const runsDir = path.join(db.dataRoot(), 'runs');
  const file = resolveSeedFile(runsDir);
  if (!fs.existsSync(file)) throw new Error(`Seed file not found: ${file}`);

  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const limitArg = argValue('--limit');
  const limit = limitArg ? Number(limitArg) : null;
  const companies = (seed.companies || []).slice(0, limit && limit > 0 ? limit : undefined);
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
