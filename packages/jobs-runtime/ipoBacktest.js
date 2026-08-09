#!/usr/bin/env node
'use strict';

/**
 * ipoBacktest.js — backtests the IPO Subscription Quality Score
 * (`lib/ipoScoring.js`, the same formula `ipoSubscriptionScanner.js` uses
 * live) against ACTUAL listing-day and current-CMP performance for every IPO
 * that listed in a given trailing window (default: last 3 months).
 *
 * Pure Extraction (skills/_shared/conventions.md §17) — every number here is
 * fetched/parsed/computed, never estimated. The only thing left for a
 * human/LLM to do after this script runs is INTERPRET the printed
 * correlation/tier-bucket/decile stats and decide whether SCORE_WEIGHTS in
 * lib/ipoScoring.js should change — this script deliberately never edits
 * those weights itself.
 *
 * Data sources (both public — confirmed live, no auth/cookies/CSRF needed
 * despite what a browser DevTools cURL export shows; those extra headers are
 * incidental to a signed-in browser session, not required by the endpoint):
 *
 *   1. https://www.ipoplatform.com/main-board/index — DataTables
 *      server-processing JSON API backing the "IPO Performance Tracker" page
 *      (https://www.ipoplatform.com/ipo-performance-tracker). `ipo_type=all`
 *      covers Mainboard + SME in one feed. Despite the name, `ipo_year` is
 *      the IPO's actual LISTING DATE (YYYY-MM-DD), confirmed against each
 *      row's own `ipo_opening_date`/`ipo_closing_date`/`allotment_date` —
 *      this is what the backtest window filters on. Gives: `offer_price`,
 *      `listing_price`, `cmp` (+ `cmp_update_date`), `nse_script_symbol` /
 *      `bse_script_code` (for companyId resolution now that the stock is
 *      actually listed), `chittorgarh_slug` + `id` (to build the
 *      subscription detail-page URL below).
 *
 *   2. https://www.ipoplatform.com/ipo/subscription/<slug>/<id> — each IPO's
 *      permanent subscription-status page embeds a schema.org JSON-LD Table
 *      (`<script type="application/ld+json">...mainEntity.itemListElement`)
 *      with every reserved category's FINAL subscription multiple (Anchor,
 *      QIB (Ex Anchor), Non Institutional Buyers, bNII, sNII, Retail,
 *      Employee, Shareholder, Total) — the same figures the live daily
 *      scanner reads off the transient "closed IPOs" subscription-status
 *      table, but preserved indefinitely per-IPO. This is what makes a
 *      months-back backtest possible at all (the live table only carries
 *      the last few weeks).
 *
 * Usage:
 *   node ipoBacktest.js [--months 3] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *                        [--ipo-type all|mainboard|sme] [--concurrency 8]
 *                        [--limit N] [--out <path>] [--dry-run] [--index-only]
 *
 *   --months       Trailing window in months, ending --to (default 3).
 *                  Ignored if --from is also given.
 *   --from / --to  Explicit YYYY-MM-DD window (inclusive both ends).
 *                  --to defaults to today (IST) if omitted.
 *   --ipo-type     all | mainboard | sme (default all).
 *   --concurrency  Bounded fan-out for the per-IPO detail-page fetch, ignored
 *                  in --index-only mode (default 8 — conventions.md §16,
 *                  never unbounded).
 *   --limit        Cap the number of IPOs scored (debugging only).
 *   --out          Also write the full DTO JSON to this path.
 *   --dry-run      Fetch + compute + print. Skip db.saveReport persistence.
 *   --index-only   Skip the per-IPO detail-page fetch entirely; score off the
 *                  index API's own `subscription` (Total Subscription) field
 *                  only. No QIB/HNI/RII breakdown, so the composite score
 *                  degrades to a total-only score — but this mode reaches
 *                  back through the FULL history (years, confirmed back to at
 *                  least 2023 in spot checks), unlike the default mode, which
 *                  the site's own data only supports back to ~2025-09-24 (see
 *                  the big comment in backtest() below for how this was
 *                  discovered and confirmed). Use this for a long-window
 *                  sanity check on the naive "does total subscription predict
 *                  returns at all" question; use default mode for validating
 *                  the actual weighted QIB/HNI/RII formula over the shorter
 *                  window where that data exists.
 */

const path = require('path');
const dbV2 = require('./lib/db');
const { computeSubscriptionScore, tierFor, SCORE_WEIGHTS } = require('./lib/ipoScoring');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');

