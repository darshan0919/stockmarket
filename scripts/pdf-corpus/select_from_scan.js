#!/usr/bin/env node
'use strict';

/**
 * Adds documents from the bulk filing scan (data/pdf-corpus/scan/rows.jsonl, produced by
 * `yarn workspace @stock/api bulk-filing-scan`, see docs/BULK_FILING_SCAN.md) to
 * data/pdf-corpus/selection.jsonl. Existing selection rows are kept; a scan row whose ssUrl is
 * already selected is skipped. Hash-stable, so re-running after more scan rows only adds rows.
 *
 *   node scripts/pdf-corpus/select_from_scan.js [--per-type 300] [--results-per-company 2] [--extra-results N]
 *
 * Why descriptions and titles decide the type: a scan `announcementType` bucket is a loose
 * category (the "Financial Results" bucket also holds auditor appointments, dividends, ...).
 */

const L = require('./lib');

const num = (name, d) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const perType = num('--per-type', 300);
const resultsPer = num('--results-per-company', 2);
const extraResults = num('--extra-results', 0); // extra older Results for companies that already have some, hash-ordered
// caps override --per-type; Infinity = take all eligible
const CAP = {
  PPT: 300,
  Transcript: 200,
  'Annual Report': 150,
  'Promoter Reg31': Infinity,
  CIRP: Infinity,
};

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};
const periodFromText = (s) => {
  const m =
    /(?:ended|ending)\s+(?:on\s+)?(?:the\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+)?([A-Za-z]+)\s+(?:\d{1,2}(?:st|nd|rd|th)?,?\s+)?(\d{4})/i.exec(
      s
    );
  if (m && MONTHS[m[1].toLowerCase()])
    return `${m[2]}${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}`;
  const t = /\b(Mar|Jun|Sep|Dec)[a-z]*\s+(\d{4})\b/i.exec(s);
  if (t) return `${t[2]}${{ mar: '03', jun: '06', sep: '09', dec: '12' }[t[1].toLowerCase()]}`;
  return null;
};
const monthOf = (date) =>
  String(date || '')
    .replace(/-/g, '')
    .slice(0, 6);

const isResult = (r) =>
  /financial result|integrated filing \(financial\)/i.test(r.title) ||
  /financial results? for the (period|quarter|year|half)|results for the (quarter|period|year|half)/i.test(
    r.description
  );

/** -> { type, period } or null. The corpus type decides storage dir and which stratum the doc counts in. */
function classify(r) {
  const text = `${r.title} ${r.description}`;
  switch (r.type) {
    case 'Financial Results': {
      if (isResult(r)) {
        const period = periodFromText(text);
        return period ? { type: 'Result', period } : null;
      }
      return /board meeting/i.test(r.title)
        ? { type: 'Board Outcome', period: monthOf(r.date) }
        : null;
    }
    case 'Presentation':
      return /investor presentation|^ppt\b/i.test(r.title)
        ? { type: 'PPT', period: periodFromText(text) || monthOf(r.date) }
        : null;
    case 'Earnings Call':
      return /transcript/i.test(r.title)
        ? { type: 'Transcript', period: periodFromText(text) || monthOf(r.date) }
        : null;
    case 'Annual Report':
      return /annual report/i.test(r.title) && !/corrigendum|notice of/i.test(r.title)
        ? { type: 'Annual Report', period: monthOf(r.date) }
        : null;
    case 'Orders / Contracts':
      return /order|contract/i.test(r.title) && !/penalty/i.test(r.title)
        ? { type: 'Order', period: monthOf(r.date) }
        : null;
    case 'Promoter Reg 31/31A':
      return { type: 'Promoter Reg31', period: monthOf(r.date) };
    case 'Credit Rating':
      return /rating/i.test(r.title) ? { type: 'Credit Rating', period: monthOf(r.date) } : null;
    case 'Management Changes':
      return { type: 'KMP', period: monthOf(r.date) };
    case 'M&A / Restructuring':
      return { type: 'MnA', period: monthOf(r.date) };
    case 'Fund Raising':
      return { type: 'Fund Raising', period: monthOf(r.date) };
    case 'Press Release':
      return { type: 'Press Release', period: monthOf(r.date) };
    case 'Insolvency / CIRP':
      return { type: 'CIRP', period: monthOf(r.date) };
    default:
      return null;
  }
}

