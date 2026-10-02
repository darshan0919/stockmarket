#!/usr/bin/env node
'use strict';

/**
 * Bulk validation of the XBRL-first results path (docs/XBRL_INTEGRATION_PLAN.md, Phase 5).
 *
 *   node scripts/xbrl/validate_results.js --in sample.json --out results.jsonl \
 *        [--quarters 1] [--concurrency 2] [--limit N] [--resume]
 *
 * `--in` is a JSON file with `sample: [{companyId, sector, industry, ...}]` (or a bare array).
 * For each company (and each of the last `--quarters` quarter ends) it runs the resolver +
 * assembler and appends one JSON line: source per period, coverage, cross-exchange check,
 * every logged issue, elapsed ms. Raw filings are cached only under the OS temp dir.
 * Nothing is written under data/.
 */

const fs = require('fs');
const { NseClient } = require('../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('../../packages/jobs-runtime/lib/xbrl/issues.js');
const {
  resolveResultPeriods,
  shiftMonthEnd,
} = require('../../packages/jobs-runtime/lib/xbrl/resultsResolver.js');
const {
  assemble,
} = require('../../skills/equity-research/quarterly-result-extractor/scripts/extract_result_xbrl.js');

function parseArgs(argv) {
  const a = { quarters: 1, concurrency: 2, limit: 0, resume: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--in') a.in = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--quarters') a.quarters = Number(argv[++i]);
    else if (k === '--concurrency') a.concurrency = Number(argv[++i]);
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--resume') a.resume = true;
  }
  return a;
}

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms)),
  ]);

async function runOne(entry, quarterEnd, clients) {
  const symbol = entry.companyId.replace(/^(NSE|BSE):/i, '').toUpperCase();
  const issues = createIssueLog(`val-${symbol}-${quarterEnd || 'latest'}`);
  const t0 = Date.now();
  const rec = {
    companyId: entry.companyId,
    sector: entry.sector,
    industry: entry.industry,
    requestedQuarterEnd: quarterEnd || null,
  };
  try {
    const r = await withTimeout(
      resolveResultPeriods({ symbol, quarterEnd, basis: 'auto', ...clients, issues }),
      120000,
      'resolve'
    );
    rec.quarterEnd = r.quarterEnd;
    rec.basis = r.basis;
    rec.cur = r.cur?.ok
      ? {
          ok: true,
          exchange: r.cur.exchange,
          family: r.cur.family,
          cumulativeDays: r.cur.cumulativeDays,
        }
      : { ok: false, reason: r.cur?.reason };
    rec.qoq = r.qoq?.ok
      ? { ok: true, exchange: r.qoq.exchange }
      : { ok: false, reason: r.qoq?.reason ?? null };
    rec.yoy = r.yoy?.ok
      ? { ok: true, exchange: r.yoy.exchange }
      : { ok: false, reason: r.yoy?.reason ?? null };
    rec.hasBs = Boolean(r.cur?.bs);
    rec.hasCf = Boolean(r.cur?.cf);
    rec.exchangeCheck = r.exchangeCheck
      ? {
          matched: r.exchangeCheck.matched,
          differing: r.exchangeCheck.differing?.length ?? 0,
          onlyA: r.exchangeCheck.onlyA?.length ?? 0,
          onlyB: r.exchangeCheck.onlyB?.length ?? 0,
        }
      : null;
    if (r.cur?.ok) {
      const { incomeStatement } = assemble(r, null, issues);
      rec.assembled = { found: incomeStatement.found, headline: incomeStatement.headline ?? null };
    }
  } catch (e) {
    rec.crash = e.message;
    issues.add({
      symbol,
      category: 'PARSE_ERROR',
      severity: 'major',
      message: `validator crash: ${e.message}`,
    });
  }
  rec.issues = issues.all();
  rec.issueSummary = issues.summary();
  rec.elapsedMs = Date.now() - t0;
  return rec;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.in || !a.out) {
    console.error(
      'usage: validate_results.js --in sample.json --out results.jsonl [--quarters N] [--concurrency N] [--limit N] [--resume]'
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(a.in, 'utf8'));
  let list = Array.isArray(raw) ? raw : raw.sample;
  if (a.limit) list = list.slice(0, a.limit);
  const done = new Set();
  if (a.resume && fs.existsSync(a.out))
    for (const l of fs.readFileSync(a.out, 'utf8').split('\n').filter(Boolean)) {
      const j = JSON.parse(l);
      done.add(`${j.companyId}|${j.qIndex}`);
    }
  const anchors = new Map();
  if (fs.existsSync(a.out))
    for (const l of fs.readFileSync(a.out, 'utf8').split('\n').filter(Boolean)) {
      const j = JSON.parse(l);
      if (j.qIndex === 0 && j.quarterEnd) anchors.set(j.companyId, j.quarterEnd);
    }
  const clients = { nse: new NseClient(), bse: new BseClient() };
  const jobs = [];
  for (const e of list) for (let q = 0; q < a.quarters; q++) jobs.push({ e, q });
  let idx = 0;
  const worker = async () => {
    while (idx < jobs.length) {
      const { e, q } = jobs[idx++];
      if (done.has(`${e.companyId}|${q}`)) continue;
      let qEnd;
      if (q > 0) {
        // Anchor on the latest quarter found for q=0 (in-memory; never re-read the file while workers append).
        const first = anchors.get(e.companyId);
        if (!first) continue;
        qEnd = shiftMonthEnd(first, -3 * q);
      }
      const rec = await runOne(e, qEnd, clients);
      rec.qIndex = q;
      if (q === 0 && rec.quarterEnd) anchors.set(e.companyId, rec.quarterEnd);
      fs.appendFileSync(a.out, JSON.stringify(rec) + '\n');
      process.stderr.write(
        `${e.companyId} q${q} ${rec.cur?.ok ? rec.cur.exchange : 'NO'} ${rec.elapsedMs}ms\n`
      );
    }
  };
  // Quarter 0 for all companies first, then history, so anchors exist.
  const q0 = jobs.filter((j) => j.q === 0);
  const rest = jobs.filter((j) => j.q > 0);
  for (const batch of [q0, rest]) {
    idx = 0;
    jobs.length = 0;
    jobs.push(...batch);
    await Promise.all(Array.from({ length: a.concurrency }, worker));
  }
}

if (require.main === module) main();
