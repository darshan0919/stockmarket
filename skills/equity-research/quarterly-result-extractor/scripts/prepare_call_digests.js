#!/usr/bin/env node
'use strict';

/**
 * History pack, step A (script, zero LLM): list the concall transcripts that still need a
 * `concall-digest`, and stage their full text for the agent.
 *
 * History = the last `--depth` transcripts strictly before the target quarter. In post mode
 * (target result already filed) the target quarter's own call is listed too (`role: current`),
 * so this quarter's reading becomes next quarter's history without being redone.
 *
 * Usage:
 *   yarn quarterly-result-extractor:pending-digests --companyId NSE:X --out-dir /tmp/NSE_X_qrh \
 *     [--quarter YYYYMM | --date YYYY-MM-DD] [--depth 4]
 *
 * Output (stdout, JSON): {companyId, mode, targetQuarter, existing[], pending[{quarter, role,
 * ssUrl, docDate, textPath, chars, scanned, error}]}. Digest each `pending` entry per
 * references/call_digest.md, then save it with `save_call_digest.js`.
 */
const fs = require('fs');
const path = require('path');
const { loadEnv, argValue } = require('../../../../packages/jobs-runtime/lib/env');
const { resolveJobName } = require('../../../../packages/jobs-runtime/lib/scriptJobName');
const db = require('../../../../packages/jobs-runtime/lib/db');
const {
  stockscansFor,
  resolveCompany,
  transcriptText,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/runtime');
const { docsBefore } = require('../../../../packages/jobs-runtime/lib/resultHistory/period');
const { listDigests } = require('../../../../packages/jobs-runtime/lib/resultHistory/callDigest');

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const raw = argValue('--companyId', process.argv);
  const outDir = argValue('--out-dir', process.argv);
  if (!raw || !outDir) {
    console.error(
      'Usage: prepare_call_digests.js --companyId NSE:X --out-dir <dir> [--quarter YYYYMM | --date YYYY-MM-DD] [--depth 4]'
    );
    process.exit(1);
  }
  const depth = Number(argValue('--depth', process.argv) || 4);
  const client = stockscansFor(resolveJobName('quarterly-result-extractor'));
  const c = await resolveCompany(client, raw, {
    targetQuarter: argValue('--quarter', process.argv),
    date: argValue('--date', process.argv),
  });

  const wanted = docsBefore(c.docList, 'Transcript', c.targetQuarter, depth).map((d) => ({
    doc: d,
    role: 'history',
  }));
  if (c.mode === 'post') {
    const cur = c.docList.find(
      (d) => d.documentType === 'Transcript' && String(d.date) === c.targetQuarter && d.ssUrl
    );
    if (cur) wanted.unshift({ doc: cur, role: 'current' });
  }

  const done = new Map(
    listDigests(db, c.companyId)
      .filter((d) => d.verification && d.verification.status === 'pass')
      .map((d) => [String(d.quarter), d.id])
  );
  fs.mkdirSync(outDir, { recursive: true });
  const existing = [];
  const pending = [];
  for (const { doc, role } of wanted) {
    const quarter = String(doc.date);
    if (done.has(quarter)) {
      existing.push({ quarter, role, id: done.get(quarter) });
      continue;
    }
    const t = await transcriptText(client, c.companyId, doc);
    const textPath = path.join(outDir, `${quarter}_transcript.txt`);
    if (t.text) fs.writeFileSync(textPath, t.text);
    pending.push({
      quarter,
      role,
      ssUrl: doc.ssUrl,
      docDate: String(doc.date),
      textPath: t.text ? textPath : null,
      chars: t.chars,
      scanned: !!t.scanned,
      error: t.error || null,
    });
  }

  console.log(
    JSON.stringify(
      {
        companyId: c.companyId,
        mode: c.mode,
        targetQuarter: c.targetQuarter,
        latestFiledQuarter: c.latestFiledQuarter,
        depth,
        existing,
        pending,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
