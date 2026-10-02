'use strict';

/**
 * Generic XBRL / inline-XBRL fact parser for NSE and BSE filings.
 *
 * Keeps EVERY numeric fact (element, context, value) so nothing is silently
 * dropped; curated mapping to statement lines happens in a separate layer.
 * Handles: plain XBRL XML (`<in-capmkt:Name contextRef=..>`), and iXBRL HTML
 * (`<ix:nonFraction ... scale=".." sign="-">`) with single- or double-quoted
 * attributes as served by BSE. Values are returned in raw units (INR, shares).
 * Pure functions, no I/O.
 */

/**
 * @typedef {Object} XbrlFact
 * @property {string} name - Qualified element name, e.g. `in-capmkt:RevenueFromOperations`.
 * @property {string} local - Local element name, e.g. `RevenueFromOperations`.
 * @property {string|null} ctx - contextRef id (e.g. `OneD`, `FourD`).
 * @property {number} value - Raw value with scale and sign applied.
 * @property {string|null} unit - unitRef (e.g. `INR`) or null.
 * @property {number|null} decimals - Reported precision or null (INF => null).
 */

/**
 * @typedef {Object} XbrlParseResult
 * @property {'ixbrl'|'xml'} format
 * @property {XbrlFact[]} facts - Numeric facts only.
 * @property {Record<string,string>} text - Non-numeric facts by qualified name (first occurrence).
 * @property {Array<{name:string,local:string,ctx:string|null,value:string}>} textList - EVERY non-numeric fact incl. repeats per context.
 * @property {Record<string, {start: string|null, end: string|null, instant: string|null, hasDimensions: boolean}>} contexts
 * @property {string[]} issues - Human-readable parse warnings.
 */

const ATTR_RE = /([\w:.-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g;

/**
 * Parse an attribute string into a map.
 * @param {string} s
 * @returns {Record<string,string>}
 */
function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return out;
}

/**
 * Parse `xbrli:context` blocks (period + whether a dimension is present).
 * @param {string} text
 * @returns {XbrlParseResult['contexts']}
 */
function parseContexts(text) {
  const contexts = {};
  const re = /<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi;
  for (const m of text.matchAll(re)) {
    const id = parseAttrs(m[1]).id;
    if (!id) continue;
    const pick = (tag) => {
      const r = new RegExp(`<xbrli:${tag}>\\s*([^<]*?)\\s*</xbrli:${tag}>`, 'i').exec(m[2]);
      return r ? r[1] : null;
    };
    contexts[id] = {
      start: pick('startDate'),
      end: pick('endDate'),
      instant: pick('instant'),
      hasDimensions: /<xbrldi:/i.test(m[2]),
    };
  }
  return contexts;
}

/**
 * Convert an ix display string to a number, honouring scale and sign.
 * @param {string} inner - Text between the ix:nonFraction tags (tags stripped).
 * @param {Record<string,string>} attrs
 * @returns {number|null}
 */
function ixValue(inner, attrs) {
  const cleaned = inner.replace(/<[^>]*>/g, '').replace(/[,\s]/g, '');
  let v;
  if (cleaned === '' || cleaned === '-' || /^[-–—]+$/.test(cleaned)) v = 0;
  else v = parseFloat(cleaned);
  if (Number.isNaN(v)) return null;
  const scale = parseInt(attrs.scale || '0', 10) || 0;
  v *= 10 ** scale;
  if (attrs.sign === '-') v = -v;
  return v;
}

/**
 * Parse inline XBRL html.
 * @param {string} text
 * @returns {{facts: XbrlFact[], text: Record<string,string>, issues: string[]}}
 */
function parseIxbrl(text) {
  const facts = [];
  const issues = [];
  const re = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi;
  for (const m of text.matchAll(re)) {
    const a = parseAttrs(m[1]);
    if (!a.name) continue;
    const value = ixValue(m[2], a);
    if (value === null) {
      issues.push(`unparseable value for ${a.name}: "${m[2].slice(0, 30)}"`);
      continue;
    }
    facts.push({
      name: a.name,
      local: a.name.split(':').pop(),
      ctx: a.contextRef || null,
      value,
      unit: a.unitRef || null,
      decimals: a.decimals && a.decimals !== 'INF' ? parseInt(a.decimals, 10) : null,
    });
  }
  const textFacts = {};
  const textList = [];
  const tre = /<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi;
  for (const m of text.matchAll(tre)) {
    const a = parseAttrs(m[1]);
    const val = m[2]
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (a.name && val) {
      textList.push({
        name: a.name,
        local: a.name.split(':').pop(),
        ctx: a.contextRef || null,
        value: val,
      });
      if (!(a.name in textFacts)) textFacts[a.name] = val;
    }
  }
  return { facts, text: textFacts, textList, issues };
}

/**
 * Parse plain XBRL XML instance.
 * @param {string} text
 * @returns {{facts: XbrlFact[], text: Record<string,string>, issues: string[]}}
 */
function parseXml(text) {
  const facts = [];
  const textFacts = {};
  const textList = [];
  const issues = [];
  const re = /<(in-[\w-]+):(\w+)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1:\2>)/g;
  for (const m of text.matchAll(re)) {
    const [, prefix, local, attrStr, inner] = m;
    if (inner === undefined) continue;
    const a = parseAttrs(attrStr);
    if (!a.contextRef) continue;
    const name = `${prefix}:${local}`;
    const trimmed = inner.trim();
    if (a.unitRef) {
      const value = parseFloat(trimmed);
      if (Number.isNaN(value)) {
        if (trimmed !== '') issues.push(`unparseable value for ${name}: "${trimmed.slice(0, 30)}"`);
        continue;
      }
      facts.push({
        name,
        local,
        ctx: a.contextRef,
        value,
        unit: a.unitRef,
        decimals: a.decimals && a.decimals !== 'INF' ? parseInt(a.decimals, 10) : null,
      });
    } else if (trimmed) {
      const val = trimmed.replace(/<[^>]*>/g, '').trim();
      textList.push({ name, local, ctx: a.contextRef, value: val });
      if (!(name in textFacts)) textFacts[name] = val;
    }
  }
  return { facts, text: textFacts, textList, issues };
}

