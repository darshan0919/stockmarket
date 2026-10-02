#!/usr/bin/env node
'use strict';

/**
 * Coverage check for the non-results XBRL kinds (shareholding, voting, governance, brsr).
 *   node scripts/xbrl/validate_filings.js --in sample.json --out filings.jsonl [--limit N] [--resume]
 * One JSON line per company and kind: source exchange, item count, issues. Nothing is written
 * under data/.
 */

const fs = require('fs');
const { NseClient } = require('../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('../../packages/jobs-runtime/lib/xbrl/issues.js');
const { fetchFilingSeries } = require('../../packages/jobs-runtime/lib/xbrl/filingsFetch.js');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k === '--resume') args.resume = true;
  else args[k.replace(/^--/, '')] = process.argv[++i];
}
const KINDS = ['shareholding', 'voting', 'governance', 'brsr'];

(async () => {
  const raw = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  let list = Array.isArray(raw) ? raw : raw.sample;
  if (args.limit) list = list.slice(0, Number(args.limit));
  const done = new Set();
  if (args.resume && fs.existsSync(args.out))
    for (const l of fs.readFileSync(args.out, 'utf8').split('\n').filter(Boolean)) {
      const j = JSON.parse(l);
      done.add(`${j.companyId}|${j.kind}`);
    }
  const nse = new NseClient();
  const bse = new BseClient();
  for (const e of list)
    for (const kind of KINDS) {
      if (done.has(`${e.companyId}|${kind}`)) continue;
      const symbol = e.companyId.replace(/^(NSE|BSE):/i, '').toUpperCase();
      const issues = createIssueLog(`f-${symbol}-${kind}`);
      const t0 = Date.now();
      const rec = { companyId: e.companyId, sector: e.sector, kind };
      try {
        const r = await fetchFilingSeries({
          kind,
          symbol,
          limit: kind === 'brsr' ? 2 : 2,
          nse,
          bse,
          issues,
        });
        rec.exchange = r.exchange;
        rec.items = r.items.length;
      } catch (err) {
        rec.crash = err.message;
      }
      rec.issues = issues.all();
      rec.elapsedMs = Date.now() - t0;
      fs.appendFileSync(args.out, JSON.stringify(rec) + '\n');
    }
})();
