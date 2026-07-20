#!/usr/bin/env node
'use strict';

/**
 * captureConversation.js — the heavy-lift writer for the conversation-capture
 * pipeline (docs/CONVERSATION_CAPTURE_PLAN.md, Phases 3–5).
 *
 * Per conversation, in order (§1.7 — raw first for durability):
 *   1. classify (stockmarket? — Stage-1 keywords + company-master extraKeywords)
 *   2. personal/sensitive guard (skip tax/ITR/PAN docs — never stored)
 *   3. db.saveConversation(dto)         ← raw transcript saved BEFORE extraction
 *   4. record artifact metadata (bytes resolved later; skill-persisted skipped)
 *   5. optional fan-out from a precomputed --extract sidecar (notes/reports)
 * Ends with `data.js push` + a files-touched manifest (DATA_RULES §7–8).
 *
 * The LLM-driven fan-out (rich notes/reports/feedback→memory) is produced by the
 * conversation-capture SKILL and passed in via --extract; this script itself is
 * deterministic and offline-testable. Nothing is lost without it — the full
 * transcript is stored and can be re-extracted later (deterministic ids ⇒ upsert).
 *
 * Modes:
 *   --cloud-file <conversations.json>     ingest a claude.ai account export (array)
 *   --cowork-archive <dir>                walk a copied session archive (*.jsonl)
 *   (programmatic)  captureOne(conv, opts) for the skill / tests
 *
 * Flags: --dry-run  --no-push  --extract <sidecar.json>  --limit N
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const db = require('../lib/db');
const ex = require('../lib/conversationExtractor');
const { parseTranscript } = require('../lib/coworkTranscript');

// ── sensitive-personal guard ─────────────────────────────────────────────────
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const TAX_TITLE_RE = /\b(itr|income[-\s]?tax|tax\s*(return|report|p&l|pnl)|aadhaar|form\s*16)\b/i;

function isSensitivePersonal(conv, fullText) {
  const title = conv.name || conv.title || '';
  if (TAX_TITLE_RE.test(title)) return true;
  if (PAN_RE.test(fullText || '')) return true;
  for (const m of conv.chat_messages || []) {
    for (const a of [...(m.attachments || []), ...(m.files || [])]) {
      if (TAX_TITLE_RE.test(a.file_name || '')) return true;
    }
  }
  return false;
}

// ── company-master names for the Stage-2 classifier (best effort) ─────────────
function loadExtraKeywords() {
  try {
    const p = db.cachePath('company-master.json');
    if (!fs.existsSync(p)) return [];
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
    const arr = Array.isArray(rows) ? rows : Object.values(rows);
    const names = new Set();
    for (const r of arr) {
      const n = (r.companyName || r.name || '').trim();
      if (n.length >= 6) names.add(n); // len≥6 curbs common-word false positives
    }
    return [...names];
  } catch (_) {
    return [];
  }
}

// ── cursor (resumable, dedup by sessionId) ────────────────────────────────────
function cursorPath() {
  return path.join(db.dataRoot(), '_meta', 'conversation-capture.json');
}
function loadCursor() {
  try { return JSON.parse(fs.readFileSync(cursorPath(), 'utf8')); }
  catch (_) { return { done: {}, skipped: {}, sensitive: {}, lastRun: null }; }
}
function saveCursor(c) {
  const p = cursorPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  c.lastRun = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(c, null, 2));
}

/**
 * Capture a single conversation. Returns a stat object; does NOT push.
 * @param {object} conv  extractor-shaped conversation
 * @param {object} opts  { source, extraKeywords, extract, dryRun, now, cursor }
 */
function captureOne(conv, opts = {}) {
  const { source = 'cloud', extraKeywords = [], extract = null, dryRun = false, now = null, cursor = null } = opts;

  // Automated scheduled-job runs are NOT interactive chats — the user asked to
  // capture conversations where they chat with Claude, not machine job runs
  // (which already persist their outputs via their own skills). Signal: zero
  // genuine human turns once injected <scheduled-task>/system prompts are dropped.
  const humanTurns = (conv.chat_messages || []).filter(
    (m) => (m.sender === 'human' || m.sender === 'user') && (m.text || '').trim()
  ).length;
  const sidEarly = conv.uuid || conv.sessionId;
  if (humanTurns === 0) {
    if (cursor && sidEarly) cursor.skipped[sidEarly] = { reason: 'automated-run', title: conv.name || '' };
    return { status: 'skipped-automated', id: null };
  }

  const r = ex.extract(conv, { source, extraKeywords, now });

  const sid = conv.uuid || conv.sessionId || (r.conversationDto && r.conversationDto.id);
  if (!r.isStock) {
    if (cursor && sid) cursor.skipped[sid] = { title: conv.name || conv.title || '', score: r.score };
    return { status: 'skipped-nonstock', id: null, score: r.score };
  }

  // Personal/sensitive guard — computed from the same normalized text.
  const fullText = (conv.chat_messages || []).map((m) => m.text || '').join('\n');
  if (isSensitivePersonal(conv, fullText)) {
    if (cursor && sid) cursor.sensitive[sid] = { title: conv.name || conv.title || '' };
    return { status: 'skipped-sensitive', id: r.conversationDto.id };
  }

  const dto = r.conversationDto;

  // Content-hash check: if this session was captured before AND its transcript
  // text is byte-identical to last time, there's nothing new — skip cleanly.
  // If it HAS changed (the user kept chatting in the same session), fall
  // through and re-save, flagging the record `dirty` so the weekly enrichment
  // job knows to re-visit it instead of assuming it's already fully mined.
  const prior = cursor && sid ? cursor.done[sid] : null;
  if (prior && !prior.dryRun && prior.contentHash && prior.contentHash === dto.contentHash) {
    return { status: 'unchanged', id: dto.id };
  }
  const isUpdate = !!(prior && !prior.dryRun && prior.contentHash);
  if (isUpdate) dto.dirty = true;

  if (dryRun) {
    if (cursor && sid) cursor.done[sid] = { id: dto.id, contentHash: dto.contentHash, dryRun: true };
    return { status: isUpdate ? 'would-update' : 'would-save', id: dto.id, companyIds: dto.companyIds, artifacts: r.artifacts.length,
      notes: (extract && extract.notes ? extract.notes.length : 0) };
  }

  // (3) raw conversation FIRST.
  db.saveConversation(dto);

  // (5) optional precomputed fan-out (from the skill's LLM reasoning).
  let notesN = 0, reportsN = 0;
  if (extract) {
    if (Array.isArray(extract.notes) && extract.notes.length) {
      db.appendNotes(extract.notes.map((n) => ({ creator: ex.CREATOR, ...n })));
      notesN = extract.notes.length;
    }
    for (const rep of extract.reports || []) {
      db.saveReport({ creator: ex.CREATOR, ...rep });
      reportsN++;
    }
  }

  if (cursor && sid) cursor.done[sid] = { id: dto.id, companyIds: dto.companyIds, contentHash: dto.contentHash };
  return { status: isUpdate ? 'updated' : 'saved', id: dto.id, companyIds: dto.companyIds, artifacts: r.artifacts.length, notes: notesN, reports: reportsN };
}

