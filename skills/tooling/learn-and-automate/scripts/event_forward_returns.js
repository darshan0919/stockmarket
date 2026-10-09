#!/usr/bin/env node
'use strict';
/**
 * event_forward_returns.js — generic event-study harness (zero LLM).
 * Input : JSONL rows {id, company?, companyId?, date:'YYYY-MM-DD', group?}
 * Output: <out>.rows.jsonl (per-event forward returns) + <out>.summary.json (per-group stats) + <out>.unmatched.json
 * Entry price = first daily close ON/AFTER the event date. Returns are RAW (no benchmark), measured at
 * +1d, +5d, +15d, +21d, +63d, +126d, +252d trading days. The event date is when a tweet/note was dated, which can
 * lag the real announcement — treat results as directional evidence, not alpha.
 * Usage: node event_forward_returns.js --in events.jsonl --out <path-prefix> [--overrides symbol_overrides.json]
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../..');
require('dotenv').config({ path: path.join(root, '.env') });
const { StockscansClient } = require(path.join(root, 'stock-api/src/clients/StockscansClient.js'));
const { fetchTier } = require(path.join(root, 'stock-api/src/fetchers/reactionCandlesFetcher.js'));

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const HORIZONS = [1, 5, 15, 21, 63, 126, 252];
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const STOP = new Set([
  'ltd',
  'limited',
  'india',
  'indian',
  'industries',
  'industry',
  'corp',
  'corporation',
  'company',
  'co',
  'the',
  'pvt',
  'private',
]);
const toks = (s) =>
  norm(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t));

function buildMatcher(overrides) {
  const companies = Object.values(
    JSON.parse(fs.readFileSync(path.join(root, 'data/companies.json'), 'utf8'))
  );
  const rows = companies
    .filter((c) => c.nseTicker || c.id)
    .map((c) => ({
      id: c.nseTicker && c.nseTicker.includes(':') ? c.nseTicker : c.id,
      name: c.name || '',
      n: norm(c.name),
      t: toks(c.name),
      sym: String(c.id || '').split(':')[1] || '',
    }));
  return (q) => {
    if (overrides[q]) return { id: overrides[q], how: 'override' };
    const nq = norm(q);
    const tq = toks(q);
    if (!nq) return null;
    const exact = rows.filter((r) => r.n === nq || r.sym.toLowerCase() === nq.replace(/ /g, ''));
    if (exact.length === 1) return { id: exact[0].id, how: 'exact' };
    const starts = rows.filter((r) => r.n.startsWith(nq + ' ') || r.n === nq);
    if (starts.length === 1) return { id: starts[0].id, how: 'prefix' };
    if (tq.length) {
      const all = rows.filter((r) => tq.every((t) => r.t.includes(t)));
      if (all.length === 1) return { id: all[0].id, how: 'tokens' };
    }
    return null;
  };
}

async function main() {
  const inFile = arg('--in');
  const out = arg('--out');
  if (!inFile || !out) throw new Error('--in and --out required');
  const overrides = arg('--overrides')
    ? JSON.parse(fs.readFileSync(arg('--overrides'), 'utf8'))
    : {};
  const events = fs
    .readFileSync(inFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const match = buildMatcher(overrides);
  const unmatched = new Set();
  const byTicker = new Map();
  for (const e of events) {
    const m = e.companyId
      ? { id: e.companyId }
      : e.company
        ? match(String(e.company).split(/[;,]/)[0].trim())
        : null;
    if (!m) {
      unmatched.add(e.company || '(none)');
      continue;
    }
    e.ticker = m.id;
    if (!byTicker.has(m.id)) byTicker.set(m.id, []);
    byTicker.get(m.id).push(e);
  }
  const client = new StockscansClient();
  const series = new Map();
  const cacheDir = path.join(path.dirname(out), 'prices');
  fs.mkdirSync(cacheDir, { recursive: true });
  const tickers = [...byTicker.keys()];
  for (let i = 0; i < tickers.length; i++) {
    const tk = tickers[i];
    const cf = path.join(cacheDir, tk.replace(/[^A-Za-z0-9_-]/g, '_') + '.json');
    if (fs.existsSync(cf)) {
      series.set(tk, JSON.parse(fs.readFileSync(cf, 'utf8')));
      continue;
    }
    const earliest = Math.min(
      ...byTicker.get(tk).map((e) => Date.parse(e.date + 'T00:00:00+05:30'))
    );
    try {
      const { candles } = await fetchTier(client, tk, '1D', Date.now(), {
        stopAtMs: earliest - 10 * 864e5,
        maxPages: 4,
      });
      series.set(
        tk,
        candles.map((c) => [c.t, c.close])
      );
      fs.writeFileSync(cf, JSON.stringify(series.get(tk)));
    } catch (err) {
      series.set(tk, []);
      process.stderr.write(`price fail ${tk}: ${err.message}\n`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const rows = [];
  for (const [tk, evs] of byTicker) {
    const s = series.get(tk) || [];
    for (const e of evs) {
      const t0 = Date.parse(e.date + 'T00:00:00+05:30');
      const k = s.findIndex(([t]) => t >= t0);
      const row = { id: e.id, ticker: tk, date: e.date, group: e.group || 'all', entry: null };
      if (k > -1 && s.length) {
        row.entry = s[k][1];
        row.entryDate = new Date(s[k][0] + 19800000).toISOString().slice(0, 10);
        for (const h of HORIZONS)
          row['r' + h] = k + h < s.length ? +((s[k + h][1] / s[k][1] - 1) * 100).toFixed(2) : null;
      }
      rows.push(row);
    }
  }
  const stat = (a) => {
    a = a.filter((x) => x != null).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a[Math.floor(a.length / 2)];
    return {
      n: a.length,
      median: m,
      mean: +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(2),
      hit: +((a.filter((x) => x > 0).length / a.length) * 100).toFixed(0),
    };
  };
  const groups = {};
  for (const r of rows) (groups[r.group] ||= []).push(r);
  const summary = {};
  for (const [g, rs] of Object.entries(groups)) {
    summary[g] = { events: rs.length, priced: rs.filter((r) => r.entry != null).length };
    for (const h of HORIZONS) summary[g]['r' + h] = stat(rs.map((r) => r['r' + h]));
  }
  fs.writeFileSync(out + '.rows.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(out + '.summary.json', JSON.stringify(summary, null, 1));
  fs.writeFileSync(out + '.unmatched.json', JSON.stringify([...unmatched], null, 1));
  console.log(
    JSON.stringify({
      events: events.length,
      matched: rows.length,
      unmatchedNames: unmatched.size,
      tickers: tickers.length,
      pricedEvents: rows.filter((r) => r.entry != null).length,
    })
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
module.exports = { norm, toks };
