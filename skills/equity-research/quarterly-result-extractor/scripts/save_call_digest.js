#!/usr/bin/env node
'use strict';

/**
 * History pack, step B (script, zero LLM): validate, quote-verify and persist ONE agent-written
 * concall digest as a `concall-digest` report.
 *
 * Exit codes: 0 saved · 2 schema errors · 3 quote verification failed (fix the quotes —
 * every `quote` must be copied verbatim from the transcript) · 4 transcript text unavailable.
 * Nothing is saved unless every quote is found in the transcript text.
 *
 * Usage:
 *   yarn quarterly-result-extractor:save-digest --companyId NSE:X --quarter 202606 \
 *     --digest /tmp/NSE_X_qrh/202606_digest.json --model <exact model id>
 */
const fs = require('fs');
const { loadEnv, argValue } = require('../../../../packages/jobs-runtime/lib/env');
const { resolveJobName } = require('../../../../packages/jobs-runtime/lib/scriptJobName');
const db = require('../../../../packages/jobs-runtime/lib/db');
const {
  stockscansFor,
  resolveCompany,
  transcriptText,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/runtime');
const {
  validateDigest,
  verifyDigest,
  buildDigestRecord,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/callDigest');

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const raw = argValue('--companyId', process.argv);
  const quarter = argValue('--quarter', process.argv);
  const file = argValue('--digest', process.argv);
  const modelUsed = argValue('--model', process.argv);
  if (!raw || !quarter || !file || !modelUsed) {
    console.error(
      'Usage: save_call_digest.js --companyId NSE:X --quarter YYYYMM --digest <file> --model <model>'
    );
    process.exit(1);
  }
  const digest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = validateDigest(digest);
  if (errors.length) {
    console.log(JSON.stringify({ ok: false, stage: 'schema', errors }, null, 2));
    process.exit(2);
  }

  const client = stockscansFor(resolveJobName('quarterly-result-extractor'));
  const c = await resolveCompany(client, raw, { targetQuarter: quarter });
  const doc = c.docList.find(
    (d) => d.documentType === 'Transcript' && String(d.date) === quarter && d.ssUrl
  );
  const t = doc ? await transcriptText(client, c.companyId, doc) : null;
  if (!t || !t.text) {
    console.log(
      JSON.stringify({ ok: false, stage: 'text', error: (t && t.error) || 'no transcript' })
    );
    process.exit(4);
  }

  const verification = verifyDigest(digest, t.text);
  if (verification.status !== 'pass') {
    console.log(JSON.stringify({ ok: false, stage: 'verify', verification }, null, 2));
    process.exit(3);
  }

  const id = db.saveReport(
    buildDigestRecord({
      companyId: c.companyId,
      quarter,
      transcript: { ssUrl: doc.ssUrl, date: String(doc.date) },
      digest,
      verification,
      modelUsed,
    })
  );
  console.log(JSON.stringify({ ok: true, id, verification }, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
