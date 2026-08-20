#!/usr/bin/env node
'use strict';

/**
 * bseIpoHistoryFetcher.js — builds `data/cache/bse-ipo-history.json`, a
 * per-IPO_NO cache of BSE's own IPO bid-detail data, back to 2002.
 *
 * WHY THIS EXISTS (2026-08-09, see
 * skills/equity-research/ipo-subscription-ranker/references/ipo_data_sources.md
 * for the full investigation): the weight-finding sample was already
 * expanded via `nseIpoHistoryFetcher.js` (NSE-listed IPOs, 137→591), but
 * ~650 IPOs in our universe are BSE-only (no NSE listing at all — mostly
 * BSE SME) and had zero granular coverage. BSE India runs its own IPO
 * bidding APIs, found and validated live against G V Electricals
 * (2026-08-09): every category matched IPOPlatform's published numbers
 * EXACTLY (QIB, NII, sNII, Retail, Total — offered AND applied shares).
 *
 * THREE BSE endpoints in play (all require `referer`/`origin: bseindia.com`
 * headers — they 404 without; not real auth, just a same-origin-ish check):
 *
 *   1. LIST — https://api.bseindia.com/BseIndiaAPI/api/HomePage_Issues_BBS_Landing_ng/w
 *      ?flag=2&scrip_Name=&end_dt=&IR_FLAG=IPO&Start_DT=
 *      Full universe of BSE issues tagged `IR_FLAG=IPO` (BSE's own
 *      issue-type taxonomy — FPO/OFS/BuyBack/RightsIssue/etc are separate
 *      flags, explicitly excluded, confirmed by the user). Empty date
 *      params return the FULL history, no windowing needed — 1,227 records
 *      back to 2002. Gives `Scrip_cd` (BSE's own INTERNAL record id — NOT
 *      the public trading scrip code already in our IPOPlatform-derived
 *      cache), `Scrip_Name`, `IPO_NO` (the join key below), `Start_Dt`/
 *      `End_Dt`, `eXCHANGE_PLATFORM` (MainBoard|SME).
 *
 *   2. BID DETAIL (recent) — .../Pubissues_GetBkbldgCatdem_PAR_bbnew_ng/w?IPO_NO=<n>
 *      Returns `table1`. ONLY populated for ~2025+ IPOs (empty table1 for
 *      anything older — confirmed empirically across IPO_NO 100-7500).
 *      Rows keyed by `SRNo`: 1=QIB (+1a-1d), 2=NII (+2.1=bNII, 2.2=sNII,
 *      each with a/b/c sub-splits), 3=Retail, 4=Employees, 5=Shareholders,
 *      6=Policy Holders, untagged `SRNo:""`=Total. `col3`=offered,
 *      `col4`=bid, `col5`=BSE's own precomputed multiple.
 *
 *   3. BID DETAIL (historical) — .../Pubissues_GetBkbldgCatdem_ng/w?IPO_NO=<n>
 *      (no `_PAR_bbnew_ng` suffix). Returns `table2`, DIFFERENT row schema.
 *      Discovered 2026-08-09 after the user pointed out that IPO_NO=5761
 *      (Aether Industries, a 2022 mainboard IPO) has data here despite
 *      endpoint #2 returning empty for it. Works across the FULL range
 *      tested (IPO_NO 100 through 7859, i.e. ~2015-2026) — this is BSE's
 *      real historical archive, endpoint #2 is only a recent-issue mirror.
 *      Two row layouts depending on issue type:
 *        - Mainboard (25 rows): has explicit 2.1/2.2 (bNII/sNII) split.
 *        - SME (20 rows): single NII bucket (SRNo "2"), sub-split into
 *          2(a)/2(b)/2(c) = Corporates/Individuals/Others — NO bNII/sNII
 *          split available from this endpoint for SME issues.
 *      IMPORTANT DATA-QUALITY CAVEAT: sub-category `col3` (offered) is
 *      frequently blank even when top-level rows (QIB/NII/RII/Total) are
 *      fully populated — e.g. Aether Industries had real QIB/RII/Total
 *      figures but NII showed bid=0 (likely a stale/partial BSE snapshot
 *      for that specific category, not a universal gap). This fetcher
 *      therefore computes each category INDEPENDENTLY and leaves any
 *      category null where offered or bid data is missing/zero, rather
 *      than requiring all-or-nothing — per explicit user instruction
 *      (2026-08-09): "we need to skip only the ones which don't have any
 *      data at all... consider partial or full data as per respective
 *      investor category."
 *
 * MERGE STRATEGY: fetch BOTH bid-detail endpoints (#2 and #3) for every
 * IPO_NO. Endpoint #3 (`_ng`) is the primary/base layer since it has by far
 * the widest historical coverage. Endpoint #2 (`_PAR_bbnew_ng`), when it
 * returns data, is layered on top and preferred specifically for bHNI/sHNI
 * (since it sometimes has the explicit 2.1/2.2 split with real offered
 * figures even for SME issues, where endpoint #3 has none — this is what
 * let the earlier G V Electricals validation work). A record now has
 * `hasData: true` if ANY category came out non-null from either source —
 * not just if the whole row set was present.
 *
 * THE bNII-OFFERED FIX (validated on G V Electricals via endpoint #2):
 * when a bNII row's own displayed `col3` looks wrong/incomplete (BSE's
 * `2.1` row understated it — 300,000 vs the true 580,000), recompute as
 * `niiOffered - sNiiOffered` (both independently correct) rather than
 * trusting BSE's own sub-row. Applied only when both niiOffered and
 * sNiiOffered are present; otherwise bHNI is left null (endpoint #3, most
 * SME issues) rather than guessed.
 *
 * JOIN KEY CAVEAT: `IPO_NO` has no counterpart field on IPOPlatform's index
 * API, so this cache cannot be joined to `ipo-history.json` by ID — joining
 * happens by normalized company name + listing date proximity in
 * `ipoWeightFinder.js`.
 *
 * Usage:
 *   node bseIpoHistoryFetcher.js [--limit N] [--concurrency 2] [--force] [--status]
 */

