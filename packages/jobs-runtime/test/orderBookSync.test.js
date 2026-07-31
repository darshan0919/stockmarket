'use strict';

/**
 * Unit tests for the order-book ledger aggregation and the Radar sync job.
 *
 * @file packages/jobs-runtime/test/orderBookSync.test.js
 * @see docs/ORDER_BOOK_EXTRACTION.md
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_V2_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'obsync-'));

const ledger = require('../lib/orderBookLedger');
const { companyIdsFromTable, mapLimit } = require('../orderBookSync');

const BASE = {
  valueCr: 1000,
  unit: 'cr',
  sourceType: 'concall',
  sourceQuarter: '202603',
  sourceQuarterEndDate: '2026-03-31',
  label: 'Order Book',
};

describe('orderBookLedger — cumulative arithmetic', () => {
  test('cumulative is base plus applied deltas', () => {
    ledger.setBase('NSE:TEST1', BASE);
    ledger.applyAnnouncement('NSE:TEST1', {
      ssUrl: 'a.pdf',
      date: '2026-04-10',
      deltaCr: 250,
      title: 'Order A',
    });
    ledger.applyAnnouncement('NSE:TEST1', {
      ssUrl: 'b.pdf',
      date: '2026-05-10',
      deltaCr: 100.5,
      title: 'Order B',
    });
    expect(ledger.get('NSE:TEST1').cumulative.valueCr).toBe(1350.5);
  });

  test('re-applying the same filing is a no-op', () => {
    ledger.setBase('NSE:TEST2', BASE);
    const entry = { ssUrl: 'dup.pdf', date: '2026-04-10', deltaCr: 500, title: 'Order' };
    ledger.applyAnnouncement('NSE:TEST2', entry);
    ledger.applyAnnouncement('NSE:TEST2', entry);
    const l = ledger.get('NSE:TEST2');
    expect(l.announcementsApplied).toHaveLength(1);
    expect(l.cumulative.valueCr).toBe(1500);
  });

  test('a new base resets applied announcements, since it already reflects them', () => {
    ledger.setBase('NSE:TEST3', BASE);
    ledger.applyAnnouncement('NSE:TEST3', {
      ssUrl: 'x.pdf',
      date: '2026-04-10',
      deltaCr: 400,
      title: 'Order',
    });
    expect(ledger.get('NSE:TEST3').cumulative.valueCr).toBe(1400);

    ledger.setBase('NSE:TEST3', {
      ...BASE,
      valueCr: 1600,
      sourceQuarter: '202606',
      sourceQuarterEndDate: '2026-06-30',
    });
    const l = ledger.get('NSE:TEST3');
    expect(l.announcementsApplied).toHaveLength(0);
    expect(l.cumulative.valueCr).toBe(1600); // not 2000 — no double count
  });
});

describe('orderBookLedger — quantity buckets', () => {
  test('sums per unit and never across units', () => {
    ledger.setBase('NSE:TEST4', BASE);
    ledger.applyAnnouncement('NSE:TEST4', {
      ssUrl: 'q1.pdf',
      date: '2026-04-10',
      deltaCr: 100,
      title: 'A',
      quantities: [
        { unit: 'MW', value: 50 },
        { unit: 'Km', value: 20 },
      ],
    });
    ledger.applyAnnouncement('NSE:TEST4', {
      ssUrl: 'q2.pdf',
      date: '2026-04-20',
      deltaCr: 100,
      title: 'B',
      quantities: [{ unit: 'MW', value: 25 }],
    });
    const q = ledger.get('NSE:TEST4').cumulative.quantities;
    expect(q).toEqual([
      { unit: 'Km', value: 20 },
      { unit: 'MW', value: 75 },
    ]);
  });

  test('folds case variants of the same unit into one bucket', () => {
    ledger.setBase('NSE:TEST5', BASE);
    ledger.applyAnnouncement('NSE:TEST5', {
      ssUrl: 'k1.pdf',
      date: '2026-04-10',
      deltaCr: 10,
      title: 'A',
      quantities: [{ unit: 'km', value: 40 }],
    });
    ledger.applyAnnouncement('NSE:TEST5', {
      ssUrl: 'k2.pdf',
      date: '2026-04-11',
      deltaCr: 10,
      title: 'B',
      quantities: [{ unit: 'Km', value: 60 }],
    });
    expect(ledger.get('NSE:TEST5').cumulative.quantities).toEqual([{ unit: 'Km', value: 100 }]);
  });
});

describe('orderBookLedger — execution window', () => {
  test('spans earliest start to latest end and reports coverage', () => {
    ledger.setBase('NSE:TEST6', BASE);
    ledger.applyAnnouncement('NSE:TEST6', {
      ssUrl: 't1.pdf',
      date: '2026-04-10',
      deltaCr: 100,
      title: 'A',
      timeline: { startDate: '2026-04-10', endDate: '2028-04-10', durationMonths: 24 },
    });
    ledger.applyAnnouncement('NSE:TEST6', {
      ssUrl: 't2.pdf',
      date: '2026-05-10',
      deltaCr: 100,
      title: 'B',
      timeline: { startDate: '2026-05-10', endDate: '2029-11-10', durationMonths: 42 },
    });
    ledger.applyAnnouncement('NSE:TEST6', {
      ssUrl: 't3.pdf',
      date: '2026-06-10',
      deltaCr: 100,
      title: 'C (no timeline stated)',
    });
    expect(ledger.get('NSE:TEST6').cumulative.executionWindow).toEqual({
      earliestStart: '2026-04-10',
      latestEnd: '2029-11-10',
      withTimeline: 2,
      withoutTimeline: 1,
    });
  });

  test('is null when no filing stated a timeline', () => {
    ledger.setBase('NSE:TEST7', BASE);
    ledger.applyAnnouncement('NSE:TEST7', {
      ssUrl: 'n1.pdf',
      date: '2026-04-10',
      deltaCr: 100,
      title: 'A',
    });
    expect(ledger.get('NSE:TEST7').cumulative.executionWindow).toBeNull();
  });
});

describe('orderBookLedger — band-only wins', () => {
  const band = (over) => ({
    band: 'Large',
    jurisdiction: 'domestic',
    currency: 'INR',
    lowCr: 250,
    highCr: 600,
    text: 'Large — INR 250 to 600 Cr',
    ...over,
  });

  test('widens the range but never the firm total', () => {
    ledger.setBase('NSE:TEST8', BASE); // base 1000
    ledger.applyAnnouncement('NSE:TEST8', {
      ssUrl: 'v1.pdf',
      date: '2026-04-10',
      deltaCr: 100,
      title: 'stated value',
    });
    ledger.applyAnnouncement('NSE:TEST8', {
      ssUrl: 'b1.pdf',
      date: '2026-04-11',
      deltaCr: 0,
      title: 'band only',
      valueBand: band(),
    });
    const c = ledger.get('NSE:TEST8').cumulative;
    expect(c.valueCr).toBe(1100);
    expect(c.rangeLowCr).toBe(1350);
    expect(c.rangeHighCr).toBe(1700);
    expect(c.bandOnlyCount).toBe(1);
  });

  // "Above 1,000" has no ceiling, so the total can't be given one either.
  test('leaves the range open-ended when a band has no ceiling', () => {
    ledger.setBase('NSE:TEST9', BASE);
    ledger.applyAnnouncement('NSE:TEST9', {
      ssUrl: 'b2.pdf',
      date: '2026-04-10',
      deltaCr: 0,
      title: 'mega',
      valueBand: band({ band: 'Mega', lowCr: 1000, highCr: null }),
    });
    const c = ledger.get('NSE:TEST9').cumulative;
    expect(c.rangeLowCr).toBe(2000);
    expect(c.rangeHighCr).toBeNull();
  });

  test('keeps a foreign-currency band out of the rupee range', () => {
    ledger.setBase('NSE:TEST10', BASE);
    ledger.applyAnnouncement('NSE:TEST10', {
      ssUrl: 'b3.pdf',
      date: '2026-04-10',
      deltaCr: 0,
      title: 'usd',
      valueBand: band({
        jurisdiction: 'international',
        currency: 'USD',
        lowCr: null,
        highCr: null,
        text: 'Large — USD 30 to 75 mn',
      }),
    });
    const c = ledger.get('NSE:TEST10').cumulative;
    expect(c.rangeLowCr).toBe(1000);
    expect(c.rangeHighCr).toBe(1000);
    expect(c.bandOnlyCount).toBe(0);
    expect(c.foreignBands).toEqual([
      { date: '2026-04-10', band: 'Large — USD 30 to 75 mn', currency: 'USD' },
    ]);
  });
});

describe('orderBookSync helpers', () => {
  test('companyIdsFromTable reads the companyId column', () => {
    const table = [
      ['name', 'companyId', 'price'],
      ['Rail Vikas', 'NSE:RVNL', '400'],
      ['NCC', 'NSE:NCC', '250'],
    ];
    expect(companyIdsFromTable(table)).toEqual(['NSE:RVNL', 'NSE:NCC']);
  });

  test('companyIdsFromTable tolerates an empty or headerless table', () => {
    expect(companyIdsFromTable([])).toEqual([]);
    expect(companyIdsFromTable([['name']])).toEqual([]);
    expect(companyIdsFromTable([['name'], ['x']])).toEqual([]);
  });

  test('mapLimit preserves order while capping concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = await mapLimit(items, 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
    expect(peak).toBeLessThanOrEqual(3);
  });
});
