#!/usr/bin/env node
'use strict';

/**
 * preprocessPersist.js — the ONLY supported way to store a Filing Extract.
 *
 * Reads one or more extract JSON objects on stdin (a single object, or an array),
 * runs L1 + L2 verification against the document's own cached text, and persists
 * through `lib/docExtracts.js`. Exists so the extracting agent never writes into
 * `data/cache/doc-extracts/` directly: a hand-written file would bypass the
 * verifier, and an unverified extract is exactly the artifact the design exists
 * to prevent (plan §2). `docExtracts.put()` also refuses one, so this is a
 * convenience over a guard rather than the guard itself.
 *
 * Usage:
 *   cat extracts.json | yarn preprocess:persist
 *   yarn preprocess:persist --file extracts.json
 *
 * Each input object: {profile, sourceUrl, companyId?, announcementId?,
 *                     documentDate?, runnerModel?, data, missing?}
 * or {profile, sourceUrl, error: 'unreadable'} for a document that would not read.
 */

const fs = require('fs');
const { argValue } = require('./lib/env');
const docExtracts = require('./lib/docExtracts');
const { verifyExtract } = require('./lib/verifyExtract');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function main() {
  const file = argValue('--file', process.argv);
  const raw = file ? fs.readFileSync(file, 'utf8') : readStdin();
  if (!raw.trim()) throw new Error('no input — pipe extract JSON on stdin or pass --file');

  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : [parsed];

  const results = [];
  const summary = { stored: 0, rejected: 0, unreadable: 0, lowConfidence: 0, l1Skipped: 0 };

  for (const item of items) {
    if (!item || !item.profile || !item.sourceUrl) {
      throw new Error('each extract needs {profile, sourceUrl}');
    }

    // An unreadable document is recorded as a fact, not dropped. "We tried and
    // the PDF has no text layer" and "nobody looked" are different states, and
    // only the first one is safe to reason from — the same distinction the
    // Stockscans context cache draws between an empty report and a failed fetch.
    if (item.error === 'unreadable') {
      const rec = {
        ...item,
        data: {},
        verification: {
          l1: { status: 'no_quotes', reason: 'unreadable' },
          l2: { status: 'pass', issues: [] },
        },
        confidence: 'low',
      };
      const { path: p } = docExtracts.put(item.profile, item.sourceUrl, rec);
      summary.unreadable += 1;
      results.push({ sourceUrl: item.sourceUrl, status: 'unreadable', path: p });
      continue;
    }

    const verified = verifyExtract(item, { sourceUrl: item.sourceUrl });
    const { path: p, rejected } = docExtracts.put(item.profile, item.sourceUrl, verified);

    if (rejected) summary.rejected += 1;
    else summary.stored += 1;
    if (verified.confidence === 'low') summary.lowConfidence += 1;
    if (verified.verification.l1.status === 'skipped') summary.l1Skipped += 1;

    results.push({
      sourceUrl: item.sourceUrl,
      profile: item.profile,
      status: rejected ? 'REJECTED' : 'stored',
      l1: verified.verification.l1.status,
      l2: verified.verification.l2.status,
      confidence: verified.confidence,
      unmatchedQuotes: verified.verification.l1.unmatched || [],
      boundIssues: verified.verification.l2.issues || [],
      path: p,
    });
  }

  const checked = summary.stored + summary.rejected;
  process.stdout.write(
    JSON.stringify(
      {
        ...summary,
        // The number to watch run-over-run. Under 1% is healthy; a rising rate is
        // the earliest signal of prompt regression, and it is far cheaper to
        // notice here than in a digest three weeks later.
        l1RejectionRatePct: checked
          ? Number(((summary.rejected / checked) * 100).toFixed(2))
          : null,
        results,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[preprocess-persist] fatal: ${e.message}\n`);
    process.exit(1);
  }
}
