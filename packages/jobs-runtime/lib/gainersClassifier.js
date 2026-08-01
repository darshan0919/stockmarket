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
const taxonomy = require('./announcementTaxonomy');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');

const RUNS_DIR = path.join(db.dataRoot(), 'runs');

// ── Thresholds ───────────────────────────────────────────────────────────────
// Kept together and named, because these numbers ARE the signal definition and
// they need to be tunable in one place when the ledger says they're miscalibrated.
const HIGH_DELIVERY_PCT = 50; // classic "delivery-backed" bar
const DECENT_DELIVERY_PCT = 40; // the user's "decent delivery" bar for cluster membership
const MIN_DELIVERY_PCT = 30; // below this, the move is intraday churn

// Absolute rupee conviction. For a large-cap, 25% delivery on ₹400 Cr of turnover
// is ₹100 Cr of real buying — far more meaningful than 70% delivery on a ₹3 Cr
// micro-cap. Percentage alone systematically over-weights illiquid names, which
// is exactly why delivery VALUE is now a first-class ranking axis.
const HIGH_DELIVERY_VALUE_CR = 50;
const DECENT_DELIVERY_VALUE_CR = 20;

const SECTOR_CLUSTER_MIN = 3; // >=3 qualified names in one industry = cluster
const SECTOR_SUPER_CLUSTER_MIN = 4; // >=4 = "super strong", per the user's rule

const RESEARCH_TOP_N_PER_AXIS = 10; // 10 by delivery %, 10 by delivery value = 20

function latestRaw(runsDir = RUNS_DIR) {
  if (!fs.existsSync(runsDir)) {
    throw new Error(`No such directory: ${runsDir}`);
  }
  const files = fs
    .readdirSync(runsDir)
    .filter((f) => /^gainers_raw_\d{8}\.json$/.test(f))
    .sort(); // lexical sort works for YYYYMMDD
  if (files.length === 0) {
    throw new Error(`No gainers_raw_*.json in ${runsDir}`);
  }
  return path.join(runsDir, files[files.length - 1]);
}

/**
 * Materiality now comes from the shared taxonomy (lib/announcementTaxonomy.js),
 * not from a keyword list private to this file. The old arrangement kept TWO
 * lists — one here, one in gainersScanner.js — which drifted: an "Award of Order"
 * was material to the scanner but routine here, so it drove the FUNDAMENTAL
 * branch while being rendered with the 📄 routine icon.
 *
 * `isMaterialAnn` is the STRONG-or-SUPPORTING boolean kept for the novelty check
 * and evidence icons; prefer `annStrength()` where the three-way distinction
 * matters (it usually does).
 */
function annStrength(ann) {
  return ann.strength || taxonomy.announcementStrength(ann);
}

function isMaterialAnn(ann) {
  return annStrength(ann) !== 'ROUTINE';
}

// ── Streak: how many consecutive sessions has this name shown up? ────────────
//
// A single +8% day is an event; the same name appearing four sessions running
// with delivery behind it is a campaign. Streak is the cheapest way to tell those
// apart and it needs no extra API calls — every past run already wrote one
// `gainer` event per company per market date.
//
// Trading days are derived from the run dates we actually observed, NOT a market
// calendar: if the job didn't run on a day, that day simply isn't in the sequence
// and cannot break a streak. We can't observe absence on a day we never looked.
// A day we DID run but the company didn't appear resets the streak to 1 (per the
// chosen "gap resets" rule).
const STREAK_LOOKBACK_DAYS = 45;

/**
 * Build { runDates: [desc], byDate: { date: Set(companyId) } } from past events.
 * Done once per run rather than per company — a per-company db.find() over the
 * events partitions would be O(companies × file reads) for identical data.
 */
function loadStreakHistory(dbRef, marketDate, { lookbackDays = STREAK_LOOKBACK_DAYS } = {}) {
  const since = new Date(new Date(`${marketDate}T00:00:00Z`).getTime() - lookbackDays * 864e5)
    .toISOString()
    .slice(0, 10);
  const byDate = new Map();
  try {
    for (const e of dbRef.find('events', { type: 'gainer', since })) {
      if (!e.date || e.date >= marketDate) continue; // today is added by the caller
      if (!byDate.has(e.date)) byDate.set(e.date, new Set());
      byDate.get(e.date).add(normalizeCompanyId(e.companyId || e.ticker));
    }
  } catch (_) {
    /* best-effort: no history → every streak is 1, which is correct on day one */
  }
  const runDates = [...byDate.keys()].sort().reverse();
  return { runDates, byDate };
}

