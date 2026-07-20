'use strict';

/**
 * orderBookPatterns.js — pattern library for deterministic order-book value
 * extraction from Stockscans' AI-synthesized concall notes (`finalReport`
 * markdown). Mined from a 30-company, multi-sector sample (2026-07-19) —
 * see docs/ORDER_BOOK_EXTRACTION.md for the mining methodology and raw
 * findings. This file is the ONE place the extractor's vocabulary lives,
 * so the LLM-fallback learning loop (scripts/orderbook/extractOrderBook.js)
 * only ever needs to append to `TOTAL_QUALIFIERS` / `SEGMENT_KEYWORDS` here.
 *
 * Design: Stockscans' notes format every quantitative claim as a Markdown
 * bullet: `*   {{bid:N}}**<Label>:** <bold value(s)> [refs]`. We never touch
 * the raw source PDF — the concall-notes API has already done that synthesis
 * for us. Extraction is just: find bullets whose label contains "Order Book",
 * decide whether the label denotes the COMPANY-WIDE total vs. a SEGMENT/
 * qualitative sub-metric, then parse the first ₹/Cr/Lakh/Mn number out of
 * the bolded value.
 */

// Words that may precede "Order Book" and still mean "the whole company's
// order book" (as opposed to a segment, JV, product line, or non-numeric
// qualitative bullet). Case-insensitive, matched as a prefix of the label
// after stripping the label down to its core words.
const TOTAL_QUALIFIERS = [
  '', // bare "Order Book"
  'total',
  'outstanding',
  'consolidated',
  'standalone', // only used as the total when no consolidated figure exists — caller's job to prefer consolidated
  'current',
  'closing',
  'unexecuted',
  'net',
  'group', 'group-wide', 'group wide',
  'overall',
];

// Label substrings that mark a bullet as a SEGMENT / sub-metric / non-total
// figure, even if it contains one of the words above elsewhere. These win
// over TOTAL_QUALIFIERS if both match (e.g. "Standalone Smart Meter Order
// Book" is a segment, not the company total).
const SEGMENT_KEYWORDS = [
  'mix', 'structure', 'coverage', 'maturity', 'momentum', 'conversion',
  'readiness', 'velocity', 'replenishment', 'softness', 'visibility',
  'guidance', 'target', 'booking', // process/qualitative words, not a value label
  'jv', 'joint venture',
  // vertical/segment qualifiers seen in the mined sample — extend this list
  // whenever the LLM fallback resolves a new one (see learnSegmentKeyword()).
  'water', 'nuclear', 'defense', 'defence', 'aerospace', 'ev ', 'export',
  'domestic', 'smart meter', 'jal jeevan', 'jjm', 'machine building',
  'warship', 'non-defense', 'non defense', 'arc ', 'tbwes', 'healthcare',
  'power t&d', 'international', 'wagon', 'o&m', '(ads)', 'ads)',
  'warship',
];

// Matches the first ₹/Cr/Lakh/Mn/Bn figure inside a bolded markdown value,
// e.g. "**₹13,447 Cr**", "**>₹22,000 Cr**", "**~₹5,000 Cr**", "**₹798 Cr**".
// Deliberately requires a currency unit (Cr/Lakh/Mn/Bn) so percentages,
// counts ("39 platforms"), and durations ("1 year") never false-positive.
const VALUE_RE = /\*\*\s*[₹Rr>~≈]*\s*([\d][\d,]*\.?\d*)\s*(Cr\.?|Crore|Crores|Lakh|Lakhs|Lac|Lacs|Mn|Million|Bn|Billion)\b/i;

// Matches one "key figure" bullet line of Stockscans' notes format.
// Group 1 = label text, Group 2 = everything after the colon (value + refs).
const BULLET_RE = /\*\*([^*]{1,80}?):\*\*\s*(.*)$/;

const UNIT_TO_CR = {
  cr: 1, 'cr.': 1, crore: 1, crores: 1,
  lakh: 0.01, lakhs: 0.01, lac: 0.01, lacs: 0.01,
  mn: 0.1, million: 0.1,
  bn: 1000, billion: 1000,
};

function normalizeLabel(label) {
  return String(label || '').trim().toLowerCase();
}

/** True if `label` denotes the whole-company order book (not a segment/qualitative metric). */
function isTotalLabel(label) {
  const norm = normalizeLabel(label);
  if (!/order.?book|backlog/.test(norm)) return false;
  // Segment keywords are checked on the FULL label (parenthetical qualifiers like
  // "(Power T&D)" are real segment markers, not noise — must not be stripped first).
  if (SEGMENT_KEYWORDS.some((kw) => norm.includes(kw))) return false;
  // Strip parens only now, for qualifier-head matching (e.g. "Closing Order Book (FY26)").
  const dropParens = norm.replace(/\([^)]*\)/g, '').trim();
  let head = dropParens.replace(/\b(order\s*)?backlog\b/, '').replace(/\border\s*book\b/, '').trim();
  // Trailing decorations that don't change what's being totaled, e.g.
  // "Order Book + L1" / "Order Book & L1" (L1 = lowest-bidder pipeline, still
  // reported as part of one combined total figure in the source bullet).
  head = head.replace(/^[+&]\s*l1$/, '').trim();
  return TOTAL_QUALIFIERS.includes(head);
}

/** Parse a value+unit out of the bolded text following a label's colon. */
function parseValue(text) {
  const m = VALUE_RE.exec(text || '');
  if (!m) return null;
  const numeric = parseFloat(m[1].replace(/,/g, ''));
  const unitRaw = m[2].toLowerCase();
  const crMultiplier = UNIT_TO_CR[unitRaw];
  if (!Number.isFinite(numeric) || crMultiplier === undefined) return null;
  return { value: numeric, unit: unitRaw, valueCr: Math.round(numeric * crMultiplier * 100) / 100 };
}

/**
 * Append a newly-learned segment keyword (LLM fallback resolved a label the
 * regex misclassified). Only affects the in-process copy — callers that want
 * this persisted must also patch this file (see extractOrderBook.js's
 * `--learn` flag, which does that automatically via a source-text rewrite).
 */
function learnSegmentKeyword(keyword) {
  const k = String(keyword || '').toLowerCase().trim();
  if (k && !SEGMENT_KEYWORDS.includes(k)) SEGMENT_KEYWORDS.push(k);
}

module.exports = {
  TOTAL_QUALIFIERS, SEGMENT_KEYWORDS, VALUE_RE, BULLET_RE, UNIT_TO_CR,
  normalizeLabel, isTotalLabel, parseValue, learnSegmentKeyword,
};
