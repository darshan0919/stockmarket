#!/usr/bin/env node
'use strict';

/**
 * Persist quarterly-result-extractor's per-company output (fetch manifest +
 * income-statement signal scan + headline financial snapshot +
 * tone/guidance/strategic/KPI excerpts) as a durable DB record, so a later,
 * separate invocation of quarterly-result-analysis can read it without
 * depending on the same /tmp files or session still existing.
 *
 * Saves ONE record, ALWAYS -- including a genuine "results not out yet"
 * outcome (manifest.notYetOut). This lets quarterly-result-analysis tell
 * "never run" (no record at all -> auto-invoke this skill or prompt the
 * user) apart from "run, results genuinely not filed yet" (record exists,
 * notYetOut: true -> don't re-run, just say so).
 *
 * Usage:
 *   node save_result_documents.js --manifest <manifest.json> \
 *     --signals <income_statement_signals.json> \
 *     --headline <headline_financials.json> \
 *     --excerpts <excerpts.json> \
 *     --statements <statements.json> \
 *     --bs-signals <balance_sheet_signals.json> \
 *     --cf-signals <cashflow_signals.json> \
 *     [--model-used claude-sonnet-5]     # only if Step 3 involved LLM judgment beyond recall
 */
const fs = require('fs');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

function parseArgs(argv) {
  const out = {
    manifest: null,
    signals: null,
    headline: null,
    excerpts: null,
    statements: null,
    bsSignals: null,
    cfSignals: null,
    creator: 'quarterly-result-extractor',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--signals') out.signals = argv[++i];
    else if (a === '--headline') out.headline = argv[++i];
    else if (a === '--excerpts') out.excerpts = argv[++i];
    else if (a === '--statements') out.statements = argv[++i];
    else if (a === '--bs-signals') out.bsSignals = argv[++i];
    else if (a === '--cf-signals') out.cfSignals = argv[++i];
    else if (a === '--creator') out.creator = argv[++i];
  }
  return out;
}

function readJsonIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    console.error(
      'Usage: save_result_documents.js --manifest <manifest.json> [--signals <file>] [--excerpts <file>]'
    );
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const signals = readJsonIfExists(args.signals);
  const headline = readJsonIfExists(args.headline);
  const excerpts = readJsonIfExists(args.excerpts);
  const statements = readJsonIfExists(args.statements);
  const bsSignals = readJsonIfExists(args.bsSignals);
  const cfSignals = readJsonIfExists(args.cfSignals);
  const today = new Date().toISOString().slice(0, 10);

  const dto = {
    creator: args.creator,
    type: 'quarterly-result-documents',
    date: today,
    companyId: manifest.companyId || manifest.ticker,
    quarter: manifest.quarter || null,
    found: manifest.found,
    transcriptMissing: !!manifest.transcriptMissing,
    notYetOut: !!manifest.notYetOut,
    incomeStatementSignals: signals || null,
    // Always-on Revenue/EBITDA-margin/PAT/tax/EPS backbone -- the KPI-strip
    // source, unfiltered by materiality (see compute_headline_financials.js).
    headlineFinancials: headline ? headline.cards || [] : [],
    toneExcerpts: excerpts ? excerpts.toneExcerpts || [] : [],
    guidanceExcerpts: excerpts ? excerpts.guidanceExcerpts || [] : [],
    strategicExcerpts: excerpts ? excerpts.strategicExcerpts || [] : [],
    possiblyDropped: excerpts ? excerpts.possiblyDropped || [] : [],
    // Candidate operational/governance KPIs (ROCE, volume growth, related-party,
    // inventory-build swing, etc.) outside the P&L scan's reach -- recall only,
    // final KPI-strip selection happens in quarterly-result-analysis Phase 2.
    kpiExcerpts: excerpts ? excerpts.kpiExcerpts || [] : [],
    // Balance sheet + cash flow: presence, source document, as-at date and
    // staleness verdict, plus the normalized snapshots and the pre-computed
    // signal scans when the statements were fresh enough to scan. Under SEBI
    // LODR Reg 33(3) these two statements are filed only half-yearly, so an
    // `absent` status in a Q1/Q3 record is the expected outcome and must be
    // stored (not omitted) — that is what lets quarterly-result-analysis say
    // "not disclosed this quarter" instead of re-fetching to find out.
    statementAvailability: statements
      ? {
          balanceSheet: {
            found: !!statements.balanceSheet?.found,
            source: statements.balanceSheet?.source || null,
            consolidated: statements.balanceSheet?.consolidated ?? null,
            asOfDate: statements.balanceSheet?.asOfDate || null,
            coverage: statements.balanceSheet?.coverage || null,
            unit: statements.balanceSheet?.unit || null,
            ...statements.balanceSheet?.staleness,
          },
          cashflow: {
            found: !!statements.cashflow?.found,
            source: statements.cashflow?.source || null,
            consolidated: statements.cashflow?.consolidated ?? null,
            asOfDate: statements.cashflow?.asOfDate || null,
            coverage: statements.cashflow?.coverage || null,
            unit: statements.cashflow?.unit || null,
            ...statements.cashflow?.staleness,
          },
          analysable: statements.analysable || { balanceSheet: false, cashflow: false },
        }
      : null,
    balanceSheet: statements?.balanceSheet?.current || null,
    balanceSheetPriorColumn: statements?.balanceSheet?.priorColumn || null,
    balanceSheetUnmatchedRows: statements?.balanceSheet?.unmatched || [],
    cashflow: statements?.cashflow?.current || null,
    cashflowPriorColumn: statements?.cashflow?.priorColumn || null,
    cashflowUnmatchedRows: statements?.cashflow?.unmatched || [],
    balanceSheetSignals: bsSignals || null,
    cashflowSignals: cfSignals || null,
    excerptsPending: !excerpts && !manifest.notYetOut,
    statementsPending: !statements && !manifest.notYetOut,
    summary: manifest.notYetOut
      ? `Results not yet filed for ${manifest.ticker}`
      : `Fetched ${Object.entries(manifest.found || {})
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join('+')} for ${manifest.quarter || 'latest quarter'}`,
    contextUsed: [],
    // no modelUsed: Step 1/2/4 are pure script, Step 3 is recall-first
    // excerpting (not judgment) -- see SKILL.md's cheap-tier note. Pass
    // --model-used explicitly only if that convention changes.
  };

  const id = db.saveReport(dto);
  console.log(
    JSON.stringify(
      {
        companyId: dto.companyId,
        id,
        notYetOut: dto.notYetOut,
        statements: dto.statementAvailability
          ? {
              balanceSheet: dto.statementAvailability.balanceSheet.status,
              cashflow: dto.statementAvailability.cashflow.status,
            }
          : 'not extracted',
      },
      null,
      2
    )
  );
}

main();
