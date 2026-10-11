#!/usr/bin/env node
'use strict';

/**
 * exitWatchDaily — script-only SOIC exit-watch (X1, X2, X3, X7) over the user's tracked watchlist.
 * Tracked set = Stockscans watchlist id (default 838b3f7ec88e17ba127ba8a3; override --watchlist).
 * X7 structural line = support level stored by the entry detectors in the signal ledger (E1/E2) if any.
 * Writes ledger states (detector `exit-watch`), entityType 'company'. Zero LLM.
 *   node exitWatchDaily.js [--dry-run] [--watchlist id] [--env-file path]
 * Also X4 (industry RS rollover), X5 (distribution: volume/blocks/FII/failed breakouts), X6 (fundamental: stretched valuation,
 * muted result reaction, cash divergence, pledge) via lib/exitSignalsExtra. Thresholds are ASSUMPTIONS.
 */

const { stockscans, nse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { evaluate } = require('./lib/exitSignals');
const X = require('./lib/exitSignalsExtra');
const { sellValueBySymbol } = require('./lib/paperSupply');
const { istDate } = require('./lib/ist');

const DETECTOR = 'exit-watch';
const WATCHLIST_ID = '838b3f7ec88e17ba127ba8a3';
const MAP = {
  X1: 'X1-weekly-lower-highs',
  X2: 'X2-failed-breakout',
  X3: 'X3-ma-loss',
  X7: 'X7-structural-line',
};
const MAP_EXTRA = {
  X4: 'X4-sector-rs-rollover',
  X5: 'X5-distribution',
  X6: 'X6-fundamental-exit',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ddmmyyyy = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;

async function watchlistTickers(id) {
  const ids = [];
  const rows = new Map();
  let header = null;
  for (let offset = 0; ; offset += 50) {
    const d = await stockscans.runScan(
      {
        ratiosType: 'Default',
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
    header = header || t[0];
    for (const r of t.slice(1)) {
      ids.push(r[0]);
      rows.set(r[0], Object.fromEntries(header.map((h, i) => [h, r[i]])));
    }
    if (offset + 50 >= d.total) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  return { ids, rows };
}

/** members' Performance-scan rows for an industry and/or index: [{r1m,r3m}] (capped pages) */
async function performanceRows({ industry = [], index = [] }, maxPages = 12) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await stockscans.runScan(
      {
        ratiosType: 'Performance',
        timePeriod: 'Latest',
        watchlistIds: [],
        order: 'desc',
        orderBy: 'Market Capitalization',
        offset: page * 50,
        scan: {
          scanId: DETECTOR,
          scanName: DETECTOR,
          scanDescription: '',
          industry,
          index,
          tags: [],
          watchlistIds: [],
          filters: [{ left: 'Market Capitalization', sign: '>=', right: '500' }],
          alertFrequency: null,
        },
      },
      DETECTOR
    );
    const t = d.table;
    if (!t || t.length <= 1) break;
    const i1 = t[0].indexOf('Returns 1M');
    const i3 = t[0].indexOf('Returns 3M');
    if (i1 < 0 || i3 < 0) throw new Error('Performance scan missing Returns 1M/3M');
    for (const r of t.slice(1)) out.push({ r1m: r[i1], r3m: r[i3] });
    if ((page + 1) * 50 >= d.total) break;
    await sleep(700);
  }
  return out;
}

async function recentBlockSells(todayIso, errors) {
  const days = [];
  for (let i = 0; days.length < 5 && i < 12; i++) {
    const d = new Date(Date.parse(todayIso) - i * 86400000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d);
  }
  const all = [];
  for (const d of days) {
    try {
      all.push(...(await nse.getHistoricalBlockDeals(ddmmyyyy(d), ddmmyyyy(d))));
    } catch (e) {
      errors.push(`blocks ${ddmmyyyy(d)}: ${e.message}`);
    }
    await sleep(400);
  }
  return sellValueBySymbol(all);
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const id = argValue('--watchlist') || WATCHLIST_ID;
  const db = require('./lib/db');

  const { ids: tickers, rows } = await watchlistTickers(id);
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
  const todayIso = istDate().toISOString().slice(0, 10);

  // X4 inputs: market (Nifty 500) medians + per-industry member returns for held industries only
  const industries = [...new Set([...rows.values()].map((r) => r.Industry).filter(Boolean))];
  let mkt = null;
  const indRet = new Map();
  try {
    const m = await performanceRows({ index: ['Nifty 500'] }, 11);
    mkt = { m1: X.median(m.map((x) => x.r1m)), m3: X.median(m.map((x) => x.r3m)) };
    for (const ind of industries) {
      indRet.set(ind, await performanceRows({ industry: [ind] }, 6));
      await sleep(700);
    }
  } catch (e) {
    errors.push(`X4 inputs: ${e.message}`);
  }
  // X5 input: NSE block SELL value, last 5 sessions
  const blocks = await recentBlockSells(todayIso, errors);
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
          const row = rows.get(tk) || {};
          const sym = String(tk).replace(/^NSE:/, '');
          const ex = {};
          const members = indRet.get(row.Industry);
          if (mkt && members)
            ex.X4 = X.sectorRollover({
              ind1m: members.map((x) => x.r1m),
              ind3m: members.map((x) => x.r3m),
              mkt1m: mkt.m1,
              mkt3m: mkt.m3,
            });
          ex.X5 = X.distribution({
            candles: d.prices,
            blockSellCr: blocks.get(sym) ?? 0,
            fiiChangePp: row['Change In FII Holdings Latest Quarter'],
          });
          ex.X6 = X.fundamentalExit({
            pe: row['Price To Earnings'],
            peg: row.PEG,
            industryPe: row['Industry PE Median'],
            patYoY: row['PAT Growth YoY'],
            daysFromResult: row['Days From Result'],
            returnsSinceResult: row['Returns Since Result'],
            cfoToPat: row['CFO To PAT'],
            pledgedPct: row['Pledged Percentage'],
          });
          for (const k of Object.keys(ex))
            observations.push({
              signalId: MAP_EXTRA[k],
              entityType: 'company',
              entityId: tk,
              state: ex[k].state,
              minMisses: 2,
              evidence: { ...(ex[k].evidence || {}), flags: ex[k].flags, industry: row.Industry, calibrated: false },
            });
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
          .map((o) => ({ id: o.entityId, signal: o.signalId, state: o.state, flags: o.evidence.flags })),
        x4: observations
          .filter((o) => o.signalId === MAP_EXTRA.X4)
          .map((o) => ({ id: o.entityId, state: o.state, ...o.evidence })),
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
