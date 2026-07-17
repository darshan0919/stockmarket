'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot, db, rev;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2rev-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  rev = require('../scripts/reviewInsights');
});
afterEach(() => { delete process.env.DATA_V2_DIR; fs.rmSync(tmpRoot, { recursive: true, force: true }); });

function seed() {
  db.appendNotes([
    { creator: 'conversation-capture', type: 'chat-insight', companyId: 'NSE:X', date: '2026-07-01', text: 'a' },
    { creator: 'conversation-capture', type: 'feedback', companyId: 'NSE:X', date: '2026-07-01', text: 'prefer concise' },
  ]);
  db.saveReport({ creator: 'conversation-capture', type: 'framework', date: '2026-07-01', companyIds: [], summary: 'pref issue mechanics' });
  db.savePrompts([
    { creator: 'conversation-capture', date: '2026-07-01', intent: 'company-report', linkedSkill: 'stock-report', title: 'A', text: 'x1' },
    { creator: 'conversation-capture', date: '2026-07-01', intent: 'company-report', linkedSkill: 'stock-report', title: 'B', text: 'x2' },
  ]);
}

describe('reviewInsights', () => {
  test('delta covers everything when ledger empty', () => {
    seed();
    const p = rev.buildPacket();
    expect(p.counts.delta.notes).toBe(2);
    expect(p.counts.delta.prompts).toBe(2);
    expect(p.counts.delta.reports).toBe(1);
  });

  test('signals surface feedback, frameworks and prompt clusters', () => {
    seed();
    const p = rev.buildPacket();
    expect(p.signals.feedbackNotes.length).toBe(1);
    expect(p.signals.frameworkItems.length).toBe(1);
    // two prompts, same intent+skill ⇒ one cluster of size 2 (merge candidate)
    expect(p.signals.promptClusters.length).toBe(1);
    expect(p.signals.promptClusters[0].length).toBe(2);
    expect(p.signals.intentHistogram['company-report']).toBe(2);
  });

  test('heavy-company consolidation candidate above threshold', () => {
    const many = [];
    for (let i = 0; i < rev.HEAVY_COMPANY_NOTES + 1; i++) many.push({ creator: 'c', type: 'chat-insight', companyId: 'NSE:HEAVY', date: '2026-07-01', text: 'n' + i });
    db.appendNotes(many);
    const p = rev.buildPacket();
    expect(p.signals.heavyCompanies.some((h) => h.companyId === 'NSE:HEAVY')).toBe(true);
  });

  test('--commit advances the ledger so the next delta is empty', () => {
    seed();
    const l0 = rev.loadLedger();
    expect(rev.buildPacket().counts.delta.notes).toBe(2);
    // simulate commit
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(tmpRoot, '_meta', 'review-ledger.json'), JSON.stringify({ lastReviewAt: now, reviews: [] }));
    jest.resetModules();
    rev = require('../scripts/reviewInsights');
    const p2 = rev.buildPacket();
    expect(p2.counts.delta.notes).toBe(0); // all seeded before `now`
  });
});
