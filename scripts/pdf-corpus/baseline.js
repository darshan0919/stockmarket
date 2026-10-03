#!/usr/bin/env node
'use strict';

/**
 * Baseline: scores TODAY's result-PDF pipeline (pdftotext layout + OCR-if-empty +
 * `extractIncomeStatement`, no model calls) against the XBRL truth, under the benchmark contract of
 * docs/PDF_OCR_EXTRACTION_PLAN.md §3b. One record per document is appended to
 * `data/pdf-corpus/runs/<runId>.jsonl` (keyed by runId, resumable, shardable).
 *
 *   node scripts/pdf-corpus/baseline.js --run-id baseline-v0 [--split dev] [--limit N]
 *        [--budget-sec 140] [--shard i/n]
 *   node scripts/pdf-corpus/baseline.js --run-id baseline-v0 --summarize
 *
 * Per field: compared to the truth with tolerance max(0.05 Cr, 0.5%). `correct` / `wrong` (split into
 * `sign` and `pow10` slips, which are the dangerous ones) / `missing` (the extractor abstained on the
 * field). The truth holds one XBRL basis per document; `basisMismatch` marks documents where the
 * extractor's consolidated flag disagrees with it. They stay in the score (the flag is a heuristic)
 * and are reported as a separate slice.
 * Cost: `llmTokenUsage.agent` is 0 for this pipeline (a script); `timeTaken` is wall time incl. OCR.
 */

const fs = require('fs');
const L = require('./lib');
const { pdfToLayoutTextWithMeta } = require('../../cloud-utils/src/pdfText.js');
const {
  extractIncomeStatement,
} = require('../../skills/equity-research/quarterly-result-extractor/scripts/extract_income_statement.js');

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
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? d : process.argv[i + 1];
};
const runId = arg('--run-id', null);
if (!runId) {
  console.error('--run-id is required');
  process.exit(1);
}
const runFile = L.p('runs', `${runId}.jsonl`);

const agree = (a, b) =>
  Math.abs(a - b) <= Math.max(0.05, 0.005 * Math.max(Math.abs(a), Math.abs(b)));
const isPow10 = (a, b) => {
  if (!a || !b) return false;
  const r = Math.abs(a / b);
  const l = Math.log10(r);
  return Math.abs(l - Math.round(l)) < 0.02 && Math.round(l) !== 0;
};

