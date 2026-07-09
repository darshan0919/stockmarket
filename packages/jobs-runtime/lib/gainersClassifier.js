#!/usr/bin/env node
/**
 * Gainers classifier — deterministic, no external API calls.
 * Reads:  data/runs/gainers_raw_{YYYYMMDD}.json  (written by gainersScanner)
 * Writes: classified signals → events collection via lib/db.js (type: "gainer"),
 *         plus data/runs/gainers_insights_{YYYYMMDD}.json (full DTO for the email
 *         render — regenerable from raw + this classifier).
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { buildCompanyContext } = require('./companyContext');

const RUNS_DIR = path.join(db.dataRoot(), 'runs');

function latestRaw(runsDir = RUNS_DIR) {
  if (!fs.existsSync(runsDir)) {
    throw new Error(`No such directory: ${runsDir}`);
  }
  const files = fs.readdirSync(runsDir)
    .filter(f => /^gainers_raw_\d{8}\.json$/.test(f))
    .sort(); // lexical sort works for YYYYMMDD
  if (files.length === 0) {
    throw new Error(`No gainers_raw_*.json in ${runsDir}`);
  }
  return path.join(runsDir, files[files.length - 1]);
}

const MATERIAL_CATEGORY_SET = new Set(['board meeting', 'result', 'dividend', 'acquisition', 'merger', 'ipo', 'rights issue', 'buyback']);
// Keep in sync with gainersScanner.js's MATERIAL_KEYWORDS (the flag that actually
// drives `g.has_material_ann`, and thus the FUNDAMENTAL classification branch).
// Previously this file only checked the narrower category set above, so e.g. an
// "Award of Order" announcement (has_material_ann=true at the scanner level) was
// displayed with the routine 📄 icon and would have been invisible to novelty
// assessment below — fixed by aligning the two definitions.
const MATERIAL_KEYWORDS = [
  'order', 'contract', 'win', 'award', 'result', 'profit', 'revenue', 'pat',
  'fda', 'pli', 'capacity', 'expansion', 'merger', 'acquisition', 'demerger',
  'buyback', 'qip', 'preferential', 'warrant', 'stake', 'sast',
];

function isMaterialAnn(ann) {
  const cat = (ann.category || '').toLowerCase();
  if (ann.material || MATERIAL_CATEGORY_SET.has(cat)) return true;
  const text = `${ann.subject || ''} ${ann.description || ''}`.toLowerCase();
  return MATERIAL_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Novelty assessment ───────────────────────────────────────────────────────
//
// "Is this information new?" A material announcement that just restates
// something already disclosed (an earlier concall, PPT, or prior filing) is a
// weaker conviction signal than a genuine surprise. This is a soft, additive
// check — see assessNovelty() below for the light-touch downgrade rule.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'under', 'regulation', 'reg', 'ltd', 'limited',
  'company', 'board', 'meeting', 'intimation', 'disclosure', 'disclosures', 'announcement',
  'sebi', 'lodr', 'this', 'that', 'has', 'have', 'been', 'are', 'was', 'were', 'its', 'shares',
  'share', 'private', 'private limited', 'pursuant', 'per', 'held', 'inter', 'alia',
]);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Jaccard similarity over token sets — cheap, deterministic, no API. */
function textSimilarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

// Explicit phrasing that flags a filing as a follow-up to something already
// disclosed, independent of text-similarity matching against our own history.
const FOLLOWUP_PHRASES = [
  /further to (our|the)/i, /in continuation of/i, /as (already )?informed/i,
  /as intimated (earlier|previously)/i, /follow[- ]?up to/i, /pursuant to (our|the) (earlier|previous)/i,
  /corrigendum/i, /clarification to/i, /revised (intimation|announcement)/i, /reiterat/i,
  /update on/i, /status update/i,
];

function looksLikeFollowUpPhrasing(subject) {
  return FOLLOWUP_PHRASES.some((re) => re.test(subject || ''));
}

const NOVELTY_SIMILARITY_THRESHOLD = 0.55;
const NOVELTY_LOOKBACK_DAYS = 90;

function normalizeCompanyId(id) {
  // Defensive: some historical records were double-prefixed (e.g.
  // "NSE:NSE:FOO", or "NSE:BSE:FOO" — a blanket prefix stacked on top of an
  // already-correctly-tagged ticker) by an earlier version of this pipeline.
  // Keep the INNER prefix (the original, correctly-assigned exchange tag) so
  // lookups against companies.json/notes.json still match.
  return String(id || '').replace(/^(NSE|BSE):(NSE|BSE):/, '$2:');
}

