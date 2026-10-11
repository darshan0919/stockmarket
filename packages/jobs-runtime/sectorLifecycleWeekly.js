#!/usr/bin/env node
'use strict';
/**
 * sectorLifecycleWeekly — script-only sector lifecycle / crowding context (S4). Zero LLM.
 * Per industry (>= 5 names with mcap >= Rs 100 Cr): equal-weight index of its 8 largest names from 4y daily candles
 * (cached in data/cache/sector-lifecycle-ohlcv/, refreshed when > 6 days old); price run (24M low -> now), IPO listings in the
 * last 12 months (IPOPlatform), sector P/E vs its earliest snapshots (n/a until 26 weekly `sector_pe_snapshot`s).
 * Writes event `sector_lifecycle_snapshot` (once per ISO week, --force to redo) and ledger observations S4-sector-lifecycle-crowding
 * (entityType sector, detector `sector-lifecycle`). CONTEXT ONLY. Defaults are the user's, uncalibrated (lib/sectorLifecycle.js).
 * Needs data/cache/ipo-supply-universe.json (written by ipo-supply-daily) for market caps.
 *   node sectorLifecycleWeekly.js [--dry-run] [--force] [--no-fetch] [--max-fetch N] [--env-file path]
 */
const fs = require('fs');
const path = require('path');
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { istDate } = require('./lib/ist');
const { weekKey } = require('./lib/sectorPe');
const { fetchPerformanceWindow } = require('./ipoBacktest');
const L = require('./lib/sectorLifecycle');

