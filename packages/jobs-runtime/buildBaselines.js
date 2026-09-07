#!/usr/bin/env node
'use strict';

/**
 * buildBaselines.js — roll Filing Extracts up into one Company Baseline Card
 * (Product B of docs/PREPROCESSING_PIPELINE_PLAN.md §1).
 *
 * The problem this solves. `announcement-info-classifier` Step 3 rebuilds, PER
 * ANNOUNCEMENT, a "what was already known" baseline from 4 concalls + the latest
 * PPT + up to ~400 archived announcements + notes/thesis. That is why the skill
 * runs on 5 items a night instead of everything, and why `post-close-scan-insights`
 * caps its classification step at 5.
 *
 * The card is that baseline built ONCE per company and refreshed only when a new
 * document lands. Its `claimIndex` turns "is this already known?" from six
 * document fetches into a dated lookup — which is the specific change that makes
 * uncapping the classifier affordable.
 *
 * Pure script, no model: every field is assembled from extracts that already
 * exist, and the claim fingerprints are built by rule. Nothing here is judgment —
 * deciding whether a claim MATTERS remains entirely the classifier's job.
 *
 * Usage:
 *   yarn baselines:build                     # rebuild every stale card
 *   yarn baselines:build --tickers NSE:A,NSE:B
 *   yarn baselines:build --force             # rebuild regardless of staleness
 *   yarn baselines:build --status            # what exists, what's stale
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, argValue } = require('./lib/env');
const db = require('./lib/db');
const docExtracts = require('./lib/docExtracts');
const stockscansContext = require('./lib/stockscansContext');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');

const CARD_VERSION = 1;

function cardDir() {
  return db.cachePath('company-baselines');
}
function safeName(companyId) {
  return String(companyId || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}
function cardFile(companyId) {
  return path.join(cardDir(), `${safeName(companyId)}.json`);
}

function readCard(companyId) {
  try {
    return JSON.parse(fs.readFileSync(cardFile(companyId), 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCard(companyId, card) {
  const f = cardFile(companyId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(card, null, 2));
  fs.renameSync(tmp, f);
  return f;
}

/**
 * Every stored extract, grouped by companyId. Walks the extract store rather than
 * asking an API — the store IS the record of what has been read, so a card can
 * never claim coverage the corpus doesn't have.
 */
function loadExtractsByCompany() {
  const byCompany = new Map();
  for (const profile of docExtracts.PROFILES) {
    const dir = docExtracts.dir(profile);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      let e;
      try {
        e = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (_) {
        continue;
      }
      if (e.__testArtifact) continue;
      const id = sanitizeCompanyId(e.companyId || '');
      if (!id) continue;
      if (!byCompany.has(id)) byCompany.set(id, []);
      byCompany.get(id).push(e);
    }
  }
  return byCompany;
}

/**
 * A claim fingerprint: category + counterparty + an ORDER-OF-MAGNITUDE amount
 * bucket, all lowercased.
 *
 * Buckets rather than exact amounts, deliberately. A follow-up filing routinely
 * restates the same deal at a slightly different figure (a revised consideration,
 * a rounding, an FX move), and exact-match fingerprints would file those as two
 * unrelated claims — making a genuinely-known deal look new every time it is
 * mentioned. Buckets group them; the classifier still sees both source records
 * and can judge whether the delta matters. Grouping is mechanical, judging is not.
 */
function fingerprint({ category, counterparty, amount }) {
  const bucket =
    typeof amount === 'number' && Number.isFinite(amount) && amount > 0
      ? `1e${Math.floor(Math.log10(amount))}`
      : 'na';
  return [
    String(category || 'general').toLowerCase(),
    String(counterparty || '')
      .toLowerCase()
      .trim(),
    bucket,
  ]
    .join('|')
    .replace(/\s+/g, ' ');
}

