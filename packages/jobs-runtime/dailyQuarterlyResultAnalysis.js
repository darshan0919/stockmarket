#!/usr/bin/env node
'use strict';

/**
 * dailyQuarterlyResultAnalysis.js
 *
 * Companion script for the "Daily Quarterly Result Analysis" scheduled task.
 * Fetches companies from Stockscans saved scan:
 *   https://www.stockscans.in/scans/saved/a7e61c9232e2ba38de792c27
 * with ratiosType: "Growth" and orderBy: "PAT Growth TTM" (descending order),
 * paginating until all companies are retrieved.
 *
 * Capabilities:
 *   --fetch: Fetch universe from Stockscans scan, persist to data/runs, and print JSON.
 *            If count === 0, sends the zero-company heartbeat email immediately.
 *   --analyze: Run quarterly result analysis & PDF generation for companies in the scan universe.
 *              Also accepts --companyId <NSE:SYMBOL> to target a single company.
 *   --push: Pushes generated PDFs and run manifest to Google Drive via targeted push.
 *   --email: Builds and sends the final analytical summary email with table:
 *            company name (linkified) | Market Cap | Revenue YoY | PAT YoY | PAT TTM | Link to analysis doc
 *            (sorted by PAT Growth TTM, original order preserved).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { stockscans } = require('@stock/api');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue, hasFlag } = require('./lib/env');
const db = require('./lib/db');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const { buildJobReport } = require('./lib/jobReportEmail');
const { stockscansFor } = require('./lib/resultHistory/runtime');

loadEnv();

const SCAN_ID = 'a7e61c9232e2ba38de792c27';
const JOB_NAME = 'daily-quarterly-result-analysis';
const assetsDir = path.join(db.dataRoot(), 'assets', 'quarterly-result-analysis');

/**
 * Format a money value in ₹ Cr.
 * @param {number|string} val
 * @returns {string}
 */
