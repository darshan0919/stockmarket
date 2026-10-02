#!/usr/bin/env node
'use strict';

/**
 * Caches the Stockscans document listing (Result / PPT / Transcript / Annual Report, all years)
 * for each selected company -> data/pdf-corpus/listings/<SYMBOL>.json
 *
 *   node --env-file=.env scripts/pdf-corpus/list_docs.js [--concurrency 3] [--delay-ms 200]
 *        [--budget-sec 150] [--limit N]
 *
 * One call per company serves all four document types. Resumable: a company with a listing file
 * is skipped. Stockscans rate-limits, so concurrency is low; a 429 stops the chunk (re-run later).
 * Failures are appended to listings-errors.jsonl and retried on the next run.
 */

const fs = require('fs');
const L = require('./lib');
const { stockscans } = require('../../stock-api/src/index');

const num = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const concurrency = num('--concurrency', 3);
const delayMs = num('--delay-ms', 200);
const budgetSec = num('--budget-sec', 150);
const limit = num('--limit', 0);

async function main() {
  const companies = L.readJsonl(L.p('companies.jsonl'));
  L.ensureDir(L.p('listings'));
  let todo = companies.filter((c) => !fs.existsSync(L.p('listings', `${c.symbol}.json`)));
  if (limit) todo = todo.slice(0, limit);
  const deadline = Date.now() + budgetSec * 1000;
  const stats = {
    total: companies.length,
    pending: todo.length,
    done: 0,
    empty: 0,
    errors: 0,
    rateLimited: false,
  };
  const errs = [];
  let stop = false;

  await L.pool(
    todo,
    concurrency,
    async (c) => {
      if (stop) return;
      try {
        const res = await stockscans.documents(`NSE:${c.symbol}`);
        const docs = (res && res.documents) || [];
        L.writeJsonAtomic(L.p('listings', `${c.symbol}.json`), {
          companyId: c.companyId,
          fetchedAt: new Date().toISOString(),
          documents: docs,
        });
        stats.done++;
        if (!docs.length) stats.empty++;
      } catch (e) {
        stats.errors++;
        const status = e.response && e.response.status;
        errs.push({
          companyId: c.companyId,
          status: status || null,
          message: String(e.message).slice(0, 160),
        });
        if (status === 429) {
          stop = true;
          stats.rateLimited = true;
        }
      }
      await L.sleep(delayMs);
    },
    deadline
  );
  L.appendJsonl(
    L.p('listings-errors.jsonl'),
    errs.map((e) => ({ ...e, at: new Date().toISOString() }))
  );
  const remaining = companies.filter(
    (c) => !fs.existsSync(L.p('listings', `${c.symbol}.json`))
  ).length;
  console.log(JSON.stringify({ ...stats, remaining }));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