/**
 * Fuzzy name match for the capex guided-vs-actual join below. Same
 * length-weighted shared-word approach as preprocessCalibrate.js's
 * `similarity()` (found necessary there 2026-09-06: a plain shared-word
 * ratio over-weights short/common words like "plant", "expansion", "unit" —
 * "Capacity expansion at Unit 3" would otherwise falsely out-score its own
 * true match against "Capacity expansion at Unit 2"). Reused here rather than
 * reimplemented because it is the same problem shape: matching a guided
 * project name (from a PPT/result) against an actual project name (from an
 * annual report), where both carry heavy boilerplate around one or two
 * distinguishing words.
 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const la = String(a).toLowerCase();
  const lb = String(b).toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.9;
  const wordsA = la.split(/\W+/).filter(Boolean);
  const wordsB = lb.split(/\W+/).filter(Boolean);
  if (!wordsA.length || !wordsB.length) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const weightOf = (w) => (w.length <= 4 ? 0.3 : 1);
  let sharedWeight = 0;
  let totalWeight = 0;
  for (const w of setA) totalWeight += weightOf(w);
  for (const w of setB) if (!setA.has(w)) totalWeight += weightOf(w);
  for (const w of setA) if (setB.has(w)) sharedWeight += weightOf(w);
  return totalWeight ? sharedWeight / totalWeight : 0;
}

// Below this, a guided/actual pair is "no match found", not a coincidental
// low-similarity pairing — same threshold preprocessCalibrate.js uses for the
// identical reason.
const CAPEX_MATCH_THRESHOLD = 0.34;

/**
 * Join each guided capex commitment (from a PPT/result's targets/capex_pipeline)
 * to its best-matching ACTUAL commercialisation record (from an annual
 * report's `capex_commercialisation[]`), by project-name similarity only.
 *
 * This is Tier 2 (docs/REUSE_ARCHITECTURE_PLAN.md §4.2) — a fact-only JOIN
 * across two already-extracted documents, never a verdict. It answers "here
 * is what was guided, and here is what the AR later said actually happened"
 * — whether that gap is concerning, on-track, or a walk-the-talk miss is
 * entirely `annual-report-analysis` / `management-credibility-tracker`'s
 * judgment, made by reading `guided`/`actual` side by side. Unmatched guided
 * commitments (`actual: null`) are themselves informative — a capex still
 * awaiting its first AR mention since it was guided — and are returned as-is,
 * not hidden.
 */
function buildCapexTimeline(commitments, actuals) {
  const pool = actuals.map((item, idx) => ({ item, idx, used: false }));
  return commitments.map((guided) => {
    let best = null;
    let bestScore = 0;
    for (const p of pool) {
      if (p.used) continue;
      const score = nameSimilarity(guided.what, p.item.project);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && bestScore >= CAPEX_MATCH_THRESHOLD) {
      best.used = true;
      return { guided, actual: best.item, matchScore: Number(bestScore.toFixed(2)) };
    }
    return { guided, actual: null, matchScore: 0 };
  });
}

function buildCard(companyId, extracts) {
  const sorted = [...extracts].sort((a, b) =>
    String(b.documentDate || b.extractedAt).localeCompare(String(a.documentDate || a.extractedAt))
  );

  const guidanceLedger = [];
  const commitments = [];
  const capexActuals = [];
  const claimIndex = new Map();
  const kpiHistory = { orderBookCr: [], capacity: [], ebitdaMarginPct: [] };
  const sourceDocs = [];

  for (const e of sorted) {
    const d = e.data || {};
    const when = e.documentDate || null;
    sourceDocs.push({
      profile: e.profile,
      documentDate: when,
      sourceUrl: e.sourceUrl,
      sourceHash: e.sourceHash,
      confidence: e.confidence || null,
    });

    for (const g of d.guidance || []) {
      guidanceLedger.push({
        metric: g.metric || null,
        guided: g.guided_value || null,
        timeframe: g.timeframe || null,
        direction: g.direction || null,
        saidOn: when,
        source: `${e.profile} ${when || ''}`.trim(),
        quote: (g.quote && g.quote.text) || null,
        page: (g.quote && g.quote.page) || null,
        // Status is NOT computed here. Whether guidance was met is
        // management-credibility-tracker's judgment over actual results; a script
        // stamping "met"/"missed" would be inventing the very verdict that skill
        // exists to reach.
        status: 'open',
      });
    }

    for (const t of [...(d.targets || []), ...(d.capex_pipeline || []), ...(d.capacity || [])]) {
      const what = t.project || t.metric || t.what || t.line || null;
      if (!what) continue;
      commitments.push({
        what,
        when: t.commissioning || t.timeframe || t.timeline || null,
        amountCr: typeof t.amount_inr_cr === 'number' ? t.amount_inr_cr : null,
        statedOn: when,
        source: `${e.profile} ${when || ''}`.trim(),
        slide: t.slide ?? null,
      });
    }

    // capex_commercialisation is annual_report-profile-only (profiles.md) and
    // carries no amount — it's the ACTUAL-side status check ("did this
    // guided/committed capex actually get commercialised") that
    // buildCapexTimeline() below joins against the PPT/result-side
    // commitments[] by project-name similarity, per
    // docs/REUSE_ARCHITECTURE_PLAN.md §4.2.
    for (const c of d.capex_commercialisation || []) {
      const project = c.project || null;
      if (!project) continue;
      capexActuals.push({
        project,
        status: c.status || null,
        statedOn: when,
        source: `${e.profile} ${when || ''}`.trim(),
        quote: (c.quote && c.quote.text) || null,
        page: (c.quote && c.quote.page) || null,
      });
    }

    if (d.order_book && typeof d.order_book.value_inr_cr === 'number') {
      kpiHistory.orderBookCr.push({
        value: d.order_book.value_inr_cr,
        asOf: d.order_book.as_of || when,
      });
    }
    if (d.reported && typeof d.reported.ebitda_margin_pct === 'number') {
      kpiHistory.ebitdaMarginPct.push({
        value: d.reported.ebitda_margin_pct,
        period: d.period || when,
      });
    }

    if (e.profile === 'announcement' && d.facts) {
      const fp = fingerprint({
        category: d.category_hint,
        counterparty: d.facts.counterparty,
        amount: d.facts.amount_inr_cr,
      });
      const existing = claimIndex.get(fp);
      // firstSeen is the EARLIEST date this claim appears — the whole point of the
      // index. `sorted` is newest-first, so every later pass overwrites with an
      // older date, which is the direction we want.
      if (!existing) {
        claimIndex.set(fp, {
          fingerprint: fp,
          category: d.category_hint || null,
          counterparty: d.facts.counterparty || null,
          amountCr: d.facts.amount_inr_cr ?? null,
          firstSeen: when,
          lastSeen: when,
          sources: [e.sourceUrl],
        });
      } else {
        existing.sources.push(e.sourceUrl);
        if (when && (!existing.firstSeen || when < existing.firstSeen)) existing.firstSeen = when;
        if (when && (!existing.lastSeen || when > existing.lastSeen)) existing.lastSeen = when;
      }
    }
  }

  const capexTimeline = buildCapexTimeline(commitments, capexActuals);

  const ss = stockscansContext.readCached(companyId);
  const concallCount = sorted.filter((e) => e.profile === 'transcript').length;
  const hasPpt = sorted.some((e) => e.profile === 'ppt');

  return {
    companyId,
    cardVersion: CARD_VERSION,
    builtAt: new Date().toISOString(),
    newestSourceDate: sourceDocs[0] ? sourceDocs[0].documentDate : null,
    sourceDocs,
    guidanceLedger,
    commitments,
    capexTimeline,
    claimIndex: [...claimIndex.values()],
    kpiHistory,
    businessOverview: ss
      ? stockscansContext.plainText(ss.businessOverview && ss.businessOverview.finalReport)
      : null,
    growthCatalysts: ss
      ? stockscansContext.plainText(ss.growthCatalysts && ss.growthCatalysts.finalReport)
      : null,
    latestConcallNotes: ss
      ? stockscansContext.plainText(ss.concallNotes && ss.concallNotes.finalReport)
      : null,
    latestConcallQuarter: ss && ss.concallNotes ? ss.concallNotes.date : null,
    baselineCoverage: {
      concalls: concallCount,
      ppt: hasPpt,
      announcements: sorted.filter((e) => e.profile === 'announcement').length,
      stockscansContext: Boolean(ss),
      // A thin baseline makes an apparent NEW classification indistinguishable
      // from incomplete lookback — the expensive direction of error, since it
      // SUPPRESSES a real signal. Consuming skills must state this rather than
      // present a confident split built on partial history.
      thin: concallCount < 2 && !hasPpt,
    },
  };
}

