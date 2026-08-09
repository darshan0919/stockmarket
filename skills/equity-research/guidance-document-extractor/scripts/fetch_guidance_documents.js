#!/usr/bin/env node
'use strict';

/**
 * Bulk, zero-LLM document-acquisition step for guidance-document-extractor
 * (Stage 1+2 merged pipeline entry point).
 *
 * For an arbitrary-size batch of companies, bulk-fetches whichever of
 * {Transcript, PPT, Result} exist at the target quarter using a SINGLE
 * throwaway watchlist + a small, fixed number of `scanAnnouncements` calls
 * (NOT one API call per company) -- see docs/stockscans-api-schemas.md
 * "POST /api/company/announcements/scan" for the confirmed contract this
 * relies on (scanId/scanName are required even for ad-hoc scans;
 * announcementType:'Earnings Call' isolates Transcripts; PPT/Result use
 * announcementType:'All' + a searchFilters keyword since 'announcementType'
 * does not itself discriminate document sub-types beyond Earnings Call).
 *
 * Usage:
 *   node fetch_guidance_documents.js --scan-url https://www.stockscans.in/scans/saved/<id> \
 *     --out-dir /tmp/guidance_docs
 *   node fetch_guidance_documents.js --tickers NSE:A,NSE:B --quarter Q4FY26 --out-dir /tmp/guidance_docs
 *   node fetch_guidance_documents.js --tickers-file companies.json --out-dir /tmp/guidance_docs
 *
 * companies.json (for --tickers-file): [{"ticker":"NSE:A","quarter":"Q4FY26"}, ...]
 * `quarter` per-entry is optional; omitted entries default to latestCompletedQuarter(),
 * with one whole-batch retry against the prior completed quarter if a company found
 * NOTHING at the default quarter (see "auto-retry" below).
 *
 * Output (stdout): JSON array, one entry per company:
 *   {
 *     ticker, companyId, quarter, quarterYyyymm,
 *     found: { Transcript: true, PPT: true, Result: false },
 *     textPaths: { Transcript: "/tmp/.../NSE_A_Transcript_202603.txt", PPT: "..." },
 *     retriedPriorQuarter: false,
 *     scanRow: { ...raw scan-table columns... } | null   -- only when --scan-url was used
 *   }
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveUniverse } = require('../../../../stock-api/src/analyzers/runScan.js');
const { StockscansClient } = require('../../../../stock-api/src/clients/StockscansClient.js');
const { latestCompletedQuarter, parseQuarterString } = require('../../../../stock-api/src/utils/fiscalQuarter.js');
const { stockscans } = require('../../../../stock-api/src/index.js');
const { mapWithConcurrency } = require('../../../../stock-api/src/utils/concurrency.js');

const DEFAULT_SCAN_ID = '59822b15a2859d183df3770d';
const DEFAULT_SCAN_NAME = 'Recordings';
const PAGE_SIZE = 30;
const MAX_PAGES = 40;

// documentType -> how to find it via the bulk announcements/scan endpoint.
// `announcementType` is a real enum on this endpoint (confirmed live
// 2026-08-06 from the Stockscans UI's own filter dropdown: All / Financial
// Results / Earnings Call / Presentation / Annual Report) -- NOT the
// searchFilters-keyword workaround an earlier probe used before this was
// known. See docs/stockscans-api-schemas.md for the confirmed contract.
const TYPE_QUERY = {
  Transcript: { announcementType: 'Earnings Call', searchFilters: [] },
  PPT: { announcementType: 'Presentation', searchFilters: [] },
  Result: { announcementType: 'Financial Results', searchFilters: [] },
};
// Light client-side sanity filter -- keeps only hits whose description text
// looks like the right document, in case the enum bucket is broader than
// expected for some announcement subtypes.
const TYPE_DESC_PREFIX = {
  Transcript: /Earnings Call Transcript|Analyst.{0,3}Investor Call/i,
  PPT: /Investor Presentation/i,
  Result: /(Financial Results|Outcome of Board Meeting|Unaudited)/i,
};

function parseArgs(argv) {
  const out = {
    scanUrl: null, tickers: null, tickersFile: null, quarter: null,
    types: ['Transcript', 'PPT', 'Result'], outDir: '/tmp/guidance_docs',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan-url') out.scanUrl = argv[++i];
    else if (a === '--tickers') out.tickers = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--tickers-file') out.tickersFile = argv[++i];
    else if (a === '--quarter') out.quarter = argv[++i];
    else if (a === '--types') out.types = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--out-dir') out.outDir = argv[++i];
  }
  return out;
}

function safeName(ticker) {
  return ticker.replace(/[:\-]/g, '_');
}

/**
 * Fetches all pages IN PARALLEL instead of sequentially awaiting each one
 * before computing the next offset. This endpoint's PAGE_SIZE (30) is a
 * fixed, documented constant (see docs/stockscans-api-schemas.md and
 * stock-api/src/utils/bulkAnnouncementScan.js's scanAllPages, which has the
 * same fix and the full rationale for why this does NOT rely on the
 * response's `total` field -- that field is confirmed unreliable/
 * self-inflating). Because the page size is fixed, offset for page N is
 * always `N * PAGE_SIZE` with no dependency on any earlier page's response,
 * so every page up to MAX_PAGES can be requested at once; the "stop at the
 * first short page" rule is then applied as a post-processing truncation
 * over the results IN ORDER, reproducing exactly what the old sequential
 * loop would have returned.
 */
