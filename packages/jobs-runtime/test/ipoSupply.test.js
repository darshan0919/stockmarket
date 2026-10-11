'use strict';
const S = require('../lib/ipoSupply');

describe('ipoReview (P3)', () => {
  const base = { today: '2026-10-11', offerPrice: 100, close: 90, ipoPe: 30, pe: 40, patYoY: 25 };
  test('15 months, cooled, growing, sane PE -> confirmed', () =>
    expect(S.ipoReview({ ...base, listingDate: '2025-07-10' }).state).toBe('confirmed'));
  test('15 months, above offer -> detected only', () =>
    expect(S.ipoReview({ ...base, close: 150, listingDate: '2025-07-10' }).state).toBe('detected'));
  test('loss-making at IPO blocks confirmation', () => {
    const r = S.ipoReview({ ...base, ipoPe: null, listingDate: '2025-07-10' });
    expect(r.state).toBe('detected');
    expect(r.evidence.flags).toContain('LOSS_MAKING_AT_IPO');
  });
  test('under 12 months -> null', () => expect(S.ipoReview({ ...base, listingDate: '2026-03-01' }).state).toBeNull());
  test('20 months needs cooled+growing', () => {
    expect(S.ipoReview({ ...base, listingDate: '2025-02-01' }).state).toBe('detected');
    expect(S.ipoReview({ ...base, close: 150, listingDate: '2025-02-01' }).state).toBeNull();
  });
  test('over 24 months -> null', () => expect(S.ipoReview({ ...base, listingDate: '2024-06-01' }).state).toBeNull());
  test('IPO PE as string from IPOPlatform', () =>
    expect(S.ipoReview({ ...base, ipoPe: '23.26', listingDate: '2025-07-10' }).evidence.ipoPe).toBe(23.26));
});

describe('lockInExpiry (P4)', () => {
  test('30-day anchor expiry in 3 days -> detected', () => {
    const r = S.lockInExpiry({ listingDate: '2026-09-14', today: '2026-10-11', issueSizeCr: 300 });
    expect(r.state).toBe('detected');
    expect(r.evidence.event).toBe('ANCHOR_50PCT_30D');
  });
  test('big issue -> confirmed', () =>
    expect(S.lockInExpiry({ listingDate: '2026-09-14', today: '2026-10-11', issueSizeCr: 5000 }).state).toBe('confirmed'));
  test('6-month event', () =>
    expect(S.lockInExpiry({ listingDate: '2026-04-12', today: '2026-10-11' }).evidence.event).toBe('PRE_IPO_HOLDERS_6M'));
  test('nothing near -> null', () => expect(S.lockInExpiry({ listingDate: '2026-07-01', today: '2026-10-11' }).state).toBeNull());
});

describe('OFS (P5)', () => {
  test('promoter OFS', () =>
    expect(S.ofsKind({ title: 'Promoter to sell shares via Offer for Sale (OFS) on exchange' })).toBe('PROMOTER_OFS'));
  test('plain OFS', () => expect(S.ofsKind({ title: 'OFS opens for non-retail investors' })).toBe('OFS'));
  test('IPO RHP noise ignored', () =>
    expect(S.ofsKind({ title: 'Red Herring Prospectus for IPO including offer for sale' })).toBeNull());
  test('PE gate', () => {
    expect(S.ofsState('OFS', 60)).toBe('confirmed');
    expect(S.ofsState('OFS', 20)).toBe('detected');
    expect(S.ofsState(null, 60)).toBeNull();
  });
});
