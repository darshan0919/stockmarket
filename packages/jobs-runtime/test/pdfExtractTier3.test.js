'use strict';

const http = require('http');
const {
  parseModelJson,
  coerceNumber,
  extractWithTier3,
  MockProvider,
  OllamaProvider,
  OpenAICompatProvider,
  providerFromSpec,
} = require('../lib/pdfExtract/tier3');

const PAGE =
  'Revenue from operations 17,183.00\nOther income 552.00\nTotal income 17,735.00\nProfit before tax 3,999.00';

describe('number and JSON parsing', () => {
  test('coerceNumber handles brackets, commas, dashes and junk', () => {
    expect(coerceNumber('(1,234.5)')).toBe(-1234.5);
    expect(coerceNumber('1,234.5')).toBe(1234.5);
    expect(coerceNumber('-')).toBeNull();
    expect(coerceNumber('abc')).toBeNull();
    expect(coerceNumber(null)).toBeNull();
    expect(coerceNumber(12)).toBe(12);
  });
  test('parseModelJson tolerates code fences and prose, rejects non-JSON', () => {
    const r = parseModelJson(
      'Sure!\n```json\n{"unit":"lakh","basis":"consolidated","values":{"revenue":"1,000"}}\n```'
    );
    expect(r.unit).toBe('lakh');
    expect(r.values.revenue).toBe(1000);
    expect(parseModelJson('no json here').error).toBe('no-json');
    expect(parseModelJson('{broken').error).toBeTruthy();
  });
});

describe('extractWithTier3', () => {
  test('converts printed units to crore and drops ungrounded values', async () => {
    const provider = new MockProvider(() => ({
      unit: 'lakh',
      basis: 'standalone',
      values: { revenue: 17183, totalIncome: 17735, pbt: 4000 }, // pbt not on the page: hallucinated
    }));
    const r = await extractWithTier3({ provider, pageText: PAGE });
    expect(r.ok).toBe(true);
    expect(r.cur.revenue).toBeCloseTo(171.83, 4);
    expect(r.cur.pbt).toBeUndefined();
    expect(r.dropped).toEqual(['pbt']);
  });
  test('a unit printed on the page overrides the model, a document unit only fills a gap', async () => {
    const mk = (unit) =>
      new MockProvider(() => ({ unit, basis: 'unknown', values: { revenue: 17183 } }));
    const a = await extractWithTier3({ provider: mk('crore'), pageText: PAGE, unitHint: 'lakh' });
    expect(a.cur.revenue).toBeCloseTo(171.83, 4);
    const b = await extractWithTier3({
      provider: mk('unknown'),
      pageText: PAGE,
      unitFallback: 'lakh',
    });
    expect(b.cur.revenue).toBeCloseTo(171.83, 4);
    const c = await extractWithTier3({ provider: mk('unknown'), pageText: PAGE });
    expect(c.cur.revenue).toBeUndefined();
  });
  test('provider failure is a clean not-ok result', async () => {
    const provider = new MockProvider(() => {
      throw new Error('boom');
    });
    const r = await extractWithTier3({ provider, pageText: PAGE });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/provider-error/);
  });
});

