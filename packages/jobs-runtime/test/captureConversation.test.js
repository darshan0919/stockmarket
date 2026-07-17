'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot, db, cap, tr;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cap-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  cap = require('../scripts/captureConversation');
  tr = require('../lib/coworkTranscript');
});
afterEach(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const NOW = '2026-07-16T10:00:00.000Z';

// minimal Claude-Code jsonl transcript
const JSONL = [
  JSON.stringify({ type: 'user', timestamp: '2026-07-08T09:00:00Z', message: { role: 'user', content: 'Analyze NSE:SWARAJENG equity thesis — margins, capex, dividend' } }),
  JSON.stringify({ type: 'assistant', timestamp: '2026-07-08T09:01:00Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'consider order book' }, { type: 'text', text: 'The stock looks strong on valuation and sector tailwinds.' }] } }),
  JSON.stringify({ type: 'user', timestamp: '2026-07-08T09:02:00Z', message: { role: 'user', content: '<scheduled-task name="x">noise</scheduled-task>' } }),
  JSON.stringify({ type: 'attachment', attachment: { file_name: 'concall.pdf', file_type: 'pdf' } }),
].join('\n');

describe('coworkTranscript.parseTranscript', () => {
  test('keeps user+assistant turns, drops scheduled-task noise, captures attachment', () => {
    const conv = tr.parseTranscript(JSONL, { sessionId: 'sess1234', title: 'Swaraj Engines' });
    const roles = conv.chat_messages.map((m) => m.sender);
    expect(roles).toEqual(['human', 'assistant']); // scheduled-task user turn dropped
    expect(conv.chat_messages[1].content[0]).toEqual({ type: 'thinking', thinking: 'consider order book' });
    const withAtt = conv.chat_messages.find((m) => m.attachments);
    expect(withAtt.attachments[0].file_name).toBe('concall.pdf');
  });
});

describe('captureConversation.captureOne', () => {
  const cloudConv = () => ({
    uuid: 'cloud-abcd1234', name: 'Swaraj Engines', created_at: '2026-07-08T00:00:00Z',
    chat_messages: [
      { sender: 'human', text: 'NSE:SWARAJENG equity thesis on margin, capex, dividend, valuation' },
      { sender: 'assistant', text: 'Strong sector, good order book.' },
    ],
  });

  test('saves stock conversation raw-first, links company, dedups on re-run', () => {
    const c = () => require('../scripts/captureConversation'); // fresh ref
    const r1 = cap.captureOne(cloudConv(), { source: 'cloud', now: NOW });
    expect(r1.status).toBe('saved');
    expect(r1.companyIds).toContain('NSE:SWARAJENG');
    const idx = db.find('conversations', { companyId: 'NSE:SWARAJENG' });
    expect(idx).toHaveLength(1);
    // re-run same conv → upsert, still one
    cap.captureOne(cloudConv(), { source: 'cloud', now: NOW });
    expect(db.find('conversations', { companyId: 'NSE:SWARAJENG' })).toHaveLength(1);
    expect(db.get('companies', 'NSE:SWARAJENG').links.conversations).toHaveLength(1);
  });

  test('non-stock conversation skipped, nothing stored', () => {
    const r = cap.captureOne({ uuid: 'x1', name: 'Drafting a pitch', chat_messages: [{ sender: 'human', text: 'help me write a friendly cover letter' }] }, { source: 'cloud', now: NOW });
    expect(r.status).toBe('skipped-nonstock');
    expect(db.find('conversations', {})).toHaveLength(0);
  });

  test('sensitive/personal (PAN + ITR) skipped even if it mentions stocks', () => {
    const conv = {
      uuid: 'itr1', name: 'ITR tax filing',
      chat_messages: [{ sender: 'human', text: 'my equity capital gains, PAN ABCDE1234F, stock tax report' }],
    };
    const r = cap.captureOne(conv, { source: 'cloud', now: NOW });
    expect(r.status).toBe('skipped-sensitive');
    expect(db.find('conversations', {})).toHaveLength(0);
  });

  test('precomputed extract sidecar fans out notes + reports', () => {
    const sidecar = {
      notes: [{ type: 'chat-insight', companyId: 'NSE:SWARAJENG', date: '2026-07-08', text: 'margin expanding' }],
      reports: [{ type: 'chat-analysis', companyId: 'NSE:SWARAJENG', date: '2026-07-08', summary: 'BUY case' }],
    };
    const r = cap.captureOne(cloudConv(), { source: 'cloud', now: NOW, extract: sidecar });
    expect(r.notes).toBe(1);
    expect(r.reports).toBe(1);
    expect(db.find('notes', { companyId: 'NSE:SWARAJENG', type: 'chat-insight' })).toHaveLength(1);
    expect(db.find('reports', { companyId: 'NSE:SWARAJENG', type: 'chat-analysis' })).toHaveLength(1);
  });

  test('dry-run computes but stores nothing', () => {
    const r = cap.captureOne(cloudConv(), { source: 'cloud', now: NOW, dryRun: true });
    expect(r.status).toBe('would-save');
    expect(db.find('conversations', {})).toHaveLength(0);
  });
});

describe('captureConversation end-to-end via parsed transcript', () => {
  test('parsed cowork transcript → captured as stock conversation', () => {
    const conv = tr.parseTranscript(JSONL, { sessionId: 'sess1234' });
    const r = cap.captureOne(conv, { source: 'cowork', now: NOW });
    expect(r.status).toBe('saved');
    expect(r.id).toMatch(/^conv_cowork_/);
    expect(db.readConversation(r.id).turns.length).toBeGreaterThanOrEqual(2);
  });
});