const DETECTOR = 'sector-lifecycle';
const SIGNAL = 'S4-sector-lifecycle-crowding';
const ROOT = path.join(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache', 'sector-lifecycle-ohlcv');
const UNIVERSE = path.join(ROOT, 'data', 'cache', 'ipo-supply-universe.json');
const TOP_N = 8;
const STALE_MS = 6 * 86400000;
const safe = (t) => t.replace(/[^A-Za-z0-9_-]/g, '_');

async function loadCandles(ids, noFetch, maxFetch) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const out = new Map();
  const queue = [...ids];
  let fetched = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (queue.length) {
        const id = queue.shift();
        const f = path.join(CACHE_DIR, `${safe(id)}.json`);
        let have = null;
        let fresh = false;
        try {
          have = JSON.parse(fs.readFileSync(f, 'utf8'));
          fresh = Date.now() - fs.statSync(f).mtimeMs < STALE_MS;
        } catch (_) {
          /* none */
        }
        if (have && (fresh || noFetch || fetched >= maxFetch)) {
          out.set(id, have);
          continue;
        }
        if (noFetch || fetched >= maxFetch) continue;
        try {
          const d = await stockscans.ohlcv(id, { tf: '1D' });
          fetched++;
          if (d.prices && d.prices.length >= 120) {
            fs.writeFileSync(f, JSON.stringify(d.prices));
            out.set(id, d.prices);
          } else if (have) out.set(id, have);
          await new Promise((r) => setTimeout(r, 700));
        } catch (e) {
          failed++;
          if (have) out.set(id, have);
          console.error(`[sector-lifecycle] ${id}: ${e.message}`);
        }
      }
    })
  );
  return { candles: out, fetched, failed };
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const noFetch = process.argv.includes('--no-fetch');
  const maxFetch = Number(argValue('--max-fetch') || 100000);
  const db = require('./lib/db');
  const today = istDate().toISOString().slice(0, 10);
  const wk = weekKey(today);
  const errors = [];

  if (
    !force &&
    db.find('events', { type: 'sector_lifecycle_snapshot' }).some((e) => e.week === wk)
  ) {
    console.log(
      JSON.stringify({ week: wk, skipped: 'snapshot for this ISO week exists (use --force)' })
    );
    return;
  }
  let uni;
  try {
    uni = new Map(JSON.parse(fs.readFileSync(UNIVERSE, 'utf8')).rows);
  } catch (e) {
    throw new Error(`need ${UNIVERSE} (run ipo-supply-daily first): ${e.message}`);
  }

  const members = new Map(); // industry -> [{id, mcap}]
  for (const c of db.find('companies', {})) {
    const u = uni.get(c.id);
    if (!c.industry || !u || !(u.mcap >= 100)) continue;
    (members.get(c.industry) || members.set(c.industry, []).get(c.industry)).push({
      id: c.id,
      mcap: u.mcap,
    });
  }
  const industries = [...members].filter(([, m]) => m.length >= L.TH.minMembers);
  const picks = new Map(
    industries.map(([ind, m]) => [
      ind,
      m
        .filter((x) => x.mcap >= L.TH.indexMcapCr)
        .sort((a, b) => b.mcap - a.mcap)
        .slice(0, TOP_N)
        .map((x) => x.id),
    ])
  );
  const { candles, fetched, failed } = await loadCandles(
    [...new Set([...picks.values()].flat())],
    noFetch,
    maxFetch
  );

  // IPO listings, last 12 months, mainboard NSE
  const listingsByInd = new Map();
  try {
    const from = new Date(Date.parse(today) - 365 * 86400000).toISOString().slice(0, 10);
    const industryOf = new Map(db.find('companies', {}).map((c) => [c.id, c.industry]));
    for (const r of await fetchPerformanceWindow({
      fromDate: from,
      toDate: today,
      ipoType: 'mainboard',
    })) {
      const ind = r.nse_script_symbol ? industryOf.get(`NSE:${r.nse_script_symbol}`) : null;
      if (ind) (listingsByInd.get(ind) || listingsByInd.set(ind, []).get(ind)).push(r.ipo_year);
    }
  } catch (e) {
    errors.push(`ipo: ${e.message}`);
  }

  const peSnaps = db
    .find('events', { type: 'sector_pe_snapshot' })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => e.industries || []);

  const rows = [];
  for (const [ind, m] of industries) {
    const mc = picks
      .get(ind)
      .map((id) => candles.get(id))
      .filter(Boolean);
    const minStart = new Date(Date.parse(today) - (L.TH.windowDays - 15) * 86400000)
      .toISOString()
      .slice(0, 10);
    const { series, used } = L.sectorIndex(mc, L.TH, minStart);
    const price =
      used >= L.TH.minIndexMembers ? L.priceTest(series) : { flag: null, insufficient: true };
    const supply = L.supplyTest(listingsByInd.get(ind) || [], m.length, today);
    const pe = L.peTest(ind, peSnaps);
    const ev = L.evaluate({ price, supply, pe });
    rows.push({
      industry: ind,
      names: m.length,
      indexMembers: used,
      state: ev.state,
      flags: ev.flags,
      phase: ev.phase,
      price,
      supply,
      pe,
    });
  }
  rows.sort((a, b) => (b.price.x || 0) - (a.price.x || 0));
  const observations = rows.map((r) => ({
    signalId: SIGNAL,
    entityType: 'sector',
    entityId: r.industry,
    state: r.state,
    minMisses: 2,
    evidence: {
      flags: r.flags,
      phase: r.phase,
      priceX: r.price.x ?? null,
      monthsSinceLow: r.price.monthsSinceLow ?? null,
      ipos12m: r.supply.ipos12m,
      peRatio: r.pe.ratio ?? null,
      calibrated: false,
    },
  }));

  if (!dryRun)
    db.appendEvents([
      {
        type: 'sector_lifecycle_snapshot',
        creator: DETECTOR,
        date: today,
        week: wk,
        summary: `sector lifecycle snapshot ${wk} (${rows.length} industries)`,
        industries: rows.map((r) => ({
          industry: r.industry,
          state: r.state,
          phase: r.phase,
          flags: r.flags,
          priceX: r.price.x ?? null,
          runStart: r.price.runStart ?? null,
          monthsSinceLow: r.price.monthsSinceLow ?? null,
          drawdownPct: r.price.drawdownPct ?? null,
          ipos12m: r.supply.ipos12m,
          peRatio: r.pe.ratio ?? null,
        })),
      },
    ]);
  const ledger =
    !dryRun && !errors.length
      ? signalLedger.applyObservations(observations, { detector: DETECTOR, date: today })
      : null;

  console.log(
    JSON.stringify(
      {
        sessionDate: today,
        week: wk,
        dryRun,
        errors,
        industries: rows.length,
        candleFetch: { fetched, failed, have: candles.size },
        peSnapshots: peSnaps.length,
        flagged: rows
          .filter((r) => r.state)
          .map((r) => ({
            industry: r.industry,
            state: r.state,
            flags: r.flags,
            phase: r.phase,
            priceX: r.price.x,
            monthsSinceLow: r.price.monthsSinceLow,
            ipos12m: r.supply.ipos12m,
            names: r.names,
          })),
        fading: rows
          .filter((r) => r.phase === 'fading')
          .map((r) => ({
            industry: r.industry,
            peakX: r.price.peakX,
            drawdownPct: r.price.drawdownPct,
          })),
        top10ByRun: rows
          .slice(0, 10)
          .map((r) => ({
            industry: r.industry,
            x: r.price.x,
            phase: r.phase,
            ipos12m: r.supply.ipos12m,
          })),
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
      console.error('sectorLifecycleWeekly failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
