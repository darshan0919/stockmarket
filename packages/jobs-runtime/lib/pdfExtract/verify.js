'use strict';

/**
 * Verification ladder for the PDF result-table path (docs/PDF_OCR_EXTRACTION_PLAN.md §3).
 *
 *   L1  grounding   every number a tier reports must occur, as printed, in the page text it read.
 *                   Defends against the silent digit errors / hallucinated values of a VLM or LLM.
 *   L2  identities  arithmetic relations between fields of the same column (below).
 *
 * Both work on the parsed values only and in any unit, because every identity relates fields of one
 * column. The unit itself is NOT verified here; callers treat `unit === 'unknown'` as unserved.
 *
 *   C1  totalIncome  = revenue + otherIncome
 *   C2  pbt          = totalIncome - totalExpenses            (exceptional items can break it: soft)
 *   C3  pat          = pbt - tax                              (associates/minority can break it: soft)
 *
 * verdict:
 *   'verified'     at least two identities hold and no hard identity fails
 *   'consistent'   exactly one identity holds, none hard-fails
 *   'failed'       a hard identity fails, or checks exist and none passes
 *   'unverifiable' no identity has all its operands
 */

const tolOf = (a, b) => Math.max(0.03, 0.006 * Math.max(Math.abs(a), Math.abs(b)));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function verifyIncomeStatement(cur) {
  const c = cur || {};
  const checks = [];
  const add = (id, soft, expected, actual) => {
    const ok = Math.abs(expected - actual) <= tolOf(expected, actual);
    checks.push({ id, soft, ok, expected, actual });
  };
  if (isNum(c.totalIncome) && isNum(c.revenue)) {
    add('C1', false, c.revenue + (isNum(c.otherIncome) ? c.otherIncome : 0), c.totalIncome);
  }
  if (isNum(c.pbt) && isNum(c.totalIncome) && isNum(c.totalExpenses)) {
    add('C2', true, c.totalIncome - c.totalExpenses, c.pbt);
  }
  if (isNum(c.pat) && isNum(c.pbt) && isNum(c.tax)) add('C3', true, c.pbt - c.tax, c.pat);
  const passed = checks.filter((k) => k.ok).length;
  const hardFailed = checks.some((k) => !k.ok && !k.soft);
  let verdict;
  if (!checks.length) verdict = 'unverifiable';
  else if (hardFailed) verdict = 'failed';
  else if (passed >= 2) verdict = 'verified';
  else if (passed === 1) verdict = 'consistent';
  else verdict = 'failed';
  return {
    verdict,
    checks,
    issues: checks
      .filter((k) => !k.ok)
      .map((k) => `${k.id}: expected ${k.expected.toFixed(4)}, got ${k.actual}`),
  };
}

/** Absolute values of every number printed in `text` (commas, parentheses and minus signs stripped). */
function printedNumbers(text) {
  const out = new Set();
  const re = /\(?-?\d[\d,]*(?:\.\d+)?\)?/g;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s)) !== null) {
    const n = Number(m[0].replace(/[(),-]/g, ''));
    if (Number.isFinite(n)) out.add(Math.round(n * 10000) / 10000);
  }
  return out;
}

/**
 * L1: split `values` (as printed, document units) into those that occur in `text` and those that do not.
 * Zero is always grounded (a dash prints as nothing). `values` maps field -> number|null.
 */
function groundValues(values, text) {
  const printed = printedNumbers(text);
  const grounded = {};
  const ungrounded = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (!isNum(v)) continue;
    if (v === 0 || printed.has(Math.round(Math.abs(v) * 10000) / 10000)) grounded[k] = v;
    else ungrounded[k] = v;
  }
  return { grounded, ungrounded };
}

const COMPONENTS = ['employeeCost', 'interest', 'depreciation', 'otherExpenses'];

/**
 * Field-level plausibility after a column passes L2. Headline identities cannot see a slip in one expense line
 * (a note number, a lakh/crore mix-up), so such a value is DROPPED, never served: a missing field beats a wrong one.
 *   - an expense component larger than totalExpenses
 *   - totalExpenses larger than 1.5 x totalIncome (when it also breaks C2)
 */
function sanitizeCurrent(cur) {
  const out = { ...cur };
  const dropped = [];
  const tol = (x) => Math.abs(x) * 0.001 + 0.03;
  if (
    isNum(out.totalExpenses) &&
    isNum(out.totalIncome) &&
    out.totalIncome > 0 &&
    out.totalExpenses > 1.5 * out.totalIncome
  ) {
    dropped.push('totalExpenses');
    delete out.totalExpenses;
  }
  if (isNum(out.totalExpenses)) {
    for (const f of COMPONENTS) {
      if (
        isNum(out[f]) &&
        Math.abs(out[f]) > Math.abs(out.totalExpenses) + tol(out.totalExpenses)
      ) {
        dropped.push(f);
        delete out[f];
      }
    }
  }
  return { cur: out, dropped };
}

module.exports = { sanitizeCurrent, verifyIncomeStatement, printedNumbers, groundValues };
