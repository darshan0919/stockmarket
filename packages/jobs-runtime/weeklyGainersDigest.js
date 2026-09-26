#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { stockscans } = require('@stock/api');
const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const { cachePath } = require('./lib/db');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');

/**
 * Paginate StockscansClient#runScan to completion for this digest's saved
 * scan. Was a hand-rolled `fetch()` against a hardcoded
 * `stockscans.in/api/company/scans/run` URL + a manually-built headers
 * object (including a raw `authtoken` cookie) — that path 404s since
 * Stockscans' 2026-09-16 refactor (now `POST /api/scans/stock/run`) and
 * duplicated logic StockscansClient#runScan already owns. Routing through
 * the shared client means any future Stockscans path/DTO change is a
 * one-file fix (see AGENTS.md "no direct third-party API calls" rule).
 *
 * @param {Object} payload - `{ratiosType, timePeriod, scan, watchlistIds,
 *   order, orderBy, offset}` — same shape this file already builds in main().
 * @param {string} [scanId] - forwarded to StockscansClient#runScan for the Referer header.
 */
async function runScan(payload, scanId) {
  let allRows = [];
  let header = null;
  let offset = 0;
  const limit = 50;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    payload.offset = offset;
    const data = await stockscans.runScan(payload, scanId);
    const table = data.table;
    if (!table || table.length <= 1) break;

    if (!header) header = table[0];
    allRows.push(...table.slice(1));

    if (offset + limit >= data.total) break;
    offset += limit;
  }

  return { header, rows: allRows };
}

function scanSourceHtml(scan) {
  const url = `https://www.stockscans.in/scans/saved/${scan.scanId}`;
  const filterText = (scan.filters || [])
    .map((f) => `${f.left} ${f.sign} ${f.right}`)
    .join(' &nbsp;·&nbsp; ');
  return `Source: <a href="${url}" style="color:#1a237e;text-decoration:none;font-weight:bold">${scan.scanName}</a> &nbsp;|&nbsp; ${filterText}`;
}

function makeLink(name, type) {
  const encoded = encodeURIComponent(name || '');
  const url =
    type === 'industry'
      ? `https://www.stockscans.in/scans/new?industry=${encoded}&filters=`
      : `https://www.stockscans.in/scans/new?sector=${encoded}&filters=`;
  return `<a href="${url}" style="color:#1a237e;text-decoration:none">${name || 'Unknown'}</a>`;
}

function tableHtml(title, counts, streakMap, streakScoreMap, type) {
  const rows = counts.map(
    (c) =>
      `<tr><td style="border-bottom:1px solid #eee">${makeLink(c.name, type)}</td><td style="border-bottom:1px solid #eee;text-align:right">${c.count}</td><td style="border-bottom:1px solid #eee;text-align:right">${streakMap[c.name] || 1}</td><td style="border-bottom:1px solid #eee;text-align:right">${streakScoreMap[c.name] || c.count}</td></tr>`
  );
  return `
  <h3 style="margin:24px 0 6px;font-family:Arial,sans-serif;color:#1a237e">${title}</h3>
  <table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font:13px Arial;width:100%;max-width:500px;white-space:nowrap">
    <tr style="background:#e8eaf6;text-align:left"><th style="border-bottom:2px solid #9fa8da">Name</th><th style="border-bottom:2px solid #9fa8da;text-align:right">Count</th><th style="border-bottom:2px solid #9fa8da;text-align:right">Streak</th><th style="border-bottom:2px solid #9fa8da;text-align:right">Streak Score</th></tr>
    ${rows.join('\n')}
  </table>`;
}

/**
 * Renders an HTML table of top gainers with linkified company names.
 *
 * @param {Array<{companyId: string, name: string, returns1W: number|null, mcap: number|null, sector: string|null, industry: string|null}>} gainers
 * @returns {string} HTML markup for the top gainers table.
 */
