#!/usr/bin/env node
'use strict';
/**
 * resultsSeasonPrepDaily — script-only pre-results watchlist of names whose last good result faded
 * (R1-faded-post-result). Zero LLM. Universe = Stockscans scan (mcap >= Rs 500 Cr, 20D turnover >= Rs 7 Cr,
 * Days From Result in [-120,-70] (negative = past)) using native columns; lib/resultsSeasonPrep.fadedState decides.
 * Daily concall list = Stockscans' native Concall Scans (platform-reuse; not rebuilt). Related-party /
 * negative-CFO flags need filing extracts — not covered. Ledger detector `results-season-prep`.
 *   node resultsSeasonPrepDaily.js [--dry-run] [--env-file path]
 */
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { fadedState, TH } = require('./lib/resultsSeasonPrep');

const DETECTOR = 'results-season-prep';
const SIGNAL = 'R1-faded-post-result';
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
      { left: 'Volume SMA 20D * SMA 20D', sign: '>=', right: '7' },
      { left: 'Days From Result', sign: '<=', right: String(-TH.minDaysFromResult) },
      { left: 'Days From Result', sign: '>=', right: String(-TH.maxDaysFromResult) },
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
  let header = null;
  const rows = [];
  for (let offset = 0; ; offset += 50) {
    const data = await stockscans.runScan(payload(offset), DETECTOR);
    const t = data.table;
    if (!t || t.length <= 1) break;
    header = header || t[0];
    rows.push(...t.slice(1));
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
    id: ix('companyId'),
    name: ix('Name'),
    d: ix('Days From Result'),
    r: ix('Returns Since Result'),
    p: ix('PAT Growth YoY'),
    ind: ix('Industry'),
  };
  const observations = rows.map((r) => {
    const m = { daysFromResult: r[c.d], returnsSinceResult: r[c.r], patGrowthYoY: r[c.p] };
    return {
      signalId: SIGNAL,
      entityType: 'company',
      entityId: r[c.id],
      state: fadedState(m),
      minMisses: 3,
      evidence: { name: r[c.name], industry: r[c.ind], ...m, calibrated: false },
    };
  });
  const sessionDate = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const ledger = dryRun
    ? null
    : signalLedger.applyObservations(observations, { detector: DETECTOR, date: sessionDate });
  const flagged = observations.filter((o) => o.state);
  console.log(
    JSON.stringify(
      {
        sessionDate,
        dryRun,
        screened: rows.length,
        detected: flagged.filter((o) => o.state === 'detected').length,
        confirmed: flagged.filter((o) => o.state === 'confirmed').length,
        sample: flagged
          .slice(0, 15)
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
      console.error('resultsSeasonPrepDaily failed:', e.message);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
