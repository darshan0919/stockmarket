#!/usr/bin/env node
'use strict';

/**
 * Pairs each downloaded Result PDF with its XBRL ground truth -> data/pdf-corpus/truth.jsonl
 *
 *   node --env-file=.env scripts/pdf-corpus/build_truth.js [--concurrency 2] [--budget-sec 140] [--limit N]
 *
 * Truth = the XBRL income statement (`resolveResultPeriods().cur.is`, plus `bs` when filed) for the PDF's period end,
 * resolved with basis 'auto' (consolidated when filed). One PDF may carry both standalone and
 * consolidated statements, so a scorer must accept a match on either basis — `basis` is recorded.
 * Companies flagged `truthExcluded` in universe.jsonl (known filer-side XBRL errors) are skipped,
 * and so are documents without a parsed period. Resumable: docIds already in truth.jsonl are skipped.
 */

const L = require('./lib');
const { NseClient } = require('../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('../../packages/jobs-runtime/lib/xbrl/issues.js');
const { resolveResultPeriods } = require('../../packages/jobs-runtime/lib/xbrl/resultsResolver.js');

const num = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function main() {
  const concurrency = num('--concurrency', 2);
  const deadline = Date.now() + num('--budget-sec', 140) * 1000;
  const limit = num('--limit', 0);
  const excluded = new Set(
    L.readJsonl(L.p('universe.jsonl'))
      .filter((u) => u.truthExcluded || !u.xbrlOk)
      .map((u) => u.companyId)
  );
  // the latest row per docId wins; an `ok` row without values (early pilot format) is redone
  const done = new Set(
    L.readJsonl(L.p('truth.jsonl'))
      .filter((t) => !t.ok || t.is)
      .map((t) => t.docId)
  );
  let todo = L.readJsonl(L.p('manifest.jsonl')).filter(
    (r) =>
      r.type === 'Result' &&
      !r.dupOf &&
      r.periodEnd &&
      !excluded.has(r.companyId) &&
      !done.has(r.docId)
  );
  if (limit) todo = todo.slice(0, limit);
  const clients = { nse: new NseClient(), bse: new BseClient() };
  const stats = { pending: todo.length, ok: 0, noTruth: 0 };

  await L.pool(
    todo,
    concurrency,
    async (r) => {
      const issues = createIssueLog(`truth-${r.symbol}`);
      const row = {
        docId: r.docId,
        companyId: r.companyId,
        periodEnd: r.periodEnd,
        at: new Date().toISOString(),
      };
      try {
        const res = await withTimeout(
          resolveResultPeriods({
            symbol: r.symbol,
            quarterEnd: r.periodEnd,
            basis: 'auto',
            ...clients,
            issues,
          }),
          110000
        );
        if (res.cur && res.cur.ok && res.quarterEnd === r.periodEnd) {
          Object.assign(row, {
            ok: true,
            basis: res.basis,
            exchange: res.cur.exchange,
            family: res.cur.family,
            cumulativeDays: res.cur.cumulativeDays,
            is: res.cur.is,
            bs: res.cur.bs || null,
            issues: issues.summary(),
          });
          stats.ok++;
        } else {
          Object.assign(row, {
            ok: false,
            reason:
              res.cur && res.cur.reason
                ? res.cur.reason
                : `resolved ${res.quarterEnd} != ${r.periodEnd}`,
          });
          stats.noTruth++;
        }
      } catch (e) {
        Object.assign(row, { ok: false, reason: `error: ${String(e.message).slice(0, 120)}` });
        stats.noTruth++;
      }
      L.appendJsonl(L.p('truth.jsonl'), [row]);
    },
    deadline
  );
  console.log(JSON.stringify({ ...stats, truthRows: L.readJsonl(L.p('truth.jsonl')).length }));
}
main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
