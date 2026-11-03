#!/usr/bin/env node
'use strict';
/**
 * ipoLockin — IPO float-unlock watch CLI (skills/_shared/ipo-lockin-watch.md). Zero LLM, no secrets, no HTTP.
 *   yarn ipo-lockin show <companyId> [--mcap <Cr>] [--today YYYY-MM-DD] [--json]
 *       Timeline + the one-line "next unlock" every report/card must print (nothing printed → not a ≤24m listing).
 *   yarn ipo-lockin save <seed.json>
 *       Persist an EXACT schedule (type 'ipo-lockin' in the `ipos` collection) from offer-document numbers:
 *       {companyId, ipoType, listingDate, allotmentDate, postIssueShares, ipoSharesOffered, anchorShares,
 *        mpcMonths?, mpcShares?, source}
 *   yarn ipo-lockin build
 *       Rebuild the date-only estimates cache for every ≤24-month listing in data/cache/ipo-history.json
 *       (refresh that first with `yarn ipo-history-cache`).
 */
const { StorageService } = require('@stock/cloud-utils');
const { argValue } = require('./lib/env');
const db = require('./lib/db');
const tradingCalendar = require('./lib/tradingCalendar');
const L = require('./lib/ipoLockins');
const store = require('./lib/ipoLockinStore');

const CREATOR = 'ipo-lockin';
const NOT_A_COMPANY_UNIT = /\b(invit|reit)\b/i;

/** Listing is T+3 trading days after issue close and allotment T+1, i.e. 2 trading days before listing. */
async function allotmentFromListing(listingDate) {
  let d = new Date(`${listingDate}T00:00:00Z`);
  for (let back = 0; back < 2; ) {
    d = new Date(d.getTime() - 86400000);
    if (await tradingCalendar.isTradingDay(d)) back++;
  }
  return d.toISOString().slice(0, 10);
}

async function cmdBuild() {
  const hist = StorageService.readJson('cache/ipo-history.json');
  if (!hist)
    throw new Error('data/cache/ipo-history.json missing — run `yarn ipo-history-cache` first');
  const today = store.todayIst();
  const byCompanyId = {};
  for (const e of Object.values(hist.byIpoPlatformId)) {
    if (!e.companyId || !L.isRecentListing(e.listingDate, today)) continue;
    if (NOT_A_COMPANY_UNIT.test(e.companyName || '')) continue;
    byCompanyId[e.companyId] = L.estimateSchedule({
      companyId: e.companyId,
      ipoType: e.ipoType,
      listingDate: e.listingDate,
      allotmentDate: await allotmentFromListing(e.listingDate),
      anchorParticipated: e.anchorParticipated,
    });
  }
  StorageService.saveJson(store.ESTIMATES_REL, { builtAt: new Date().toISOString(), byCompanyId });
  console.log(`built ${Object.keys(byCompanyId).length} estimates ← ${hist.builtAt}`);
}

function cmdSave(file) {
  const seed = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  const sched = L.exactSchedule(seed);
  const stats = db.upsertMany('ipos', [
    {
      ...sched,
      id: `ipo-lockin_${sched.companyId}`,
      type: store.TYPE,
      creator: CREATOR,
      date: sched.listingDate,
    },
  ]);
  console.log(JSON.stringify({ saved: sched.companyId, stats }));
}

function cmdShow(companyId, argv) {
  const today = argValue('--today', argv) || store.todayIst();
  const mcap = argValue('--mcap', argv);
  const rec = store
    .loadIndex()
    .get(require('@stock/api/utils/companyId').sanitizeCompanyId(companyId));
  const w = L.lockinWatch(rec, today, { marketCapCr: mcap == null ? null : Number(mcap) });
  if (argv.includes('--json'))
    return console.log(JSON.stringify({ watch: w, record: rec || null }, null, 2));
  if (!w)
    return console.log(
      `${companyId}: not a ≤${L.RECENT_MONTHS}-month IPO listing (no lock-in line required)`
    );
  console.log(L.lockinText(w));
  for (const t of rec.tranches) {
    const size =
      t.shares == null
        ? 'size n/a'
        : `${t.shares.toLocaleString('en-IN')} sh (${t.pctEquity.toFixed(2)}%)`;
    console.log(`  ${t.date}${t.date < today ? ' ✓' : '  '} ${t.label} — ${size}`);
  }
  console.log(`  basis: ${rec.basis}${rec.source ? ` · ${rec.source}` : ''}`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'build') await cmdBuild();
  else if (cmd === 'save' && arg) cmdSave(arg);
  else if (cmd === 'show' && arg) cmdShow(arg, process.argv);
  else {
    console.error(
      'usage: yarn ipo-lockin show <companyId> [--mcap Cr] [--json] | save <seed.json> | build'
    );
    process.exit(2);
  }
  console.log('files touched:', JSON.stringify([...(db.touchedFiles ? db.touchedFiles() : [])]));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
