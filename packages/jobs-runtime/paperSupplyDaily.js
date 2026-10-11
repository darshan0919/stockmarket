#!/usr/bin/env node
'use strict';
/**
 * paperSupplyDaily — script-only "paper supply at high valuation" watch. Zero LLM.
 *   P1-highpe-block-sell : NSE BLOCK-deal SELL value over the last 5 sessions in names with P/E > 50
 *   P2-highpe-fundraise  : QIP / preferential-issue announcements in the last 7 days in names with P/E > 50
 * High-PE universe = Stockscans scan (mcap >= Rs 300 Cr, P/E > 50). Ledger entityType company, detector
 * `paper-supply`. Thresholds are ASSUMPTIONS (lib/paperSupply.js). Bulk deals excluded (70-row cap).
 * Announcement keyword search is noisy; lib/paperSupply.fundraiseKind filters on title/description.
 *   node paperSupplyDaily.js [--dry-run] [--env-file path]
 */
const { stockscans, nse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const P = require('./lib/paperSupply');

const DETECTOR = 'paper-supply';
const PAGE_DELAY_MS = 700;
const ddmmyyyy = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const peScan = (offset) => ({
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
      { left: 'Market Capitalization', sign: '>=', right: '300' },
      { left: 'Price To Earnings', sign: '>', right: String(P.TH.pe) },
    ],
  },
  watchlistIds: [],
  order: 'desc',
  orderBy: 'Market Capitalization',
  offset,
});

async function highPeUniverse() {
  let header = null;
  const rows = [];
  for (let offset = 0; ; offset += 50) {
    const data = await stockscans.runScan(peScan(offset), DETECTOR);
    const t = data.table;
    if (!t || t.length <= 1) break;
    header = header || t[0];
    rows.push(...t.slice(1));
    if (offset + 50 >= data.total) break;
    await sleep(PAGE_DELAY_MS);
  }
  const m = new Map();
  if (!header) return m;
  const c = {
    id: header.indexOf('companyId'),
    name: header.indexOf('Name'),
    pe: header.indexOf('Price To Earnings'),
  };
  if (Object.values(c).some((i) => i < 0)) throw new Error('PE scan missing columns');
  for (const r of rows) m.set(r[c.id], { name: r[c.name], pe: r[c.pe] });
  return m;
}

async function recentBlockSells(todayIso, errors) {
  const days = [];
  for (let i = 0; days.length < 5 && i < 12; i++) {
    const d = new Date(Date.parse(todayIso) - i * 86400000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d);
  }
  const all = [];
  for (const d of days) {
    try {
      all.push(...(await nse.getHistoricalBlockDeals(ddmmyyyy(d), ddmmyyyy(d))));
    } catch (e) {
      errors.push(`${d.toISOString().slice(0, 10)}: ${e.message}`);
    }
    await sleep(400);
  }
  return P.sellValueBySymbol(all);
}

async function recentFundraises(todayIso, errors) {
  const cutoff = new Date(Date.parse(todayIso) - 7 * 86400000).toISOString().slice(0, 10);
  const quarters = new Set([P.quarterDate(todayIso), P.quarterDate(cutoff)]);
  const found = new Map();
  for (const q of quarters) {
    for (let offset = 0; offset < 600; ) {
      let page;
      try {
        page = await stockscans.scanAnnouncements({
          scan: {
            scanId: '59822b15a2859d183df3770d',
            scanName: 'Recordings',
            filters: [],
            industry: [],
            index: [],
            watchlistIds: [],
            searchFilters: [
              'QIP',
              'qualified institutions placement',
              'preferential issue',
              'preferential allotment',
            ],
            announcementType: 'All',
            alerts: false,
            searchMode: 'full',
            companyIds: [],
            companyFilters: [],
          },
          offset,
          quarterDate: q,
        });
      } catch (e) {
        errors.push(`announcements ${q}@${offset}: ${e.message}`);
        break;
      }
      const items = page.announcements || [];
      if (!items.length) break;
      for (const a of items) {
        if (a.date < cutoff) continue;
        const kind = P.fundraiseKind(a);
        if (kind && !found.has(a.companyId))
          found.set(a.companyId, { kind, title: a.title, date: a.date, name: a.name });
      }
      offset += items.length;
      if (offset >= page.total) break;
      await sleep(PAGE_DELAY_MS);
    }
  }
  return found;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const errors = [];
  const todayIso = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

  const pe = await highPeUniverse();
  const blocks = await recentBlockSells(todayIso, errors);
  const raises = await recentFundraises(todayIso, errors);

  const observations = [];
  for (const [sym, cr] of blocks) {
    const id = `NSE:${sym}`;
    const u = pe.get(id);
    if (!u) continue;
    observations.push({
      signalId: 'P1-highpe-block-sell',
      entityType: 'company',
      entityId: id,
      state: P.blockSellState(cr, u.pe),
      minMisses: 2,
      evidence: { name: u.name, pe: u.pe, sellValueCr5d: Math.round(cr), calibrated: false },
    });
  }
  for (const [id, f] of raises) {
    const u = pe.get(id);
    if (!u) continue;
    observations.push({
      signalId: 'P2-highpe-fundraise',
      entityType: 'company',
      entityId: id,
      state: P.fundraiseState(f.kind, u.pe),
      minMisses: 3,
      evidence: {
        name: u.name,
        pe: u.pe,
        kind: f.kind,
        title: f.title,
        announced: f.date,
        calibrated: false,
      },
    });
  }
  const ledger =
    !dryRun && !errors.length
      ? signalLedger.applyObservations(observations, { detector: DETECTOR, date: todayIso })
      : null;
  console.log(
    JSON.stringify(
      {
        sessionDate: todayIso,
        dryRun,
        errors,
        highPeUniverse: pe.size,
        blockSymbols: blocks.size,
        fundraisesFound: raises.size,
        flagged: observations
          .filter((o) => o.state)
          .map((o) => ({ id: o.entityId, signal: o.signalId, state: o.state, ...o.evidence })),
        ledger,
        filesTouched: dryRun ? [] : db.touchedFiles(),
      },
      null,
      2
    )
  );
  if (errors.length && !dryRun) process.exitCode = 1;
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  stockscans.setJobName(jobName);
  nse.setJobName && nse.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('paperSupplyDaily failed:', e.message);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
