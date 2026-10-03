#!/usr/bin/env node
'use strict';

/**
 * Multi-candidate report for a bench.js run, following the ranking rule of docs/PDF_OCR_EXTRACTION_PLAN.md §3b:
 * eligible = served-field accuracy >= 98% with zero sign flips and zero power-of-ten errors; among eligible
 * candidates fewer billed agent tokens wins, then time. Coverage (share of documents served) is its own column.
 *
 *   node scripts/pdf-corpus/report.js --run-id r1 [--json]
 */

const L = require('./lib');
const S = require('./score');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? d : process.argv[i + 1];
};
const runId = arg('--run-id', null);
if (!runId) {
  console.error('--run-id is required');
  process.exit(1);
}

const latest = new Map();
for (const r of L.readJsonl(L.p('runs', `${runId}.jsonl`)))
  latest.set(`${r.candidate}|${r.docId}`, r);
const byCand = new Map();
for (const r of latest.values()) {
  if (!byCand.has(r.candidate)) byCand.set(r.candidate, []);
  byCand.get(r.candidate).push(r);
}

const sum = (a, f) => a.reduce((x, r) => x + (f(r) || 0), 0);
const rate = (a, b) => (b ? +(a / b).toFixed(4) : null);

const out = [];
for (const [candidate, rows] of byCand) {
  const ok = rows.filter((r) => !r.error);
  const served = ok.filter((r) => r.found && !r.basisMismatch);
  const headlineCmp = sum(
    served,
    (r) => S.HEADLINE.filter((f) => r.byField && r.byField[f]).length
  );
  const headlineOk = sum(
    served,
    (r) => S.HEADLINE.filter((f) => r.byField && r.byField[f] === 'correct').length
  );
  const docAcc = served.map((r) => (r.compared ? r.correct / r.compared : 0));
  const [lo, hi] = S.boot(docAcc);
  const ms = ok.map((r) => r.timeTaken.ms);
  const servedAcc = rate(
    sum(served, (r) => r.correct),
    sum(served, (r) => r.compared)
  );
  const sign = sum(served, (r) => r.sign);
  const pow10 = sum(served, (r) => r.pow10);
  out.push({
    candidate,
    docs: ok.length,
    errors: rows.length - ok.length,
    coverage: rate(served.length, ok.length),
    servedFieldAccuracy: servedAcc,
    servedDocCI95: [lo && +lo.toFixed(4), hi && +hi.toFixed(4)],
    headlineAccuracy: rate(headlineOk, headlineCmp),
    overallFieldAccuracy: rate(
      sum(ok, (r) => r.correct),
      sum(ok, (r) => r.compared)
    ),
    perfectServedDocs: served.filter((r) => r.compared && r.correct === r.compared).length,
    wrongServedFields: sum(served, (r) => r.wrong + r.sign),
    signFlips: sign,
    pow10Errors: pow10,
    basisMismatchDocs: ok.filter((r) => r.found && r.basisMismatch).length,
    byTier: ok.reduce(
      (m, r) => ((m[r.tier || 'abstain'] = (m[r.tier || 'abstain'] || 0) + 1), m),
      {}
    ),
    localTokensPerDoc: ok.length
      ? Math.round(sum(ok, (r) => r.llmTokenUsage && r.llmTokenUsage.local) / ok.length)
      : 0,
    agentTokens: sum(ok, (r) => r.llmTokenUsage && r.llmTokenUsage.agent),
    msP50: S.pct(ms, 0.5),
    msP95: S.pct(ms, 0.95),
    eligible: servedAcc !== null && servedAcc >= 0.98 && sign === 0 && pow10 === 0,
  });
}
out.sort(
  (a, b) =>
    Number(b.eligible) - Number(a.eligible) ||
    a.agentTokens - b.agentTokens ||
    (b.servedFieldAccuracy || 0) - (a.servedFieldAccuracy || 0)
);
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(
    `run ${runId}  (served = found and basis matches truth; coverage = served docs / docs)`
  );
  console.table(
    out.map((o) => ({
      candidate: o.candidate.slice(0, 38),
      docs: o.docs,
      coverage: o.coverage,
      servedAcc: o.servedFieldAccuracy,
      headline: o.headlineAccuracy,
      sign: o.signFlips,
      pow10: o.pow10Errors,
      localTok: o.localTokensPerDoc,
      p50ms: o.msP50,
      p95ms: o.msP95,
      eligible: o.eligible,
    }))
  );
}
