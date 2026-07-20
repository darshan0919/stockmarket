'use strict';

/**
 * orderBookExtractor.js — deterministic (no-LLM) order book VALUE + UNIT
 * extraction from a Stockscans concall-notes `finalReport` markdown string.
 *
 * Scope: value + unit only (no execution timelines — out of scope per the
 * 2026-07-19 design conversation). Two-tier design:
 *   1. This module: regex/pattern extraction. Cheap, deterministic, free.
 *   2. scripts/orderbook/extractOrderBook.js: CLI wrapper — calls this first;
 *      if it throws OrderBookNotFoundError or OrderBookAmbiguousError, the
 *      caller (a skill) falls back to a token-efficient LLM prompt built
 *      from `error.candidates` / `error.orderBookLines`, then is expected to
 *      call `recordLearnedPattern()` so the next run doesn't need the LLM.
 */

const { BULLET_RE, isTotalLabel, parseValue, normalizeLabel } = require('./orderBookPatterns');

class OrderBookNotFoundError extends Error {
  constructor(message, { orderBookLines = [] } = {}) {
    super(message);
    this.name = 'OrderBookNotFoundError';
    this.orderBookLines = orderBookLines; // raw lines for LLM fallback, kept short
  }
}

class OrderBookAmbiguousError extends Error {
  constructor(message, { candidates = [] } = {}) {
    super(message);
    this.name = 'OrderBookAmbiguousError';
    this.candidates = candidates;
  }
}

/** Pull every "Order Book"/"Backlog" bullet out of the notes, classified + parsed. */
function findCandidates(finalReport) {
  const lines = String(finalReport || '').split('\n');
  const candidates = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!/order.?book|backlog/i.test(line)) continue;
    const m = BULLET_RE.exec(line);
    if (!m) continue;
    const [, label, rest] = m;
    if (!/order.?book|backlog/i.test(label)) continue; // metric must be labeled as order book, not just mention it in prose
    const parsed = parseValue(rest);
    candidates.push({
      label: label.trim(),
      valueText: rest.trim(),
      isTotal: isTotalLabel(label),
      parsed, // {value, unit, valueCr} or null (no Cr/Lakh/Mn number — qualitative/ratio bullet)
      rawLine: line,
    });
  }
  return candidates;
}

const QUALIFIER_PRIORITY = ['', 'total', 'outstanding', 'consolidated', 'net', 'overall', 'group', 'group-wide', 'current', 'closing', 'unexecuted', 'standalone'];

function qualifierRank(label) {
  const norm = normalizeLabel(label).replace(/order.?book.*$|backlog.*$/, '').trim();
  const i = QUALIFIER_PRIORITY.indexOf(norm);
  return i === -1 ? 99 : i;
}

/**
 * Extract the single company-wide outstanding order book value from concall
 * notes markdown. Throws OrderBookNotFoundError (no numeric total bullet at
 * all — either no order-book mention or only qualitative/segment bullets) or
 * OrderBookAmbiguousError (multiple total-labeled bullets disagree by >15%,
 * e.g. "Closing Order Book" actual vs. a guidance figure) rather than
 * guessing — both are designed to carry enough context for a cheap LLM
 * fallback to resolve without re-reading the whole report.
 *
 * @param {string} finalReport
 * @param {Object} [meta] - {companyId, date} for error/result context only
 * @returns {{value, unit, valueCr, label, sourceLine, confidence, allTotalCandidates}}
 */
function extractOrderBook(finalReport, meta = {}) {
  const candidates = findCandidates(finalReport);
  const totals = candidates.filter((c) => c.isTotal && c.parsed);

  if (!totals.length) {
    throw new OrderBookNotFoundError(
      `No company-wide order-book total found for ${meta.companyId || '?'} ${meta.date || ''} — ` +
      `${candidates.length} order-book bullet(s) present but none classified as a total with a parseable Cr/Lakh/Mn value.`,
      { orderBookLines: candidates.map((c) => c.rawLine).slice(0, 15) }
    );
  }

  totals.sort((a, b) => qualifierRank(a.label) - qualifierRank(b.label));
  const best = totals[0];

  if (totals.length > 1) {
    const disagree = totals.some((t) => Math.abs(t.parsed.valueCr - best.parsed.valueCr) / best.parsed.valueCr > 0.15);
    if (disagree) {
      throw new OrderBookAmbiguousError(
        `Multiple order-book totals for ${meta.companyId || '?'} ${meta.date || ''} disagree by >15% — ` +
        `picking automatically risks being wrong (e.g. actual vs. guidance, or standalone vs. consolidated).`,
        { candidates: totals.map((t) => ({ label: t.label, valueCr: t.parsed.valueCr, rawLine: t.rawLine })) }
      );
    }
  }

  return {
    companyId: meta.companyId || null,
    date: meta.date || null,
    value: best.parsed.value,
    unit: best.parsed.unit,
    valueCr: best.parsed.valueCr,
    label: best.label,
    sourceLine: best.rawLine,
    confidence: totals.length === 1 ? 'high' : 'high-averaged',
    allTotalCandidates: totals.map((t) => ({ label: t.label, valueCr: t.parsed.valueCr })),
  };
}

module.exports = { extractOrderBook, findCandidates, OrderBookNotFoundError, OrderBookAmbiguousError };