/**
 * Was this company's material news already known (prior concall/PPT/earlier
 * filing/prior gainers-signal note), or is it a genuine surprise?
 * Looks back NOVELTY_LOOKBACK_DAYS across: this company's own past `gainer`
 * events (their announcement evidence lines) and its watchlist-insights notes
 * (announcementTitle + insight text). Returns null (unknown) when there's no
 * history to compare against — absence of history is not evidence of repetition.
 */
function assessNovelty(companyId, materialSubjects, db, { lookbackDays = NOVELTY_LOOKBACK_DAYS } = {}) {
  if (!materialSubjects.length) return null;
  const cid = normalizeCompanyId(companyId);
  const since = new Date(Date.now() - lookbackDays * 864e5).toISOString().slice(0, 10);

  let pastTexts = [];
  try {
    const pastGainerEvents = db.find('events', { companyId: cid, type: 'gainer', since });
    for (const e of pastGainerEvents) {
      for (const line of e.evidence || []) {
        if (line.startsWith('📋') || line.startsWith('📄')) pastTexts.push(line.slice(2).trim());
      }
    }
  } catch (_) { /* best-effort */ }

  try {
    const pastNotes = db.find('notes', { companyId: cid, since }).filter((n) => n.type !== 'business-summary');
    for (const n of pastNotes) {
      if (n.announcementTitle) pastTexts.push(n.announcementTitle);
      if (n.text) pastTexts.push(n.text);
    }
  } catch (_) { /* best-effort */ }

  if (!pastTexts.length) return null; // no history to compare against — unknown, not "repeat"

  let newCount = 0;
  let followUpCount = 0;
  const matches = [];
  for (const subj of materialSubjects) {
    if (looksLikeFollowUpPhrasing(subj)) {
      followUpCount += 1;
      matches.push({ subject: subj, reason: 'phrasing' });
      continue;
    }
    let best = 0;
    let bestText = null;
    for (const t of pastTexts) {
      const sim = textSimilarity(subj, t);
      if (sim > best) { best = sim; bestText = t; }
    }
    if (best >= NOVELTY_SIMILARITY_THRESHOLD) {
      followUpCount += 1;
      matches.push({ subject: subj, reason: 'similarity', score: Math.round(best * 100) / 100, matchedPrior: bestText });
    } else {
      newCount += 1;
    }
  }
  return { assessed: true, total: materialSubjects.length, newCount, followUpCount, matches };
}

function buildEvidence(g, sectorCatalystIndustries, novelty) {
  const ev = [];

  // Announcements
  const anns = g.announcements || [];
  for (const ann of anns) {
    const subj = ann.subject || '';
    const mat = isMaterialAnn(ann);
    const icon = mat ? '📋' : '📄';
    if (subj) {
      ev.push(`${icon} ${subj.substring(0, 120)}`);
    } else {
      ev.push(`${icon} ${ann.category}`);
    }
  }
  if (novelty && novelty.assessed && novelty.followUpCount > 0) {
    ev.push(
      novelty.followUpCount === novelty.total
        ? '🔁 All material announcement(s) look like follow-ups to prior disclosures — not new information'
        : `🔁 ${novelty.followUpCount}/${novelty.total} material announcement(s) look like follow-ups to prior disclosures`
    );
  }

  // Delivery
  const deliv = g.delivery || {};
  if (deliv.available) {
    const src = deliv.source || '';
    const tag = src.toLowerCase().includes('nse') ? '[NSE]' : '[BSE]';
    const pct = deliv.deliv_per;
    if (pct !== undefined && pct !== null) {
      ev.push(`Delivery ${pct.toFixed(1)}% ${tag}`);
    }
    if (deliv.high_delivery) {
      ev.push("⚡ High-delivery flag");
    }
  } else {
    ev.push("⚠️ Delivery data unavailable — confirm on bseindia.com");
  }

  // Price signals
  const ps = g.price_signals || {};
  if (ps.error === undefined) {
    if (ps.vol_spike) {
      if (typeof ps.vol_ratio === 'number') {
        ev.push(`🔊 Volume spike (${ps.vol_ratio.toFixed(1)}x avg)`);
      } else {
        ev.push("🔊 Volume spike");
      }
    }
    if (ps.breakout_52w) {
      ev.push("🚀 52-week high breakout");
    }
    if (ps.above_200dma) {
      ev.push("📈 Above 200-DMA");
    }
    if (typeof ps.rsi === 'number' && ps.rsi > 70) {
      ev.push(`RSI ${Math.round(ps.rsi)} (overbought)`);
    }
  } else {
    ev.push("⚠️ Price-history signals unavailable");
  }

  // Sector
  if (sectorCatalystIndustries.has(g.industry)) {
    ev.push(`🏭 Sector broad move: ${g.industry}`);
  }

  return ev;
}