describe('providers against a local mock HTTP server', () => {
  let server;
  let base;
  let seen;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen = { url: req.url, body: JSON.parse(body) };
        res.setHeader('content-type', 'application/json');
        if (req.url === '/api/chat') {
          res.end(
            JSON.stringify({
              message: { content: '{"unit":"crore","values":{"revenue":5}}' },
              prompt_eval_count: 11,
              eval_count: 7,
            })
          );
        } else {
          res.end(
            JSON.stringify({
              choices: [{ message: { content: '{"unit":"crore","values":{"revenue":5}}' } }],
              usage: { prompt_tokens: 13, completion_tokens: 9 },
            })
          );
        }
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  test('Ollama: schema as format, temperature 0, token counts read back', async () => {
    const p = new OllamaProvider({ model: 'm', baseUrl: base });
    const r = await p.chat({ system: 's', user: 'u', schema: { type: 'object' } });
    expect(seen.url).toBe('/api/chat');
    expect(seen.body.format).toEqual({ type: 'object' });
    expect(seen.body.options.temperature).toBe(0);
    expect(r.tokens).toMatchObject({ input: 11, output: 7, cut: false });
  });
  test('Ollama: no output cap by default; an explicit cap is sent', async () => {
    const free = new OllamaProvider({ model: 'm', baseUrl: base });
    await free.chat({ system: 's', user: 'u', schema: { type: 'object' } });
    expect(seen.body.options.num_predict).toBe(-1);
    const capped = new OllamaProvider({ model: 'm', baseUrl: base, numPredict: 256 });
    await capped.chat({ system: 's', user: 'u', schema: { type: 'object' } });
    expect(seen.body.options.num_predict).toBe(256);
    await capped.chat({ system: 's', user: 'u', schema: { type: 'object' }, maxTokens: 64 });
    expect(seen.body.options.num_predict).toBe(64);
  });
  test('OpenAI-compatible: max_tokens only when a cap is set', async () => {
    const p = new OpenAICompatProvider({ model: 'm', baseUrl: `${base}/v1` });
    await p.chat({ system: 's', user: 'u', schema: { type: 'object' } });
    expect(seen.body.max_tokens).toBeUndefined();
  });
  test('OpenAI-compatible: json_schema response_format and usage', async () => {
    const p = new OpenAICompatProvider({ model: 'm', baseUrl: `${base}/v1` });
    const r = await p.chat({ system: 's', user: 'u', schema: { type: 'object' } });
    expect(seen.url).toBe('/v1/chat/completions');
    expect(seen.body.response_format.type).toBe('json_schema');
    expect(seen.body.temperature).toBe(0);
    expect(r.tokens).toMatchObject({ input: 13, output: 9, cut: false });
  });
  test('providerFromSpec parses specs and rejects junk', () => {
    expect(providerFromSpec('ollama:qwen2.5:7b').model).toBe('qwen2.5:7b');
    expect(providerFromSpec('openai:m@http://127.0.0.1:9/v1').baseUrl).toBe(
      'http://127.0.0.1:9/v1'
    );
    expect(() => providerFromSpec('gpt-4')).toThrow(/bad candidate spec/);
  });
});

describe('prompts: every model is told everything', () => {
  const { SPEC, FIELD_DEFS, STYLES, styleFor, promptFor } = require('../lib/pdfExtract/prompts');
  // Every spec item must appear, verbatim, in every style: no style may rely on the model inferring it.
  const items = [
    SPEC.task,
    SPEC.column,
    ...SPEC.rules,
    SPEC.unit,
    SPEC.basis,
    SPEC.output,
    SPEC.example,
    ...Object.entries(FIELD_DEFS).map(([k, d]) => `${k}: ${d}`),
  ];
  for (const style of Object.keys(STYLES)) {
    test(`style ${style} contains the whole spec`, () => {
      const text = promptFor('x', style).system;
      for (const it of items) expect(text).toContain(it);
    });
  }
  test('style is chosen by model size, and can be forced', () => {
    expect(styleFor('qwen2.5:3b')).toBe('compact');
    expect(styleFor('qwen3-vl:4b')).toBe('compact');
    expect(styleFor('qwen2.5:7b')).toBe('chat');
    expect(styleFor('qwen3-vl:8b')).toBe('chat');
    expect(styleFor('qwen2.5:14b')).toBe('chat');
    expect(promptFor('qwen2.5:7b', 'compact').style).toBe('compact');
  });
  test('the style used is reported', async () => {
    const provider = new MockProvider(() => ({
      unit: 'lakh',
      basis: 'standalone',
      values: { revenue: 17183 },
    }));
    provider.model = 'qwen2.5:3b';
    const r = await extractWithTier3({ provider, pageText: PAGE });
    expect(r.promptStyle).toBe('compact');
  });
});

describe('thinking models and failure reporting', () => {
  test('think:false is sent for qwen3 models only', async () => {
    const http2 = require('http');
    let body;
    const srv = http2.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        body = JSON.parse(b);
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({ message: { content: '{}' }, prompt_eval_count: 1, eval_count: 1 })
        );
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${srv.address().port}`;
    await new OllamaProvider({ model: 'qwen3-vl:8b', baseUrl }).chat({ user: 'u' });
    expect(body.think).toBe(false);
    await new OllamaProvider({ model: 'qwen2.5:7b', baseUrl }).chat({ user: 'u' });
    expect(body.think).toBeUndefined();
    await new Promise((r) => srv.close(r));
  });
  test('a non-JSON reply is reported with its head, not just "no-json"', async () => {
    const provider = new MockProvider(() => 'I cannot read this page');
    const r = await extractWithTier3({ provider, pageText: PAGE });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no-json.*I cannot read/);
  });
});
