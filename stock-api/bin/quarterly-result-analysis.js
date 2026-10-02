#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI entry point for quarterly-result-analysis deterministic preparation.
 * Handles cache short-circuiting and builds deterministic analytical context from quarterly-result-documents.
 */

const path = require('path');
const { loadEnv, argValue, hasFlag } = require('../../packages/jobs-runtime/lib/env');
const db = require('../../packages/jobs-runtime/lib/db');
const { resolveCompanyId } = require('../../packages/jobs-runtime/lib/companyMaster');
const { buildAnalysisContext } = require('../src/analyzers/resultAnalysisContext');

function main() {
  loadEnv(argValue('--env-file', process.argv));

  const argv = process.argv.slice(2);

  if (argv.includes('--help')) {
    console.log(`Usage: quarterly-result-analysis [options]
Options:
  --companyId <id>   Canonical companyId (e.g. NSE:TCS, BSE:500325, or raw ticker)
  --date <YYYY-MM-DD> Extraction date to scope DB lookup
  --check-cache       Check if a completed quarterly-result report already exists
  --prepare           Pre-compute KPI cards, statement health & context for LLM (default)
  --help              Show this help message`);
    process.exit(0);
  }

  const rawCompany = argValue('--companyId', argv) || argv[0];
  if (!rawCompany || rawCompany.startsWith('--')) {
    console.error(
      JSON.stringify({ ok: false, error: 'Missing required argument: --companyId <id>' })
    );
    process.exit(1);
  }

  const companyId = resolveCompanyId(rawCompany) || rawCompany;
  const date = argValue('--date', argv);
  const checkCache = hasFlag('--check-cache', argv);

  // 1. Check existing report (Tier 2 cache short-circuit)
  const reportQuery = { type: 'quarterly-result', companyId };
  if (date) reportQuery.date = date;

  const existingReports = db.find('reports', reportQuery);
  if (existingReports && existingReports.length > 0) {
    const latestReport = existingReports[existingReports.length - 1];
    if (checkCache) {
      console.log(
        JSON.stringify({ ok: true, cached: true, id: latestReport.id, report: latestReport })
      );
      return;
    }
  }

  // 2. Fetch quarterly-result-documents DB record
  const docQuery = { type: 'quarterly-result-documents', companyId };
  if (date) docQuery.date = date;

  const docRecords = db.find('reports', docQuery);
  if (!docRecords || docRecords.length === 0) {
    console.log(
      JSON.stringify({
        ok: false,
        notFound: true,
        companyId,
        message: `No quarterly-result-documents record found for ${companyId}. Invoke quarterly-result-extractor first.`,
      })
    );
    return;
  }

  const latestDoc = docRecords[docRecords.length - 1];

  // 3. Build deterministic analytical context
  try {
    const context = buildAnalysisContext(latestDoc);
    console.log(
      JSON.stringify({
        ok: true,
        cached: false,
        companyId,
        context,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        error: err.message,
        companyId,
      })
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