function scoreFields(truthIs, pdfCur) {
  const out = { correct: 0, wrong: 0, sign: 0, pow10: 0, missing: 0, compared: 0, byField: {} };
  for (const f of FIELDS) {
    const t = truthIs[f];
    if (typeof t !== 'number') continue; // truth silent on this field
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

/**
 * Unit-slip diagnosis: a document whose printed unit (lakh, thousand, ...) was not detected keeps every
 * value off by the same power of ten. Returns the single factor (10^k) under which most present fields
 * match, and how many fields would be correct with it. Reported next to, never instead of, strict accuracy.
 */
function unitAdjusted(truthIs, pdfCur) {
  let best = { factor: 1, correct: 0 };
  for (const factor of [1, 10, 100, 1000, 0.1, 0.01, 0.001]) {
    let c = 0;
    for (const f of FIELDS) {
      if (
        typeof truthIs[f] === 'number' &&
        typeof pdfCur[f] === 'number' &&
        agree(pdfCur[f] / factor, truthIs[f])
      )
        c++;
    }
    if (c > best.correct) best = { factor, correct: c };
  }
  return best;
}

async function runOne(r, truth) {
  const t0 = Date.now();
  const rec = {
    runId,
    docId: r.docId,
    candidate: 'tier1-pdftotext+parser',
    tier: 1,
    form: r.form,
    pages: r.pages,
    split: r.split,
    family: r.family,
    sector: r.sector,
  };
  try {
    const buf = fs.readFileSync(L.p(r.file));
    const meta = await pdfToLayoutTextWithMeta(buf, { maxChars: Infinity });
    rec.ocr = Boolean(meta.isScannedDocument);
    rec.ocrFailed = Boolean(meta.ocrFailed);
    const ex = extractIncomeStatement({ resultText: meta.text });
    rec.found = Boolean(ex.found);
    if (!ex.found) {
      rec.abstained = true;
      rec.compared = FIELDS.filter((f) => typeof truth.is[f] === 'number').length;
      rec.correct = 0;
      rec.wrong = 0;
      rec.missing = rec.compared;
    } else {
      const truthConsolidated = truth.basis === 'consolidated';
      rec.basisMismatch = ex.consolidated !== undefined && ex.consolidated !== truthConsolidated;
      Object.assign(rec, scoreFields(truth.is, ex.raw.cur || {}));
      rec.got = Object.fromEntries(
        FIELDS.filter((f) => typeof (ex.raw.cur || {})[f] === 'number').map((f) => [
          f,
          ex.raw.cur[f],
        ])
      );
      rec.want = Object.fromEntries(
        FIELDS.filter((f) => typeof truth.is[f] === 'number').map((f) => [f, truth.is[f]])
      );
      rec.abstained = false;
      rec.unit = ex.unit;
      const adj = unitAdjusted(truth.is, ex.raw.cur || {});
      rec.unitFactor = adj.factor;
      rec.correctUnitAdjusted = adj.correct;
    }
  } catch (e) {
    rec.error = String(e.message).slice(0, 160);
  }
  rec.llmTokenUsage = { agent: 0, local: 0 };
  rec.timeTaken = { ms: Date.now() - t0, pages: rec.pages };
  return rec;
}

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

function summarize() {
  const rows = L.readJsonl(runFile);
  const latest = new Map(rows.map((r) => [r.docId, r]));
  const docs = [...latest.values()].filter((r) => !r.error);
  // every document is scored; `basisMismatch` (the extractor's consolidated flag disagrees with the truth basis)
  // is reported as its own slice because that flag is a heuristic and may itself be wrong.
  const scored = docs;
  const agg = (set) => {
    const cmp = set.reduce((a, r) => a + r.compared, 0);
    const cor = set.reduce((a, r) => a + r.correct, 0);
    const docAcc = set.map((r) => (r.compared ? r.correct / r.compared : 0));
    const [lo, hi] = boot(docAcc);
    const ms = set.map((r) => r.timeTaken.ms).sort((a, b) => a - b);
    return {
      docs: set.length,
      fieldAccuracy: cmp ? +(cor / cmp).toFixed(4) : null,
      docAccuracyMean: docAcc.length
        ? +(docAcc.reduce((a, b) => a + b, 0) / docAcc.length).toFixed(4)
        : null,
      docAccuracyCI95: [lo && +lo.toFixed(4), hi && +hi.toFixed(4)],
      abstainRate: set.length
        ? +(set.filter((r) => r.abstained).length / set.length).toFixed(4)
        : null,
      fieldAccuracyIfUnitFixed: cmp
        ? +(set.reduce((a, r) => a + (r.correctUnitAdjusted || 0), 0) / cmp).toFixed(4)
        : null,
      unitSlipDocs: set.filter((r) => r.unitFactor && r.unitFactor !== 1).length,
      wrongFields: set.reduce((a, r) => a + (r.wrong || 0), 0),
      signFlips: set.reduce((a, r) => a + (r.sign || 0), 0),
      pow10Errors: set.reduce((a, r) => a + (r.pow10 || 0), 0),
      perfectDocs: set.filter((r) => r.compared && r.correct === r.compared).length,
      agentTokens: 0,
      ms: {
        p50: ms[ms.length >> 1] || null,
        p90: ms[Math.floor(ms.length * 0.9)] || null,
        total: ms.reduce((a, b) => a + b, 0),
      },
    };
  };
  const by = (key) =>
    Object.fromEntries(
      [...new Set(scored.map((r) => r[key]))]
        .sort()
        .map((k) => [k, agg(scored.filter((r) => r[key] === k))])
    );
  const fieldAcc = {};
  for (const f of FIELDS) {
    const c = scored.filter((r) => r.byField && r.byField[f]);
    if (c.length)
      fieldAcc[f] = {
        n: c.length,
        correct: +(c.filter((r) => r.byField[f] === 'correct').length / c.length).toFixed(3),
      };
  }
  console.log(
    JSON.stringify(
      {
        runId,
        documents: latest.size,
        errors: rows.filter((r) => r.error).length,
        basisFlagDisagrees: docs.filter((r) => r.basisMismatch).length,
        overall: agg(scored),
        foundOnly: agg(scored.filter((r) => r.found)),
        foundFlagAgrees: agg(scored.filter((r) => r.found && !r.basisMismatch)),
        byForm: by('form'),
        byFamily: by('family'),
        fieldAccuracy: fieldAcc,
      },
      null,
      1
    )
  );
}

async function main() {
  if (process.argv.includes('--summarize')) return summarize();
  const split = arg('--split', 'dev');
  const deadline = Date.now() + Number(arg('--budget-sec', 140)) * 1000;
  const limit = Number(arg('--limit', 0));
  const shard = arg('--shard', null) && {
    i: Number(arg('--shard').split('/')[0]),
    n: Number(arg('--shard').split('/')[1]),
  };
  const quarantined = new Set(L.readJsonl(L.p('quarantine.jsonl')).map((q) => q.docId));
  const truth = new Map();
  for (const t of L.readJsonl(L.p('truth.jsonl'))) if (t.ok && t.is) truth.set(t.docId, t);
  const done = new Set(L.readJsonl(runFile).map((r) => r.docId));
  let todo = L.readJsonl(L.p('manifest.jsonl')).filter(
    (r) =>
      r.type === 'Result' &&
      !r.dupOf &&
      r.split === split &&
      truth.has(r.docId) &&
      !quarantined.has(r.docId) &&
      !done.has(r.docId)
  );
  if (shard) todo = todo.filter((r) => L.bucket(r.docId) % shard.n === shard.i);
  if (limit) todo = todo.slice(0, limit);
  let n = 0;
  for (const r of todo) {
    if (Date.now() > deadline) break;
    L.appendJsonl(runFile, [await runOne(r, truth.get(r.docId))]);
    n++;
  }
  console.log(JSON.stringify({ runId, split, processed: n, remaining: todo.length - n }));
}
main();
