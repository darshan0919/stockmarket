#!/usr/bin/env node
'use strict';
/**
 * ipoSupplyDaily — script-only IPO / OFS supply watch (paper-supply, second leg). Zero LLM.
 *   P3-ipo-review-window : NSE-listed mainboard IPOs 12-18m (extended to 24m if cooled+growing) after listing
 *   P4-lockin-expiry     : SEBI lock-in expiries (anchor +30d/+90d, pre-IPO holders +6m, promoter min. contribution +18m) due within -2..+5 days
 *   P5-ofs-announcement  : offer-for-sale mentions in NSE corporate announcements (desc + text), last 7 days
 * IPO facts from IPOPlatform's performance tracker (reuses ipoBacktest.fetchPerformanceWindow; no cache writes);
 * live price/P/E/PAT from a Stockscans Default scan (mcap >= Rs 100 Cr). Ledger entityType company, detector `ipo-supply`.
 * Thresholds are ASSUMPTIONS (lib/ipoSupply.js). BSE-only listings are skipped (no NSE symbol).
 *   node ipoSupplyDaily.js [--dry-run] [--env-file path]
 */
const { stockscans, nse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { istDate } = require('./lib/ist');
const { fetchPerformanceWindow } = require('./ipoBacktest');
const S = require('./lib/ipoSupply');

const DETECTOR = 'ipo-supply';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '..', '..', 'data', 'cache', 'ipo-supply-universe.json');

async function universe(errors, today) {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (c.date === today && c.rows && c.rows.length > 1000) return new Map(c.rows); // same-day reuse (avoids Stockscans 429s on reruns)
  } catch (_) {
    /* no cache */
  }
  const m = new Map();
  let header = null;
  for (let offset = 0; offset < 4000; offset += 50) {
    const d = await stockscans.runScan(
      {
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
            { left: 'Market Capitalization', sign: '>=', right: '100' },
            { left: 'Close Price', sign: '>', right: '0' },
          ],
        },
        watchlistIds: [],
        order: 'desc',
        orderBy: 'Market Capitalization',
        offset,
      },
      DETECTOR
    );
    const t = d.table;
    if (!t || t.length <= 1) break;
    header = header || t[0];
    const ix = (n) => header.indexOf(n);
    for (const r of t.slice(1))
      m.set(r[ix('companyId')], {
        name: r[ix('Name')],
        mcap: r[ix('Market Capitalization')],
        close: r[ix('Close Price')],
        pe: r[ix('Price To Earnings')],
        patYoY: r[ix('PAT Growth YoY')],
      });
    if (offset + 50 >= d.total) break;
    await sleep(1000);
  }
  if (!m.size) errors.push('universe scan empty');
  else {
    try {
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, JSON.stringify({ date: today, rows: [...m] }));
    } catch (_) {
      /* cache is best-effort */
    }
  }
  return m;
}

async function recentOfs(todayIso, errors) {
  const dd = (iso) => iso.split('-').reverse().join('-');
  const from = new Date(Date.parse(todayIso) - 7 * 86400000).toISOString().slice(0, 10);
  const found = new Map();
  try {
    const rows = await nse.getCorporateAnnouncements(dd(from), dd(todayIso));
    for (const a of rows) {
      const kind = S.ofsKind({ title: a.desc, description: a.attchmntText });
      if (kind && a.symbol && !found.has(`NSE:${a.symbol}`))
        found.set(`NSE:${a.symbol}`, {
          kind,
          title: a.desc,
          date: String(a.an_dt || a.sort_date || '').slice(0, 10),
          name: a.sm_name,
        });
    }
  } catch (e) {
    errors.push(`nse announcements: ${e.message}`);
  }
  return found;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const errors = [];
  const today = istDate().toISOString().slice(0, 10);

  const uni = await universe(errors, today);
  const from = S.addMonths(today, -25);
  const ipos = await fetchPerformanceWindow({
    fromDate: from,
    toDate: today,
    ipoType: 'mainboard',
  });

  const obs = [];
  let skippedNoSymbol = 0;
  for (const r of ipos) {
    if (!r.nse_script_symbol) {
      skippedNoSymbol++;
      continue;
    }
    const id = `NSE:${r.nse_script_symbol}`;
    const u = uni.get(id) || {};
    const listingDate = r.ipo_year;
    const base = {
      name: r.company_name,
      listingDate,
      issueSizeCr: S.toNum(r.ipo_size),
      ofsPct: S.toNum(r.ofs_percent),
      calibrated: false,
    };
    const rev = S.ipoReview({
      listingDate,
      today,
      offerPrice: S.toNum(r.offer_price),
      close: u.close,
      ipoPe: r.price_to_earning,
      pe: u.pe,
      patYoY: u.patYoY,
    });
    obs.push({
      signalId: 'P3-ipo-review-window',
      entityType: 'company',
      entityId: id,
      state: rev.state,
      minMisses: 3,
      evidence: { ...base, ...rev.evidence },
    });
    const lock = S.lockInExpiry({
      listingDate,
      today,
      issueSizeCr: S.toNum(r.ipo_size),
      marketCapCr: u.mcap,
    });
    obs.push({
      signalId: 'P4-lockin-expiry',
      entityType: 'company',
      entityId: id,
      state: lock.state,
      minMisses: 2,
      evidence: { ...base, ...lock.evidence },
    });
  }
  const ofs = await recentOfs(today, errors);
  for (const [id, f] of ofs) {
    const u = uni.get(id) || {};
    obs.push({
      signalId: 'P5-ofs-announcement',
      entityType: 'company',
      entityId: id,
      state: S.ofsState(f.kind, u.pe),
      minMisses: 3,
      evidence: {
        name: f.name || u.name,
        kind: f.kind,
        title: f.title,
        announced: f.date,
        pe: u.pe ?? null,
        calibrated: false,
      },
    });
  }

  const ledger =
    !dryRun && !errors.length
      ? signalLedger.applyObservations(obs, { detector: DETECTOR, date: today })
      : null;
  console.log(
    JSON.stringify(
      {
        sessionDate: today,
        dryRun,
        errors,
        universe: uni.size,
        ipoRows: ipos.length,
        skippedNoSymbol,
        ofsFound: ofs.size,
        flagged: obs
          .filter((o) => o.state)
          .map((o) => ({ id: o.entityId, signal: o.signalId, state: o.state, ...o.evidence })),
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
      console.error('ipoSupplyDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { main };