/**
 * Consecutive appearances ending today. Today always counts, so the minimum is 1.
 * Returns { streak, priorDates } — priorDates lets the email say "4th straight
 * session" and cite which ones.
 */
function computeStreak(companyId, history) {
  const cid = normalizeCompanyId(companyId);
  let streak = 1;
  const priorDates = [];
  for (const d of history.runDates) {
    const present = history.byDate.get(d);
    if (present && present.has(cid)) {
      streak += 1;
      priorDates.push(d);
    } else {
      break; // gap resets
    }
  }
  return { streak, priorDates };
}

// ── Novelty assessment ───────────────────────────────────────────────────────
//
// "Is this information new?" A material announcement that just restates
// something already disclosed (an earlier concall, PPT, or prior filing) is a
// weaker conviction signal than a genuine surprise. This is a soft, additive
// check — see assessNovelty() below for the light-touch downgrade rule.

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'under',
  'regulation',
  'reg',
  'ltd',
  'limited',
  'company',
  'board',
  'meeting',
  'intimation',
  'disclosure',
  'disclosures',
  'announcement',
  'sebi',
  'lodr',
  'this',
  'that',
  'has',
  'have',
  'been',
  'are',
  'was',
  'were',
  'its',
  'shares',
  'share',
  'private',
  'private limited',
  'pursuant',
  'per',
  'held',
  'inter',
  'alia',
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
  /further to (our|the)/i,
  /in continuation of/i,
  /as (already )?informed/i,
  /as intimated (earlier|previously)/i,
  /follow[- ]?up to/i,
  /pursuant to (our|the) (earlier|previous)/i,
  /corrigendum/i,
  /clarification to/i,
  /revised (intimation|announcement)/i,
  /reiterat/i,
  /update on/i,
  /status update/i,
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
  // lookups against companies.json/notes.json still match. Composed with the
  // shared series-suffix sanitizer ("-BE"/"-SM"/etc — see
  // stock-api/src/utils/companyId.js) so callers get both fixes from one place.
  const deprefixed = String(id || '').replace(/^(NSE|BSE):(NSE|BSE):/, '$2:');
  return sanitizeCompanyId(deprefixed);
}

/**
 * Was this company's material news already known (prior concall/PPT/earlier
 * filing/prior gainers-signal note), or is it a genuine surprise?
 * Looks back NOVELTY_LOOKBACK_DAYS across: this company's own past `gainer`
 * events (their announcement evidence lines) and its watchlist-insights notes
 * (announcementTitle + insight text). Returns null (unknown) when there's no
 * history to compare against — absence of history is not evidence of repetition.
 */
function assessNovelty(
  companyId,
  materialSubjects,
  db,
  { lookbackDays = NOVELTY_LOOKBACK_DAYS } = {}
) {
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
  } catch (_) {
    /* best-effort */
  }

  try {
    const pastNotes = db
      .find('notes', { companyId: cid, since })
      .filter((n) => n.type !== 'business-summary');
    for (const n of pastNotes) {
      if (n.announcementTitle) pastTexts.push(n.announcementTitle);
      if (n.text) pastTexts.push(n.text);
    }
  } catch (_) {
    /* best-effort */
  }

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
      if (sim > best) {
        best = sim;
        bestText = t;
      }
    }
    if (best >= NOVELTY_SIMILARITY_THRESHOLD) {
      followUpCount += 1;
      matches.push({
        subject: subj,
        reason: 'similarity',
        score: Math.round(best * 100) / 100,
        matchedPrior: bestText,
      });
    } else {
      newCount += 1;
    }
  }
  return { assessed: true, total: materialSubjects.length, newCount, followUpCount, matches };
}

