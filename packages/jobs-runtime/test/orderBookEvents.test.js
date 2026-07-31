'use strict';

/**
 * Unit tests for the order-book database write path (events collection,
 * types `order-win` and `order-book-declared`).
 *
 * @file packages/jobs-runtime/test/orderBookEvents.test.js
 * @see docs/DATA_RULES.md for the envelope and collection rules
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_V2_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'obevents-'));

const obEvents = require('../lib/orderBookEvents');
const db = require('../lib/db');

const WIN = {
  ssUrl: 'abc123.pdf',
  date: '2026-06-20',
  valueCr: 2977,
  deltaCr: 2977,
  quantities: [{ unit: 'MTPA', value: 10 }],
  timeline: { startDate: '2026-06-20', endDate: '2029-12-20', durationMonths: 42 },
  confidence: 'high',
  source: 'pdf',
  title: 'Award of Order',
};

const BASE = {
  valueCr: 99262,
  unit: 'cr',
  sourceQuarter: '202603',
  sourceQuarterEndDate: '2026-03-31',
  label: 'Order Book',
  sourceType: 'concall',
};

describe('saveOrderWins', () => {
  test('writes a record carrying the full envelope', () => {
    const stats = obEvents.saveOrderWins('NSE:AAA', [WIN]);
    expect(stats.inserted).toBe(1);

    const [rec] = obEvents.findOrderWins('NSE:AAA');
    expect(rec.type).toBe('order-win');
    expect(rec.companyId).toBe('NSE:AAA');
    expect(rec.date).toBe('2026-06-20');
    expect(rec.creator).toBe('order-book-tracker');
    expect(rec.creationTime).toBeTruthy();
    expect(rec.modifiedTime).toBeTruthy();
    expect(rec.valueCr).toBe(2977);
    expect(rec.quantities).toEqual([{ unit: 'MTPA', value: 10 }]);
    expect(rec.executionTimeline.endDate).toBe('2029-12-20');
  });

  test('re-saving the same filing does not duplicate it', () => {
    obEvents.saveOrderWins('NSE:BBB', [WIN]);
    const second = obEvents.saveOrderWins('NSE:BBB', [WIN]);
    expect(second.inserted).toBe(0);
    expect(obEvents.findOrderWins('NSE:BBB')).toHaveLength(1);
  });

  test('a corrected value updates the existing record in place', () => {
    obEvents.saveOrderWins('NSE:CCC', [WIN]);
    const stats = obEvents.saveOrderWins('NSE:CCC', [{ ...WIN, valueCr: 3000 }]);
    expect(stats.updated).toBe(1);
    const wins = obEvents.findOrderWins('NSE:CCC');
    expect(wins).toHaveLength(1);
    expect(wins[0].valueCr).toBe(3000);
  });

  test('two filings on the same date stay distinct', () => {
    obEvents.saveOrderWins('NSE:DDD', [WIN, { ...WIN, ssUrl: 'other.pdf', valueCr: 500 }]);
    expect(obEvents.findOrderWins('NSE:DDD')).toHaveLength(2);
  });

  test('links the events onto the company record', () => {
    obEvents.saveOrderWins('NSE:EEE', [WIN]);
    const company = db.get('companies', 'NSE:EEE');
    expect(company.links.events.length).toBeGreaterThan(0);
  });

  test('falls back to the ledger deltaCr when valueCr is absent', () => {
    // The ledger's applied-announcement entries only carry deltaCr; reading
    // valueCr alone wrote every event as "₹undefined Cr".
    const { valueCr, ...ledgerShaped } = WIN;
    obEvents.saveOrderWins('NSE:GGG', [ledgerShaped]);
    const [rec] = obEvents.findOrderWins('NSE:GGG');
    expect(rec.valueCr).toBe(2977);
    expect(rec.summary).toContain('₹2977 Cr');
  });

  test('records a value-less filing without inventing a figure', () => {
    obEvents.saveOrderWins('NSE:HHH', [
      { ...WIN, valueCr: null, deltaCr: null, valueBand: 'Large (₹250-600 Cr)' },
    ]);
    const [rec] = obEvents.findOrderWins('NSE:HHH');
    expect(rec.valueCr).toBeNull();
    expect(rec.valueBand).toBe('Large (₹250-600 Cr)');
    expect(rec.summary).toContain('value not disclosed');
  });
});

describe('retractOrderWin', () => {
  test('hides a misclassified win from reads without deleting it', () => {
    obEvents.saveOrderWins('NSE:III', [WIN]);
    expect(obEvents.findOrderWins('NSE:III')).toHaveLength(1);

    obEvents.retractOrderWin('NSE:III', WIN, 'GST demand order, not a commercial win');

    expect(obEvents.findOrderWins('NSE:III')).toHaveLength(0);
    const [rec] = obEvents.findOrderWins('NSE:III', { includeRetracted: true });
    expect(rec.retracted).toBe(true);
    expect(rec.retractionReason).toMatch(/GST/);
  });
});

describe('saveDeclaredOrderBook', () => {
  test('records the concall figure against the quarter-end date', () => {
    obEvents.saveDeclaredOrderBook('NSE:FFF', BASE);
    const [rec] = obEvents.findDeclaredOrderBooks('NSE:FFF');
    expect(rec.type).toBe('order-book-declared');
    expect(rec.date).toBe('2026-03-31');
    expect(rec.valueCr).toBe(99262);
    expect(rec.sourceQuarter).toBe('202603');
  });

  test('is idempotent across re-runs of the same quarter', () => {
    obEvents.saveDeclaredOrderBook('NSE:GGG', BASE);
    const again = obEvents.saveDeclaredOrderBook('NSE:GGG', BASE);
    expect(again.inserted).toBe(0);
    expect(obEvents.findDeclaredOrderBooks('NSE:GGG')).toHaveLength(1);
  });

  test('a new quarter is a separate record, not an overwrite', () => {
    obEvents.saveDeclaredOrderBook('NSE:HHH', BASE);
    obEvents.saveDeclaredOrderBook('NSE:HHH', {
      ...BASE,
      valueCr: 105000,
      sourceQuarter: '202606',
      sourceQuarterEndDate: '2026-06-30',
    });
    const recs = obEvents.findDeclaredOrderBooks('NSE:HHH');
    expect(recs).toHaveLength(2);
    expect(recs[0].sourceQuarter).toBe('202606'); // newest first
  });

  test('ignores a base with no usable value', () => {
    expect(obEvents.saveDeclaredOrderBook('NSE:III', null).inserted).toBe(0);
    expect(obEvents.saveDeclaredOrderBook('NSE:III', { valueCr: null }).inserted).toBe(0);
  });
});

describe('winSummary', () => {
  test('mentions units and execution date when present', () => {
    const s = obEvents.winSummary({ ...WIN, companyId: 'NSE:AAA' });
    expect(s).toContain('₹2977 Cr');
    expect(s).toContain('10 MTPA');
    expect(s).toContain('2029-12-20');
  });

  test('marks a period aggregate so it is not read as a single order', () => {
    const s = obEvents.winSummary({ ...WIN, companyId: 'NSE:AAA', isAggregate: true });
    expect(s).toContain('period aggregate');
  });
});