function topGainersTableHtml(gainers) {
  if (!gainers || gainers.length === 0) return '';
  const rows = gainers.map((g, idx) => {
    const returnVal = g.returns1W;
    const returnStr =
      returnVal != null && Number.isFinite(returnVal)
        ? `${returnVal > 0 ? '+' : ''}${returnVal.toFixed(2)}%`
        : '-';
    const mcapStr =
      g.mcap != null && Number.isFinite(g.mcap) ? Math.round(g.mcap).toLocaleString('en-IN') : '-';
    const link = stockscansLink(g.name, g.companyId, 'NSE', '#1a237e');
    const sectorOrInd = g.sector || g.industry || '-';
    const returnColor = returnVal != null && returnVal >= 0 ? '#2e7d32' : '#c62828';
    return `<tr><td style="border-bottom:1px solid #eee;text-align:right;color:#888">${idx + 1}</td><td style="border-bottom:1px solid #eee">${link}</td><td style="border-bottom:1px solid #eee;text-align:right;font-weight:bold;color:${returnColor}">${returnStr}</td><td style="border-bottom:1px solid #eee;text-align:right">${mcapStr}</td><td style="border-bottom:1px solid #eee">${sectorOrInd}</td></tr>`;
  });

  return `
  <h3 style="margin:24px 0 6px;font-family:Arial,sans-serif;color:#1a237e">Top 50 Weekly Gainers</h3>
  <table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font:13px Arial;width:100%;max-width:700px;white-space:nowrap">
    <tr style="background:#e8eaf6;text-align:left"><th style="border-bottom:2px solid #9fa8da;text-align:right;width:30px">#</th><th style="border-bottom:2px solid #9fa8da">Company</th><th style="border-bottom:2px solid #9fa8da;text-align:right">1W Return</th><th style="border-bottom:2px solid #9fa8da;text-align:right">Market Cap (₹ Cr)</th><th style="border-bottom:2px solid #9fa8da">Sector</th></tr>
    ${rows.join('\n')}
  </table>`;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const noEmail = process.argv.includes('--no-email');
  const force = process.argv.includes('--force');

  const payload = {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: {
      scanId: '2fe3e39accd614d970a335bc',
      scanName: 'Weekly Gainers',
      scanDescription: 'Weekly Gainers',
      industry: [],
      index: [],
      tags: [],
      watchlistIds: [],
      filters: [
        { left: 'Market Capitalization', sign: '>=', right: '1000' },
        { left: 'Volume * Close Price', sign: '>=', right: '50000000' },
        { left: 'Returns 1W', sign: '>=', right: '3' },
      ],
      alertFrequency: null,
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset: 0,
  };

  const { header, rows } = await runScan(payload, payload.scan.scanId);
  if (!header) {
    console.log('No data returned');
    return;
  }

  const lowerHeader = header.map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
  );
  const findCol = (...names) => {
    for (const name of names) {
      const idx = lowerHeader.indexOf(name.trim().toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // The scans/run API (ratiosType: 'Default') never returns a column literally
  // named "Industry" — only "Sector", which actually holds industry-grain
  // values (e.g. "Pharmaceuticals", "Banks"). Fall back to it so the
  // Industry table doesn't fill with "undefined".
  const sectorIdx = findCol('Sector');
  const industryIdx = findCol('Industry') !== -1 ? findCol('Industry') : sectorIdx;
  const companyIdIdx = findCol('companyId');
  const nameIdx = findCol('Name', 'companyName');
  const returns1WIdx = findCol('Returns 1W');
  const mcapIdx = findCol('Market Capitalization', 'Market Cap');

  const industryCounts = {};
  const sectorCounts = {};

  for (const r of rows) {
    const ind = r[industryIdx];
    const sec = r[sectorIdx];
    industryCounts[ind] = (industryCounts[ind] || 0) + 1;
    sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
  }

  const allGainers = rows.map((r) => {
    const companyId = companyIdIdx !== -1 && r[companyIdIdx] ? String(r[companyIdIdx]).trim() : '';
    const name = nameIdx !== -1 && r[nameIdx] ? String(r[nameIdx]).trim() : companyId || 'Unknown';
    const rawRet =
      returns1WIdx !== -1 && r[returns1WIdx] != null && r[returns1WIdx] !== ''
        ? Number(r[returns1WIdx])
        : null;
    const rawMcap =
      mcapIdx !== -1 && r[mcapIdx] != null && r[mcapIdx] !== '' ? Number(r[mcapIdx]) : null;
    return {
      companyId,
      name,
      returns1W: Number.isFinite(rawRet) ? rawRet : null,
      mcap: Number.isFinite(rawMcap) ? rawMcap : null,
      industry: industryIdx !== -1 && r[industryIdx] ? String(r[industryIdx]).trim() : null,
      sector: sectorIdx !== -1 && r[sectorIdx] ? String(r[sectorIdx]).trim() : null,
    };
  });

  const top50Gainers = [...allGainers]
    .sort((a, b) => {
      const retA = a.returns1W != null ? a.returns1W : -Infinity;
      const retB = b.returns1W != null ? b.returns1W : -Infinity;
      if (retB !== retA) return retB - retA;
      return (b.mcap || 0) - (a.mcap || 0);
    })
    .slice(0, 50);

  const target = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000); // IST Now
  const dd = String(target.getDate()).padStart(2, '0');
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dateLabel = [dd, mm, target.getFullYear()].join('-');
  const isoDate = `${target.getFullYear()}-${mm}-${dd}`;

  // Streak Logic
  const cacheFile = cachePath('streak_weeklyGainers.json');
  let cache = {
    lastRunDate: null,
    industryStreaks: {},
    sectorStreaks: {},
    industryStreakScores: {},
    sectorStreakScores: {},
  };
  if (fs.existsSync(cacheFile)) {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    cache.industryStreakScores = cache.industryStreakScores || {};
    cache.sectorStreakScores = cache.sectorStreakScores || {};
  }

  const sortCounts = (countsMap) => {
    return Object.entries(countsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  const industryAll = sortCounts(industryCounts);
  const sectorAll = sortCounts(sectorCounts);
  const top5Industries = industryAll.slice(0, 5).map((x) => x.name);
  const top5Sectors = sectorAll.slice(0, 5).map((x) => x.name);

  if (cache.lastRunDate !== isoDate || force) {
    const newIndStreaks = {};
    const newSecStreaks = {};
    const newIndStreakScores = {};
    const newSecStreakScores = {};
    for (const ind of top5Industries) {
      newIndStreaks[ind] = (cache.industryStreaks[ind] || 0) + 1;
      newIndStreakScores[ind] = (cache.industryStreakScores[ind] || 0) + (industryCounts[ind] || 0);
    }
    for (const sec of top5Sectors) {
      newSecStreaks[sec] = (cache.sectorStreaks[sec] || 0) + 1;
      newSecStreakScores[sec] = (cache.sectorStreakScores[sec] || 0) + (sectorCounts[sec] || 0);
    }
    cache.industryStreaks = newIndStreaks;
    cache.sectorStreaks = newSecStreaks;
    cache.industryStreakScores = newIndStreakScores;
    cache.sectorStreakScores = newSecStreakScores;
    cache.lastRunDate = isoDate;
    fs.mkdirSync(require('path').dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  const industrySorted = industryAll.slice(0, 5);
  const sectorSorted = sectorAll.slice(0, 5);

  const htmlBody = `
<div style="max-width:860px">
  ${tableHtml('Industry vs Count', industrySorted, cache.industryStreaks, cache.industryStreakScores, 'industry')}
  ${tableHtml('Sector vs Count', sectorSorted, cache.sectorStreaks, cache.sectorStreakScores, 'sector')}
  ${topGainersTableHtml(top50Gainers)}
  <p style="font:11px Arial;color:#999;margin:24px 0 0;border-top:1px solid #eee;padding-top:8px">${scanSourceHtml(payload.scan)}</p>
</div>`;

  let email = { status: 'skipped', reason: '--no-email' };
  if (!noEmail) {
    email = await sendHtmlEmail({
      subject: `📈 Weekly Gainers Digest ${dateLabel} — ${rows.length} stocks`,
      htmlBody: htmlBody,
      to: process.env.DEALS_DIGEST_TO || undefined,
    });
  }

  console.log(
    JSON.stringify(
      {
        date: dateLabel,
        totalGainers: rows.length,
        topIndustries: industrySorted.slice(0, 5),
        topSectors: sectorSorted.slice(0, 5),
        topGainers: top50Gainers.map((g) => ({
          name: g.name,
          companyId: g.companyId,
          returns1W: g.returns1W,
          mcap: g.mcap,
          sector: g.sector,
          industry: g.industry,
        })),
        email,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  const jobName = resolveJobName('weekly-gainers-digest');
  stockscans.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('weeklyGainersDigest failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = {
  main,
  runScan,
  topGainersTableHtml,
  tableHtml,
  makeLink,
  scanSourceHtml,
};
