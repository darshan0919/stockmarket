#!/usr/bin/env node
'use strict';
/**
 * valuationStretchDaily — script-only SOIC valuation-stretch detector (V1). Zero LLM.
 * Universe = Stockscans scan (mcap >= Rs 500 Cr, 20D turnover >= Rs 7 Cr) with Price To Earnings,
 * PEG and Industry PE Median columns; flags via lib/valuationStretch. Weak regime = active
 * M4-deep-correction / M3-weak-macro ledger state. Writes ledger signal V1-valuation-stretch
 * (detector `valuation-stretch`). Valuation is a context flag, not a trade signal.
 *   node valuationStretchDaily.js [--dry-run] [--env-file path]
 */
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { evaluate } = require('./lib/valuationStretch');

const DETECTOR = 'valuation-stretch';
const SIGNAL = 'V1-valuation-stretch';
const PAGE_DELAY_MS = 700;

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
      { left: 'Close Price', sign: '>', right: '0' },
    ],
  },
  watchlistIds: [],
  order: 'desc',
  orderBy: 'Market Capitalization',
  offset,
});

async function fetchUniverse() {
  let header = null;
  const rows = [];
  for (let offset = 0; ; offset += 50) {
    const data = await stockscans.runScan(payload(offset), DETECTOR);
    const t = data.table;
    if (!t || t.length <= 1) break;
    header = header || t[0];
    rows.push(...t.slice(1));
    if (offset + 50 >= data.total) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  if (!header) throw new Error('universe scan returned no rows');
  const ix = (n) => header.indexOf(n);
  const c = {
    id: ix('companyId'),
    name: ix('Name'),
    pe: ix('Price To Earnings'),
    peg: ix('PEG'),
    ind: ix('Industry PE Median'),
  };
  const missing = Object.entries(c)
    .filter(([, i]) => i < 0)
    .map(([k]) => k);
  if (missing.length) throw new Error(`universe scan missing columns: ${missing.join(',')}`);
  return rows.map((r) => ({
    id: r[c.id],
    name: r[c.name],
    pe: r[c.pe],
    peg: r[c.peg],
    industryPe: r[c.ind],
  }));
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const universe = await fetchUniverse();
  const weakRegime =
    signalLedger.getStates({
      signalIds: ['M4-deep-correction', 'M3-weak-macro'],
      entityType: 'market',
      activeOnly: true,
    }).length > 0;
  const sessionDate = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const observations = universe.map((u) => {
    const ev = evaluate({ pe: u.pe, peg: u.peg, industryPe: u.industryPe, weakRegime });
    return {
      signalId: SIGNAL,
      entityType: 'company',
      entityId: u.id,
      state: ev.state,
      minMisses: 3,
      evidence: { name: u.name, flags: ev.flags, ...ev.evidence },
    };
  });
  const flagged = observations.filter((o) => o.state);
  const ledger = dryRun
    ? null
    : signalLedger.applyObservations(observations, { detector: DETECTOR, date: sessionDate });
  console.log(
    JSON.stringify(
      {
        sessionDate,
        dryRun,
        weakRegime,
        universe: universe.length,
        detected: flagged.filter((o) => o.state === 'detected').length,
        confirmed: flagged.filter((o) => o.state === 'confirmed').length,
        sample: flagged
          .slice(0, 15)
          .map((o) => ({
            id: o.entityId,
            name: o.evidence.name,
            state: o.state,
            flags: o.evidence.flags,
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
      console.error('valuationStretchDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main, fetchUniverse };
