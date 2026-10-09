#!/usr/bin/env node
'use strict';

/**
 * technicalSetupsDaily — script-only SOIC entry-ready detector (taxonomy E0-E2). Zero LLM.
 *   1. Stockscans universe scan (mcap >= Rs 500 Cr, 20D turnover >= Rs 7 Cr) with 3M/6M/1Y returns,
 *      close, 200 EMA and 52-week-high distance columns.
 *   2. RS rating = percentile of weighted returns across that universe (lib/technicalSetups.rsRatings).
 *   3. Candidates = RS >= 90, <= 20% from the 52wH, above the 200 EMA (chartist selection rules).
 *   4. Daily candles (1D) fetched ONLY for candidates + names still active in the ledger.
 *   5. E0-candidate / E1-base-breakout / E2-pullback observations -> signal-ledger (detector `technical-setups`).
 * Every threshold is an uncalibrated single-author claim or marked ASSUMPTION (see lib/technicalSetups.js).
 *
 *   node technicalSetupsDaily.js [--dry-run] [--max-candidates N] [--env-file path]
 */

const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { evaluate, rsRatings, DEFAULTS } = require('./lib/technicalSetups');

const DETECTOR = 'technical-setups';
const SIGNALS = ['E0-candidate', 'E1-base-breakout', 'E2-pullback'];
const MARKET_GATE_SIGNALS = ['M4-deep-correction', 'M3-weak-macro'];
const CONCURRENCY = 4;
const PAGE_DELAY_MS = 700;

function universePayload(offset) {
  return {
    ratiosType: 'Ratios',
    timePeriod: 'Latest',
    scan: {
      scanId: DETECTOR,
      scanName: DETECTOR,
      scanDescription: '',
      industry: [],
      index: [],
      tags: [],
      watchlistIds: [],
      alertFrequency: null,
      filters: [
        { left: 'Market Capitalization', sign: '>=', right: '500' },
        { left: 'Volume SMA 20D * SMA 20D', sign: '>=', right: String(DEFAULTS.minTurnoverRs) },
        { left: 'Returns 3M', sign: '>', right: '-100' },
        { left: 'Returns 6M', sign: '>', right: '-100' },
        { left: 'Returns 1Y', sign: '>', right: '-100' },
        { left: 'Close Price', sign: '>', right: '0' },
        { left: 'EMA 200D', sign: '>', right: '0' },
        { left: '52WH Distance', sign: '>=', right: '0' },
      ],
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset,
  };
}

async function fetchUniverse() {
  let header = null;
  const rows = [];
  for (let offset = 0; ; offset += 50) {
    const data = await stockscans.runScan(universePayload(offset), DETECTOR);
    const table = data.table;
    if (!table || table.length <= 1) break;
    if (!header) header = table[0];
    rows.push(...table.slice(1));
    if (offset + 50 >= data.total) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS)); // stay under Stockscans' 429 limit
  }
  if (!header) throw new Error('universe scan returned no rows');
  const ix = (n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`universe scan missing column ${n}`);
    return i;
  };
  const c = {
    id: ix('companyId'),
    name: ix('Name'),
    vol: ix('Volume SMA 20D'),
    sma: ix('SMA 20D'),
    r3m: ix('Returns 3M'),
    r6m: ix('Returns 6M'),
    r1y: ix('Returns 1Y'),
    close: ix('Close Price'),
    e200: ix('EMA 200D'),
    d52: ix('52WH Distance'),
  };
  return rows.map((r) => ({
    id: r[c.id],
    name: r[c.name],
    r3m: r[c.r3m],
    r6m: r[c.r6m],
    r1y: r[c.r1y],
    close: r[c.close],
    ema200: r[c.e200],
    fromHighPct: r[c.d52],
    turnoverRs:
      typeof r[c.vol] === 'number' && typeof r[c.sma] === 'number' ? r[c.vol] * r[c.sma] : null,
  }));
}

