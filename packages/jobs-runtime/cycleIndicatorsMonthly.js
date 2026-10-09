#!/usr/bin/env node
'use strict';

/**
 * cycleIndicatorsMonthly — register + trend gauge for monthly India macro-cycle indicators.
 * The agent only FETCHES the published figure (WebSearch / official release) and calls `add`; direction logic is script.
 *   node cycleIndicatorsMonthly.js add --file readings.json [--dry-run]
 *     readings.json = [{indicator:'iip-yoy', period:'YYYY-MM', value:Number, unit:'%'|'index', sourceUrl:'https://..'}]
 *   node cycleIndicatorsMonthly.js run [--dry-run]   -> ledger 'C1-<indicator>' (entityType market, entityId india), detector `cycle-indicators`
 * Never invent a value: every reading needs an https source URL. Rule thresholds are ASSUMPTIONS (lib/cycleIndicators.js).
 */

const fs = require('fs');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { INDICATORS, evaluate } = require('./lib/cycleIndicators');

const DETECTOR = 'cycle-indicators';

function validate(r) {
  const err = [];
  if (!INDICATORS.includes(r.indicator))
    err.push(`indicator must be one of ${INDICATORS.join('|')}`);
  if (!/^\d{4}-\d{2}$/.test(r.period || '')) err.push('period must be YYYY-MM');
  if (!Number.isFinite(r.value)) err.push('value must be a number');
  if (!/^https:\/\//.test(r.sourceUrl || '')) err.push('https sourceUrl required');
  return err;
}

function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const cmd = process.argv[2];
  if (cmd === 'add') {
    const items = JSON.parse(fs.readFileSync(argValue('--file'), 'utf8'));
    const ok = [];
    const rejected = [];
    for (const r of items) {
      const e = validate(r);
      if (e.length) rejected.push({ indicator: r.indicator, period: r.period, errors: e });
      else
        ok.push({
          type: 'cycle_indicator',
          creator: DETECTOR,
          date: `${r.period}-01`,
          summary: `${r.indicator} ${r.period}`,
          indicator: r.indicator,
          period: r.period,
          value: r.value,
          unit: r.unit || null,
          sourceUrl: r.sourceUrl,
        });
    }
    const stats = !dryRun && ok.length ? db.appendEvents(ok) : null;
    console.log(
      JSON.stringify(
        {
          added: ok.length,
          rejected,
          stats,
          dryRun,
          filesTouched: dryRun ? [] : db.touchedFiles(),
        },
        null,
        2
      )
    );
    return;
  }
  if (cmd === 'run') {
    const all = db.find('events', { type: 'cycle_indicator' });
    const observations = [];
    const report = [];
    for (const ind of INDICATORS) {
      const ev = evaluate(
        all.filter((e) => e.indicator === ind).map((e) => ({ period: e.period, value: e.value }))
      );
      if (!ev) continue;
      report.push({ indicator: ind, ...ev });
      observations.push({
        signalId: `C1-${ind}`,
        entityType: 'market',
        entityId: 'india',
        state: ev.state,
        minMisses: 1,
        evidence: { ...ev, calibrated: false },
      });
    }
    const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const ledger =
      !dryRun && observations.length
        ? signalLedger.applyObservations(observations, { detector: DETECTOR, date })
        : null;
    console.log(
      JSON.stringify(
        { date, report, ledger, dryRun, filesTouched: dryRun ? [] : db.touchedFiles() },
        null,
        2
      )
    );
    return;
  }
  throw new Error('usage: cycleIndicatorsMonthly.js add --file f.json | run [--dry-run]');
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  try {
    main();
  } catch (e) {
    console.error('cycleIndicatorsMonthly failed:', e.message);
    process.exitCode = 1;
  }
  apiUsageTracker.flush(jobName);
}
module.exports = { validate };
