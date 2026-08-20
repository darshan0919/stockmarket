#!/usr/bin/env node
'use strict';

/**
 * ipoWeightFinder.js — runs the data-driven weight-suggestion algorithm
 * (`suggestWeights()` from ipoBacktest.js) against the ENTIRE cached IPO
 * dataset (`data/cache/ipo-history.json`, built by ipoHistoryCache.js) in
 * one pass — no network calls, no date-window chunking — restricted to
 * records that have BOTH performance data (offer/listing/cmp) AND granular
 * subscription data (QIB/HNI/RII breakdown) available.
 *
 * Produces TWO separate weight sets, per the explicit ask (2026-08-09):
 *   1. weightsForListingGain — optimized to predict `listingGainPct`
 *      (the score's original, well-validated target).
 *   2. weightsForDailyCagr — optimized to predict
 *      `currentPerformanceDailyCagrPct` (the compounding-robust longer-run
 *      metric — see ipoBacktest.js header for why daily/weekly CAGR
 *      supersedes raw/annualized current performance).
 *
 * Also evaluates whether issueSizeCr / marketCapCr should be added as
 * additional scoring inputs to filter noise from the QIB/HNI/RII signal:
 *   - direct Pearson r of each against both outcome metrics
 *   - collinearity check against qibX (does a big issue mechanically inflate
 *     QIB multiples, i.e. is issue size actually a hidden confound already
 *     baked into the category signal?)
 *   - split-sample check: does the score->outcome correlation strengthen
 *     within a size bucket (i.e. does issue size explain away some of what
 *     currently looks like noise)?
 * This is Extraction only (skills/_shared/conventions.md §17) — it computes
 * and reports; a human/LLM decides what to do with the findings.
 *
 * NSE FALLBACK (added 2026-08-09, per explicit instruction — see
 * skills/equity-research/ipo-subscription-ranker/references/ipo_data_sources.md
 * for the full investigation this decision came out of): IPOPlatform's
 * granular per-IPO detail only exists for IPOs listing on/after
 * ~2025-09-24, capping the eligible sample at ~137. For WEIGHT-FINDING
 * specifically (never for the primary ranker/drhp-ipo-analysis use cases,
 * which stay on IPOPlatform only), any record IPOPlatform doesn't have
 * granular data for is filled in from `data/cache/nse-ipo-history.json`
 * (built by nseIpoHistoryFetcher.js, back to 2012) instead:
 *   - Mainboard/BE-series IPOs: NSE's own bidDetails already includes a
 *     usable offered-shares denominator, so `nseIpoHistoryFetcher.js`
 *     self-computed the multiple already — used as-is.
 *   - SME-series IPOs: NSE leaves the offered-shares field blank, but the
 *     raw APPLIED/bid share counts are still present. Denominators come
 *     from IPOPlatform's index-API row instead (`sharesOfferedRaw`, a set
 *     of clean structured numeric fields — `qib_shares_offered` etc. —
 *     already being fetched for every IPO regardless, zero extra cost).
 *   - Per explicit instruction, the Market Maker quota is NOT subtracted
 *     out of the bid numerator here (that correction matters for the
 *     primary/report use case's absolute accuracy, not for weight-finding's
 *     directional correlation goal — MM's bid share is typically <1% of a
 *     category's total bid volume, e.g. ~0.15% for ANAWIL's NII category).
 * BSE FALLBACK (added 2026-08-09, after the NSE fallback above): ~650 IPOs
 * in our universe are BSE-only (no NSE listing, mostly BSE SME) and had
 * zero granular coverage even after the NSE merge. `bseIpoHistoryFetcher.js`
 * built `data/cache/bse-ipo-history.json` from BSE's own two bid-detail
 * APIs (merged — see that file's header for the full endpoint/parsing
 * story, including the discovery that BSE's REAL historical archive lives
 * on a different endpoint than the one initially tested, and that
 * per-category data must be treated as independently partial rather than
 * all-or-nothing). BSE has no ID that maps to IPOPlatform's index API, so
 * this join happens by normalized company name (+ a loose date-proximity
 * sanity check against listingDate, to avoid false-positive collisions on
 * reused/generic names). Only used to fill records that got NOTHING from
 * IPOPlatform or NSE — BSE is the third and lowest-priority fallback.
 *
 * A record can therefore be one of four provenances, tracked in
 * `subscriptionSource`: 'ipoplatform' (post-cutover, most precise),
 * 'nse-selfcomputed' (mainboard/BE, NSE's own offered field),
 * 'nse-x-platform-offered' (SME, NSE bid ÷ IPOPlatform offered),
 * 'bse' (BSE's own bid-detail, merged across its 2 endpoints).
 *
 * Usage: node ipoWeightFinder.js [--dry-run]
 */