/** Delivery facts in one place — every branch below reads the same numbers. */
function deliveryFacts(g) {
  const d = g.delivery || {};
  const pct = d.available ? d.deliv_per || 0 : 0;
  // A missing delivery VALUE is unknown, not zero. Coercing it to 0 would let a
  // measurement gap masquerade as "no real money traded" — and since value is a
  // primary ranking axis, that silently demotes the affected names.
  const rawValue = d.available ? d.deliv_value_cr : null;
  const valueKnown = rawValue !== null && rawValue !== undefined;
  const valueCr = valueKnown ? rawValue : null;
  return {
    available: !!d.available,
    pct,
    valueCr,
    valueKnown,
    tradedValueCr: d.trd_value_cr || null,
    source: (d.source || '').toLowerCase().includes('nse') ? 'NSE' : 'BSE',
    // "Decent delivery" is satisfied by EITHER axis: a high percentage (conviction
    // relative to the day's own volume) or a large absolute rupee amount
    // (conviction in size, which is what matters once market cap is large enough
    // that a high percentage becomes arithmetically hard).
    decent: pct >= DECENT_DELIVERY_PCT || (valueKnown && valueCr >= DECENT_DELIVERY_VALUE_CR),
    strong: pct >= HIGH_DELIVERY_PCT || (valueKnown && valueCr >= HIGH_DELIVERY_VALUE_CR),
    // Only call it churn when we can see BOTH axes are small. A low percentage
    // with an unknown rupee value is simply unproven.
    weak: pct > 0 && pct < MIN_DELIVERY_PCT && valueKnown && valueCr < DECENT_DELIVERY_VALUE_CR,
  };
}

function buildEvidence(g, sectorCatalystIndustries, novelty, extra = {}) {
  const ev = [];
  const { streak, cluster } = extra;

  // Streak first — it is the single most decision-relevant line when >1, because
  // it reframes everything below it from "a move" into "an ongoing move".
  if (streak && streak.streak > 1) {
    ev.push(
      `🔥 Day ${streak.streak} of consecutive appearances (since ${streak.priorDates[streak.priorDates.length - 1]})`
    );
  }

  // Announcements, strongest first — the old code emitted them in API order, so a
  // ₹500 Cr order win could sit below three compliance filings.
  const anns = [...(g.announcements || [])].sort((a, b) => {
    const rank = { STRONG: 0, SUPPORTING: 1, ROUTINE: 2 };
    return (rank[annStrength(a)] ?? 2) - (rank[annStrength(b)] ?? 2);
  });
  for (const ann of anns) {
    const subj = ann.subject || ann.category || '';
    const strength = annStrength(ann);
    const icon = strength === 'STRONG' ? '📋' : strength === 'SUPPORTING' ? '📎' : '📄';
    const label = ann.category_label ? `[${ann.category_label}] ` : '';
    ev.push(`${icon} ${label}${String(subj).substring(0, 120)}`);
  }
  if (novelty && novelty.assessed && novelty.followUpCount > 0) {
    ev.push(
      novelty.followUpCount === novelty.total
        ? '🔁 All material announcement(s) look like follow-ups to prior disclosures — not new information'
        : `🔁 ${novelty.followUpCount}/${novelty.total} material announcement(s) look like follow-ups to prior disclosures`
    );
  }

  // Delivery — always report BOTH axes together. The percentage alone misleads in
  // opposite directions at the two ends of the market-cap range, so the rupee
  // figure travels with it everywhere it appears.
  const d = deliveryFacts(g);
  if (d.available) {
    const parts = [`Delivery ${d.pct.toFixed(1)}% [${d.source}]`];
    if (d.valueCr) parts.push(`₹${d.valueCr.toFixed(1)} Cr delivered`);
    if (d.tradedValueCr) parts.push(`of ₹${d.tradedValueCr.toFixed(1)} Cr traded`);
    ev.push(parts.join(' · '));
    if (d.strong) ev.push('⚡ Delivery-backed move');
    else if (d.weak) ev.push('💨 Low delivery — largely intraday churn');
  } else {
    ev.push('⚠️ Delivery data unavailable — confirm on bseindia.com');
  }

  // Price signals
  const ps = g.price_signals || {};
  if (ps.error === undefined) {
    if (ps.vol_spike) {
      if (typeof ps.vol_ratio === 'number') {
        ev.push(`🔊 Volume spike (${ps.vol_ratio.toFixed(1)}x avg)`);
      } else {
        ev.push('🔊 Volume spike');
      }
    }
    if (ps.breakout_52w) {
      ev.push('🚀 52-week high breakout');
    }
    if (ps.above_200dma) {
      ev.push('📈 Above 200-DMA');
    }
    if (typeof ps.rsi === 'number' && ps.rsi > 70) {
      ev.push(`RSI ${Math.round(ps.rsi)} (overbought)`);
    }
  } else {
    ev.push('⚠️ Price-history signals unavailable');
  }

  // Sector cluster
  if (cluster) {
    const peers = cluster.qualified_tickers.filter((t) => t !== g.ticker);
    ev.push(
      cluster.tier === 'SUPER_STRONG'
        ? `🏭🔥 SUPER-STRONG sector cluster — ${cluster.qualified_count} ${g.industry} names up on delivery-backed volume (₹${cluster.qualified_delivery_value_cr.toFixed(0)} Cr delivered across the cluster): ${peers.join(', ')}`
        : `🏭 Sector cluster — ${cluster.qualified_count} ${g.industry} names up on delivery-backed volume: ${peers.join(', ')}`
    );
  } else if (sectorCatalystIndustries.has(g.industry)) {
    ev.push(`🏭 Sector broad move: ${g.industry} (not delivery-confirmed)`);
  }

  return ev;
}

