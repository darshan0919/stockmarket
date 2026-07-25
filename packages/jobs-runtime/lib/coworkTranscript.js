'use strict';

/**
 * coworkTranscript.js — parse a Cowork/Claude-Code `.jsonl` session transcript
 * into the same conversation shape `conversationExtractor` consumes (the cloud
 * export shape: { uuid, name, created_at, chat_messages:[{sender,text,content,...}] }).
 *
 * This lets the migration (Workstream B) read local archived transcripts directly
 * with a script — no per-session transcript-tool calls. PURE (no fs/network):
 * the caller reads the file and passes the text.
 *
 * jsonl line types seen (Claude Code format): user | assistant | system |
 * attachment | result | queue-operation | ai-title | mode | rate_limit_event.
 * We keep user + assistant turns; everything else is metadata/noise.
 */

// Injected system prompts we never want to treat as the user's own words.
const SYSTEM_NOISE = /^<(scheduled-task|system-reminder|command-message|local-command|budget)/i;

function textFromContent(content) {
  // user content is usually a string; assistant content is an array of blocks.
  if (typeof content === 'string') return { text: content, thinking: '' };
  if (!Array.isArray(content)) return { text: '', thinking: '' };
  const texts = [];
  const thinks = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && b.text) texts.push(b.text);
    else if (b.type === 'thinking' && (b.thinking || b.text)) thinks.push(b.thinking || b.text);
    // tool_use / tool_result deliberately skipped — they are machine I/O, NOT the
    // user's words. Counting a tool_result-carrier `user` turn as human input is
    // what made automated job runs look like interactive chats.
  }
  return { text: texts.join('\n').trim(), thinking: thinks.join('\n').trim() };
}

function parseLines(jsonlText) {
  const out = [];
  for (const raw of String(jsonlText).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (_) {
      /* skip malformed */
    }
  }
  return out;
}

/**
 * @param {string} jsonlText raw transcript file contents
 * @param {object} meta { title, sessionId, createdAt }
 * @returns conversation object in the extractor's expected shape
 */
function parseTranscript(jsonlText, { title = '', sessionId = null, createdAt = null } = {}) {
  const lines = parseLines(jsonlText);

  let inferredTitle = title;
  let firstTs = createdAt;
  const messages = [];
  const attachments = [];

  for (const o of lines) {
    if (o.type === 'ai-title' && !inferredTitle) {
      inferredTitle = o.title || o.content || '';
      continue;
    }
    if (o.type === 'attachment' && o.attachment) {
      const a = o.attachment;
      const fn = a.file_name || a.name || a.fileName;
      if (fn) attachments.push({ file_name: fn, file_type: a.file_type || a.mime || null });
      continue;
    }
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    // Sub-agent (Task-tool) sidechains are machine runs, not the user's chat — drop.
    if (o.isSidechain === true) continue;
    const m = o.message || {};
    if (!firstTs && o.timestamp) firstTs = o.timestamp;

    const { text, thinking } = textFromContent(m.content);
    // Drop injected system prompts masquerading as user turns.
    if (o.type === 'user' && SYSTEM_NOISE.test(text)) continue;
    if (!text && !thinking) continue;

    const content = [];
    if (thinking) content.push({ type: 'thinking', thinking });

    messages.push({
      sender: o.type === 'user' ? 'human' : 'assistant',
      text,
      content,
      created_at: o.timestamp || null,
    });
  }

  // Attach the collected upload attachments to the first human message (provenance).
  if (attachments.length) {
    const firstHuman = messages.find((x) => x.sender === 'human');
    if (firstHuman) firstHuman.attachments = attachments;
    else messages.unshift({ sender: 'human', text: '', content: [], attachments });
  }

  return {
    uuid: sessionId,
    sessionId,
    name: inferredTitle || '',
    created_at: firstTs,
    chat_messages: messages,
  };
}

module.exports = { parseTranscript, parseLines, textFromContent };
