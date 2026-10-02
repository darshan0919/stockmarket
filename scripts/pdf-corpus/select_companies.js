#!/usr/bin/env node
'use strict';

/**
 * Stratified company sample for the result-PDF corpus -> data/pdf-corpus/companies.jsonl
 *
 *   node scripts/pdf-corpus/select_companies.js [--per-sector 25] [--unclassified 250]
 *        [--sme 200] [--nbfc 80]
 *
 * Only companies with XBRL truth (xbrlOk) and not truthExcluded are eligible. Quotas:
 *  - up to --per-sector per sector (every sector that has any eligible company is represented)
 *  - up to --unclassified extra from the `unclassified` sector (mostly SME-platform / micro-cap)
 *  - every bank and every insurer; up to --nbfc NBFCs; up to --sme SME-family names
 * Ordering inside a stratum is by sha1(companyId), so the pick is deterministic and stable.
 * A company can satisfy several strata; `strata` lists them all.
 */

const fs = require('fs');
const L = require('./lib');

const num = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const perSector = num('--per-sector', 25);
const uncl = num('--unclassified', 250);
const smeN = num('--sme', 200);
const nbfcN = num('--nbfc', 80);

const uni = L.readJsonl(L.p('universe.jsonl')).filter((r) => r.xbrlOk && !r.truthExcluded);
const order = (a, b) =>
  L.bucket(a.companyId + '#') - L.bucket(b.companyId + '#') ||
  a.companyId.localeCompare(b.companyId);
const take = (rows, n) => [...rows].sort(order).slice(0, n);

const picked = new Map();
const tag = (r, s) => {
  const cur = picked.get(r.companyId) || { ...r, strata: [] };
  if (!cur.strata.includes(s)) cur.strata.push(s);
  picked.set(r.companyId, cur);
};

const bySector = new Map();
for (const r of uni) {
  if (!bySector.has(r.sector)) bySector.set(r.sector, []);
  bySector.get(r.sector).push(r);
}
for (const [sec, rows] of bySector) {
  const n = sec === 'unclassified' ? uncl : perSector;
  for (const r of take(rows, n)) tag(r, `sector:${sec}`);
}
for (const r of uni.filter((x) => x.family === 'banking')) tag(r, 'family:banking');
for (const r of uni.filter((x) => /insurance/.test(x.family || ''))) tag(r, `family:${r.family}`);
for (const r of take(
  uni.filter((x) => x.family === 'nbfc'),
  nbfcN
))
  tag(r, 'family:nbfc');
for (const r of take(
  uni.filter((x) => x.family === 'sme'),
  smeN
))
  tag(r, 'family:sme');

const out = [...picked.values()]
  .map((r) => ({ ...r, split: L.splitOf(r.companyId) }))
  .sort((a, b) => a.companyId.localeCompare(b.companyId));
fs.writeFileSync(L.p('companies.jsonl'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');

const count = (k) => {
  const c = {};
  for (const r of out) c[r[k]] = (c[r[k]] || 0) + 1;
  return c;
};
console.log(
  JSON.stringify({
    selected: out.length,
    eligible: uni.length,
    sectors: new Set(out.map((r) => r.sector)).size,
    families: count('family'),
    splits: count('split'),
    unclassified: out.filter((r) => r.sector === 'unclassified').length,
  })
);
