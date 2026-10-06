'use strict';

/**
 * Tier 2 with a dedicated OCR model (GLM-OCR, DeepSeek-OCR, ...) instead of tesseract.
 *
 * These models turn a page IMAGE into text (markdown or HTML tables), not into our JSON fields. Their output is
 * normalised to the plain "label   n   n   n" rows the deterministic parser reads, then goes through the same
 * parser, unit hints and verification as every other tier. A model that misreads a digit is caught by L2.
 */

const { renderPagePng } = require('./pages');

/** Prompt each OCR model family was trained for (Ollama library pages, checked 2026-10-03). */
const OCR_PROMPTS = [
  [/^glm-ocr/, 'Table Recognition:'],
  [/^deepseek-ocr/, '<|grounding|>Convert the document to markdown.'],
];
/**
 * Per-family call settings. glm-ocr ends its page with <|user|>, which Ollama 0.34.1+ does not treat as end-of-text, so it
 * runs on until the repeat guard returns HTTP 500 (ollama/ollama issue 18609). A stop token and a smaller cap are the
 * documented workarounds; whether they are enough is measured with ocr_probe.js, not assumed.
 */
const OCR_CALL_DEFAULTS = [[/^glm-ocr/, { stop: ['<|user|>'] }]];

const DEFAULT_PROMPT = 'Convert this page to plain text. Keep every table row on one line.';

function promptFor(model) {
  const hit = OCR_PROMPTS.find(([re]) => re.test(String(model || '')));
  return hit ? hit[1] : DEFAULT_PROMPT;
}

/** Markdown / HTML table output -> whitespace-separated rows; fences, tags and rule lines removed. */
function normaliseOcrText(raw) {
  let s = String(raw || '');
  s = s.replace(/```[a-z]*\n?/gi, '');
  s = s.replace(/<\/(tr|p|div|h\d|caption)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/t[dh]>/gi, '    ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  s = s
    .split('\n')
    .filter((l) => !/^\s*\|?[\s:|-]{3,}\|?\s*$/.test(l)) // markdown rule rows: |---|---|
    .map((l) => l.replace(/\|/g, '    ').replace(/[ \t]+$/, ''))
    .join('\n');
  return s.replace(/\n{3,}/g, '\n\n');
}

/**
 * OCR one page with a model.
 * @returns {Promise<{text: string, tokens: {input: number, output: number}, error?: string}>}
 */
async function modelOcrPage({ provider, file, page, prompt, dpi = 200, extra = {} }) {
  let png;
  try {
    png = renderPagePng(file, page, { dpi });
  } catch (e) {
    return {
      text: '',
      tokens: { input: 0, output: 0 },
      error: `render: ${String(e.message).slice(0, 80)}`,
    };
  }
  try {
    const r = await provider.chat({
      system: null,
      user: prompt || promptFor(provider.model),
      images: [png],
      ...OCR_CALL_DEFAULTS.find(([re]) => re.test(String(provider.model || '')))?.[1],
      ...extra,
    });
    return { text: normaliseOcrText(r.content), tokens: r.tokens || { input: 0, output: 0 } };
  } catch (e) {
    return {
      text: '',
      tokens: { input: 0, output: 0 },
      error: `provider: ${String(e.message).slice(0, 80)}`,
    };
  }
}

module.exports = { OCR_CALL_DEFAULTS, modelOcrPage, normaliseOcrText, promptFor, OCR_PROMPTS };