function classify(g, sectorCatalystIndustries, novelty) {
  const deliv = g.delivery || {};
  const delivPct = deliv.available ? (deliv.deliv_per || 0) : 0;
  const highDel = !!deliv.high_delivery;
  const hasMat = !!g.has_material_ann;
  const anns = g.announcements || [];

  const ps = g.price_signals || {};
  const psOk = ps.error === undefined;
  const volSpike = psOk && !!ps.vol_spike;
  const breakout = psOk && !!ps.breakout_52w;
  const above200 = psOk && !!ps.above_200dma;

  const inSector = sectorCatalystIndustries.has(g.industry);

  // FUNDAMENTAL
  if (hasMat && anns.length > 0) {
    let conviction = (highDel || delivPct >= 30) ? "HIGH" : "MEDIUM";
    // Novelty check (light touch, per user guidance — never more than one notch,
    // and only when EVERY material announcement looks like a reiteration of
    // something already disclosed, not a mix). A HIGH built on stale news is
    // weaker than a HIGH built on a genuine surprise; a MEDIUM stays MEDIUM —
    // this metric nudges, it doesn't dominate the read.
    if (novelty && novelty.assessed && novelty.total > 0 && novelty.followUpCount === novelty.total && conviction === "HIGH") {
      conviction = "MEDIUM";
    }
    return { primary_driver: "FUNDAMENTAL", conviction };
  }

  // SECTOR_CATALYST
  if (inSector) {
    const conviction = (highDel || delivPct >= 30) ? "HIGH" : "MEDIUM";
    return { primary_driver: "SECTOR_CATALYST", conviction };
  }

  // PRICE_ACTION
  const paSignals = (highDel ? 1 : 0) + (volSpike ? 1 : 0) + (breakout ? 1 : 0) + (above200 ? 1 : 0) + (delivPct >= 40 ? 1 : 0);
  if (paSignals >= 2) {
    return { primary_driver: "PRICE_ACTION", conviction: "HIGH" };
  }
  if (paSignals === 1 || delivPct >= 25) {
    return { primary_driver: "PRICE_ACTION", conviction: "MEDIUM" };
  }

  // VOLATILITY
  return { primary_driver: "VOLATILITY", conviction: "LOW" };
}

