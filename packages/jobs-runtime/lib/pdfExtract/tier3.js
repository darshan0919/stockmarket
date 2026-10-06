'use strict';

/**
 * Tier 3: a LOCAL model (served on the owner's machine) reads ONE result-table page and returns constrained
 * JSON. No provider API key is involved: the providers below talk to an endpoint on 127.0.0.1 (Ollama,
 * llama.cpp server, LM Studio, mlx-lm server). Decision #1 of docs/PDF_OCR_EXTRACTION_PLAN.md §6.
 *
 * A model's numbers are never trusted as read:
 *   - L1 grounding: every number must occur, as printed, in the page text / OCR text (silent digit errors
 *     and invented values are dropped, not served),
 *   - L2 identities and the unit check happen in the router.
 */

const { groundValues } = require('./verify');
const { promptFor } = require('./prompts');

const FIELDS = [
  'revenue',
  'otherIncome',
  'totalIncome',
  'employeeCost',
  'interest',
  'depreciation',
  'otherExpenses',
  'totalExpenses',
  'pbt',
  'tax',
  'pat',
  'epsBasic',
];
const UNITS = ['crore', 'lakh', 'million', 'thousand', 'unknown'];
const BASES = ['consolidated', 'standalone', 'unknown'];
const TO_CRORE = { crore: 1, lakh: 0.01, million: 0.1, thousand: 0.0001 };

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    unit: { type: 'string', enum: UNITS },
    basis: { type: 'string', enum: BASES },
    period: { type: ['string', 'null'] },
    values: {
      type: 'object',
      properties: Object.fromEntries(FIELDS.map((f) => [f, { type: ['number', 'null'] }])),
      required: FIELDS,
      additionalProperties: false,
    },
  },
  required: ['unit', 'basis', 'values'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = promptFor('chat').system; // default text; extractWithTier3 picks the style per model

function buildUserPrompt({ pageText, mode }) {
  if (mode === 'image') return 'The page is attached as an image. Extract the fields.';
  const body = `PAGE TEXT (layout preserved):\n${String(pageText || '').slice(0, 12000)}`;
  return mode === 'both'
    ? `${body}\n\nThe same page is attached as an image. Use it to resolve unclear text.`
    : body;
}

// ── numbers ──────────────────────────────────────────────────────────────
function coerceNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || /^(null|nil|na|n\/a|-|–|—)$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[(),\s₹`~-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

/** Parse a model reply into {unit, basis, period, values} or {error}. Tolerates code fences and prose. */
function parseModelJson(raw) {
  if (raw && typeof raw === 'object') return normaliseParsed(raw);
  const s = String(raw || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return { error: 'no-json' };
  try {
    return normaliseParsed(JSON.parse(s.slice(start, end + 1)));
  } catch {
    return { error: 'bad-json' };
  }
}

function normaliseParsed(o) {
  const values = {};
  const src = o.values && typeof o.values === 'object' ? o.values : o;
  for (const f of FIELDS) {
    const n = coerceNumber(src[f]);
    if (n !== null) values[f] = n;
  }
  const unit = UNITS.includes(String(o.unit).toLowerCase())
    ? String(o.unit).toLowerCase()
    : 'unknown';
  const basis = BASES.includes(String(o.basis).toLowerCase())
    ? String(o.basis).toLowerCase()
    : 'unknown';
  return { unit, basis, period: typeof o.period === 'string' ? o.period : null, values };
}

// ── providers ────────────────────────────────────────────────────────────
async function postJson(url, body, { timeoutMs = 180000, headers = {} } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (e) {
      // undici reports every network failure as "fetch failed"; the real cause is on e.cause
      const cause = e.cause ? e.cause.code || e.cause.message : e.name;
      throw new Error(`cannot reach ${url} (${cause})`);
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Ollama: POST /api/chat with a JSON-schema `format` (structured outputs) and temperature 0. */
class OllamaProvider {
  constructor({
    model,
    baseUrl = 'http://127.0.0.1:11434',
    numCtx = 8192,
    keepAlive = '10m',
    timeoutMs,
    think,
    numPredict,
  } = {}) {
    if (!model) throw new Error('OllamaProvider: model is required');
    // Thinking models spend the whole token budget on hidden reasoning and return empty content unless told not to.
    const thinks =
      think !== undefined
        ? think
        : /qwen3|deepseek-r1|gpt-oss|magistral/i.test(model)
          ? false
          : undefined;
    Object.assign(this, {
      name: `ollama:${model}`,
      model,
      baseUrl,
      numCtx,
      keepAlive,
      timeoutMs,
      think: thinks,
      numPredict,
    });
  }
  async chat({ system, user, images = [], schema, maxTokens, stop, cacheBust = false }) {
    // maxTokens: undefined -> no cap (num_predict -1); the call-level value wins over the provider default
    const cap = maxTokens !== undefined ? maxTokens : this.numPredict;
    // cacheBust: a unique suffix per call stops Ollama 0.34.x from matching this request's prompt cache to a different image
    const msg = {
      role: 'user',
      content: cacheBust ? `${user} [${Math.random().toString(36).slice(2, 8)}]` : user,
    };
    if (images.length) msg.images = images.map((b) => b.toString('base64'));
    const r = await postJson(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        stream: false,
        keep_alive: this.keepAlive,
        messages: system ? [{ role: 'system', content: system }, msg] : [msg],
        format: schema,
        think: this.think,
        options: {
          temperature: 0,
          num_ctx: this.numCtx,
          num_predict: cap > 0 ? cap : -1,
          ...(stop ? { stop } : {}),
        },
      },
      { timeoutMs: this.timeoutMs }
    );
    return {
      content: r.message && r.message.content,
      thinking: r.message && r.message.thinking,
      tokens: {
        input: r.prompt_eval_count || 0,
        output: r.eval_count || 0,
        cut: r.done_reason === 'length',
      },
    };
  }
}

/** OpenAI-compatible local server (llama.cpp `llama-server`, LM Studio, mlx-lm): /v1/chat/completions. */
class OpenAICompatProvider {
  constructor({ model, baseUrl = 'http://127.0.0.1:8080/v1', timeoutMs, numPredict } = {}) {
    if (!model) throw new Error('OpenAICompatProvider: model is required');
    Object.assign(this, { name: `openai-compat:${model}`, model, baseUrl, timeoutMs, numPredict });
  }
  async chat({ system, user, images = [], schema, maxTokens }) {
    const cap = maxTokens !== undefined ? maxTokens : this.numPredict;
    const content = images.length
      ? [
          { type: 'text', text: user },
          ...images.map((b) => ({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${b.toString('base64')}` },
          })),
        ]
      : user;
    const r = await postJson(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        temperature: 0,
        ...(cap > 0 ? { max_tokens: cap } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'result_table', strict: true, schema },
        },
      },
      { timeoutMs: this.timeoutMs }
    );
    const u = r.usage || {};
    return {
      content: r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content,
      tokens: {
        input: u.prompt_tokens || 0,
        output: u.completion_tokens || 0,
        cut: !!(r.choices && r.choices[0] && r.choices[0].finish_reason === 'length'),
      },
    };
  }
}

