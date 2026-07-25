'use strict';

/**
 * Conversation extractor (PURE — no fs, no db, no network).
 *
 * Turns an exported chat (Cowork session transcript OR a claude.ai cloud-export
 * conversation) into: a conversation DTO (the provenance anchor) plus structured
 * fan-out records for existing collections. See docs/CONVERSATION_CAPTURE_PLAN.md
 * §1.2 (routing), §1.6 (artifacts), §1.7 (ordering).
 *
 * The fallible/creative work (summary, company-scoped routing, feedback mining)
 * is isolated behind an injectable `llm` object so this module is deterministic
 * and offline-testable. Without `llm`, extraction still produces the conversation
 * DTO, questions, artifacts, and regex-detected companyIds — nothing is lost; a
 * later run can re-extract richer fan-out (deterministic ids ⇒ upsert, no dupes).
 */

const crypto = require('crypto');
const { classify } = require('./stockmarketKeywords');

const CREATOR = 'conversation-capture';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

// Stable 8-hex suffix from a session id. Strips a leading "local_" and any
// non-hex chars first, so Cowork keys like "local_5a88b1ac-a4ff-..." yield the
// session's real entropy ("5a88b1ac") instead of collapsing to "local_5a".
// Falls back to a sha256 hash when the id has too few hex chars to be unique.
function uuid8(s) {
  const hex = String(s || '')
    .replace(/^local[_-]/i, '')
    .replace(/[^a-f0-9]/gi, '');
  if (hex.length >= 8) return hex.slice(0, 8).toLowerCase();
  return crypto
    .createHash('sha256')
    .update(String(s || ''))
    .digest('hex')
    .slice(0, 8);
}

function dateOf(iso) {
  // YYYY-MM-DD (business date the chat is ABOUT). Falls back to empty string.
  const m = String(iso || '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function extOf(name) {
  const m = String(name || '').match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : '';
}

// role normalization for both export shapes
function roleOf(sender) {
  const s = String(sender || '').toLowerCase();
  if (s === 'human' || s === 'user') return 'user';
  if (s === 'assistant' || s === 'ai') return 'assistant';
  return s || 'unknown';
}

// Pull thinking text out of content blocks when present (cloud export shape).
function thinkingOf(message) {
  const blocks = message.content;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b && b.type === 'thinking' && (b.thinking || b.text))
    .map((b) => b.thinking || b.text)
    .join('\n')
    .trim();
}

/** Normalize an exported conversation into a stable internal shape. */
function normalize(conv, { source = 'cloud' } = {}) {
  const id = `conv_${source}_${uuid8(conv.uuid || conv.sessionId)}`;
  const messages = conv.chat_messages || conv.messages || [];
  const turns = messages.map((m) => ({
    role: roleOf(m.sender || m.role),
    text: (m.text || '').trim(),
    thinking: thinkingOf(m),
    createdAt: m.created_at || null,
  }));

  const questions = turns
    .filter((t) => t.role === 'user' && t.text)
    .map((t) => t.text.split('\n').find((l) => l.trim()) || t.text)
    .map((q) => q.trim())
    .filter(Boolean);

  // Artifacts: uploaded attachments + files. Bytes are NOT in the export/transcript;
  // Phase-3 writer resolves bytes (repo/Drive/session-outputs) and hashes for the
  // skill-persisted skip rule. Here we only record metadata + provenance.
  const artifacts = [];
  for (const m of messages) {
    for (const a of m.attachments || []) {
      artifacts.push({
        fileName: a.file_name || null,
        fileType: a.file_type || extOf(a.file_name).replace('.', '') || null,
        kind: 'attachment',
        isImage: IMAGE_EXT.has(extOf(a.file_name)),
        bytesUnavailable: true,
      });
    }
    for (const f of m.files || []) {
      artifacts.push({
        fileName: f.file_name || null,
        fileType: extOf(f.file_name).replace('.', '') || null,
        kind: 'file',
        isImage: IMAGE_EXT.has(extOf(f.file_name)),
        bytesUnavailable: true,
      });
    }
  }

  const fullText = turns.map((t) => `${t.text}\n${t.thinking}`).join('\n');
  return {
    id,
    source,
    title: conv.name || conv.title || '',
    date: dateOf(conv.created_at),
    turns,
    questions,
    artifacts,
    fullText,
    summaryHint: conv.summary || '',
  };
}

