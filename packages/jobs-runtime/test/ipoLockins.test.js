'use strict';
const L = require('../lib/ipoLockins');
const t = require('../lib/thesisCardEmail');
const store = require('../lib/ipoLockinStore');

// Kanohar Electricals RHP (pp.128-131) + allotment 2026-09-11.
const KANOHAR = {
  companyId: 'NSE:KANOHAR',
  ipoType: 'MainBoard',
  listingDate: '2026-09-16',
  allotmentDate: '2026-09-11',
  postIssueShares: 79186835,
  ipoSharesOffered: 16704750,
  anchorShares: 5011424,
};

describe('exactSchedule', () => {
  const rec = L.exactSchedule(KANOHAR);
  test('tranche dates follow ICDR from allotment', () => {
    expect(rec.tranches.map((x) => [x.kind, x.date])).toEqual([
      ['ANCHOR_30D', '2026-10-11'],
      ['ANCHOR_90D', '2026-12-10'],
      ['PRE_OFFER', '2027-03-11'],
      ['PROMOTER_MPC', '2028-03-11'],
    ]);
  });
  test('tranches + open float partition the post-issue capital exactly', () => {
    const locked = rec.tranches.reduce((s, x) => s + x.shares, 0);
    expect(locked + rec.openFloatShares).toBe(KANOHAR.postIssueShares);
  });
  test('promoter minimum contribution is 20% of post-issue capital', () => {
    const mpc = rec.tranches.find((x) => x.kind === 'PROMOTER_MPC');
    expect(mpc.shares).toBe(15837367);
    expect(mpc.pctEquity).toBeCloseTo(20, 5);
  });
  test('36-month contribution when the RHP says so', () => {
    const r = L.exactSchedule({ ...KANOHAR, mpcMonths: 36 });
    expect(r.tranches.find((x) => x.kind === 'PROMOTER_MPC').date).toBe('2029-09-11');
  });
  test('no anchors → no anchor tranches', () => {
    const r = L.exactSchedule({ ...KANOHAR, anchorShares: 0 });
    expect(r.tranches.map((x) => x.kind)).toEqual(['PRE_OFFER', 'PROMOTER_MPC']);
    expect(r.openFloatShares).toBe(KANOHAR.ipoSharesOffered);
  });
});

describe('nextUnlock / lockinWatch', () => {
  const rec = L.exactSchedule(KANOHAR);
  test('next unlock, size and float impact (3-Nov-2026)', () => {
    const w = L.lockinWatch(rec, '2026-11-03', { marketCapCr: 7544.92 });
    expect(w).toMatchObject({
      status: 'PENDING',
      date: '2026-12-10',
      daysAway: 37,
      shares: 2505712,
      laterEvents: 2,
    });
    expect(w.pctEquity).toBeCloseTo(3.164, 2);
    expect(w.pctOfFloat).toBeCloseTo(17.65, 1);
    expect(w.valueCr).toBeCloseTo(238.7, 0);
  });
  test('an event dated today counts as today, not past', () => {
    expect(L.lockinWatch(rec, '2026-12-10').daysAway).toBe(0);
  });
  test('after the anchor unlocks the float base grows', () => {
    const w = L.lockinWatch(rec, '2026-12-11');
    expect(w.date).toBe('2027-03-11');
    expect(w.pctOfFloat).toBeCloseTo(279.2, 0);
  });
  test('all expired → CLEARED', () => {
    const w = L.lockinWatch({ ...rec, listingDate: '2026-09-16' }, '2028-03-12');
    expect(w).toMatchObject({ status: 'CLEARED', lastDate: '2028-03-11' });
  });
  test('older than 24 months, unknown company, future listing → null', () => {
    expect(L.lockinWatch({ ...rec, listingDate: '2024-01-01' }, '2026-11-03')).toBeNull();
    expect(L.lockinWatch(undefined, '2026-11-03')).toBeNull();
    expect(L.lockinWatch({ ...rec, listingDate: '2027-01-01' }, '2026-11-03')).toBeNull();
  });
});

