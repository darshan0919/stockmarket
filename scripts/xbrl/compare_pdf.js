#!/usr/bin/env node
'use strict';

/**
 * XBRL-vs-PDF agreement check for the latest result (docs/XBRL_INTEGRATION_PLAN.md, Phase 5).
 *
 *   node scripts/xbrl/compare_pdf.js --ids NSE:A,NSE:B --out cmp.jsonl [--work-dir DIR]
 *
 * Needs STOCKSCANS_AUTH_TOKEN in the environment (source the repo .env first). For each company
 * it downloads the Result PDF, runs the existing PDF extractor and the XBRL path on the same
 * quarter, and appends one JSON line with every shared line item, its XBRL and PDF value for the
 * current, QoQ and YoY periods, and whether they agree (0.5% or Rs 0.05 Cr). Work files go to
 * the OS temp dir by default, never under data/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { NseClient } = require('../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('../../packages/jobs-runtime/lib/xbrl/issues.js');
const { resolveResultPeriods } = require('../../packages/jobs-runtime/lib/xbrl/resultsResolver.js');
const SK = path.join(__dirname, '../../skills/equity-research/quarterly-result-extractor/scripts');
const { assemble } = require(path.join(SK, 'extract_result_xbrl.js'));
const { extractIncomeStatement } = require(path.join(SK, 'extract_income_statement.js'));

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const work = args['work-dir'] || path.join(os.tmpdir(), 'xbrl_pdf_compare');
fs.mkdirSync(work, { recursive: true });

const agree = (a, b) =>
  Math.abs(a - b) <= Math.max(0.05, 0.005 * Math.max(Math.abs(a), Math.abs(b)));

async function one(companyId) {
  const symbol = companyId.replace(/^(NSE|BSE):/i, '');
  const dir = path.join(work, symbol);
  fs.mkdirSync(dir, { recursive: true });
  const rec = { companyId };
  try {
    execFileSync(
      'node',
      [path.join(SK, 'fetch_result_documents.js'), '--ticker', companyId, '--out-dir', dir],
      { stdio: 'pipe', timeout: 120000 }
    );
    const pdfPath = fs.readdirSync(dir).find((f) => /_Result_.*\.pdf$/.test(f));
    if (!pdfPath) throw new Error('no Result PDF');
    execFileSync(
      'node',
      [
        path.join(SK, 'extract_result_text.js'),
        '--result-pdf',
        path.join(dir, pdfPath),
        '--out-dir',
        dir,
      ],
      { stdio: 'pipe', timeout: 120000 }
    );
    const resultText = fs.readFileSync(path.join(dir, 'result.txt'), 'utf8');
    const pdf = extractIncomeStatement({ resultText });
    rec.pdfFound = pdf.found;
    rec.pdfLabelledConsolidated = pdf.consolidated;
    // The PDF extractor's basis label and unit detection are themselves under test, so compare
    // against BOTH XBRL bases and allow x10/x100/x1000 unit slips, and report which one matched.
    const FACTORS = [1, 10, 100, 1000, 0.1, 0.01, 0.001];
    const per = {};
    for (const basis of ['consolidated', 'standalone']) {
      const issues = createIssueLog(`cmp-${symbol}-${basis}`);
      const r = await resolveResultPeriods({
        symbol,
        basis,
        nse: new NseClient(),
        bse: new BseClient(),
        issues,
      });
      if (!r.cur?.ok) {
        per[basis] = { unavailable: r.cur?.reason };
        continue;
      }
      rec.quarterEnd = r.quarterEnd;
      const { incomeStatement: x } = assemble(r, null, issues);
      const rows = [];
      if (pdf.found)
        for (const [k, xv] of Object.entries(x.lineData || {}))
          for (const p of ['value', 'qoq', 'yoy']) {
            const a = xv?.[p];
            const b = pdf.lineData?.[k]?.[p];
            if (typeof a !== 'number') continue;
            if (typeof b !== 'number') {
              rows.push({ k, p, xbrl: a, pdf: null, status: 'pdf-missing' });
              continue;
            }
            const f = FACTORS.find((m) => agree(a * m, b));
            rows.push({
              k,
              p,
              xbrl: a,
              pdf: b,
              status: f === 1 ? 'match' : f ? `match-x${f}` : 'differ',
            });
          }
      per[basis] = { rows, match: rows.filter((r2) => /^match/.test(r2.status)).length };
    }
    const best = Object.entries(per).sort((a, b) => (b[1].match || 0) - (a[1].match || 0))[0];
    rec.bestBasis = best[0];
    rec.rows = best[1].rows || [];
    rec.matchByBasis = {
      consolidated: per.consolidated.match ?? null,
      standalone: per.standalone.match ?? null,
    };
  } catch (e) {
    rec.error = String(e.message).slice(0, 200);
  }
  return rec;
}

(async () => {
  for (const id of args.ids.split(',')) {
    const rec = await one(id);
    fs.appendFileSync(args.out, JSON.stringify(rec) + '\n');
    process.stderr.write(
      `${id} ${rec.error || `rows=${rec.rows.length} match=${rec.rows.filter((r) => /^match/.test(r.status)).length} differ=${rec.rows.filter((r) => r.status === 'differ').length}`}\n`
    );
  }
})();
