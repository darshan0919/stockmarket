'use strict';

/** Shared scoring for the PDF-extraction benchmark (contract: docs/PDF_OCR_EXTRACTION_PLAN.md §3b). */

const FIELDS = [
  'revenue',
  'otherIncome',
  'totalIncome',
  'employeeCost',
  'interest',
  'depreciation',
  'otherExpenses',
  'totalExpenses',
  'pbt',
  'tax',
  'pat',
  'epsBasic',
];
/** Fields every reader should get right regardless of how a filing groups its expense lines. */
const HEADLINE = ['revenue', 'totalIncome', 'pbt', 'pat'];

const agree = (a, b) =>
  Math.abs(a - b) <= Math.max(0.05, 0.005 * Math.max(Math.abs(a), Math.abs(b)));
const isPow10 = (a, b) => {
  if (!a || !b) return false;
  const l = Math.log10(Math.abs(a / b));
  return Math.abs(l - Math.round(l)) < 0.02 && Math.round(l) !== 0;
};

/** Per field: correct / wrong (split into sign and pow10) / missing. Truth-silent fields are not compared. */
function scoreFields(truthIs, pdfCur) {
  const out = { correct: 0, wrong: 0, sign: 0, pow10: 0, missing: 0, compared: 0, byField: {} };
  for (const f of FIELDS) {
    const t = truthIs[f];
    if (typeof t !== 'number') continue;
    out.compared++;
    const v = pdfCur[f];
    let s;
    if (typeof v !== 'number') {
      s = 'missing';
      out.missing++;
    } else if (agree(v, t)) {
      s = 'correct';
      out.correct++;
    } else {
      s = 'wrong';
      out.wrong++;
      if (t !== 0 && v === -t) {
        s = 'sign';
        out.sign++;
      } else if (isPow10(v, t)) {
        s = 'pow10';
        out.pow10++;
      }
    }
    out.byField[f] = s;
  }
  return out;
}

/** Single power-of-ten factor under which most present fields match (unit-slip diagnosis, reported beside strict accuracy). */
function unitAdjusted(truthIs, pdfCur) {
  let best = { factor: 1, correct: 0 };
  for (const factor of [1, 10, 100, 1000, 0.1, 0.01, 0.001]) {
    let c = 0;
    for (const f of FIELDS)
      if (
        typeof truthIs[f] === 'number' &&
        typeof pdfCur[f] === 'number' &&
        agree(pdfCur[f] / factor, truthIs[f])
      )
        c++;
    if (c > best.correct) best = { factor, correct: c };
  }
  return best;
}

/** Deterministic bootstrap 95% CI of the mean. */
function boot(values, iters = 2000) {
  if (!values.length) return [null, null];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const means = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < values.length; j++) s += values[(rnd() * values.length) | 0];
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iters * 0.025)], means[Math.floor(iters * 0.975)]];
}

const pct = (arr, p) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
};

module.exports = { FIELDS, HEADLINE, agree, isPow10, scoreFields, unitAdjusted, boot, pct };
