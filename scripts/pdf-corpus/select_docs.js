#!/usr/bin/env node
'use strict';

/**
 * Turns cached listings into a document selection -> data/pdf-corpus/selection.jsonl
 *
 *   node scripts/pdf-corpus/select_docs.js [--results-per-company 2] [--ppt 0.18]
 *        [--transcript 0.12] [--annual-report 0.09]
 *
 * Result: per company, the latest quarter on file plus one older quarter picked by hash (era
 * diversity, so format drift is in the data). PPT / Transcript / Annual Report: included for a
 * hash-stable fraction of companies (the fractions target roughly 300 / 200 / 150 documents over
 * the full 1,696-company sample). Stable: re-running after more listings arrive only adds rows.
 */

const fs = require('fs');
const L = require('./lib');

const num = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const resultsPer = num('--results-per-company', 2);
const frac = {
  PPT: num('--ppt', 0.18),
  Transcript: num('--transcript', 0.12),
  'Annual Report': num('--annual-report', 0.09),
};
const TYPES = new Set(['Result', 'PPT', 'Transcript', 'Annual Report']);

const periodOf = (d) => {
  const raw = String(d.date || '').trim();
  if (/^\d{6}$/.test(raw)) return raw;
  if (/^\d{4}$/.test(raw)) return `${raw}03`;
  return null;
};
const hash01 = (s) => L.bucket(s) / 100;

const companies = L.readJsonl(L.p('companies.jsonl'));
const out = [];
let listed = 0;
for (const c of companies) {
  const f = L.p('listings', `${c.symbol}.json`);
  if (!fs.existsSync(f)) continue;
  listed++;
  const docs = (JSON.parse(fs.readFileSync(f, 'utf8')).documents || []).filter(
    (d) => TYPES.has(d.documentType) && d.ssUrl && periodOf(d)
  );
  const byType = (t) =>
    docs.filter((d) => d.documentType === t).sort((a, b) => periodOf(b).localeCompare(periodOf(a)));
  const add = (d, why) =>
    out.push({
      docId: `${c.symbol}_${d.documentType.replace(/\s/g, '')}_${d.date}`,
      companyId: c.companyId,
      symbol: c.symbol,
      type: d.documentType,
      period: periodOf(d),
      ssUrl: d.ssUrl,
      pick: why,
      sector: c.sector,
      industry: c.industry,
      family: c.family,
      strata: c.strata,
      split: c.split,
    });

  const res = byType('Result');
  if (res.length) {
    add(res[0], 'latest');
    const older = res.slice(1, 11);
    if (resultsPer > 1 && older.length) {
      const i = L.bucket(`${c.companyId}|older`) % older.length;
      add(older[i], 'older');
    }
  }
  for (const t of Object.keys(frac)) {
    if (hash01(`${c.companyId}|${t}`) >= frac[t]) continue;
    const list = byType(t);
    if (!list.length) continue;
    const i = L.bucket(`${c.companyId}|${t}|which`) % Math.min(list.length, 6);
    add(list[i], 'sample');
  }
}
// unique docId (a listing can repeat a month)
const seen = new Map();
for (const r of out) {
  const n = (seen.get(r.docId) || 0) + 1;
  seen.set(r.docId, n);
  if (n > 1) r.docId += `_${n}`;
}
fs.writeFileSync(
  L.p('selection.jsonl'),
  out.map((r) => JSON.stringify(r)).join('\n') + (out.length ? '\n' : '')
);
const count = {};
for (const r of out) count[r.type] = (count[r.type] || 0) + 1;
console.log(JSON.stringify({ companiesListed: listed, selected: out.length, byType: count }));