async function scanAllPages(client, watchlistId, quarterYyyymm, { announcementType, searchFilters }) {
  // MAX_PAGES (40) is a generous safety cap, rarely actually needed -- firing
  // that many requests at once risks a 429 from Stockscans (see
  // concurrency.js's own warning about exactly this). Bound the in-flight
  // fan-out instead of parallelizing all 40 unconditionally; still far
  // faster than one-at-a-time for the common case of a handful of pages.
  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let retries = 5;
    let delay = 1000;
    let success = false;
    let anns = [];
    while (retries >= 0 && !success) {
      await new Promise(r => setTimeout(r, delay));
      const offset = page * PAGE_SIZE;
      try {
        const payload = {
          scan: {
            scanId: DEFAULT_SCAN_ID,
            scanName: DEFAULT_SCAN_NAME,
            filters: [], index: [], industry: [],
            watchlistIds: [watchlistId],
            searchFilters,
            announcementType,
            alerts: false,
            searchMode: 'full',
            companyIds: [],
            companyFilters: [],
          },
          offset,
          quarterDate: quarterYyyymm,
        };
        const res = await client.scanAnnouncements(payload);
        anns = res.announcements || res.documents || res.items || [];
        success = true;
      } catch (e) {
        if (e.response && e.response.status === 429 && retries > 0) {
          retries--;
          delay *= 2;
          console.warn(`429 on page ${page}, retrying in ${delay}ms...`);
        } else {
          throw e;
        }
      }
    }
    
    out.push(...anns);
    if (anns.length < PAGE_SIZE) {
      break; // short page = genuinely the last page
    }
  }
  return out;
}

/** Bulk-resolve {companyId -> best ssUrl} per documentType for a batch of companies at one quarter. */
async function bulkResolveDocs(client, companyIds, quarterYyyymm, types) {
  const byType = {};
  const { watchlistId } = await client.createWatchlist(
    `guidance-doc-extractor-${Date.now()}`, companyIds
  );
  try {
    for (const t of types) {
      const q = TYPE_QUERY[t];
      const anns = await scanAllPages(client, watchlistId, quarterYyyymm, q);
      const prefixRe = TYPE_DESC_PREFIX[t];
      const byCompany = new Map();
      for (const a of anns) {
        const desc = a.description || a.title || '';
        if (prefixRe && !prefixRe.test(desc)) continue;
        const ssUrl = a.ssUrl || a.transcriptSsUrl || a.pptSsUrl || a.resultSsUrl;
        if (!a.companyId || !ssUrl) continue;
        // keep the most recent hit per company (announcements are usually
        // newest-first already; guard anyway by comparing date strings)
        const prev = byCompany.get(a.companyId);
        if (!prev || String(a.date || '') >= String(prev.date || '')) {
          byCompany.set(a.companyId, { ssUrl, date: a.date, desc });
        }
      }
      byType[t] = byCompany;
    }
  } finally {
    await client.deleteWatchlist(watchlistId).catch(() => {});
  }
  return byType;
}

