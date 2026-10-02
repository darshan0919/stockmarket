#!/usr/bin/env node
'use strict';

/**
 * Builds data/pdf-corpus/universe.jsonl: one row per NSE company with the strata the sampler needs.
 *
 *   node scripts/pdf-corpus/build_universe.js --results a.jsonl,b.jsonl
 *
 * `--results` are validate_results.js outputs (family, XBRL availability, issues). Later files
 * override earlier ones per company. Sector comes from data/cache/company-master.json, falling
 * back to the validation file's own label, else `unclassified` (never guessed from the name).
 * `truthExcluded` marks companies with a major EXCHANGE_DISAGREE or SUM_CHECK in their results
 * run: their XBRL is not safe to use as ground truth.
 */

const fs = require('fs');
const path = require('path');
const L = require('./lib');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
}

const files = String(arg('--results', '')).split(',').filter(Boolean);
if (!files.length) {
  console.error('usage: build_universe.js --results a.jsonl[,b.jsonl]');
  process.exit(1);
}

const master = JSON.parse(
  fs.readFileSync(path.join(L.ROOT, 'data', 'cache', 'company-master.json'), 'utf8')
);
const byTicker = new Map();
for (const c of master.companies || []) {
  if (c.nseTicker) byTicker.set(String(c.nseTicker).replace(/^NSE:/, '').toUpperCase(), c);
}

const rows = new Map();
for (const f of files) for (const r of L.readJsonl(f)) rows.set(r.companyId, r);

const out = [];
for (const r of rows.values()) {
  const sym = String(r.companyId).replace(/^NSE:/, '').toUpperCase();
  const m = byTicker.get(sym);
  const clean = (v) => (v && String(v).toLowerCase() !== 'na' ? String(v) : null);
  const sector = clean(m && m.sector) || clean(r.sector) || 'unclassified';
  const industry = clean(m && m.industry) || clean(r.industry) || 'unclassified';
  const family = r.cur && r.cur.ok ? r.cur.family : null;
  const bad = (r.issues || []).some(
    (i) =>
      i.severity === 'major' && (i.category === 'EXCHANGE_DISAGREE' || i.category === 'SUM_CHECK')
  );
  out.push({
    companyId: r.companyId,
    symbol: sym,
    name: (m && m.companyName) || null,
    bseScrip: (m && m.bseTicker) || null,
    sector,
    industry,
    sectorSource: clean(m && m.sector) ? 'company-master' : clean(r.sector) ? 'validation' : 'none',
    family,
    xbrlOk: !!(r.cur && r.cur.ok),
    index: family === 'sme' ? 'sme' : 'equities',
    truthExcluded: bad,
  });
}
out.sort((a, b) => a.companyId.localeCompare(b.companyId));
const file = L.p('universe.jsonl');
L.ensureDir(L.CORPUS_DIR);
fs.writeFileSync(file, out.map((r) => JSON.stringify(r)).join('\n') + '\n');

const n = (f) => out.filter(f).length;
console.log(
  JSON.stringify({
    file,
    companies: out.length,
    xbrlOk: n((r) => r.xbrlOk),
    truthExcluded: n((r) => r.truthExcluded),
    unclassified: n((r) => r.sector === 'unclassified'),
    sectors: new Set(out.map((r) => r.sector)).size,
  })
);
