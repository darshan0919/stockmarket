#!/usr/bin/env node
'use strict';

/**
 * packages/jobs-runtime/postCloseScanInsights.js
 *
 * Companion script for the `post-close-scan-insights` skill. Owns the parts
 * of the pipeline that are SPECIFIC to an ad-hoc, non-watchlist announcement
 * scan (fetch-to-cutoff pagination, noise filter, categorisation, heavy-doc
 * routing). Everything else — reading a PDF, loading company notes, writing
 * an insight note, marking an announcement processed — is deliberately NOT
 * duplicated here: it already exists in `watchlistInsights.js` and this
 * script's own SKILL.md instructs the caller to shell out to those same
 * commands, exactly as the original ad-hoc run in chat did by hand. See
 * skills/_shared/conventions.md §17 ("never think or write the same thing
 * twice") — this is the DEPENDENCIES-check outcome for this skill.
 *
 * Commands:
 *   fetch-scan [--window-hours N]   -> JSON array of raw announcements since cutoff
 *   filter-noise <fetch-scan.json>  -> {kept, dropped} after noise-keyword filter
 *   categorise <filter-noise kept>  -> adds {category, heavyDocument, pdfUrl}
 *   send-digest <insights.json>     -> emails a significance-grouped HTML digest
 */

const fs = require('fs');
const axios = require('axios');
const { StockscansAuth } = require('../../stock-api/src/auth/stockscansAuth');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const ist = require('./lib/ist');
const {
  shouldIgnoreAnnouncement,
  matchedNoiseKeyword,
} = require('../../stock-api/src/utils/announcementNoiseFilter');
const {
  categoriseAnnouncement,
  HEAVY_DOCUMENT_CATEGORIES,
  HIGH_CONVICTION_CATEGORIES,
} = require('./lib/announcementTaxonomy');

const BASE_URL = 'https://www.stockscans.in';
const PAGE_SIZE = 30; // documented convention (see bulkAnnouncementScan.js) — not the response's self-inflating `total`

// Deterministic default scan — the same ad-hoc universe used for the first
// manual run of this workflow (2026-08-19): mid/small-cap, price above its
// 200DMA, meaningful retail holding, liquid. Override by passing a full scan
// object via --scan-file if a different universe is ever wanted; the skill
// itself does not expose per-run scan editing since the nightly task always
// uses this fixed universe.
const DEFAULT_SCAN = {
  scanId: 'd5e2faa4cbed469c8624ce29',
  scanName: 'Test',
  filters: [
    { left: 'Market Capitalization', sign: '>=', right: '300' },
    { left: 'Market Capitalization', sign: '<', right: '50000' },
    { left: 'Close Price', sign: '>=', right: 'EMA 200D' },
    { left: 'Retail Holdings * Market Capitalization', sign: '>=', right: '5000' },
    { left: 'Volume SMA 20D * SMA 20D', sign: '>=', right: '50000000' },
  ],
  industry: [],
  index: [],
  watchlistIds: [],
  searchFilters: [],
  announcementType: 'All',
  alerts: false,
  searchMode: 'quick',
  companyIds: [],
  companyFilters: [],
};

function currentQuarterDate(date = new Date()) {
  // Same "next calendar quarter from filing date" semantics documented in
  // bulkAnnouncementScan.js computeReleaseQuarterDate — but since this scan
  // is about TODAY's/recent filings, we just want the quarter bucket the
  // most recent filings land in, which is simply the current IST calendar
  // quarter-end.
  const d = ist.istDate(date);
  const m = d.getUTCMonth(); // 0-11
  const q = Math.floor(m / 3); // 0..3
  const endMonth = (q + 1) * 3; // 3,6,9,12
  return `${d.getUTCFullYear()}${String(endMonth).padStart(2, '0')}`;
}

