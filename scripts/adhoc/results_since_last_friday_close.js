#!/usr/bin/env node
'use strict';

/**
 * Standalone (no-repo-deps) version of results_since_last_friday_close.js —
 * needed because this runs from a network-open environment while the
 * project's stock-api package normally runs from the user's machine, where
 * outbound calls to stockscans.in are blocked by a local network allowlist.
 * Endpoint shapes, headers, and the throwaway-watchlist method are copied
 * 1:1 from stock-api/src/clients/StockscansClient.js and
 * docs/stockscans-api-schemas.md (see that repo for the canonical source).
 */

const axios = require('axios');
const fs = require('fs');

const TOKEN = process.env.STOCKSCANS_AUTH_TOKEN;
if (!TOKEN) {
  console.error('STOCKSCANS_AUTH_TOKEN not set.');
  process.exit(1);
}

const BASE_URL = 'https://www.stockscans.in';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function headers(referer) {
  return {
    'User-Agent': USER_AGENT,
    accept: 'application/json',
    'content-type': 'application/json',
    origin: BASE_URL,
    cookie: `authtoken=${TOKEN}`,
    referer,
  };
}

const http = axios.create({ timeout: 30000 });

function parseScanId(arg) {
  const m = arg.match(/\/scans\/saved\/([a-f0-9]{24})/);
  if (m) return m[1];
  if (/^[a-f0-9]{24}$/.test(arg.trim())) return arg.trim();
  throw new Error(`Could not parse scanId from '${arg}'`);
}

async function getScanMetadata(scanId) {
  const { data } = await http.get(
    `${BASE_URL}/api/user/saved-scans/${encodeURIComponent(scanId)}`,
    {
      headers: headers(`${BASE_URL}/scans/saved/${scanId}`),
    }
  );
  return data;
}

async function runScan(payload, scanId) {
  const referer = scanId ? `${BASE_URL}/scans/saved/${scanId}` : `${BASE_URL}/scans`;
  const { data } = await http.post(`${BASE_URL}/api/company/scans/run`, payload, {
    headers: headers(referer),
  });
  return data;
}

async function createWatchlist(name, companyIds) {
  const { data } = await http.post(
    `${BASE_URL}/api/user/watchlists`,
    { watchlistName: name, companyIds },
    { headers: headers(`${BASE_URL}/watchlists`) }
  );
  return data;
}

async function deleteWatchlist(watchlistId) {
  const { data } = await http.delete(`${BASE_URL}/api/user/watchlists`, {
    headers: headers(`${BASE_URL}/watchlists`),
    data: { watchlistId },
  });
  return data;
}

async function scanAnnouncements(payload) {
  const { data } = await http.post(`${BASE_URL}/api/company/announcements/scan`, payload, {
    headers: headers(`${BASE_URL}/announcement-scans`),
  });
  return data;
}

// ── Time logic ────────────────────────────────────────────────────────────

const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 45;
const IST_OFFSET_MIN = 5 * 60 + 30;

function nowIst() {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MIN * 60000 + now.getTimezoneOffset() * 60000);
}

function lastFridayCloseUtc(referenceIst) {
  const ist = new Date(referenceIst.getTime());
  const dow = ist.getDay();
  let daysSinceFriday = (dow - 5 + 7) % 7;
  const closeSameDay = new Date(ist);
  closeSameDay.setHours(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE, 0, 0);
  if (daysSinceFriday === 0 && ist < closeSameDay) daysSinceFriday = 7;
  const fridayIst = new Date(ist);
  fridayIst.setDate(fridayIst.getDate() - daysSinceFriday);
  fridayIst.setHours(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE, 0, 0);
  return new Date(
    fridayIst.getTime() - IST_OFFSET_MIN * 60000 - fridayIst.getTimezoneOffset() * 60000
  );
}

