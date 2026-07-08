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
      type: 'concall-analysis', date: '2026-07-01', companyId: 'NSE:SWARAJENG',
      creator: 'concall-analysis', summary: 'Strong quarter', sections: { tone: 'positive' },
      contextUsed: [],
    });
    expect(db.readReport(id).sections.tone).toBe('positive');
    const idx = db.get('reports', id);
    expect(idx.body).toBe(`reports/${id}.json`);
    expect(idx.sections).toBeUndefined(); // index is slim
    expect(db.get('companies', 'NSE:SWARAJENG').links.reports).toContain(id);
  });
});

describe('find', () => {
  test('filters by companyId including companyIds[] and date/type/since', () => {
    db.appendEvents([
      mkEvent(),
      mkEvent({ type: 'deal', companyId: undefined, companyIds: ['NSE:SWARAJENG', 'NSE:TITAN'], summary: 'block deal' }),
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
    const hist = fs.readFileSync(path.join(tmpRoot, 'thesis-history.jsonl'), 'utf8').trim().split('\n');
    expect(hist).toHaveLength(1);
    db.saveThesis('NSE:TITAN', { pillars: ['jewellery', 'watches'], creator: 'investment-thesis-engine' });
    const hist2 = fs.readFileSync(path.join(tmpRoot, 'thesis-history.jsonl'), 'utf8').trim().split('\n');
    expect(hist2).toHaveLength(2);
  });
});

describe('companyContext', () => {
  test('bundles reports, events, notes with availableIds', () => {
    const { buildCompanyContext } = require('../lib/companyContext');
    db.appendEvents([mkEvent({ date: new Date().toISOString().slice(0, 10) })]);
    db.appendNote({ companyId: 'NSE:SWARAJENG', creator: 'user', text: 'watch order book' });
    db.saveReport({
      type: 'equity-research-deepdive', date: '2026-07-05', companyId: 'NSE:SWARAJENG',
      creator: 'equity-research-deepdive', summary: 'BUY', verdict: 'BUY', contextUsed: [],
    });
    const ctx = buildCompanyContext('NSE:SWARAJENG');
    expect(ctx.reports).toHaveLength(1);
    expect(ctx.events.length).toBeGreaterThanOrEqual(1);
    expect(ctx.notes).toHaveLength(1);
    expect(ctx.latestFullByType['equity-research-deepdive'].verdict).toBe('BUY');
    expect(ctx.availableIds.length).toBeGreaterThanOrEqual(3);
  });
});
