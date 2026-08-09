#!/usr/bin/env node
'use strict';

/**
 * ipoSubscriptionScanner.js — Daily IPO Subscription Quality Ranker
 * (task: daily-ipo-subscription-analysis-stockmarket).
 *
 * Pure Extraction pass (skills/_shared/conventions.md §17 — no LLM/judgment here):
 *   1. Fetch IPOPlatform's "Closed IPOs" page → keep only IPOs whose Listing Date
 *      equals `--date` + 1 day (IST). That is today's universe — bidding is over,
 *      final subscription numbers are in, and the stock lists tomorrow.
 *   2. Fetch IPOPlatform's "Live IPO Subscription Status" page → merge Total/QIB/
 *      sHNI/bHNI/NII/RII/Employee/Shareholder subscription columns onto each
 *      universe IPO, matched by the numeric IPOPlatform id embedded in both
 *      pages' detail-page URLs (the only stable join key across the two tables).
 *   3. For each matched IPO, fetch its IPOPlatform detail page once to recover the
 *      "Read RHP" prospectus link if IPOPlatform has one published; otherwise the
 *      detail page URL itself is stored so drhp-ipo-analysis can locate/download
 *      the RHP from there.
 *   4. Compute a deterministic Subscription Quality Score and rank the universe —
 *      formula + weights are documented in
 *      skills/equity-research/ipo-subscription-ranker/references/ipo_ranking_framework.md
 *      and must not drift from that doc; change both together.
 *   5. Persist one record per IPO into the `ipos` collection (db.upsertMany) and
 *      print the full ranked DTO to stdout. The ipo-subscription-ranker skill's
 *      LLM step reads this JSON — it never re-derives or re-scrapes any of it.
 *
 * Offline testability: parseClosedIpos / parseSubscriptionStatus / parseDrhpLink /
 * computeSubscriptionScore are pure functions of an HTML/data string — exported
 * for tests to call with fixture HTML, no network needed.
 *
 * Usage:
 *   node ipoSubscriptionScanner.js [--date YYYY-MM-DD] [--dry-run] [--out <path>]
 *
 *   --date     Reference "today" (IST). Default: system date. Listing-date filter
 *              is this date + 1 calendar day.
 *   --dry-run  Fetch + parse + rank + print. Skips db.upsertMany (no persistence).
 *   --out      Also write the DTO JSON to this file path (in addition to stdout).
 */

const path = require('path');
const dbV2 = require('./lib/db');

const CLOSED_URL = 'https://www.ipoplatform.com/ipo/closed';
const SUBSCRIPTION_URL = 'https://www.ipoplatform.com/ipo/subscription-status';
const UA =
  'Mozilla/5.0 (compatible; StockmarketIpoScanner/1.0; contact: djplearner@gmail.com)';
const CREATOR = 'ipo-subscription-ranker';

// ── CLI helpers ──────────────────────────────────────────────────────────────

function argValue(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : argv[i + 1];
}

// Both branches return a Date whose UTC-getter fields (toISOString,
// getUTCDate, ...) represent the IST calendar date/time — never mix this with
// the Date's *local*-getter fields (getDate/setDate), which depend on the
// host machine's own timezone and would silently double-shift on a host
// that's already IST (this bit before — see git blame). The override branch
// parses the string as UTC midnight directly; the no-override branch adds a
// fixed +5:30 to the real UTC epoch. Both conventions must stay in lockstep
// with fmtYmd/addDays below, which likewise only ever touch UTC getters.
function todayIst(dateOverride) {
  if (dateOverride) return new Date(`${dateOverride}T00:00:00Z`);
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60000);
}

function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function fmtYmd(d) {
  return d.toISOString().slice(0, 10);
}

