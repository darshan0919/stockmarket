#!/usr/bin/env node
'use strict';

/**
 * anchorBulkDealTracker.js — Anchor-investor / bulk-deal cross-reference.
 *
 * Question this answers: for IPOs that listed in a given window, how often
 * did an anchor investor show up again as a BUYER (or seller) in a bulk deal
 * on the listing day or the following N sessions?
 *
 * Pure Extraction pass (conventions.md §17 — no LLM/judgment):
 *   1. Fetch IPOPlatform's performance-tracker index (reuses ipoBacktest.js's
 *      `fetchPerformanceWindow` — never re-derive the same date-windowed,
 *      auto-paginating fetch twice) for [--from, --to]. Each row already
 *      carries `nse_script_symbol` / `bse_script_code` / `ipo_year` (listing
 *      date) / `chittorgarh_slug`+`id` (detail-page URL) — no separate
 *      symbol-resolution step needed, unlike the "Closed IPOs" table (which
 *      only covers imminent listings, not history).
 *   2. For each IPO, fetch its IPOPlatform detail page (reuses
 *      ipoSubscriptionScanner.js's fetchHtml/stripTags) and parse the
 *      `#anchor-investors` table (Anchor Investor name, shares allotted,
 *      offer price, amount invested). IPOs with zero anchor investors (most
 *      SME issues, and any IPO without anchor participation) are counted but
 *      skipped from the deal cross-check.
 *   3. For each IPO WITH anchor investors, pull NSE (`NseClient.
 *      getHistoricalBulkDeals`/`getHistoricalBlockDeals`) and BSE
 *      (`BseClient.getBulkBlockDeals`) bulk+block deals for
 *      [listingDate, min(listingDate + --window - 1, today)] (default window:
 *      2, i.e. listing day + T+1) — the end date is clamped to today (IST) so
 *      an IPO that listed on the last day or two of --to doesn't request a
 *      future session that can't have data yet; `windowTruncatedToToday` /
 *      `dealsWindowChecked` on each result say whether/how this happened.
 *      Unfiltered by symbol at fetch time (mirrors dealsDigest.js's own
 *      sc_code='' pattern — cheaper than N per-symbol calls for a short
 *      window), then keeps only rows matching this IPO: exact NSE symbol /
 *      BSE scrip code when the index row has one, else falls back to a
 *      normalized company-name containment match.
 *   4. Fuzzy-matches (packages/jobs-runtime/lib/fuzzyMatch.js, Jaro-Winkler +
 *      token overlap, default threshold 0.85) each anchor investor's name
 *      against every matched bulk/block deal's `clientName`/`CLIENT_NAME`.
 *   5. Aggregates: IPOs in window, IPOs with anchor data, IPOs where >=1
 *      anchor investor reappeared in a listing-window bulk/block deal, the
 *      rate, and the full per-IPO match detail.
 *   6. For matched IPOs only (not the full universe — see cost note on the
 *      gmp* fields in crossReferenceIpo), fetches listing-day Grey Market
 *      Premium history from investorgain.com (`fetchGmpHistory`) and attaches
 *      `listingGainPct`/`gmpGainPct`/`cmpGainPct` — three views of the same
 *      "did this IPO pop" question at three different points in time (grey
 *      market before listing, actual listing-day close, current price).
 *
 * Output: writes BOTH the JSON DTO and a self-contained HTML render
 * (`renderHtml`) to `--out`'s base name (`.json` written as given, `.html`
 * alongside it) — the HTML is a pure template over the JSON, never a second
 * source of truth (conventions.md §5); regenerate it by re-running, don't
 * hand-edit.
 *
 * DATA-SOURCE STATUS (conventions.md §13): both NseClient.
 * getHistoricalBulkDeals/getHistoricalBlockDeals (`/historicalOR/
 * bulk-block-short-deals?optionType=bulk_deals|block_deals`) and BSE's
 * date-range bulk/block endpoint (BseClient.getBulkBlockDeals, already used
 * daily by dealsDigest.js) are confirmed live as of 2026-08-10 — see
 * `docs/nse-bse-historical-deals-api.md` for the discovery path (the NSE
 * route was initially mis-guessed as a plain `/historical/bulk-deals` path,
 * which 503s; the real route lives in the `historicalOR` namespace and needs
 * an `optionType` param). A failed fetch on either source still degrades
 * gracefully (empty array + a `warnings` entry) rather than failing the run.
 *
 * Offline testability: matchIposInWindow / crossReferenceIpo are exported and
 * take fetched data as plain arguments — no network needed to unit test the
 * matching/aggregation logic itself.
 *
 * Usage:
 *   node anchorBulkDealTracker.js --from YYYY-MM-DD --to YYYY-MM-DD
 *     [--window N] [--threshold 0.85] [--concurrency 6] [--out <path>]
 *
 *   --from/--to    Listing-date window (inclusive), IST calendar dates.
 *   --window       Trading-day count after listing to scan for deals,
 *                  INCLUSIVE of the listing day itself (default 2 = T+0,T+1).
 *   --threshold    Fuzzy-match score cutoff, 0-1 (default 0.85).
 *   --concurrency  Bounded fan-out for per-IPO detail-page + deals fetches
 *                  (conventions.md §16; default 6).
 *   --out          Also write the DTO JSON to this file path.
 */

const path = require('path');
const { nse, bse } = require('@stock/api');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const { argValue, loadEnv } = require('./lib/env');
const { fetchHtml, stripTags } = require('./ipoSubscriptionScanner');
const { fetchPerformanceWindow, parseSubscriptionDetail } = require('./ipoBacktest');
const { bestMatch, normalizeInvestorName } = require('./lib/fuzzyMatch');
const { normalizeName: normalizeCompanyName } = require('./lib/companyMaster');
const dbV2 = require('./lib/db');

const CREATOR = 'anchor-bulk-deal-tracker';

// ── Date helpers (IST-safe — mirrors ipoSubscriptionScanner.js's convention:
// only ever touch UTC getters so this behaves the same regardless of host TZ) ──