function main() {
  const rawPath = latestRaw();
  console.error(`[classifier] reading ${path.basename(rawPath)}`);

  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const marketDate = raw.market_date;
  const gainers = raw.gainers || [];
  const indSummary = raw.industry_summary || {};

  const sectorCatalystIndustries = new Set();
  for (const [ind, info] of Object.entries(indSummary)) {
    if ((info.gainer_count || 0) >= 3) {
      sectorCatalystIndustries.add(ind);
    }
  }

  const signals = [];
  for (const g of gainers) {
    const anns = g.announcements || [];
    const materialSubjects = g.has_material_ann
      ? anns.filter(isMaterialAnn).map((a) => a.subject || a.category || '').filter(Boolean)
      : [];
    const novelty = assessNovelty(g.ticker, materialSubjects, db);

    const cls = classify(g, sectorCatalystIndustries, novelty);
    const driver = cls.primary_driver;
    const conv = cls.conviction;
    const ev = buildEvidence(g, sectorCatalystIndustries, novelty);
    const inEm = (conv === "HIGH" || conv === "MEDIUM") && driver !== "VOLATILITY";
    const nowIso = new Date().toISOString();

    signals.push({
      // DTO envelope (skills/tooling/output-dto-standard/SKILL.md) — required on every
      // record: companyId reuses the existing ticker identifier, creator names this skill.
      companyId: g.ticker,
      creationTime: nowIso,
      modifiedTime: nowIso,
      creator: "gainers-signal",
      ticker: g.ticker,
      name: g.name,
      industry: g.industry || "",
      return_1d: g.return_1d,
      market_cap_cr: g.market_cap_cr,
      primary_driver: driver,
      conviction: conv,
      in_email: inEm,
      evidence: ev,
      delivery: g.delivery || {},
      ann_count: g.ann_count || 0,
      has_material_ann: g.has_material_ann || false,
      // "Is this new?" — see assessNovelty(). null = no history to compare
      // against (not a repeat, just unassessed); otherwise counts of material
      // announcements that read as genuinely new vs. a reiteration of prior
      // disclosures. Informational even when it didn't move conviction.
      novelty: novelty || null,
    });
  }

  const sectorCatalysts = {};
  for (const ind of sectorCatalystIndustries) {
    const info = indSummary[ind] || {};
    const tickers = info.gainer_tickers || [];
    const returns = gainers.filter(g => tickers.includes(g.ticker)).map(g => g.return_1d).filter(r => r !== undefined && r !== null);
    
    let avgReturn = 0;
    if (returns.length > 0) {
      const sum = returns.reduce((a, b) => a + b, 0);
      avgReturn = Math.round((sum / returns.length) * 100) / 100;
    }

    sectorCatalysts[ind] = {
      tickers,
      avg_return: avgReturn,
    };
  }

  const totalAnalyzed = signals.length;
  const inEmailCount = signals.filter(s => s.in_email).length;
  const noiseExcluded = totalAnalyzed - inEmailCount;

  const insights = {
    schema_version: "1.0",
    market_date: marketDate,
    total_analyzed: totalAnalyzed,
    in_email: inEmailCount,
    noise_excluded: noiseExcluded,
    ann_api_available: gainers.some(g => (g.ann_count || 0) > 0),
    price_api_available: gainers.some(g => g.price_signals && g.price_signals.error === undefined),
    sector_catalysts: sectorCatalysts,
    signals,
  };

  // Canonical store: one event record per signal (deterministic ids — re-runs upsert).
  const eventRecords = signals
    .filter((s) => s.companyId || s.ticker)
    .map((s) => ({
      ...s,
      type: 'gainer',
      date: marketDate,
      companyId: s.companyId || `NSE:${String(s.ticker).toUpperCase()}`,
      creator: s.creator || 'gainers-signal',
      summary: `${s.ticker} +${s.return_1d}% — ${s.primary_driver} (${s.conviction})`,
    }));
  const stats = db.appendEvents(eventRecords);

  // Full DTO for the email render step (regenerable → runs/).
  const outPath = path.join(RUNS_DIR, `gainers_insights_${marketDate.replace(/-/g, '')}.json`);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(insights, null, 2));

  // Top-3-by-conviction context seed for the mandatory follow-up briefings
  // (gainers-signal SKILL.md Step 3.5). Ranking + context assembly is
  // deterministic; writing the actual analyst briefing DTO (contrasting new
  // vs. already-known info, per Convention §8) is a judgment step done from
  // this seed, not here — this script never calls an LLM.
  const CONVICTION_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const top3 = [...signals]
    .filter((s) => s.in_email)
    .sort((a, b) =>
      (CONVICTION_RANK[b.conviction] || 0) - (CONVICTION_RANK[a.conviction] || 0) ||
      Math.abs(b.return_1d || 0) - Math.abs(a.return_1d || 0))
    .slice(0, 3);
  const top3Context = top3.map((s) => {
    const cid = normalizeCompanyId(s.companyId);
    let context = null;
    try {
      context = buildCompanyContext(cid);
    } catch (e) {
      context = { error: e.message };
    }
    return {
      companyId: cid, ticker: s.ticker, name: s.name, conviction: s.conviction,
      primary_driver: s.primary_driver, return_1d: s.return_1d, evidence: s.evidence,
      novelty: s.novelty, context,
    };
  });
  const top3Path = path.join(RUNS_DIR, `gainers_top3_context_${marketDate.replace(/-/g, '')}.json`);
  fs.writeFileSync(top3Path, JSON.stringify({
    market_date: marketDate,
    purpose: 'Context seed for the mandatory top-3-by-conviction briefing reports — see gainers-signal SKILL.md Step 3.5. Write one db.saveReport() DTO per company from this.',
    companies: top3Context,
  }, null, 2));

  console.error(`[classifier] events: +${stats.inserted}/${stats.updated}~; wrote ${path.basename(outPath)}, ${path.basename(top3Path)} (top-3: ${top3.map(s => s.ticker).join(', ') || 'none'})  (${totalAnalyzed} analyzed, ${inEmailCount} in email)`);
}

// Offline-testable exports (Convention §4) — business logic importable without
// hitting fs/db, aside from assessNovelty which takes `db` as an explicit param
// so tests can pass a mock.
module.exports = {
  classify, buildEvidence, isMaterialAnn, assessNovelty, textSimilarity, tokenize,
  looksLikeFollowUpPhrasing, normalizeCompanyId, main,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
