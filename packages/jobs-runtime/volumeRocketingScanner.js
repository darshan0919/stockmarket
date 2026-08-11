#!/usr/bin/env node
'use strict';

/**
 * volumeRocketingScanner.js — sibling to gainersScanner.js (task: volume-rocketing-signal).
 *
 * Reuses gainersScanner.js's `main()` pipeline in full (quality filters, delivery,
 * announcements, concall sentiment, industry clusters, price signals) via its
 * `universeFetcher` / `dtoKind` hooks, rather than duplicating any of that logic.
 * The only thing genuinely different here is Step 1: instead of the top-N gainers by
 * Returns 1D, the universe is the Stockscans "Volume Rocketing" saved scan
 * (Volume >= 2.5x its own 5D SMA, Market Cap >= 300 Cr), sorted desc by Volume,
 * with any name already picked up by that day's gainers-signal run skipped so the
 * two signals never report the same name twice — see SKILL.md "Step 1" for why.
 *
 * Usage: node volumeRocketingScanner.js [--date YYYY-MM-DD] [--env-file <path>]
 */

const fs = require('fs');
const path = require('path');
const { stockscans, nse, bse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const dbV2 = require('./lib/db');
const gainersScanner = require('./gainersScanner');

const RUNS_DIR = path.join(dbV2.dataRoot(), 'runs');
const TARGET_COUNT = 20;

/** companyIds already picked up by that day's gainers-signal run, so
 * volume-rocketing never reports the same name under a different hat. */
function loadGainersTickers(mDateStr, runsDir = RUNS_DIR) {
  const p = path.join(runsDir, `gainers_raw_${mDateStr.replace(/-/g, '')}.json`);
  if (!fs.existsSync(p)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set((raw.gainers || []).map((g) => g.ticker).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

/**
 * `universeFetcher(client, topN)` for gainersScanner.main() — pulls the full
 * Volume Rocketing scan (already sorted desc by Volume server-side), drops
 * anything already covered by gainers-signal for the same market date, and
 * takes the first `topN` (default 20) of what remains, preserving scan order.
 */
function makeVolumeRocketingUniverseFetcher(mDateStr) {
  return async function fetchVolumeRocketingUniverse(client, topN = TARGET_COUNT) {
    const rows = await gainersScanner.fetchVolumeRocketing(client);
    const gainersTickers = loadGainersTickers(mDateStr);
    const out = [];
    for (const row of rows) {
      const ticker = gainersScanner.pick(row, 'companyId', 'ticker', 'symbol');
      if (ticker && gainersTickers.has(String(ticker).trim())) continue; // dedupe vs gainers-signal
      out.push(row);
      if (out.length >= topN) break;
    }
    return out;
  };
}

async function main({
  marketDate,
  clients = { stockscans, nse, bse },
  sleep,
  log = (m) => process.stderr.write(m),
  topN = TARGET_COUNT,
} = {}) {
  const now = new Date();
  const mDate = marketDate || gainersScanner.resolveMarketDate(gainersScanner.istToday(now), now);
  const mDateStr = mDate.toISOString().slice(0, 10);
  return gainersScanner.main({
    marketDate: mDate,
    clients,
    sleep,
    log,
    topN,
    universeFetcher: makeVolumeRocketingUniverseFetcher(mDateStr),
    dtoKind: 'volume_rocketing_raw',
    tagVolumeRocketing: false, // this IS the Volume Rocketing pipeline; no need to self-tag
  });
}

module.exports = { main, loadGainersTickers, makeVolumeRocketingUniverseFetcher, TARGET_COUNT };

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  (async () => {
    const dateArg = argValue('--date');
    const marketDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : undefined;
    const output = await main({ marketDate });
    process.stdout.write(JSON.stringify(output));
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