const companies = new Map(L.readJsonl(L.p('companies.jsonl')).map((c) => [c.companyId, c]));
const existing = L.readJsonl(L.p('selection.jsonl'));
// content duplicates (same sha256 as another file) and quarantined files do not count toward a cap
const dupDocIds = new Set([
  ...L.readJsonl(L.p('manifest.jsonl'))
    .filter((m) => m.dupOf)
    .map((m) => m.docId),
  ...L.readJsonl(L.p('quarantine.jsonl')).map((q) => q.docId), // corrupt files
]);
const haveUrl = new Set(existing.map((r) => r.ssUrl));
const byType = new Map();
for (const r of L.readJsonl(L.p('scan', 'rows.jsonl'))) {
  const c = companies.get(r.companyId);
  const k = c && r.ssUrl && !haveUrl.has(r.ssUrl) && classify(r);
  if (!k || !k.period) continue;
  if (!byType.has(k.type)) byType.set(k.type, []);
  byType.get(k.type).push({ r, c, ...k });
}

const out = [];
const add = (x, pick) =>
  out.push({
    docId: `${x.c.symbol}_${x.type.replace(/\s/g, '')}_${x.r.date.replace(/-/g, '')}`,
    companyId: x.c.companyId,
    symbol: x.c.symbol,
    type: x.type,
    period: x.period,
    ssUrl: x.r.ssUrl,
    pick,
    sector: x.c.sector,
    industry: x.c.industry,
    family: x.c.family,
    strata: x.c.strata,
    split: x.c.split,
    title: x.r.title,
    filedOn: x.r.date,
  });

for (const [type, list] of byType) {
  if (type === 'Result') {
    const per = new Map();
    for (const x of list)
      (per.get(x.c.companyId) || per.set(x.c.companyId, []).get(x.c.companyId)).push(x);
    const haveRes = new Set(existing.filter((r) => r.type === 'Result').map((r) => r.companyId));
    const extras = [];
    for (const [id, xs] of per) {
      const uniq = [...new Map(xs.map((x) => [x.period, x])).values()].sort((a, b) =>
        b.period.localeCompare(a.period)
      );
      if (haveRes.has(id) && extraResults)
        extras.push(...uniq.map((x) => ({ x, key: `${id}|${x.period}|extra` })));
      if (!haveRes.has(id)) add(uniq[0], 'latest');
      const older = uniq.slice(1);
      if (resultsPer > 1 && older.length && !haveRes.has(id))
        add(older[L.bucket(`${id}|older`) % older.length], 'older');
    }
    extras
      .sort((a, b) => L.bucket(a.key) - L.bucket(b.key) || a.key.localeCompare(b.key))
      .slice(0, extraResults)
      .forEach((e) => add(e.x, 'extra'));
    continue;
  }
  const cap = CAP[type] === undefined ? perType : CAP[type];
  const alreadyHave = existing.filter((r) => r.type === type && !dupDocIds.has(r.docId)).length;
  const room = Math.max(0, cap - alreadyHave);
  list
    .sort(
      (a, b) =>
        L.bucket(`${a.r.ssUrl}|${type}`) - L.bucket(`${b.r.ssUrl}|${type}`) ||
        a.r.ssUrl.localeCompare(b.r.ssUrl)
    )
    .slice(0, room)
    .forEach((x) => add(x, 'sample'));
}

const seen = new Set(existing.map((r) => r.docId));
for (const r of out) {
  let n = 1;
  const base = r.docId;
  while (seen.has(r.docId)) r.docId = `${base}_${++n}`;
  seen.add(r.docId);
}
L.appendJsonl(L.p('selection.jsonl'), out);
const count = {};
for (const r of out) count[r.type] = (count[r.type] || 0) + 1;
console.log(JSON.stringify({ existing: existing.length, added: out.length, byType: count }));
