#!/usr/bin/env node
'use strict';

/**
 * Bulk filing scan CLI — list filings of chosen announcement types for MANY
 * companies × MANY release quarters via a throwaway watchlist, with
 * exponential backoff and resumable checkpoints. Logic lives in
 * `src/utils/bulkFilingScan.js`; full guide in `docs/BULK_FILING_SCAN.md`.
 *
 * Usage (via the facade):
 *   yarn workspace @stock/api bulk-filing-scan --companies-file <ids> --out <dir> \
 *     --types "Financial Results,Presentation" --from 202509 --to 202609
 *   yarn workspace @stock/api bulk-filing-scan --out <dir> --cleanup   # delete leftover watchlists
 *
 * Flags:
 *   --companies-file  .jsonl (rows with companyId) | .json (array) | .txt (one id per line)
 *   --companies       comma-separated 'NSE:SYM' ids (alternative to the file)
 *   --types           comma list, or 'all' (see FILING_TYPES)
 *   --quarters        comma list of release-quarter keys YYYYMM, or --from/--to
 *   --out             output dir (rows.jsonl, state.json, errors.jsonl)
 *   --watchlist-size  companies per throwaway watchlist (default 500)
 *   --budget-sec      stop cleanly after N seconds; re-run resumes (default 0 = none)
 *   --delay-ms        base gap between page calls (default 800; auto-widens on 429)
 *   --keep-raw        keep the original API row under `raw`
 *   --probe           one request (first type, newest quarter, first 10 companies) and print it
 *   --cleanup         delete watchlists recorded in state.json and exit
 */

const fs = require('fs');
const path = require('path');
const { HttpClient } = require('../src/http/HttpClient');
const { StockscansClient } = require('../src/clients/StockscansClient.js');
const {
  FILING_TYPES,
  expandQuarters,
  runBulkScan,
  cleanupWatchlists,
  scanUnit,
  withBackoff,
} = require('../src/utils/bulkFilingScan.js');

const ASSETS_BASE = 'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[k] = true;
    else {
      a[k] = next;
      i++;
    }
  }
  return a;
}

function loadCompanyIds(args) {
  if (args.companies && args.companies !== true)
    return args.companies
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const f = args['companies-file'];
  if (!f || f === true) throw new Error('need --companies-file or --companies');
  const text = fs.readFileSync(f, 'utf8');
  let ids;
  if (f.endsWith('.jsonl'))
    ids = text
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).companyId);
  else if (f.endsWith('.json'))
    ids = JSON.parse(text).map((x) => (typeof x === 'string' ? x : x.companyId));
  else
    ids = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  return [...new Set(ids.filter(Boolean))];
}

async function main(argv) {
  const args = parseArgs(argv);
  if (!args.out || args.out === true) throw new Error('--out <dir> is required');
  const outDir = path.resolve(args.out);
  // max429Retries: 0 — this tool owns the backoff so it can widen its pace and stop cleanly.
  const client = new StockscansClient({
    http: new HttpClient({ timeout: 30000, max429Retries: 0 }),
  });
  const log = (m) => process.stderr.write(`[bulk-filing-scan] ${m}\n`);

  // A killed run (timeout, Ctrl-C) must not leave throwaway watchlists in the user's account.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => {
      cleanupWatchlists(client, outDir, { log }).finally(() => process.exit(130));
    });
  }

  if (args.cleanup) {
    const left = await cleanupWatchlists(client, outDir, { log });
    console.log(JSON.stringify({ watchlistsLeft: left }));
    return 0;
  }

  const companyIds = loadCompanyIds(args);
  const types =
    !args.types || args.types === 'all' ? FILING_TYPES : args.types.split(',').map((s) => s.trim());
  const quarters = args.quarters ? args.quarters.split(',') : expandQuarters(args.from, args.to);

  if (args.probe) {
    const ids = companyIds.slice(0, 10);
    const created = await withBackoff(() =>
      client.createWatchlist(`__bulk_scan_probe_${Date.now()}`, ids)
    );
    try {
      const res = await scanUnit(
        client,
        { watchlistId: created.watchlistId, type: types[0], quarterDate: quarters[0], maxPages: 1 },
        {}
      );
      console.log(
        JSON.stringify(
          {
            type: types[0],
            quarter: quarters[0],
            rows: res.rows.length,
            sample: res.rows.slice(0, 2),
          },
          null,
          1
        )
      );
    } finally {
      await client
        .deleteWatchlist(created.watchlistId)
        .catch((e) => log(`probe watchlist delete failed: ${e.message}`));
    }
    return 0;
  }

  const summary = await runBulkScan({
    client,
    companyIds,
    types,
    quarters,
    outDir,
    watchlistSize: Number(args['watchlist-size'] || 500),
    budgetSec: Number(args['budget-sec'] || 0),
    delayMs: Number(args['delay-ms'] || 800),
    keepRaw: Boolean(args['keep-raw']),
    assetsBase: ASSETS_BASE,
    log,
  });
  console.log(JSON.stringify({ companies: companyIds.length, types, quarters, ...summary }));
  return summary.stopped === 'blocked' ? 2 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[bulk-filing-scan] ${err.stack || err.message}\n`);
      process.exit(1);
    }
  );
}

module.exports = { parseArgs, loadCompanyIds, main };