/**
 * Classify one gainer.
 *
 * The organising idea: a signal is ACTIONABLE when a real-world CAUSE (a strong
 * announcement, or a sector-wide move) coincides with EVIDENCE OF CONVICTION
 * (delivery-backed buying, ideally sustained across sessions). Either one alone is
 * merely informative — an order win the market shrugged at tells you nothing
 * tradeable, and delivery with no discoverable cause is unexplained, not
 * necessarily good.
 *
 * Returns `{ primary_driver, conviction, tier, reasons }`. `tier` is what the
 * email is organised by: ACT / WATCH / NOTED.
 */
function classify(g, sectorCatalystIndustries, novelty, extra = {}) {
  const { streak = { streak: 1 }, cluster = null } = extra;
  const d = deliveryFacts(g);
  const anns = g.announcements || [];
  const annStrengthTop = g.ann_strength || taxonomy.strongestOf(anns);
  const hasStrongAnn = annStrengthTop === 'STRONG';
  const hasSupportingAnn = annStrengthTop === 'SUPPORTING';

  // Is the strong news an UNSCHEDULED surprise (order win, SAST, QIP, M&A,
  // capacity) or a calendar event everyone files in the same fortnight
  // (results/dividend)? See SCHEDULED_CATEGORIES for why this matters.
  const strongCats = anns
    .filter((a) => annStrength(a) === 'STRONG')
    .map((a) => a.category_derived || taxonomy.categoriseAnnouncement(a.subject, a.description));
  const hasUnscheduledStrong = strongCats.some((cat) => !taxonomy.isScheduled(cat));

  const ps = g.price_signals || {};
  const psOk = ps.error === undefined;
  const volSpike = psOk && !!ps.vol_spike;
  const breakout = psOk && !!ps.breakout_52w;
  const aboveLongMa = psOk && ps.above_long_ma === true;
  const overbought = psOk && typeof ps.rsi === 'number' && ps.rsi > 80;

  const sustained = streak.streak >= 2;
  const reasons = [];

  // ── Driver: what best explains the move? ──────────────────────────────────
  let primary_driver;
  if (hasStrongAnn) primary_driver = 'FUNDAMENTAL';
  else if (cluster) primary_driver = 'SECTOR_CATALYST';
  else if (hasSupportingAnn) primary_driver = 'FUNDAMENTAL';
  else if (d.decent || volSpike || breakout) primary_driver = 'PRICE_ACTION';
  else primary_driver = 'VOLATILITY';

  // ── Conviction: how much do we believe it? ────────────────────────────────
  // Built additively so the reasons are inspectable in the DTO rather than
  // hidden inside a branch — the validation ledger needs to know WHY something
  // was called HIGH before it can tell us the rule is wrong.
  let score = 0;
  if (hasStrongAnn && hasUnscheduledStrong) {
    score += 2;
    reasons.push(`unscheduled strong announcement (${strongCats.join(', ')})`);
  } else if (hasStrongAnn) {
    // Scheduled-only (results/dividend). Real, but not differentiating in
    // results season — delivery has to carry this into the top tier.
    score += 1;
    reasons.push(`scheduled filing (${strongCats.join(', ')})`);
  } else if (hasSupportingAnn) {
    score += 1;
    reasons.push('supporting announcement');
  }
  if (d.strong) {
    score += 2;
    reasons.push(`delivery ${d.pct.toFixed(0)}% / ₹${d.valueCr.toFixed(0)} Cr`);
  } else if (d.decent) {
    score += 1;
    reasons.push(`decent delivery ${d.pct.toFixed(0)}% / ₹${d.valueCr.toFixed(0)} Cr`);
  } else if (d.weak) {
    score -= 1;
    reasons.push('low delivery — intraday churn');
  } else if (!d.available) {
    reasons.push('delivery unavailable');
  }
  if (cluster) {
    score += cluster.tier === 'SUPER_STRONG' ? 2 : 1;
    reasons.push(`${cluster.tier === 'SUPER_STRONG' ? 'super-strong ' : ''}sector cluster`);
  }
  if (sustained && d.decent) {
    score += 1;
    reasons.push(`${streak.streak}-day streak with delivery`);
  } else if (sustained) {
    reasons.push(`${streak.streak}-day streak (delivery not confirming)`);
  }
  if (breakout) {
    score += 1;
    reasons.push('at/near window high');
  }
  if (volSpike && !d.weak) {
    score += 1;
    reasons.push(`volume ${ps.vol_ratio ? `${ps.vol_ratio.toFixed(1)}x` : 'spike'}`);
  }
  if (aboveLongMa) score += 0.5;
  if (overbought) {
    score -= 0.5;
    reasons.push(`RSI ${ps.rsi} — extended`);
  }

  // Novelty (light touch, unchanged in spirit): news that merely restates a prior
  // disclosure shouldn't earn full fundamental credit. Only applied when EVERY
  // material announcement reads as a reiteration — a mix is left alone.
  const allStale =
    novelty && novelty.assessed && novelty.total > 0 && novelty.followUpCount === novelty.total;
  if (allStale && (hasStrongAnn || hasSupportingAnn)) {
    score -= 1;
    reasons.push('announcements restate prior disclosures');
  }

  // Concall sentiment (see gainersScanner.js fetchConcallSentiment/parseConcallScanRows).
  // `recentWithinDays` is computed live from concall-scan row index 4 (confirmed
  // 2026-08-01 — docs/stockscans-api-schemas.md), so this only activates for a
  // genuinely recent filing, not a stale one. A bullish/optimistic transcript is
  // corroborating evidence for the move, same spirit as a STRONG announcement,
  // but weighted lower since it explains sentiment rather than a discrete event.
  const concall = g.concall;
  if (concall && concall.sentiment && typeof concall.recentWithinDays === 'number' && concall.recentWithinDays <= 7) {
    if (concall.sentiment === 'Bullish') {
      score += 1.5;
      reasons.push(
        `bullish concall filed ${concall.recentWithinDays}d ago (quality ${concall.resultQualityScore ?? '—'}/100)`
      );
    } else if (concall.sentiment === 'Optimistic') {
      score += 1;
      reasons.push(
        `optimistic concall filed ${concall.recentWithinDays}d ago (quality ${concall.resultQualityScore ?? '—'}/100)`
      );
    } else if (concall.sentiment === 'Bearish') {
      score -= 1;
      reasons.push(`bearish concall filed ${concall.recentWithinDays}d ago — cuts against the move`);
    }
  }

  const conviction = score >= 4 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW';

  // ── Tier: what should the reader DO? ──────────────────────────────────────
  // ACT requires a cause AND conviction behind it. This is the whole point of the
  // refactor: previously any material announcement plus 30% delivery produced a
  // HIGH, so the email filled with filings nobody traded on.
  let tier;
  // A scheduled results filing on its own is not a "known cause" for ACT — every
  // peer filed one the same week. It becomes one when delivery confirms the
  // market actually re-rated on it, which the HIGH-conviction requirement below
  // already enforces.
  const causeKnown = hasUnscheduledStrong || !!cluster;
  if (causeKnown && d.decent && conviction === 'HIGH') {
    tier = 'ACT';
  } else if (conviction === 'HIGH' || (conviction === 'MEDIUM' && (causeKnown || sustained))) {
    tier = 'WATCH';
  } else if (conviction === 'MEDIUM' && d.decent) {
    // "Gaining WITH decent delivery is itself a strong signal" — even with no
    // discoverable cause. Unexplained delivery-backed buying is often the earliest
    // observable stage of accumulation, before any filing exists; burying it in
    // NOTED would defeat the purpose of watching delivery at all. It sits in WATCH
    // rather than ACT precisely because the cause is still unknown.
    tier = 'WATCH';
  } else {
    tier = 'NOTED';
  }

  return { primary_driver, conviction, tier, score: Math.round(score * 10) / 10, reasons };
}

