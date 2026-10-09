#!/usr/bin/env node
'use strict';

/**
 * sectorClustersDaily — script-only S1 detector: near-high names per industry vs industry size,
 * 5-session persistence, into the signal ledger (detector `sector-clusters`). Zero LLM.
 * Near-high definition = the user's saved Near Highs scan (same as near-highs-digest).
 *   node sectorClustersDaily.js [--dry-run] [--env-file path]
 */

const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { industryCounts, buildObservations } = require('./lib/sectorClusters');

const DETECTOR = 'sector-clusters';
const NEAR_HIGHS_SCAN_ID = '9493efc2c969d602c5dedbe2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function industries(filters, index, scanId) {
  const out = [];
  for (let offset = 0; ; offset += 50) {
    const payload = {
      ratiosType: 'Default',
      timePeriod: 'Latest',
      scan: {
        scanId,
        scanName: DETECTOR,
        scanDescription: '',
        industry: [],
        index: index || [],
        tags: [],
        watchlistIds: [],
        filters,
        alertFrequency: null,
      },
      watchlistIds: [],
      order: 'desc',
      orderBy: 'Market Capitalization',
      offset,
    };
    const d = await stockscans.runScan(payload, scanId);
    const t = d.table;
    if (!t || t.length <= 1) break;
    const i = t[0].indexOf('Industry') >= 0 ? t[0].indexOf('Industry') : t[0].indexOf('Sector');
    if (i < 0) throw new Error('no Industry/Sector column');
    out.push(...t.slice(1).map((r) => r[i]));
    if (offset + 50 >= d.total) break;
    await sleep(700);
  }
  return out;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');

  const def = await stockscans.getScanMetadata(NEAR_HIGHS_SCAN_ID);
  const near = await industries(def.filters, def.index, NEAR_HIGHS_SCAN_ID);
  const uni = await industries(
    [{ left: 'Market Capitalization', sign: '>=', right: '500' }],
    [],
    DETECTOR
  );
  const today = industryCounts(near, uni);
  const sessionDate = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

  const prior = db
    .find('events', { type: 'sector_snapshot' })
    .filter((e) => e.sessionDate < sessionDate)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((e) => e.counts);

  const observations = buildObservations(today, prior);
  let ledger = null;
  if (!dryRun) {
    const exists = db
      .find('events', { type: 'sector_snapshot' })
      .some((e) => e.sessionDate === sessionDate);
    if (!exists)
      db.appendEvents([
        {
          type: 'sector_snapshot',
          creator: DETECTOR,
          date: sessionDate,
          sessionDate,
          summary: `sector snapshot ${sessionDate}`,
          counts: today,
        },
      ]);
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
        nearHighs: near.length,
        universe: uni.length,
        priorSnapshots: prior.length,
        clusters: observations
          .filter((o) => o.state)
          .map((o) => ({ industry: o.entityId, state: o.state, ...o.evidence })),
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
      console.error('sectorClustersDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