function ymdToUtcDate(ymd) {
  return new Date(`${ymd}T00:00:00Z`);
}
// IST "today" as a UTC-getter-comparable Date (mirrors ipoSubscriptionScanner.js's
// todayIst — only ever touch UTC getters, never local getters, so this is
// host-timezone-independent). Used to clamp the deal-fetch window so an IPO
// that listed on the last day of --to's range doesn't ask NSE/BSE for a
// future date that can't have data yet.
function todayIstUtcDate() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60000);
  return new Date(`${ist.toISOString().slice(0, 10)}T00:00:00Z`);
}
function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function fmtYmd(d) {
  return d.toISOString().slice(0, 10);
}
function fmtDdMmYyyy(d) {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}
function fmtDdMmYyyySlash(d) {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// ── IPOPlatform anchor-investors table (per-IPO detail page, #anchor-investors) ──
// Columns confirmed live 2026-08-10: Anchor Investor | No. of shares Allotted |
// Offer Price (in ₹.) | Amount Invested (in ₹.). Each investor cell is an <a>
// linking to /anchor-investor/<slug>/<id> — that per-investor id is captured
// too (useful for de-duplicating the same fund across IPOs later).

function toINRNumber(text) {
  const cleaned = String(text || '').replace(/[₹,\s]/g, '');
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

// ── Chittorgarh anchor-investor table (primary source — see docs/nse-bse-
// historical-deals-api.md "IPOPlatform vs Chittorgarh" for why) ────────────
// Confirmed live 2026-08-10 against
// https://www.chittorgarh.com/ipo_subscription/caliber-mining-and-logistics-ipo/1999/
// (any slug works — chittorgarh_id, already present on every IPOPlatform
// performance-tracker row, is the real key; the URL slug is decorative/SEO
// text and ignored server-side, confirmed by requesting a garbage slug with
// the same id and getting the same 200 page back).
// Table id="AnchorTable" columns: # | Anchor (scheme/entity name) |
// Group Entity (parent AMC/fund-house — often a better bulk-deal-clientName
// match target than the scheme name itself, e.g. "QSIF EQUITY EX-TOP 100
// LONG-SHORT FUND" vs its group "QUANT MUTUAL FUND") | Shares Allotted |
// Amt (₹ cr.) | % Allocated | % Allotment of Issue. A trailing "Total" row
// has no leading row-number cell — filtered out below.

function toChittorgarhInrCrore(text) {
  const n = toINRNumber(text);
  return n === null ? null : Math.round(n * 1e7);
}

function chittorgarhDetailUrl(chittorgarhId, slugHint) {
  const slug = slugHint || 'ipo';
  return `https://www.chittorgarh.com/ipo_subscription/${slug}/${chittorgarhId}/`;
}

function parseChittorgarhAnchorInvestors(html) {
  const m = html.match(/<table[^>]*id='AnchorTable'[\s\S]*?<\/table>/i);
  if (!m) return [];
  const tbodyMatch = m[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  const scope = tbodyMatch ? tbodyMatch[0] : m[0];
  const trRows = scope.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  return trRows
    .map((row) => {
      const cells = (row.match(/<td[\s\S]*?<\/td>/gi) || []).map(stripTags);
      // Data rows have 7 cells (#, Anchor, Group Entity, Shares, Amt, %Alloc,
      // %Issue); the summary "Total" row has 5 (no # / no Group Entity) —
      // skip it rather than misreading it as an investor.
      if (cells.length < 7 || !cells[0]) return null;
      const name = cells[1];
      if (!name) return null;
      return {
        name,
        groupEntity: cells[2] || null,
        sharesAllotted: toINRNumber(cells[3]),
        amountInvested: toChittorgarhInrCrore(cells[4]),
        pctAllocated: toINRNumber(cells[5]),
        pctAllotmentOfIssue: toINRNumber(cells[6]),
      };
    })
    .filter(Boolean);
}

function parseAnchorInvestors(html) {
  // The `#anchor-investors` section wraps its table in a scroll div — the
  // table itself has no `id`, only classes (`idv2-anchor-table` etc.), so
  // extractTableRows()'s by-id lookup doesn't apply here; extract rows
  // directly from the section's <tbody> instead (confirmed live 2026-08-10
  // against ipoplatform.com/ipo/aegeus-technologies-ipo/4561).
  const m = html.match(/<div class="idv2-section" id="anchor-investors">[\s\S]*?<\/table>/);
  if (!m) return [];
  const tbodyMatch = m[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  const scope = tbodyMatch ? tbodyMatch[0] : m[0];
  const trRows = scope.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = trRows
    .map((row) => row.match(/<td[\s\S]*?<\/td>/gi) || [])
    .filter((cells) => cells.length >= 4);

  return rows
    .map((cells) => {
      if (cells.length < 4) return null;
      const idMatch = cells[0].match(/anchor-investor\/([^/"]+)\/(\d+)/);
      const name = stripTags(cells[0]);
      if (!name) return null;
      return {
        anchorInvestorSlug: idMatch ? idMatch[1] : null,
        anchorInvestorId: idMatch ? idMatch[2] : null,
        name,
        sharesAllotted: toINRNumber(stripTags(cells[1])),
        offerPrice: toINRNumber(stripTags(cells[2])),
        amountInvested: toINRNumber(stripTags(cells[3])),
      };
    })
    .filter(Boolean);
}

/**
 * Anchor-investor list for one IPO: chittorgarh first (richer — per-scheme
 * name AND parent Group Entity, ~2-3x more granular in spot checks, and
 * covers IPOs IPOPlatform's own detail page has no `#anchor-investors`
 * section for at all, e.g. Caliber Mining and Logistics), IPOPlatform as a
 * fallback (kept in case a future IPO has the reverse gap — chittorgarh
 * table missing but IPOPlatform's present; not yet observed, but the
 * fallback is cheap to keep and conventions.md §13 says to flag unconfirmed
 * assumptions rather than assume one source is always a strict superset).
 * @param {{chittorgarhId:string|number, detailUrl:string}} ipo
 * @returns {Promise<{anchorInvestors:Array, anchorSource:'chittorgarh'|'ipoplatform'|'none'}>}
 */
async function fetchAnchorInvestors(ipo) {
  if (ipo.chittorgarhId) {
    try {
      const cgHtml = await fetchHtml(
        chittorgarhDetailUrl(ipo.chittorgarhId, ipo.chittorgarhSlugHint)
      );
      const cgAnchors = parseChittorgarhAnchorInvestors(cgHtml);
      if (cgAnchors.length > 0) return { anchorInvestors: cgAnchors, anchorSource: 'chittorgarh' };
    } catch {
      // fall through to IPOPlatform
    }
  }
  const platformHtml = await fetchHtml(ipo.detailUrl);
  const platformAnchors = parseAnchorInvestors(platformHtml);
  return {
    anchorInvestors: platformAnchors,
    anchorSource: platformAnchors.length > 0 ? 'ipoplatform' : 'none',
  };
}

// ── Granular subscription multiples (reused, not new — ipoBacktest.js's
// parseSubscriptionDetail() already parses IPOPlatform's per-IPO subscription
// detail page's JSON-LD category breakdown; conventions.md §17 says reuse it
// rather than re-deriving a second parser for the same page). Only the URL
// construction (identical to ipoBacktest.js's scoreRowWithDetailFetch) and
// the fetch wrapper are new here — this script needs the raw multiples
// attached per-IPO, not ipoBacktest.js's scored/correlated backtest record. ──

async function fetchSubscriptionMultiples(ipo) {
  const url = `https://www.ipoplatform.com/ipo/subscription/${ipo.chittorgarhSlugHint}/${ipo.companyId}`;
  const html = await fetchHtml(url);
  const sub = parseSubscriptionDetail(html);
  return {
    qibX: sub.qibX ?? null,
    anchorX: sub.anchorX ?? null,
    marketMakerX: sub.marketMakerX ?? null,
    sHniX: sub.sHniX ?? null,
    bHniX: sub.bHniX ?? null,
    niiX: sub.niiX ?? null,
    riiX: sub.riiX ?? null,
    employeeX: sub.employeeX ?? null,
    shareholderX: sub.shareholderX ?? null,
    totalSubscriptionX: sub.totalSubscriptionX ?? null,
    otherCategories:
      sub.otherCategories && Object.keys(sub.otherCategories).length ? sub.otherCategories : null,
    subscriptionDataParsed: !!sub._parsed,
  };
}

// ── Deal-row → normalized shape (so NSE bulk/block + BSE bulk/block are one list) ──

function normalizeNseRow(row, source) {
  // getHistoricalBulkDeals/getHistoricalBlockDeals (NSE's historicalOR/
  // bulk-block-short-deals endpoint) return BD_-prefixed fields — see
  // NseClient.js doc comment + docs/nse-bse-historical-deals-api.md.
  return {
    source, // 'nse-bulk' | 'nse-block'
    date: row.BD_DT_DATE || null,
    symbol: row.BD_SYMBOL || null,
    companyName: row.BD_SCRIP_NAME || null,
    clientName: row.BD_CLIENT_NAME || '',
    buySell: row.BD_BUY_SELL || null,
    qty: Number(row.BD_QTY_TRD ?? 0) || null,
    price: Number(row.BD_TP_WATP ?? 0) || null,
  };
}

function normalizeBseRow(row, source) {
  const qty = Number(String(row.QUANTITY ?? '').replace(/,/g, '')) || null;
  const price = Number(String(row.PRICE ?? '').replace(/,/g, '')) || null;
  return {
    source, // 'bse-bulk' | 'bse-block'
    date: row.DEAL_DATE || null,
    symbol: row.SCRIP_CODE ? String(row.SCRIP_CODE) : null,
    companyName: row.scripname || row.SCRIP_NAME || null,
    clientName: row.CLIENT_NAME || '',
    buySell: row.TRANSACTION_TYPE || null,
    qty,
    price,
  };
}

// ── Grey Market Premium (GMP) — investorgain.com ────────────────────────────
// Confirmed live 2026-08-10 against investorgain.com's redirect target for
// Caliber Mining and Logistics (IPOPlatform performance-tracker rows carry an
// `investor_gain` URL of the form `chr-gmp/<chittorgarh-slug>/<chittorgarh_id>`
// — that's investorgain's OWN legacy path using chittorgarh's id, not a
// separate id system to resolve; it 308-redirects to
// `gmp/<slug>-gmp/<investorgain_id>/`, a Next.js app-router page). The GMP
// history isn't in static HTML — it's embedded as an escaped JSON string
// inside a React Server Components streaming payload
// (`self.__next_f.push([1,"...\"gmp_date\":\"24-07-2026\",\"gmp\":\"60\"..."])`),
// so `parseGmpHistory()` regex-matches the literal `\"key\":\"value\"`
// (backslash-escaped quote) sequences directly rather than trying to
// JSON.parse the page — there's no clean single JSON blob to grab.
// One record per calendar day the grey market traded that IPO; the record
// dated the listing day itself (or the record NSE/BSE data confirms as
// `gmp_active_record_flag:1`) is what "GMP gain" means here: the % premium
// the grey market was pricing in immediately before/at listing, so it's
// directly comparable to `listingGainPct` (actual gain) and `cmpGainPct`
// (gain as of the index's last CMP snapshot) — same base (offer price),
// three different points in time.

async function fetchGmpHistory(investorGainUrl) {
  if (!investorGainUrl) return [];
  const res = await fetch(investorGainUrl.replace('http://', 'https://'), {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockmarketAnchorTracker/1.0)' },
  });
  if (!res.ok) throw new Error(`GET ${investorGainUrl} -> HTTP ${res.status}`);
  const html = await res.text();
  return parseGmpHistory(html);
}

function parseGmpHistory(html) {
  const records = [];
  const dateRe = /\\"gmp_date\\":\\"(\d{2}-\d{2}-\d{4})\\"/g;
  let m;
  while ((m = dateRe.exec(html))) {
    const window = html.slice(m.index, m.index + 500);
    const grab = (key) => {
      const mm = window.match(new RegExp(`\\\\"${key}\\\\":\\\\"([^\\\\]*)\\\\"`));
      return mm ? mm[1] : null;
    };
    const flagMatch = window.match(/\\"gmp_active_record_flag\\":(\d)/);
    records.push({
      date: m[1], // DD-MM-YYYY
      gmp: grab('gmp'),
      estimatedListingPrice: grab('estimated_listing_price'),
      gmpPercent: grab('gmp_percent_calc'),
      activeRecordFlag: flagMatch ? Number(flagMatch[1]) : 0,
    });
  }
  return records;
}

/**
 * Pick the GMP record most relevant to a listing: the one flagged
 * `activeRecordFlag: 1` (investorgain's own "this is the one that mattered"
 * marker, typically the listing-day record), else the record dated closest
 * to (on or before) the listing date, else null if the IPO has no GMP
 * history on investorgain at all (happens — not every SME issue trades grey
 * market).
 * @param {Array} records - from parseGmpHistory()
 * @param {string} listingDateYmd - YYYY-MM-DD
 * @returns {{gmp:number|null, gmpPercent:number|null, estimatedListingPrice:number|null, date:string|null}|null}
 */
function pickGmpForListing(records, listingDateYmd) {
  if (!records.length) return null;
  const toYmd = (ddmmyyyy) => {
    const [dd, mm, yyyy] = ddmmyyyy.split('-');
    return `${yyyy}-${mm}-${dd}`;
  };
  const flagged = records.find((r) => r.activeRecordFlag === 1);
  const chosen =
    flagged ||
    records
      .filter((r) => toYmd(r.date) <= listingDateYmd)
      .sort((a, b) => (toYmd(b.date) > toYmd(a.date) ? 1 : -1))[0] ||
    records[0];
  return {
    gmp: toINRNumber(chosen.gmp),
    gmpPercent: toINRNumber(chosen.gmpPercent),
    estimatedListingPrice: toINRNumber(chosen.estimatedListingPrice),
    date: toYmd(chosen.date),
  };
}

/**
 * Fetch NSE+BSE bulk/block deals for [fromDate,toDate] (UTC Date objects),
 * unfiltered by symbol, normalized to one flat array. Never throws — a
 * failed source degrades to an empty array + a warning, per this script's
 * documented NSE-endpoint caveat.
 */
async function fetchDealsWindow(fromDate, toDate, { nseClient, bseClient, warnings }) {
  const nseFrom = fmtDdMmYyyy(fromDate);
  const nseTo = fmtDdMmYyyy(toDate);
  const bseFrom = fmtDdMmYyyySlash(fromDate);
  const bseTo = fmtDdMmYyyySlash(toDate);

  const [nseBulk, nseBlock, bseBulk, bseBlock] = await Promise.all([
    nseClient.getHistoricalBulkDeals(nseFrom, nseTo).catch((e) => {
      warnings.add(`NSE bulk-deals fetch failed for ${nseFrom}..${nseTo}: ${e.message}`);
      return [];
    }),
    nseClient.getHistoricalBlockDeals(nseFrom, nseTo).catch((e) => {
      warnings.add(`NSE block-deals fetch failed for ${nseFrom}..${nseTo}: ${e.message}`);
      return [];
    }),
    bseClient.getBulkBlockDeals('bulk', bseFrom, bseTo).catch((e) => {
      warnings.add(`BSE bulk-deals fetch failed for ${bseFrom}..${bseTo}: ${e.message}`);
      return [];
    }),
    bseClient.getBulkBlockDeals('block', bseFrom, bseTo).catch((e) => {
      warnings.add(`BSE block-deals fetch failed for ${bseFrom}..${bseTo}: ${e.message}`);
      return [];
    }),
  ]);

  return [
    ...nseBulk.map((r) => normalizeNseRow(r, 'nse-bulk')),
    ...nseBlock.map((r) => normalizeNseRow(r, 'nse-block')),
    ...bseBulk.map((r) => normalizeBseRow(r, 'bse-bulk')),
    ...bseBlock.map((r) => normalizeBseRow(r, 'bse-block')),
  ];
}

// ── Supportive / unsupportive investor registries (persisted — see
// docs/DATA_ECOSYSTEM.md §1, docs/SKILL_DATA_AUDIT.md §C/§D
// `supportive-investors.json` / `unsupportive-investors.json` entries) ──────
// "Supportive investor" = an anchor investor who reappeared BUYING more
// (NSE/BSE bulk or block deal, BUY/B/P side) within an IPO's listing window.
// "Unsupportive investor" = the mirror case: an anchor investor who
// reappeared SELLING (SELL/S side) within the same window — i.e. exited part
// of its anchor allocation almost immediately rather than holding it through
// the lock-in-adjacent period. Both are the same underlying match (one row of
// `matchedIpos[].matches`), classified by `dealStance()` on `dealBuySell`.
// Canonical identity for both registries is the chittorgarh Group Entity when
// the anchor came with one (the AMC/parent — the more stable, reusable
// identity across IPOs), else the anchor's own name.

/**
 * Classify a deal's buy/sell side into the investor-behavior label this
 * script cares about. NSE rows use 'BUY'/'SELL'; BSE rows use 'B'/'S'; BSE's
 * bulk-deal endpoint additionally uses 'P' (Purchase) for buys — see
 * BseClient.getBulkBlockDeals's doc comment (`TRANSACTION_TYPE`).
 * @param {string} buySell
 * @returns {'supportive'|'unsupportive'|'unknown'}
 */
function dealStance(buySell) {
  const v = String(buySell || '').toUpperCase();
  if (['BUY', 'B', 'P'].includes(v)) return 'supportive';
  if (['SELL', 'S'].includes(v)) return 'unsupportive';
  return 'unknown';
}

function investorSlug(canonicalName) {
  const base = normalizeInvestorName(canonicalName).toLowerCase().replace(/\s+/g, '-').slice(0, 50);
  let hash = 0;
  for (let i = 0; i < canonicalName.length; i++)
    hash = (hash * 31 + canonicalName.charCodeAt(i)) | 0;
  return `${base || 'investor'}_${Math.abs(hash).toString(36)}`;
}

function ipoCompanyId(ipo) {
  if (ipo.nseSymbol) return sanitizeCompanyId(`NSE:${ipo.nseSymbol}`);
  if (ipo.bseScripCode) return sanitizeCompanyId(`BSE:${ipo.bseScripCode}`);
  return null;
}

/**
 * Merge this run's matched-IPO evidence into an existing investor registry —
 * shared by both supportive (stance='supportive') and unsupportive
 * (stance='unsupportive') registries, each match routed to whichever
 * registry its `dealStance(dealBuySell)` says it belongs to. Never overwrite
 * (db.upsertMany does a shallow merge, so array fields must already be fully
 * merged before the record reaches it).
 * @param {Array} ipoWithMatch - matchedIpos from this run
 * @param {Array} existingRecords - dbV2.find('supportive-investors'|'unsupportive-investors', {})
 * @param {'supportive'|'unsupportive'} stance
 * @returns {Array} full records ready for db.upsertMany
 */
function buildInvestorRecords(ipoWithMatch, existingRecords, stance) {
  const byKey = new Map();
  for (const rec of existingRecords) {
    byKey.set(normalizeInvestorName(rec.canonicalName), {
      ...rec,
      companyIds: [...(rec.companyIds || [])],
      evidence: [...(rec.evidence || [])],
    });
  }

  for (const ipo of ipoWithMatch) {
    const companyId = ipoCompanyId(ipo);
    for (const m of ipo.matches || []) {
      if (dealStance(m.dealBuySell) !== stance) continue;
      const canonicalName = m.anchorGroupEntity || m.anchorInvestorName;
      const key = normalizeInvestorName(canonicalName);
      if (!byKey.has(key)) {
        byKey.set(key, {
          id: `investor_${investorSlug(canonicalName)}`,
          type: `${stance}-investor`,
          creator: CREATOR,
          canonicalName,
          companyIds: [],
          evidence: [],
        });
      }
      const rec = byKey.get(key);
      if (companyId && !rec.companyIds.includes(companyId)) rec.companyIds.push(companyId);

      const evidenceKey = `${companyId}|${m.dealDate}|${m.anchorInvestorName}`;
      const alreadyHave = rec.evidence.some(
        (e) => `${e.companyId}|${e.dealDate}|${e.anchorInvestorName}` === evidenceKey
      );
      if (!alreadyHave) {
        rec.evidence.push({
          companyId,
          companyName: ipo.companyName,
          listingDate: ipo.listingDate,
          anchorInvestorName: m.anchorInvestorName,
          matchedOn: m.matchedOn,
          matchScore: m.matchScore,
          matchedDealClientName: m.matchedDealClientName,
          dealSource: m.dealSource,
          dealBuySell: m.dealBuySell,
          dealDate: m.dealDate,
          dealQty: m.dealQty,
          dealPrice: m.dealPrice,
        });
      }
    }
  }
  return Array.from(byKey.values());
}

/**
 * For IPOs that had an anchor round but NO bulk-deal reappearance in THIS
 * run's window, check whether any of their anchor investors are already in
 * a known investor registry (supportive or unsupportive, from this run's own
 * new matches or a prior run) — i.e. "this investor has shown this behavior
 * elsewhere, just not (yet, or ever, since the window is finite) for this
 * particular IPO". Shared by both registries via the `label` used for the
 * output field name and each hit's `matched<Label>Investor` key.
 * @param {Array} ipos - unmatchedIposWithAnchorData (each carries raw `anchorInvestors`)
 * @param {Array} investorRecords - full merged registry (one stance)
 * @param {number} threshold
 * @param {'Supportive'|'Unsupportive'} label
 * @returns {Array} same ipos, each with `<label-lowercased>InvestorsPresentAsAnchor` added
 */
function crossCheckInvestorRegistry(ipos, investorRecords, threshold, label) {
  const canonicalNames = investorRecords.map((r) => r.canonicalName);
  const outField = `${label[0].toLowerCase()}${label.slice(1)}InvestorsPresentAsAnchor`;
  return ipos.map((ipo) => {
    const found = [];
    for (const a of ipo.anchorInvestors || []) {
      const byName = bestMatch(a.name, canonicalNames, threshold);
      const byGroup = a.groupEntity ? bestMatch(a.groupEntity, canonicalNames, threshold) : null;
      const match = byGroup && (!byName || byGroup.score > byName.score) ? byGroup : byName;
      if (!match) continue;
      const rec = investorRecords[match.index];
      found.push({
        anchorInvestorName: a.name,
        anchorGroupEntity: a.groupEntity || null,
        [`matched${label}Investor`]: rec.canonicalName,
        matchScore: match.score,
        matchedOn: match === byGroup ? 'groupEntity' : 'anchorName',
        [`${label[0].toLowerCase()}${label.slice(1)}InvestorCompanyCount`]: (rec.companyIds || [])
          .length,
      });
    }
    return { ...ipo, [outField]: found };
  });
}

/**
 * Cross-reference one IPO's anchor-investor list against a flat deals array.
 * Pure function — exported for offline testing.
 * @param {{companyName:string, nseSymbol?:string, bseScripCode?:string}} ipo
 * @param {Array} anchorInvestors
 * @param {Array} dealsRows - already windowed to this IPO's [listing, listing+window]
 * @param {number} threshold
 * @returns {Object}
 */
function crossReferenceIpo(ipo, anchorInvestors, dealsRows, threshold) {
  const companyNorm = normalizeCompanyName(ipo.companyName);
  const companyRows = dealsRows.filter((row) => {
    // Prefer an exact symbol/scrip-code match when the index row gave us one
    // (this IPO's NSE symbol / BSE scrip code) — far more precise than name
    // matching, and immune to punctuation/suffix drift between sources.
    if (ipo.nseSymbol && row.symbol && row.source.startsWith('nse')) {
      return row.symbol.toUpperCase() === ipo.nseSymbol.toUpperCase();
    }
    if (ipo.bseScripCode && row.symbol && row.source.startsWith('bse')) {
      return String(row.symbol) === String(ipo.bseScripCode);
    }
    // Fallback: normalized company-name containment (newly-listed SME issues
    // sometimes have a null nse_script_symbol/bse_script_code in the index
    // for the first few days post-listing).
    const rowNameNorm = normalizeCompanyName(row.companyName || '');
    return (
      rowNameNorm &&
      companyNorm &&
      (rowNameNorm.includes(companyNorm) || companyNorm.includes(rowNameNorm))
    );
  });

  const clientNames = companyRows.map((r) => r.clientName).filter(Boolean);
  const matches = [];
  for (const anchor of anchorInvestors) {
    // Chittorgarh-sourced anchors carry both the specific scheme name
    // ("QSIF EQUITY EX-TOP 100 LONG-SHORT FUND") and its parent Group Entity
    // ("QUANT MUTUAL FUND") — bulk-deal clientName strings more often use the
    // parent/AMC name than the scheme, so try both and keep whichever scores
    // higher (IPOPlatform-sourced anchors have no groupEntity, so this is a
    // no-op fallback to the plain-name match for those).
    const byName = bestMatch(anchor.name, clientNames, threshold);
    const byGroup = anchor.groupEntity
      ? bestMatch(anchor.groupEntity, clientNames, threshold)
      : null;
    const match = byGroup && (!byName || byGroup.score > byName.score) ? byGroup : byName;
    if (!match) continue;
    const dealRow = companyRows[match.index];
    matches.push({
      anchorInvestorName: anchor.name,
      anchorGroupEntity: anchor.groupEntity || null,
      anchorSharesAllotted: anchor.sharesAllotted,
      anchorAmountInvested: anchor.amountInvested,
      matchedOn: match === byGroup ? 'groupEntity' : 'anchorName',
      matchedDealClientName: match.candidate,
      matchScore: match.score,
      dealDate: dealRow.date,
      dealSource: dealRow.source,
      dealBuySell: dealRow.buySell,
      // 'supportive' = bought more, 'unsupportive' = sold, 'unknown' = an
      // unrecognized buy/sell code (shouldn't happen given NSE/BSE's known
      // value sets, but never silently mislabel one as the other).
      investorStance: dealStance(dealRow.buySell),
      dealQty: dealRow.qty,
      dealPrice: dealRow.price,
    });
  }

  return {
    companyId: ipo.companyId || null,
    companyName: ipo.companyName,
    nseSymbol: ipo.nseSymbol || null,
    bseScripCode: ipo.bseScripCode || null,
    exchange: ipo.exchange || null,
    listingDate: ipo.listingDate,
    ipoTypeLabel: ipo.ipoTypeLabel || null,
    companyLocation: ipo.companyLocation || null,
    offerPrice: ipo.offerPrice ?? null,
    listingPrice: ipo.listingPrice ?? null,
    cmp: ipo.cmp ?? null,
    issueSizeCr: ipo.issueSizeCr ?? null,
    peRatio: ipo.peRatio ?? null,
    listingGainPct: ipo.listingGainPct ?? null,
    cmpGainPct: ipo.cmpGainPct ?? null,
    // gmpGainPct/gmp/gmpDate are filled in later, only for reappeared matches
    // (trackWindow fetches investorgain.com only for the IPOs that ended up
    // in the matched list — no point paying for GMP history on IPOs that
    // never showed an anchor reappearance in the first place).
    gmpGainPct: null,
    gmp: null,
    gmpDate: null,
    // Granular subscription multiples — fetched once per anchor-round IPO in
    // trackWindow (see fetchSubscriptionMultiples), attached here so every
    // per-IPO result (matched or not) carries them, not just the summary.
    subscription: ipo.subscription || null,
    // Overall (Total) subscription multiple surfaced as its own top-level
    // field too — the headline number, not buried a level down in
    // `subscription` — per request to show it upfront.
    overallSubscriptionX: (ipo.subscription && ipo.subscription.totalSubscriptionX) ?? null,
    anchorSource: ipo.anchorSource || null,
    anchorInvestorCount: anchorInvestors.length,
    // Full raw anchor-investor list (not just the ones that matched a deal) —
    // needed downstream to check whether a known "supportive investor" (from
    // a PRIOR run's matches, via the supportive-investors DB) shows up as an
    // anchor here even though nothing in the current bulk-deal window matched.
    anchorInvestors: anchorInvestors.map((a) => ({
      name: a.name,
      groupEntity: a.groupEntity || null,
      sharesAllotted: a.sharesAllotted,
      amountInvested: a.amountInvested,
    })),
    dealRowsConsideredForCompany: companyRows.length,
    matchedAnchorCount: matches.length,
    matchedSupportiveCount: matches.filter((m) => m.investorStance === 'supportive').length,
    matchedUnsupportiveCount: matches.filter((m) => m.investorStance === 'unsupportive').length,
    anchorReappeared: matches.length > 0,
    matches,
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function trackWindow({
  fromYmd,
  toYmd,
  window = 2,
  threshold = 0.85,
  concurrency = 6,
  persist = true,
} = {}) {
  const warnings = new Set();
  // @stock/api exports ready-to-use singleton instances (see stock-api/src/index.js) —
  // reuse them directly, same as dealsDigest.js, rather than constructing new clients.
  const nseClient = nse;
  const bseClient = bse;

  const rawUniverse = await fetchPerformanceWindow({
    fromDate: fromYmd,
    toDate: toYmd,
    ipoType: 'all',
  });
  const universe = rawUniverse
    .filter((row) => row.ipo_year && row.chittorgarh_slug && row.id)
    .map((row) => ({
      companyId: row.id,
      companyName: row.company_name,
      listingDate: row.ipo_year,
      exchange: row.exchange,
      nseSymbol: row.nse_script_symbol || null,
      bseScripCode: row.bse_script_code || null,
      detailUrl: `https://www.ipoplatform.com/ipo/${row.chittorgarh_slug}/${row.id}`,
      chittorgarhId: row.chittorgarh_id || null,
      chittorgarhSlugHint: row.chittorgarh_slug || null,
      // Gain metrics — listing/cmp already ship on the index row (see
      // ipoBacktest.js's own use of listing_gain/cmp_percentage), GMP needs a
      // separate fetch (see fetchGmpHistory) so only the URL is carried here.
      listingGainPct: toINRNumber(row.listing_gain),
      cmpGainPct: toINRNumber(row.cmp_percentage),
      investorGainUrl: row.investor_gain || null,
      // Broader index-row pass-through (per-run request to surface everything
      // already fetched, not just the fields the matching logic itself needs)
      // — all straight off fetchPerformanceWindow's row, no extra fetch.
      offerPrice: toINRNumber(row.offer_price),
      listingPrice: toINRNumber(row.listing_price),
      cmp: toINRNumber(row.cmp),
      issueSizeCr: toINRNumber(row.ipo_size),
      peRatio: toINRNumber(row.price_to_earning),
      ipoTypeLabel: row.ipo_type || null,
      companyLocation: row.company_location || null,
    }));

  const detailResults = await mapWithConcurrency(universe, concurrency, async (ipo) => {
    const { anchorInvestors, anchorSource } = await fetchAnchorInvestors(ipo);
    return { ...ipo, anchorInvestors, anchorSource };
  });

  const withAnchors = [];
  const withoutAnchors = [];
  detailResults.forEach((r, i) => {
    if (!r.ok) {
      warnings.add(`Detail-page fetch failed for ${universe[i].companyName}: ${r.error.message}`);
      withoutAnchors.push({ ...universe[i], anchorInvestors: [] });
      return;
    }
    if (r.value.anchorInvestors.length > 0) withAnchors.push(r.value);
    else withoutAnchors.push(r.value);
  });

  // Subscription multiples for every anchor-round IPO (not just the matched
  // ones) — this is output the user wants rendered for the full 86, not a
  // matching input, so it's fetched unconditionally rather than gated like
  // GMP (which is expensive AND only meaningful for a "did the pop happen"
  // question that only matters once a match already exists).
  const subResults = await mapWithConcurrency(withAnchors, concurrency, (ipo) =>
    fetchSubscriptionMultiples(ipo)
  );
  subResults.forEach((r, i) => {
    if (r.ok) withAnchors[i].subscription = r.value;
    else {
      warnings.add(
        `Subscription-detail fetch failed for ${withAnchors[i].companyName}: ${r.error.message}`
      );
      withAnchors[i].subscription = null;
    }
  });

  const today = todayIstUtcDate();
  const crossRefResults = await mapWithConcurrency(withAnchors, concurrency, async (ipo) => {
    const listingDate = ymdToUtcDate(ipo.listingDate);
    const requestedEnd = addDays(listingDate, Math.max(0, window - 1));
    // Clamp to today — an IPO listed near the end of the --to window can have
    // a requested end date that hasn't happened yet (no data can exist for a
    // future session). Without this, e.g. a same-day listing with --window 2
    // would ask NSE/BSE for tomorrow and silently under-count (0 rows, not
    // an error) instead of correctly checking just the one session that's
    // actually elapsed.
    const windowEnd = requestedEnd > today ? today : requestedEnd;
    const truncated = requestedEnd > today;
    const dealsRows = await fetchDealsWindow(listingDate, windowEnd, {
      nseClient,
      bseClient,
      warnings,
    });
    const result = crossReferenceIpo(ipo, ipo.anchorInvestors, dealsRows, threshold);
    result.windowTruncatedToToday = truncated;
    result.dealsWindowChecked = { from: fmtYmd(listingDate), to: fmtYmd(windowEnd) };
    return result;
  });

  const perIpo = crossRefResults.map((r, i) =>
    r.ok
      ? r.value
      : {
          companyName: withAnchors[i].companyName,
          listingDate: withAnchors[i].listingDate,
          error: r.error.message,
          anchorReappeared: false,
        }
  );

  const ipoWithMatch = perIpo.filter((r) => r.anchorReappeared);

  // GMP fetch is scoped to matched IPOs only (see comment on the gmp* fields
  // in crossReferenceIpo's return) — a real per-IPO network call each, not
  // worth paying for the ~70 non-reappeared IPOs in a typical run.
  const withAnchorsById = new Map(withAnchors.map((ipo) => [ipo.companyId, ipo]));
  const gmpResults = await mapWithConcurrency(ipoWithMatch, concurrency, async (r) => {
    const src = withAnchorsById.get(r.companyId);
    const history = await fetchGmpHistory(src && src.investorGainUrl);
    return pickGmpForListing(history, r.listingDate);
  });
  ipoWithMatch.forEach((r, i) => {
    const g = gmpResults[i];
    if (g && g.ok && g.value) {
      r.gmp = g.value.gmp;
      r.gmpGainPct = g.value.gmpPercent;
      r.gmpDate = g.value.date;
    } else if (g && !g.ok) {
      warnings.add(`GMP fetch failed for ${r.companyName}: ${g.error.message}`);
    }
  });

  // Supportive-investor registry: merge this run's matches into whatever's
  // already stored (persist unless the caller opted out — --no-persist / a
  // unit test), then cross-check the OTHER anchor-round IPOs (the ones with
  // no reappearance in this run's own window) against the full merged
  // registry, so an investor's supportive behavior on IPO A also surfaces
  // when scanning IPO B, not just within a single run's own matches.
  const existingSupportive = persist ? dbV2.find('supportive-investors', {}) : [];
  const existingUnsupportive = persist ? dbV2.find('unsupportive-investors', {}) : [];
  const supportiveRecords = buildInvestorRecords(ipoWithMatch, existingSupportive, 'supportive');
  const unsupportiveRecords = buildInvestorRecords(
    ipoWithMatch,
    existingUnsupportive,
    'unsupportive'
  );
  let supportivePersistStats = { inserted: 0, updated: 0, unchanged: 0 };
  let unsupportivePersistStats = { inserted: 0, updated: 0, unchanged: 0 };
  if (persist) {
    if (supportiveRecords.length)
      supportivePersistStats = dbV2.upsertMany('supportive-investors', supportiveRecords);
    if (unsupportiveRecords.length)
      unsupportivePersistStats = dbV2.upsertMany('unsupportive-investors', unsupportiveRecords);
  }

  let unmatchedWithAnchorData = crossCheckInvestorRegistry(
    perIpo.filter((r) => !r.anchorReappeared),
    supportiveRecords,
    threshold,
    'Supportive'
  );
  unmatchedWithAnchorData = crossCheckInvestorRegistry(
    unmatchedWithAnchorData,
    unsupportiveRecords,
    threshold,
    'Unsupportive'
  );

  return {
    id: `anchor-bulk-deal-tracker_${fromYmd}_${toYmd}`,
    creator: CREATOR,
    creationTime: new Date().toISOString(),
    params: { fromYmd, toYmd, windowDays: window, threshold },
    summary: {
      iposInWindow: universe.length,
      iposWithAnchorData: withAnchors.length,
      iposWithoutAnchorData: withoutAnchors.length,
      iposWithAnchorReappearingInBulkDeal: ipoWithMatch.length,
      reappearanceRatePctOfAnchorIpos: withAnchors.length
        ? Math.round((ipoWithMatch.length / withAnchors.length) * 1000) / 10
        : null,
      matchedSupportiveInvestorCount: ipoWithMatch.reduce(
        (n, r) => n + r.matchedSupportiveCount,
        0
      ),
      matchedUnsupportiveInvestorCount: ipoWithMatch.reduce(
        (n, r) => n + r.matchedUnsupportiveCount,
        0
      ),
      iposWithSupportiveInvestorAsAnchorButNoReappearance: unmatchedWithAnchorData.filter(
        (r) => r.supportiveInvestorsPresentAsAnchor && r.supportiveInvestorsPresentAsAnchor.length
      ).length,
      iposWithUnsupportiveInvestorAsAnchorButNoReappearance: unmatchedWithAnchorData.filter(
        (r) =>
          r.unsupportiveInvestorsPresentAsAnchor && r.unsupportiveInvestorsPresentAsAnchor.length
      ).length,
    },
    matchedIpos: ipoWithMatch,
    unmatchedIposWithAnchorData: unmatchedWithAnchorData,
    iposWithoutAnchorParticipation: withoutAnchors.map((ipo) => ({
      companyName: ipo.companyName,
      listingDate: ipo.listingDate,
    })),
    supportiveInvestorRegistry: {
      persisted: persist,
      totalInvestorsInRegistry: supportiveRecords.length,
      newOrUpdatedThisRun: supportivePersistStats,
    },
    unsupportiveInvestorRegistry: {
      persisted: persist,
      totalInvestorsInRegistry: unsupportiveRecords.length,
      newOrUpdatedThisRun: unsupportivePersistStats,
    },
    warnings: Array.from(warnings),
  };
}

// ── HTML render (pure template over the DTO — conventions.md §5: JSON is the
// source of truth, this is always regenerable from it, never hand-edited) ──

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]
  );
}
function fmtNum(n) {
  return n === null || n === undefined ? '—' : Intl.NumberFormat('en-IN').format(n);
}
function fmtPct(n) {
  return n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n}%`;
}
function fmtDateLong(ymd) {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function isBuy(side) {
  return ['BUY', 'B', 'P'].includes(String(side || '').toUpperCase());
}
function fmtX(n) {
  return n === null || n === undefined ? '—' : `${n}x`;
}
function fmtMoney(n) {
  return n === null || n === undefined ? '—' : `₹${fmtNum(n)}`;
}

const SUB_FIELDS = [
  ['Total', 'totalSubscriptionX'],
  ['Anchor', 'anchorX'],
  ['QIB (ex anchor)', 'qibX'],
  ['sHNI', 'sHniX'],
  ['bHNI', 'bHniX'],
  ['NII', 'niiX'],
  ['RII', 'riiX'],
  ['Employee', 'employeeX'],
  ['Shareholder', 'shareholderX'],
];

function subscriptionGrid(sub) {
  if (!sub || !sub.subscriptionDataParsed) {
    return '<p class="match-meta" style="padding:8px 0;">Subscription multiples not published for this IPO.</p>';
  }
  const cells = SUB_FIELDS.filter(([, key]) => sub[key] !== null && sub[key] !== undefined)
    .map(
      ([label, key]) =>
        `<div><span class="gain-label">${label}</span><span class="gain-val" style="font-size:13px;">${fmtX(sub[key])}</span></div>`
    )
    .join('');
  return `<div class="gains" style="grid-template-columns:repeat(4,1fr);">${cells}</div>`;
}

function priceStrip(ipo) {
  return `<p class="match-meta" style="padding:8px 0 0;">Offer ${fmtMoney(ipo.offerPrice)} · Listing ${fmtMoney(ipo.listingPrice)} · CMP ${fmtMoney(ipo.cmp)}${ipo.issueSizeCr != null ? ` · Issue size ₹${ipo.issueSizeCr}cr` : ''}${ipo.peRatio != null ? ` · P/E ${ipo.peRatio}` : ''}</p>`;
}

/**
 * Render the tracker DTO as a single self-contained HTML file (same visual
 * language as the chat widget this script's output is normally turned into —
 * flat cards, expandable rows, no external JS framework). Always regenerable
 * from the JSON DTO; never edit this output by hand.
 * @param {Object} dto - trackWindow()'s return value
 * @returns {string} HTML document
 */
function renderHtml(dto) {
  const s = dto.summary;
  const cards = [
    ['IPOs in window', fmtNum(s.iposInWindow)],
    ['Had anchor round', fmtNum(s.iposWithAnchorData)],
    ['Anchor reappeared', fmtNum(s.iposWithAnchorReappearingInBulkDeal)],
    [
      'Reappearance rate',
      s.reappearanceRatePctOfAnchorIpos === null ? '—' : `${s.reappearanceRatePctOfAnchorIpos}%`,
    ],
    [
      'Supportive investor seen, no reappearance',
      fmtNum(s.iposWithSupportiveInvestorAsAnchorButNoReappearance),
    ],
    [
      'Unsupportive investor seen, no reappearance',
      fmtNum(s.iposWithUnsupportiveInvestorAsAnchorButNoReappearance),
    ],
  ];

  const matchedRows = (dto.matchedIpos || [])
    .map((ipo) => {
      const matches = (ipo.matches || [])
        .map(
          (x) => `
      <div class="match">
        <div class="match-head">
          <p class="match-name">${escapeHtml(x.anchorInvestorName)}</p>
          <span class="side ${isBuy(x.dealBuySell) ? 'buy' : 'sell'}">${isBuy(x.dealBuySell) ? 'Bought (supportive)' : 'Sold (unsupportive)'}</span>
        </div>
        <p class="match-sub">group entity: ${escapeHtml(x.anchorGroupEntity || '—')}</p>
        <p class="match-sub">matched to <span class="hl">${escapeHtml(x.matchedDealClientName)}</span>
          <span class="${x.matchScore < 0.95 ? 'weak' : 'muted'}">(score ${x.matchScore}${x.matchScore < 0.95 ? ', weak match' : ''})</span>
        </p>
        <p class="match-meta">${escapeHtml(x.dealSource)} · ${fmtNum(x.dealQty)} shares at ₹${x.dealPrice} · ${escapeHtml(x.dealDate)}</p>
      </div>`
        )
        .join('');

      const gains = `
      <div class="gains">
        <div><span class="gain-label">Listing gain</span><span class="gain-val">${fmtPct(ipo.listingGainPct)}</span></div>
        <div><span class="gain-label">GMP gain</span><span class="gain-val">${fmtPct(ipo.gmpGainPct)}${ipo.gmpDate ? ` <span class="muted">(${fmtDateLong(ipo.gmpDate)})</span>` : ''}</span></div>
        <div><span class="gain-label">CMP gain</span><span class="gain-val">${fmtPct(ipo.cmpGainPct)}</span></div>
      </div>`;

      return `
      <div class="card" data-search="${escapeHtml((ipo.companyName + ' ' + (ipo.nseSymbol || '') + ' ' + (ipo.matches || []).map((x) => x.anchorInvestorName + ' ' + (x.anchorGroupEntity || '')).join(' ')).toLowerCase())}">
        <button class="head" type="button">
          <div class="head-left">
            <p class="company">${escapeHtml(ipo.companyName)}</p>
            <p class="meta">${escapeHtml(ipo.nseSymbol || ipo.bseScripCode || '—')} · listed ${fmtDateLong(ipo.listingDate)}${ipo.windowTruncatedToToday ? ' · window truncated to listing day only' : ''}</p>
          </div>
          <div class="head-right">
            ${ipo.overallSubscriptionX != null ? `<span class="badge sub">${fmtX(ipo.overallSubscriptionX)} subscribed</span>` : ''}
            <span class="badge">${ipo.matchedAnchorCount} of ${ipo.anchorInvestorCount} matched</span>
            <i class="ti ti-chevron-down chev" aria-hidden="true"></i>
          </div>
        </button>
        <div class="body">
          ${gains}
          ${priceStrip(ipo)}
          ${subscriptionGrid(ipo.subscription)}
          ${matches}
        </div>
      </div>`;
    })
    .join('');

  const otherRows = (dto.unmatchedIposWithAnchorData || [])
    .map((ipo) => {
      const supportive = ipo.supportiveInvestorsPresentAsAnchor || [];
      const unsupportive = ipo.unsupportiveInvestorsPresentAsAnchor || [];
      const supportiveHtml = supportive.length
        ? supportive
            .map(
              (x) => `
        <div class="match">
          <div class="match-head">
            <p class="match-name">${escapeHtml(x.anchorInvestorName)}</p>
            <span class="side buy">Supportive</span>
          </div>
          <p class="match-sub">matches known supportive investor <span class="hl">${escapeHtml(x.matchedSupportiveInvestor)}</span>
            <span class="${x.matchScore < 0.95 ? 'weak' : 'muted'}">(score ${x.matchScore}, seen supportive in ${x.supportiveInvestorCompanyCount} other IPO${x.supportiveInvestorCompanyCount === 1 ? '' : 's'})</span>
          </p>
        </div>`
            )
            .join('')
        : '<p class="match-meta" style="padding:8px 0;">None of this IPO\'s anchors are in the supportive-investor registry.</p>';
      const unsupportiveHtml = unsupportive.length
        ? unsupportive
            .map(
              (x) => `
        <div class="match">
          <div class="match-head">
            <p class="match-name">${escapeHtml(x.anchorInvestorName)}</p>
            <span class="side sell">Unsupportive</span>
          </div>
          <p class="match-sub">matches known unsupportive investor <span class="hl">${escapeHtml(x.matchedUnsupportiveInvestor)}</span>
            <span class="${x.matchScore < 0.95 ? 'weak' : 'muted'}">(score ${x.matchScore}, seen unsupportive in ${x.unsupportiveInvestorCompanyCount} other IPO${x.unsupportiveInvestorCompanyCount === 1 ? '' : 's'})</span>
          </p>
        </div>`
            )
            .join('')
        : '<p class="match-meta" style="padding:8px 0;">None of this IPO\'s anchors are in the unsupportive-investor registry.</p>';

      return `
      <div class="card" data-search="${escapeHtml((ipo.companyName + ' ' + (ipo.nseSymbol || '')).toLowerCase())}">
        <button class="head" type="button">
          <div class="head-left">
            <p class="company">${escapeHtml(ipo.companyName)}</p>
            <p class="meta">${escapeHtml(ipo.nseSymbol || ipo.bseScripCode || '—')} · listed ${fmtDateLong(ipo.listingDate)} · ${ipo.anchorInvestorCount} anchor${ipo.anchorInvestorCount === 1 ? '' : 's'}</p>
          </div>
          <div class="head-right">
            ${ipo.overallSubscriptionX != null ? `<span class="badge sub">${fmtX(ipo.overallSubscriptionX)} subscribed</span>` : ''}
            ${supportive.length ? `<span class="badge">${supportive.length} supportive seen</span>` : ''}
            ${unsupportive.length ? `<span class="badge warn">${unsupportive.length} unsupportive seen</span>` : ''}
            <i class="ti ti-chevron-down chev" aria-hidden="true"></i>
          </div>
        </button>
        <div class="body">
          ${priceStrip(ipo)}
          ${subscriptionGrid(ipo.subscription)}
          ${supportiveHtml}
          ${unsupportiveHtml}
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Anchor investor bulk-deal reappearance — ${escapeHtml(dto.params.fromYmd)} to ${escapeHtml(dto.params.toYmd)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.44.0/iconfont/tabler-icons.min.css">
<style>
  :root { --bg:#fff; --surface1:#f7f6f3; --surface2:#fff; --border:#e5e3dd; --text1:#1a1a18; --text2:#6b6a64; --text-muted:#93928c; --accent-bg:#e6f1fb; --accent-text:#0c447c; --success:#3b6d11; --danger:#a32d2d; --warn:#854f0b; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1c1c1a; --surface1:#252523; --surface2:#252523; --border:#3a3a37; --text1:#f0efe9; --text2:#b4b2a9; --text-muted:#888780; --accent-bg:#0c447c; --accent-text:#b5d4f4; --success:#97c459; --danger:#f09595; --warn:#fac775; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem; background:var(--bg); color:var(--text1); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:14px; }
  .wrap { max-width:720px; margin:0 auto; }
  h1 { font-size:18px; font-weight:500; margin:0 0 4px; }
  .subtitle { font-size:13px; color:var(--text2); margin:0 0 1.5rem; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-bottom:1.5rem; }
  .metric { background:var(--surface1); border-radius:8px; padding:1rem; }
  .metric p:first-child { font-size:13px; color:var(--text2); margin:0 0 4px; }
  .metric p:last-child { font-size:22px; font-weight:500; margin:0; }
  .toolbar { display:flex; align-items:center; gap:10px; margin-bottom:1rem; }
  #search { flex:1; height:36px; padding:0 12px; border-radius:8px; border:0.5px solid var(--border); background:var(--surface2); color:var(--text1); font-size:14px; }
  #count { font-size:13px; color:var(--text2); white-space:nowrap; }
  .card { background:var(--surface2); border:0.5px solid var(--border); border-radius:12px; margin-bottom:10px; overflow:hidden; }
  .head { width:100%; text-align:left; background:none; border:none; padding:0.9rem 1.1rem; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; color:inherit; font:inherit; }
  .company { font-weight:500; font-size:14px; margin:0 0 2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .meta { font-size:12px; color:var(--text2); margin:0; }
  .head-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .badge { background:var(--accent-bg); color:var(--accent-text); font-size:12px; padding:3px 10px; border-radius:8px; white-space:nowrap; }
  .badge.sub { background:var(--surface1); color:var(--text1); font-weight:500; }
  .badge.warn { background:transparent; color:var(--danger); border:0.5px solid var(--danger); }
  .chev { font-size:18px; color:var(--text2); transition:transform .15s; }
  .card.open .chev { transform:rotate(180deg); }
  .body { display:none; padding:0 1.1rem 1rem; border-top:0.5px solid var(--border); }
  .card.open .body { display:block; }
  .gains { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding:12px 0; border-bottom:0.5px solid var(--border); }
  .gain-label { display:block; font-size:11px; color:var(--text2); }
  .gain-val { display:block; font-size:14px; font-weight:500; margin-top:2px; }
  .match { padding:10px 0; border-bottom:0.5px solid var(--border); }
  .match:last-child { border-bottom:none; }
  .match-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:4px; }
  .match-name { font-size:13px; font-weight:500; margin:0; }
  .side { font-size:12px; white-space:nowrap; }
  .side.buy { color:var(--success); }
  .side.sell { color:var(--danger); }
  .match-sub { font-size:12px; color:var(--text2); margin:0 0 4px; }
  .match-sub .hl { color:var(--text1); }
  .match-sub .weak { color:var(--warn); }
  .match-sub .muted { color:var(--text-muted); }
  .match-meta { font-size:12px; color:var(--text-muted); margin:4px 0 0; }
  .empty { text-align:center; padding:2rem 0; color:var(--text2); font-size:13px; }
  .section-label { font-size:15px; font-weight:500; margin:2rem 0 0.75rem; }
  .section-sub { font-size:12px; color:var(--text2); margin:0 0 1rem; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Anchor investor bulk-deal reappearance</h1>
  <p class="subtitle">IPOs listed ${fmtDateLong(dto.params.fromYmd)} to ${fmtDateLong(dto.params.toYmd)} · listing day + T+${dto.params.windowDays - 1} window</p>
  <div class="cards">
    ${cards.map(([label, val]) => `<div class="metric"><p>${label}</p><p>${val}</p></div>`).join('')}
  </div>
  <div class="toolbar">
    <input type="text" id="search" placeholder="Search company or investor">
    <span id="count">${dto.matchedIpos.length} IPOs</span>
  </div>
  <div id="list">${matchedRows}</div>
  <div class="empty" id="empty" style="display:none">No matches for that search.</div>

  <p class="section-label">Other IPOs with an anchor round (${dto.unmatchedIposWithAnchorData.length})</p>
  <p class="section-sub">No anchor reappeared in a bulk/block deal within this run's own window — subscription multiples and any known supportive investor found as an anchor here (from a different IPO's evidence) below.</p>
  <div id="other-list">${otherRows}</div>
</div>
<script>
  function wireUp(container) {
    Array.prototype.slice.call(container.querySelectorAll('.card')).forEach(function (c) {
      c.querySelector('.head').addEventListener('click', function () { c.classList.toggle('open'); });
    });
  }
  wireUp(document.getElementById('list'));
  wireUp(document.getElementById('other-list'));

  var allCards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var matchedCards = Array.prototype.slice.call(document.getElementById('list').querySelectorAll('.card'));
  var search = document.getElementById('search');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');
  search.addEventListener('input', function () {
    var q = search.value.toLowerCase();
    var shownMatched = 0;
    allCards.forEach(function (c) {
      var match = !q || c.getAttribute('data-search').indexOf(q) >= 0;
      c.style.display = match ? '' : 'none';
      if (match && matchedCards.indexOf(c) >= 0) shownMatched++;
    });
    count.textContent = shownMatched + ' IPO' + (shownMatched === 1 ? '' : 's');
    empty.style.display = shownMatched === 0 ? 'block' : 'none';
  });
</script>
</body>
</html>`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv(argValue('--env-file'));

  const fromYmd = argValue('--from');
  const toYmd = argValue('--to');
  if (!fromYmd || !toYmd) {
    console.error(
      'Usage: node anchorBulkDealTracker.js --from YYYY-MM-DD --to YYYY-MM-DD [--window N] [--threshold 0.85] [--concurrency 6] [--out <path>] [--no-persist]'
    );
    process.exit(1);
  }
  const windowDays = parseInt(argValue('--window') || '2', 10);
  const threshold = parseFloat(argValue('--threshold') || '0.85');
  const concurrency = parseInt(argValue('--concurrency') || '6', 10);
  const outPath = argValue('--out');
  const persist = !process.argv.includes('--no-persist');

  const dto = await trackWindow({
    fromYmd,
    toYmd,
    window: windowDays,
    threshold,
    concurrency,
    persist,
  });
  const json = JSON.stringify({ ...dto, touchedFiles: dbV2.touchedFiles() }, null, 2);
  const html = renderHtml(dto);

  if (outPath) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    // --out is always treated as the JSON path; the HTML render (conventions.md
    // §5 — a pure template over the same DTO, never a second source of truth)
    // is always written alongside it at the same base name, .json -> .html.
    const jsonPath = outPath.endsWith('.json') ? outPath : `${outPath}.json`;
    const htmlPath = jsonPath.replace(/\.json$/, '.html');
    fs.writeFileSync(jsonPath, json);
    fs.writeFileSync(htmlPath, html);
    console.error(`Wrote ${jsonPath}`);
    console.error(`Wrote ${htmlPath}`);
  }
  console.log(json);
}

module.exports = {
  parseAnchorInvestors,
  parseChittorgarhAnchorInvestors,
  fetchAnchorInvestors,
  chittorgarhDetailUrl,
  fetchSubscriptionMultiples,
  crossReferenceIpo,
  fetchDealsWindow,
  fetchGmpHistory,
  parseGmpHistory,
  pickGmpForListing,
  investorSlug,
  ipoCompanyId,
  dealStance,
  buildInvestorRecords,
  crossCheckInvestorRegistry,
  trackWindow,
  renderHtml,
  normalizeNseRow,
  normalizeBseRow,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
