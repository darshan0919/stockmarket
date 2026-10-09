'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let ledger;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sigledger-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  ledger = require('../lib/signalLedger');
});

afterEach(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const obs = (over = {}) => ({
  signalId: 'M4',
  entityType: 'market',
  entityId: 'NIFTY500',
  state: 'detected',
  evidence: { pct50: 18 },
  ...over,
});
const ctx = (date, over = {}) => ({ detector: 'market-regime-daily', date, ...over });

describe('db envelope for the new collection', () => {
  test('signal-ledger is a registered collection; same logical write twice => 1 record', () => {
    const rec = () => ({
      id: 'sig_global_market_X_M4',
      type: 'signal-state',
      creator: 'test',
      date: '2026-10-10',
    });
    db.upsertMany('signal-ledger', [rec()]);
    db.upsertMany('signal-ledger', [rec()]);
    expect(db.find('signal-ledger')).toHaveLength(1);
  });

  test('envelope enforced: record without creator is rejected', () => {
    expect(() => db.upsertMany('signal-ledger', [{ id: 'x', type: 'signal-state' }])).toThrow(
      /creator/
    );
  });
});

describe('applyObservations', () => {
  test('new observation creates state + one transition event', () => {
    const r = ledger.applyObservations([obs()], ctx('2026-10-09'));
    expect(r.states.inserted).toBe(1);
    expect(r.transitions).toEqual(['M4 market:NIFTY500 none -> detected']);
    const [s] = ledger.getStates();
    expect(s.state).toBe('detected');
    expect(s.since).toBe('2026-10-09');
    expect(db.find('events', { type: 'signal_transition' })).toHaveLength(1);
  });

  test('re-running the same date is idempotent (no change, no duplicate event)', () => {
    ledger.applyObservations([obs()], ctx('2026-10-09'));
    const r = ledger.applyObservations([obs()], ctx('2026-10-09'));
    expect(r.states.inserted).toBe(0);
    expect(r.states.updated).toBe(0);
    expect(r.transitions).toEqual([]);
    expect(db.find('events', { type: 'signal_transition' })).toHaveLength(1);
  });

  test('lifecycle advances and is recorded', () => {
    ledger.applyObservations([obs()], ctx('2026-10-09'));
    ledger.applyObservations([obs({ state: 'confirmed' })], ctx('2026-10-10'));
    const [s] = ledger.getStates();
    expect(s.state).toBe('confirmed');
    expect(s.since).toBe('2026-10-10');
    expect(s.firstSeen).toBe('2026-10-09');
  });

  test('not observed => invalidated after minMisses; idempotent same-day re-run does not double count', () => {
    ledger.applyObservations([obs()], ctx('2026-10-09'));
    const miss = obs({ state: null, minMisses: 2 });
    ledger.applyObservations([miss], ctx('2026-10-10'));
    ledger.applyObservations([miss], ctx('2026-10-10')); // same day again
    expect(ledger.getStates()[0].state).toBe('detected');
    ledger.applyObservations([miss], ctx('2026-10-11'));
    expect(ledger.getStates()[0].state).toBe('invalidated');
  });

  test('re-open after invalidation increments reopenCount', () => {
    ledger.applyObservations([obs()], ctx('2026-10-09'));
    ledger.applyObservations([obs({ state: null })], ctx('2026-10-10'));
    ledger.applyObservations([obs()], ctx('2026-10-11'));
    const [s] = ledger.getStates();
    expect(s.state).toBe('detected');
    expect(s.reopenCount).toBe(1);
  });

  test('stale (older) observation is ignored', () => {
    ledger.applyObservations([obs({ state: 'confirmed' })], ctx('2026-10-10'));
    ledger.applyObservations([obs({ state: 'detected' })], ctx('2026-10-09'));
    expect(ledger.getStates()[0].state).toBe('confirmed');
  });

  test('a signal owned by another detector cannot be overwritten', () => {
    ledger.applyObservations([obs()], ctx('2026-10-09'));
    expect(() =>
      ledger.applyObservations([obs()], ctx('2026-10-10', { detector: 'other-job' }))
    ).toThrow(/owned by market-regime-daily/);
  });

  test('scopes are independent keys (multi-user overlay)', () => {
    ledger.applyObservations([obs()], ctx('2026-10-09'));
    ledger.applyObservations([obs()], ctx('2026-10-09', { scope: 'user:u1', detector: 'u1-job' }));
    expect(ledger.getStates({ scope: 'global' })).toHaveLength(1);
    expect(ledger.getStates({ scope: 'user:u1' })).toHaveLength(1);
  });

  test('company entity sets companyId and sanitizes series suffix in events', () => {
    ledger.applyObservations(
      [
        obs({
          signalId: 'E1',
          entityType: 'company',
          entityId: 'NSE:ABC-BE',
          state: 'entry-ready',
        }),
      ],
      ctx('2026-10-09', { detector: 'technical-setups' })
    );
    expect(ledger.getStates({ entityType: 'company' })[0].state).toBe('entry-ready');
    expect(db.find('events', { companyId: 'NSE:ABC', type: 'signal_transition' })).toHaveLength(1);
  });

  test('invalid state and entityType throw', () => {
    expect(() => ledger.applyObservations([obs({ state: 'bogus' })], ctx('2026-10-09'))).toThrow(
      /invalid state/
    );
    expect(() => ledger.ledgerKey({ signalId: 'M4', entityType: 'x', entityId: 'a' })).toThrow(
      /entityType/
    );
  });
});
