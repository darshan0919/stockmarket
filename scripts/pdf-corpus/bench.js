#!/usr/bin/env node
'use strict';

/**
 * Benchmark runner for the result-PDF extractors, built to run NATIVELY on the owner's Mac (Tier 3 models
 * cannot run in the agent's VM: no GPU, 3 GB RAM). Contract: docs/PDF_OCR_EXTRACTION_PLAN.md §3b.
 * Setup and commands: docs/LOCAL_MODEL_EXTRACTION.md.
 *
 *   node scripts/pdf-corpus/bench.js --run-id r1 --split dev --limit 40 \
 *        --candidates "router;t3=ollama:qwen2.5:7b;full=ollama:qwen2.5:7b;t3=ollama:qwen2.5vl:7b/image"
 *   node scripts/pdf-corpus/report.js --run-id r1
 *
 * Candidates (separated by ';'):
 *   router                    Tier 1 (page-level text) + Tier 2 (OCR), no model
 *   t3=<provider>[/<mode>]    the local model ALONE on the best result pages (measures the model, not the router)
 *   full=<provider>[/<mode>]  router, escalating to the model only when Tiers 1-2 fail verification
 *   ocronly=<engine>          OCR engine comparison: skips the text-layer parse so every engine reads the same pages;
 *                             <engine> = tesseract | <ocr model>  (e.g. ocronly=tesseract, ocronly=ollama:glm-ocr)
 *   ocr=<ocr model|tesseract>[+<model>[/<mode>]]  router whose Tier 2 reads pages with a dedicated OCR model (e.g. ocr=ollama:glm-ocr),
 *                             optionally followed by Tier 3 with <model>
 *   mock=parser               harness self-test: a fake "model" that replays the Tier 1 parser (no network)
 *   <provider> = ollama:<model>[@baseUrl] | openai:<model>[@baseUrl];  <mode> = text | image | both (default text)
 *
 * Fair timing on a fanless laptop: documents are the OUTER loop and the candidate order ROTATES per document,
 * so no candidate always runs last on a hot machine; `--cooldown-every K --cooldown-sec S` pauses between
 * documents, and every record stores `wallClockMs` since run start so throttling drift is visible.
 * Resumable: a (docId, candidate) pair already in the run file is skipped. One JSONL per runId, never shared.
 */

const os = require('os');
const L = require('./lib');
const S = require('./score');
const { extractResultPdf } = require('../../packages/jobs-runtime/lib/pdfExtract/router');
const {
  providerFromSpec,
  MockProvider,
} = require('../../packages/jobs-runtime/lib/pdfExtract/tier3');
const {
  extractIncomeStatement,
} = require('../../skills/equity-research/quarterly-result-extractor/scripts/extract_income_statement.js');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? d : process.argv[i + 1];
};

// --max-tokens N caps output per call; the default is no cap (output tokens are a reported metric instead)
const PROV = { numPredict: Number(arg('--max-tokens', 0)) || undefined };

/** "<provider spec>#chat|compact" -> {spec, style}: force a prompt style (default: chosen by model size). */
function splitStyle(s) {
  const m = /^(.*)#(chat|compact)$/.exec(s);
  return m ? { spec: m[1], style: m[2] } : { spec: s, style: undefined };
}

/** "dpi=300,psm=4,prep=clean" -> options for pages.ocrPage (the engine itself is written tesseract:<options>). */
function parseTess(str) {
  const o = {};
  for (const kv of String(str || '')
    .split(',')
    .filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (!['dpi', 'psm', 'prep'].includes(k)) throw new Error(`bad tesseract option "${kv}"`);
    o[k] = k === 'prep' ? v : Number(v);
  }
  return o;
}