/** Test double: `fn({system,user,images,schema}) -> object|string`. */
class MockProvider {
  constructor(fn, name = 'mock') {
    Object.assign(this, { name, fn });
  }
  async chat(args) {
    const out = await this.fn(args);
    return {
      content: typeof out === 'string' ? out : JSON.stringify(out),
      tokens: { input: 100, output: 50 },
    };
  }
}

/** "ollama:qwen2.5:7b" | "openai:model@http://127.0.0.1:8080/v1" -> provider. */
function providerFromSpec(spec, { numPredict } = {}) {
  const m = /^(ollama|openai):(.+)$/.exec(spec);
  if (!m)
    throw new Error(`bad candidate spec: ${spec} (use ollama:<model> or openai:<model>[@baseUrl])`);
  if (m[1] === 'ollama') {
    const [model, baseUrl] = m[2].split('@');
    return new OllamaProvider({ model, numPredict, ...(baseUrl ? { baseUrl } : {}) });
  }
  const [model, baseUrl] = m[2].split('@');
  return new OpenAICompatProvider({ model, numPredict, ...(baseUrl ? { baseUrl } : {}) });
}

// ── the extraction call ──────────────────────────────────────────────────
/**
 * @param {object} a
 * @param {object} a.provider      chat({system,user,images,schema})
 * @param {string} [a.pageText]    text layer of the page ('' for a scanned page)
 * @param {string} [a.ocrText]     Tier 2 text, used for grounding when the text layer is empty/corrupt
 * @param {Buffer} [a.imagePng]    rendered page, required for mode image|both
 * @param {'text'|'image'|'both'} [a.mode='text']
 * @param {string} [a.unitHint]     unit named in the page's own text (overrides the model)
 * @param {string} [a.unitFallback] unit another page of the document printed (used only when the model has none)
 * @returns {Promise<{ok, reason?, unit, basis, period, printed, cur, dropped, tokens, ms}>}
 */
