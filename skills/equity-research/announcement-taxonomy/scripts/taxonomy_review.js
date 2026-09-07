#!/usr/bin/env node
'use strict';

/**
 * taxonomy_review.js — the deterministic half of the `announcement-taxonomy`
 * skill.
 *
 * Division of labour (conventions §17): everything in this file is LOGIC —
 * fetching a document's text, running the shared taxonomy's keyword/pattern
 * rules over it, persisting a mismatch, promoting a repeated mismatch into a
 * learned rule, and reporting accuracy. None of it is judgment. The judgment —
 * reading the document and deciding what it actually means for forward EPS —
 * belongs to the skill's reasoning pass, which calls this script for the
 * script verdict and then argues with it.
 *
 * Why the argument is the point: a keyword list cannot tell a ₹2 Cr capex on a
 * ₹5,000 Cr base from a capacity doubling, and it never sees a trigger phrased
 * in words nobody thought to add. A model reading the document can, but a model
 * re-deriving the whole taxonomy from scratch every morning is both expensive
 * and non-reproducible. So: the script proposes, the model disposes, and every
 * disagreement that the model wins gets written back as a rule so the script is
 * a little less wrong tomorrow. That write-back is `record-mismatch` +
 * `promote-rule` below.
 *
 * Commands:
 *   classify --url <pdfUrl> [--subject S] [--description D]
 *   classify --text-file <path> [--subject S] [--description D]
 *   record-mismatch '<json>'
 *   promote-rule '<json>'          (or --auto to promote everything eligible)
 *   status [--days N]
 *   rules
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const RUNTIME = path.join(REPO_ROOT, 'packages/jobs-runtime');

const taxonomy = require(path.join(RUNTIME, 'lib/announcementTaxonomy'));
const db = require(path.join(RUNTIME, 'lib/db'));
const docExtracts = require(path.join(RUNTIME, 'lib/docExtracts'));
const { loadEnv } = require(path.join(RUNTIME, 'lib/env'));

const LEDGER_FILE = 'announcement-taxonomy-mismatches.json';
const RULES_FILE = 'announcement-taxonomy-rules.json';

// A keyword must have caused the SAME kind of miss this many times before it is
// promoted into the script's rules. One mismatch is an anecdote — possibly a
// one-off phrasing, possibly the model being wrong — and promoting on n=1 is how
// a keyword list turns into noise. Two independent documents is the cheapest
// evidence bar that still filters flukes. Override per-call with
// `--min-occurrences` when you have a specific reason (e.g. a phrase you know is
// standard across an entire sector's filings).
const DEFAULT_MIN_OCCURRENCES = 2;

// ── storage ────────────────────────────────────────────────────────────────

function ledgerPath() {
  return db.cachePath(LEDGER_FILE);
}

function rulesPath() {
  return db.cachePath(RULES_FILE);
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

// db.writeFileAtomic serializes the OBJECT it is given (and calls trackTouched
// for the run manifest) — pass the object, never a pre-stringified blob, or the
// file ends up holding a JSON string of JSON and every reader silently falls
// back to the empty default.
function writeJson(p, value) {
  db.writeFileAtomic(p, value);
}

// Both loaders VALIDATE shape rather than trusting whatever parsed. A file that
// parses but holds the wrong shape (e.g. a JSON string of JSON, which an
// earlier double-stringify bug produced here) would otherwise throw deep inside
// a push/iterate and lose the run — and since the data mount forbids unlink,
// a corrupt file cannot simply be deleted, so recovering by overwrite has to be
// the normal path, not a manual repair.
function loadLedger() {
  const raw = readJson(ledgerPath(), null);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.mismatches)) {
    return { version: 1, mismatches: [] };
  }
  return raw;
}

function loadRules() {
  const raw = readJson(rulesPath(), null);
  if (!raw || typeof raw !== 'object' || typeof raw.categoryKeywords !== 'object') {
    return { version: 1, categoryKeywords: {}, materialityPatterns: [], provenance: [] };
  }
  return {
    version: raw.version || 1,
    categoryKeywords: raw.categoryKeywords || {},
    materialityPatterns: Array.isArray(raw.materialityPatterns) ? raw.materialityPatterns : [],
    provenance: Array.isArray(raw.provenance) ? raw.provenance : [],
  };
}

// ── commands ───────────────────────────────────────────────────────────────

/**
 * Resolve a document's real text the same way gainersScanner's Step 2a does —
 * served Filing Extract first, live PDF read second — so the script verdict
 * this returns is computed from exactly the text the reasoning pass will read.
 * Any divergence between the two would make every recorded mismatch suspect.
 */
