#!/usr/bin/env node
'use strict';

/**
 * technicalBacktest — script-only calibration study of the E0/E1/E2 detectors (lib/technicalSetups).
 * Replays evaluate() at every STEP-th session over ~HISTORY sessions for a universe, computes RS from
 * the candles themselves, and reports forward 20/60-session returns EXCESS over the universe's
 * equal-weight mean return (benchmark-adjusted, same dates). Zero LLM.
 *
 * CAVEATS (printed in output): survivorship bias (universe = today's index members), overlapping windows
 * (events de-duplicated per ticker/state within DEDUP sessions but not independent), market-regime
 * dependence (the period may be one-directional), thresholds NOT fit to this data.
 *   node technicalBacktest.js [--index "Nifty 500"] [--step 5] [--max N] [--out file.json]
 */

const fs = require('fs');
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const { evaluate, rsRatings } = require('./lib/technicalSetups');

const HORIZONS = [20, 60];
const DEDUP = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function universe(index) {
  const out = [];
  for (let offset = 0; ; offset += 50) {
    const d = await stockscans.runScan(
      {
        ratiosType: 'Ratios',
        timePeriod: 'Latest',
        watchlistIds: [],
        order: 'desc',
        orderBy: 'Market Capitalization',
        offset,
        scan: {
          scanId: 'tbt',
          scanName: 'tbt',
          scanDescription: '',
          industry: [],
          index: [index],
          tags: [],
          watchlistIds: [],
          filters: [{ left: 'Market Capitalization', sign: '>', right: '0' }],
          alertFrequency: null,
        },
      },
      'tbt'
    );
    const t = d.table;
    if (!t || t.length <= 1) break;
    out.push(...t.slice(1).map((r) => r[0]));
    if (offset + 50 >= d.total) break;
    await sleep(700);
  }
  return out;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

async function main() {
  loadEnv(argValue('--env-file'));
  const index = argValue('--index') || 'Nifty 500';
  const step = Number(argValue('--step') || 5);
  const max = Number(argValue('--max') || 0) || Infinity;
  const tickers = (await universe(index)).slice(0, max);
  const data = new Map();
  const queue = [...tickers];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const tk = queue.shift();
        try {
          const d = await stockscans.ohlcv(tk, { tf: '1D' });
          if (d.prices.length > 400) data.set(tk, d.prices);
        } catch (e) {
          /* skip */
        }
      }
    })
  );
  // align by date string
  const dates = [...new Set([...data.values()].flatMap((c) => c.map((x) => x[0])))].sort();
  const pos = new Map([...data].map(([tk, c]) => [tk, new Map(c.map((x, i) => [x[0], i]))]));
  const maxH = Math.max(...HORIZONS);
  const start = 260;
  const events = []; // {tk,date,signal,state,fwd:{h:excess}}
  const last = new Map();
  for (let di = start; di < dates.length - 1; di += step) {
    const date = dates[di];
    const rows = [];
    for (const [tk, c] of data) {
      const i = pos.get(tk).get(date);
      if (i == null || i < 253) continue;
      const cl = (k) => c[i - k][4];
      rows.push({
        id: tk,
        i,
        c,
        r3m: (cl(0) / cl(63) - 1) * 100,
        r6m: (cl(0) / cl(126) - 1) * 100,
        r1y: (cl(0) / cl(252) - 1) * 100,
      });
    }
    if (rows.length < 50) continue;
    const rs = rsRatings(rows);
    // benchmark: equal-weight mean forward return of all rows
    const bench = {};
    for (const h of HORIZONS) {
      const fw = rows.filter((r) => r.c[r.i + h]).map((r) => r.c[r.i + h][4] / r.c[r.i][4] - 1);
      bench[h] = fw.length > 20 ? mean(fw) : null;
    }
    for (const r of rows) {
      const rr = rs.get(r.id);
      if (rr == null || rr < 90) continue; // cheap pre-filter identical to detector's RS gate
      const hi = Math.max(...r.c.slice(r.i - 251, r.i + 1).map((x) => x[2]));
      const turn = mean(r.c.slice(r.i - 19, r.i + 1).map((x) => x[5] * x[4]));
      const ev = evaluate(r.c.slice(0, r.i + 1), {
        rs: rr,
        fromHighPct: (1 - r.c[r.i][4] / hi) * 100,
        turnoverRs: turn,
      });
      const states = [
        ['E0', ev.candidate ? 'candidate' : null],
        ['E1', ev.e1.state],
        ['E2', ev.e2.state],
      ];
      for (const [sig, st] of states) {
        if (!st) continue;
        const key = `${r.id}|${sig}|${st}`;
        if (last.has(key) && di - last.get(key) < DEDUP * 1) continue; // de-dup within ~DEDUP sessions
        last.set(key, di);
        const fwd = {};
        for (const h of HORIZONS) {
          const f = r.c[r.i + h];
          fwd[h] = f && bench[h] != null ? (f[4] / r.c[r.i][4] - 1 - bench[h]) * 100 : null;
        }
        events.push({ tk: r.id, date, sig, st, fwd });
      }
    }
  }
  const summary = {};
  for (const e of events) {
    const k = `${e.sig}:${e.st}`;
    summary[k] = summary[k] || { n: 0 };
    summary[k].n++;
    for (const h of HORIZONS) {
      if (e.fwd[h] == null) continue;
      (summary[k][`x${h}`] = summary[k][`x${h}`] || []).push(e.fwd[h]);
    }
  }
  for (const v of Object.values(summary)) {
    for (const h of HORIZONS) {
      const a = v[`x${h}`] || [];
      v[`excess${h}`] = {
        n: a.length,
        meanPct: a.length ? +mean(a).toFixed(2) : null,
        medianPct: a.length ? +median(a).toFixed(2) : null,
        hitRatePct: a.length
          ? +((100 * a.filter((x) => x > 0).length) / a.length).toFixed(1)
          : null,
      };
      delete v[`x${h}`];
    }
  }
  const report = {
    index,
    universe: data.size,
    sessions: dates.length,
    step,
    sampledFrom: dates[start],
    to: dates[dates.length - 1],
    caveats: [
      "survivorship bias (today's index members)",
      'overlapping/not independent events',
      'single market regime, one period',
      'thresholds not fit to this data',
      'n<30 per cell is not evidence',
    ],
    summary,
  };
  if (argValue('--out'))
    fs.writeFileSync(argValue('--out'), JSON.stringify({ ...report, events }, null, 1));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