/**
 * Delivery-confirmed sector clusters from the scanner's industry summary.
 *
 * The user's rule: 3-4 names from the same sector gaining with decent delivery is
 * a "super strong" signal. Implemented as >=3 qualified names = STRONG, >=4 =
 * SUPER_STRONG. Note this counts QUALIFIED members (delivery-backed), not merely
 * co-moving ones — see the scanner's industry-summary comment for why.
 */
function buildSectorClusters(indSummary) {
  const out = {};
  for (const [ind, info] of Object.entries(indSummary || {})) {
    const q = info.qualified_count || 0;
    if (q < SECTOR_CLUSTER_MIN) continue;
    out[ind] = {
      industry: ind,
      tier: q >= SECTOR_SUPER_CLUSTER_MIN ? 'SUPER_STRONG' : 'STRONG',
      qualified_count: q,
      qualified_tickers: info.qualified_tickers || [],
      qualified_delivery_value_cr: info.qualified_delivery_value_cr || 0,
      total_gainers: info.gainer_count || 0,
      breadth: info.breadth || {},
    };
  }
  return out;
}

/**
 * Pick the 20 companies that get in-depth trigger research.
 *
 * Per the user's spec: top 10 by delivery %, then top 10 by delivery VALUE with
 * the first list excluded. The two axes deliberately surface different things —
 * percentage finds high-conviction accumulation in small/mid caps, absolute value
 * finds where the real money went, which in large caps can be substantial even at
 * an unremarkable percentage.
 *
 * Only companies with available delivery data are eligible; a name we couldn't
 * measure can't be ranked on either axis, and silently treating a missing value
 * as 0 would push genuinely-unknown names to the bottom as if we'd checked.
 */
