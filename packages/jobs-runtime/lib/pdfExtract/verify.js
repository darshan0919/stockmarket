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

/**
 * An identity among near-zero values proves nothing (0.01 - 0 = 0.01 holds for any garbage), so it only counts when its operands
 * are not negligible next to the column's scale (its total income or revenue).
 */
function nonVacuous(operands, c) {
  const scaleRef = Math.max(Math.abs(c.totalIncome) || 0, Math.abs(c.revenue) || 0);
  if (!scaleRef) return true;
  return Math.max(...operands.map((x) => Math.abs(x))) >= 0.002 * scaleRef;
}

function verifyIncomeStatement(cur) {
  const c = cur || {};
  const checks = [];
  const add = (id, soft, expected, actual, operands = [expected, actual]) => {
    const ok = Math.abs(expected - actual) <= tolOf(expected, actual) && nonVacuous(operands, c);
    checks.push({ id, soft, ok, expected, actual });
  };
  if (isNum(c.totalIncome) && isNum(c.revenue)) {
    add('C1', false, c.revenue + (isNum(c.otherIncome) ? c.otherIncome : 0), c.totalIncome, [
      c.revenue,
      c.totalIncome,
    ]);
  }
  if (isNum(c.pbt) && isNum(c.totalIncome) && isNum(c.totalExpenses)) {
    add('C2', true, c.totalIncome - c.totalExpenses, c.pbt, [
      c.totalIncome,
      c.totalExpenses,
      c.pbt,
    ]);
  }
  if (isNum(c.pat) && isNum(c.pbt) && isNum(c.tax))
    add('C3', true, c.pbt - c.tax, c.pat, [c.pbt, c.tax, c.pat]);
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

// Each identity lists its operands and how to solve for any one of them from the others.
const IDENTITIES = [
  {
    id: 'C1',
    fields: ['revenue', 'otherIncome', 'totalIncome'],
    optional: ['otherIncome'],
    solve: {
      revenue: (c) => c.totalIncome - (isNum(c.otherIncome) ? c.otherIncome : 0),
      otherIncome: (c) => c.totalIncome - c.revenue,
      totalIncome: (c) => c.revenue + (isNum(c.otherIncome) ? c.otherIncome : 0),
    },
  },
  {
    id: 'C2',
    fields: ['totalIncome', 'totalExpenses', 'pbt'],
    solve: {
      totalIncome: (c) => c.pbt + c.totalExpenses,
      totalExpenses: (c) => c.totalIncome - c.pbt,
      pbt: (c) => c.totalIncome - c.totalExpenses,
    },
  },
  {
    id: 'C3',
    fields: ['pbt', 'tax', 'pat'],
    solve: {
      pbt: (c) => c.pat + c.tax,
      tax: (c) => c.pbt - c.pat,
      pat: (c) => c.pbt - c.tax,
    },
  },
];

/**
 * Arithmetic repair. When an identity fails, the wrong operand is usually one that no passing identity and no second
 * OCR read vouches for. For each such suspect: solve it from the others and accept the solved value ONLY if it is printed on the
 * page (L1), else drop the suspect. A missing field beats a wrong one, and a wrong value never survives a failed identity.
 *
 * @param {object} cur   field -> value in crore
 * @param {object} ctx   step: smallest printed decimal step (0.01 for two-decimal tables, 1 for whole numbers); printed: Set of numbers printed on the page (document units); scale: crore per printed unit;
 *                       votes: field -> number of OCR reads that agree (>=2 counts as corroborated)
 */
function reconcileIncomeStatement(cur, { printed, scale = 1, votes = {}, step = 0.01 } = {}) {
  const c = { ...cur };
  // rounding tolerance of the PRINTED figures (each operand is off by up to half a step), far tighter than the verdict's 0.6%
  const tolR = (a, b) => 1.5 * step * scale + 5e-4 * Math.max(Math.abs(a), Math.abs(b));
  const repaired = [];
  const dropped = [];
  const holds = (idn) => {
    const need = idn.fields.filter((f) => !(idn.optional || []).includes(f));
    if (!need.every((f) => isNum(c[f]))) return null; // cannot be checked
    if (
      !nonVacuous(
        need.map((f) => c[f]),
        c
      )
    )
      return false;
    const want = idn.solve[idn.fields[idn.fields.length - 1]](c);
    return (
      Math.abs(want - c[idn.fields[idn.fields.length - 1]]) <=
      tolR(want, c[idn.fields[idn.fields.length - 1]])
    );
  };
  for (let round = 0; round < 4; round += 1) {
    const state = IDENTITIES.map((idn) => ({ idn, ok: holds(idn) }));
    const failing = state.filter((x) => x.ok === false);
    if (!failing.length) break;
    const vouched = new Set();
    for (const x of state) if (x.ok === true) x.idn.fields.forEach((f) => vouched.add(f));
    for (const f of Object.keys(votes)) if (votes[f] >= 2) vouched.add(f);
    const first = failing[0].idn;
    const suspects = first.fields.filter((f) => isNum(c[f]) && !vouched.has(f));
    if (!suspects.length) break; // every operand is vouched for elsewhere: leave it to the verdict (a soft identity may be legitimately off)
    let fixed = false;
    for (const f of suspects) {
      const v = first.solve[f](c);
      const printedForm = Math.round((Math.abs(v) / scale) * 10000) / 10000;
      const tryC = { ...c, [f]: v };
      if (isNum(v) && printed && printed.has(printedForm) && holdsWith(first, tryC)) {
        repaired.push({ field: f, from: c[f], to: v });
        c[f] = v;
        fixed = true;
        break;
      }
    }
    if (!fixed) {
      for (const f of suspects) {
        dropped.push(f);
        delete c[f];
      }
    }
  }
  // With two or more reads, a field that no passing identity vouches for must be backed by two reads, else it is dropped.
  if (Object.keys(votes).length) {
    const vouchedNow = new Set();
    for (const idn of IDENTITIES)
      if (holds(idn) === true) idn.fields.forEach((f) => vouchedNow.add(f));
    for (const f of Object.keys(c)) {
      if (!vouchedNow.has(f) && !(votes[f] >= 2)) {
        dropped.push(f);
        delete c[f];
      }
    }
  }
  return { cur: c, repaired, dropped };

  function holdsWith(idn, vals) {
    const last = idn.fields[idn.fields.length - 1];
    const want = idn.solve[last](vals);
    return Math.abs(want - vals[last]) <= tolR(want, vals[last]);
  }
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

/**
 * OCR drops decimal points and trailing digits ("5.92" -> "92", "2.85" -> "2"). In a table that prints decimals, a non-headline
 * field that comes back as a bare non-zero integer is more likely a damaged read than a real round number, so it is dropped.
 * Headline fields are protected by the arithmetic identities; the rest (components, tax, EPS) are not.
 */
const SUSPECT_FIELDS = [
  'employeeCost',
  'interest',
  'depreciation',
  'otherExpenses',
  'tax',
  'epsBasic',
  'epsDiluted',
];
function dropSuspectIntegers(cur) {
  const vals = Object.values(cur || {}).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (vals.filter((v) => !Number.isInteger(v)).length < 3) return { cur, dropped: [] };
  const out = { ...cur };
  const dropped = [];
  for (const k of SUSPECT_FIELDS) {
    const v = out[k];
    if (typeof v === 'number' && Number.isInteger(v) && v !== 0) {
      delete out[k];
      dropped.push(k);
    }
  }
  return { cur: out, dropped };
}

module.exports = {
  dropSuspectIntegers,
  sanitizeCurrent,
  verifyIncomeStatement,
  printedNumbers,
  groundValues,
  reconcileIncomeStatement,
};
