'use strict';

/**
 * fuzzyMatch.js — dependency-free name-similarity matcher.
 *
 * Why not an npm package: the repo has no fuzzy-match dependency anywhere
 * (checked 2026-08-10) and the matching need here is narrow (comparing two
 * short investor/entity name strings, not full-text search), so a small
 * Jaro-Winkler implementation avoids adding a new dependency for one script
 * — same rationale as ipoSubscriptionScanner.js's regex HTML parsing.
 *
 * Used by anchorBulkDealTracker.js to match an IPO's anchor-investor names
 * (from IPOPlatform) against NSE/BSE bulk-deal `clientName` strings, which
 * are never byte-identical in practice: different abbreviations ("A/C",
 * "Ltd" vs "Limited"), fund sub-entity suffixes ("- Scheme A"), punctuation,
 * and word order.
 */

// Entity-suffix / noise tokens stripped before comparison — deliberately
// broader than companyMaster.js's SUFFIX_RE because investor names carry
// fund/AIF/trust vocabulary company names don't (Fund, AIF, Trust, Scheme,
// Category, Cell, PCC).
const NOISE_RE =
  /\b(LIMITED|LTD|PVT|PRIVATE|INDIA|CO|COMPANY|CORP|CORPORATION|INC|LLC|LLP|FUND|AIF|TRUST|SCHEME|CATEGORY|CELL|PCC|PLC|A\/C|ACCOUNT|CLIENT)\b\.?/gi;

/**
 * Normalize an investor/entity name for comparison: uppercase, strip legal
 * suffixes and punctuation, collapse whitespace. NOT the same normalization
 * as companyMaster.js's normalizeName() (different noise-word list, this
 * module's own concern) — kept separate deliberately rather than importing
 * and silently diverging from it if either list changes independently.
 * @param {string} name
 * @returns {string}
 */
function normalizeInvestorName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(NOISE_RE, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaro similarity (0-1) between two strings.
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  return (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3;
}

/**
 * Jaro-Winkler similarity (0-1) — Jaro with a bonus for a shared prefix
 * (up to 4 chars), which matters here because truncated/abbreviated fund
 * names ("HDFC Mut..." vs "HDFC Mutual Fund - Scheme 1") tend to share a
 * long common prefix.
 * @param {string} s1
 * @param {string} s2
 * @param {number} [prefixScale=0.1]
 * @returns {number}
 */
function jaroWinkler(s1, s2, prefixScale = 0.1) {
  const jaroSim = jaro(s1, s2);
  let prefixLen = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  while (prefixLen < maxPrefix && s1[prefixLen] === s2[prefixLen]) prefixLen++;
  return jaroSim + prefixLen * prefixScale * (1 - jaroSim);
}

/**
 * Token-set-aware similarity: normalizes both names, then takes the max of
 * (a) whole-string Jaro-Winkler and (b) best-token-overlap ratio. Guards
 * against cases like "SBI" vs "SBI Mutual Fund" where whole-string
 * Jaro-Winkler alone under-scores a true match because of length disparity.
 * @param {string} nameA
 * @param {string} nameB
 * @returns {number} 0-1
 */
function nameSimilarity(nameA, nameB) {
  const a = normalizeInvestorName(nameA);
  const b = normalizeInvestorName(nameB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const whole = jaroWinkler(a, b);

  const tokensA = new Set(a.split(' ').filter((t) => t.length > 1));
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 1));
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  const smallerSize = Math.min(tokensA.size, tokensB.size) || 1;
  const tokenOverlap = shared / smallerSize;

  // One name fully contained in the other (common for truncated fund names).
  const containment = a.includes(b) || b.includes(a) ? 0.95 : 0;

  return Math.max(whole, tokenOverlap, containment);
}

/**
 * Find the best match for `query` among `candidates` (array of strings),
 * returning null if nothing clears `threshold`.
 * @param {string} query
 * @param {string[]} candidates
 * @param {number} [threshold=0.85]
 * @returns {{candidate: string, index: number, score: number}|null}
 */
function bestMatch(query, candidates, threshold = 0.85) {
  let best = null;
  candidates.forEach((c, i) => {
    const score = nameSimilarity(query, c);
    if (score >= threshold && (!best || score > best.score)) {
      best = { candidate: c, index: i, score: Math.round(score * 1000) / 1000 };
    }
  });
  return best;
}

module.exports = {
  normalizeInvestorName,
  jaro,
  jaroWinkler,
  nameSimilarity,
  bestMatch,
};
