'use strict';

/**
 * extractResultPdf: the cheapest-tier-that-verifies router for a quarterly Result PDF
 * (docs/PDF_OCR_EXTRACTION_PLAN.md §3).
 *
 *   Tier 1  text layer, page by page: rank pages by result-table keywords, run the deterministic parser on each
 *           candidate page (with the tail of the previous page, so a unit line printed above the table is seen)
 *   Tier 2  OCR (tesseract) of the best pages, same parser, for pages whose text layer is missing or corrupt
 *   Tier 3  a local model on the best pages (optional; needs `opts.tier3.provider`), grounded then verified
 *   -       otherwise ABSTAIN. A skipped field is better than a confident wrong one.
 *
 * A candidate is SERVED only if its unit is known and L2 is 'verified' or 'consistent' (see verify.js).
 * Among served candidates a consolidated table wins over a standalone one (the XBRL 'auto' basis).
 * Every result carries {tier, page, unit, basis, verification, issues, tokens}.
 */

const path = require('path');
const skillDir = path.join(
  __dirname,
  '../../../../skills/equity-research/quarterly-result-extractor/scripts'
);
const { extractIncomeStatement } = require(path.join(skillDir, 'extract_income_statement.js'));
const { pageTexts, rankResultPages, renderPagePng, ocrPage } = require('./pages');
const { verifyIncomeStatement, sanitizeCurrent } = require('./verify');
const { extractWithTier3 } = require('./tier3');

const SERVABLE = new Set(['verified', 'consistent']);

function tier1OnText(text) {
  const ex = extractIncomeStatement({ resultText: text });
  if (!ex.found) return null;
  const cur = {};
  for (const [k, v] of Object.entries(ex.raw.cur || {})) if (typeof v === 'number') cur[k] = v;
  return { unit: ex.unit, basis: ex.consolidated ? 'consolidated' : 'standalone', cur };
}

/** Basis a page declares in its heading (first 1800 chars): 'consolidated' | 'standalone' | null. */
function declaredBasis(pageText) {
  const head = String(pageText || '')
    .slice(0, 1800)
    .toLowerCase();
  const con = /consolidated/.test(head);
  const sta = /standalone|stand-alone/.test(head);
  if (con && !sta) return 'consolidated';
  if (sta && !con) return 'standalone';
  return null;
}

/** Unit named anywhere in `text` ('lakh' | 'crore' | 'million' | null), for pages whose own unit line was lost. */
function textUnit(text) {
  const m = /\bin\s+(lakhs?|lacs?|crores?|crs?|millions?|mn|mio)\b/i.exec(String(text || ''));
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (/^la/.test(w)) return 'lakh';
  if (/^cr/.test(w)) return 'crore';
  return 'million';
}

function judge(c) {
  const v = verifyIncomeStatement(c.cur);
  const unitKnown = c.unit && c.unit !== 'unknown';
  // 'consistent' (a single passing identity) is only trusted when no other identity contradicts it.
  const clean = v.verdict === 'verified' || (v.verdict === 'consistent' && v.issues.length === 0);
  const san = sanitizeCurrent(c.cur);
  return {
    ...c,
    cur: san.cur,
    sanitizedDropped: san.dropped,
    verification: v.verdict,
    issues: v.issues,
    servable: unitKnown && SERVABLE.has(v.verdict) && clean,
  };
}

function pickBest(cands) {
  const ok = cands.filter((c) => c.servable);
  if (!ok.length) return null;
  const rank = (c) =>
    (c.verification === 'verified' ? 2 : 1) * 10 + (c.basis === 'consolidated' ? 5 : 0);
  return ok.slice().sort((a, b) => rank(b) - rank(a) || a.page - b.page)[0];
}

/**
 * @param {string} file path to the PDF
 * @param {object} [opts]
 * @param {{provider: object, mode?: 'text'|'image'|'both'}} [opts.tier3]
 * @param {boolean} [opts.skipTier1] force-skip Tiers 1-2 (benchmarking a model on its own)
 * @param {number} [opts.maxPages=6] candidate pages per tier
 */
