#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const { cachePath } = require('./lib/db');

const getHeaders = (authToken) => ({
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  cookie: `_ga=GA1.1.923358363.1766992983; authtoken=${authToken}; lastLayout=7e0f8a1d63c1dacad645ffab; theme=light; _clck=n576cg%5E2%5Eg7o%5E0%5E2189; _ga_6GLNXH796V=GS2.1.s1783858803$o886$g1$t1783860950$j45$l0$h0; _clsk=wdey55%5E1783860951450%5E10%5E1%5Ey.clarity.ms%2Fcollect`,
  origin: 'https://www.stockscans.in',
  priority: 'u=1, i',
  referer: 'https://www.stockscans.in/scans/saved/7f7e2d4044f428e69254ce31',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'x-sync-source': 'vizcbbsxmrhsr8un',
});

async function runScan(payload, authToken) {
  let allRows = [];
  let header = null;
  let offset = 0;
  const limit = 50;

  while (true) {
    payload.offset = offset;
    const res = await fetch('https://www.stockscans.in/api/company/scans/run', {
      method: 'POST',
      headers: getHeaders(authToken),
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

function tableHtml(title, counts, streakMap) {
  const rows = counts.map(
    (c) =>
      `<tr><td style="border-bottom:1px solid #eee">${c.name || 'Unknown'}</td><td style="border-bottom:1px solid #eee;text-align:right">${c.count}</td><td style="border-bottom:1px solid #eee;text-align:right">${streakMap[c.name] || 1}</td></tr>`
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
      scanId: '7f7e2d4044f428e69254ce31',
      scanName: 'Top Gainers',
      scanDescription: 'Top Gainers',
      industry: [],
      index: [],
      tags: [],
      watchlistIds: [],
      filters: [
        { left: 'Market Capitalization', sign: '>=', right: '500' },
        { left: 'Returns 1D', sign: '>=', right: '5' },
      ],
      alertFrequency: null,
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset: 0,
  };

  const { header, rows } = await runScan(payload, process.env.STOCKSCANS_AUTH_TOKEN);
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
  const cacheFile = cachePath('streak_dailyGainers.json');
  let cache = { lastRunDate: null, industryStreaks: {}, sectorStreaks: {} };
  if (fs.existsSync(cacheFile)) {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  if (cache.lastRunDate !== isoDate) {
    const newIndStreaks = {};
    const newSecStreaks = {};
    for (const ind of Object.keys(industryCounts)) {
      newIndStreaks[ind] = (cache.industryStreaks[ind] || 0) + 1;
    }
    for (const sec of Object.keys(sectorCounts)) {
      newSecStreaks[sec] = (cache.sectorStreaks[sec] || 0) + 1;
    }
    cache.industryStreaks = newIndStreaks;
    cache.sectorStreaks = newSecStreaks;
    cache.lastRunDate = isoDate;
    fs.mkdirSync(require('path').dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  const sortCounts = (countsMap, streakMap) => {
    return Object.entries(countsMap)
      .map(([name, count]) => ({ name, count, streak: streakMap[name] || 1 }))
      .sort((a, b) => b.count - a.count || b.streak - a.streak);
  };

  const industrySorted = sortCounts(industryCounts, cache.industryStreaks);
  const sectorSorted = sortCounts(sectorCounts, cache.sectorStreaks);

  const htmlBody = `
<div style="max-width:860px">
  <h2 style="font-family:Arial;color:#0d1333;margin:0">Daily Gainers Digest — ${dateLabel}</h2>
  <p style="font:12px Arial;color:#666;margin:4px 0 0">Top Gainers (Market Cap &gt;= 500, Returns 1D &gt;= 5%) by Industry and Sector.</p>
  ${tableHtml('Industry vs Count', industrySorted, cache.industryStreaks)}
  ${tableHtml('Sector vs Count', sectorSorted, cache.sectorStreaks)}
</div>`;

  let email = { status: 'skipped', reason: '--no-email' };
  if (!noEmail) {
    email = await sendHtmlEmail({
      subject: `📈 Daily Gainers Digest ${dateLabel} — ${rows.length} stocks`,
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
    console.error('dailyGainersDigest failed:', e);
    process.exit(1);
  });
}
module.exports = { main };
