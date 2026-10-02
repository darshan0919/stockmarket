#!/usr/bin/env node
'use strict';

/**
 * Bulk validation of the Reg-30 event XBRL path.
 *
 *   node scripts/xbrl/validate_events.js --in sample.json --out events.jsonl \
 *        [--days 90] [--concurrency 3] [--limit N] [--resume]
 *
 * One JSON line per company: items per kind, source exchange, parse/endpoint issues, elapsed ms.
 * `--in` has the same shape as validate_results.js (`sample: [{companyId,...}]` or a bare array).
 * Raw filings are cached only under the OS temp dir; nothing is written under data/.
 */

const fs = require('fs');
const { NseClient } = require('../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('../../packages/jobs-runtime/lib/xbrl/issues.js');
const { fetchEventSeries } = require('../../packages/jobs-runtime/lib/xbrl/eventsFetch.js');

function parseArgs(argv) {
  const a = { days: 90, concurrency: 3, limit: 0, resume: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--in') a.in = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--days') a.days = Number(argv[++i]);
    else if (k === '--concurrency') a.concurrency = Number(argv[++i]);
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--resume') a.resume = true;
  }
  return a;
}

const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.in || !a.out) {
    console.error('usage: validate_events.js --in sample.json --out events.jsonl');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(a.in, 'utf8'));
  let list = Array.isArray(raw) ? raw : raw.sample;
  if (a.limit) list = list.slice(0, a.limit);
  const done = new Set();
  if (a.resume && fs.existsSync(a.out)) {
    for (const line of fs.readFileSync(a.out, 'utf8').split('\n')) {
      try {
        done.add(JSON.parse(line).companyId);
      } catch (_) {
        /* partial line */
      }
    }
  }
  const todo = list.filter((c) => !done.has(c.companyId));
  const nse = new NseClient();
  const bse = new BseClient();
  const out = fs.createWriteStream(a.out, { flags: 'a' });
  const to = new Date();
  const from = new Date(to.getTime() - a.days * 86400000);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const c = todo[next++];
      const symbol = c.companyId.replace(/^(NSE|BSE):/i, '').toUpperCase();
      const issues = createIssueLog(`val-events-${symbol}-${Date.now()}`);
      const t0 = Date.now();
      let row;
      try {
        const r = await fetchEventSeries({
          symbol,
          from: dmy(from),
          to: dmy(to),
          limit: 50,
          nse,
          bse,
          issues,
        });
        const kinds = {};
        let total = 0;
        for (const [k, v] of Object.entries(r.kinds)) {
          if (v.items.length) {
            kinds[k] = { n: v.items.length, src: v.exchange };
            total += v.items.length;
          }
        }
        row = {
          companyId: c.companyId,
          total,
          kinds,
          issues: issues.all(),
          summary: issues.summary(),
        };
      } catch (e) {
        row = { companyId: c.companyId, error: e.message, issues: issues.all() };
      }
      row.elapsedMs = Date.now() - t0;
      out.write(JSON.stringify(row) + '\n');
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, a.concurrency) }, worker));
  out.end();
  console.log(JSON.stringify({ companies: todo.length, out: a.out }));
}

if (require.main === module) main();