async function pool(items, worker, size) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const mine = items[i++];
        out.push(await worker(mine));
      }
    })
  );
  return out;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const maxCand = Number(argValue('--max-candidates') || 0) || Infinity;
  const db = require('./lib/db');

  const universe = await fetchUniverse();
  const rs = rsRatings(universe);
  const byId = new Map(universe.map((u) => [u.id, { ...u, rs: rs.get(u.id) }]));

  const isCand = (u) =>
    u.rs != null &&
    u.rs >= DEFAULTS.minRs &&
    u.fromHighPct <= DEFAULTS.maxFromHighPct &&
    u.close > u.ema200;
  let candidates = [...byId.values()]
    .filter(isCand)
    .sort((a, b) => b.rs - a.rs)
    .slice(0, maxCand);

  const active = signalLedger
    .getStates({ signalIds: SIGNALS, entityType: 'company', activeOnly: true })
    .map((r) => r.entityId);
  const toFetch = [...new Set([...candidates.map((u) => u.id), ...active])].filter((id) =>
    byId.has(id)
  );

  const results = await pool(
    toFetch,
    async (id) => {
      try {
        const d = await stockscans.ohlcv(id, { tf: '1D' });
        return { id, candles: d.prices };
      } catch (e) {
        return { id, error: e.message };
      }
    },
    CONCURRENCY
  );
  const fetchErrors = results.filter((r) => r.error);

  const gate = signalLedger
    .getStates({ signalIds: MARKET_GATE_SIGNALS, entityType: 'market', activeOnly: true })
    .map((r) => r.signalId);

  const sessionDate = (
    results.find((r) => r.candles && r.candles.length) || { candles: [[null]] }
  ).candles.slice(-1)[0][0];
  const observations = [];
  const summary = { E0: 0, E1: {}, E2: {} };
  for (const r of results) {
    if (r.error) continue; // unobserved-by-error: omit so a fetch failure never flips state
    const u = byId.get(r.id);
    const ev = evaluate(r.candles, {
      rs: u.rs,
      fromHighPct: u.fromHighPct,
      turnoverRs: u.turnoverRs,
    });
    const common = { entityType: 'company', entityId: r.id };
    const meta = {
      name: u.name,
      rs: u.rs,
      marketGate: gate,
      lastCandle: r.candles[r.candles.length - 1][0],
    };
    observations.push({
      ...common,
      signalId: 'E0-candidate',
      state: ev.candidate ? 'detected' : null,
      minMisses: 3,
      evidence: { ...meta, ...ev.selection },
    });
    observations.push({
      ...common,
      signalId: 'E1-base-breakout',
      state: ev.e1.state,
      minMisses: 2,
      levels: ev.e1.levels || undefined,
      evidence: ev.e1.evidence ? { ...meta, ...ev.e1.evidence } : undefined,
    });
    observations.push({
      ...common,
      signalId: 'E2-pullback',
      state: ev.e2.state,
      minMisses: 2,
      levels: ev.e2.levels || undefined,
      evidence: ev.e2.evidence ? { ...meta, ...ev.e2.evidence } : undefined,
    });
    if (ev.candidate) summary.E0++;
    if (ev.e1.state) summary.E1[ev.e1.state] = (summary.E1[ev.e1.state] || 0) + 1;
    if (ev.e2.state) summary.E2[ev.e2.state] = (summary.E2[ev.e2.state] || 0) + 1;
  }

  let ledger = null;
  if (!dryRun && sessionDate) {
    ledger = signalLedger.applyObservations(observations, {
      detector: DETECTOR,
      date: sessionDate,
    });
  }

  const ready = observations
    .filter((o) => o.state === 'entry-ready')
    .map((o) => ({ id: o.entityId, signal: o.signalId, rs: o.evidence.rs, levels: o.levels }));
  console.log(
    JSON.stringify(
      {
        sessionDate,
        dryRun,
        universe: universe.length,
        candidates: candidates.length,
        fetched: toFetch.length,
        fetchErrors: fetchErrors.map((e) => `${e.id}: ${e.error}`),
        marketGate: gate,
        summary,
        entryReady: ready,
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
      console.error('technicalSetupsDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main, fetchUniverse };
