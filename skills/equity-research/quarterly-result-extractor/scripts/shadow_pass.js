#!/usr/bin/env node
'use strict';

/**
 * shadow_pass.js — diagnostic-only batch harness. NOT part of the analysis
 * pipeline, NOT wired into any skill, and NOT to be treated as trusted
 * output. Purpose: run the extraction stack (Result/PPT fetch -> layout
 * text -> income-statement extraction -> BS/CF extraction) across a large,
 * real company universe drawn from a Stockscans saved scan, and log
 * found/source/reason/unmatched per company, so the real distribution of
 * extraction failure modes can be characterized before further per-company
 * regex patching. See conversation 2026-09-23.
 *
 * Usage:
 *   node shadow_pass.js [scanUrl] [limit] [outRoot]
 *
 * Downloaded PDFs/text land under outRoot (defaults to a directory under
 * $HOME, OUTSIDE the mounted repo, so this diagnostic run never touches the
 * tracked working tree). results.json under outRoot is rewritten after
 * every company so progress survives an interrupted run.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { resolveUniverse } = require('../../../../stock-api/src/analyzers/runScan.js');
const { fetchDocuments } = require('../../../../stock-api/src/fetchers/documentsFetcher.js');
const { extractOne: extractText } = require('./extract_result_text.js');
const { extractIncomeStatement } = require('./extract_income_statement.js');
const stmt = require('./extract_statements.js');

const SCAN_URL =
  process.argv[2] || 'https://www.stockscans.in/scans/saved/01162dec77b03a83d32fbd8c';
const LIMIT = parseInt(process.argv[3] || '80', 10);
const OUT_ROOT = process.argv[4] || path.join(process.env.HOME, 'shadow-pass-' + Date.now());
// Wall-clock budget: each device_bash invocation of this script is capped
// (sandboxed remote shells here do not keep a detached background process
// alive across separate tool calls, confirmed 2026-09-23), so this script is
// designed to be re-invoked repeatedly against the SAME outRoot: it resumes
// from results.json (skipping companies already recorded) and stops cleanly
// once TIME_BUDGET_MS has elapsed, flushing whatever it has so far.
const TIME_BUDGET_MS = parseInt(process.argv[5] || '150000', 10);
const START_TS = Date.now();

function log(...a) {
  console.error(new Date().toISOString(), ...a);
}

async function processCompany(companyId) {
  const rec = { companyId };
  const docsDir = path.join(OUT_ROOT, 'docs', companyId.replace(/[^A-Za-z0-9]/g, '_'));
  try {
    fs.mkdirSync(docsDir, { recursive: true });
    const fetchRes = await fetchDocuments(companyId, {
      types: ['Result', 'PPT'],
      lastN: 1,
      outputDir: docsDir,
    });
    const byType = {};
    for (const d of fetchRes.fetched) byType[d.documentType] = d;
    rec.fetched = Object.keys(byType);
    rec.fetchSkipped = fetchRes.skipped.map((s) => ({ type: s.documentType, reason: s.reason }));

    if (!byType.Result && !byType.PPT) {
      rec.stage = 'fetch';
      rec.reason = 'no Result or PPT document found for latest quarter';
      return rec;
    }

    const resultPdf = byType.Result ? byType.Result.path : null;
    const pptPdf = byType.PPT ? byType.PPT.path : null;

    const [resultTextMeta, pptTextMeta] = await Promise.all([
      extractText('Result', resultPdf, path.join(docsDir, 'result.txt')),
      extractText('PPT', pptPdf, path.join(docsDir, 'ppt.txt')),
    ]);
    rec.resultTextMeta = {
      skipped: !!resultTextMeta.skipped,
      isScannedDocument: resultTextMeta.isScannedDocument || false,
      ocrFailed: resultTextMeta.ocrFailed || false,
    };
    rec.pptTextMeta = {
      skipped: !!pptTextMeta.skipped,
      isScannedDocument: pptTextMeta.isScannedDocument || false,
      ocrFailed: pptTextMeta.ocrFailed || false,
    };

    const resultText = resultTextMeta.written ? fs.readFileSync(resultTextMeta.written, 'utf8') : '';
    const pptText = pptTextMeta.written ? fs.readFileSync(pptTextMeta.written, 'utf8') : '';

    const is = extractIncomeStatement({ resultText, pptText });
    rec.incomeStatement = {
      found: is.found,
      source: is.source || null,
      reason: is.reason || null,
      unmatchedCount: is.unmatched ? is.unmatched.length : null,
      hasYtd: !!(is.ytd && is.ytd.current),
    };

    const bs = stmt.extractOne({
      resultText,
      pptText,
      headings: stmt.BS_HEADINGS,
      map: stmt.BS_MAP,
      kind: 'balance sheet',
      stopAt: stmt.CF_HEADINGS,
    });
    const cf = stmt.extractOne({
      resultText,
      pptText,
      headings: stmt.CF_HEADINGS,
      map: stmt.CF_MAP,
      kind: 'cash flow statement',
      stopAt: stmt.BS_HEADINGS,
    });
    rec.balanceSheet = {
      found: bs.found,
      source: bs.source || null,
      unmatchedCount: bs.unmatched ? bs.unmatched.length : null,
      asOfDate: bs.asOfDate || null,
    };
    rec.cashflow = {
      found: cf.found,
      source: cf.source || null,
      unmatchedCount: cf.unmatched ? cf.unmatched.length : null,
      asOfDate: cf.asOfDate || null,
    };

    rec.stage = 'done';
  } catch (e) {
    rec.stage = 'error';
    rec.reason = String((e && e.message) || e);
  }
  return rec;
}

async function main() {
  log('resolving scan universe from', SCAN_URL);
  const universe = await resolveUniverse(SCAN_URL, { liquidityGate: false });
  log('universe size', universe.companies.length, 'scanName', universe.scanName);

  const ids = [];
  const seen = new Set();
  for (const row of universe.companies) {
    const id = row.companyId;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    if (ids.length >= LIMIT) break;
  }
  log('selected', ids.length, 'companies for shadow pass. outRoot=', OUT_ROOT);

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const resultsPath = path.join(OUT_ROOT, 'results.json');
  let results = [];
  const done = new Set();
  if (fs.existsSync(resultsPath)) {
    try {
      const prior = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      if (Array.isArray(prior.results)) {
        results = prior.results;
        for (const r of results) done.add(r.companyId);
        log(`resuming: ${results.length} companies already recorded`);
      }
    } catch (e) {
      log('could not parse existing results.json, starting fresh:', e.message);
    }
  }

  const flush = () => {
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          scanUrl: SCAN_URL,
          scanName: universe.scanName,
          generatedAt: new Date().toISOString(),
          total: ids.length,
          completed: results.length,
          results,
        },
        null,
        2
      )
    );
  };

  let processedThisRun = 0;
  for (let i = 0; i < ids.length; i++) {
    if (Date.now() - START_TS > TIME_BUDGET_MS) {
      log(`time budget (${TIME_BUDGET_MS}ms) reached — stopping for this invocation, ${results.length}/${ids.length} done so far`);
      break;
    }
    const companyId = ids[i];
    if (done.has(companyId)) continue;
    log(`[${results.length + 1}/${ids.length}] processing ${companyId}`);
    const rec = await processCompany(companyId);
    results.push(rec);
    done.add(companyId);
    processedThisRun++;
    flush();
    await new Promise((r) => setTimeout(r, 400));
  }

  flush();
  if (results.length >= ids.length) {
    log('DONE. all', ids.length, 'companies processed. results at', resultsPath);
  } else {
    log(
      `PAUSED after processing ${processedThisRun} this run (${results.length}/${ids.length} total). re-run the same command (same outRoot) to resume. results at`,
      resultsPath
    );
  }
}

main().catch((e) => {
  log('FATAL', e);
  process.exit(1);
});