/**
 * Deterministic window: "since the most recent 3:30 PM IST market close
 * strictly before now". Run nightly at ~2 AM IST, this is always yesterday's
 * close (a ~10.5h window) — NOT a resumable cursor (see skill's Params
 * table for why this is intentionally simpler than watchlist-insights'
 * cursor pattern: a single nightly run close to market close leaves little
 * room for the multi-day-gap failure mode that pattern guards against; if a
 * run is missed entirely, re-run manually with --window-hours to cover the
 * gap explicitly rather than silently auto-expanding).
 */
function defaultCutoffUtc(now = new Date()) {
  const d = ist.istDate(now);
  const today1530 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 30, 0));
  let cutoffIst = today1530;
  if (d.getTime() < today1530.getTime()) {
    cutoffIst = new Date(today1530.getTime() - 24 * 60 * 60 * 1000);
  }
  // cutoffIst is a UTC-typed Date holding IST wall-clock fields (istDate's
  // convention) — convert back to a real UTC instant.
  return new Date(cutoffIst.getTime() - (5 * 60 + 30) * 60 * 1000);
}

function parseAnnDateToUtc(str) {
  if (!str) return null;
  if (/[+-]\d{2}:\d{2}$/.test(str) || /Z$/.test(str)) return new Date(str);
  const m = String(str).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, dd, h, mi, s] = m.map(Number);
    return new Date(Date.UTC(y, mo - 1, dd, h, mi, s) - (5 * 60 + 30) * 60 * 1000);
  }
  return new Date(str);
}

function authHeaders() {
  const auth = new StockscansAuth({ envPath: `${__dirname}/../../.env` });
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: BASE_URL,
    cookie: `authtoken=${auth.getToken()}`,
    referer: `${BASE_URL}/announcement-scans`,
  };
}

async function cmdFetchScan(argv) {
  loadEnv(argValue(argv, '--env-file', null));
  const windowHoursArg = argValue(argv, '--window-hours', null);
  const now = new Date();
  const cutoffUtc = windowHoursArg
    ? new Date(now.getTime() - Number(windowHoursArg) * 60 * 60 * 1000)
    : defaultCutoffUtc(now);
  const quarterDate = currentQuarterDate(now);

  const all = [];
  const inWindow = [];
  let offset = 0;
  let page = 0;
  const MAX_PAGES = 80; // safety cap, not a trust boundary — see stop conditions below

  while (page < MAX_PAGES) {
    const payload = { scan: DEFAULT_SCAN, offset, quarterDate };
    const { data } = await axios.post(`${BASE_URL}/api/company/announcements/scan`, payload, {
      headers: authHeaders(),
      timeout: 30000,
    });
    const items = data.announcements || data.documents || data.items || [];
    if (!items.length) break;
    all.push(...items);

    let crossedCutoff = false;
    for (const item of items) {
      const dt = parseAnnDateToUtc(item.createdAt || item.date);
      if (dt && dt.getTime() >= cutoffUtc.getTime()) {
        inWindow.push({ ...item, __parsedUtc: dt.toISOString() });
      } else {
        crossedCutoff = true;
      }
    }
    offset += items.length;
    page += 1;
    if (items.length < PAGE_SIZE) break; // short page = last page
    if (crossedCutoff) break; // results are newest-first — safe to stop once we've seen an out-of-window item
  }

  process.stdout.write(
    JSON.stringify({ cutoffUtc: cutoffUtc.toISOString(), quarterDate, totalFetched: all.length, inWindow }, null, 2)
  );
}

function cmdFilterNoise(argv) {
  const file = argv[0];
  if (!file) throw new Error('filter-noise requires a fetch-scan output JSON file path');
  const { inWindow } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const kept = [];
  const dropped = [];
  for (const item of inWindow) {
    const match = matchedNoiseKeyword(item);
    if (match) dropped.push({ ...item, __droppedReason: match });
    else kept.push(item);
  }
  process.stdout.write(JSON.stringify({ kept, dropped }, null, 2));
}