async function resolveText({ url, textFile }) {
  if (textFile) return { text: fs.readFileSync(textFile, 'utf8'), source: 'text-file' };
  const extract = docExtracts.get('announcement', url);
  if (extract && extract.data) {
    const { category_hint, facts = {}, stated_rationale, verbatim_quotes = [] } = extract.data;
    const text = [
      category_hint,
      facts.amount_inr_cr ? `₹${facts.amount_inr_cr} crore` : '',
      facts.counterparty,
      stated_rationale,
      ...verbatim_quotes.map((q) => q && q.text),
    ]
      .filter(Boolean)
      .join(' ');
    return { text, source: 'filing-extract' };
  }
  // eslint-disable-next-line global-require
  const { readOrFetchPdfMeta } = require(path.join(RUNTIME, 'watchlistInsights'));
  const { text } = await readOrFetchPdfMeta(url);
  return { text: text || '', source: 'live-pdf' };
}

/** Which built-in/learned keywords actually fired — the skill needs to see the script's reasoning, not just its answer. */
function matchedKeywords(category, haystack) {
  const rule = taxonomy.CATEGORY_RULES.find(([c]) => c === category);
  const builtIn = rule ? rule[1] : [];
  const learned = taxonomy.loadLearnedRules().categoryKeywords[category] || [];
  const lower = haystack.toLowerCase();
  return {
    builtIn: builtIn.filter((k) => lower.includes(k)),
    learned: learned.filter((k) => lower.includes(String(k).toLowerCase())),
  };
}

async function cmdClassify(argv) {
  const url = argValue(argv, '--url');
  const textFile = argValue(argv, '--text-file');
  if (!url && !textFile) throw new Error('classify requires --url or --text-file');
  const subject = argValue(argv, '--subject') || '';
  const description = argValue(argv, '--description') || '';

  const { text, source } = await resolveText({ url, textFile });
  const ann = { subject, description };
  const verdict = taxonomy.classifyFromContent(ann, text);
  const haystack = `${subject} ${description} ${text}`;

  process.stdout.write(
    `${JSON.stringify(
      {
        url: url || null,
        textSource: source,
        textChars: text.length,
        // An empty/near-empty read is NOT "nothing material in this filing" —
        // it is "we could not read this filing". The skill must escalate rather
        // than accept a ROUTINE verdict computed over no text at all.
        textUsable: text.trim().length >= 80,
        script: {
          ...verdict,
          matchedKeywords: matchedKeywords(verdict.category, haystack),
          materialitySignal: taxonomy.hasContentMaterialitySignal(text),
        },
        excerpt: text.slice(0, 1200),
      },
      null,
      2
    )}\n`
  );
}

/**
 * Persist one disagreement between the script verdict and the reasoning
 * verdict. Recording is deliberately separate from promoting: most single
 * mismatches should NOT change the rules (see DEFAULT_MIN_OCCURRENCES), but all
 * of them are worth keeping — the ledger is how you later tell "the script has
 * a systematic blind spot in category X" from "the model second-guessed itself
 * once".
 */
function cmdRecordMismatch(argv) {
  const payload = JSON.parse(argv[0] || '{}');
  const required = ['companyId', 'scriptVerdict', 'reasoningVerdict', 'rationale'];
  for (const f of required) {
    if (!payload[f]) throw new Error(`record-mismatch: missing required field "${f}"`);
  }
  const ledger = loadLedger();
  const id = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  ledger.mismatches.push({
    id,
    recordedAt: new Date().toISOString(),
    companyId: payload.companyId,
    url: payload.url || null,
    subject: payload.subject || null,
    scriptVerdict: payload.scriptVerdict, // {category, strength, significance}
    reasoningVerdict: payload.reasoningVerdict, // {category, strength, significance}
    // Which side was right. `reasoning` is the common case (that's why the
    // layer exists) but `script` must be recordable too — a model that can only
    // ever record itself as correct produces a rules file that drifts toward
    // whatever it hallucinated, with no audit trail showing it happened.
    winner: payload.winner || 'reasoning',
    rationale: payload.rationale,
    // The phrase in the document the script should have matched on. Optional:
    // some mismatches are about MAGNITUDE (script said VERY_HIGH on a trivial
    // ₹2 Cr capex), which no keyword can fix and which must not be "solved" by
    // adding a keyword.
    suggestedKeyword: payload.suggestedKeyword || null,
    suggestedCategory: payload.suggestedCategory || null,
    suggestedMaterialityPattern: payload.suggestedMaterialityPattern || null,
    promoted: false,
  });
  writeJson(ledgerPath(), ledger);
  process.stdout.write(
    `${JSON.stringify({ status: 'ok', id, total: ledger.mismatches.length })}\n`
  );
}

