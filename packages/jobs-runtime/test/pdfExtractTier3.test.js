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
    expect(r.tokens).toEqual({ input: 11, output: 7 });
  });
  test('OpenAI-compatible: json_schema response_format and usage', async () => {
    const p = new OpenAICompatProvider({ model: 'm', baseUrl: `${base}/v1` });
    const r = await p.chat({ system: 's', user: 'u', schema: { type: 'object' } });
    expect(seen.url).toBe('/v1/chat/completions');
    expect(seen.body.response_format.type).toBe('json_schema');
    expect(seen.body.temperature).toBe(0);
    expect(r.tokens).toEqual({ input: 13, output: 9 });
  });
  test('providerFromSpec parses specs and rejects junk', () => {
    expect(providerFromSpec('ollama:qwen2.5:7b').model).toBe('qwen2.5:7b');
    expect(providerFromSpec('openai:m@http://127.0.0.1:9/v1').baseUrl).toBe(
      'http://127.0.0.1:9/v1'
    );
    expect(() => providerFromSpec('gpt-4')).toThrow(/bad candidate spec/);
  });
});
