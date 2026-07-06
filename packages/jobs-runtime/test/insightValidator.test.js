'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-'));
process.env.WI_NOTES_DIR = path.join(TMP, 'notes');
process.env.WI_VALIDATION_DIR = path.join(TMP, 'validation');
process.env.IV_CACHE_DIR = path.join(TMP, 'cache');

jest.mock('@stock/api', () => ({
  nse: { getDeliveryBhavcopy: jest.fn() },
  stockscans: { watchlistTable: jest.fn(), runScan: jest.fn() },
}));

const v = require('../insightValidator');

describe('toSymbol', () => {
  test('NSE → symbol; BSE/other → null', () => {
    expect(v.toSymbol('NSE:SIS')).toBe('SIS');
    expect(v.toSymbol('BSE:500325')).toBeNull();
    expect(v.toSymbol('PLAIN')).toBe('PLAIN');
  });
});

describe('parseDelivery', () => {
  test('keeps equity series, computes return, skips others', () => {
    const csv = [
      'SYMBOL, SERIES, PREV_CLOSE, CLOSE_PRICE, TTL_TRD_QNTY, DELIV_QTY, DELIV_PER, TURNOVER_LACS, NO_OF_TRADES',
      'ABC, EQ, 100, 110, 50000, 30000, 60, 550, 1200',
      'XYZ, GB, 100, 105, 1000, 500, 50, 10, 50',
    ].join('\n');
    const out = v.parseDelivery(csv);
    expect(Object.keys(out)).toEqual(['ABC']);
    expect(out.ABC.ret).toBeCloseTo(10, 6);
    expect(out.ABC.deliv_per).toBe(60);
  });
});

describe('structuralSignal labels', () => {
  const base = { avg_trd: 10000, avg_dq: 6000, avg_dper: 50, days: 20 };
  test('STRONG: big move + liquid + vol≥2 + delivery confirmed', () => {
    const day = { ret: 3, deliv_per: 60, trd_qty: 25000, deliv_qty: 15000, turnover: 500 };
    expect(v.structuralSignal(day, base).label).toBe('STRONG');
  });
  test('NOISE: big move but low delivery + no volume', () => {
    const day = { ret: 3, deliv_per: 30, trd_qty: 10000, deliv_qty: 3000, turnover: 500 };
    expect(v.structuralSignal(day, base).label).toBe('NOISE');
  });
  test('WEAK: tiny move', () => {
    const day = { ret: 0.5, deliv_per: 60, trd_qty: 25000, deliv_qty: 15000, turnover: 500 };
    expect(v.structuralSignal(day, base).label).toBe('WEAK');
  });
});

describe('verdict matrix', () => {
  test.each([
    ['high', 'STRONG', 'confirmed'],
    ['high', 'WEAK', 'overrated'],
    ['high', 'NOISE', 'noise_move'],
    ['medium', 'MODERATE', 'confirmed'],
    ['medium', 'WEAK', 'soft'],
    ['low', 'STRONG', 'underrated'],
    ['low', 'WEAK', 'confirmed'],
  ])('%s + %s → %s', (sig, label, expected) => {
    expect(v.verdict(sig, label)).toBe(expected);
  });
});

describe('sectorAttribution', () => {
  const ctx = {
    market_median_1d: 0.2,
    industry: { Tech: { median: 3.0, n: 10 } },
    sector: {},
    companies: { 'NSE:A': { industry: 'Tech', sector: 'IT' } },
  };
  test('sector-driven when move ≈ a big industry move', () => {
    expect(v.sectorAttribution(3.2, 'NSE:A', ctx).label).toBe('sector-driven');
  });
  test('against-sector when fighting a big industry move', () => {
    expect(v.sectorAttribution(-2, 'NSE:A', ctx).label).toBe('against-sector');
  });
  test('no_context with empty ctx', () => {
    expect(v.sectorAttribution(5, 'NSE:A', {}).label).toBe('no_context');
  });
});

describe('recentTradingDays', () => {
  test('returns only weekdays strictly before end', () => {
    const end = new Date(Date.UTC(2026, 5, 29)); // Monday
    const days = v.recentTradingDays(end, 3);
    for (const d of days) {
      expect(d.getUTCDay()).not.toBe(0);
      expect(d.getUTCDay()).not.toBe(6);
      expect(d.getTime()).toBeLessThan(end.getTime());
    }
    expect(days[0].toISOString().slice(0, 10)).toBe('2026-06-26'); // prior Friday
  });
});

describe('categoryFromTags', () => {
  test('maps tag sets to categories; fallback general', () => {
    expect(v.categoryFromTags(['sast'])).toBe('shareholding_change');
    expect(v.categoryFromTags(['order_win'])).toBe('order_book');
    expect(v.categoryFromTags(['nothing'])).toBe('general');
  });
});

describe('makeProposals', () => {
  test('proposes tightening when over-rated ratio high', () => {
    const led = { byCategory: { order_book: { samples: 8, overrated: 5, underrated: 0, noise_move: 0, confirmed: 3, soft: 0, sector_driven: 0, against_sector: 0 } } };
    const props = v.makeProposals(led);
    expect(props.join('\n')).toMatch(/over-rated/);
  });
  test('placeholder when under min samples', () => {
    const led = { byCategory: { order_book: { samples: 2, overrated: 2, confirmed: 0, underrated: 0, noise_move: 0 } } };
    expect(v.makeProposals(led)[0]).toMatch(/Not enough/);
  });
});

describe('titleInfoDensity', () => {
  test('RICH/WEAK/OK', () => {
    expect(v.titleInfoDensity('Bagged ₹500 Cr order from NHAI for road project')).toBe('RICH');
    expect(v.titleInfoDensity('Company Update')).toBe('WEAK');
    expect(v.titleInfoDensity('Board approves new subsidiary in Germany')).toBe('OK');
  });
});

describe('quality review', () => {
  const notes = {
    companies: {
      'NSE:A': { name: 'Alpha', notes: [
        { type: 'announcement', significance: 'high', announcementTitle: 'Disclosure', insight: 'the company announced that the exchange has received a disclosure', tags: ['sast'], category: 'order_book' },
      ] },
    },
  };
  test('flags generic body + weak title + category mismatch', () => {
    const iq = v.qualityReviewInsights(notes);
    expect(iq.total).toBe(1);
    const cr = v.qualityReviewCategorisation(notes);
    // stored 'order_book' vs tags→'shareholding_change' (sast) = mismatch
    expect(cr.mismatches.length).toBe(1);
  });
});
