#!/usr/bin/env node
'use strict';

/**
 * exitWatchDaily — script-only SOIC exit-watch (X1, X2, X3, X7) over the user's tracked watchlist.
 * Tracked set = Stockscans watchlist id (default 838b3f7ec88e17ba127ba8a3; override --watchlist).
 * X7 structural line = support level stored by the entry detectors in the signal ledger (E1/E2) if any.
 * Writes ledger states (detector `exit-watch`), entityType 'company'. Zero LLM.
 *   node exitWatchDaily.js [--dry-run] [--watchlist id] [--env-file path]
 * X4 (sector RS rollover), X5 (distribution/deals) and X6 (fundamental) are NOT covered here.
 */

const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { evaluate } = require('./lib/exitSignals');

const DETECTOR = 'exit-watch';
const WATCHLIST_ID = '838b3f7ec88e17ba127ba8a3';
const MAP = {
  X1: 'X1-weekly-lower-highs',
  X2: 'X2-failed-breakout',
  X3: 'X3-ma-loss',
  X7: 'X7-structural-line',
};

async function watchlistTickers(id) {
  const ids = [];
  for (let offset = 0; ; offset += 50) {
    const d = await stockscans.runScan(
      {
        ratiosType: 'Ratios',
        timePeriod: 'Latest',
        watchlistIds: [id],
        order: 'desc',
        orderBy: 'Market Capitalization',
        offset,
        scan: {
          scanId: DETECTOR,
          scanName: DETECTOR,
          scanDescription: '',
          industry: [],
          index: [],
          tags: [],
          watchlistIds: [id],
          filters: [{ left: 'Close Price', sign: '>', right: '0' }],
          alertFrequency: null,
        },
      },
      DETECTOR
    );
    const t = d.table;
    if (!t || t.length <= 1) break;
    ids.push(...t.slice(1).map((r) => r[0]));
    if (offset + 50 >= d.total) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  return ids;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const id = argValue('--watchlist') || WATCHLIST_ID;
  const db = require('./lib/db');

  const tickers = await watchlistTickers(id);
  // structural lines from the entry detectors (latest support per company)
  const lines = new Map();
  for (const r of signalLedger.getStates({
    signalIds: ['E1-base-breakout', 'E2-pullback'],
    entityType: 'company',
    activeOnly: true,
  })) {
    const s = r.levels && r.levels.support;
    if (typeof s === 'number') lines.set(r.entityId, Math.max(lines.get(r.entityId) || 0, s));
  }

  const observations = [];
  const errors = [];
  let sessionDate = null;
  const queue = [...tickers];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const tk = queue.shift();
        try {
          const d = await stockscans.ohlcv(tk, { tf: '1D' });
          const ev = evaluate(d.prices, { structuralLine: lines.get(tk) ?? null });
          if (ev.insufficient) continue;
          sessionDate = sessionDate || d.prices[d.prices.length - 1][0];
          for (const k of Object.keys(MAP)) {
            if (k === 'X7' && !lines.has(tk)) continue;
            observations.push({
              signalId: MAP[k],
              entityType: 'company',
              entityId: tk,
              state: ev[k],
              minMisses: 2,
              evidence: { ...(ev.evidence[k] || {}), calibrated: false },
            });
          }
        } catch (e) {
          errors.push(`${tk}: ${e.message}`);
        }
      }
    })
  );

  let ledger = null;
  if (!dryRun && sessionDate)
    ledger = signalLedger.applyObservations(observations, {
      detector: DETECTOR,
      date: sessionDate,
    });
  console.log(
    JSON.stringify(
      {
        sessionDate,
        dryRun,
        watchlist: id,
        tracked: tickers.length,
        errors,
        flagged: observations
          .filter((o) => o.state)
          .map((o) => ({ id: o.entityId, signal: o.signalId, state: o.state })),
        ledger,
        filesTouched: dryRun ? [] : db.touchedFiles(),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  stockscans.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('exitWatchDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
