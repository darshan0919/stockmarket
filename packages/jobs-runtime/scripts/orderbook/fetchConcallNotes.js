#!/usr/bin/env node
'use strict';

/**
 * fetchConcallNotes.js — DB-first fetch of Stockscans concall notes for the
 * order-book extraction pipeline (skills/equity-research/order-book-extractor,
 * planned). Checks packages/jobs-runtime/lib/concallNotesStore.js (permanent,
 * per-quarter cache — never expires) before calling the Stockscans
 * concall-notes API, which is capped at 600 calls/month for this account.
 *
 * Usage:
 *   node fetchConcallNotes.js <TICKER> [--last-n N] [--quarter YYYYMM] [--force] [--env-file <path>]
 *
 * <TICKER> e.g. NSE:SANSERA. --last-n N (default 1) fetches the N most recent
 * quarters that have hasNotes:true on the documents endpoint. --quarter pins
 * one specific YYYYMM. --force bypasses the store and refetches (only useful
 * if Stockscans re-annotates an existing transcript, which is rare).
 *
 * Prints a JSON summary to stdout: [{companyId, date, fromCache, hasReport}]
 */

const { loadEnv, argValue } = require('../../lib/env');
loadEnv(argValue('--env-file'));
const store = require('../../lib/concallNotesStore');
const { stockscans } = require('@stock/api');

function parseArgs(argv) {
  const ticker = argv[2];
  if (!ticker || ticker.startsWith('--')) {
    throw new Error('Usage: fetchConcallNotes.js <TICKER> [--last-n N] [--quarter YYYYMM] [--force]');
  }
  const lastN = argValue('--last-n', argv) ? parseInt(argValue('--last-n', argv), 10) : 1;
  const quarter = argValue('--quarter', argv);
  const force = argv.includes('--force');
  return { ticker, lastN, quarter, force };
}

/** Resolve the list of Transcript documents to fetch (with hasNotes:true), newest first. */
async function resolveTargets(companyId, { lastN, quarter }) {
  const { documents } = await stockscans.documents(companyId);
  let transcripts = (documents || []).filter((d) => d.documentType === 'Transcript' && d.ssUrl && d.hasNotes);
  transcripts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (quarter) return transcripts.filter((d) => d.date === quarter);
  return transcripts.slice(0, lastN);
}

async function fetchOne(companyId, doc, { force }) {
  if (!force && store.has(companyId, doc.date)) {
    return { companyId, date: doc.date, fromCache: true, hasReport: !!store.get(companyId, doc.date).finalReport };
  }
  const cn = await stockscans.concallNotes(companyId, doc.ssUrl);
  store.save(companyId, doc.date, {
    documentType: 'Transcript',
    ssUrl: doc.ssUrl,
    finalReport: cn.finalReport,
    companyName: cn.companyName,
    source: 'live',
  });
  return { companyId, date: doc.date, fromCache: false, hasReport: !!cn.finalReport };
}

async function main() {
  const { ticker, lastN, quarter, force } = parseArgs(process.argv);
  const targets = await resolveTargets(ticker, { lastN, quarter });
  if (!targets.length) {
    process.stdout.write(JSON.stringify({ companyId: ticker, results: [], note: 'no Transcript with hasNotes:true found for this ticker/quarter' }, null, 2) + '\n');
    return;
  }
  const results = [];
  for (const doc of targets) {
    process.stderr.write(`[fetchConcallNotes] ${ticker} ${doc.date} ...\n`);
    results.push(await fetchOne(ticker, doc, { force }));
  }
  process.stdout.write(JSON.stringify({ companyId: ticker, results }, null, 2) + '\n');
}

module.exports = { main, resolveTargets, fetchOne };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
