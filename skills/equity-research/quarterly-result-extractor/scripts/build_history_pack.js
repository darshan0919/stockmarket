#!/usr/bin/env node
'use strict';

/**
 * History pack, step C (script, zero LLM): assemble and persist the `quarterly-result-history`
 * report for one company's target quarter — everything quarterly-result-analysis needs about
 * the past (prior-guidance ledger, tone/topic arc, one-off recurrence, known catalysts, prior
 * verdicts and checklist, 12Q financials, filings since the last result, pre-result price
 * action), so the result-day run only reasons about what is new.
 *
 * Reasoning inputs come only from verified `concall-digest` reports (steps A/B); transcripts
 * still lacking one are listed in `digestCoverage.pending` — digest them and re-run. Saved with
 * `date` = target quarter end, so re-runs for the same quarter upsert one record.
 *
 * Usage:
 *   yarn quarterly-result-extractor:build-pack --companyId NSE:X
 *     [--quarter YYYYMM | --date YYYY-MM-DD] [--as-of YYYY-MM-DD] [--depth 4]
 */
const { loadEnv, argValue } = require('../../../../packages/jobs-runtime/lib/env');
const { resolveJobName } = require('../../../../packages/jobs-runtime/lib/scriptJobName');
const db = require('../../../../packages/jobs-runtime/lib/db');
const tax = require('../../../../packages/jobs-runtime/lib/announcementTaxonomy');
const concallNotesStore = require('../../../../packages/jobs-runtime/lib/concallNotesStore');
const apiUsageTracker = require('../../../../packages/jobs-runtime/lib/apiUsageTracker');
const { NseClient } = require('../../../../stock-api/src/clients/NseClient');
const { getCompanyFinancials } = require('../../../../stock-api/src/analyzers/companyFinancials');
const {
  stockscansFor,
  resolveCompany,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/runtime');
const {
  docsBefore,
  quarterEndIso,
  shiftQuarter,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/period');
const { listDigests } = require('../../../../packages/jobs-runtime/lib/resultHistory/callDigest');
const {
  assembleHistoryPack,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/historyPack');
const {
  analyzePreResultPriceAction,
  toNseDate,
  fetchAnnouncementsSince,
  classifyFilings,
  concallGuidanceHistory,
  priorAnalyses,
} = require('../../../../packages/jobs-runtime/lib/resultHistory/inputs');

/** Every DTO of `type` for a company, full bodies. */
function loadAll(type, companyId) {
  return (db.find('reports', { type, companyId }) || []).map((r) => db.readReport(r.id) || r);
}

/** Run one gatherer; a failure is recorded, never fatal (the pack says what is missing). */
async function safe(errors, label, fn) {
  try {
    return await fn();
  } catch (e) {
    errors.push({ source: label, message: String((e && e.message) || e).slice(0, 300) });
    return null;
  }
}

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const raw = argValue('--companyId', process.argv);
  if (!raw) {
    console.error(
      'Usage: build_history_pack.js --companyId NSE:X [--quarter YYYYMM | --date YYYY-MM-DD] [--as-of YYYY-MM-DD] [--depth 4]'
    );
    process.exit(1);
  }
  const jobName = resolveJobName('quarterly-result-extractor');
  const client = stockscansFor(jobName);
  const asOf = argValue('--as-of', process.argv) || new Date().toISOString().slice(0, 10);
  const depth = Number(argValue('--depth', process.argv) || 4);
  const c = await resolveCompany(client, raw, {
    targetQuarter: argValue('--quarter', process.argv),
    date: argValue('--date', process.argv),
  });
  const { companyId, targetQuarter } = c;
  const errors = [];

  const history = docsBefore(c.docList, 'Transcript', targetQuarter, depth);
  const verified = listDigests(db, companyId).filter(
    (d) => d.verification && d.verification.status === 'pass' && d.quarter < targetQuarter
  );
  const digested = new Set(verified.map((d) => String(d.quarter)));
  const pendingDigestQuarters = history.map((d) => String(d.date)).filter((q) => !digested.has(q));

  const reratings = loadAll('rerating-catalysts', companyId).sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  const financials = await safe(errors, 'company-financials', () =>
    getCompanyFinancials(companyId, { client })
  );
  const windowStart = quarterEndIso(shiftQuarter(targetQuarter, -1));
  const anns = await safe(errors, 'announcements', () =>
    fetchAnnouncementsSince(client, companyId, windowStart)
  );
  // Pre-result run-up is only meaningful before the print: a post-mode build would measure
  // the result-day reaction itself, so it is left out there.
  const priceAction =
    c.mode === 'pre' && companyId.startsWith('NSE:')
      ? await safe(errors, 'price-action', async () => {
          const to = new Date(asOf);
          const from = new Date(to);
          from.setUTCDate(from.getUTCDate() - 60);
          const rows = await new NseClient().getPriceVolumeDeliverable(
            companyId.slice(4),
            toNseDate(from),
            toNseDate(to)
          );
          return analyzePreResultPriceAction(rows);
        })
      : null;

  const pack = assembleHistoryPack({
    companyId,
    targetYyyymm: targetQuarter,
    asOf,
    digests: verified.slice(0, depth),
    pendingDigestQuarters,
    forwardGuidanceDtos: loadAll('forward-guidance', companyId),
    priorResultDtos: loadAll('quarterly-result', companyId),
    rerating: reratings[0] || null,
    financials,
    concallNotesGuidance:
      (await safe(errors, 'concall-notes', () =>
        concallGuidanceHistory(concallNotesStore, companyId, depth)
      )) || [],
    filings: anns ? classifyFilings(anns, tax, { windowStart }) : null,
    priceAction,
    priorAnalyses: (await safe(errors, 'prior-analyses', () => priorAnalyses(db, companyId))) || [],
  });
  pack.mode = c.mode;
  pack.errors = errors;
  pack.contextUsed = pack.sourcesConsumed;
  const id = db.saveReport(pack);
  apiUsageTracker.flush(jobName);

  console.log(
    JSON.stringify(
      {
        ok: true,
        id,
        companyId,
        mode: c.mode,
        targetQuarter: pack.targetQuarter,
        coversThrough: asOf,
        digestCoverage: pack.digestCoverage,
        priorGuides: pack.priorGuidance.length,
        oneOffRecurrent: pack.oneOffRecurrence.recurrent,
        knownCatalysts: pack.knownCatalysts.length,
        filings: pack.filings ? pack.filings.total : null,
        priceActionPattern: pack.priceAction ? pack.priceAction.pattern : null,
        errors: errors.map((e) => e.source),
        filesTouched: db.touchedFiles(),
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
