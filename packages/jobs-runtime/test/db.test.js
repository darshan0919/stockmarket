'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
});

afterEach(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const mkEvent = (over = {}) => ({
  type: 'gainer',
  date: '2026-07-08',
  companyId: 'NSE:SWARAJENG',
  creator: 'gainers-signal',
  conviction: 'HIGH',
  summary: 'SWARAJENG +5% — order win',
  ...over,
});

describe('envelope', () => {
  test('rejects records without creator', () => {
    expect(() => db.ensureEnvelope({ foo: 1 })).toThrow(/creator/);
  });

  test('derives deterministic ids — same logical record, same id', () => {
    const a = db.ensureEnvelope(mkEvent(), { kind: 'evt', discriminator: 'x' });
    const b = db.ensureEnvelope(mkEvent(), { kind: 'evt', discriminator: 'x' });
    expect(a.id).toBe(b.id);
    expect(a.creationTime).toBeTruthy();
    expect(a.modifiedTime).toBeTruthy();
  });
});

describe('companyId sanitization (ensureEnvelope + find)', () => {
  test('ensureEnvelope strips a series suffix from record.companyId', () => {
    const rec = db.ensureEnvelope(mkEvent({ companyId: 'NSE:SWARAJENG-BE' }), {
      kind: 'evt',
      discriminator: 'x',
    });
    expect(rec.companyId).toBe('NSE:SWARAJENG');
  });

  test('ensureEnvelope strips suffixes from every entry in record.companyIds[]', () => {
    const rec = db.ensureEnvelope(
      { creator: 'test', companyIds: ['NSE:A-BE', 'NSE:B-SM', 'NSE:C'] },
      { kind: 'evt', scope: 'multi', discriminator: 'x' }
    );
    expect(rec.companyIds).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
  });

  test('a suffixed companyId produces the SAME id as the unsuffixed one (dedup relies on this)', () => {
    const a = db.ensureEnvelope(mkEvent({ companyId: 'NSE:SWARAJENG' }), {
      kind: 'evt',
      discriminator: 'x',
    });
    const b = db.ensureEnvelope(mkEvent({ companyId: 'NSE:SWARAJENG-BE' }), {
      kind: 'evt',
      discriminator: 'x',
    });
    expect(a.id).toBe(b.id);
  });

  test('find() sanitizes filter.companyId so a suffixed lookup still matches a clean stored record', () => {
    db.appendEvents([mkEvent({ companyId: 'NSE:SWARAJENG' })]);
    expect(db.find('events', { companyId: 'NSE:SWARAJENG-BE' })).toHaveLength(1);
  });

  test('does not mis-strip a free-text scope that happens to end in a suffix token', () => {
    // `scope` is only sanitized when it looks like a companyId (has an
    // exchange prefix, e.g. "NSE:") — a plain free-text scope must survive
    // untouched even if it happens to end with a token that looks like a
    // series suffix (e.g. "-sm" in "watchlist-sm").
    const rec = db.ensureEnvelope(
      { creator: 'test' },
      { kind: 'evt', scope: 'watchlist-sm', discriminator: 'x' }
    );
    expect(rec.id).toContain('watchlist-sm');
  });
});

describe('upsert / dedup', () => {
  test('re-running the same append never duplicates', () => {
    const s1 = db.appendEvents([mkEvent()]);
    const s2 = db.appendEvents([mkEvent()]);
    expect(s1.inserted).toBe(1);
    expect(s2.inserted).toBe(0);
    expect(s2.unchanged).toBe(1);
    expect(db.find('events', { date: '2026-07-08' })).toHaveLength(1);
  });

  test('content change updates in place, preserves creationTime', () => {
    db.appendEvents([mkEvent()]);
    const before = db.find('events', { date: '2026-07-08' })[0];
    db.appendEvents([mkEvent({ conviction: 'MEDIUM' })]);
    const all = db.find('events', { date: '2026-07-08' });
    expect(all).toHaveLength(1);
    expect(all[0].conviction).toBe('MEDIUM');
    expect(all[0].creationTime).toBe(before.creationTime);
  });

  test('events route to monthly partition files', () => {
    db.appendEvents([mkEvent(), mkEvent({ date: '2026-06-15', summary: 'older' })]);
    expect(fs.existsSync(path.join(tmpRoot, 'events-2026-07.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'events-2026-06.json'))).toBe(true);
  });
});

describe('company links', () => {
  test('appendEvents links event id into companies.json, capped and deduped', () => {
    db.appendEvents([mkEvent()]);
    db.appendEvents([mkEvent()]); // same id — must not double-link
    const c = db.get('companies', 'NSE:SWARAJENG');
    expect(c).toBeTruthy();
    expect(c.links.events).toHaveLength(1);
  });

  test('saveReport writes body + index + link', () => {
    const id = db.saveReport({
      type: 'concall-analysis',
      date: '2026-07-01',
      companyId: 'NSE:SWARAJENG',
      creator: 'concall-analysis',
      summary: 'Strong quarter',
      sections: { tone: 'positive' },
      contextUsed: [],
    });
    expect(db.readReport(id).sections.tone).toBe('positive');
    const idx = db.get('reports', id);
    expect(idx.body).toBe(`reports/${id}.json`);
    expect(idx.sections).toBeUndefined(); // index is slim
    expect(db.get('companies', 'NSE:SWARAJENG').links.reports).toContain(id);
  });
});

describe('ipos collection', () => {
  const mkIpo = (over = {}) => ({
    id: 'ipo_4462',
    type: 'ipo-subscription',
    creator: 'ipo-subscription-ranker',
    date: '2026-08-09',
    ipoPlatformId: '4462',
    companyName: 'Anawil Wire and Engineering Limited',
    subscriptionQualityScore: 2.243,
    subscriptionQualityTier: 'STRONG',
    rank: 1,
    ...over,
  });

  test('same logical IPO re-scanned twice dedupes to one record (id = ipo_<ipoPlatformId>)', () => {
    const s1 = db.upsertMany('ipos', [mkIpo()]);
    const s2 = db.upsertMany('ipos', [mkIpo()]);
    expect(s1.inserted).toBe(1);
    expect(s2.inserted).toBe(0);
    expect(s2.unchanged).toBe(1);
    expect(fs.existsSync(path.join(tmpRoot, 'ipos.json'))).toBe(true);
    const stored = JSON.parse(fs.readFileSync(path.join(tmpRoot, 'ipos.json'), 'utf8'));
    expect(Object.keys(stored)).toHaveLength(1);
  });

  test('a later-day re-scan (updated subscription figures) updates in place, preserves creationTime', () => {
    db.upsertMany('ipos', [mkIpo()]);
    const before = db.get('ipos', 'ipo_4462');
    db.upsertMany('ipos', [mkIpo({ subscriptionQualityScore: 2.5, subscriptionQualityTier: 'STRONG' })]);
    const after = db.get('ipos', 'ipo_4462');
    expect(after.subscriptionQualityScore).toBe(2.5);
    expect(after.creationTime).toBe(before.creationTime);
  });

  test('envelope enforcement — a record without creator is rejected', () => {
    expect(() => db.upsertMany('ipos', [mkIpo({ creator: undefined })])).toThrow(
      /creator is required/
    );
  });
});

describe('conversations', () => {
  const mkConv = (over = {}) => ({
    id: 'conv_cloud_abc12345',
    type: 'cloud',
    date: '2026-07-08',
    creator: 'conversation-capture',
    creationTime: '2026-07-08T10:00:00.000Z',
    modifiedTime: '2026-07-08T10:00:00.000Z',
    title: 'Swaraj Engines deep dive',
    sessionId: 'abc12345-...',
    companyIds: ['NSE:SWARAJENG'],
    tags: ['equity', 'thesis'],
    summary: 'Margin thesis on Swaraj',
    questions: ['What is the margin trajectory?'],
    artifacts: [{ fileName: 'x.pdf', bytesUnavailable: true }],
    _body: {
      turns: [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'analysis' },
      ],
    },
    ...over,
  });

  test('saveConversation writes slim index + full body + company link', () => {
    const id = db.saveConversation(mkConv());
    expect(id).toBe('conv_cloud_abc12345');
    const idx = db.get('conversations', id);
    expect(idx.body).toBe(`conversations/${id}.json`);
    expect(idx.artifactCount).toBe(1);
    expect(idx.turns).toBeUndefined(); // index is slim, no turns
    expect(idx.questions).toBeUndefined(); // questions live only in the body
    const body = db.readConversation(id);
    expect(body.turns).toHaveLength(2); // full transcript in body
    expect(body._body).toBeUndefined(); // wrapper stripped
    expect(db.get('companies', 'NSE:SWARAJENG').links.conversations).toContain(id);
  });

  test('re-capturing the same conversation upserts — never duplicates', () => {
    db.saveConversation(mkConv());
    db.saveConversation(mkConv());
    expect(db.find('conversations', { companyId: 'NSE:SWARAJENG' })).toHaveLength(1);
    expect(db.get('companies', 'NSE:SWARAJENG').links.conversations).toHaveLength(1);
  });

  test('envelope enforced — creator required', () => {
    const bad = mkConv();
    delete bad.creator;
    expect(() => db.saveConversation(bad)).toThrow(/creator/);
  });

  test('buildCompanyContext surfaces conversations', () => {
    const { buildCompanyContext } = require('../lib/companyContext');
    db.saveConversation(mkConv());
    const ctx = buildCompanyContext('NSE:SWARAJENG');
    expect(ctx.conversations).toHaveLength(1);
    expect(ctx.conversations[0].title).toMatch(/Swaraj/);
    expect(ctx.availableIds).toContain('conv_cloud_abc12345');
  });
});

describe('prompts library', () => {
  const mkPrompt = (over = {}) => ({
    creator: 'conversation-capture',
    date: '2026-05-24',
    text: 'Create an institutional-grade forward PE thesis for {company}; fetch last 5 concalls, extract order-book/capacity/margin guidance, extrapolate FY27E/FY28E.',
    title: 'Forward PE thesis from concalls',
    intent: 'valuation-thesis',
    linkedSkill: 'concall-analysis',
    inputs: ['{company}'],
    tags: ['thesis', 'valuation', 'concall'],
    status: 'approved',
    improvedVersion:
      'For {company}: build a forward P/E thesis. Pull the last 5 concalls + investor decks; extract order book, capacity, revenue & margin guidance with per-call citations; project FY27E/FY28E and state key assumptions + what would break the thesis.',
    sourceConversationId: 'conv_cloud_5dd8b2c1',
    ...over,
  });

  test('savePrompt stores with deterministic id, dedups on re-save', () => {
    const r1 = db.savePrompt(mkPrompt());
    expect(r1.id).toMatch(/^prompt_conversation-capture_concall-analysis_2026-05-24/);
    expect(r1.inserted).toBe(1);
    const r2 = db.savePrompt(mkPrompt());
    expect(r2.inserted).toBe(0);
    expect(db.find('prompts', {})).toHaveLength(1);
  });

  test('find prompts by linkedSkill via creator/type filters and fields preserved', () => {
    db.savePrompt(mkPrompt());
    const all = db.find('prompts', {});
    expect(all[0].linkedSkill).toBe('concall-analysis');
    expect(all[0].improvedVersion).toMatch(/forward P\/E thesis/);
    expect(all[0].status).toBe('approved');
  });

  test('envelope enforced — creator required', () => {
    const bad = mkPrompt();
    delete bad.creator;
    expect(() => db.savePrompt(bad)).toThrow(/creator/);
  });
});

describe('find', () => {
  test('filters by companyId including companyIds[] and date/type/since', () => {
    db.appendEvents([
      mkEvent(),
      mkEvent({
        type: 'deal',
        companyId: undefined,
        companyIds: ['NSE:SWARAJENG', 'NSE:TITAN'],
        summary: 'block deal',
      }),
      mkEvent({ companyId: 'NSE:TITAN', summary: 'titan gainer' }),
    ]);
    expect(db.find('events', { companyId: 'NSE:SWARAJENG' })).toHaveLength(2);
    expect(db.find('events', { companyId: 'NSE:TITAN', type: 'gainer' })).toHaveLength(1);
    expect(db.find('events', { since: '2026-08-01' })).toHaveLength(0);
  });
});

describe('durability', () => {
  test('corrupt collection auto-restores from checkpoint', () => {
    db.appendEvents([mkEvent()]);
    db.appendEvents([mkEvent({ companyId: 'NSE:TITAN' })]); // 2nd write → checkpoint of 1st exists
    const file = path.join(tmpRoot, 'events-2026-07.json');
    fs.writeFileSync(file, '{ definitely not json');
    const rows = db.find('events', { date: '2026-07-08' });
    expect(rows.length).toBeGreaterThanOrEqual(1); // restored from checkpoint
    expect(fs.readdirSync(tmpRoot).some((f) => f.includes('.corrupt.'))).toBe(true);
  });

  test('lock prevents concurrent mutation; stale lock is stolen', () => {
    const lockDir = path.join(tmpRoot, '.locks');
    fs.mkdirSync(lockDir, { recursive: true });
    const lock = path.join(lockDir, 'notes.lock');
    fs.writeFileSync(lock, '{}');
    const old = Date.now() / 1000 - 600; // 10 min ago → stale
    fs.utimesSync(lock, old, old);
    expect(() =>
      db.appendNote({ companyId: 'NSE:TITAN', creator: 'user', text: 'hello' })
    ).not.toThrow();
  });
});

describe('thesis', () => {
  test('saveThesis writes current + appends history only on change', () => {
    db.saveThesis('NSE:TITAN', { pillars: ['jewellery'], creator: 'investment-thesis-engine' });
    db.saveThesis('NSE:TITAN', { pillars: ['jewellery'], creator: 'investment-thesis-engine' }); // no-op
    const hist = fs
      .readFileSync(path.join(tmpRoot, 'thesis-history.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(hist).toHaveLength(1);
    db.saveThesis('NSE:TITAN', {
      pillars: ['jewellery', 'watches'],
      creator: 'investment-thesis-engine',
    });
    const hist2 = fs
      .readFileSync(path.join(tmpRoot, 'thesis-history.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(hist2).toHaveLength(2);
  });
});

describe('companyContext', () => {
  test('bundles reports, events, notes with availableIds', () => {
    const { buildCompanyContext } = require('../lib/companyContext');
    db.appendEvents([mkEvent({ date: new Date().toISOString().slice(0, 10) })]);
    db.appendNote({ companyId: 'NSE:SWARAJENG', creator: 'user', text: 'watch order book' });
    db.saveReport({
      type: 'equity-research-deepdive',
      date: '2026-07-05',
      companyId: 'NSE:SWARAJENG',
      creator: 'equity-research-deepdive',
      summary: 'BUY',
      verdict: 'BUY',
      contextUsed: [],
    });
    const ctx = buildCompanyContext('NSE:SWARAJENG');
    expect(ctx.reports).toHaveLength(1);
    expect(ctx.events.length).toBeGreaterThanOrEqual(1);
    expect(ctx.notes).toHaveLength(1);
    expect(ctx.latestFullByType['equity-research-deepdive'].verdict).toBe('BUY');
    expect(ctx.availableIds.length).toBeGreaterThanOrEqual(3);
  });

  test('sanitizes a series-suffixed companyId so the bundle still resolves', () => {
    const { buildCompanyContext } = require('../lib/companyContext');
    db.saveReport({
      type: 'equity-research-deepdive',
      date: '2026-07-05',
      companyId: 'NSE:SWARAJENG',
      creator: 'equity-research-deepdive',
      summary: 'BUY',
      verdict: 'BUY',
      contextUsed: [],
    });
    // Called with the SUFFIXED id, as if a raw feed handed it straight in —
    // must still find the report saved under the clean id.
    const ctx = buildCompanyContext('NSE:SWARAJENG-BE');
    expect(ctx.companyId).toBe('NSE:SWARAJENG');
    expect(ctx.reports).toHaveLength(1);
  });
});
