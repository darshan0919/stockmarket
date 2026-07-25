#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const { cachePath } = require('./lib/db');

function getHeaders() {
  const token = (process.env.STOCKSCANS_AUTH_TOKEN || '').trim();
  return {
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    cookie: `authtoken=${token}`,
    origin: 'https://www.stockscans.in',
    priority: 'u=1, i',
    referer: 'https://www.stockscans.in/scans/saved/2fe3e39accd614d970a335bc',
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'x-sync-source': 'buyie8y5mrhtgcbs',
  };
}

async function runScan(payload) {
  let allRows = [];
  let header = null;
  let offset = 0;
  const limit = 50;

  const authToken = process.env.STOCKSCANS_AUTH_TOKEN;
  const headers = {
    ...getHeaders(),
    ...(authToken ? { cookie: `authtoken=${authToken.trim()}` } : {}),
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    payload.offset = offset;
    const res = await fetch('https://www.stockscans.in/api/company/scans/run', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const json = await res.json();
    if (!json.table || json.table.length <= 1) break;

    if (!header) header = json.table[0];
    allRows.push(...json.table.slice(1));

    if (offset + limit >= json.total) break;
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

function tableHtml(title, counts, streakMap, type) {
  const rows = counts.map(
    (c) =>
      `<tr><td style="border-bottom:1px solid #eee">${makeLink(c.name, type)}</td><td style="border-bottom:1px solid #eee;text-align:right">${c.count}</td><td style="border-bottom:1px solid #eee;text-align:right">${streakMap[c.name] || 1}</td></tr>`
  );
  return `
  <h3 style="margin:24px 0 6px;font-family:Arial,sans-serif;color:#1a237e">${title}</h3>
  <table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font:13px Arial;width:100%;max-width:500px;white-space:nowrap">
    <tr style="background:#e8eaf6;text-align:left"><th style="border-bottom:2px solid #9fa8da">Name</th><th style="border-bottom:2px solid #9fa8da;text-align:right">Count</th><th style="border-bottom:2px solid #9fa8da;text-align:right">Streak</th></tr>
    ${rows.join('\n')}
  </table>`;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const noEmail = process.argv.includes('--no-email');

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

  const { header, rows } = await runScan(payload);
  if (!header) {
    console.log('No data returned');
    return;
  }

  const industryIdx = header.indexOf('Industry');
  const sectorIdx = header.indexOf('Sector');

  const industryCounts = {};
  const sectorCounts = {};

  for (const r of rows) {
    const ind = r[industryIdx];
    const sec = r[sectorIdx];
    industryCounts[ind] = (industryCounts[ind] || 0) + 1;
    sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
  }

  const target = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000); // IST Now
  const dd = String(target.getDate()).padStart(2, '0');
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dateLabel = [dd, mm, target.getFullYear()].join('-');
  const isoDate = `${target.getFullYear()}-${mm}-${dd}`;

  // Streak Logic
  const cacheFile = cachePath('streak_weeklyGainers.json');
  let cache = { lastRunDate: null, industryStreaks: {}, sectorStreaks: {} };
  if (fs.existsSync(cacheFile)) {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
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

  if (cache.lastRunDate !== isoDate) {
    const newIndStreaks = {};
    const newSecStreaks = {};
    for (const ind of top5Industries) {
      newIndStreaks[ind] = (cache.industryStreaks[ind] || 0) + 1;
    }
    for (const sec of top5Sectors) {
      newSecStreaks[sec] = (cache.sectorStreaks[sec] || 0) + 1;
    }
    cache.industryStreaks = newIndStreaks;
    cache.sectorStreaks = newSecStreaks;
    cache.lastRunDate = isoDate;
    fs.mkdirSync(require('path').dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  const industrySorted = industryAll.slice(0, 5);
  const sectorSorted = sectorAll.slice(0, 5);

  const htmlBody = `
<div style="max-width:860px">
  ${tableHtml('Industry vs Count', industrySorted, cache.industryStreaks, 'industry')}
  ${tableHtml('Sector vs Count', sectorSorted, cache.sectorStreaks, 'sector')}
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
        email,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('weeklyGainersDigest failed:', e);
    process.exit(1);
  });
}
module.exports = { main };
