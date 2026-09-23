#!/usr/bin/env node
'use strict';

/**
 * compute_signal_history.js — deterministic, zero-LLM lookback over this
 * company's own history in the two daily scan pipelines this repo already
 * runs every morning: gainers-signal / volume-rocketing (events collection,
 * type "gainer" / "volume-rocket", tier ACT/WATCH/NOTED) and
 * post-close-scan-insights (notes collection, type "announcement", scored
 * S1-S5 by computeSignalScore/signalTierFor in lib/thesisCardEmail.js).
 *
 * Why this exists: repeated high-conviction appearances across independent
 * scans over a trailing window is itself evidence for framework §5f's
 * J-Curve Inflection tag — a company the market has been quietly, repeatedly
 * rewarding on delivery-confirmed volume (gainers ACT tier) or flagging as a
 * high-signal filer (post-close S1/S2) over 3 months is a *different* case
 * than a single quarter's PAT print with no corroborating market behaviour,
 * even when both would otherwise read the same on paper. This script only
 * counts what already happened in the DB — it does not judge, weight, or
 * decide a tag; rerating-catalysts Phase 3g does that with this as one input
 * alongside the filing-based evidence.
 *
 * Usage:
 *   node compute_signal_history.js --ticker NSE:XYZ [--days 90]
 *
 * Output (stdout): JSON
 *   {
 *     companyId, windowDays, since,
 *     gainers:      { total, actCount, watchCount, actDates: [...] },
 *     volumeRocket: { total, actCount, watchCount, actDates: [...] },
 *     postClose:    { total, s1Count, s2Count, s1s2Dates: [...] },
 *     highSignalAppearances,   // actCount(gainers) + actCount(volumeRocket) + s1s2Count(postClose)
 *     summary: "one-line, human-readable roll-up for Phase 3g"
 *   }
 *
 * Never called by another script for its LLM judgment — there is none here.
 * rerating-catalysts Phase 1 shells out to this once per run and reads the
 * JSON; Phase 3g cites `summary`/`highSignalAppearances` as a supporting
 * input to the tag, never as a standalone gate (a company with zero scan
 * appearances can still be STRONG on filings alone, and a company with many
 * appearances but no "new" trigger this quarter is not STRONG on that count
 * alone — see SKILL.md Phase 3g and the Pitfalls section).
 */
const db = require('../../../../packages/jobs-runtime/lib/db.js');
const { computeSignalScore, signalTierFor } = require('../../../../packages/jobs-runtime/lib/thesisCardEmail.js');

const DEFAULT_WINDOW_DAYS = 90;

function parseArgs(argv) {
  const out = { days: DEFAULT_WINDOW_DAYS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticker' || a === '--companyId') out.companyId = argv[++i];
    else if (a === '--days') out.days = parseInt(argv[++i], 10);
  }
  if (!out.companyId) {
    console.error('Usage: node compute_signal_history.js --ticker NSE:XYZ [--days 90]');
    process.exit(1);
  }
  return out;
}

function isoSince(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function summarizeScanEvents(companyId, type, since) {
  const events = db.find('events', { companyId, type, since });
  const actEvents = events.filter((e) => e.tier === 'ACT');
  const watchEvents = events.filter((e) => e.tier === 'WATCH');
  return {
    total: events.length,
    actCount: actEvents.length,
    watchCount: watchEvents.length,
    actDates: actEvents.map((e) => e.date).sort(),
  };
}

function summarizePostClose(companyId, since) {
  const notes = db.find('notes', { companyId, type: 'announcement', since });
  let s1 = 0;
  let s2 = 0;
  const dates = [];
  for (const n of notes) {
    // Notes may or may not already carry a persisted signalScore/signalTier
    // (it is primarily a render-time field) — recompute from the same
    // deterministic function the email renderer uses rather than trusting a
    // possibly-stale stored value, so this never drifts from what the
    // digest actually showed the day it went out.
    const score = typeof n.signalScore === 'number' ? n.signalScore : computeSignalScore(n);
    const t = signalTierFor({ ...n, signalScore: score });
    if (t.tier === 1) s1++;
    if (t.tier === 2) s2++;
    if (t.tier === 1 || t.tier === 2) dates.push(n.date || n.creationTime);
  }
  return {
    total: notes.length,
    s1Count: s1,
    s2Count: s2,
    s1s2Dates: dates.filter(Boolean).sort(),
  };
}

function main() {
  const { companyId, days } = parseArgs(process.argv.slice(2));
  const since = isoSince(days);

  const gainers = summarizeScanEvents(companyId, 'gainer', since);
  const volumeRocket = summarizeScanEvents(companyId, 'volume-rocket', since);
  const postClose = summarizePostClose(companyId, since);

  const highSignalAppearances = gainers.actCount + volumeRocket.actCount + postClose.s1Count + postClose.s2Count;

  const parts = [];
  if (gainers.actCount) parts.push(`${gainers.actCount}x ACT in gainers-signal`);
  if (volumeRocket.actCount) parts.push(`${volumeRocket.actCount}x ACT in volume-rocketing`);
  if (postClose.s1Count || postClose.s2Count) {
    parts.push(`${postClose.s1Count + postClose.s2Count}x S1/S2 in post-close-scan-insights`);
  }
  const summary = parts.length
    ? `${parts.join(', ')} over the trailing ${days} days (${highSignalAppearances} high-signal appearances total).`
    : `No high-tier appearances (gainers ACT / volume-rocket ACT / post-close S1-S2) over the trailing ${days} days.`;

  const out = {
    companyId,
    windowDays: days,
    since,
    gainers,
    volumeRocket,
    postClose,
    highSignalAppearances,
    summary,
  };

  process.stdout.write(JSON.stringify(out, null, 1));
}

if (require.main === module) {
  main();
}

module.exports = { summarizeScanEvents, summarizePostClose };