// ── ingest sources ────────────────────────────────────────────────────────────
function ingestCloudFile(file, opts) {
  const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const convs = Array.isArray(arr) ? arr : [arr];
  return convs.map((c) => ({ conv: c, source: 'cloud' }));
}

function findTranscripts(dir) {
  // recursively collect *.jsonl that look like Claude Code transcripts
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(fp);
    }
  };
  walk(dir);
  return out;
}

// Real session id from a transcript path: the `local_<uuid>` folder segment.
// Falls back to the transcript file uuid if no such segment exists.
function sessionKeyOf(fp) {
  const m = fp.match(/local_[0-9a-fA-F-]{6,}/);
  return m ? m[0] : path.basename(fp, '.jsonl');
}

function ingestCoworkArchive(dir) {
  // Group all transcript files by REAL session (folder), so one interactive
  // session = one conversation even if split across several .jsonl files or
  // sub-agent sidechains (sidechain lines are dropped inside parseTranscript).
  const bySession = new Map();
  for (const fp of findTranscripts(dir)) {
    const text = fs.readFileSync(fp, 'utf8');
    if (!/"type"\s*:\s*"assistant"/.test(text)) continue; // must have real turns
    const key = sessionKeyOf(fp);
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(text);
  }
  const items = [];
  for (const [key, texts] of bySession) {
    const merged = texts.join('\n');
    const conv = parseTranscript(merged, { sessionId: key });
    if ((conv.chat_messages || []).length) items.push({ conv, source: 'cowork' });
  }
  return items;
}

function runPush() {
  const out = execFileSync('node', [path.join(__dirname, 'data.js'), 'push'], { encoding: 'utf8' });
  return out;
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => args.includes(name);
  const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

  const dryRun = flag('--dry-run');
  const noPush = flag('--no-push') || dryRun;
  const limit = val('--limit') ? parseInt(val('--limit'), 10) : Infinity;
  const extractSidecar = val('--extract') ? JSON.parse(fs.readFileSync(val('--extract'), 'utf8')) : null;

  let items = [];
  if (val('--cloud-file')) items = ingestCloudFile(val('--cloud-file'));
  else if (val('--cowork-archive')) items = ingestCoworkArchive(val('--cowork-archive'));
  else { console.error('Provide --cloud-file <f> or --cowork-archive <dir>'); process.exit(2); }

  const extraKeywords = loadExtraKeywords();
  const cursor = loadCursor();
  const stats = { saved: 0, updated: 0, skippedNonStock: 0, skippedSensitive: 0, skippedAutomated: 0, alreadyDone: 0, wouldSave: 0, wouldUpdate: 0 };

  // NOTE: no longer pre-skipping by sid alone — captureOne itself compares
  // contentHash so a session that gained new turns since its last capture is
  // re-saved (and flagged dirty) instead of being silently skipped forever.
  let n = 0;
  for (const { conv, source } of items) {
    if (n >= limit) break;
    const sid = conv.uuid || conv.sessionId;
    n++;
    const sidecar = extractSidecar && sid ? extractSidecar[sid] : null;
    const r = captureOne(conv, { source, extraKeywords, extract: sidecar, dryRun, cursor });
    if (r.status === 'saved') stats.saved++;
    else if (r.status === 'updated') stats.updated++;
    else if (r.status === 'would-save') stats.wouldSave++;
    else if (r.status === 'would-update') stats.wouldUpdate++;
    else if (r.status === 'unchanged') stats.alreadyDone++;
    else if (r.status === 'skipped-nonstock') stats.skippedNonStock++;
    else if (r.status === 'skipped-sensitive') stats.skippedSensitive++;
    else if (r.status === 'skipped-automated') stats.skippedAutomated++;
  }

  if (!dryRun) saveCursor(cursor);

  console.log('[capture]', JSON.stringify(stats));
  const touched = db.touchedFiles();
  if (touched.length) console.log('[capture] files touched:\n  ' + touched.join('\n  '));
  if (!noPush && (stats.saved > 0 || stats.updated > 0)) {
    console.log('[capture] pushing to Drive…');
    console.log(runPush());
  }
  return stats;
}

if (require.main === module) main(process.argv);

module.exports = { captureOne, isSensitivePersonal, loadExtraKeywords, parseTranscript, ingestCoworkArchive, main };