const PERFORMANCE_API = 'https://www.ipoplatform.com/main-board/index';
const UA =
  'Mozilla/5.0 (compatible; StockmarketIpoBacktest/1.0; contact: djplearner@gmail.com)';
const CREATOR = 'ipo-scoring-backtest';
const PAGE_SIZE = 100;

// ── CLI helpers ──────────────────────────────────────────────────────────────

function argValue(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : argv[i + 1];
}

function todayIst(dateOverride) {
  if (dateOverride) return new Date(`${dateOverride}T00:00:00Z`);
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60000);
}

function addMonths(d, n) {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}

function fmtYmd(d) {
  return d.toISOString().slice(0, 10);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'x-requested-with': 'XMLHttpRequest',
      referer: 'https://www.ipoplatform.com/ipo-performance-tracker',
    },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// ── Performance-tracker API paging ──────────────────────────────────────────
// Sorted desc by ipo_year (listing date) so we can stop as soon as a page's
// rows fall entirely before `fromDate` — never fetch the full 2000+ row
// history when a 3-month window only needs the first ~100-150 rows.

async function fetchPerformanceWindow({ fromDate, toDate, ipoType }) {
  const rows = [];
  let start = 0;
  for (;;) {
    const url =
      `${PERFORMANCE_API}?draw=1&start=${start}&length=${PAGE_SIZE}` +
      `&order_by=ipo_year&order_direction=desc&ipo_type=${encodeURIComponent(ipoType)}`;
    const page = await fetchJson(url);
    const data = page.data || [];
    if (!data.length) break;

    let sawAnyInWindow = false;
    let sawAnyBelowWindow = false;
    for (const r of data) {
      const listingDate = r.ipo_year; // misleadingly named — see file header
      if (!listingDate) continue;
      if (listingDate > toDate) continue; // newer than window end, skip
      if (listingDate < fromDate) {
        sawAnyBelowWindow = true;
        continue;
      }
      sawAnyInWindow = true;
      rows.push(r);
    }

    // Page is sorted desc, so once we've passed the window's start with no
    // in-window rows left to find on this page, later pages are only older.
    const lastRowDate = data[data.length - 1].ipo_year;
    if (lastRowDate && lastRowDate < fromDate) break;
    if (!sawAnyInWindow && sawAnyBelowWindow) break;

    start += PAGE_SIZE;
    if (start > page.recordsTotal) break;
  }
  return rows;
}

// ── Subscription detail page → JSON-LD category multiples ──────────────────
// Category label (as it appears in the JSON-LD "<Category> Subscription"
// PropertyValue) → our canonical field name. Unrecognized categories are
// kept under `otherCategories` for visibility but not scored.
const CATEGORY_MAP = {
  'QIB (Ex Anchor)': 'qibX',
  'Anchor Investors': 'anchorX',
  'Market Maker': 'marketMakerX',
  'Non Institutional Buyers': 'niiX', // combined NII (not split) — reference only
  bNII: 'bHniX',
  sNII: 'sHniX',
  Retail: 'riiX',
  'Retail Individual Investors (RIIs)': 'riiX',
  Employee: 'employeeX',
  Shareholder: 'shareholderX',
  Total: 'totalSubscriptionX',
};

function parseSubscriptionDetail(html) {
  const out = { otherCategories: {} };
  const re = /"name"\s*:\s*"([^"]+?)\s+Subscription"\s*,\s*"value"\s*:\s*"([\d.]+)x"/g;
  let m;
  let found = false;
  while ((m = re.exec(html))) {
    found = true;
    const [, label, numStr] = m;
    const value = parseFloat(numStr);
    const field = CATEGORY_MAP[label];
    if (field) out[field] = value;
    else out.otherCategories[label] = value;
  }
  out.anchorParticipated = out.anchorX != null;
  out._parsed = found;
  return out;
}

// ── Deterministic outcome metrics (never trust a label field blindly —
// recompute from offer/listing/CMP prices per conventions.md's anti-
// hallucination discipline, even though the API also ships a `listing_gain`
// field that happens to agree) ───────────────────────────────────────────────

function pctChange(from, to) {
  if (from == null || to == null || from === 0) return null;
  return Math.round(((to / from - 1) * 100 + Number.EPSILON) * 100) / 100;
}

