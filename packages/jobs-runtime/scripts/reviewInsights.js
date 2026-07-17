#!/usr/bin/env node
'use strict';

/**
 * reviewInsights.js — the deterministic engine of the weekly Insight Review & Upgrade
 * loop (docs/CONVERSATION_CAPTURE_PLAN.md §7-review). It bounds each review to the DELTA
 * since the last review (via data/_meta/review-ledger.json), so a review is always small
 * enough to comprehend — never a big-bang audit of the whole DB.
 *
 * It does NOT reason or write proposals (that is the agent job). It emits a structured
 * "review packet" of the new insights + signals worth acting on, so the agent can
 * synthesise proposals and a digest from a bounded, factual input.
 *
 * PURE-ish: reads DB collections; only --commit advances the ledger. No code/skill writes.
 *
 * Usage:
 *   node reviewInsights.js            # print the review packet (JSON) for the current delta
 *   node reviewInsights.js --commit   # advance the ledger to now + record a review entry
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const HEAVY_COMPANY_NOTES = 8; // > this ⇒ a consolidation (rollup) candidate

function ledgerPath() { return path.join(db.dataRoot(), '_meta', 'review-ledger.json'); }
function loadLedger() {
  try { return JSON.parse(fs.readFileSync(ledgerPath(), 'utf8')); }
  catch (_) { return { lastReviewAt: '1970-01-01T00:00:00.000Z', reviews: [] }; }
}
function saveLedger(l) {
  const p = ledgerPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(l, null, 2));
}

// Compare by parsed epoch — creationTime is IST-offset, ledger is UTC 'Z'; lexical
// string comparison across offsets is invalid.
const isNew = (r, since) => {
  const t = Date.parse(r.creationTime || r.modifiedTime || 0);
  const s = Date.parse(since || 0);
  return Number.isFinite(t) && t > s;
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Group prompts whose title+intent are the same or whose text is near-identical —
// candidates for merge in the library (the agent proposes/merges, not this script).
function promptClusters(prompts) {
  const byKey = new Map();
  for (const p of prompts) {
    const key = `${norm(p.intent)}|${norm(p.linkedSkill || p.linkedTask)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ id: p.id, title: p.title, text: (p.text || '').slice(0, 80) });
  }
  return [...byKey.values()].filter((g) => g.length > 1);
}

function buildPacket() {
  const ledger = loadLedger();
  const since = ledger.lastReviewAt;

  const notes = db.find('notes', {});
  const reports = db.find('reports', {});
  const prompts = db.find('prompts', {});
  const conversations = db.find('conversations', {});

  const deltaNotes = notes.filter((r) => isNew(r, since));
  const deltaReports = reports.filter((r) => isNew(r, since));
  const deltaPrompts = prompts.filter((r) => isNew(r, since));
  const deltaConvs = conversations.filter((r) => isNew(r, since));

  // heavy companies (rollup/consolidation candidates) — keeps buildCompanyContext lean
  const noteCountByCo = {};
  for (const n of notes) for (const c of (n.companyIds || (n.companyId ? [n.companyId] : []))) noteCountByCo[c] = (noteCountByCo[c] || 0) + 1;
  const heavyCompanies = Object.entries(noteCountByCo)
    .filter(([, n]) => n > HEAVY_COMPANY_NOTES)
    .sort((a, b) => b[1] - a[1])
    .map(([companyId, count]) => ({ companyId, count }));

  const intentHist = {};
  for (const p of prompts) intentHist[p.intent || 'unknown'] = (intentHist[p.intent || 'unknown'] || 0) + 1;

  return {
    windowSince: since,
    now: new Date().toISOString(),
    counts: {
      total: { notes: notes.length, reports: reports.length, prompts: prompts.length, conversations: conversations.length },
      delta: { notes: deltaNotes.length, reports: deltaReports.length, prompts: deltaPrompts.length, conversations: deltaConvs.length },
    },
    delta: {
      notes: deltaNotes.map((n) => ({ id: n.id, type: n.type, companyId: n.companyId, text: (n.text || '').slice(0, 140) })),
      reports: deltaReports.map((r) => ({ id: r.id, type: r.type, summary: (r.summary || '').slice(0, 140) })),
      prompts: deltaPrompts.map((p) => ({ id: p.id, intent: p.intent, linkedSkill: p.linkedSkill || p.linkedTask, title: p.title })),
    },
    signals: {
      // → memory-update candidates
      feedbackNotes: notes.filter((n) => n.type === 'feedback').map((n) => n.id),
      // → new-skill / reference candidates
      frameworkItems: reports.filter((r) => r.type === 'framework').map((r) => ({ id: r.id, summary: (r.summary || '').slice(0, 120) })),
      // → prompt-library merge candidates
      promptClusters: promptClusters(prompts),
      // → prompt intents (recurring intents may deserve a skill/task)
      intentHistogram: intentHist,
      // → consolidation (rollup) candidates to keep context lean
      heavyCompanies,
    },
  };
}

function main() {
  const commit = process.argv.includes('--commit');
  const packet = buildPacket();
  if (commit) {
    const ledger = loadLedger();
    ledger.reviews.push({ at: packet.now, windowSince: packet.windowSince, delta: packet.counts.delta });
    ledger.lastReviewAt = packet.now;
    if (ledger.reviews.length > 52) ledger.reviews = ledger.reviews.slice(-52); // keep ~1yr
    saveLedger(ledger);
    console.log('[review] ledger advanced to', packet.now);
  } else {
    console.log(JSON.stringify(packet, null, 2));
  }
}

if (require.main === module) main();
module.exports = { buildPacket, promptClusters, loadLedger, HEAVY_COMPANY_NOTES };