// Placeholder/example tokens that show up in URLs and sample text but are NOT
// real companies (e.g. "https://.../company/NSE:TICKER", a bug note "NSE:NSE:XXX").
const TICKER_PLACEHOLDER =
  /^(X{2,}|TICKER|SYMBOL|NAME|COMPANY|EXAMPLE|SAMPLE|ABC|XYZ|NSE|BSE|TEST|FOO|BAR)$/i;

// Deterministic company id detection from explicit NSE:/BSE: references in text.
// Anti-false-positive rules (see docs/CONVERSATION_CAPTURE_PLAN.md): NSE tickers
// must start with a letter and be ≥3 chars (drops "M", "AC", "PA" — never real NSE
// symbols and usually sentence noise), and must not be a placeholder token.
function detectCompanyIds(text) {
  const out = new Set();
  const re = /\b(NSE:[A-Z][A-Z0-9&-]{1,14}|BSE:\d{5,6})\b/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const id = m[1];
    if (id.startsWith('NSE:')) {
      const tk = id.slice(4);
      if (tk.replace(/[^A-Z0-9]/gi, '').length < 3) continue; // drop 1–2 char tickers
      if (TICKER_PLACEHOLDER.test(tk)) continue; // drop placeholders
    }
    out.add(id);
  }
  return [...out].sort();
}

/**
 * Extract everything from one conversation.
 * @param {object} conv     raw exported conversation
 * @param {object} opts
 * @param {'cloud'|'cowork'} opts.source
 * @param {string[]} [opts.extraKeywords]  company names/tickers (from company-master) for classification
 * @param {object}  [opts.llm]   optional { summarize(ctx), route(ctx) } — injected for richer output
 * @param {string}  [opts.now]   ISO timestamp for creation/modified (test determinism)
 * @returns {{ isStock, borderline, conversationDto|null, notes, reports, artifacts, companyIds }}
 */
function extract(conv, { source = 'cloud', extraKeywords = [], llm = null, now = null } = {}) {
  const n = normalize(conv, { source });
  const cls = classify({ title: n.title, text: n.fullText, extraKeywords });

  if (!cls.isStock && !cls.borderline) {
    return {
      isStock: false,
      borderline: false,
      conversationDto: null,
      notes: [],
      reports: [],
      artifacts: [],
      companyIds: [],
      matched: cls.matched,
      score: cls.score,
    };
  }

  const ts = now || new Date().toISOString();
  const companyIds = detectCompanyIds(n.fullText);

  // LLM-optional enrichment.
  const summary =
    llm && llm.summarize
      ? llm.summarize({ title: n.title, turns: n.turns })
      : (n.summaryHint || n.questions[0] || n.title || '').slice(0, 400);
  const routed =
    llm && llm.route
      ? llm.route({ title: n.title, turns: n.turns, companyIds })
      : { notes: [], reports: [], companyIds: [] };

  const allCompanyIds = [...new Set([...companyIds, ...(routed.companyIds || [])])].sort();

  // Deterministic title fallback for transcripts with no ai-title (most Cowork
  // sessions): use the first user question, trimmed. No fabrication — it's the
  // user's own words.
  const title = n.title || (n.questions[0] || '').replace(/\s+/g, ' ').slice(0, 80);

  // Content hash over the full transcript text — lets the capture job detect
  // when an already-captured session has NEW turns appended (someone kept
  // chatting) so it can re-save the body and flag the record `dirty` for the
  // enrichment job to pick back up, instead of silently skipping it forever.
  const contentHash = crypto
    .createHash('sha256')
    .update(n.fullText || '')
    .digest('hex')
    .slice(0, 16);

  const conversationDto = {
    id: n.id,
    type: source,
    creator: CREATOR,
    date: n.date,
    creationTime: ts,
    modifiedTime: ts,
    title,
    sessionId: conv.uuid || conv.sessionId || null,
    companyIds: allCompanyIds,
    tags: cls.matched.slice(0, 20),
    summary,
    questions: n.questions,
    artifacts: n.artifacts,
    contentHash,
    dirty: false,
    body: `conversations/${n.id}.json`,
    // body file (written by Phase-3 writer) holds full turns:
    _body: { turns: n.turns },
  };

  return {
    isStock: true,
    borderline: cls.borderline,
    conversationDto,
    notes: routed.notes || [],
    reports: routed.reports || [],
    artifacts: n.artifacts,
    companyIds: allCompanyIds,
    matched: cls.matched,
    score: cls.score,
  };
}

module.exports = { normalize, detectCompanyIds, extract, CREATOR };