// ── Compounding-normalized outcome metrics (v2, 2026-08-09) ────────────────
//
// Raw `currentPerformancePct` (cmp/offer-1, no time normalization) mixes IPOs
// with wildly different holding periods — a 2017 IPO that's simply had 9
// extra years to compound looks identical in KIND to one from last month with
// 2 weeks of trading. Comparing those in one tier/quintile bucket is comparing
// apples to oranges by holding period, not by subscription quality (it
// visibly inverted the tier ordering in the first 10-year backtest run — POOR
// tier showed the highest mean raw return, purely because POOR-tier IPOs in
// that sample skewed older).
//
// v1 of this fix ANNUALIZED (raised to the 365/days power). That over-
// corrects: annualizing is itself an extrapolation — it asks "if this IPO
// kept compounding at its realized rate for a full year," which is a
// hypothetical, not a measurement, and for short-hold IPOs it blows a modest
// realized move into an absurd hypothetical (a tier mean once came back at
// 16,126% from a single 95-day holder). v1 patched this with a floor + a
// ±500% clip — a band-aid on a metric that was extrapolating too far in the
// first place.
//
// v2 (this version): express the realized compounding rate on a DAILY or
// WEEKLY basis instead of annual — i.e. don't extrapolate past the exponent
// the data actually supports. `periodCagrPct(..., periodDays)` computes
// `(cmp/offer)^(periodDays/daysHeld) - 1`; for `periodDays=1` (daily) this
// exponent is always ≤1 for any IPO held ≥1 day, so it can never amplify a
// realized move the way `365/daysHeld` does for a fresh listing — the result
// is the ACTUAL realized daily/weekly compounding rate, not a projection.
// This is the more statistically robust choice for correlation/regression
// work (matches the request: use daily/weekly CAGR as the outcome variable
// when re-deriving weight suggestions in `suggestWeights()` below) — no
// artificial clip needed because there's no extrapolation left to clip.
// `periodDays=365` (annualized) is kept available for intuitive "%/year"
// reporting but is NOT what `suggestWeights()` regresses against.
function periodCagrPct(from, to, listingDateStr, asOfDateStr, periodDays, minHoldDays) {
  if (from == null || to == null || from === 0 || to <= 0 || !listingDateStr) return null;
  const listed = new Date(`${listingDateStr}T00:00:00Z`);
  const asOf = new Date(`${asOfDateStr}T00:00:00Z`);
  const days = (asOf - listed) / 86400000;
  if (!(days >= minHoldDays)) return null;
  const rate = (Math.pow(to / from, periodDays / days) - 1) * 100;
  // Decimal precision scales with how small the period is — a daily rate of
  // "0.05%" rounded to 2dp collapses distinct IPOs to the same value.
  const dp = periodDays <= 1 ? 4 : periodDays <= 7 ? 3 : 2;
  const factor = 10 ** dp;
  return Math.round((rate + Number.EPSILON) * factor) / factor;
}

// Daily: virtually no extrapolation (exponent ≤1 once ≥1 day is held) — the
// primary robust metric for correlation/weight-finding work.
function dailyCagrPct(from, to, listingDateStr, asOfDateStr) {
  return periodCagrPct(from, to, listingDateStr, asOfDateStr, 1, 3);
}

// Weekly: mild extrapolation below 1 week held (exponent >1), floored at 14
// days so the exponent never exceeds 3.5x — still far short of annual's
// up-to-122x exponent for a 3-day holder.
function weeklyCagrPct(from, to, listingDateStr, asOfDateStr) {
  return periodCagrPct(from, to, listingDateStr, asOfDateStr, 7, 14);
}

// Annualized: kept for intuitive "%/year" reporting on longer-held stocks
// only — floored at 90 days and clipped to ±500%, same as the original v1
// fix, because the extrapolation this represents (up to 4x exponent at the
// 90-day floor) is real and this metric is not used for weight-finding.
const ANNUALIZED_CLIP_PCT = 500;
function annualizedPctChange(from, to, listingDateStr, asOfDateStr) {
  const raw = periodCagrPct(from, to, listingDateStr, asOfDateStr, 365, 90);
  if (raw == null) return null;
  return Math.max(-ANNUALIZED_CLIP_PCT, Math.min(ANNUALIZED_CLIP_PCT, raw));
}

// ── Stats (Pearson correlation, tier buckets, decile spread) ───────────────

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null; // not meaningful below a handful of points
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : Math.round((num / denom) * 1000) / 1000;
}