// IPOPlatform renders dates like "12 Aug 2026" — normalize to YYYY-MM-DD.
const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
function parseIpoPlatformDate(text) {
  const m = String(text || '').trim().match(/(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/);
  if (!m) return null;
  const [, dd, mon, yyyy] = m;
  const mm = MONTHS[mon.toLowerCase().slice(0, 3)];
  if (!mm) return null;
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// ── Tiny dependency-free HTML helpers ───────────────────────────────────────
// IPOPlatform's tables are server-rendered (DataTables only enhances existing
// markup client-side), so a small regex-based row/cell splitter is enough and
// avoids adding a new npm dependency for one scraper.

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x20B9;/gi, '₹')
    .replace(/&#10004;/g, '✔')
    .replace(/&#10008;/g, '✘')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTableRows(html, tableId) {
  const tableRe = new RegExp(`<table[^>]*id=["']${tableId}["'][\\s\\S]*?</table>`, 'i');
  const tableMatch = html.match(tableRe);
  if (!tableMatch) return [];
  const tbodyMatch = tableMatch[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  const tbody = tbodyMatch ? tbodyMatch[0] : tableMatch[0];
  const rows = tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  return rows
    .map((row) => row.match(/<td[\s\S]*?<\/td>/gi) || [])
    .filter((cells) => cells.length > 0);
}

function firstHref(cellHtml) {
  const m = String(cellHtml || '').match(/href=["']([^"']+)["']/);
  return m ? m[1] : null;
}

function ipoIdFromUrl(url) {
  const m = String(url || '').match(/-ipo\/(\d+)/);
  return m ? m[1] : null;
}

function toNum(text) {
  const cleaned = String(text || '').replace(/[,x]/gi, '').trim();
  if (!cleaned || cleaned === '-') return null;
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

// ── Closed IPOs table ────────────────────────────────────────────────────────
// #combined-ipo-table columns: Company Name | Type | Open-Close Date |
// Listing Date | Issue Size (Cr.) | Issue Price (₹) | Exchange | Merchant Banker

function parseClosedIpos(html) {
  const rows = extractTableRows(html, 'combined-ipo-table');
  return rows
    .map((cells) => {
      if (cells.length < 8) return null;
      const nameCell = cells[0];
      const href = firstHref(nameCell);
      const ipoId = ipoIdFromUrl(href);
      if (!ipoId) return null;
      return {
        ipoId,
        detailUrl: href,
        companyName: stripTags(nameCell).replace(/IPO Review Report.*/i, '').trim(),
        ipoType: stripTags(cells[1]),
        openCloseDate: stripTags(cells[2]),
        listingDate: parseIpoPlatformDate(stripTags(cells[3])),
        listingDateRaw: stripTags(cells[3]),
        issueSizeCr: toNum(stripTags(cells[4])),
        issuePriceRaw: stripTags(cells[5]),
        exchange: stripTags(cells[6]),
        merchantBanker: stripTags(cells[7]),
      };
    })
    .filter(Boolean);
}

// ── Subscription-status table ───────────────────────────────────────────────
// #pe-based columns: Company Name | Type | Status | Closing Date | Issue Size |
// Issue Price | Anchor | Total Subscription | QIB | sHNI | bHNI | NII | RII |
// Employee | Shareholder

function parseSubscriptionStatus(html) {
  const rows = extractTableRows(html, 'pe-based');
  const byId = {};
  for (const cells of rows) {
    if (cells.length < 13) continue;
    const href = firstHref(cells[0]);
    const ipoId = ipoIdFromUrl(href);
    if (!ipoId) continue;
    byId[ipoId] = {
      ipoId,
      subscriptionUrl: `https://www.ipoplatform.com/ipo/subscription/${
        String(href || '').split('/ipo/')[1] || ''
      }`,
      status: stripTags(cells[2]),
      closingDate: parseIpoPlatformDate(stripTags(cells[3])),
      anchorParticipated: /✔/.test(stripTags(cells[6])),
      totalSubscriptionX: toNum(stripTags(cells[7])),
      qibX: toNum(stripTags(cells[8])),
      sHniX: toNum(stripTags(cells[9])),
      bHniX: toNum(stripTags(cells[10])),
      niiX: toNum(stripTags(cells[11])),
      riiX: toNum(stripTags(cells[12])),
      employeeX: cells[13] ? toNum(stripTags(cells[13])) : null,
      shareholderX: cells[14] ? toNum(stripTags(cells[14])) : null,
    };
  }
  return byId;
}

// ── Detail page → RHP/Prospectus link ───────────────────────────────────────

function parseDrhpLink(html) {
  const m =
    html.match(/<a[^>]*title=["']Read RHP["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']Read RHP["']/i) ||
    html.match(/<a[^>]*title=["']Read DRHP["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']Read DRHP["']/i);
  return m ? m[1] : null;
}

// ── Deterministic Subscription Quality Score(s) ─────────────────────────────
// Formula lives in ./lib/ipoScoring.js — shared with ipoBacktest.js /
// ipoWeightFinder.js so a historical backtest and the live daily scan can
// never silently diverge on what the score means. See that file's header /
// references/ipo_ranking_framework.md for the weights and rationale.
//
// Two scores per IPO (added 2026-08-09, full-database weight-finding run):
// `listingScore` (SCORE_WEIGHTS_LISTING, optimized to predict listing-day
// gain) and `cagrScore` (SCORE_WEIGHTS_CAGR, optimized to predict longer-run
// daily-CAGR performance). `computeSubscriptionScore`/`tierFor` (legacy
// single-weight-set formula) stay exported for backward compatibility /
// tests; `computeDualScores` is what `scan()` actually uses now.
const { computeSubscriptionScore, computeDualScores, tierFor } = require('./lib/ipoScoring');

// ── Orchestration ────────────────────────────────────────────────────────────

async function scan({ date } = {}) {
  const runDate = todayIst(date);
  const listingFilterDate = fmtYmd(addDays(runDate, 1));

  const [closedHtml, subHtml] = await Promise.all([
    fetchHtml(CLOSED_URL),
    fetchHtml(SUBSCRIPTION_URL),
  ]);

  const closedIpos = parseClosedIpos(closedHtml);
  const universe = closedIpos.filter((ipo) => ipo.listingDate === listingFilterDate);

  const subById = parseSubscriptionStatus(subHtml);

  // Bounded-concurrency detail-page fetch (conventions.md §16 — never unbounded
  // fan-out; the universe here is small — typically 1-10 IPOs/day — so a simple
  // Promise.all is within the same spirit without needing the shared helper).
  const detailResults = await Promise.all(
    universe.map(async (ipo) => {
      try {
        const html = await fetchHtml(ipo.detailUrl);
        return { ipoId: ipo.ipoId, drhpLink: parseDrhpLink(html) };
      } catch (e) {
        return { ipoId: ipo.ipoId, drhpLink: null, detailFetchError: String(e.message || e) };
      }
    })
  );
  const detailById = Object.fromEntries(detailResults.map((d) => [d.ipoId, d]));

  const merged = universe.map((ipo) => {
    const sub = subById[ipo.ipoId] || {};
    const detail = detailById[ipo.ipoId] || {};
    const rec = { ...ipo, ...sub, ...detail };
    rec.reviewUrl = ipo.detailUrl ? ipo.detailUrl.replace('/ipo/', '/ipo/review/') : null;
    const dual = computeDualScores(rec);
    rec.listingScore = dual.listingScore;
    rec.listingTier = dual.listingTier;
    rec.cagrScore = dual.cagrScore;
    rec.cagrTier = dual.cagrTier;
    rec.cagrConfidence = dual.cagrConfidence;
    // Legacy single-score fields, kept for anything still reading them —
    // now an alias of the listing-basis score (closest to the old formula's
    // original intent: same-day/near-term quality read).
    rec.subscriptionQualityScore = dual.listingScore;
    rec.subscriptionQualityTier = dual.listingTier;
    return rec;
  });

  // Primary rank = listingScore (the score this scan's near-term "closed
  // IPOs about to list" universe is most directly comparable against);
  // cagrScore is carried as a secondary column for the ranker skill/email to
  // weigh alongside it when picking the top 3 (per 2026-08-09 ask).
  merged.sort((a, b) => b.listingScore - a.listingScore);
  // Combined score weights listingScore 0.7 / cagrScore 0.3 (2026-08-09 ask)
  // — listing-day gain is the stronger, better-validated signal (r 0.21-0.38
  // vs 0.12-0.21 for CAGR at n=837, see lib/ipoScoring.js), so it should
  // dominate the combined ranking, with CAGR as a smaller adjustment rather
  // than an equal-weight blend. Both scores are log10p1-weighted onto
  // roughly the same [0, ~1.5] scale, so no separate normalization is
  // needed before blending. Used only for top-3 selection below, not for
  // `rank` (which stays listingScore-based, the near-term-relevant ordering
  // for this "closing tomorrow" table).
  const LISTING_WEIGHT_IN_COMBINED = 0.7;
  const CAGR_WEIGHT_IN_COMBINED = 0.3;
  merged.forEach((r, i) => {
    r.rank = i + 1;
    r.combinedScore =
      Math.round((r.listingScore * LISTING_WEIGHT_IN_COMBINED + r.cagrScore * CAGR_WEIGHT_IN_COMBINED) * 1000) / 1000;
  });

  // Top 3 chosen on BOTH scores (2026-08-09 ask), not listingScore alone —
  // highest combined average, tie-broken by whichever basis is stronger.
  const top3 = merged
    .slice()
    .sort((a, b) => b.combinedScore - a.combinedScore || b.listingScore - a.listingScore)
    .slice(0, 3);

  const unmatched = universe
    .filter((ipo) => !subById[ipo.ipoId])
    .map((ipo) => ipo.ipoId);

  return {
    date: fmtYmd(runDate),
    listingDateFilter: listingFilterDate,
    totalClosedIposScanned: closedIpos.length,
    universeSize: universe.length,
    matchedWithSubscription: universe.length - unmatched.length,
    unmatchedIpoIds: unmatched,
    ranked: merged,
    top3,
  };
}

function toRecords(dto) {
  return dto.ranked.map((r) => ({
    id: `ipo_${r.ipoId}`,
    type: 'ipo-subscription',
    creator: CREATOR,
    date: dto.date,
    ipoPlatformId: r.ipoId,
    companyName: r.companyName,
    ipoType: r.ipoType,
    exchange: r.exchange,
    detailUrl: r.detailUrl,
    reviewUrl: r.reviewUrl,
    drhpLink: r.drhpLink || r.detailUrl,
    openCloseDate: r.openCloseDate,
    listingDate: r.listingDate,
    issueSizeCr: r.issueSizeCr,
    issuePriceRaw: r.issuePriceRaw,
    merchantBanker: r.merchantBanker,
    subscription: {
      status: r.status || null,
      anchorParticipated: !!r.anchorParticipated,
      totalX: r.totalSubscriptionX ?? null,
      qibX: r.qibX ?? null,
      sHniX: r.sHniX ?? null,
      bHniX: r.bHniX ?? null,
      niiX: r.niiX ?? null,
      riiX: r.riiX ?? null,
      employeeX: r.employeeX ?? null,
      shareholderX: r.shareholderX ?? null,
    },
    subscriptionQualityScore: r.subscriptionQualityScore,
    subscriptionQualityTier: r.subscriptionQualityTier,
    listingScore: r.listingScore,
    listingTier: r.listingTier,
    cagrScore: r.cagrScore,
    cagrTier: r.cagrTier,
    cagrConfidence: r.cagrConfidence,
    combinedScore: r.combinedScore,
    rank: r.rank,
    scoreFormulaRef:
      'skills/equity-research/ipo-subscription-ranker/references/ipo_ranking_framework.md',
  }));
}

async function main() {
  const argv = process.argv.slice(2);
  const date = argValue(argv, '--date', null);
  const dryRun = argv.includes('--dry-run');
  const outPath = argValue(argv, '--out', null);

  const dto = await scan({ date });

  let stats = { inserted: 0, updated: 0, unchanged: 0 };
  if (!dryRun && dto.ranked.length) {
    stats = dbV2.upsertMany('ipos', toRecords(dto));
  }

  const output = { ...dto, persistStats: stats, touchedFiles: dbV2.touchedFiles() };
  const json = JSON.stringify(output, null, 2);
  if (outPath) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json);
  }
  console.log(json);
}

module.exports = {
  parseClosedIpos,
  parseSubscriptionStatus,
  parseDrhpLink,
  computeSubscriptionScore,
  tierFor,
  parseIpoPlatformDate,
  scan,
  toRecords,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
