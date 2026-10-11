#!/usr/bin/env node
'use strict';
/**
 * signalCalibrationReplay — P6 replay study for the price-only exit detectors (X1, X2, X3, X5 volume/failed-breakout
 * components). Replays lib/exitSignals + lib/exitSignalsExtra over ~4y of daily candles for a liquid sample of NSE
 * names, takes signal ONSETS (cooldown 20 sessions), enters at the next close and measures 21d/63d forward return
 * minus the equal-weight universe average over the same dates. Zero LLM. Candles are cached in data/cache/calibration-ohlcv/.
 *   node signalCalibrationReplay.js [--n 150] [--min-mcap 2000] [--max-mcap 200000] [--env-file path] [--no-fetch]
 * Caveats (also printed): sample = today's survivors (survivorship bias), overlapping windows and market-wide clustering
 * make t-stats optimistic, thresholds being tested are the production defaults, not tuned.
 */
const fs = require('fs');
const path = require('path');
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const exitSignals = require('./lib/exitSignals');
const X = require('./lib/exitSignalsExtra');
const C = require('./lib/signalCalibration');

const ROOT = path.join(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache', 'calibration-ohlcv');
const UNIVERSE = path.join(ROOT, 'data', 'cache', 'ipo-supply-universe.json');
const OUT_DIR = path.join(ROOT, 'data', 'cache', 'calibration');
const WARMUP = 70;

const safe = (t) => t.replace(/[^A-Za-z0-9_-]/g, '_');

function pickUniverse(n, minM, maxM) {
  const rows = JSON.parse(fs.readFileSync(UNIVERSE, 'utf8'))
    .rows.map(([id, u]) => ({ id, mcap: u.mcap }))
    .filter((r) => r.id.startsWith('NSE:') && r.mcap >= minM && r.mcap <= maxM)
    .sort((a, b) => b.mcap - a.mcap);
  const step = Math.max(1, Math.floor(rows.length / n));
  return rows
    .filter((_, i) => i % step === 0)
    .slice(0, n)
    .map((r) => r.id);
}

async function loadCandles(tickers, noFetch) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const out = new Map();
  const queue = [...tickers];
  let fetched = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const tk = queue.shift();
        const f = path.join(CACHE_DIR, `${safe(tk)}.json`);
        try {
          if (fs.existsSync(f)) {
            const c = JSON.parse(fs.readFileSync(f, 'utf8'));
            if (c.length >= 400) {
              out.set(tk, c);
              continue;
            }
          }
          if (noFetch) continue;
          const d = await stockscans.ohlcv(tk, { tf: '1D' });
          fetched++;
          if (d.prices && d.prices.length >= 400) {
            fs.writeFileSync(f, JSON.stringify(d.prices));
            out.set(tk, d.prices);
          }
          await new Promise((r) => setTimeout(r, 400));
        } catch (e) {
          console.error(`[calibration] ${tk}: ${e.message}`);
        }
      }
    })
  );
  return { candles: out, fetched };
}

function main() {
  throw new Error('use run()');
}