function currentQuarterDate(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const qEndMonth = Math.floor(m / 3) * 3 + 3;
  return `${y}${String(qEndMonth).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scanArg = args._[0];
  if (!scanArg) {
    console.error('Usage: node run.js <scanUrlOrId> [--json out.json]');
    process.exit(1);
  }

  const referenceIst = nowIst();
  const cutoffUtc = lastFridayCloseUtc(referenceIst);
  console.error(`[info] Reference (IST wall-clock): ${referenceIst.toISOString()}`);
  console.error(
    `[info] Cutoff: last Friday ${MARKET_CLOSE_HOUR}:${String(MARKET_CLOSE_MINUTE).padStart(2, '0')} IST close`
  );
  console.error(`[info] Cutoff UTC instant: ${cutoffUtc.toISOString()}`);

  console.error('[step 1/4] Resolving scan universe...');
  const scanId = parseScanId(scanArg);
  const definition = await getScanMetadata(scanId);
  const scanName = definition.scanName || scanId;
  const runPayload = {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: definition,
    watchlistIds: definition.watchlistIds || [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset: 0,
  };

  const allRows = [];
  let total = null;
  let offset = 0;
  while (total === null || offset < total) {
    runPayload.offset = offset;
    const runResp = await runScan(runPayload, scanId);
    const table = runResp.table;
    let rows = [];
    if (table && table.length > 0) {
      const header = table[0];
      for (let i = 1; i < table.length; i++) {
        const raw = table[i];
        const rowObj = {};
        for (let j = 0; j < Math.min(header.length, raw.length); j++) rowObj[header[j]] = raw[j];
        rows.push(rowObj);
      }
    }
    total = runResp.total || rows.length;
    if (rows.length === 0) break;
    allRows.push(...rows);
    offset += rows.length;
  }

  const companyIds = allRows
    .map((c) => c['Symbol'] || c['symbol'] || c['companyId'] || c['Company Id'])
    .filter(Boolean);
  console.error(
    `[info] Scan "${scanName}" resolved to ${companyIds.length} companies (raw total ${total}).`
  );
  if (!companyIds.length) {
    console.error('[warn] No companyIds resolved. First row keys:', Object.keys(allRows[0] || {}));
    process.exit(1);
  }

  console.error('[step 2/4] Creating throwaway watchlist...');
  const tempName = `__results_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let watchlistId = null;
  let allAnnouncements = [];
  try {
    const created = await createWatchlist(tempName, companyIds);
    watchlistId = created.watchlistId;
    if (!watchlistId) throw new Error('createWatchlist did not return a watchlistId');
    console.error(`[info] Watchlist created: ${watchlistId}`);

    console.error('[step 3/4] Scanning Financial Results announcements...');
    const qDate = currentQuarterDate();
    let aOffset = 0;
    const PAGE_SIZE = 30;
    for (;;) {
      const payload = {
        scan: {
          scanId: '59822b15a2859d183df3770d',
          scanName: 'Recordings',
          filters: [],
          industry: [],
          index: [],
          watchlistIds: [watchlistId],
          searchFilters: [],
          announcementType: 'Financial Results',
          alerts: false,
          searchMode: 'full',
          companyIds: [],
          companyFilters: [],
        },
        offset: aOffset,
        quarterDate: qDate,
      };
      const res = await scanAnnouncements(payload);
      const page = res.announcements || res.documents || res.items || [];
      allAnnouncements.push(...page);
      if (page.length < PAGE_SIZE) break;
      aOffset += page.length;
      if (aOffset > 3000) {
        console.error('[warn] Offset exceeded 3000 — stopping as a safety cap.');
        break;
      }
    }
    console.error(
      `[info] Fetched ${allAnnouncements.length} Financial Results announcements for quarterDate=${qDate}.`
    );
  } finally {
    if (watchlistId) {
      console.error('[cleanup] Deleting throwaway watchlist...');
      try {
        await deleteWatchlist(watchlistId);
      } catch (err) {
        console.error(`[warn] Failed to delete watchlist ${watchlistId}: ${err.message}`);
      }
    }
  }

  console.error('[step 4/4] Filtering to announcements declared after last Friday close...');
  // `createdAt` (e.g. "2026-08-14 21:27:28.640677") and the date-only `date`
  // field (e.g. "2026-08-14") are naive strings with NO timezone marker, but
  // are Stockscans' own IST wall-clock timestamps (confirmed by cross-checking
  // sample announcements against known IST filing times, e.g. a "Board
  // Meeting held on Friday 14th August 2026" filing carrying createdAt
  // "2026-08-14 21:27:28"). `new Date(...)` on a string with no zone/offset
  // is parsed as LOCAL time in Node — which is UTC in this container — so
  // treating these as UTC silently shifts every timestamp 5:30 early
  // (and turns date-only fields into UTC-midnight, which can wrongly land a
  // same-day-after-close announcement on the wrong side of the cutoff).
  // Fix: parse the naive string as wall-clock components and explicitly
  // interpret them as IST before comparing to the IST-based cutoff.
  function parseAsIst(raw) {
    // Accept "YYYY-MM-DD HH:mm:ss(.ffffff)?" or bare "YYYY-MM-DD".
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) return null;
    const [, y, mo, da, h = '0', mi = '0', se = '0'] = m;
    // Build the UTC instant that corresponds to this wall-clock time in IST
    // (IST = UTC+5:30, so subtract 5:30 from the wall-clock reading to get UTC).
    const utcMs = Date.UTC(+y, +mo - 1, +da, +h, +mi, +se) - IST_OFFSET_MIN * 60000;
    return new Date(utcMs);
  }
  const dateFields = ['createdAt', 'date', 'announcementDate', 'publishedAt', 'timestamp'];
  function extractDate(a) {
    for (const f of dateFields) {
      if (a[f]) {
        const d = parseAsIst(a[f]);
        if (d && !isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  // The "Financial Results" announcementType bucket is confirmed (see
  // docs/stockscans-api-schemas.md) to include adjacent, non-results
  // categories server-side (e.g. Regulation 30 director-cessation notices).
  // Apply a light client-side sanity filter on title/description so a
  // same-quarter unrelated filing doesn't masquerade as a results
  // declaration — err on the side of keeping ambiguous "Board Meeting
  // Outcome" titles (those genuinely are how results are usually filed).
  const NON_RESULTS_TITLE_RE = /cessation|resignation|appointment.*director|record date/i;
  const RESULTS_HINT_RE = /financial results?|board meeting|unaudited|audited/i;
  function looksLikeResults(a) {
    const text = `${a.title || ''} ${a.description || ''}`;
    if (NON_RESULTS_TITLE_RE.test(a.title || '')) return false;
    return RESULTS_HINT_RE.test(text);
  }

  const results = [];
  const nonResults = [];
  const undated = [];
  for (const a of allAnnouncements) {
    if (!looksLikeResults(a)) {
      nonResults.push(a);
      continue;
    }
    const d = extractDate(a);
    if (!d) {
      undated.push(a);
      continue;
    }
    if (d >= cutoffUtc) results.push({ ...a, _parsedDate: d.toISOString() });
  }

  const byCompany = new Map();
  for (const r of results) {
    const existing = byCompany.get(r.companyId);
    if (!existing || new Date(r._parsedDate) > new Date(existing._parsedDate))
      byCompany.set(r.companyId, r);
  }
  const deduped = [...byCompany.values()].sort(
    (a, b) => new Date(b._parsedDate) - new Date(a._parsedDate)
  );

  console.error(
    `[info] ${deduped.length} companies declared Financial Results after last Friday's close ` +
      `(${undated.length} unparseable dates excluded, ${nonResults.length} non-results announcements excluded).`
  );

  const output = {
    scanId,
    scanName,
    scanUniverseSize: companyIds.length,
    cutoffUtc: cutoffUtc.toISOString(),
    cutoffDescription: `Last Friday ${MARKET_CLOSE_HOUR}:${String(MARKET_CLOSE_MINUTE).padStart(2, '0')} IST market close`,
    referenceTimeIst: referenceIst.toISOString(),
    quarterDateSearched: currentQuarterDate(),
    totalAnnouncementsFetched: allAnnouncements.length,
    undatedExcluded: undated.length,
    nonResultsExcluded: nonResults.length,
    resultsSinceFridayClose: deduped.map((r) => ({
      companyId: r.companyId,
      companyName: r.companyName || r.name || r.Name || null,
      title: r.title || r.description || null,
      date: r._parsedDate,
      ssUrl: r.ssUrl || r.transcriptSsUrl || r.resultSsUrl || null,
      documentUrl:
        r.ssUrl || r.transcriptSsUrl || r.resultSsUrl
          ? `https://www.stockscans.in/document/${r.ssUrl || r.transcriptSsUrl || r.resultSsUrl}`
          : null,
    })),
  };

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(output, null, 2), 'utf-8');
    console.error(`[info] Wrote JSON to ${args.json}`);
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  if (err.response) {
    console.error(
      '[fatal] HTTP',
      err.response.status,
      JSON.stringify(err.response.data).slice(0, 500)
    );
  } else {
    console.error('[fatal]', err.message);
  }
  process.exit(1);
});
