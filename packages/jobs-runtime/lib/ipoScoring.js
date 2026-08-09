'use strict';

/**
 * ipoScoring.js — the single source of truth for the deterministic IPO
 * Subscription Quality Score.
 *
 * Extracted from ipoSubscriptionScanner.js (2026-08-09) so ipoBacktest.js can
 * score historical IPOs with the EXACT same formula the daily scanner uses —
 * per skills/_shared/conventions.md §17 ("never think or write the same
 * thing twice"), a scoring formula must not be redefined per caller; both the
 * daily ranker and the backtest import from here.
 *
 * Weights + full rationale/citations:
 * skills/equity-research/ipo-subscription-ranker/references/ipo_ranking_framework.md
 * — summary: QIB is the highest-conviction, least sentiment-driven signal
 * (institutional due diligence, not GMP chatter) so it carries the largest
 * weight; HNI (sHNI/bHNI, leverage-funded and more speculative) and RII
 * (retail, most sentiment-driven) are weighted lower; Total Subscription is
 * kept as a smaller cross-check term; anchor participation is a small bonus
 * (pre-IPO institutional conviction signal). Every input is log-scaled
 * (log10(1+x)) before weighting so a 100x QIB print doesn't let one category
 * swamp the score the way a raw multiple would.
 *
 * If `ipoBacktest.js` findings justify re-weighting, change it HERE ONLY —
 * both the live scanner and any re-run backtest immediately pick it up.
 */

const SCORE_WEIGHTS = {
  qibX: 0.4,
  bHniX: 0.14,
  sHniX: 0.11,
  riiX: 0.2,
  totalSubscriptionX: 0.15,
};

// Two additional, empirically-derived weight sets — see
// packages/jobs-runtime/ipoWeightFinder.js and
// data/reports/rpt_ipo-weight-finder_global_2026-08-09_90d71542.json for the
// full-database run these came from, and
// skills/equity-research/ipo-subscription-ranker/references/ipo_ranking_framework.md
// ("Dual-score system") + references/ipo_data_sources.md ("NSE+Platform
// weight-finding") for the write-up. `suggestWeights()`'s correlation-
// proportional method, NOT a real regression — see that function's own
// docstring for the multivariate caveat. Both are a first empirical pass;
// re-run ipoWeightFinder.js as the caches grow and revise here.
//
// IMPORTANT — data provenance differs from what computes today's actual
// score: these WEIGHTS are informed by a merged IPOPlatform + NSE + BSE
// historical sample (n=837, of which only 137 are IPOPlatform-native; 454
// are NSE-derived (self-computed or NSE-bid/IPOPlatform-offered), and 246
// are BSE-derived — see ipoWeightFinder.js's header for exactly how each
// provenance works) — going back to 2010 (BSE's earliest real bid-detail
// coverage), not just IPOPlatform's ~2025-09-24 cutoff. But the DATA that
// computes a live IPO's actual score (ipoSubscriptionScanner.js) still comes
// from IPOPlatform alone — NSE/BSE are never used for that (see
// ipo_data_sources.md's source-per-use-case decision). Also per explicit
// instruction, the Market Maker quota is NOT subtracted out of the
// NSE-derived training records here (immaterial to a directional correlation
// goal, unlike the primary-use-case accuracy goal); BSE records ARE
// corrected for the bNII-offered discrepancy (see bseIpoHistoryFetcher.js).
//
// LISTING basis: optimized against listingGainPct (n=837). Every category
// still correlates positively (r 0.21-0.38), similar in shape to the n=591
// NSE-only run but with tighter, more stable estimates now that BSE adds an
// independent third source. Suggested weights remain more balanced than the
// original hand-set SCORE_WEIGHTS (which over-weighted QIB relative to what
// the data supports).
const SCORE_WEIGHTS_LISTING = {
  qibX: 0.233,
  bHniX: 0.229,
  sHniX: 0.236,
  riiX: 0.129,
  totalSubscriptionX: 0.173,
};

// CAGR basis: optimized against currentPerformanceDailyCagrPct (n=826).
// Signal decays substantially over the holding period (r 0.12-0.21, vs
// 0.21-0.38 for listing gain) — expect the CAGR score to be noisier and less
// discriminating than the listing score in general. All 5 categories land
// within a narrower band (0.16-0.29) than the listing basis, i.e. no one
// category dominates longer-run prediction the way QIB dominates the
// original hand-set weights.
const SCORE_WEIGHTS_CAGR = {
  qibX: 0.285,
  bHniX: 0.183,
  sHniX: 0.176,
  riiX: 0.164,
  totalSubscriptionX: 0.191,
};

const ANCHOR_BONUS = 0.05;