async function run() {
  loadEnv(argValue('--env-file'));
  const n = parseInt(argValue('--n') || '150', 10);
  const tickers = pickUniverse(
    n,
    Number(argValue('--min-mcap') || 2000),
    Number(argValue('--max-mcap') || 200000)
  );
  const { candles, fetched } = await loadCandles(tickers, process.argv.includes('--no-fetch'));

  // per-date equal-weight average forward return (benchmark) for each horizon
  const dateIdx = new Map(); // date -> {h: [returns]}
  const series = [];
  const dropped = [];
  for (const [tk, c] of candles) {
    // data-quality guard: a >30% one-day close-to-close move is almost certainly an unadjusted split/bonus, not price action
    const cl = c.map((r) => r[4]);
    if (cl.some((x, i) => i > 0 && cl[i - 1] > 0 && Math.abs(x / cl[i - 1] - 1) > 0.3)) {
      dropped.push(tk);
      continue;
    }
    const closes = c.map((r) => r[4]);
    const dates = c.map((r) => r[0]);
    series.push({ tk, c, closes, dates });
    for (let i = 0; i < c.length; i++) {
      for (const h of C.HORIZONS) {
        const r = C.fwdReturn(closes, i, h);
        if (r == null) continue;
        const d = dateIdx.get(dates[i]) || dateIdx.set(dates[i], {}).get(dates[i]);
        (d[h] || (d[h] = [])).push(r);
      }
    }
  }
  const bench = (date, h) => {
    const a = dateIdx.get(date) && dateIdx.get(date)[h];
    return a && a.length >= 30 ? C.median(a) : null; // median: robust to residual data errors
  };

  const buckets = {
    'X1 weekly lower highs (detected)': [],
    'X2 failed breakout (detected)': [],
    'X3 close<20EMA (detected)': [],
    'X3 close<50EMA (confirmed)': [],
    'X5 rising on falling volume': [],
    'X5 repeat failed breakouts (>=2/60d)': [],
  };
  const active = Object.fromEntries(Object.keys(buckets).map((k) => [k, []]));
  const baseline = [];

  for (const { tk, c, closes, dates } of series) {
    const flags = Object.fromEntries(
      Object.keys(buckets).map((k) => [k, new Array(c.length).fill(false)])
    );
    for (let t = WARMUP; t < c.length - 1; t++) {
      const sl = c.slice(0, t + 1);
      const ev = exitSignals.evaluate(sl);
      if (ev.insufficient) continue;
      flags['X1 weekly lower highs (detected)'][t] = ev.X1 === 'detected';
      flags['X2 failed breakout (detected)'][t] = ev.X2 === 'detected';
      flags['X3 close<20EMA (detected)'][t] = ev.X3 === 'detected';
      flags['X3 close<50EMA (confirmed)'][t] = ev.X3 === 'confirmed';
      const d = X.distribution({ candles: sl });
      flags['X5 rising on falling volume'][t] = d.flags.includes('RISING_ON_FALLING_VOLUME');
      flags['X5 repeat failed breakouts (>=2/60d)'][t] =
        d.flags.includes('REPEAT_FAILED_BREAKOUTS');
      if (t % 10 === 0) {
        const e = { ticker: tk, date: dates[t] };
        for (const h of C.HORIZONS) {
          const r = C.fwdReturn(closes, t, h);
          const b = bench(dates[t + 1], h);
          e[`raw${h}`] = r;
          e[`ex${h}`] = r != null && b != null ? r - b : null;
        }
        e.dd21 = C.fwdDrawdown(closes, t, 21);
        baseline.push(e);
      }
    }
    for (const k of Object.keys(buckets)) {
      for (const i of C.onsets(flags[k], 20)) {
        const e = { ticker: tk, date: dates[i] };
        for (const h of C.HORIZONS) {
          const r = C.fwdReturn(closes, i, h);
          const b = bench(dates[i + 1], h);
          e[`raw${h}`] = r;
          e[`ex${h}`] = r != null && b != null ? r - b : null;
        }
        e.dd21 = C.fwdDrawdown(closes, i, 21);
        buckets[k].push(e);
      }
    }
  }

  const base = C.summarize(baseline);
  const summary = {};
  for (const [k, ev] of Object.entries(buckets)) {
    const s = C.summarize(ev);
    summary[k] = { ...s, verdict: C.exitVerdict(s, base), byYear: C.byYear(ev) };
  }
  summary['(baseline: every 10th day, all names)'] = { ...base, byYear: C.byYear(baseline) };

  const res = {
    ran: new Date().toISOString(),
    universe: {
      requested: tickers.length,
      withCandles: candles.size,
      droppedForSplitArtifacts: dropped.length,
      used: series.length,
      fetched,
    },
    window: {
      from: series[0] && series[0].dates[WARMUP],
      to: series[0] && series[0].dates[series[0].dates.length - 1],
    },
    caveats: [
      'survivorship bias: sample is names listed and liquid today',
      'benchmark = cross-sectional MEDIAN return over the same dates (not index); tickers with >30% one-day moves dropped as split artifacts',
      'overlapping forward windows and market-wide clustering make t-stats optimistic',
      'thresholds under test are production defaults, not tuned',
      'exit signal "supports" = negative excess return on both horizons with >=30 events and >52% negative',
    ],
    summary,
  };
  // keep event rows for follow-up analysis (clustering, medians)
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, `exit-replay-${new Date().toISOString().slice(0, 10)}.events.json`),
    JSON.stringify(buckets)
  );
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `exit-replay-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outFile, JSON.stringify(res, null, 2));
  console.log(JSON.stringify({ ...res, outFile }, null, 2));
}

if (require.main === module) {
  const jobName = resolveJobName('signal-calibration-replay');
  stockscans.setJobName(jobName);
  run()
    .catch((e) => {
      console.error('signalCalibrationReplay failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { pickUniverse, run, main };
