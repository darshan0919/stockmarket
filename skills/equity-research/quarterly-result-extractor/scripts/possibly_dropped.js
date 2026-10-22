#!/usr/bin/env node
'use strict';

/**
 * Post mode, Step 3 seed (script, zero LLM): topics the company discussed on its prior calls
 * (history pack `narrative`) whose keywords are absent from this quarter's transcript.
 * A seed, not a verdict — the excerpt pass confirms each before it becomes `possiblyDropped`.
 *
 * Usage:
 *   yarn quarterly-result-extractor:possibly-dropped --companyId NSE:X [--quarter YYYYMM] [--lookback 3]
 */
const { loadEnv, argValue } = require('../../../../packages/jobs-runtime/lib/env');
const { resolveJobName } = require('../../../../packages/jobs-runtime/lib/scriptJobName');
const db = require('../../../../packages/jobs-runtime/lib/db');
const {
  stockscansFor,
  resolveCompany,
  transcriptText,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/runtime');
const { quarterEndIso } = require('../../../../packages/jobs-runtime/lib/resultHistory/period');
const {
  REPORT_TYPE,
  possiblyDroppedTopics,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/historyPack');

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const raw = argValue('--companyId', process.argv);
  if (!raw) {
    console.error('Usage: possibly_dropped.js --companyId NSE:X [--quarter YYYYMM] [--lookback 3]');
    process.exit(1);
  }
  const client = stockscansFor(resolveJobName('quarterly-result-extractor'));
  const c = await resolveCompany(client, raw, {
    targetQuarter: argValue('--quarter', process.argv),
  });
  const packIdx = (
    db.find('reports', {
      type: REPORT_TYPE,
      companyId: c.companyId,
      date: quarterEndIso(c.targetQuarter),
    }) || []
  ).pop();
  const pack = packIdx ? db.readReport(packIdx.id) : null;
  const doc = c.docList.find(
    (d) => d.documentType === 'Transcript' && String(d.date) === c.targetQuarter && d.ssUrl
  );
  if (!pack || !doc) {
    console.log(
      JSON.stringify({ ok: false, reason: !pack ? 'no history pack' : 'no current transcript' })
    );
    return;
  }
  const t = await transcriptText(client, c.companyId, doc);
  console.log(
    JSON.stringify(
      {
        ok: true,
        packId: pack.id,
        targetQuarter: c.targetQuarter,
        possiblyDropped: possiblyDroppedTopics(
          pack.narrative,
          t.text,
          Number(argValue('--lookback', process.argv) || 3)
        ),
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