function formatMarketCap(val) {
  if (val == null || val === '') return '—';
  const n = Number(String(val).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return String(val);
  return `₹${Math.round(n).toLocaleString('en-IN')} Cr`;
}

/**
 * Format percentage with explicit + or - sign.
 * @param {number|string} val
 * @returns {string}
 */
function formatPct(val) {
  if (val == null || val === '') return '—';
  const n = Number(String(val).replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(n)) return String(val);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

module.exports.SCAN_ID = SCAN_ID;
module.exports.JOB_NAME = JOB_NAME;
module.exports.formatMarketCap = formatMarketCap;
module.exports.formatPct = formatPct;

/**
 * Get date string (YYYY-MM-DD) for job run (default: today Asia/Kolkata).
 * @param {string} [override]
 * @returns {string}
 */
function getJobDate(override) {
  if (override) return override;
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Path to saved scan run file.
 * @param {string} date
 * @returns {string}
 */
function getRunFilePath(date) {
  return path.join(db.dataRoot(), 'runs', `daily-quarterly-result-analysis-${date}.json`);
}

/**
 * Fetch and paginate all companies from saved scan.
 * @param {Object} [opts]
 * @param {string} [opts.scanId=SCAN_ID]
 * @param {string} [opts.date]
 * @returns {Promise<{count: number, companies: Array<Object>, scanId: string, scanName: string, date: string}>}
 */
async function fetchScan(opts = {}) {
  const scanId = opts.scanId || SCAN_ID;
  const date = getJobDate(opts.date);

  const def = await stockscans.getScanMetadata(scanId);
  const scanName = def.scanName || 'Quality Result - DND';

  if (opts.days !== undefined) {
    const f = def.filters && def.filters.find((x) => x.left === 'Days From Result');
    if (f) {
      f.right = String(opts.days);
    } else if (def.filters) {
      def.filters.push({
        left: 'Days From Result',
        sign: '=',
        right: String(opts.days),
      });
    }
  }

  const allRows = [];
  let header = null;
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const payload = {
      ratiosType: 'Growth',
      timePeriod: 'Latest',
      scan: def,
      watchlistIds: def.watchlistIds || [],
      order: 'desc',
      orderBy: 'PAT Growth TTM',
      offset,
    };

    const data = await stockscans.runScan(payload, scanId);
    const table = data.table;
    if (!table || table.length <= 1) break;

    if (!header) header = table[0];
    const newRows = table.slice(1);
    allRows.push(...newRows);

    offset += newRows.length;
    if (data.total != null && allRows.length >= data.total) break;
  }

  // Header column indices
  const colCompanyId = header ? header.indexOf('companyId') : -1;
  const colName = header ? header.indexOf('Name') : -1;
  const colMcap = header ? header.indexOf('Market Capitalization') : -1;
  const colRevYoY = header ? header.indexOf('Revenue Growth YoY') : -1;
  const colPatYoY = header ? header.indexOf('PAT Growth YoY') : -1;
  const colPatTtm = header ? header.indexOf('PAT Growth TTM') : -1;

  const companies = allRows.map((r) => {
    return {
      companyId: colCompanyId >= 0 ? r[colCompanyId] : r[0],
      name: colName >= 0 ? r[colName] : r[1],
      marketCap: colMcap >= 0 ? r[colMcap] : null,
      revenueYoY: colRevYoY >= 0 ? r[colRevYoY] : null,
      patYoY: colPatYoY >= 0 ? r[colPatYoY] : null,
      patTtm: colPatTtm >= 0 ? r[colPatTtm] : null,
    };
  });

  const result = {
    scanId,
    scanName,
    date,
    count: companies.length,
    companies,
  };

  const runFile = getRunFilePath(date);
  fs.mkdirSync(path.dirname(runFile), { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(result, null, 2) + '\n', 'utf8');

  return result;
}

/**
 * Deliver heartbeat email when zero companies matched the scan.
 * @param {Object} scanResult
 * @returns {Promise<{status: string}>}
 */
async function sendEmptyScanEmail(scanResult) {
  const { date, scanId, scanName } = scanResult;
  const subject = `Daily Quarterly Result Analysis — 0 companies in scan (${date})`;
  const scanUrl = `https://www.stockscans.in/scans/saved/${scanId}`;
  const body = `### Daily Quarterly Result Analysis\n\nNo companies matched the scan criteria for [${scanName}](${scanUrl}) on **${date}**.\n\n- **Scan**: [${scanName}](${scanUrl})\n- **Criteria**: PAT Growth YoY >= 20%, PAT Growth TTM >= 20%, Days From Result = -1, Mcap >= 300 Cr.\n- **Action**: Skipped \`/quarterly-result-analysis\` execution as universe is empty.`;

  const { html } = buildJobReport({
    job: JOB_NAME,
    status: 'ok',
    title: '0 companies in scan',
    body,
    date,
  });

  const res = await sendHtmlEmail({
    subject,
    htmlBody: html,
    jobName: JOB_NAME,
  });

  return res;
}

/**
 * Find the generated PDF file for a company in data/assets/quarterly-result-analysis/.
 * @param {Object} company
 * @returns {{ pdfPath: string|null, relPath: string|null, driveUrl: string|null }}
 */
function findCompanyPdf(company) {
  try {
    if (!fs.existsSync(assetsDir)) {
      return { pdfPath: null, relPath: null, driveUrl: null };
    }

    const files = fs.readdirSync(assetsDir);
    const symbol = (company.companyId || '').split(':')[1] || '';
    const cleanName = (company.name || '').replace(/[^a-zA-Z0-9]/g, '');

    // Filter candidates matching symbol or clean company name, ending in .pdf
    const candidates = files
      .filter((f) => {
        if (!f.endsWith('.pdf')) return false;
        if (f.includes('.local-conflict.')) return false;
        const lower = f.toLowerCase();
        if (symbol && lower.includes(symbol.toLowerCase())) return true;
        if (
          cleanName &&
          cleanName.length >= 4 &&
          lower.includes(cleanName.slice(0, 8).toLowerCase())
        )
          return true;
        return false;
      })
      .map((f) => {
        const full = path.join(assetsDir, f);
        const stat = fs.statSync(full);
        return { file: f, path: full, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (candidates.length === 0) {
      return { pdfPath: null, relPath: null, driveUrl: null };
    }

    const best = candidates[0];
    const relPath = path.relative(db.dataRoot(), best.path);
    const driveUrl = db.resolveDriveUrl(relPath);

    return {
      pdfPath: best.path,
      relPath,
      driveUrl,
    };
  } catch {
    return { pdfPath: null, relPath: null, driveUrl: null };
  }
}

module.exports.findCompanyPdf = findCompanyPdf;

/**
 * Analyzes companies in the scan universe to produce quarterly-result report DTOs and deterministic PDFs.
 * If history packs are missing or incomplete, executes Step 0 A & C to ensure the history pack exists
 * with pending digests noted, adhering to cheap-tier execution rules.
 * @param {Object} [opts]
 * @param {string} [opts.date]
 * @param {string} [opts.companyId]
 * @param {boolean} [opts.force=false]
 * @returns {Promise<{status: string, count: number, processed: Array<Object>}>}
 */
async function analyzeScanCompanies(opts = {}) {
  const date = getJobDate(opts.date);
  const runFile = getRunFilePath(date);

  let scanResult;
  if (opts.days !== undefined) {
    scanResult = await fetchScan({ date, days: opts.days });
  } else if (fs.existsSync(runFile)) {
    scanResult = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  } else {
    scanResult = await fetchScan({ date });
  }

  let companies = scanResult.companies || [];
  if (opts.companyId) {
    const target = opts.companyId.toLowerCase();
    companies = companies.filter(
      (c) =>
        (c.companyId || '').toLowerCase() === target ||
        ((c.companyId || '').split(':')[1] || '').toLowerCase() === target
    );
  }

  const client = stockscansFor(JOB_NAME);
  const { processCompany } = require('./scripts/batchQuarterlyResultAnalysis');

  const processed = [];
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    console.log(
      `[analyzeScanCompanies] [${i + 1}/${companies.length}] Analyzing ${c.companyId} (${c.name})...`
    );

    // Step 0 A and C if history pack is missing
    try {
      const packs =
        typeof db.find === 'function'
          ? db.find('reports', {
              type: 'quarterly-result-history',
              companyId: c.companyId,
            })
          : [];
      if (!packs || packs.length === 0) {
        console.log(
          `[analyzeScanCompanies] History pack missing for ${c.companyId}. Running Step 0 A and C...`
        );
        const safe = (c.companyId || '').replace(/[^a-zA-Z0-9]/g, '_');
        const histDir = path.join(os.tmpdir(), `${safe}_qrh`);
        fs.mkdirSync(histDir, { recursive: true });
        try {
          execSync(
            `yarn quarterly-result-extractor:pending-digests --companyId "${c.companyId}" --out-dir "${histDir}"`,
            { stdio: 'pipe' }
          );
        } catch (_err) {
          // Continue on pending digests warning
        }
        try {
          execSync(`yarn quarterly-result-extractor:build-pack --companyId "${c.companyId}"`, {
            stdio: 'pipe',
          });
        } catch (_err) {
          // Continue on build pack warning
        }
      }
    } catch (e) {
      console.warn(`[analyzeScanCompanies] Step 0 A/C warning for ${c.companyId}:`, e.message);
    }

    try {
      const res = await processCompany(c, client, opts.force);
      processed.push({ companyId: c.companyId, pdfPath: res.pdfPath, success: true });
    } catch (err) {
      console.error(`[analyzeScanCompanies] Failed to analyze ${c.companyId}:`, err.message);
      processed.push({ companyId: c.companyId, error: err.message, success: false });
    }

    if (i < companies.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return { status: 'ok', count: processed.length, processed };
}

/**
 * Pushes only the files generated by this job (PDF reports and run manifest) to Google Drive.
 * @param {Object} [opts]
 * @param {string} [opts.date]
 * @returns {Promise<{pushed: string[], skipped: number, errors: string[]}>}
 */
async function pushJobAssets(opts = {}) {
  const date = getJobDate(opts.date);
  const runFile = getRunFilePath(date);

  let scanResult;
  if (opts.days !== undefined) {
    scanResult = await fetchScan({ date, days: opts.days });
  } else if (fs.existsSync(runFile)) {
    scanResult = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  } else {
    scanResult = await fetchScan({ date });
  }

  const companies = scanResult.companies || [];
  const filesToPush = [];

  if (fs.existsSync(runFile)) {
    filesToPush.push(path.relative(db.dataRoot(), runFile));
  }

  for (const c of companies) {
    const { pdfPath } = findCompanyPdf(c);
    if (pdfPath && fs.existsSync(pdfPath)) {
      filesToPush.push(path.relative(db.dataRoot(), pdfPath));
    }
  }

  const uniqueFiles = Array.from(new Set(filesToPush));
  if (uniqueFiles.length === 0) {
    console.log('[pushJobAssets] No files found to push.');
    return { pushed: [], skipped: 0, errors: [] };
  }

  console.log(`[pushJobAssets] Pushing ${uniqueFiles.length} file(s) to Google Drive:`);
  uniqueFiles.forEach((f) => console.log(`  - ${f}`));

  const dataScript = require('./scripts/data');
  const res = await dataScript.push({ files: uniqueFiles });
  return {
    pushed: res.uploadedRels || [],
    skipped: res.skipped || 0,
    errors: res.errors || [],
  };
}

/**
 * Builds the analytical summary markdown table and sends the report email.
 * @param {Object} [opts]
 * @param {string} [opts.date]
 * @returns {Promise<{status: string, sent: boolean, count: number}>}
 */
async function sendReportEmail(opts = {}) {
  const date = getJobDate(opts.date);
  const runFile = getRunFilePath(date);

  let scanResult;
  if (opts.days !== undefined) {
    scanResult = await fetchScan({ date, days: opts.days });
  } else if (fs.existsSync(runFile)) {
    scanResult = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  } else {
    scanResult = await fetchScan({ date });
  }

  const companies = scanResult.companies || [];

  if (companies.length === 0) {
    const res = await sendEmptyScanEmail(scanResult);
    return { status: res.status, sent: true, count: 0 };
  }

  // Auto-sync any generated PDFs that are missing Drive URLs
  const missingDriveSync = companies.some((c) => {
    const { pdfPath, driveUrl } = findCompanyPdf(c);
    return pdfPath && fs.existsSync(pdfPath) && !driveUrl;
  });
  if (missingDriveSync) {
    try {
      console.log(
        '[sendReportEmail] Some generated PDFs are not yet synced to Google Drive. Running targeted push...'
      );
      await pushJobAssets({ date, days: opts.days });
    } catch (pushErr) {
      console.warn(
        '[sendReportEmail] Targeted push failed, proceeding with local links:',
        pushErr.message
      );
    }
  }

  const rows = [];
  const attachments = [];
  const incompleteHistory = [];

  for (const c of companies) {
    if (typeof db.find === 'function') {
      try {
        const packs = db.find('reports', {
          type: 'quarterly-result-history',
          companyId: c.companyId,
        });
        if (!packs || packs.length === 0) {
          incompleteHistory.push({
            name: c.name,
            companyId: c.companyId,
            reason: 'History pack missing',
          });
        } else {
          const latestPack =
            (typeof db.readReport === 'function'
              ? db.readReport(packs[packs.length - 1].id)
              : null) || packs[packs.length - 1];
          if (latestPack.digestCoverage?.pending?.length > 0) {
            incompleteHistory.push({
              name: c.name,
              companyId: c.companyId,
              reason: `Pending digests: ${latestPack.digestCoverage.pending.join(', ')}`,
            });
          }
        }
      } catch (_) {
        // Safe fallback in mock/test environments
      }
    }

    const companyUrl = `https://www.stockscans.in/company/${encodeURIComponent(c.companyId)}`;
    const companyLink = `[${c.name}](${companyUrl})`;
    const mcapFormatted = formatMarketCap(c.marketCap);
    const revYoYFormatted = formatPct(c.revenueYoY);
    const patYoYFormatted = formatPct(c.patYoY);
    const patTtmFormatted = formatPct(c.patTtm);

    const { pdfPath, driveUrl } = findCompanyPdf(c);

    let docLink;
    if (driveUrl) {
      docLink = `[View PDF](${driveUrl})`;
    } else if (pdfPath) {
      docLink = `[${path.basename(pdfPath)}](file://${pdfPath})`;
    } else {
      docLink = '—';
    }

    if (pdfPath && fs.existsSync(pdfPath) && attachments.length < 8) {
      attachments.push({
        filename: path.basename(pdfPath),
        content: fs.readFileSync(pdfPath),
      });
    }

    rows.push(
      `| ${companyLink} | ${mcapFormatted} | ${revYoYFormatted} | ${patYoYFormatted} | ${patTtmFormatted} | ${docLink} |`
    );
  }

  const tableHeader = [
    '| Company Name | Market Cap | Revenue YoY | PAT YoY | PAT TTM | Link to analysis doc |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
  ].join('\n');

  const tableBody = rows.join('\n');
  let bodyMarkdown = `### Quarterly Results Analysis Summary (${companies.length} companies)\n\nScan source: [${scanResult.scanName}](https://www.stockscans.in/scans/saved/${scanResult.scanId}) (ordered by PAT Growth TTM desc)\n\n${tableHeader}\n${tableBody}`;

  if (incompleteHistory.length > 0) {
    const incompleteList = incompleteHistory
      .map((it) => `- **${it.name}** (\`${it.companyId}\`): ${it.reason}`)
      .join('\n');
    bodyMarkdown += `\n\n#### History Pack Coverage (Cheap Tier Run)\n\n${incompleteList}`;
  }

  const { subject, html } = buildJobReport({
    job: JOB_NAME,
    status: 'ok',
    title: `${companies.length} companies analyzed`,
    body: bodyMarkdown,
    date,
    attachmentNames: attachments.map((a) => a.filename),
  });

  const res = await sendHtmlEmail({
    subject,
    htmlBody: html,
    attachments,
    jobName: JOB_NAME,
  });

  return {
    status: res.status,
    sent: res.status === 'sent',
    count: companies.length,
    subject,
  };
}

async function main(argv = process.argv) {
  const date = argValue('--date', argv) || undefined;
  const companyId = argValue('--companyId', argv) || undefined;
  const daysArg = argValue('--days', argv) ?? argValue('--days-from-result', argv);
  const days = daysArg !== null && daysArg !== undefined ? Number(daysArg) : undefined;

  if (hasFlag('--push', argv)) {
    const res = await pushJobAssets({ date, days });
    console.log(JSON.stringify(res, null, 2));
    return res;
  }

  if (hasFlag('--email', argv)) {
    const res = await sendReportEmail({ date, days });
    console.log(JSON.stringify(res, null, 2));
    return res;
  }

  if (hasFlag('--analyze', argv) || companyId) {
    const force = hasFlag('--force', argv);
    const res = await analyzeScanCompanies({ date, companyId, force, days });
    console.log(JSON.stringify(res, null, 2));
    return res;
  }

  const scanResult = await fetchScan({ date, days });

  if (scanResult.count === 0) {
    console.log(
      JSON.stringify(
        {
          status: 'empty_scan',
          count: 0,
          message: 'Zero companies matched scan; sent notification email',
        },
        null,
        2
      )
    );
    await sendEmptyScanEmail(scanResult);
    return scanResult;
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        count: scanResult.count,
        companies: scanResult.companies,
        scanId: scanResult.scanId,
        date: scanResult.date,
      },
      null,
      2
    )
  );

  return scanResult;
}

if (require.main === module) {
  const jobName = resolveJobName(JOB_NAME);
  main()
    .catch((err) => {
      console.error('dailyQuarterlyResultAnalysis failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

Object.assign(module.exports, {
  SCAN_ID,
  JOB_NAME,
  formatMarketCap,
  formatPct,
  fetchScan,
  sendEmptyScanEmail,
  findCompanyPdf,
  analyzeScanCompanies,
  pushJobAssets,
  sendReportEmail,
  main,
});
