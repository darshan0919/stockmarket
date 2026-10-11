#!/usr/bin/env node
'use strict';
/**
 * funnelGapsDaily — script-only SOIC funnel gap lists (F1 EPS-growth >25% QoQ, F2 IPO < 1 year) with
 * the playbook's liquidity (>= Rs 7 Cr 20D turnover) and cap-band filters. Zero LLM. Writes ledger
 * signals F1-eps-growth / F2-recent-ipo (detector `funnel-gaps`), entityType company.
 * Group-by-count digest = `by_industry` in the output (feed to the existing digest later).
 *   node funnelGapsDaily.js [--dry-run] [--min-mcap 500] [--max-mcap N] [--env-file path]
 */
const { stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const fs = require('fs');
const { epsGrowth, recentIpo, T } = require('./lib/funnelGaps');

const DETECTOR = 'funnel-gaps';
const PAGE_DELAY_MS = 700;

function payload(offset, minMcap, maxMcap) {
  const filters = [
    { left: 'Market Capitalization', sign: '>=', right: String(minMcap) },
    { left: 'Volume SMA 20D * SMA 20D', sign: '>=', right: '7' },
    { left: 'PAT Growth QoQ', sign: '>', right: '25' },
    { left: 'Close Price', sign: '>', right: '0' },
  ];
  if (maxMcap) filters.push({ left: 'Market Capitalization', sign: '<=', right: String(maxMcap) });
  return {
    ratiosType: 'Default', timePeriod: 'Latest',
    scan: { scanId: DETECTOR, scanName: DETECTOR, scanDescription: '', industry: [], index: [], tags: [], watchlistIds: [], alertFrequency: null, filters },
    watchlistIds: [], order: 'desc', orderBy: 'Market Capitalization', offset,
  };
}

async function fetchRows(minMcap, maxMcap) {
  let header = null;
  const rows = [];
  for (let offset = 0; ; offset += 50) {
    const data = await stockscans.runScan(payload(offset, minMcap, maxMcap), DETECTOR);
    const t = data.table;
    if (!t || t.length <= 1) break;
    header = header || t[0];
    rows.push(...t.slice(1));
    if (offset + 50 >= data.total) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  if (!header) return [];
  const ix = (n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`scan missing column ${n}`);
    return i;
  };
  const c = { id: ix('companyId'), name: ix('Name'), qoq: ix('PAT Growth QoQ'), ind: ix('Industry') };
  return rows.map((r) => ({ id: r[c.id], name: r[c.name], patQoQ: r[c.qoq], industry: r[c.ind] }));
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const minMcap = Number(argValue('--min-mcap') || 500);
  const maxMcap = Number(argValue('--max-mcap') || 0) || null;
  const db = require('./lib/db');
  const rows = await fetchRows(minMcap, maxMcap);
  // A name with >= T.ipoMaxCandles candles can never become a <1y IPO again -> cache it and skip the OHLCV call.
  const seasonedFile = db.cachePath('funnel-gaps-seasoned.json');
  let seasoned = {};
  try { seasoned = JSON.parse(fs.readFileSync(seasonedFile, 'utf8')); } catch (e) { seasoned = {}; }

  const observations = [];
  const errors = [];
  let sessionDate = null;
  const queue = [...rows];
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const u = queue.shift();
      const common = { entityType: 'company', entityId: u.id, evidence: { name: u.name, industry: u.industry, patGrowthQoQ: u.patQoQ, proxy: 'PAT as EPS', calibrated: false } };
      observations.push({ ...common, signalId: 'F1-eps-growth', state: epsGrowth(u.patQoQ), minMisses: 3 });
      if (seasoned[u.id]) continue;
      try {
        const d = await stockscans.ohlcv(u.id, { tf: '1D' });
        sessionDate = sessionDate || d.prices[d.prices.length - 1][0];
        if (d.prices.length >= T.ipoMaxCandles) seasoned[u.id] = 1;
        observations.push({ ...common, signalId: 'F2-recent-ipo', state: recentIpo(d.prices.length), minMisses: 3,
          evidence: { ...common.evidence, candles: d.prices.length } });
      } catch (e) { errors.push(`${u.id}: ${e.message}`); }
    }
  }));

  sessionDate = sessionDate || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  fs.writeFileSync(seasonedFile, JSON.stringify(seasoned));
  const ledger = !dryRun && sessionDate ? signalLedger.applyObservations(observations, { detector: DETECTOR, date: sessionDate }) : null;
  const byIndustry = {};
  for (const o of observations) if (o.state && o.signalId === 'F1-eps-growth') byIndustry[o.evidence.industry] = (byIndustry[o.evidence.industry] || 0) + 1;
  console.log(JSON.stringify({
    sessionDate, dryRun, minMcap, maxMcap, screened: rows.length, errors,
    f1: observations.filter((o) => o.signalId === 'F1-eps-growth' && o.state).length,
    f2: observations.filter((o) => o.signalId === 'F2-recent-ipo' && o.state).map((o) => ({ id: o.entityId, name: o.evidence.name, candles: o.evidence.candles })),
    by_industry: Object.entries(byIndustry).sort((a, b) => b[1] - a[1]).slice(0, 15),
    ledger, filesTouched: dryRun ? [] : db.touchedFiles(),
  }, null, 2));
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  stockscans.setJobName(jobName);
  main().catch((e) => { console.error('funnelGapsDaily failed:', e); process.exit(1); })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
