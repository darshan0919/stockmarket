'use strict';

/**
 * The ONE fixed shape every concall transcript is stored in, regardless of
 * which tier produced it (Stockscans official / Perplexity-Quartr /
 * NotebookLM-audio). Downstream skills (concall-analysis,
 * management-credibility-tracker, etc.) should read `segments`/`fullText`
 * from this shape and never need to branch on `transcriptSource` to know
 * how to parse the content — only to know how much to trust it.
 *
 * Segment shape (the atomic unit — one spoken turn):
 *   { i: number, speaker: string|null, speakerRole: 'operator'|'management'|'analyst'|'unknown',
 *     time: number|null, text: string }
 *
 * `time` is seconds from call start when known (Perplexity/Quartr gives this);
 * `null` when the source has no timing (NotebookLM text, or a parsed PDF).
 * `speaker` is `null` only when the source gave literally no attribution —
 * prefer a single segment with speaker null over inventing one.
 *
 * `speakerRole` is a best-effort heuristic, not authoritative — "Operator" is
 * the only label reliably identifiable without company-specific knowledge of
 * who's on the call; everything else defaults to "unknown" rather than
 * guessing "management" vs "analyst" wrong.
 */

const OPERATOR_NAMES = new Set(['operator', 'moderator']);

/** @param {string|null} speaker @returns {'operator'|'unknown'} */
function classifyRole(speaker) {
  if (speaker && OPERATOR_NAMES.has(speaker.trim().toLowerCase())) return 'operator';
  return 'unknown';
}

/**
 * Build segments from Perplexity/Quartr's `paragraphs` array
 * (`{time, text, speakers: string[]}`) — the richest source, already has
 * per-turn timing and speaker attribution.
 * @param {Array<{time?:number,text:string,speakers?:string[]}>} paragraphs
 * @returns {Array<Object>} segments
 */
function segmentsFromParagraphs(paragraphs) {
  return (paragraphs || []).map((p, i) => {
    const speaker = p.speakers && p.speakers.length ? p.speakers.join(' & ') : null;
    return {
      i,
      speaker,
      speakerRole: classifyRole(speaker),
      time: typeof p.time === 'number' ? p.time : null,
      text: String(p.text || '').trim(),
    };
  });
}

// Words that show up in report section titles/headers ("Verbatim Transcript:
// ...", "Management Outlook and Guidance:", etc.) but never in a real
// speaker's name or role — used to reject a title line that would otherwise
// match SPEAKER_LABEL below. Discovered live 2026-07-27: NotebookLM's
// "Create Your Own" report, even with an explicit "output ONLY the
// transcript, no commentary/headers" prompt, still emits a title line and
// narrative "bridge" paragraphs between sections — the schema-level parser,
// not the prompt, is the actual place to guard against this reliably.
const NON_SPEAKER_TITLE_WORDS =
  /\b(transcript|analysis|overview|summary|introduction|introductions|conclusion|remarks|session|review|highlights|performance|positioning|dynamics|commencement|guidance|outlook|report)\b/i;

/** @param {string} speaker @returns {boolean} true if this looks like a real speaker name/role, not a section title */
function looksLikeSpeakerLabel(speaker) {
  const s = speaker.trim();
  if (NON_SPEAKER_TITLE_WORDS.test(s)) return false;
  // Numbered section headers ("1. Call Overview...") never reach here (no
  // colon immediately after the number), but guard anyway for safety.
  if (/^\d+[.)]/.test(s)) return false;
  return true;
}

/**
 * Best-effort parse of plain "Speaker: text" formatted text (what a
 * NotebookLM verbatim-transcript report typically looks like, and what a
 * human might paste in) into segments. Paragraphs are separated by a blank
 * line; a paragraph starting with a short "Name:" prefix (<=40 chars, no
 * sentence-ending punctuation before the colon, and not matching a known
 * report-title word — see {@link looksLikeSpeakerLabel}) is treated as a
 * speaker label.
 *
 * Standalone `[HH:MM:SS]` timestamp lines (NotebookLM emits these between
 * turns per the strict verbatim prompt) are consumed and attached as the
 * `time` of the NEXT real speaker segment rather than becoming their own
 * segment.
 *
 * Non-dialogue blocks (report titles, numbered section headers, narrative
 * "bridge" paragraphs connecting sections, participant-list blocks) are
 * DROPPED rather than kept as `speaker: null` segments — confirmed live
 * this content is real and substantial even when the prompt explicitly says
 * "output ONLY the transcript," so silently keeping it would pollute
 * `segments`/`fullText` with analysis prose mixed into the dialogue.
 * Exception: if the whole document contains ZERO recognizable speaker
 * blocks (i.e. this isn't actually a speaker-labeled transcript at all —
 * some other free-text source), every block is kept as `speaker: null`
 * instead, preserving the original conservative behavior for genuinely
 * unstructured input rather than returning an empty transcript.
 * @param {string} text
 * @returns {Array<Object>} segments
 */
