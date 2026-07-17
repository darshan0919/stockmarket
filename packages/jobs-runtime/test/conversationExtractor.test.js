'use strict';

const fs = require('fs');
const path = require('path');
const kw = require('../lib/stockmarketKeywords');
const ex = require('../lib/conversationExtractor');

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'conversations.sample.json'), 'utf8')
);
const bwName = (n) => fixtures.find((c) => c.name === n);

describe('stockmarketKeywords.classify', () => {
  test('stock title + body scores as stock', () => {
    const r = kw.classify({ title: 'Swaraj Engines', text: 'NSE equity thesis on margins, capex and dividend' });
    expect(r.isStock).toBe(true);
    expect(r.matched).toEqual(expect.arrayContaining(['equity', 'thesis', 'dividend']));
  });

  test('non-stock small talk is not stock', () => {
    const r = kw.classify({ title: 'Drafting a pitch or proposal', text: 'Please help me write a nice cover letter to a friend.' });
    expect(r.isStock).toBe(false);
  });

  test('title is weighted (counts double)', () => {
    const withTitle = kw.classify({ title: 'stock market', text: '' }).score;
    const bodyOnly = kw.classify({ title: '', text: 'stock market' }).score;
    expect(withTitle).toBeGreaterThanOrEqual(bodyOnly);
  });
});

describe('conversationExtractor.detectCompanyIds', () => {
  test('finds NSE/BSE ids, dedupes and sorts', () => {
    const ids = ex.detectCompanyIds('see NSE:SWARAJENG and BSE:500407 and NSE:SWARAJENG again');
    expect(ids).toEqual(['BSE:500407', 'NSE:SWARAJENG']);
  });
  test('no false positives on plain words', () => {
    expect(ex.detectCompanyIds('the nse listed a stock')).toEqual([]);
  });

  test('drops placeholders and 1–2 char tickers, keeps real ones', () => {
    const ids = ex.detectCompanyIds('example NSE:TICKER and NSE:XXX and NSE:M and NSE:AC but real NSE:STLTECH and NSE:BHAGYANGR and BSE:530555');
    expect(ids).toEqual(['BSE:530555', 'NSE:BHAGYANGR', 'NSE:STLTECH']);
    expect(ids).not.toContain('NSE:TICKER');
    expect(ids).not.toContain('NSE:XXX');
    expect(ids).not.toContain('NSE:M');
  });
});

describe('conversationExtractor.extract', () => {
  const NOW = '2026-07-16T10:00:00.000Z';

  test('stock conversation → conversation DTO with deterministic envelope', () => {
    const r = ex.extract(bwName('Swaraj Engines'), { source: 'cloud', now: NOW });
    expect(r.isStock).toBe(true);
    const d = r.conversationDto;
    expect(d.id).toMatch(/^conv_cloud_[0-9a-f]{8}$/);
    expect(d.creator).toBe('conversation-capture');
    expect(d.type).toBe('cloud');
    expect(d.creationTime).toBe(NOW);
    expect(d.body).toBe(`conversations/${d.id}.json`);
    expect(Array.isArray(d.questions)).toBe(true);
  });

  test('cowork "local_<uuid>" session keys yield DISTINCT ids (no collision)', () => {
    const mk = (sid) => ({ uuid: sid, name: 'Swaraj Engines equity', chat_messages: [{ sender: 'human', text: 'NSE thesis margin capex' }] });
    const a = ex.extract(mk('local_5a88b1ac-a4ff-44f4-a86e-267f941a3e2a'), { source: 'cowork', now: NOW });
    const b = ex.extract(mk('local_935db39a-f18a-4f41-a2b7-326ca4f18a47'), { source: 'cowork', now: NOW });
    expect(a.conversationDto.id).not.toBe(b.conversationDto.id);
    expect(a.conversationDto.id).toBe('conv_cowork_5a88b1ac');
    expect(b.conversationDto.id).toBe('conv_cowork_935db39a');
  });

  test('deterministic: same input twice ⇒ identical id (upsert, never dupes)', () => {
    const a = ex.extract(bwName('Swaraj Engines'), { source: 'cloud', now: NOW });
    const b = ex.extract(bwName('Swaraj Engines'), { source: 'cloud', now: NOW });
    expect(a.conversationDto.id).toBe(b.conversationDto.id);
    expect(a.conversationDto).toEqual(b.conversationDto);
  });

  test('non-stock conversation → skipped, no DTO', () => {
    const r = ex.extract(bwName('Drafting a pitch or proposal'), { source: 'cloud', now: NOW });
    expect(r.isStock).toBe(false);
    expect(r.conversationDto).toBeNull();
  });

  test('injected llm enriches summary + routing without changing purity', () => {
    const llm = {
      summarize: () => 'LLM summary',
      route: () => ({ notes: [{ type: 'chat-insight' }], reports: [], companyIds: ['NSE:SWARAJENG'] }),
    };
    const r = ex.extract(bwName('Swaraj Engines'), { source: 'cloud', now: NOW, llm });
    expect(r.conversationDto.summary).toBe('LLM summary');
    expect(r.notes).toHaveLength(1);
    expect(r.conversationDto.companyIds).toContain('NSE:SWARAJENG');
  });

  test('artifacts captured as metadata with bytesUnavailable flag', () => {
    const r = ex.extract(bwName('Swaraj Engines'), { source: 'cloud', now: NOW });
    for (const a of r.artifacts) {
      expect(a).toHaveProperty('bytesUnavailable', true);
      expect(a).toHaveProperty('kind');
    }
  });
});
