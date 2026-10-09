#!/usr/bin/env node
'use strict';

/**
 * liquiditySupplyDaily — script-only liquidity/supply monitor. Zero LLM.
 *   L1-fii-20d-outflow  : 20-session cumulative FII net from `market_snapshot` events (market-regime-daily history).
 *                         Omitted until 20 snapshots exist (NSE exposes only the latest FII/DII day).
 *   L2-block-supply-spike: NSE BLOCK deals (bulk excluded: 70-row API cap) SELL-side traded value, last 5 sessions vs median of prior 20 five-session sums.
 * Ledger entityType 'market', entityId 'india', detector `liquidity-supply`. Thresholds are ASSUMPTIONS (lib/liquiditySupply.js).
 * NOT covered: IPO/OFS supply (no complete listing source wired), SIP flows.
 *   node liquiditySupplyDaily.js [--dry-run] [--env-file path]
 */

const fs = require('fs');
const { nse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { dailyValueCr, blockSpike, blockState, fii20, TH } = require('./lib/liquiditySupply');

const DETECTOR = 'liquidity-supply';
// block/bulk responses cap at 70 rows per call; a single heavy day may be a lower bound (flagged as truncatedDays)
const ddmmyyyy = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const errors = [];

  // NSE caps each response at 70 rows (oldest first), so fetch ONE DAY per call; past days are immutable -> cached.
  const cacheFile = db.cachePath('liquidity-block-deals-daily.json');
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch (e) {
    cache = {};
  }
  const todayIso = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.parse(todayIso) - i * 86400000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d);
  }
  let fetched = 0;
  let truncatedDays = 0;
  for (const d of days.reverse()) {
    const iso = d.toISOString().slice(0, 10);
    if (cache[iso] && iso !== todayIso) continue;
    try {
      const block = await nse.getHistoricalBlockDeals(ddmmyyyy(d), ddmmyyyy(d)); // BLOCK deals only: bulk-deal responses hit NSE's 70-row cap on nearly every day
      const sells = block.filter((r) => r.BD_BUY_SELL === 'SELL');
      cache[iso] = {
        cr: sells.reduce((a, r) => a + (Number(r.BD_QTY_TRD) * Number(r.BD_TP_WATP)) / 1e7, 0),
        rows: sells.length,
        capped: block.length >= 70,
      };
      fetched++;
    } catch (e) {
      errors.push(`${iso}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  fs.mkdirSync(require('path').dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  const deals = [];
  for (const [iso, v] of Object.entries(cache)) {
    if (v.capped) truncatedDays++;
    deals.push({ date: iso, qty: v.cr * 1e7, price: 1 });
  }
  const daily = dailyValueCr(deals);
  const spike = daily.size ? blockSpike(daily) : null;
  const sessionDate = [...daily.keys()].sort().pop() || new Date().toISOString().slice(0, 10);

  const snaps = db
    .find('events', { type: 'market_snapshot' })
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const fiiNets = snaps
    .map((s) => s.snapshot && s.snapshot.flows && s.snapshot.flows.fiiNet)
    .filter((x) => typeof x === 'number');
  const f = fii20(fiiNets);

  const common = { entityType: 'market', entityId: 'india', minMisses: 2 };
  const observations = [];
  if (spike)
    observations.push({
      ...common,
      signalId: 'L2-block-supply-spike',
      state: blockState(spike.ratio),
      evidence: {
        ...spike,
        thresholds: { detected: TH.blockDetected, confirmed: TH.blockConfirmed },
        calibrated: false,
      },
    });
  if (f)
    observations.push({
      ...common,
      signalId: 'L1-fii-20d-outflow',
      state: f.state,
      evidence: { cumCr: f.cumCr, snapshots: fiiNets.length, calibrated: false },
    });

  const ledger =
    !dryRun && observations.length
      ? signalLedger.applyObservations(observations, { detector: DETECTOR, date: sessionDate })
      : null;
  console.log(
    JSON.stringify(
      {
        sessionDate,
        dryRun,
        errors,
        daysFetched: fetched,
        truncatedDays,
        tradingDaysWithDeals: daily.size,
        blockSpike: spike,
        fii20: f || { note: `insufficient history (${fiiNets.length}/20 snapshots)` },
        observations: observations.map((o) => ({ signalId: o.signalId, state: o.state })),
        ledger,
        filesTouched: dryRun ? [] : db.touchedFiles(),
      },
      null,
      2
    )
  );
  if (errors.length && !observations.length) process.exitCode = 1;
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  nse.setJobName && nse.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('liquiditySupplyDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
