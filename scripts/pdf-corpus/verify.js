#!/usr/bin/env node
'use strict';

/**
 * Corpus readiness gate -> prints a JSON report, exit 1 if a hard bar fails.
 *
 *   node scripts/pdf-corpus/verify.js [--lock]
 *
 * Hard bars (integrity): unique docIds, no duplicate sha256 among stored files, every stored file
 * exists with the recorded size and a page count, files on disk == stored manifest rows, splits
 * disjoint by company, every XBRL-backed Result has a truth row (ok, or an explicit 'not-found').
 * Stratum bars (coverage, docs/PDF_OCR_EXTRACTION_PLAN.md §3c): reported with their shortfall;
 * they fail the gate too, so "ready" means the minimums are met, not just that files are intact.
 * `--lock` writes splits.lock.json (hash of the sorted test-split docIds) once everything passes;
 * an existing lock is verified, never overwritten.
 */

const fs = require('fs');
const path = require('path');
const L = require('./lib');

const MIN = {
  Result: 2000,
  PPT: 300,
  Transcript: 200,
  'Annual Report': 150,
  'Board Outcome': 300,
  Order: 300,
  'Promoter Reg31': 300,
  'Credit Rating': 300,
  KMP: 300,
  MnA: 300,
  'Fund Raising': 200,
  'Press Release': 200,
};
const MIN_SCANNED_OR_HYBRID_RESULTS = 300;

const walk = (d) =>
  fs.existsSync(d)
    ? fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
    : [];

// quarantine.jsonl: {docId?, file?, reason} rows for corrupt/orphan files that cannot be deleted from the
// connected folder; they are excluded from every count and from scoring, and listed in the report.
const quarantine = L.readJsonl(L.p('quarantine.jsonl'));
const qDocs = new Set(quarantine.filter((q) => q.docId).map((q) => q.docId));
const qFiles = new Set(quarantine.filter((q) => q.file).map((q) => q.file));
const manifest = L.readJsonl(L.p('manifest.jsonl')).filter((r) => !qDocs.has(r.docId));
const stored = manifest.filter((r) => !r.dupOf);
const hard = {};
const fail = (k, detail) => (hard[k] = detail);

const ids = new Set();
const dupIds = manifest.filter((r) => (ids.has(r.docId) ? true : (ids.add(r.docId), false)));
if (dupIds.length) fail('duplicateDocIds', dupIds.length);

const bySha = new Map();
for (const r of stored) bySha.set(r.sha256, (bySha.get(r.sha256) || 0) + 1);
const dupSha = [...bySha.values()].filter((n) => n > 1).length;
if (dupSha) fail('duplicateSha256', dupSha);

const bad = [];
for (const r of stored) {
  const f = L.p(r.file);
  if (!fs.existsSync(f) || fs.statSync(f).size !== r.bytes || !(r.pages > 0)) bad.push(r.docId);
}
if (bad.length) fail('unreadableOrMissingFiles', { count: bad.length, sample: bad.slice(0, 5) });

const onDisk = walk(L.p('pdfs')).filter(
  (f) => !qFiles.has(path.relative(L.CORPUS_DIR, f).split(path.sep).join('/'))
).length;
if (onDisk !== stored.length)
  fail('filesOnDiskVsManifest', { onDisk, manifestStored: stored.length });

const splitOf = new Map();
for (const r of manifest) {
  if (splitOf.has(r.companyId) && splitOf.get(r.companyId) !== r.split)
    fail('splitsNotDisjoint', r.companyId);
  splitOf.set(r.companyId, r.split);
}

const universe = new Map(L.readJsonl(L.p('universe.jsonl')).map((u) => [u.companyId, u]));
const truth = new Map();
for (const t of L.readJsonl(L.p('truth.jsonl')))
  if (!truth.has(t.docId) || t.ok || !truth.get(t.docId).ok) truth.set(t.docId, t);
const results = stored.filter((r) => r.type === 'Result');
const needsTruth = results.filter((r) => {
  const u = universe.get(r.companyId);
  return u && u.xbrlOk && !u.truthExcluded && r.periodEnd;
});
const truthStats = { needed: needsTruth.length, withValues: 0, notFound: 0, missing: 0 };
for (const r of needsTruth) {
  const t = truth.get(r.docId);
  if (!t) truthStats.missing++;
  else if (t.ok && t.is) truthStats.withValues++;
  else if (t.reason === 'not-found') truthStats.notFound++;
  else truthStats.missing++;
}
if (truthStats.missing) fail('resultsWithoutTruthRow', truthStats.missing);

const counts = {};
for (const r of stored) counts[r.type] = (counts[r.type] || 0) + 1;
const shortfall = {};
for (const [t, min] of Object.entries(MIN))
  if ((counts[t] || 0) < min) shortfall[t] = { have: counts[t] || 0, need: min };
const scannedOrHybrid = results.filter((r) => r.form !== 'text').length;
if (scannedOrHybrid < MIN_SCANNED_OR_HYBRID_RESULTS)
  shortfall['Result scanned+hybrid'] = {
    have: scannedOrHybrid,
    need: MIN_SCANNED_OR_HYBRID_RESULTS,
  };

const sectors = new Set(results.map((r) => r.sector));
const testIds = stored
  .filter((r) => r.split === 'test')
  .map((r) => r.docId)
  .sort();
const testHash = L.sha256(Buffer.from(testIds.join('\n')));

const ok = !Object.keys(hard).length && !Object.keys(shortfall).length;
const lockFile = L.p('splits.lock.json');
let lock = 'not written';
if (fs.existsSync(lockFile)) {
  const prev = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const testCompanies = new Set(stored.filter((r) => r.split === 'test').map((r) => r.companyId));
  const prevCompanies = new Set(prev.testCompanies);
  const leaked = [...prevCompanies].filter((c) => splitOf.get(c) !== 'test');
  lock = leaked.length
    ? `BROKEN: ${leaked.length} locked test companies moved split`
    : `ok (locked ${prev.lockedAt}; test companies ${testCompanies.size}, locked ${prevCompanies.size})`;
  if (leaked.length) fail('lockedTestSplitChanged', leaked.length);
} else if (process.argv.includes('--lock') && ok) {
  const testCompanies = [
    ...new Set(stored.filter((r) => r.split === 'test').map((r) => r.companyId)),
  ].sort();
  L.writeJsonAtomic(lockFile, {
    lockedAt: new Date().toISOString(),
    testDocs: testIds.length,
    testDocIdsSha256: testHash,
    testCompanies,
  });
  lock = 'written';
}

console.log(
  JSON.stringify(
    {
      ready: ok && !String(lock).startsWith('BROKEN'),
      hardFailures: hard,
      stratumShortfall: shortfall,
      counts,
      storedFiles: stored.length,
      duplicateRowsRecorded: manifest.length - stored.length,
      resultForms: { text: results.length - scannedOrHybrid, scannedOrHybrid },
      resultSectors: sectors.size,
      resultCompanies: new Set(results.map((r) => r.companyId)).size,
      truth: truthStats,
      splits: {
        train: new Set(stored.filter((r) => r.split === 'train').map((r) => r.companyId)).size,
        dev: new Set(stored.filter((r) => r.split === 'dev').map((r) => r.companyId)).size,
        test: new Set(stored.filter((r) => r.split === 'test').map((r) => r.companyId)).size,
      },
      quarantined: quarantine.length,
      lock,
    },
    null,
    1
  )
);
process.exit(ok && !String(lock).startsWith('BROKEN') ? 0 : 1);