function correlationSuite(records, outcomeField) {
  const fields = ['subscriptionQualityScore', ...Object.keys(SCORE_WEIGHTS), 'niiX'];
  const suite = {};
  for (const field of fields) {
    const pairs = records
      .filter((r) => r[field] != null && r[outcomeField] != null)
      .map((r) => [r[field], r[outcomeField]]);
    suite[field] = {
      n: pairs.length,
      pearsonR: pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      ),
    };
  }
  return suite;
}

/**
 * Data-driven ALTERNATIVE to the hand-set SCORE_WEIGHTS in lib/ipoScoring.js
 * — a suggestion for a human/LLM to weigh, never auto-applied (conventions.md
 * §17 draws this line explicitly: a script computes, a person/LLM decides
 * whether to change a constant that encodes judgment).
 *
 * Method (deliberately simple, not a real regression): for each category
 * field, take its Pearson r against `outcomeField` (recommended:
 * `currentPerformanceDailyCagrPct` — the compounding-robust, non-
 * extrapolated metric per this file's outcome-metrics header — rather than
 * `listingGainPct`, which the fixed weights are already well-validated
 * against; the open question is whether the SAME weights also best predict
 * longer-run performance, or whether a different mix would). Negative
 * correlations are floored to 0 (a category that anti-predicts the outcome
 * shouldn't get a negative weight in this simple scheme — that's a
 * regression-coefficient question, not a correlation one, and out of scope
 * here) and the remaining r values are normalized to sum to the same total
 * weight budget as SCORE_WEIGHTS (1.0, i.e. excluding the flat anchor bonus)
 * so the suggestion is directly substitutable.
 *
 * Caveat this function does NOT correct for: category multiples are
 * correlated with each other (a hot IPO tends to have high QIB AND high RII
 * together), so per-field Pearson r conflates each category's own signal
 * with how much it co-moves with the others — a proper fix is multivariate
 * regression (e.g. ridge/OLS across all categories at once), which this
 * function deliberately does not attempt (out of scope for a first pass;
 * flagged here so a future revision doesn't mistake this for more rigorous
 * than it is).
 *
 * CALLER CONTRACT — same `records` for every basis you compare: this
 * function does its own internal null-filtering per field/outcome, but if
 * you're calling it twice with different `outcomeField`s to compare bases
 * (e.g. daily CAGR vs weekly CAGR), pass the SAME pre-filtered `records` to
 * both calls. Passing each call the full independently-null-filtered set
 * looks more "complete" but silently changes the sample between the two
 * calls — different outcome metrics have different minimum-hold floors
 * (daily's is 3 days, weekly's is 14), so the daily call would end up
 * pooling in extra very-fresh listings the weekly call excludes. Those extra
 * listings carry much higher return variance (still-volatile IPO-week price
 * action) and dilute the pooled Pearson r for every category — a sample-
 * composition artifact, not a real "this basis has less signal" finding
 * (verified live, 2026-08-09: restricting both bases to the stricter-floor
 * subset made per-category r agree to within 0.005 across daily vs weekly;
 * the unrestricted comparison had shown a ~0.16 gap on QIB alone). See the
 * `stableForWeights` filter at this function's call site in `backtest()`.
 */
function suggestWeights(records, outcomeField) {
  const fields = Object.keys(SCORE_WEIGHTS);
  const totalBudget = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  const rByField = {};
  for (const field of fields) {
    const pairs = records
      .filter((r) => r[field] != null && r[outcomeField] != null)
      .map((r) => [r[field], r[outcomeField]]);
    rByField[field] = {
      n: pairs.length,
      pearsonR: pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      ),
    };
  }
  const floored = {};
  let sumFloored = 0;
  for (const field of fields) {
    const r = rByField[field].pearsonR;
    const v = r != null && r > 0 ? r : 0;
    floored[field] = v;
    sumFloored += v;
  }
  const suggested = {};
  for (const field of fields) {
    suggested[field] =
      sumFloored > 0 ? Math.round(((floored[field] / sumFloored) * totalBudget + Number.EPSILON) * 1000) / 1000 : null;
  }
  return {
    outcomeField,
    basis: rByField,
    currentWeights: SCORE_WEIGHTS,
    suggestedWeights: sumFloored > 0 ? suggested : null,
    note:
      sumFloored > 0
        ? 'Simple correlation-proportional suggestion — see this function\'s header for the multivariate-regression caveat before adopting.'
        : 'No category had a positive correlation with this outcome in this sample — insufficient signal to suggest a re-weighting (check sample size / re-run with a larger window).',
  };
}

