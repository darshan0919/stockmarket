#!/usr/bin/env node
'use strict';

/**
 * resultsHistoryPackUniverse — the pre-result universe for `results-history-pack-daily`.
 * Zero LLM. Companies whose result is due in the next `--max-days` days (Stockscans
 * "Days From Result" >= 0 = upcoming; negative = past) with market cap >= `--min-mcap` Cr,
 * soonest first, each with the status of its quarterly-result-history pack so the job only
 * spends reasoning on transcripts that still lack a concall digest.
 *
 *   node resultsHistoryPackUniverse.js [--min-days 0] [--max-days 3] [--min-mcap 500] [--limit 25]
 */
const { stockscans } = require('@stock/api');
const { latestCompletedQuarter } = require('@stock/api/utils/fiscalQuarter');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const { quarterEndIso } = require('./lib/resultHistory/period');
const { REPORT_TYPE } = require('./lib/resultHistory/historyPack');

const SCAN_ID = 'results-history-pack-universe';
const PAGE = 50;

/**
 * Scan payload for upcoming results.
 * @param {{minDays: number, maxDays: number, minMcap: number}} th
 * @param {number} offset
 * @returns {Object}
 */
function payload({ minDays, maxDays, minMcap }, offset) {
  return {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: {
      scanId: SCAN_ID,
      scanName: SCAN_ID,
      scanDescription: '',
      industry: [],
      index: [],
      tags: [],
      watchlistIds: [],
      alertFrequency: null,
      filters: [
        { left: 'Market Capitalization', sign: '>=', right: String(minMcap) },
        { left: 'Days From Result', sign: '>=', right: String(minDays) },
        { left: 'Days From Result', sign: '<=', right: String(maxDays) },
      ],
    },
    watchlistIds: [],
    order: 'asc',
    orderBy: 'Days From Result',
    offset,
  };
}

/**
 * Turn scan table rows into universe entries, soonest result first, larger caps first. Pure.
 * @param {Array<string>} header
 * @param {Array<Array>} rows
 * @returns {Array<{companyId: string, name: string, daysFromResult: number, marketCapCr: number}>}
 */
function toUniverse(header, rows) {
  const ix = (n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`missing column ${n}`);
    return i;
  };
  const c = {
    id: ix('companyId'),
    name: ix('Name'),
    d: ix('Days From Result'),
    m: ix('Market Capitalization'),
  };
  return rows
    .map((r) => ({
      companyId: r[c.id],
      name: r[c.name],
      daysFromResult: r[c.d],
      marketCapCr: r[c.m],
    }))
    .filter((u) => u.companyId && Number.isFinite(u.daysFromResult) && u.daysFromResult >= 0)
    .sort((a, b) => a.daysFromResult - b.daysFromResult || b.marketCapCr - a.marketCapCr);
}

/**
 * Pack status for one company's target quarter (informational — the builder re-resolves it).
 * @param {Object} db
 * @param {string} companyId
 * @param {string} targetYyyymm
 * @returns {{packId: string|null, complete: boolean, pending: string[]}}
 */
function packStatus(db, companyId, targetYyyymm) {
  const idx = (
    db.find('reports', { type: REPORT_TYPE, companyId, date: quarterEndIso(targetYyyymm) }) || []
  ).pop();
  const pack = idx ? db.readReport(idx.id) : null;
  return {
    packId: pack ? pack.id : null,
    complete: !!(pack && pack.digestCoverage && pack.digestCoverage.complete),
    pending: (pack && pack.digestCoverage && pack.digestCoverage.pending) || [],
  };
}

async function main() {
  loadEnv(argValue('--env-file'));
  const db = require('./lib/db');
  const th = {
    minDays: Number(argValue('--min-days') || 0),
    maxDays: Number(argValue('--max-days') || 3),
    minMcap: Number(argValue('--min-mcap') || 500),
  };
  const limit = Number(argValue('--limit') || 25);
  const first = await stockscans.runScan(payload(th, 0), SCAN_ID);
  const header = first.table && first.table[0];
  if (!header) throw new Error('scan returned no header');
  const pages = [first];
  const more = [];
  for (let off = PAGE; off < (first.total || 0); off += PAGE) more.push(off);
  pages.push(
    ...(await Promise.all(more.map((off) => stockscans.runScan(payload(th, off), SCAN_ID))))
  );
  const rows = pages.flatMap((p) => Object.values(p.table || {}).slice(1));
  const target = latestCompletedQuarter(new Date()).yyyymm;
  const universe = toUniverse(header, rows);
  const companies = universe
    .slice(0, limit)
    .map((u) => ({ ...u, ...packStatus(db, u.companyId, target) }));
  console.log(
    JSON.stringify(
      {
        thresholds: th,
        targetQuarterHint: target,
        screened: universe.length,
        count: companies.length,
        needsDigests: companies.filter((c) => !c.complete).length,
        companies,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  const jobName = resolveJobName('results-history-pack-daily');
  stockscans.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('resultsHistoryPackUniverse failed:', e.message);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { payload, toUniverse, packStatus };