function cmdCategorise(argv) {
  const file = argv[0];
  if (!file) throw new Error('categorise requires a filter-noise output JSON file path (or {kept:[...]} shape)');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = raw.kept || raw;
  const out = items.map((item) => {
    const category = categoriseAnnouncement(item.title, item.description);
    return {
      companyId: item.companyId,
      name: item.name,
      title: item.title,
      description: item.description,
      category,
      heavyDocument: HEAVY_DOCUMENT_CATEGORIES.has(category),
      highConviction: HIGH_CONVICTION_CATEGORIES.has(category),
      ssUrl: item.ssUrl,
      pdfUrl: `${BASE_URL}/document/${item.ssUrl}`,
      createdAt: item.createdAt,
      date: item.date,
    };
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

const SIG_META = {
  high: { label: 'High significance', color: '#b42318', bg: '#fef3f2', border: '#fda29b' },
  medium: { label: 'Medium significance', color: '#b54708', bg: '#fffaeb', border: '#fec84b' },
  low: { label: 'Low significance', color: '#344054', bg: '#f9fafb', border: '#d0d5dd' },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildDigestHtml(insights, { cutoffIstHuman, runIstHuman }) {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...insights].sort((a, b) => (order[a.significance] ?? 3) - (order[b.significance] ?? 3));
  const groups = { high: [], medium: [], low: [] };
  for (const it of sorted) (groups[it.significance] || (groups[it.significance] = [])).push(it);

  const sections = ['high', 'medium', 'low']
    .filter((sig) => groups[sig] && groups[sig].length)
    .map((sig) => {
      const meta = SIG_META[sig];
      const cards = groups[sig]
        .map(
          (it) => `
        <div style="background:#fff;border:1px solid #eaecf0;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-weight:700;font-size:14px;">${esc(it.companyId)} <span style="font-size:11px;font-weight:600;color:#667085;text-transform:uppercase;">${esc(it.category)}</span></div>
          <div style="font-size:13px;line-height:1.55;color:#344054;margin-top:6px;">${esc(it.insight)}</div>
        </div>`
        )
        .join('');
      return `
      <div style="margin-bottom:28px;">
        <div style="border-bottom:2px solid ${meta.border};padding-bottom:6px;margin-bottom:12px;">
          <span style="font-size:15px;font-weight:700;color:${meta.color};text-transform:uppercase;">${meta.label}</span>
          <span style="font-size:12px;font-weight:600;color:${meta.color};background:${meta.bg};border:1px solid ${meta.border};border-radius:999px;padding:2px 10px;margin-left:8px;">${groups[sig].length}</span>
        </div>
        ${cards}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px;color:#101828;">
    <h2 style="margin:0 0 4px;">Post-Close Announcement Insights</h2>
    <p style="color:#667085;font-size:13px;margin:0 0 20px;">Window: ${esc(cutoffIstHuman)} &rarr; ${esc(runIstHuman)} &nbsp;&middot;&nbsp; ${insights.length} insight(s)</p>
    ${sections || '<p style="color:#667085;">No non-routine announcements in this window.</p>'}
  </body></html>`;
}

async function cmdSendDigest(argv) {
  loadEnv(argValue(argv, '--env-file', null));
  const file = argv[0];
  if (!file) throw new Error('send-digest requires an insights JSON array file path');
  const insights = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cutoffIstHuman = argValue(argv, '--cutoff-human', '');
  const runIstHuman = ist.nowIstHuman();
  const html = buildDigestHtml(insights, { cutoffIstHuman, runIstHuman });
  const highCount = insights.filter((i) => i.significance === 'high').length;
  const subject = `Post-Close Insights — ${ist.nowIstDate()}${highCount ? ` (${highCount} high-conviction)` : ''}`;
  const result = await sendHtmlEmail({ subject, htmlBody: html });
  process.stdout.write(JSON.stringify({ status: result.status || 'sent', subject, count: insights.length }, null, 2));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = {
    'fetch-scan': cmdFetchScan,
    'filter-noise': cmdFilterNoise,
    categorise: cmdCategorise,
    'send-digest': cmdSendDigest,
  };
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(`Usage: postCloseScanInsights.js <${Object.keys(commands).join('|')}> [args]\n`);
    process.exit(1);
  }
  await fn(rest);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
  process.exit(1);
});