describe('estimateSchedule', () => {
  test('mainboard: dates only, anchor rows unless anchors known absent', () => {
    const e = L.estimateSchedule({
      companyId: 'X',
      ipoType: 'MainBoard',
      listingDate: '2026-06-10',
      allotmentDate: '2026-06-05',
    });
    expect(e.tranches.map((x) => x.date)).toEqual([
      '2026-07-05',
      '2026-09-03',
      '2026-12-05',
      '2027-12-05',
    ]);
    expect(e.tranches.every((x) => x.shares === null)).toBe(true);
    const noAnchor = L.estimateSchedule({
      companyId: 'X',
      ipoType: 'MainBoard',
      listingDate: '2026-06-10',
      allotmentDate: '2026-06-05',
      anchorParticipated: false,
    });
    expect(noAnchor.tranches).toHaveLength(2);
  });
  test('SME uses 12m / 36m', () => {
    const e = L.estimateSchedule({
      companyId: 'X',
      ipoType: 'NSE EMERGE',
      listingDate: '2026-06-10',
      allotmentDate: '2026-06-05',
      anchorParticipated: false,
    });
    expect(e.board).toBe('SME');
    expect(e.tranches.map((x) => x.date)).toEqual(['2027-06-05', '2029-06-05']);
  });
  test('estimate text says size n/a and est.', () => {
    const e = L.estimateSchedule({
      companyId: 'X',
      ipoType: 'MainBoard',
      listingDate: '2026-06-10',
      allotmentDate: '2026-06-05',
    });
    expect(L.lockinText(L.lockinWatch(e, '2026-11-03'))).toBe(
      'IPO unlock: Pre-offer holders + promoter excess 5 Dec 2026 (in 32d) · size n/a · +1 later · est.'
    );
  });
});

describe('lockinText', () => {
  test('exact line carries date, distance, shares, % equity, value and float impact', () => {
    const w = L.lockinWatch(L.exactSchedule(KANOHAR), '2026-11-03', { marketCapCr: 7544.92 });
    expect(L.lockinText(w)).toBe(
      'IPO unlock: Anchor rest (90d) 10 Dec 2026 (in 37d) · 25.06 L sh (3.16% of equity, ≈₹239 Cr, +18% of tradable float) · +2 later'
    );
  });
  test('null block → null', () => expect(L.lockinText(null)).toBeNull());
});

describe('card integration', () => {
  const index = new Map([['NSE:KANOHAR', L.exactSchedule(KANOHAR)]]);
  const opts = { ipoLockins: { today: '2026-11-03', index } };
  const sig = (companyId) => ({
    companyId,
    ticker: companyId,
    name: 'N',
    tier: 'ACT',
    headline: 'h',
    market_cap_cr: 7544.92,
  });

  test('attachIpoLockins adds the block only for ≤24m listings, never mutates', () => {
    const items = [
      { companyId: 'NSE:KANOHAR', marketData: { marketCapCr: 7544.92 } },
      { companyId: 'NSE:OLD' },
    ];
    const out = store.attachIpoLockins(items, { today: '2026-11-03', index });
    expect(out[0].ipoLockin.date).toBe('2026-12-10');
    expect(out[0].ipoLockin.valueCr).toBeCloseTo(238.7, 0);
    expect(out[1].ipoLockin).toBeUndefined();
    expect(items[0].ipoLockin).toBeUndefined();
  });
  test('scan-signal card shows the unlock line for a recent listing only', () => {
    const html = t.buildScanSignalEmail([sig('NSE:KANOHAR'), sig('NSE:OLD')], opts);
    expect(html.match(/IPO unlock:/g)).toHaveLength(1);
    expect(html).toContain('10 Dec 2026 (in 37d)');
  });
  test('digest card shows the unlock line', () => {
    const html = t.buildDigestHtml(
      [
        {
          companyId: 'NSE:KANOHAR',
          name: 'Kanohar',
          significance: 'high',
          category: 'order_book',
          headline: 'Won an order',
          insight: 'Won.',
          announcementId: 'a1',
        },
      ],
      { ipoLockins: { today: '2026-11-03', index } }
    );
    expect(html).toContain('IPO unlock:');
  });
  test('urgency colour: ≤14d red, ≤45d amber, else grey', () => {
    const w = (daysAway) => ({
      status: 'PENDING',
      label: 'x',
      date: '2026-12-10',
      daysAway,
      shares: null,
      basis: 'estimate',
      laterEvents: 0,
    });
    expect(t.ipoLockinHtml(w(10))).toContain('#b42318');
    expect(t.ipoLockinHtml(w(30))).toContain('#b54708');
    expect(t.ipoLockinHtml(w(90))).toContain('#475467');
    expect(t.ipoLockinHtml(null)).toBe('');
  });
});