const fs = require('fs');
const dbV2 = require('./lib/db');
const { pearson, mean, suggestWeights } = require('./ipoBacktest');
const { computeSubscriptionScore, tierFor, SCORE_WEIGHTS } = require('./lib/ipoScoring');

const CREATOR = 'ipo-weight-finder';

function round4(x) {
  return x == null ? null : Math.round(x * 10000) / 10000;
}

/** SME fallback: NSE applied-share bid counts ÷ IPOPlatform's structured offered-share fields. */
function nseFallbackFromRaw(nseRec, sharesOfferedRaw) {
  if (!nseRec || !nseRec.parsed || !nseRec.parsed.raw || !sharesOfferedRaw) return null;
  const raw = nseRec.parsed.raw;
  const div = (bidObj, offered) =>
    bidObj && bidObj.bid != null && offered ? round4(bidObj.bid / offered) : null;
  const qibX = div(raw.qib, sharesOfferedRaw.qibExAnchor);
  const niiX = div(raw.nii, sharesOfferedRaw.nii);
  const bHniX = div(raw.bnii, sharesOfferedRaw.bNii);
  const sHniX = div(raw.snii, sharesOfferedRaw.sNii);
  const riiX = div(raw.retail, sharesOfferedRaw.retail);
  const totalOffered =
    sharesOfferedRaw.qibExAnchor != null &&
    sharesOfferedRaw.nii != null &&
    sharesOfferedRaw.retail != null
      ? sharesOfferedRaw.qibExAnchor + sharesOfferedRaw.nii + sharesOfferedRaw.retail
      : null;
  const totalSubscriptionX = div(raw.total, totalOffered);
  if (qibX == null && totalSubscriptionX == null) return null;
  return { qibX, niiX, bHniX, sHniX, riiX, totalSubscriptionX };
}