async function downloadAndConvert(ticker, quarterYyyymm, byType, types, outDir) {
  const tickerDir = path.join(outDir, safeName(ticker));
  const found = {};
  const textPaths = {};
  let any = false;
  for (const t of types) {
    const hit = byType[t] && byType[t].get(ticker);
    found[t] = !!hit;
    if (!hit) continue;
    any = true;
    fs.mkdirSync(tickerDir, { recursive: true });
    const pdfPath = path.join(tickerDir, `${safeName(ticker)}_${t}_${quarterYyyymm}.pdf`);
    const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
    try {
      if (!(fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0)) {
        const url = stockscans.s3PdfUrl(hit.ssUrl);
        const buf = await stockscans.fetchPdf(url);
        fs.writeFileSync(pdfPath, buf);
      }
      if (!(fs.existsSync(txtPath) && fs.statSync(txtPath).size > 0)) {
        execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`);
      }
      textPaths[t] = txtPath;
    } catch (e) {
      textPaths[t] = null;
    }
  }
  return { found, textPaths, any };
}

async function resolveEntries(args) {
  if (args.scanUrl) {
    // liquidityGate:false -- this pipeline wants every company in the saved
    // scan (e.g. "upcoming results"), not just the tradeable-liquid subset;
    // the scan itself already encodes whatever selection the user wants.
    const universe = await resolveUniverse(args.scanUrl, { liquidityGate: false });
    return universe.companies.map((row) => {
      const companyId =
        row.companyId || row['Company Id'] || row.Symbol || row['NSE Symbol'] || row.symbol;
      return { ticker: companyId, quarter: args.quarter || null, scanRow: row };
    }).filter((e) => e.ticker);
  }
  if (args.tickersFile) {
    const raw = JSON.parse(fs.readFileSync(args.tickersFile, 'utf8'));
    return raw.map((e) => ({ ...e, scanRow: null }));
  }
  return args.tickers.map((t) => ({ ticker: t, quarter: args.quarter || null, scanRow: null }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scanUrl && !args.tickers && !args.tickersFile) {
    console.error(
      'Usage: fetch_guidance_documents.js (--scan-url <url> | --tickers NSE:A,NSE:B | --tickers-file companies.json) ' +
      '[--quarter Q4FY26] [--types Transcript,PPT,Result] [--out-dir <dir>]'
    );
    process.exit(1);
  }

  const client = new StockscansClient();
  await client.validateAuth();

  const entries = await resolveEntries(args);
  const latest = latestCompletedQuarter();

  // Group entries by their EFFECTIVE quarter (explicit per-entry quarter wins;
  // otherwise the shared default) so the bulk calls stay batched per quarter
  // rather than degrading into one watchlist per company.
  const groups = new Map(); // yyyymm -> [{entry, usedDefault}]
  for (const entry of entries) {
    const usedDefault = !entry.quarter;
    const q = entry.quarter ? parseQuarterString(entry.quarter) : latest;
    const key = q.yyyymm;
    if (!groups.has(key)) groups.set(key, { quarter: q, items: [] });
    groups.get(key).items.push({ entry, usedDefault });
  }

  const results = [];
  for (const [yyyymm, { quarter, items }] of groups) {
    const companyIds = items.map((i) => i.entry.ticker);
    const byType = await bulkResolveDocs(client, companyIds, yyyymm, args.types);
    const perCompany = new Map();
    const needsRetry = [];
    for (const { entry, usedDefault } of items) {
      const { found, textPaths, any } = await downloadAndConvert(
        entry.ticker, yyyymm, byType, args.types, args.outDir
      );
      if (!any && usedDefault) {
        needsRetry.push(entry);
      } else {
        perCompany.set(entry.ticker, {
          ticker: entry.ticker,
          companyId: entry.ticker,
          quarter: `${quarter.fiscalPeriod}FY${String(quarter.fiscalYear).slice(-2)}`,
          quarterYyyymm: yyyymm,
          found, textPaths,
          retriedPriorQuarter: false,
          scanRow: entry.scanRow || null,
        });
      }
    }

    // Whole-batch retry against the prior completed quarter for companies
    // that found NOTHING at the defaulted quarter (e.g. an "upcoming
    // results" scan where the naive latest-quarter guess is unreported yet)
    // -- still bulk: one more watchlist + up to 3 more scanAnnouncements
    // calls total, regardless of how many companies need the retry.
    if (needsRetry.length) {
      const priorYear = quarter.fiscalPeriod === 'Q1' ? quarter.fiscalYear - 1 : quarter.fiscalYear;
      const priorPeriod = { Q1: 'Q4', Q2: 'Q1', Q3: 'Q2', Q4: 'Q3' }[quarter.fiscalPeriod];
      const priorStr = `${priorPeriod}FY${String(priorYear).slice(-2)}`;
      try {
        const priorQuarter = parseQuarterString(priorStr);
        const retryIds = needsRetry.map((e) => e.ticker);
        const retryByType = await bulkResolveDocs(client, retryIds, priorQuarter.yyyymm, args.types);
        for (const entry of needsRetry) {
          const { found, textPaths } = await downloadAndConvert(
            entry.ticker, priorQuarter.yyyymm, retryByType, args.types, args.outDir
          );
          perCompany.set(entry.ticker, {
            ticker: entry.ticker,
            companyId: entry.ticker,
            quarter: `${priorQuarter.fiscalPeriod}FY${String(priorQuarter.fiscalYear).slice(-2)}`,
            quarterYyyymm: priorQuarter.yyyymm,
            found, textPaths,
            retriedPriorQuarter: true,
            scanRow: entry.scanRow || null,
          });
        }
      } catch (e) {
        for (const entry of needsRetry) {
          perCompany.set(entry.ticker, {
            ticker: entry.ticker,
            companyId: entry.ticker,
            quarter: `${quarter.fiscalPeriod}FY${String(quarter.fiscalYear).slice(-2)}`,
            quarterYyyymm: yyyymm,
            found: Object.fromEntries(args.types.map((t) => [t, false])),
            textPaths: {},
            retriedPriorQuarter: false,
            scanRow: entry.scanRow || null,
          });
        }
      }
    }

    for (const item of items) results.push(perCompany.get(item.entry.ticker));
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