const fs = require('fs');
const path = require('path');
const dbV2 = require('./lib/db');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');

const CACHE_FILE = 'bse-ipo-history.json';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const BASE_HEADERS = {
  'User-Agent': UA,
  accept: 'application/json, text/plain, */*',
  referer: 'https://www.bseindia.com/',
  origin: 'https://www.bseindia.com',
};
const CHUNK_SIZE = 20; // checkpoint cadence — see nseIpoHistoryFetcher.js's header for why

function argValue(argv, flag, def) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs, spreadMs) {
  return baseMs + Math.floor(Math.random() * spreadMs);
}

function loadCache() {
  const p = dbV2.cachePath(CACHE_FILE);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { builtAt: null, byIpoNo: {} };
  }
}

function saveCache(cache) {
  const p = dbV2.cachePath(CACHE_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2));
  return p;
}

async function fetchWithRetry(url, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: BASE_HEADERS });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (text.trim().startsWith('<')) throw new Error('non-JSON response (likely blocked)');
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(jitter(800 * (i + 1), 600));
    }
  }
  throw lastErr;
}

async function fetchIpoList() {
  const url =
    'https://api.bseindia.com/BseIndiaAPI/api/HomePage_Issues_BBS_Landing_ng/w?flag=2&scrip_Name=&end_dt=&IR_FLAG=IPO&Start_DT=';
  const j = await fetchWithRetry(url);
  return j.Table || [];
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Extracts {offered, bid} for a given SRNo from a row-keyed table, tolerant of missing rows. */
function cellFor(bySr, key) {
  const row = bySr[key];
  return { offered: row ? num(row.col3) : null, bid: row ? num(row.col4) : null };
}

/** Merges two {offered, bid} cells, preferring values from `primary` and falling back to `secondary` per-field. */
function mergeCell(primary, secondary) {
  return {
    offered: primary.offered != null ? primary.offered : secondary.offered,
    bid: primary.bid != null ? primary.bid : secondary.bid,
  };
}

function xOf(c) {
  return c && c.offered != null && c.offered > 0 && c.bid != null
    ? Math.round((c.bid / c.offered) * 10000) / 10000
    : null;
}

/**
 * Parses BSE's TWO bid-detail table shapes (table1 from the recent
 * `_PAR_bbnew_ng` endpoint, table2 from the historical `_ng` endpoint) and
 * merges them into one canonical per-category record. Every category is
 * computed independently — missing/zero data in one category does not null
 * out the others. See file header for the full rationale.
 */
function parseBseBidDetails(table1, table2) {
  const bySr1 = {};
  for (const row of table1 || []) if (row.SRNo != null) bySr1[row.SRNo] = row;
  const bySr2 = {};
  for (const row of table2 || []) if (row.SRNo != null) bySr2[row.SRNo] = row;

  const totalRow1 = (table1 || []).find((r) => r.col2 === 'Total');
  const totalRow2 = (table2 || []).find((r) => r.col2 === 'Total');
  const total1 = {
    offered: totalRow1 ? num(totalRow1.col3) : null,
    bid: totalRow1 ? num(totalRow1.col4) : null,
  };
  const total2 = {
    offered: totalRow2 ? num(totalRow2.col3) : null,
    bid: totalRow2 ? num(totalRow2.col4) : null,
  };

  // Prefer table1 (_PAR_bbnew_ng) values where present, fall back to table2 (_ng).
  const qib = mergeCell(cellFor(bySr1, '1'), cellFor(bySr2, '1'));
  const nii = mergeCell(cellFor(bySr1, '2'), cellFor(bySr2, '2'));
  const snii = mergeCell(cellFor(bySr1, '2.2'), cellFor(bySr2, '2.2'));
  const retail = mergeCell(cellFor(bySr1, '3'), cellFor(bySr2, '3'));
  const employee = mergeCell(cellFor(bySr1, '4'), cellFor(bySr2, '4'));
  const shareholder = mergeCell(cellFor(bySr1, '5'), cellFor(bySr2, '5'));
  const total = mergeCell(total1, total2);

  // bNII: BSE's own displayed `2.1` row `offered` figure is unreliable even
  // when present (validated on G V Electricals: BSE shows 300,000, true
  // value is 580,000) — so ALWAYS prefer the recomputed
  // niiOffered-sNiiOffered when both are known, and only fall back to BSE's
  // own direct row when the recompute isn't possible (bid figure is still
  // taken directly, only `offered` is suspect).
  const bniiDirect = mergeCell(cellFor(bySr1, '2.1'), cellFor(bySr2, '2.1'));
  const bniiOfferedFixed =
    nii.offered != null && snii.offered != null ? nii.offered - snii.offered : bniiDirect.offered;
  const bnii = { offered: bniiOfferedFixed, bid: bniiDirect.bid };

  const parsed = {
    qibX: xOf(qib),
    niiX: xOf(nii),
    bHniX: xOf(bnii),
    sHniX: xOf(snii),
    riiX: xOf(retail),
    employeeX: xOf(employee),
    shareholderX: xOf(shareholder),
    totalSubscriptionX: xOf(total),
    raw: { qib, nii, bnii, snii, retail, employee, shareholder, total },
  };

  // hasData / hasAnyCategory: true if ANY category produced a usable
  // multiple — never require every category (per 2026-08-09 instruction).
  const anyCategory = [
    parsed.qibX,
    parsed.niiX,
    parsed.bHniX,
    parsed.sHniX,
    parsed.riiX,
    parsed.employeeX,
    parsed.shareholderX,
    parsed.totalSubscriptionX,
  ].some((v) => v != null);

  return { parsed, hasAnyCategory: anyCategory };
}

async function fetchOne(issue) {
  const urlNew = `https://api.bseindia.com/BseIndiaAPI/api/Pubissues_GetBkbldgCatdem_PAR_bbnew_ng/w?IPO_NO=${issue.IPO_NO}`;
  const urlOld = `https://api.bseindia.com/BseIndiaAPI/api/Pubissues_GetBkbldgCatdem_ng/w?IPO_NO=${issue.IPO_NO}`;

  const [jNew, jOld] = await Promise.all([
    fetchWithRetry(urlNew).catch(() => null),
    fetchWithRetry(urlOld).catch(() => null),
  ]);
  const table1 = (jNew && jNew.table1) || [];
  const table2 = (jOld && jOld.table2) || [];

  const { parsed, hasAnyCategory } = parseBseBidDetails(table1, table2);

  return {
    ipoNo: issue.IPO_NO,
    scripCd: issue.Scrip_cd,
    companyName: issue.Scrip_Name,
    exchangePlatform: issue.eXCHANGE_PLATFORM,
    startDate: issue.Start_Dt,
    endDate: issue.End_Dt,
    hasData: hasAnyCategory,
    sourceEndpoints: { bbnewRows: table1.length, historicalRows: table2.length },
    parsed: hasAnyCategory ? parsed : null,
    fetchedAt: new Date().toISOString(),
  };
}

async function build({ limit, concurrency, force }) {
  const cache = loadCache();
  const allIssues = await fetchIpoList();
  const toFetch = (force ? allIssues : allIssues.filter((x) => !cache.byIpoNo[x.IPO_NO])).slice(
    0,
    limit || allIssues.length
  );

  let fetched = 0;
  let failed = 0;
  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    const results = await mapWithConcurrency(chunk, concurrency, async (issue) => {
      await sleep(jitter(350, 350));
      return fetchOne(issue);
    });
    for (const r of results) {
      if (r.ok) {
        cache.byIpoNo[r.value.ipoNo] = r.value;
        fetched++;
      } else {
        failed++;
      }
    }
    cache.builtAt = new Date().toISOString();
    cache.totalUniverseSize = allIssues.length;
    saveCache(cache); // checkpoint every chunk
  }
  const savedPath = saveCache(cache);

  return {
    savedPath,
    universeSize: allIssues.length,
    notAttemptedThisRun: allIssues.length - toFetch.length,
    attemptedThisRun: toFetch.length,
    fetchedThisRun: fetched,
    failedThisRun: failed,
    totalCachedNow: Object.keys(cache.byIpoNo).length,
  };
}

function status() {
  const cache = loadCache();
  const all = Object.values(cache.byIpoNo);
  const withData = all.filter((x) => x.hasData && x.parsed);
  const withQib = withData.filter((x) => x.parsed.qibX != null);
  const withTotal = withData.filter((x) => x.parsed.totalSubscriptionX != null);
  const withBHni = withData.filter((x) => x.parsed.bHniX != null);
  return {
    builtAt: cache.builtAt,
    totalUniverseSize: cache.totalUniverseSize,
    totalCached: all.length,
    withRealBidData: withData.length,
    withSelfComputedQibX: withQib.length,
    withTotalSubscriptionX: withTotal.length,
    withBHniX: withBHni.length,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    return;
  }
  const limitArg = argValue(argv, '--limit', null);
  const concurrency = parseInt(argValue(argv, '--concurrency', '2'), 10);
  const force = argv.includes('--force');

  const result = await build({
    limit: limitArg ? parseInt(limitArg, 10) : null,
    concurrency,
    force,
  });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { build, status, loadCache, saveCache, parseBseBidDetails, fetchIpoList };

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