function parseCandidate(spec) {
  const s = spec.trim();
  if (s === 'router') return { id: 'router', opts: {} };
  const o = /^(ocr|ocronly)=([^+]+)(?:\+(.+))?$/.exec(s);
  const tess = o && /^tesseract(?::(.*))?$/.exec(o[2]);
  if (o) {
    // ocr=<ocr model>[+<extraction model>[/mode]]: Tier 2 reads pages with the OCR model; the optional second model is Tier 3
    // the engine 'tesseract' is the current Tier 2; ocronly= skips the text-layer parse so every engine reads the same pages
    const opts = tess
      ? tess[1]
        ? { tesseract: parseTess(tess[1]) }
        : {}
      : { ocrModel: { provider: providerFromSpec(o[2], PROV) } };
    if (o[1] === 'ocronly') opts.forceOcr = true;
    if (o[3]) {
      let rest = o[3];
      let mode = 'text';
      const sl = rest.lastIndexOf('/');
      if (sl > 0 && ['text', 'image', 'both'].includes(rest.slice(sl + 1))) {
        mode = rest.slice(sl + 1);
        rest = rest.slice(0, sl);
      }
      const sp = splitStyle(rest);
      opts.tier3 = { provider: providerFromSpec(sp.spec, PROV), mode, promptStyle: sp.style };
    }
    return { id: s, opts };
  }
  const m = /^(t3|full|mock)=(.+)$/.exec(s);
  if (!m) throw new Error(`bad candidate "${s}"`);
  let [, kind, rest] = m;
  let mode = 'text';
  // grammar: <provider>[/<mode>][#<style>]; the style is read back after the mode is removed
  const styleM = /#(chat|compact)$/.exec(rest);
  const styleSuffix = styleM ? styleM[0] : '';
  if (styleM) rest = rest.slice(0, -styleSuffix.length);
  const slash = rest.lastIndexOf('/');
  if (slash > 0 && ['text', 'image', 'both'].includes(rest.slice(slash + 1))) {
    mode = rest.slice(slash + 1);
    rest = rest.slice(0, slash);
  }
  const sp = { spec: rest, style: styleM ? styleM[1] : undefined };
  const provider = kind === 'mock' ? parserMock() : providerFromSpec(sp.spec, PROV);
  return {
    id: s,
    opts: { tier3: { provider, mode, promptStyle: sp.style }, skipTier1: kind === 't3' },
  };
}

/** Fake model: replays the Tier 1 parser over the page text it is shown, "as printed" (harness self-test). */
function parserMock() {
  return new MockProvider(({ user }) => {
    const ex = extractIncomeStatement({ resultText: user });
    if (!ex.found) return { unit: 'unknown', basis: 'unknown', values: {} };
    const toCr = { crore: 1, lakh: 0.01, million: 0.1, thousand: 0.0001 }[ex.unit];
    const values = {};
    for (const [k, v] of Object.entries(ex.raw.cur))
      if (typeof v === 'number')
        values[k] = k === 'epsBasic' || !toCr ? v : Math.round((v / toCr) * 1e6) / 1e6;
    return { unit: ex.unit, basis: ex.consolidated ? 'consolidated' : 'standalone', values };
  }, 'mock:parser');
}

