'use strict';

/**
 * policySourcesFetch — deterministic first pass for the policy-event-tracker (zero LLM).
 * Fetches the machine-readable sources in lib/policySources.json for the last N days and emits dated, URL-bearing
 * CANDIDATES. It decides nothing about materiality or baskets: that stays with the agent. type=web sources are
 * listed under `webOnly` so the agent knows what still needs WebSearch/WebFetch.
 *   node lib/policySourcesFetch.js [--days 7] [--today YYYY-MM-DD] [--sources rbi-press,sebi]
 */

const registry = require('./policySources.json');

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** "Sat, 10 Oct 2026 01:25:00" | "09 Oct, 2026 +0530" -> "2026-10-10" (calendar date as written, no tz shift) */
function parseDate(s) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/.exec(s || '');
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const decode = (x) =>
  x
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

const tag = (block, name) => {
  const m = new RegExp(`<${name}>(.*?)</${name}>`, 's').exec(block);
  return m ? decode(m[1]) : '';
};

function fixLink(link, linkFix) {
  if (linkFix === 'doubleHttpsPrefix') {
    const i = link.indexOf('https://', 8);
    if (i > 0) return link.slice(i);
  }
  return link;
}

function kindHint(title, hints = registry.kindHints) {
  const h = hints.find((k) => new RegExp(k.regex, 'i').test(title));
  return h ? h.kind : null;
}

/** pure: RSS text -> candidates within [sinceDate, today]; drops items lacking a parseable date or https link */
function parseFeed(xml, src, { sinceDate, today }) {
  const noise = src.noiseTitleRegex ? new RegExp(src.noiseTitleRegex, 'i') : null;
  const out = [];
  for (const m of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const title = tag(m[1], 'title');
    const date = parseDate(tag(m[1], 'pubDate'));
    const url = fixLink(tag(m[1], 'link'), src.linkFix);
    if (!title || !date || !/^https:\/\//.test(url)) continue;
    if (date < sinceDate || date > today) continue;
    out.push({
      source: src.id,
      authority: src.authority,
      date,
      title,
      url,
      kindHint: kindHint(title),
      likelyNoise: !!(noise && noise.test(title)),
    });
  }
  return out;
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function main(argv = process.argv) {
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i > 0 ? argv[i + 1] : null;
  };
  const days = Number(arg('--days') || 7);
  const today = arg('--today') || new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const sinceDate = new Date(Date.parse(today) - days * 86400e3).toISOString().slice(0, 10);
  const only = arg('--sources') ? arg('--sources').split(',') : null;
  const candidates = [];
  const errors = [];
  const webOnly = [];
  for (const src of registry.sources) {
    if (only && !only.includes(src.id)) continue;
    if (src.type !== 'rss') {
      webOnly.push({
        id: src.id,
        name: src.name,
        url: src.url,
        agentHint: src.agentHint,
        verifiedOn: src.verifiedOn,
      });
      continue;
    }
    try {
      candidates.push(...parseFeed(await fetchText(src.url), src, { sinceDate, today }));
    } catch (e) {
      errors.push({ id: src.id, error: e.message });
    }
  }
  candidates.sort((a, b) => b.date.localeCompare(a.date));
  console.log(JSON.stringify({ today, sinceDate, candidates, webOnly, errors }, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error('policySourcesFetch failed:', e.message);
    process.exit(1);
  });
}
module.exports = { parseDate, parseFeed, kindHint, fixLink };
