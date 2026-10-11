#!/usr/bin/env node
'use strict';
/**
 * sectorPeSnapshotWeekly — script-only weekly snapshot of industry P/E (median of constituents with P/E>0,
 * mcap >= Rs 500 Cr, plus the platform's own 'Industry PE Median'). Stockscans has no PE history, so this
 * accumulates it for the sector-PE-phase automation (re-rating phase / terminal-PE risk). Appends ONE event
 * per ISO week: type `sector_pe_snapshot`. Zero LLM. The phase evaluator is intentionally NOT built until
 * >= 26 weekly snapshots exist.
 *   node sectorPeSnapshotWeekly.js [--dry-run] [--env-file path]
 */
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const { aggregateByIndustry, weekKey } = require('./lib/sectorPe');

const DETECTOR = 'sector-pe-snapshot';
const payload = (offset) => ({
  ratiosType: 'Default',
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
      { left: 'Close Price', sign: '>', right: '0' },
    ],
  },
  watchlistIds: [],
  order: 'desc',
  orderBy: 'Market Capitalization',
  offset,
});

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const wk = weekKey(today);
  const existing = db.find('events', { type: 'sector_pe_snapshot' }).find((e) => e.week === wk);
  if (existing && !process.argv.includes('--force')) {
    console.log(JSON.stringify({ week: wk, skipped: 'snapshot for this ISO week already exists' }));
    return;
  }
  let header = null;
  const raw = [];
  for (let offset = 0; ; offset += 50) {
    const data = await stockscans.runScan(payload(offset), DETECTOR);
    const t = data.table;
    if (!t || t.length <= 1) break;
    header = header || t[0];
    raw.push(...t.slice(1));
    if (offset + 50 >= data.total) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!header) throw new Error('scan returned no rows');
  const ix = (n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`missing column ${n}`);
    return i;
  };
  const c = {
    pe: ix('Price To Earnings'),
    ind: ix('Industry'),
    sec: ix('Sector'),
    ipe: ix('Industry PE Median'),
  };
  const industries = aggregateByIndustry(
    raw.map((r) => ({
      industry: r[c.ind],
      sector: r[c.sec],
      pe: r[c.pe],
      industryPeMedian: r[c.ipe],
    }))
  );
  if (!dryRun)
    db.appendEvents([
      {
        type: 'sector_pe_snapshot',
        creator: DETECTOR,
        date: today,
        week: wk,
        summary: `sector PE snapshot ${wk} (${industries.length} industries)`,
        universe: raw.length,
        industries,
      },
    ]);
  console.log(
    JSON.stringify(
      {
        week: wk,
        dryRun,
        universe: raw.length,
        industries: industries.length,
        sample: industries.slice(0, 5),
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
      console.error('sectorPeSnapshotWeekly failed:', e.message);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