function isStale(card, extracts) {
  if (!card) return true;
  const newest = extracts
    .map((e) => e.extractedAt || '')
    .sort()
    .pop();
  return !newest || !card.builtAt || newest > card.builtAt;
}

function main() {
  loadEnv(argValue('--env-file', process.argv));
  const force = process.argv.includes('--force');
  const statusOnly = process.argv.includes('--status');
  const tickersArg = argValue('--tickers', process.argv);

  const byCompany = loadExtractsByCompany();
  let ids = [...byCompany.keys()];
  if (tickersArg) {
    const want = new Set(tickersArg.split(',').map((t) => sanitizeCompanyId(t.trim())));
    ids = ids.filter((id) => want.has(id));
  }

  const stale = ids.filter((id) => force || isStale(readCard(id), byCompany.get(id)));

  if (statusOnly) {
    process.stdout.write(
      JSON.stringify(
        {
          companiesWithExtracts: byCompany.size,
          cardsOnDisk: fs.existsSync(cardDir())
            ? fs.readdirSync(cardDir()).filter((f) => f.endsWith('.json')).length
            : 0,
          staleOrMissing: stale.length,
          cardDir: cardDir(),
        },
        null,
        2
      )
    );
    return;
  }

  const built = [];
  let thin = 0;
  for (const id of stale) {
    const card = buildCard(id, byCompany.get(id));
    writeCard(id, card);
    if (card.baselineCoverage.thin) thin += 1;
    built.push({
      companyId: id,
      claims: card.claimIndex.length,
      guidance: card.guidanceLedger.length,
      commitments: card.commitments.length,
      thin: card.baselineCoverage.thin,
    });
  }

  process.stdout.write(
    JSON.stringify(
      {
        companiesWithExtracts: byCompany.size,
        rebuilt: built.length,
        thinBaselines: thin,
        cardDir: cardDir(),
        built: built.slice(0, 40),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[baselines] fatal: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { buildCard, readCard, cardFile, fingerprint, CARD_VERSION, nameSimilarity, buildCapexTimeline };