function parseSpeakerLabeledText(text) {
  const blocks = String(text || '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const SPEAKER_LABEL = /^([A-Za-z][A-Za-z0-9 .,&'-]{1,50}):\s+([\s\S]+)$/;
  const TIMESTAMP_ONLY = /^\[(\d{1,2}):(\d{2}):(\d{2})\]$/;

  const parsed = blocks.map((block) => {
    const ts = TIMESTAMP_ONLY.exec(block);
    if (ts) {
      const [, h, m, s] = ts;
      return { kind: 'timestamp', seconds: Number(h) * 3600 + Number(m) * 60 + Number(s) };
    }
    const m = SPEAKER_LABEL.exec(block);
    if (m && looksLikeSpeakerLabel(m[1])) {
      return { kind: 'speaker', speaker: m[1].trim(), text: m[2].trim() };
    }
    return { kind: 'other', text: block };
  });

  const hasAnySpeaker = parsed.some((p) => p.kind === 'speaker');

  const segments = [];
  let pendingTime = null;
  for (const p of parsed) {
    if (p.kind === 'timestamp') {
      pendingTime = p.seconds;
      continue;
    }
    if (p.kind === 'speaker') {
      segments.push({
        i: segments.length,
        speaker: p.speaker,
        speakerRole: classifyRole(p.speaker),
        time: pendingTime,
        text: p.text,
      });
      pendingTime = null;
      continue;
    }
    // kind === 'other': drop it once we know this document is genuinely
    // speaker-labeled (real transcript); otherwise fall back to keeping
    // everything (handled below via hasAnySpeaker check).
  }

  if (!hasAnySpeaker) {
    // No speaker structure detected anywhere — preserve the original
    // conservative behavior rather than returning an empty transcript.
    return blocks.map((block, i) => ({ i, speaker: null, speakerRole: 'unknown', time: null, text: block }));
  }

  return segments;
}

/**
 * Derive the flat, human-readable full-text rendering from segments — kept
 * alongside `segments` so a caller that just wants "the transcript as text"
 * (e.g. feeding an LLM prompt) doesn't need to re-flatten it every time.
 * @param {Array<Object>} segments
 * @returns {string}
 */
function segmentsToFullText(segments) {
  return (segments || []).map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n\n');
}

/**
 * Compute the `participants` list and summary `stats` block from segments —
 * both derived, never hand-authored, so they can't drift from the segments
 * they describe.
 * @param {Array<Object>} segments
 */
function deriveMeta(segments) {
  const bySpeaker = new Map();
  let wordCount = 0;
  let charCount = 0;
  for (const s of segments || []) {
    if (s.speaker && !bySpeaker.has(s.speaker)) bySpeaker.set(s.speaker, s.speakerRole);
    wordCount += (s.text.match(/\S+/g) || []).length;
    charCount += s.text.length;
  }
  const participants = [...bySpeaker.entries()].map(([name, role]) => ({ name, role }));
  return {
    participants,
    stats: {
      segmentCount: (segments || []).length,
      speakerCount: participants.length,
      wordCount,
      charCount,
    },
  };
}

/**
 * The single entrypoint every save path should call. Builds the fixed
 * transcript-content shape (segments + fullText + participants + stats) from
 * whichever raw input a tier produced. Exactly one of `segments`/`paragraphs`/
 * `rawText` must be provided.
 * @param {Object} input
 * @param {Array<Object>} [input.segments] - Already-normalized segments (rare — mostly for tests).
 * @param {Array<Object>} [input.paragraphs] - Perplexity/Quartr's raw `paragraphs` array.
 * @param {string} [input.rawText] - Plain text (NotebookLM output, or a manually-pasted transcript).
 * @returns {{segments:Array<Object>, fullText:string, participants:Array<{name:string,role:string}>, stats:Object}}
 */
function buildTranscriptContent({ segments, paragraphs, rawText }) {
  let resolvedSegments;
  if (segments) resolvedSegments = segments;
  else if (paragraphs) resolvedSegments = segmentsFromParagraphs(paragraphs);
  else if (typeof rawText === 'string') resolvedSegments = parseSpeakerLabeledText(rawText);
  else throw new Error('buildTranscriptContent requires one of: segments, paragraphs, rawText');

  const fullText = segmentsToFullText(resolvedSegments);
  const { participants, stats } = deriveMeta(resolvedSegments);
  return { segments: resolvedSegments, fullText, participants, stats };
}

module.exports = {
  buildTranscriptContent,
  segmentsFromParagraphs,
  parseSpeakerLabeledText,
  segmentsToFullText,
  classifyRole,
};