async function extractResultPdf(file, opts = {}) {
  const t0 = Date.now();
  const maxPages = opts.maxPages || 6;
  const tokens = { agent: 0, local: 0, localInput: 0, localOutput: 0 };
  const trail = [];
  const pages = pageTexts(file);
  const ranked = rankResultPages(pages, { top: maxPages });
  const base = { pages: pages.length, candidatePages: ranked.map((r) => r.page) };

  // A unit line lost to OCR is recovered from the same page's text layer, else from a unit another parsed page of this document printed.
  const docUnit = () => (t1.find((c) => c.unit && c.unit !== 'unknown') || {}).unit || null;
  const withUnitHint = (got, page) => {
    if (got.unit && got.unit !== 'unknown') return got;
    const hint = textUnit(`${pages[page - 1] || ''}\n${tail(page)}`) || docUnit();
    return hint ? { ...got, unit: hint, unitFrom: 'hint' } : got;
  };

  const tail = (n) => (n > 1 ? pages[n - 2].slice(-1200) : '');

  // Tier 1
  const t1 = [];
  let fallback = null; // a served standalone result, kept while a consolidated page that did not parse is retried
  const parsedPages = new Set();
  const pendingConsolidated = () =>
    ranked
      .filter(
        (r) => declaredBasis(pages[r.page - 1]) === 'consolidated' && !parsedPages.has(r.page)
      )
      .map((r) => r);
  if (!opts.skipTier1) {
    for (const r of ranked) {
      const got = tier1OnText(`${tail(r.page)}\n${pages[r.page - 1]}`);
      if (got) {
        const j = judge({ tier: 1, page: r.page, ...got });
        t1.push(j);
        if (j.servable) parsedPages.add(r.page);
      }
    }
    trail.push({
      tier: 1,
      tried: ranked.length,
      found: t1.length,
      servable: t1.filter((c) => c.servable).length,
    });
    const best = pickBest(t1);
    if (best && (best.basis === 'consolidated' || !pendingConsolidated().length)) return done(best);
    if (best) fallback = best;
  }

  // Tier 2 (OCR) on the best pages that look like result pages
  const ocrTexts = new Map();
  const t2 = [];
  if (!opts.skipTier1 && !opts.skipTier2) {
    const pend = fallback ? pendingConsolidated() : [];
    const targets = (pend.length ? pend : ranked.length ? ranked : [{ page: 1 }]).slice(
      0,
      opts.ocrPages || 2
    );
    for (const r of targets) {
      const text = ocrPage(file, r.page);
      ocrTexts.set(r.page, text);
      const got = text ? tier1OnText(text) : null;
      if (got) t2.push(judge({ tier: 2, page: r.page, ...withUnitHint(got, r.page) }));
    }
    trail.push({
      tier: 2,
      tried: targets.length,
      found: t2.length,
      servable: t2.filter((c) => c.servable).length,
    });
    const best = pickBest(t2);
    if (best && (best.basis === 'consolidated' || !fallback)) return done(best);
  }

  // Tier 3 (local model), optional
  const t3 = [];
  if (opts.tier3 && opts.tier3.provider) {
    const mode = opts.tier3.mode || 'text';
    const pend3 = fallback ? pendingConsolidated() : [];
    const targets = (pend3.length ? pend3 : ranked.length ? ranked : [{ page: 1 }]).slice(
      0,
      opts.tier3.pages || 2
    );
    for (const r of targets) {
      const pageText = pages[r.page - 1] || '';
      const ocrText =
        ocrTexts.get(r.page) || (pageText.trim().length < 200 ? ocrPage(file, r.page) : '');
      const imagePng = mode === 'text' ? null : renderPagePng(file, r.page);
      const res = await extractWithTier3({
        provider: opts.tier3.provider,
        pageText: `${tail(r.page).slice(-400)}\n${pageText}`,
        ocrText,
        imagePng,
        mode,
        unitHint: textUnit(`${pages[r.page - 1] || ''}\n${tail(r.page)}`),
        unitFallback: docUnit(),
      });
      tokens.local += res.tokens.input + res.tokens.output;
      tokens.localInput += res.tokens.input;
      tokens.localOutput += res.tokens.output;
      if (res.ok)
        t3.push(
          judge({
            tier: 3,
            page: r.page,
            unit: res.unit,
            basis: res.basis,
            cur: res.cur,
            dropped: res.dropped,
            model: opts.tier3.provider.name,
          })
        );
      else trail.push({ tier: 3, page: r.page, reason: res.reason });
    }
    trail.push({
      tier: 3,
      tried: targets.length,
      found: t3.length,
      servable: t3.filter((c) => c.servable).length,
    });
    const best = pickBest(t3);
    if (best && (best.basis === 'consolidated' || !fallback)) return done(best);
  }

  if (fallback) return done(fallback, true);

  // Abstain: report the strongest unserved candidate for diagnostics only.
  const all = [...t1, ...t2, ...t3];
  return {
    ...base,
    found: false,
    abstained: true,
    reason: all.length ? 'no candidate passed unit + L2 verification' : 'no result table located',
    bestUnserved: all.length
      ? {
          tier: all[0].tier,
          page: all[0].page,
          verification: all[0].verification,
          unit: all[0].unit,
        }
      : null,
    trail,
    tokens,
    ms: Date.now() - t0,
  };

  function done(c, partial = false) {
    return {
      partial: partial || undefined,
      ...base,
      found: true,
      abstained: false,
      tier: c.tier,
      page: c.page,
      unit: c.unit,
      basis: c.basis,
      cur: c.cur,
      verification: c.verification,
      issues: c.issues,
      dropped: c.dropped,
      model: c.model,
      trail,
      tokens,
      ms: Date.now() - t0,
    };
  }
}

module.exports = { extractResultPdf, tier1OnText, judge, pickBest, declaredBasis };