function selectResearchTargets(signals, perAxis = RESEARCH_TOP_N_PER_AXIS) {
  const eligible = signals.filter((s) => s.delivery_pct !== null && s.delivery_pct !== undefined);

  const byPct = [...eligible]
    .sort((a, b) => b.delivery_pct - a.delivery_pct || (b.return_1d || 0) - (a.return_1d || 0))
    .slice(0, perAxis);
  const chosen = new Set(byPct.map((s) => s.ticker));

  const byValue = [...eligible]
    .filter((s) => !chosen.has(s.ticker))
    .sort(
      (a, b) =>
        (b.delivery_value_cr || 0) - (a.delivery_value_cr || 0) ||
        (b.return_1d || 0) - (a.return_1d || 0)
    )
    .slice(0, perAxis);

  return [
    ...byPct.map((s) => ({ ...s, research_axis: 'DELIVERY_PCT' })),
    ...byValue.map((s) => ({ ...s, research_axis: 'DELIVERY_VALUE' })),
  ];
}

function main() {
  const rawPath = latestRaw();
  console.error(`[classifier] reading ${path.basename(rawPath)}`);

  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const marketDate = raw.market_date;
  const gainers = raw.gainers || [];
  const indSummary = raw.industry_summary || {};

  // Loose breadth (any 3+ gainers in an industry) — kept only as a weak fallback
  // label. The real cluster test below additionally requires delivery.
  const sectorCatalystIndustries = new Set();
  for (const [ind, info] of Object.entries(indSummary)) {
    if ((info.gainer_count || 0) >= SECTOR_CLUSTER_MIN) sectorCatalystIndustries.add(ind);
  }

  // Delivery-confirmed sector clusters. `qualified_count` is written by the
  // scanner and counts only members whose move was delivery-backed.
  const clusters = buildSectorClusters(indSummary);

  const streakHistory = loadStreakHistory(db, marketDate);

  const signals = [];
  for (const g of gainers) {
    const anns = g.announcements || [];
    const materialSubjects = anns
      .filter(isMaterialAnn)
      .map((a) => a.subject || a.category || '')
      .filter(Boolean);
    const novelty = assessNovelty(g.ticker, materialSubjects, db);

    const streak = computeStreak(g.ticker, streakHistory);
    const cluster = clusters[g.industry] || null;
    const extra = { streak, cluster };

    const cls = classify(g, sectorCatalystIndustries, novelty, extra);
    const driver = cls.primary_driver;
    const conv = cls.conviction;
    const ev = buildEvidence(g, sectorCatalystIndustries, novelty, extra);
    // The email now carries ACT + WATCH; NOTED collapses to a one-line ticker list.
    const inEm = cls.tier === 'ACT' || cls.tier === 'WATCH';
    const nowIso = new Date().toISOString();
    const d = deliveryFacts(g);

    signals.push({
      // DTO envelope (skills/tooling/output-dto-standard/SKILL.md) — required on every
      // record: companyId reuses the existing ticker identifier, creator names this skill.
      companyId: g.ticker,
      creationTime: nowIso,
      modifiedTime: nowIso,
      creator: 'gainers-signal',
      ticker: g.ticker,
      name: g.name,
      industry: g.industry || '',
      return_1d: g.return_1d,
      market_cap_cr: g.market_cap_cr,
      primary_driver: driver,
      conviction: conv,
      // ACT / WATCH / NOTED — the actionability tier the email is organised by.
      tier: cls.tier,
      conviction_score: cls.score,
      // Why this landed where it did. Inspectable on purpose: insight-validation
      // can only tell us a rule is miscalibrated if it can see which rule fired.
      conviction_reasons: cls.reasons,
      in_email: inEm,
      evidence: ev,
      delivery: g.delivery || {},
      // Both delivery axes promoted to top level so the email/table render and any
      // downstream sort never has to reach into the nested delivery object.
      delivery_pct: d.available ? d.pct : null,
      delivery_value_cr: d.available ? d.valueCr : null,
      traded_value_cr: d.tradedValueCr,
      streak: streak.streak,
      streak_prior_dates: streak.priorDates,
      sector_cluster: cluster ? { tier: cluster.tier, count: cluster.qualified_count } : null,
      ann_count: g.ann_count || 0,
      has_material_ann: g.has_material_ann || false,
      ann_strength: g.ann_strength || taxonomy.strongestOf(anns),
      ann_categories: g.ann_categories || [],
      // "Is this new?" — see assessNovelty(). null = no history to compare
      // against (not a repeat, just unassessed); otherwise counts of material
      // announcements that read as genuinely new vs. a reiteration of prior
      // disclosures. Informational even when it didn't move conviction.
      novelty: novelty || null,
      // Concall sentiment corroboration (see gainersScanner.js fetchConcallSentiment).
      // null = no concall data found for this company, distinct from a Neutral
      // sentiment. `recentWithinDays` is computed live from the concall date —
      // see docs/stockscans-api-schemas.md.
      concall: g.concall || null,
    });
  }

  const sectorCatalysts = {};
  for (const ind of sectorCatalystIndustries) {
    const info = indSummary[ind] || {};
    const tickers = info.gainer_tickers || [];
    const returns = gainers
      .filter((g) => tickers.includes(g.ticker))
      .map((g) => g.return_1d)
      .filter((r) => r !== undefined && r !== null);

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
  const inEmailCount = signals.filter((s) => s.in_email).length;
  const noiseExcluded = totalAnalyzed - inEmailCount;

  const insights = {
    schema_version: '2.0',
    market_date: marketDate,
    total_analyzed: totalAnalyzed,
    in_email: inEmailCount,
    noise_excluded: noiseExcluded,
    tier_counts: signals.reduce((acc, s) => {
      acc[s.tier] = (acc[s.tier] || 0) + 1;
      return acc;
    }, {}),
    // Delivery-confirmed sector clusters, keyed by industry. A SUPER_STRONG entry
    // here is the strongest single thing in the report and leads the email.
    sector_clusters: clusters,
    // Names appearing for a 2nd+ consecutive session — the "is this a campaign or
    // a one-day pop" list, surfaced separately because it's the cheapest
    // high-signal read in the whole report.
    streaks: signals
      .filter((s) => s.streak > 1)
      .sort((a, b) => b.streak - a.streak)
      .map((s) => ({
        ticker: s.ticker,
        name: s.name,
        streak: s.streak,
        tier: s.tier,
        delivery_pct: s.delivery_pct,
        delivery_value_cr: s.delivery_value_cr,
      })),
    ann_api_available: gainers.some((g) => (g.ann_count || 0) > 0),
    price_api_available: gainers.some(
      (g) => g.price_signals && g.price_signals.error === undefined
    ),
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

  // Top-20 trigger-research seed (gainers-signal SKILL.md Step 4). Selection and
  // context assembly are deterministic; reading the announcement PDFs and writing
  // the trigger analysis is the judgment step done from this seed — this script
  // never calls an LLM.
  //
  // Each entry carries its STRONG announcements with resolved `pdfUrl`s, so the
  // research step needs zero additional Stockscans calls to know what to read.
  const targets = selectResearchTargets(signals);
  const rawByTicker = Object.fromEntries(gainers.map((g) => [g.ticker, g]));
  const researchCompanies = targets.map((s) => {
    const cid = normalizeCompanyId(s.companyId);
    let context = null;
    try {
      context = buildCompanyContext(cid);
    } catch (e) {
      context = { error: e.message };
    }
    const raw = rawByTicker[s.ticker] || {};
    const anns = raw.announcements || [];
    return {
      companyId: cid,
      ticker: s.ticker,
      name: s.name,
      research_axis: s.research_axis,
      tier: s.tier,
      conviction: s.conviction,
      conviction_reasons: s.conviction_reasons,
      primary_driver: s.primary_driver,
      return_1d: s.return_1d,
      market_cap_cr: s.market_cap_cr,
      industry: s.industry,
      delivery_pct: s.delivery_pct,
      delivery_value_cr: s.delivery_value_cr,
      traded_value_cr: s.traded_value_cr,
      streak: s.streak,
      streak_prior_dates: s.streak_prior_dates,
      sector_cluster: s.sector_cluster,
      evidence: s.evidence,
      novelty: s.novelty,
      concall: s.concall || null,
      // Flags Step 4 to also pull the transcript + run forward-guidance-extractor
      // (see gainers-signal SKILL.md "Concall sentiment enrichment") — set
      // whenever sentiment is Bullish/Optimistic, regardless of whether
      // `recentWithinDays` was confirmed (the researcher can eyeball the
      // transcript date themselves; the classifier's 7-day scoring gate is
      // stricter than this research trigger on purpose).
      needs_transcript_research: !!(
        s.concall && ['Bullish', 'Optimistic'].includes(s.concall.sentiment)
      ),
      // What to actually read. Empty array = no strong filing; the research step
      // should say "no discoverable trigger" rather than inventing one.
      announcements_to_read: anns
        .filter((a) => (a.strength || taxonomy.announcementStrength(a)) === 'STRONG')
        .map((a) => ({
          date: a.date,
          subject: a.subject,
          category: a.category_derived,
          category_label: a.category_label,
          pdfUrl: a.pdfUrl,
        })),
      supporting_announcements: anns
        .filter((a) => (a.strength || taxonomy.announcementStrength(a)) === 'SUPPORTING')
        .map((a) => ({
          date: a.date,
          subject: a.subject,
          category: a.category_derived,
          pdfUrl: a.pdfUrl,
        })),
      context,
    };
  });

  const seedPath = path.join(
    RUNS_DIR,
    `gainers_research_seed_${marketDate.replace(/-/g, '')}.json`
  );
  fs.writeFileSync(
    seedPath,
    JSON.stringify(
      {
        market_date: marketDate,
        purpose:
          'Seed for the top-20 in-depth trigger research — see gainers-signal SKILL.md Step 4. Read each announcements_to_read[].pdfUrl and write one db.saveReport() DTO per company.',
        selection_rule: `top ${RESEARCH_TOP_N_PER_AXIS} by delivery %, then top ${RESEARCH_TOP_N_PER_AXIS} by delivery value (₹ Cr) excluding the first list`,
        sector_clusters: clusters,
        companies: researchCompanies,
      },
      null,
      2
    )
  );

  const tierCounts = signals.reduce((acc, s) => {
    acc[s.tier] = (acc[s.tier] || 0) + 1;
    return acc;
  }, {});
  console.error(
    `[classifier] events: +${stats.inserted}/${stats.updated}~; wrote ${path.basename(outPath)}, ${path.basename(seedPath)} ` +
      `(ACT ${tierCounts.ACT || 0} / WATCH ${tierCounts.WATCH || 0} / NOTED ${tierCounts.NOTED || 0}; ` +
      `${Object.keys(clusters).length} sector cluster(s); ${researchCompanies.length} research targets)`
  );
}

// Offline-testable exports (Convention §4) — business logic importable without
// hitting fs/db, aside from assessNovelty which takes `db` as an explicit param
// so tests can pass a mock.
module.exports = {
  classify,
  buildEvidence,
  isMaterialAnn,
  annStrength,
  deliveryFacts,
  assessNovelty,
  textSimilarity,
  tokenize,
  looksLikeFollowUpPhrasing,
  normalizeCompanyId,
  loadStreakHistory,
  computeStreak,
  buildSectorClusters,
  selectResearchTargets,
  main,
  // thresholds (exported so tests assert against the definition, not a copy)
  HIGH_DELIVERY_PCT,
  DECENT_DELIVERY_PCT,
  MIN_DELIVERY_PCT,
  HIGH_DELIVERY_VALUE_CR,
  DECENT_DELIVERY_VALUE_CR,
  SECTOR_CLUSTER_MIN,
  SECTOR_SUPER_CLUSTER_MIN,
  RESEARCH_TOP_N_PER_AXIS,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
