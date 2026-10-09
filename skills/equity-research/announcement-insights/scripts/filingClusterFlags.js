'use strict';
/**
 * filingClusterFlags.js — deterministic pattern flags over a company's announcement NOTES history.
 * Source: SureshKBN filings consolidation (data/assets/filings-framework-sureshkbn.md).
 * Keyword/regex heuristics on note `type` + `text`; THRESHOLDS ILLUSTRATIVE and unbacktested — flags are prompts
 * for the analyst, not verdicts. Pure function; CLI: node filingClusterFlags.js NSE:XYZ [asOf=YYYY-MM-DD]
 * input: notes = [{id, companyId, category (or type), date, text}], asOf (date string)
 * output: { flags: [{code, count, ids[]}] }
 */
const DAY = 864e5;
const cat = (n) => n.category || n.type; // real notes: type='announcement', category='order_book' etc.
const T = { windowDays: 365, orderDupDays: 30, kmpExits: 2, promoterSales: 2, dilutions: 2 };
const within = (n, asOf, days) => {
  const t = Date.parse(n.date);
  return Number.isFinite(t) && t <= asOf + DAY && asOf - t <= days * DAY;
};
const AMT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(cr(?:ore)?s?|mn|million|lakh|bn|billion)?/gi;
function amounts(text) {
  const out = new Set();
  let m;
  AMT.lastIndex = 0;
  while ((m = AMT.exec(String(text || ''))))
    out.add(`${m[1].replace(/,/g, '')}${(m[2] || '').toLowerCase().slice(0, 2)}`);
  return out;
}
function filingClusterFlags(notes = [], asOfStr) {
  const asOf = Date.parse(asOfStr || new Date().toISOString().slice(0, 10));
  const win = notes.filter((n) => within(n, asOf, T.windowDays));
  const flags = [];
  const add = (code, arr) => {
    if (arr.length) flags.push({ code, count: arr.length, ids: arr.map((n) => n.id) });
  };
  const kmp = win.filter(
    (n) =>
      cat(n) === 'management_change' &&
      /resign|cessation|ceases|steps? down|stepped down/i.test(n.text || '')
  );
  if (kmp.length >= T.kmpExits) add('KMP_EXIT_CLUSTER', kmp);
  const aud = win.filter(
    (n) => /auditor/i.test(n.text || '') && /resign|cessation|ceas/i.test(n.text || '')
  );
  add('AUDITOR_EXIT', aud);
  const prom = win.filter(
    (n) =>
      cat(n) === 'shareholding_change' &&
      /promoter/i.test(n.text || '') &&
      /\b(sold|sale|disposal|disposed|sell|invok|pledge created)/i.test(n.text || '')
  );
  if (prom.length >= T.promoterSales) add('REPEAT_PROMOTER_SELLING', prom);
  const dil = win.filter(
    (n) =>
      cat(n) === 'fundraise' &&
      /warrant|qip|qualified institutional|preferential|rights issue/i.test(n.text || '')
  );
  if (dil.length >= T.dilutions) add('REPEAT_DILUTION', dil);
  const ord = win
    .filter((n) => cat(n) === 'order_book')
    .map((n) => ({ n, a: amounts(n.text), t: Date.parse(n.date) }));
  const dup = new Set();
  for (let i = 0; i < ord.length; i++)
    for (let j = i + 1; j < ord.length; j++) {
      if (
        Math.abs(ord[i].t - ord[j].t) <= T.orderDupDays * DAY &&
        [...ord[i].a].some((x) => ord[j].a.has(x))
      ) {
        dup.add(ord[i].n);
        dup.add(ord[j].n);
      }
    }
  add('POSSIBLE_DUPLICATE_ORDER', [...dup]);
  return { flags };
}
module.exports = { filingClusterFlags, amounts, T };
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const [company, asOf] = [process.argv[2], process.argv[3]];
  const notes = Object.values(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../data/notes.json'), 'utf8'))
  )
    .filter((n) => n.companyId === company)
    .map((n) => ({
      id: n.id,
      companyId: n.companyId,
      category: n.category,
      type: n.type,
      date: n.date || (n.creationTime || '').slice(0, 10),
      text: n.insight || n.text,
    }));
  console.log(JSON.stringify(filingClusterFlags(notes, asOf), null, 1));
}
