#!/usr/bin/env node
'use strict';

/**
 * marketRegimeDaily — script-only daily snapshot of market breadth, macro and FII/DII flows,
 * evaluated into SOIC signal-ledger states (M1-M4). Zero LLM. Sources:
 *   - breadth: Stockscans runScan scoped to Nifty 500 (SMA 20/50/200 counts, near-highs count)
 *   - macro:   TradingView public scanner (Brent, US 10Y, USDINR, DXY, India VIX)
 *   - flows:   NSE /api/fiidiiTradeReact (latest published session)
 * Persists: one `market_snapshot` event per session (history for M1/FII windows) +
 * signal-ledger states + `signal_transition` events. Safe to re-run (idempotent per session date).
 *
 *   node marketRegimeDaily.js [--dry-run] [--env-file path]
 */

const { stockscans, nse, tradingview } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const { istDate } = require('./lib/ist');
const { buildObservations } = require('./lib/marketRegime');
const signalLedger = require('./lib/signalLedger');

const DETECTOR = 'market-regime-daily';
const NEAR_HIGHS_SCAN_ID = '9493efc2c969d602c5dedbe2'; // user's saved "Near Highs" scan

async function countScan(filters, { index = [], scanId = 'market-regime-daily' } = {}) {
  const scan = {
    scanId,
    scanName: 'regime',
    scanDescription: '',
    industry: [],
    index,
    tags: [],
    watchlistIds: [],
    filters,
    alertFrequency: null,
  };
  const data = await stockscans.runScan(
    {
      ratiosType: 'Ratios',
      timePeriod: 'Latest',
      scan,
      watchlistIds: [],
      order: 'desc',
      orderBy: 'Market Capitalization',
      offset: 0,
    },
    ''
  );
  if (typeof data.total !== 'number') throw new Error('scan returned no total');
  return data.total;
}

async function fetchBreadth() {
  const idx = ['Nifty 500'];
  const close = (right) => [{ left: 'Close Price', sign: '>', right }];
  const [universe, above20, above50, above200] = await Promise.all([
    countScan([{ left: 'Market Capitalization', sign: '>', right: '0' }], { index: idx }),
    countScan(close('SMA 20D'), { index: idx }),
    countScan(close('SMA 50D'), { index: idx }),
    countScan(close('SMA 200D'), { index: idx }),
  ]);
  // user's saved Near Highs scan definition (same filters as near-highs-digest)
  const def = await stockscans.getScanMetadata(NEAR_HIGHS_SCAN_ID);
  const nearHighsCount = await countScan(def.filters, {
    index: def.index || [],
    scanId: NEAR_HIGHS_SCAN_ID,
  });
  return { universe, above20, above50, above200, nearHighsCount };
}

async function settle(label, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: `${label}: ${e.message}` };
  }
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');

  const [breadth, macro, flows, mood] = await Promise.all([
    settle('breadth', fetchBreadth),
    settle('macro', () => tradingview.getMacroSnapshot()),
    settle('flows', () => nse.getFiiDiiActivity()),
    settle('mood', () => nse.getMarketMood()),
  ]);
  const errors = [breadth, macro, flows, mood].filter((r) => !r.ok).map((r) => r.error);

  const today = istDate().toISOString().slice(0, 10);
  // Session date = last published NSE session (so weekends/holidays reuse the last real session).
  const sessionDate = (flows.ok && flows.value && flows.value.date) || today;

  const macroValues = macro.ok
    ? Object.fromEntries(Object.entries(macro.value).map(([k, v]) => [k, v ? v.price : null]))
    : {};
  // If TradingView India VIX is missing, fall back to official NSE market mood
  if (!macroValues.indiaVix && mood.ok && mood.value?.india_vix?.level) {
    macroValues.indiaVix = mood.value.india_vix.level;
  }

  const snapshot = {
    sessionDate,
    breadth: breadth.ok ? breadth.value : {},
    mood: mood.ok ? mood.value : null,
    macro: macroValues,
    flows:
      flows.ok && flows.value
        ? { fiiNet: flows.value.fii.net, diiNet: flows.value.dii.net, fiiDate: flows.value.date }
        : {},
  };

  const since = new Date(Date.parse(sessionDate) - 60 * 86400000).toISOString().slice(0, 10);
  const history = db
    .find('events', { type: 'market_snapshot', since })
    .filter((e) => e.sessionDate && e.sessionDate < sessionDate)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((e) => e.snapshot);

  const observations = buildObservations(snapshot, history);
  let ledger = null;
  if (!dryRun) {
    if (breadth.ok || macro.ok || flows.ok || mood.ok) {
      db.appendEvents([
        {
          type: 'market_snapshot',
          creator: DETECTOR,
          date: sessionDate,
          sessionDate,
          summary: `market snapshot ${sessionDate}`,
          snapshot,
        },
      ]);
    }
    ledger = signalLedger.applyObservations(observations, {
      detector: DETECTOR,
      date: sessionDate,
    });
  }

  console.log(
    JSON.stringify(
      {
        sessionDate,
        dryRun,
        errors,
        snapshot,
        observations: observations.map((o) => ({ signalId: o.signalId, state: o.state })),
        ledger,
        filesTouched: dryRun ? [] : db.touchedFiles(),
      },
      null,
      2
    )
  );
  if (errors.length === 3) process.exitCode = 1;
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  stockscans.setJobName(jobName);
  tradingview.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('marketRegimeDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main, fetchBreadth };
