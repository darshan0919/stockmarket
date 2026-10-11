#!/usr/bin/env node
'use strict';
/**
 * sectorRotationDaily — script-only sector layer. Zero LLM.
 *   S3-focus-concentration : daily; industries holding >= 3 (and >= 25%) of the names currently in an entry-side state
 *                            (ledger E1 / E2 / MTF-flush); no API calls (industry from data/companies.json).
 *   S2-sector-rs-rising / X4-sector-rs-rollover : once per ISO week (or --force); industry median 1M/3M return vs the
 *                            Nifty 500 median from one Stockscans 'Performance' scan; weekly snapshot event `sector_rs_snapshot`
 *                            so next week's S2 can test that RS is actually rising.
 * Ledger entityType sector, detector `sector-rotation`. Thresholds are ASSUMPTIONS (lib/sectorRotation.js).
 *   node sectorRotationDaily.js [--dry-run] [--force] [--skip-rs] [--env-file path]
 */
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { istDate } = require('./lib/ist');
const { weekKey } = require('./lib/sectorPe');
const R = require('./lib/sectorRotation');

const DETECTOR = 'sector-rotation';
const FOCUS_SIGNALS = ['E1-base-breakout', 'E2-pullback', 'MTF-flush'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function performanceRows() {
  const out = [];
  for (let offset = 0; offset < 1500; offset += 50) {
    const d = await stockscans.runScan(
      {
        ratiosType: 'Performance', timePeriod: 'Latest', watchlistIds: [], order: 'desc', orderBy: 'Market Capitalization', offset,
        scan: { scanId: DETECTOR, scanName: DETECTOR, scanDescription: '', industry: [], index: ['Nifty 500'], tags: [], watchlistIds: [], alertFrequency: null,
          filters: [{ left: 'Close Price', sign: '>', right: '0' }] },
      },
      DETECTOR
    );
    const t = d.table;
    if (!t || t.length <= 1) break;
    const ix = (n) => { const i = t[0].indexOf(n); if (i < 0) throw new Error(`missing column ${n}`); return i; };
    const c = { id: ix('companyId'), r1m: ix('Returns 1M'), r3m: ix('Returns 3M') };
    for (const r of t.slice(1)) out.push({ id: r[c.id], r1m: r[c.r1m], r3m: r[c.r3m] });
    if (offset + 50 >= d.total) break;
    await sleep(1000);
  }
  return out;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const db = require('./lib/db');
  const today = istDate().toISOString().slice(0, 10);
  const wk = weekKey(today);
  const errors = [];
  const industryOf = new Map(db.find('companies', {}).map((c) => [c.id, c.industry]));

  // S3 (daily)
  const focusIds = [...new Set(signalLedger.getStates({ signalIds: FOCUS_SIGNALS, entityType: 'company', activeOnly: true }).map((r) => r.entityId))];
  const s3 = R.focusConcentration(focusIds.map((id) => ({ id, industry: industryOf.get(id) || null })));
  const observations = [...s3.observations];

  // S2 / X4 (weekly)
  let rs = null;
  const snaps = db.find('events', { type: 'sector_rs_snapshot' }).sort((a, b) => (a.date < b.date ? -1 : 1));
  const thisWeek = snaps.find((e) => e.week === wk);
  if (!process.argv.includes('--skip-rs') && (!thisWeek || force)) {
    try {
      const rows = await performanceRows();
      const withInd = rows.map((r) => ({ industry: industryOf.get(r.id) || null, r1m: r.r1m, r3m: r.r3m }));
      const table = R.industryRs(withInd.filter((r) => r.industry));
      const prev = [...snaps].reverse().find((e) => e.week !== wk);
      const obs = R.rsObservations(table, prev ? prev.industries : null);
      observations.push(...obs);
      rs = { universe: rows.length, mapped: withInd.filter((r) => r.industry).length, table, prevWeek: prev ? prev.week : null };
      if (!dryRun)
        db.appendEvents([{ type: 'sector_rs_snapshot', creator: DETECTOR, date: today, week: wk, summary: `sector RS snapshot ${wk} (${table.industries.length} industries)`, mkt1m: table.mkt1m, mkt3m: table.mkt3m, industries: table.industries }]);
    } catch (e) {
      errors.push(`S2: ${e.message}`);
    }
  }

  const ledger = !dryRun && !errors.length ? signalLedger.applyObservations(observations, { detector: DETECTOR, date: today }) : null;
  console.log(JSON.stringify({
    sessionDate: today, week: wk, dryRun, errors,
    s3: { focusNames: focusIds.length, mappedIndustries: s3.size, insufficient: s3.insufficient },
    s2: rs ? { universe: rs.universe, mapped: rs.mapped, mkt1m: rs.table.mkt1m, mkt3m: rs.table.mkt3m, industries: rs.table.industries.length, prevWeek: rs.prevWeek,
      top: rs.table.industries.slice(0, 5), bottom: rs.table.industries.slice(-5) } : { skipped: thisWeek ? 'snapshot for this ISO week exists' : 'skipped' },
    flagged: observations.filter((o) => o.state).map((o) => ({ signal: o.signalId, industry: o.entityId, state: o.state, rs1: o.evidence.rs1, rs3: o.evidence.rs3, names: o.evidence.names })),
    ledger, filesTouched: dryRun ? [] : db.touchedFiles(),
  }, null, 2));
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  stockscans.setJobName(jobName);
  main().catch((e) => { console.error('sectorRotationDaily failed:', e); process.exit(1); }).finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
