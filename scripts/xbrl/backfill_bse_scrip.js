#!/usr/bin/env node
'use strict';
/**
 * Backfill `bseScripCode` on NSE company records that lack it (see lib/bseScripBackfill.js for the
 * wrong-company rule). companyMasterSync runs the same routine on every sync; use this script for a
 * one-off or a dry run.
 *
 *   node scripts/xbrl/backfill_bse_scrip.js [--limit N] [--apply] [--out report.jsonl] [--retry-days N]
 * Dry-run by default. --apply upserts through lib/db.js (atomic, locked).
 */
const fs = require('fs');
const path = require('path');
const db = require('../../packages/jobs-runtime/lib/db');
const {
  backfillBseScrips,
  loadChecks,
  saveChecks,
} = require('../../packages/jobs-runtime/lib/bseScripBackfill');
const { BseClient } = require('../../stock-api/src/clients/BseClient');

function args(argv) {
  const o = { limit: 100000, apply: false, out: null, retryDays: 30, delayMs: 120, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') o.limit = Number(argv[++i]);
    else if (argv[i] === '--apply') o.apply = true;
    else if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--retry-days') o.retryDays = Number(argv[++i]);
    else if (argv[i] === '--delay-ms') o.delayMs = Number(argv[++i]);
    else if (argv[i] === '--concurrency') o.concurrency = Number(argv[++i]);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const raw = db.loadFile(db.collectionFile('companies'));
  const records = Array.isArray(raw) ? raw : Object.values(raw);
  const out = o.out ? fs.createWriteStream(path.resolve(o.out)) : null;
  // Batches of 150 with a flush after each, so an interrupted run keeps its progress.
  const BATCH = 150;
  const total = { candidates: 0, accepted: 0, mismatch: 0, notFound: 0, error: 0 };
  let checks = loadChecks();
  let written = { inserted: 0, updated: 0, unchanged: 0 };
  let remaining = o.limit;
  while (remaining > 0) {
    const r = await backfillBseScrips({
      records,
      checks,
      bse: new BseClient(),
      limit: Math.min(BATCH, remaining),
      retryDays: o.retryDays,
      delayMs: o.delayMs,
      concurrency: o.concurrency,
      onRow: (row) => {
        if (out) out.write(JSON.stringify(row) + '\n');
        else if (row.status !== 'OK') console.log(JSON.stringify(row));
      },
    });
    if (!r.stats.candidates) break;
    for (const k of Object.keys(total)) total[k] += r.stats[k];
    checks = r.checks;
    if (o.apply) {
      if (r.updates.length) {
        const w = db.upsertMany('companies', r.updates);
        for (const k of Object.keys(written)) written[k] += w[k] || 0;
        // keep the in-memory copy consistent so accepted ids are not candidates again
        for (const u of r.updates) {
          const rec = records.find((x) => x.id === u.id);
          if (rec) rec.bseScripCode = u.bseScripCode;
        }
      }
      saveChecks(checks);
    }
    remaining -= r.stats.candidates;
    if (r.stats.error === r.stats.candidates) break; // endpoint down: stop instead of hammering
  }
  if (out) out.end();
  console.log(JSON.stringify({ ...total, applied: o.apply, written: o.apply ? written : null }));
}

if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
