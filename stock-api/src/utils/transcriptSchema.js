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

/**
 * Best-effort parse of plain "Speaker: text" formatted text (what a
 * NotebookLM verbatim-transcript report typically looks like, and what a
 * human might paste in) into segments. Paragraphs are separated by a blank
 * line; a paragraph starting with a short "Name:" prefix (<=40 chars, no
 * sentence-ending punctuation before the colon) is treated as a speaker
 * label. Anything that doesn't match becomes a speaker:null segment — this
 * is intentionally conservative: a wrong speaker label is worse than none.
 * @param {string} text
 * @returns {Array<Object>} segments
 */
function parseSpeakerLabeledText(text) {
  const blocks = String(text || '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const SPEAKER_LABEL = /^([A-Za-z][A-Za-z0-9 .,&'-]{1,50}):\s+([\s\S]+)$/;

  return blocks.map((block, i) => {
    const m = SPEAKER_LABEL.exec(block);
    if (m) {
      const [, speaker, rest] = m;
      return {
        i,
        speaker: speaker.trim(),
        speakerRole: classifyRole(speaker),
        time: null,
        text: rest.trim(),
      };
    }
    return { i, speaker: null, speakerRole: 'unknown', time: null, text: block };
  });
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