function tierBuckets(records, outcomeField) {
  const tiers = ['STRONG', 'MODERATE', 'WEAK', 'POOR'];
  const out = {};
  for (const tier of tiers) {
    const vals = records
      .filter((r) => r.subscriptionQualityTier === tier && r[outcomeField] != null)
      .map((r) => r[outcomeField]);
    out[tier] = {
      n: vals.length,
      meanPct: vals.length ? Math.round(mean(vals) * 100) / 100 : null,
      medianPct: vals.length ? Math.round(median(vals) * 100) / 100 : null,
      winRatePct: vals.length
        ? Math.round((vals.filter((v) => v > 0).length / vals.length) * 1000) / 10
        : null,
    };
  }
  return out;
}

function decileSpread(records, outcomeField) {
  const scored = records
    .filter((r) => r.subscriptionQualityScore != null && r[outcomeField] != null)
    .sort((a, b) => b.subscriptionQualityScore - a.subscriptionQualityScore);
  if (scored.length < 10) return null;
  const bucketSize = Math.max(1, Math.floor(scored.length / 5)); // quintiles (5 buckets — deciles need 10+ per bucket, too sparse at this sample size)
  const top = scored.slice(0, bucketSize).map((r) => r[outcomeField]);
  const bottom = scored.slice(-bucketSize).map((r) => r[outcomeField]);
  return {
    bucketSize,
    topQuintileMeanPct: Math.round(mean(top) * 100) / 100,
    bottomQuintileMeanPct: Math.round(mean(bottom) * 100) / 100,
    spreadPct: Math.round((mean(top) - mean(bottom)) * 100) / 100,
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function backtest({ fromDate, toDate, ipoType, concurrency, limit, indexOnly } = {}) {
  let universe = await fetchPerformanceWindow({ fromDate, toDate, ipoType });
  if (limit) universe = universe.slice(0, limit);

  // IMPORTANT DATA-AVAILABILITY FINDING (confirmed live, 2026-08-09): IPOPlatform's
  // per-IPO subscription detail page only carries the granular QIB/sHNI/bHNI/RII/
  // Anchor JSON-LD breakdown for IPOs listing from ~2025-09-24 onward — pages for
  // older IPOs return HTTP 200 with a genuinely EMPTY itemListElement (verified
  // directly, not a parser bug on our side; spot-checked well-known IPOs like
  // Northern Arc Capital [2024-09-24] and Rikhav Securities [2025-01-22], both 0
  // items). So a full-history backtest of the actual weighted composite score is
  // not possible before that date — this is a third-party data-source ceiling, not
  // something a smarter parser fixes. `--index-only` trades the granular categories
  // for full 10-year+ reach: the performance-tracker INDEX API itself carries a
  // `subscription` field (confirmed populated back to at least 2023, likely
  // further) that is the IPO's Total Subscription multiple — no per-IPO detail
  // fetch needed at all, so this mode is index-pagination-bound only (seconds, not
  // minutes, even for a 10-year window). Every other category field is left null;
  // computeSubscriptionScore() already degrades gracefully to a total-only score
  // when that's the only field present (it normalizes by weight actually seen), and
  // the per-field correlationSuite() below reports `totalSubscriptionX`'s own
  // correlation independently either way — that number is what's actually
  // comparable across a --index-only 10-year run and a granular ~10-month run.
  const results = indexOnly
    ? universe.map((row) => ({ ok: true, value: scoreRowFromIndexOnly(row, toDate) }))
    : await mapWithConcurrency(universe, concurrency, async (row) => scoreRowWithDetailFetch(row, toDate));

  const records = results.map((r, i) =>
    r.ok ? r.value : { ipoPlatformId: universe[i].id, companyName: universe[i].company_name, error: String(r.error) }
  );
  const scored = records.filter((r) => r.subscriptionQualityScore != null);
  const unparsed = records.filter((r) => r.subscriptionQualityScore == null);

  const summary = {
    universeSize: universe.length,
    scoredCount: scored.length,
    unparsedCount: unparsed.length,
    indexOnly: !!indexOnly,
    correlations: {
      vsListingGain: correlationSuite(scored, 'listingGainPct'),
      vsCurrentPerformance: correlationSuite(scored, 'currentPerformancePct'),
      vsCurrentPerformanceAnnualized: correlationSuite(scored, 'currentPerformanceAnnualizedPct'),
      vsCurrentPerformanceDailyCagr: correlationSuite(scored, 'currentPerformanceDailyCagrPct'),
      vsCurrentPerformanceWeeklyCagr: correlationSuite(scored, 'currentPerformanceWeeklyCagrPct'),
    },
    tierBuckets: {
      vsListingGain: tierBuckets(scored, 'listingGainPct'),
      vsCurrentPerformance: tierBuckets(scored, 'currentPerformancePct'),
      vsCurrentPerformanceAnnualized: tierBuckets(scored, 'currentPerformanceAnnualizedPct'),
      vsCurrentPerformanceDailyCagr: tierBuckets(scored, 'currentPerformanceDailyCagrPct'),
      vsCurrentPerformanceWeeklyCagr: tierBuckets(scored, 'currentPerformanceWeeklyCagrPct'),
    },
    quintileSpread: {
      vsListingGain: decileSpread(scored, 'listingGainPct'),
      vsCurrentPerformance: decileSpread(scored, 'currentPerformancePct'),
      vsCurrentPerformanceAnnualized: decileSpread(scored, 'currentPerformanceAnnualizedPct'),
      vsCurrentPerformanceDailyCagr: decileSpread(scored, 'currentPerformanceDailyCagrPct'),
      vsCurrentPerformanceWeeklyCagr: decileSpread(scored, 'currentPerformanceWeeklyCagrPct'),
    },
    // Data-driven alternative weights (Extraction only — a suggestion, never
    // auto-applied to lib/ipoScoring.js; see suggestWeights()'s own header).
    // Meaningless in --index-only mode (no category fields to regress), so
    // only computed when the granular per-category data was fetched.
    //
    // Both bases MUST be computed on the same underlying record set — NOT
    // `scored` filtered independently per metric's own null-eligibility.
    // Found live (2026-08-09, see ipo_ranking_framework.md "Why is there a
    // gap between daily and weekly weights" for the full diagnosis): the
    // daily-eligible set is larger than the weekly-eligible one (weekly's
    // 14-day minimum hold drops very-fresh listings that daily's 3-day
    // minimum keeps), and those extra few-days-old IPOs have MUCH higher
    // variance in their daily return than the rest of the sample (still
    // riding initial listing-week volatility) — pooling them in dilutes the
    // daily-basis Pearson r for every category by a variance-mismatch
    // artifact, NOT because daily granularity genuinely carries less signal.
    // Proof: restricting the daily correlation to exactly the same records
    // used for weekly made the two agree almost exactly (QIB r 0.431 vs
    // 0.436) — the earlier ~0.16 gap was 100% a sample-composition artifact.
    // `stableForWeights` below is that common, apples-to-apples subset — the
    // stricter (weekly) eligibility floor applied to BOTH bases.
    suggestedWeights: indexOnly
      ? null
      : (() => {
          const stableForWeights = scored.filter((r) => r.currentPerformanceWeeklyCagrPct != null);
          return {
            sampleSize: stableForWeights.length,
            basedOnDailyCagr: suggestWeights(stableForWeights, 'currentPerformanceDailyCagrPct'),
            basedOnWeeklyCagr: suggestWeights(stableForWeights, 'currentPerformanceWeeklyCagrPct'),
          };
        })(),
  };

  return {
    fromDate,
    toDate,
    ipoType,
    indexOnly: !!indexOnly,
    scoreWeightsUsed: SCORE_WEIGHTS,
    summary,
    records: records.sort((a, b) => (b.listingDate || '').localeCompare(a.listingDate || '')),
  };
}

function commonOutcomeFields(row, asOfDate) {
  const offerPrice = row.offer_price != null ? parseFloat(row.offer_price) : null;
  const listingPrice = row.listing_price != null ? parseFloat(row.listing_price) : null;
  const cmp = row.cmp != null ? parseFloat(row.cmp) : null;
  return {
    offerPrice,
    listingPrice,
    cmp,
    listingGainPct: pctChange(offerPrice, listingPrice),
    currentPerformancePct: pctChange(offerPrice, cmp),
    currentPerformanceAnnualizedPct: annualizedPctChange(offerPrice, cmp, row.ipo_year, asOfDate),
    currentPerformanceDailyCagrPct: dailyCagrPct(offerPrice, cmp, row.ipo_year, asOfDate),
    currentPerformanceWeeklyCagrPct: weeklyCagrPct(offerPrice, cmp, row.ipo_year, asOfDate),
  };
}

function baseRecordFields(row) {
  return {
    ipoPlatformId: row.id,
    companyName: row.company_name,
    slug: row.chittorgarh_slug,
    detailUrl: `https://www.ipoplatform.com/ipo/${row.chittorgarh_slug}/${row.id}`,
    subscriptionDetailUrl: `https://www.ipoplatform.com/ipo/subscription/${row.chittorgarh_slug}/${row.id}`,
    ipoType: row.ipo_type,
    exchange: row.exchange,
    listingDate: row.ipo_year,
    cmpUpdateDate: row.cmp_update_date || null,
    companyId: row.nse_script_symbol
      ? sanitizeCompanyId(`NSE:${row.nse_script_symbol}`)
      : row.bse_script_code
        ? sanitizeCompanyId(`BSE:${row.bse_script_code}`)
        : null,
    // Confirmed 2026-08-09: both fields live directly on the performance-tracker
    // index API row (no separate "ipo" dashboard endpoint needed) — free to carry
    // through on EVERY record, full history, zero extra network cost. `ipo_size`
    // is issue size in Cr; `company_valuation` is IPOPlatform's own implied
    // post-issue market-cap figure in Cr (used here as a market-cap proxy).
    issueSizeCr: row.ipo_size != null && row.ipo_size !== '' ? parseFloat(row.ipo_size) : null,
    marketCapCr:
      row.company_valuation != null && row.company_valuation !== ''
        ? parseFloat(row.company_valuation)
        : null,
    // Per-category RESERVED (offered) share counts, straight off the index
    // API row — added 2026-08-09 so nseIpoHistoryFetcher.js's applied-share
    // counts (which NSE's own bidDetails frequently omits an offered
    // denominator for, especially SME series) can be self-computed at
    // consumption time via applied/offeredFromHere, without any regex or
    // Market-Maker-subtraction trick. See
    // skills/equity-research/ipo-subscription-ranker/references/ipo_data_sources.md.
    sharesOfferedRaw: {
      qib: numOrNull(row.qib_shares_offered),
      qibExAnchor: numOrNull(row.qib_ex_anchor_shares_offered),
      anchor: numOrNull(row.anchor_investor_shares_offered),
      nii: numOrNull(row.nii_shares_offered),
      bNii: numOrNull(row.bnii_shares_offered),
      sNii: numOrNull(row.snii_shares_offered),
      retail: numOrNull(row.retail_shares_offered),
      marketMaker: numOrNull(row.market_maker_shares_offered),
    },
  };
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** --index-only mode: no network call beyond the already-fetched index page. */
function scoreRowFromIndexOnly(row, asOfDate) {
  const outcomes = commonOutcomeFields(row, asOfDate);
  const totalSubscriptionX =
    row.subscription != null && row.subscription !== '' ? parseFloat(row.subscription) : null;
  const rec = {
    ...baseRecordFields(row),
    ...outcomes,
    qibX: null,
    sHniX: null,
    bHniX: null,
    niiX: null,
    riiX: null,
    employeeX: null,
    shareholderX: null,
    totalSubscriptionX,
    anchorParticipated: false,
    subscriptionDataParsed: totalSubscriptionX != null,
    otherCategories: {},
    fetchError: null,
  };
  rec.subscriptionQualityScore = totalSubscriptionX != null ? computeSubscriptionScore(rec) : null;
  rec.subscriptionQualityTier =
    rec.subscriptionQualityScore != null ? tierFor(rec.subscriptionQualityScore) : null;
  return rec;
}

/** Default mode: one detail-page fetch per IPO for the full category breakdown. */
async function scoreRowWithDetailFetch(row, asOfDate) {
  const detailUrl = `https://www.ipoplatform.com/ipo/subscription/${row.chittorgarh_slug}/${row.id}`;
  let sub = { _parsed: false, otherCategories: {} };
  let fetchError = null;
  try {
    const html = await fetchText(detailUrl);
    sub = parseSubscriptionDetail(html);
  } catch (e) {
    fetchError = String(e.message || e);
  }

  const outcomes = commonOutcomeFields(row, asOfDate);
  const rec = {
    ...baseRecordFields(row),
    ...outcomes,
    qibX: sub.qibX ?? null,
    sHniX: sub.sHniX ?? null,
    bHniX: sub.bHniX ?? null,
    niiX: sub.niiX ?? null,
    riiX: sub.riiX ?? null,
    employeeX: sub.employeeX ?? null,
    shareholderX: sub.shareholderX ?? null,
    totalSubscriptionX: sub.totalSubscriptionX ?? null,
    anchorParticipated: !!sub.anchorParticipated,
    subscriptionDataParsed: sub._parsed,
    otherCategories: sub.otherCategories,
    fetchError,
  };
  rec.subscriptionQualityScore = sub._parsed ? computeSubscriptionScore(rec) : null;
  rec.subscriptionQualityTier =
    rec.subscriptionQualityScore != null ? tierFor(rec.subscriptionQualityScore) : null;
  return rec;
}

function toReportDto(result, { modelUsed } = {}) {
  const companyIds = result.records.map((r) => r.companyId).filter(Boolean);
  return {
    // Explicit deterministic id (never left to ensureEnvelope's auto-derive):
    // saveReport() always discriminates on `dto.type` alone, which would
    // collapse every backtest run ending on the same day (e.g. a 3-month and
    // a 6-month window both run --to today) into one overwritten record.
    // Discriminating on the actual window + ipo_type keeps them distinct
    // while still deduping a genuine re-run of the identical window.
    id: dbV2.makeId(
      'rpt',
      CREATOR,
      'global',
      result.toDate,
      `${result.fromDate}_${result.toDate}_${result.ipoType}_${result.indexOnly ? 'indexonly' : 'full'}`
    ),
    type: 'ipo-scoring-backtest',
    creator: CREATOR,
    date: result.toDate,
    companyIds,
    summary: `IPO scoring backtest ${result.fromDate}..${result.toDate} (${result.ipoType}${
      result.indexOnly ? ', index-only/total-subscription-only mode — see file header for why' : ''
    }): ${result.summary.scoredCount}/${result.summary.universeSize} IPOs scored. Total-subscription-vs-listing-gain r=${
      result.summary.correlations.vsListingGain.totalSubscriptionX?.pearsonR ?? 'n/a'
    }, score-vs-listing-gain r=${
      result.summary.correlations.vsListingGain.subscriptionQualityScore?.pearsonR ?? 'n/a'
    }, score-vs-currentPerformanceDailyCagr r=${
      result.summary.correlations.vsCurrentPerformanceDailyCagr.subscriptionQualityScore?.pearsonR ?? 'n/a'
    }.`,
    ...(modelUsed ? { modelUsed } : {}),
    fromDate: result.fromDate,
    toDate: result.toDate,
    ipoType: result.ipoType,
    indexOnly: result.indexOnly,
    scoreWeightsUsed: result.scoreWeightsUsed,
    scoreFormulaRef: 'packages/jobs-runtime/lib/ipoScoring.js',
    ...result.summary,
    records: result.records,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const months = parseInt(argValue(argv, '--months', '3'), 10);
  const toOverride = argValue(argv, '--to', null);
  const fromOverride = argValue(argv, '--from', null);
  const ipoType = argValue(argv, '--ipo-type', 'all');
  const concurrency = parseInt(argValue(argv, '--concurrency', '8'), 10);
  const limit = argValue(argv, '--limit', null);
  const outPath = argValue(argv, '--out', null);
  const dryRun = argv.includes('--dry-run');
  const indexOnly = argv.includes('--index-only');

  const to = todayIst(toOverride);
  const toDate = fmtYmd(to);
  const fromDate = fromOverride || fmtYmd(addMonths(to, -months));

  const result = await backtest({
    fromDate,
    toDate,
    ipoType,
    concurrency,
    limit: limit ? parseInt(limit, 10) : null,
    indexOnly,
  });

  let saveInfo = { status: 'skipped', reason: 'dry-run' };
  if (!dryRun) {
    const dto = toReportDto(result);
    dbV2.saveReport(dto);
    saveInfo = { status: 'saved', id: dto.id, touchedFiles: dbV2.touchedFiles() };
  }

  const output = { ...result, saveInfo };
  const json = JSON.stringify(output, null, 2);
  if (outPath) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json);
  }
  console.log(json);
}

module.exports = {
  fetchPerformanceWindow,
  parseSubscriptionDetail,
  pctChange,
  periodCagrPct,
  dailyCagrPct,
  weeklyCagrPct,
  annualizedPctChange,
  pearson,
  mean,
  median,
  tierBuckets,
  decileSpread,
  correlationSuite,
  suggestWeights,
  scoreRowFromIndexOnly,
  scoreRowWithDetailFetch,
  backtest,
  toReportDto,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
