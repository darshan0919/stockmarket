#!/usr/bin/env node
'use strict';

/**
 * weeklyGainersScanner.js — sibling to gainersScanner.js (task: weekly-gainers-signal).
 *
 * Reuses gainersScanner.js's `main()` pipeline in full (quality filters, delivery,
 * 14-day announcements, WHY-ladder inputs, industry clusters, price signals) via its
 * `universeFetcher` / `dtoKind` hooks — the same reuse pattern volumeRocketingScanner.js
 * established, rather than duplicating any of that logic. The only thing genuinely
 * different at Step 1 is the universe: instead of the top-N gainers by Returns 1D,
 * this pulls the top-N by `Returns 1W` (Market Cap >= 300 Cr, Returns 1W >= 3%) via
 * `gainersScanner.fetchTopWeeklyGainers`.
 *
 * Unlike gainers-signal / volume-rocketing, this scan is NOT deduped against the
 * daily runs — a name can legitimately be both a daily gainers-signal pick AND a
 * weekly-gainers-signal pick (e.g. Monday's mover that kept running all week); the
 * two reports answer different questions ("what moved today" vs "what moved this
 * week") and Darshan reads them on different cadences.
 *
 * Usage: node weeklyGainersScanner.js [--date YYYY-MM-DD] [--env-file <path>] [--top-n <n>]
 */

const { stockscans, nse, bse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const gainersScanner = require('./gainersScanner');

const TARGET_COUNT = 20;

/**
 * `universeFetcher(client, topN)` for gainersScanner.main() — pulls the top
 * weekly gainers (already sorted desc by Returns 1W server-side) and takes
 * the first `topN` (default 20).
 */
async function weeklyGainersUniverseFetcher(client, topN = TARGET_COUNT) {
  return gainersScanner.fetchTopWeeklyGainers(client, topN);
}

async function main({
  marketDate,
  clients = { stockscans, nse, bse },
  sleep,
  log = (m) => process.stderr.write(m),
  topN = TARGET_COUNT,
  // API-usage audit: threaded straight through to gainersScanner.main's own
  // jobName param — an explicit arg, never shared state (see that file).
  jobName,
} = {}) {
  return gainersScanner.main({
    marketDate,
    clients,
    sleep,
    log,
    topN,
    jobName,
    universeFetcher: weeklyGainersUniverseFetcher,
    dtoKind: 'weekly_gainers_raw',
    tagVolumeRocketing: false, // weekly move, not a same-day volume cross-check
  });
}

module.exports = { main, weeklyGainersUniverseFetcher, TARGET_COUNT };

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  const jobName = resolveJobName('weekly-gainers-signal-stockmarket');
  stockscans.setJobName(jobName);
  (async () => {
    const dateArg = argValue('--date');
    const marketDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : undefined;
    const topNArg = argValue('--top-n');
    const topN = topNArg ? Number(topNArg) : TARGET_COUNT;
    const output = await main({ marketDate, jobName, topN });
    apiUsageTracker.flush(jobName);
    process.stdout.write(JSON.stringify(output));
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