/** Loose normalization for name-based joining (BSE has no shared ID with IPOPlatform). */
function normCompanyName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\blimited\b|\bltd\b/g, '')
    .replace(/[.,\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(iso1, iso2) {
  if (!iso1 || !iso2) return null;
  const d1 = new Date(iso1).getTime();
  const d2 = new Date(iso2).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  return Math.abs(d1 - d2) / 86400000;
}

/** Builds a name -> [bse records] index (list, since names aren't guaranteed unique across years). */
function buildBseNameIndex(bseCache) {
  const idx = new Map();
  for (const r of Object.values((bseCache && bseCache.byIpoNo) || {})) {
    if (!r.hasData || !r.parsed) continue;
    const key = normCompanyName(r.companyName);
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(r);
  }
  return idx;
}

/** Finds the best BSE match for a company by name, disambiguating same-name reissues via listing-date proximity (<=45 days). */
function findBseMatch(bseNameIndex, companyName, listingDate) {
  const candidates = bseNameIndex.get(normCompanyName(companyName));
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  // Multiple BSE records share this normalized name — pick the closest by date.
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = daysBetween(c.startDate, listingDate);
    if (dist != null && dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  // Reject matches more than 45 days from the bid window — a same-name
  // collision across different years is more likely than a real match at
  // that distance.
  return best && bestDist <= 45 ? best : null;
}

function loadFlatRecords() {
  const cache = JSON.parse(fs.readFileSync(dbV2.cachePath('ipo-history.json'), 'utf8'));
  let nseCache = { bySymbol: {} };
  try {
    nseCache = JSON.parse(fs.readFileSync(dbV2.cachePath('nse-ipo-history.json'), 'utf8'));
  } catch {
    // NSE cache not built yet — fine, just IPOPlatform-only records.
  }
  let bseNameIndex = new Map();
  try {
    const bseCache = JSON.parse(fs.readFileSync(dbV2.cachePath('bse-ipo-history.json'), 'utf8'));
    bseNameIndex = buildBseNameIndex(bseCache);
  } catch {
    // BSE cache not built yet — fine, falls through to no BSE fallback.
  }

  const out = [];
  for (const rec of Object.values(cache.byIpoPlatformId)) {
    const d = rec.detail || {};
    let subscriptionSource = null;
    let granular = null;

    if (d.qibX != null) {
      subscriptionSource = 'ipoplatform';
      granular = {
        qibX: d.qibX,
        sHniX: d.sHniX,
        bHniX: d.bHniX,
        niiX: d.niiX,
        riiX: d.riiX,
        totalSubscriptionX: d.totalSubscriptionX,
      };
    } else if (rec.companyId && rec.companyId.startsWith('NSE:')) {
      const symbol = rec.companyId.slice(4);
      const nseRec = nseCache.bySymbol[symbol];
      if (nseRec && nseRec.parsed && nseRec.parsed.qibX != null) {
        subscriptionSource = 'nse-selfcomputed';
        granular = {
          qibX: nseRec.parsed.qibX,
          sHniX: nseRec.parsed.sHniX,
          bHniX: nseRec.parsed.bHniX,
          niiX: nseRec.parsed.niiX,
          riiX: nseRec.parsed.riiX,
          totalSubscriptionX: nseRec.parsed.totalSubscriptionX,
        };
      } else {
        const fallback = nseFallbackFromRaw(nseRec, rec.sharesOfferedRaw);
        if (fallback) {
          subscriptionSource = 'nse-x-platform-offered';
          granular = fallback;
        }
      }
    }

    // BSE fallback — lowest priority, only when neither IPOPlatform nor NSE
    // gave us anything. Per 2026-08-09 instruction: accept partial category
    // data (e.g. qibX known but bHniX null is fine) rather than requiring
    // every category — computeSubscriptionScore() already tolerates nulls.
    if (!granular) {
      const bseRec = findBseMatch(bseNameIndex, rec.companyName, rec.listingDate);
      if (bseRec && bseRec.parsed) {
        const p = bseRec.parsed;
        const hasAny = [p.qibX, p.sHniX, p.bHniX, p.niiX, p.riiX, p.totalSubscriptionX].some(
          (v) => v != null
        );
        if (hasAny) {
          subscriptionSource = 'bse';
          granular = {
            qibX: p.qibX,
            sHniX: p.sHniX,
            bHniX: p.bHniX,
            niiX: p.niiX,
            riiX: p.riiX,
            totalSubscriptionX: p.totalSubscriptionX,
          };
        }
      }
    }

    const flat = {
      ipoPlatformId: rec.ipoPlatformId,
      companyName: rec.companyName,
      listingDate: rec.listingDate,
      ipoType: rec.ipoType,
      issueSizeCr: rec.issueSizeCr,
      marketCapCr: rec.marketCapCr,
      offerPrice: rec.offerPrice,
      listingPrice: rec.listingPrice,
      cmp: rec.cmp,
      listingGainPct: rec.listingGainPct,
      currentPerformancePct: rec.currentPerformancePct,
      currentPerformanceDailyCagrPct: rec.currentPerformanceDailyCagrPct,
      currentPerformanceWeeklyCagrPct: rec.currentPerformanceWeeklyCagrPct,
      subscriptionSource,
      qibX: granular ? (granular.qibX ?? null) : null,
      sHniX: granular ? (granular.sHniX ?? null) : null,
      bHniX: granular ? (granular.bHniX ?? null) : null,
      niiX: granular ? (granular.niiX ?? null) : null,
      riiX: granular ? (granular.riiX ?? null) : null,
      totalSubscriptionX: granular ? (granular.totalSubscriptionX ?? null) : null,
      anchorParticipated: !!d.anchorParticipated,
    };
    const hasAnyGranular = [
      flat.qibX,
      flat.sHniX,
      flat.bHniX,
      flat.niiX,
      flat.riiX,
      flat.totalSubscriptionX,
    ].some((v) => v != null);
    flat.subscriptionQualityScore = hasAnyGranular ? computeSubscriptionScore(flat) : null;
    flat.subscriptionQualityTier =
      flat.subscriptionQualityScore != null ? tierFor(flat.subscriptionQualityScore) : null;
    out.push(flat);
  }
  return out;
}

function pearsonReport(records, xField, yField) {
  const pairs = records.filter((r) => r[xField] != null && r[yField] != null);
  return {
    n: pairs.length,
    pearsonR: pearson(
      pairs.map((r) => r[xField]),
      pairs.map((r) => r[yField])
    ),
  };
}

function sizeMarketCapAnalysis(eligible) {
  const withSize = eligible.filter((r) => r.issueSizeCr != null);
  const withMcap = eligible.filter((r) => r.marketCapCr != null);

  const direct = {
    issueSizeVsListingGain: pearsonReport(withSize, 'issueSizeCr', 'listingGainPct'),
    issueSizeVsDailyCagr: pearsonReport(withSize, 'issueSizeCr', 'currentPerformanceDailyCagrPct'),
    marketCapVsListingGain: pearsonReport(withMcap, 'marketCapCr', 'listingGainPct'),
    marketCapVsDailyCagr: pearsonReport(withMcap, 'marketCapCr', 'currentPerformanceDailyCagrPct'),
  };
  const collinearity = {
    issueSizeVsQibX: pearsonReport(withSize, 'issueSizeCr', 'qibX'),
    issueSizeVsTotalSubscriptionX: pearsonReport(withSize, 'issueSizeCr', 'totalSubscriptionX'),
    marketCapVsQibX: pearsonReport(withMcap, 'marketCapCr', 'qibX'),
  };

  // Split-sample: does score->outcome correlation strengthen within a size
  // bucket? Median-split on issueSizeCr (small vs large issues).
  const sizeSorted = withSize.slice().sort((a, b) => a.issueSizeCr - b.issueSizeCr);
  const mid = Math.floor(sizeSorted.length / 2);
  const smallIssues = sizeSorted.slice(0, mid);
  const largeIssues = sizeSorted.slice(mid);
  const splitSample = {
    smallIssues: {
      n: smallIssues.length,
      medianIssueSizeCr: smallIssues.length
        ? smallIssues[Math.floor(smallIssues.length / 2)].issueSizeCr
        : null,
      scoreVsListingGain: pearsonReport(smallIssues, 'subscriptionQualityScore', 'listingGainPct'),
      scoreVsDailyCagr: pearsonReport(
        smallIssues,
        'subscriptionQualityScore',
        'currentPerformanceDailyCagrPct'
      ),
    },
    largeIssues: {
      n: largeIssues.length,
      medianIssueSizeCr: largeIssues.length
        ? largeIssues[Math.floor(largeIssues.length / 2)].issueSizeCr
        : null,
      scoreVsListingGain: pearsonReport(largeIssues, 'subscriptionQualityScore', 'listingGainPct'),
      scoreVsDailyCagr: pearsonReport(
        largeIssues,
        'subscriptionQualityScore',
        'currentPerformanceDailyCagrPct'
      ),
    },
  };

  return { direct, collinearity, splitSample };
}

function sourceBreakdown(records) {
  const out = {};
  for (const r of records) {
    const key = r.subscriptionSource || 'none';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function run() {
  const all = loadFlatRecords();
  // Eligible = has BOTH performance AND at least SOME granular subscription
  // data, from whichever source (ipoplatform / nse-selfcomputed /
  // nse-x-platform-offered / bse — see loadFlatRecords()'s header for what
  // each means). Not requiring qibX specifically: BSE partial records may
  // have e.g. totalSubscriptionX/riiX but not qibX — suggestWeights() and
  // computeSubscriptionScore() already null-filter per field/category, so
  // there's no reason to drop a record just because ONE category is missing
  // (per 2026-08-09 instruction: accept partial per-category data).
  const eligible = all.filter(
    (r) =>
      r.listingGainPct != null &&
      [r.qibX, r.sHniX, r.bHniX, r.niiX, r.riiX, r.totalSubscriptionX].some((v) => v != null)
  );

  const weightsForListingGain = suggestWeights(eligible, 'listingGainPct');
  // Daily-CAGR needs a minimum hold (dailyCagrPct floors at 3 days) — use the
  // same eligible set, it already only contains records with a real cmp.
  const dailyEligible = eligible.filter((r) => r.currentPerformanceDailyCagrPct != null);
  const weightsForDailyCagr = suggestWeights(dailyEligible, 'currentPerformanceDailyCagrPct');

  const sizeAnalysis = sizeMarketCapAnalysis(eligible);

  const result = {
    id: dbV2.makeId(
      'rpt',
      CREATOR,
      'global',
      new Date().toISOString().slice(0, 10),
      'full-database'
    ),
    type: 'ipo-weight-optimization',
    creator: CREATOR,
    date: new Date().toISOString().slice(0, 10),
    summary: `Full-database (${eligible.length} eligible IPOs, sources: ${JSON.stringify(sourceBreakdown(eligible))}) weight-finding: listing-gain-basis and daily-CAGR-basis suggested weights, plus issueSize/marketCap noise-filter evaluation.`,
    universeSize: all.length,
    eligibleCount: eligible.length,
    eligibleBySource: sourceBreakdown(eligible),
    dailyEligibleCount: dailyEligible.length,
    currentWeights: SCORE_WEIGHTS,
    weightsForListingGain,
    weightsForDailyCagr,
    sizeMarketCapAnalysis: sizeAnalysis,
  };
  return result;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun) {
    dbV2.saveReport(result);
    console.log('Saved:', result.id, dbV2.touchedFiles());
  }
}

module.exports = { run, loadFlatRecords, sizeMarketCapAnalysis };

if (require.main === module) {
  main();
}