async function runOne({ runId, cand, doc, truth, hardwareId, t0 }) {
  const started = Date.now();
  const rec = {
    runId,
    candidate: cand.id,
    docId: doc.docId,
    form: doc.form,
    pages: doc.pages,
    split: doc.split,
    family: doc.family,
    sector: doc.sector,
    hardwareId,
  };
  try {
    const res = await extractResultPdf(L.p(doc.file), cand.opts);
    rec.found = res.found;
    rec.abstained = res.abstained;
    rec.tier = res.tier || null;
    rec.page = res.page || null;
    rec.verification = res.verification || null;
    rec.unit = res.unit || null;
    rec.basis = res.basis || null;
    rec.promptStyle = res.promptStyle || null;
    rec.reason = res.reason || null;
    rec.trail = res.trail || null;
    if (res.found) {
      rec.basisMismatch = res.basis && res.basis !== 'unknown' && res.basis !== truth.basis;
      Object.assign(rec, S.scoreFields(truth.is, res.cur));
      rec.got = Object.fromEntries(
        S.FIELDS.filter((f) => typeof res.cur[f] === 'number').map((f) => [f, res.cur[f]])
      );
      rec.want = Object.fromEntries(
        S.FIELDS.filter((f) => typeof truth.is[f] === 'number').map((f) => [f, truth.is[f]])
      );
      const adj = S.unitAdjusted(truth.is, res.cur);
      rec.unitFactor = adj.factor;
      rec.correctUnitAdjusted = adj.correct;
    } else {
      rec.compared = S.FIELDS.filter((f) => typeof truth.is[f] === 'number').length;
      rec.correct = 0;
      rec.wrong = 0;
      rec.sign = 0;
      rec.pow10 = 0;
      rec.missing = rec.compared;
      rec.reason = res.reason;
    }
    rec.llmTokenUsage = {
      agent: 0,
      local: res.tokens.local,
      localInput: res.tokens.localInput,
      localOutput: res.tokens.localOutput,
      localCalls: res.tokens.localCalls,
      localCut: res.tokens.localCut,
      localMaxOutput: res.tokens.localMaxOutput,
      localFailed: res.tokens.localFailed,
    };
  } catch (e) {
    rec.error = String(e.message).slice(0, 200);
    rec.llmTokenUsage = { agent: 0, local: 0 };
  }
  rec.timeTaken = { ms: Date.now() - started, pages: doc.pages };
  rec.wallClockMs = Date.now() - t0;
  return rec;
}

async function main() {
  const runId = arg('--run-id', null);
  if (!runId) throw new Error('--run-id is required');
  const split = arg('--split', 'dev');
  const limit = Number(arg('--limit', 0));
  const deadline = Date.now() + Number(arg('--budget-sec', 0)) * 1000;
  const budgeted = Number(arg('--budget-sec', 0)) > 0;
  const coolEvery = Number(arg('--cooldown-every', 0));
  const coolSec = Number(arg('--cooldown-sec', 0));
  const hardwareId = arg(
    '--hardware-id',
    `${os.hostname()}|${os.arch()}|${(os.cpus()[0] || {}).model || 'cpu'}|${Math.round(os.totalmem() / 2 ** 30)}GB`
  );
  const cands = arg('--candidates', 'router').split(';').filter(Boolean).map(parseCandidate);
  const runFile = L.p('runs', `${runId}.jsonl`);
  const done = new Set(L.readJsonl(runFile).map((r) => `${r.docId}|${r.candidate}`));
  const quarantined = new Set(L.readJsonl(L.p('quarantine.jsonl')).map((q) => q.docId));
  const truth = new Map();
  for (const t of L.readJsonl(L.p('truth.jsonl'))) if (t.ok && t.is) truth.set(t.docId, t);
  let docs = L.readJsonl(L.p('manifest.jsonl')).filter(
    (r) =>
      r.type === 'Result' &&
      !r.dupOf &&
      r.split === split &&
      truth.has(r.docId) &&
      !quarantined.has(r.docId)
  );
  if (arg('--docs', null)) docs = docs.filter((r) => arg('--docs').split(',').includes(r.docId));
  if (arg('--forms', null)) docs = docs.filter((r) => arg('--forms').split(',').includes(r.form));
  if (limit) docs = docs.slice(0, limit);
  const t0 = Date.now();
  let n = 0;
  for (let i = 0; i < docs.length; i++) {
    if (budgeted && Date.now() > deadline) break;
    const doc = docs[i];
    for (let k = 0; k < cands.length; k++) {
      const cand = cands[(i + k) % cands.length]; // rotate the starting candidate per document
      if (done.has(`${doc.docId}|${cand.id}`)) continue;
      L.appendJsonl(runFile, [
        await runOne({ runId, cand, doc, truth: truth.get(doc.docId), hardwareId, t0 }),
      ]);
      n++;
    }
    if (coolEvery && coolSec && (i + 1) % coolEvery === 0) await L.sleep(coolSec * 1000);
  }
  console.log(
    JSON.stringify({
      runId,
      split,
      candidates: cands.map((c) => c.id),
      recordsWritten: n,
      hardwareId,
    })
  );
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