/** Group unpromoted mismatches by (suggestedCategory, normalized keyword). */
function eligiblePromotions(ledger, minOccurrences) {
  const groups = new Map();
  for (const m of ledger.mismatches) {
    if (m.promoted || m.winner !== 'reasoning') continue;
    if (!m.suggestedKeyword || !m.suggestedCategory) continue;
    const key = `${m.suggestedCategory}::${String(m.suggestedKeyword).toLowerCase().trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  return [...groups.entries()]
    .filter(([, ms]) => ms.length >= minOccurrences)
    .map(([key, ms]) => {
      const [category, keyword] = key.split('::');
      return { category, keyword, mismatches: ms };
    });
}

function cmdPromoteRule(argv) {
  const minOccurrences = Number(argValue(argv, '--min-occurrences') || DEFAULT_MIN_OCCURRENCES);
  const auto = argv.includes('--auto');
  const ledger = loadLedger();
  const rules = loadRules();
  const applied = [];

  const candidates = auto
    ? eligiblePromotions(ledger, minOccurrences)
    : (() => {
        const payload = JSON.parse(argv[0] || '{}');
        if (!payload.category || !payload.keyword) {
          throw new Error('promote-rule requires {category, keyword} or --auto');
        }
        return [{ category: payload.category, keyword: payload.keyword, mismatches: [] }];
      })();

  for (const c of candidates) {
    const kw = String(c.keyword).toLowerCase().trim();
    // Guard rails on what may enter the rules file. A learned keyword is
    // matched as a plain substring against title+description+body, so an
    // over-short or over-generic one silently mislabels large swathes of the
    // corpus and is very hard to notice afterwards.
    if (kw.length < 6) {
      applied.push({ ...c, skipped: 'keyword too short (<6 chars) — would over-match' });
      continue;
    }
    if (!taxonomy.CATEGORY_LABELS[c.category]) {
      applied.push({ ...c, skipped: `unknown category "${c.category}"` });
      continue;
    }
    const existing = rules.categoryKeywords[c.category] || [];
    if (existing.includes(kw)) {
      applied.push({ ...c, skipped: 'already present' });
      continue;
    }
    rules.categoryKeywords[c.category] = [...existing, kw];
    rules.provenance.push({
      keyword: kw,
      category: c.category,
      addedAt: new Date().toISOString(),
      mismatchIds: c.mismatches.map((m) => m.id),
      occurrences: c.mismatches.length,
      rationale: c.mismatches[0] ? c.mismatches[0].rationale : 'manual promotion',
    });
    for (const m of c.mismatches) m.promoted = true;
    applied.push({ category: c.category, keyword: kw, promoted: true });
  }

  writeJson(rulesPath(), rules);
  writeJson(ledgerPath(), ledger);
  process.stdout.write(`${JSON.stringify({ status: 'ok', applied }, null, 2)}\n`);
}

function cmdStatus(argv) {
  const days = Number(argValue(argv, '--days') || 30);
  const since = Date.now() - days * 86400000;
  const ledger = loadLedger();
  const rules = loadRules();
  const recent = ledger.mismatches.filter((m) => new Date(m.recordedAt).getTime() >= since);
  const byCategory = {};
  for (const m of recent) {
    const c = (m.scriptVerdict && m.scriptVerdict.category) || 'unknown';
    byCategory[c] = (byCategory[c] || 0) + 1;
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        windowDays: days,
        mismatchesTotal: ledger.mismatches.length,
        mismatchesInWindow: recent.length,
        wonByReasoning: recent.filter((m) => m.winner === 'reasoning').length,
        wonByScript: recent.filter((m) => m.winner === 'script').length,
        // The number to watch: mismatch rate should FALL over time as the rules
        // absorb each class of miss. A flat-or-rising rate means the misses are
        // magnitude/judgment calls that keywords cannot fix — which is a signal
        // to change the reasoning prompt, not to add more keywords.
        mismatchesByScriptCategory: byCategory,
        pendingPromotions: eligiblePromotions(ledger, DEFAULT_MIN_OCCURRENCES).map((p) => ({
          category: p.category,
          keyword: p.keyword,
          occurrences: p.mismatches.length,
        })),
        learnedKeywordCount: Object.values(rules.categoryKeywords).reduce(
          (n, a) => n + a.length,
          0
        ),
        learnedPatternCount: rules.materialityPatterns.length,
        rulesPath: rulesPath(),
        ledgerPath: ledgerPath(),
      },
      null,
      2
    )}\n`
  );
}

function cmdRules() {
  process.stdout.write(`${JSON.stringify(loadRules(), null, 2)}\n`);
}

// ── cli ────────────────────────────────────────────────────────────────────

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

const COMMANDS = {
  classify: cmdClassify,
  'record-mismatch': cmdRecordMismatch,
  'promote-rule': cmdPromoteRule,
  status: cmdStatus,
  rules: cmdRules,
};

async function runCli(argv) {
  const [cmd, ...rest] = argv;
  const fn = COMMANDS[cmd];
  if (!fn) {
    throw new Error(`unknown command "${cmd || ''}" — one of: ${Object.keys(COMMANDS).join(', ')}`);
  }
  await fn(rest);
}

if (require.main === module) {
  loadEnv();
  runCli(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`${JSON.stringify({ error: e.message })}\n`);
    process.exit(1);
  });
}

module.exports = {
  runCli,
  eligiblePromotions,
  ledgerPath,
  rulesPath,
  DEFAULT_MIN_OCCURRENCES,
};