async function extractWithTier3({
  provider,
  pageText = '',
  ocrText = '',
  imagePng = null,
  mode = 'text',
  unitHint = null,
  unitFallback = null,
  promptStyle = null,
}) {
  const t0 = Date.now();
  const images = mode === 'text' || !imagePng ? [] : [imagePng];
  const user = buildUserPrompt({
    pageText: pageText || ocrText,
    mode: images.length ? mode : 'text',
  });
  const prompt = promptFor(provider.model, promptStyle);
  let reply;
  try {
    reply = await provider.chat({ system: prompt.system, user, images, schema: RESULT_SCHEMA });
  } catch (e) {
    return {
      ok: false,
      reason: `provider-error: ${String(e.message).slice(0, 120)}`,
      tokens: { input: 0, output: 0 },
      ms: Date.now() - t0,
    };
  }
  const parsed = parseModelJson(reply.content);
  const tokens = reply.tokens || { input: 0, output: 0 };
  if (parsed.error) {
    // keep the head of what the model actually said: an empty reply and a prose reply need different fixes
    const said = String(reply.content || '')
      .replace(/\s+/g, ' ')
      .slice(0, 100);
    const thought = reply.thinking ? ` | thinking(${String(reply.thinking).length} chars)` : '';
    return {
      ok: false,
      reason: `${parsed.error}: ${JSON.stringify(said)}${thought}`,
      tokens,
      ms: Date.now() - t0,
    };
  }
  const { grounded, ungrounded } = groundValues(parsed.values, `${pageText}\n${ocrText}`);
  // A unit printed in the page's own text beats the model's guess; a document-level unit only fills a gap.
  if (unitHint) parsed.unit = unitHint;
  else if (parsed.unit === 'unknown' && unitFallback) parsed.unit = unitFallback;
  const factor = TO_CRORE[parsed.unit];
  const cur = {};
  if (factor) {
    for (const [k, v] of Object.entries(grounded)) cur[k] = k === 'epsBasic' ? v : v * factor;
  }
  return {
    ok: Object.keys(grounded).length > 0,
    reason: Object.keys(grounded).length ? undefined : 'nothing-grounded',
    promptStyle: prompt.style,
    unit: parsed.unit,
    basis: parsed.basis,
    period: parsed.period,
    printed: parsed.values,
    cur,
    dropped: Object.keys(ungrounded),
    tokens,
    ms: Date.now() - t0,
  };
}

module.exports = {
  FIELDS,
  RESULT_SCHEMA,
  SYSTEM_PROMPT,
  TO_CRORE,
  OllamaProvider,
  OpenAICompatProvider,
  MockProvider,
  providerFromSpec,
  parseModelJson,
  coerceNumber,
  buildUserPrompt,
  extractWithTier3,
};