// Issue-size / market-cap findings: direct correlation of issueSizeCr/
// marketCapCr with either outcome is near-zero at every sample size tried
// (n=137: r 0.009-0.069; n=591 NSE+IPOPlatform: r 0.001-0.034; n=837
// NSE+IPOPlatform+BSE: r 0.001-0.101) and collinearity with qibX stays weak
// too — consistently NOT useful as a weighted scoring input, so neither is
// folded into either weight set above.
//
// CORRECTION (2026-08-09): an earlier n=137 split-sample check found the
// CAGR score predicting large issues (median ~₹631cr) far better than small
// ones (r=0.426 vs r=0.119), and `CAGR_CONFIDENCE_ISSUE_SIZE_FLOOR_CR` was
// added as a "low confidence" flag on that basis. Re-running the SAME
// split-sample check on the merged n=591 NSE+IPOPlatform sample REVERSED the
// direction (small r=0.209 vs large r=0.125). A third re-run on the n=837
// NSE+IPOPlatform+BSE sample (see
// data/reports/rpt_ipo-weight-finder_global_2026-08-09_90d71542.json) showed
// YET ANOTHER pattern: for listing gain, large issues now correlate far
// stronger (r=0.595 vs r=0.194, closer to the original n=137 direction), but
// for daily CAGR the two stayed close (small r=0.186, large r=0.148, a much
// milder version of the n=591 reversal). Three re-runs, three different
// pictures — this confirms the size-split finding is simply unstable across
// sample composition/regime and not a reliable, reproducible effect at any
// sample size tried so far. The confidence flag below is kept for API
// compatibility (callers already read `cagrConfidence`) but stays
// deliberately NEUTRALIZED (always 'NORMAL') — see
// skills/equity-research/ipo-subscription-ranker/references/ipo_data_sources.md
// for the full methodological lesson (don't trust a split-sample finding
// from a single, possibly-regime-specific window without a replication
// check on a larger/differently-composed sample; and don't stop after one
// replication if it's cheap to run a third).
const CAGR_CONFIDENCE_ISSUE_SIZE_FLOOR_CR = 50;

function log10p1(x) {
  return x == null ? 0 : Math.log10(1 + Math.max(0, x));
}

/**
 * @param {Object} rec - must carry a subset of `weights`' keys
 *   (qibX, bHniX, sHniX, riiX, totalSubscriptionX) plus optional
 *   `anchorParticipated` (boolean).
 * @param {Object} [weights] - defaults to the legacy SCORE_WEIGHTS.
 * @returns {number} score, rounded to 3 decimals.
 */
function computeSubscriptionScore(rec, weights = SCORE_WEIGHTS) {
  let score = 0;
  let weightSeen = 0;
  for (const [field, weight] of Object.entries(weights)) {
    const v = rec[field];
    if (v == null) continue;
    score += log10p1(v) * weight;
    weightSeen += weight;
  }
  if (rec.anchorParticipated) score += ANCHOR_BONUS;
  // Normalize by weight actually observed so a partially-reported IPO (e.g. no
  // Employee/Shareholder quota) isn't penalized relative to one with every field.
  const normalized = weightSeen > 0 ? score / weightSeen : 0;
  return Math.round(normalized * 1000) / 1000;
}

function tierFor(score) {
  if (score >= 0.9) return 'STRONG';
  if (score >= 0.55) return 'MODERATE';
  if (score >= 0.3) return 'WEAK';
  return 'POOR';
}

/**
 * Computes BOTH scores for an IPO — one predicting listing-day pop, one
 * predicting longer-run daily-CAGR performance — per the 2026-08-09 ask to
 * rank/report on two scores instead of one.
 *
 * `cagrConfidence` is currently always 'NORMAL' — the size-based 'LOW' flag
 * this field originally carried did not replicate on a larger sample (see
 * `CAGR_CONFIDENCE_ISSUE_SIZE_FLOOR_CR`'s comment above) and has been
 * neutralized rather than removed, so callers reading this field don't
 * silently break; it may be reinstated if a reproducible confound is found.
 *
 * @returns {{listingScore:number, listingTier:string, cagrScore:number,
 *   cagrTier:string, cagrConfidence:'NORMAL'}}
 */
function computeDualScores(rec) {
  const listingScore = computeSubscriptionScore(rec, SCORE_WEIGHTS_LISTING);
  const cagrScore = computeSubscriptionScore(rec, SCORE_WEIGHTS_CAGR);
  return {
    listingScore,
    listingTier: tierFor(listingScore),
    cagrScore,
    cagrTier: tierFor(cagrScore),
    cagrConfidence: 'NORMAL',
  };
}

module.exports = {
  SCORE_WEIGHTS,
  SCORE_WEIGHTS_LISTING,
  SCORE_WEIGHTS_CAGR,
  CAGR_CONFIDENCE_ISSUE_SIZE_FLOOR_CR,
  ANCHOR_BONUS,
  log10p1,
  computeSubscriptionScore,
  computeDualScores,
  tierFor,
};