/**
 * Parse an XBRL or iXBRL document.
 * @param {string} text - Raw file contents.
 * @returns {XbrlParseResult}
 */
function parseXbrl(text) {
  const src = typeof text === 'string' ? text : '';
  const isIx = /<ix:(nonFraction|nonNumeric)/i.test(src);
  const body = isIx ? parseIxbrl(src) : parseXml(src);
  const issues = [...body.issues];
  if (!src.trim()) issues.push('empty document');
  else if (body.facts.length === 0) issues.push('no numeric facts found');
  return {
    format: isIx ? 'ixbrl' : 'xml',
    facts: body.facts,
    text: body.text,
    textList: body.textList,
    contexts: parseContexts(src),
    issues,
  };
}

/**
 * Detect the filing family from an NSE/BSE XBRL file path or URL.
 * @param {string} urlOrName
 * @returns {'indas'|'banking'|'life-insurance'|'general-insurance'|'nbfc'|'unknown'}
 */
function detectResultFamily(urlOrName) {
  const s = String(urlOrName || '').toUpperCase();
  // BSE legacy (pre-integrated-filing) `.xml` uploads use the `in-bse-fin` taxonomy, whose local element names
  // are identical to the Ind AS / bank names the adapter maps (verified on BAJFINANCE NBFC_*, Main_Ind_As_*, KOTAKBANK Banking_*).
  if (/NONBANKING_\d/.test(s) || /(^|\/)NBFC_\d/.test(s)) return 'indas';
  if (/(^|\/)BANKING_\d/.test(s)) return 'banking';
  if (
    s.includes('IFBANKING') ||
    s.includes('_BANKING') ||
    s.includes('FINANCE_BANK') ||
    s.includes('INTEGRATED_FILING_BANK')
  )
    return 'banking';
  if (s.includes('IFGI') || s.includes('FINANCE_GI')) return 'general-insurance';
  if (s.includes('_NBFC')) return 'nbfc';
  if (
    /INTEGRATED_FILING_LI[_.]/.test(s) ||
    s.includes('_LIFE') ||
    s.includes('IFLI') ||
    s.includes('FINANCE_LI')
  )
    return 'life-insurance';
  if (/INTEGRATED_FILING_GI[_.]/.test(s) || s.includes('_GENERAL')) return 'general-insurance';
  // SME-platform / Indian-GAAP filers: NSE `INTEGRATED_FILING_NONINDAS`, BSE `IFOtherthan` (must precede the INDAS test).
  if (s.includes('NONINDAS') || s.includes('NON_INDAS') || s.includes('OTHERTHAN')) return 'sme';
  if (s.includes('INDAS') || s.includes('IND_AS')) return 'indas';
  return 'unknown';
}

/**
 * Index numeric facts by `local|ctx`.
 * @param {XbrlFact[]} facts
 * @returns {Map<string, XbrlFact>}
 */
function indexFacts(facts) {
  const map = new Map();
  for (const f of facts) map.set(`${f.local}|${f.ctx}`, f);
  return map;
}

/**
 * Compare two fact sets (e.g. NSE vs BSE for the same filing).
 * @param {XbrlFact[]} a
 * @param {XbrlFact[]} b
 * @param {{relTol?: number, absTol?: number}} [opts]
 * @returns {{matched: number, differing: Array<{key:string,a:number,b:number}>, onlyA: string[], onlyB: string[]}}
 */
function compareFacts(a, b, { relTol = 1e-4, absTol = 1e4 } = {}) {
  const ia = indexFacts(a);
  const ib = indexFacts(b);
  let matched = 0;
  const differing = [];
  const onlyA = [];
  for (const [key, fa] of ia) {
    const fb = ib.get(key);
    if (!fb) {
      onlyA.push(key);
      continue;
    }
    const tol = Math.max(absTol, Math.abs(fa.value) * relTol);
    if (Math.abs(fa.value - fb.value) <= tol) matched += 1;
    else differing.push({ key, a: fa.value, b: fb.value });
  }
  const onlyB = [...ib.keys()].filter((k) => !ia.has(k));
  return { matched, differing, onlyA, onlyB };
}

module.exports = { parseXbrl, parseContexts, detectResultFamily, indexFacts, compareFacts };
