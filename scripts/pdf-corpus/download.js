#!/usr/bin/env node
'use strict';

/**
 * Downloads selected documents and appends one manifest row each -> data/pdf-corpus/manifest.jsonl
 *
 *   node --env-file=.env scripts/pdf-corpus/download.js [--type Result] [--concurrency 6]
 *        [--budget-sec 140] [--limit N] [--shard i/n] [--delay-ms 200]
 *
 * Resumable: a docId already in the manifest (or failures with a permanent reason) is skipped.
 * Each PDF is checked (magic bytes, size), hashed (duplicates recorded, not stored twice),
 * stored as pdfs/<type>/<symbol>_<period>_<sha8>.pdf, and classified text / scanned / hybrid from
 * its own text layer. Failures go to failures.jsonl, never silently dropped.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./lib');
const { stockscans } = require('../../stock-api/src/index');
const { withBackoff } = require('../../stock-api/src/utils/bulkFilingScan');

const num = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const str = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : process.argv[i + 1];
};
const typeFilter = str('--type', null);
const concurrency = num('--concurrency', 6);
const budgetSec = num('--budget-sec', 140);
const limit = num('--limit', 0);
const delayMs = num('--delay-ms', 200); // pause after each document, per worker
const shard = str('--shard', null) && {
  i: Number(str('--shard').split('/')[0]),
  n: Number(str('--shard').split('/')[1]),
};
const MIN_BYTES = 5 * 1024;

async function main() {
  const selection = L.readJsonl(L.p('selection.jsonl')).filter(
    (r) => !typeFilter || r.type === typeFilter
  );
  const manifest = L.readJsonl(L.p('manifest.jsonl'));
  const done = new Set(manifest.map((r) => r.docId));
  const shaSeen = new Map(manifest.filter((r) => !r.dupOf).map((r) => [r.sha256, r.docId]));
  const permanentFail = new Set(
    L.readJsonl(L.p('failures.jsonl'))
      .filter((r) => r.permanent)
      .map((r) => r.docId)
  );
  let todo = selection.filter((r) => !done.has(r.docId) && !permanentFail.has(r.docId));
  if (shard) todo = todo.filter((r) => L.bucket(r.docId) % shard.n === shard.i); // parallel workers: disjoint docs
  if (limit) todo = todo.slice(0, limit);
  const deadline = Date.now() + budgetSec * 1000;
  const stats = { pending: todo.length, ok: 0, dup: 0, failed: 0, bytes: 0 };
  // append as each document finishes: a killed/timed-out run must not lose finished work
  const rows = { push: (r) => L.appendJsonl(L.p('manifest.jsonl'), [r]) };
  const fails = {
    push: (f) => L.appendJsonl(L.p('failures.jsonl'), [{ ...f, at: new Date().toISOString() }]),
  };

  await L.pool(
    todo,
    concurrency,
    async (r) => {
      let buf;
      try {
        // 429 / 5xx / network errors: exponential backoff with jitter (Retry-After honoured), never past the run budget.
        buf = await withBackoff(() => stockscans.fetchPdf(stockscans.s3PdfUrl(r.ssUrl), 90000), {
          baseMs: 2000,
          maxMs: 60000,
          maxAttempts: 5,
          canWait: (ms) => Date.now() + ms < deadline + 20000,
        });
      } catch (e) {
        const status = e.response && e.response.status;
        fails.push({
          docId: r.docId,
          reason: `download: ${String(e.message).slice(0, 120)}`,
          status: status || null,
          permanent: status === 404 || status === 403,
        });
        stats.failed++;
        return;
      }
      if (buf.length < MIN_BYTES || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        fails.push({
          docId: r.docId,
          reason: `not a usable PDF (${buf.length} bytes)`,
          permanent: true,
        });
        stats.failed++;
        return;
      }
      const sha = L.sha256(buf);
      const base = {
        docId: r.docId,
        sha256: sha,
        source: 'stockscans',
        sourceUrl: stockscans.s3PdfUrl(r.ssUrl),
        companyId: r.companyId,
        symbol: r.symbol,
        type: r.type,
        period: r.period,
        periodEnd: L.monthEnd(r.period),
        sector: r.sector,
        industry: r.industry,
        family: r.family,
        strata: r.strata,
        split: r.split,
        pick: r.pick,
        bytes: buf.length,
        fetchedAt: new Date().toISOString(),
      };
      if (shaSeen.has(sha)) {
        rows.push({ ...base, dupOf: shaSeen.get(sha) });
        stats.dup++;
        return;
      }
      shaSeen.set(sha, r.docId);
      const rel = path.join(
        'pdfs',
        r.type.replace(/\s/g, ''),
        `${r.symbol}_${r.period}_${sha.slice(0, 8)}.pdf`
      );
      const abs = L.p(rel);
      L.ensureDir(path.dirname(abs));
      // classify a temp copy first: a PDF poppler cannot read is recorded as a permanent failure and never stored
      const tmp = path.join(os.tmpdir(), `pdfcorpus_${sha.slice(0, 16)}.pdf`);
      fs.writeFileSync(tmp, buf);
      const cls = L.classifyPdf(tmp);
      fs.unlinkSync(tmp);
      if (!cls || !(cls.pages > 0)) {
        fails.push({
          docId: r.docId,
          reason: 'unreadable PDF (poppler could not open it)',
          permanent: true,
        });
        stats.failed++;
        return;
      }
      fs.writeFileSync(abs, buf);
      rows.push({ ...base, file: rel, ...cls });
      stats.ok++;
      stats.bytes += buf.length;
      await L.sleep(delayMs);
    },
    deadline
  );
  const total = L.readJsonl(L.p('manifest.jsonl')).length;
  console.log(
    JSON.stringify({
      ...stats,
      mb: +(stats.bytes / 1048576).toFixed(1),
      manifestRows: total,
      remaining: selection.length - total,
    })
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
