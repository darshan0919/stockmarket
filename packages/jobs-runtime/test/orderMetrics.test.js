const m = require('../lib/orderMetrics');
const { orderMetricsHtml } = require('../lib/thesisCardEmail');

describe('orderMetrics', () => {
  test('ratio guards', () => {
    expect(m.ratio(50, 200)).toBeCloseTo(0.25);
    expect(m.ratio(50, 0)).toBeNull();
    expect(m.ratio(null, 10)).toBeNull();
  });
  test('classifyOrderStatus', () => {
    expect(m.classifyOrderStatus('emerged as L1 bidder')).toBe('l1');
    expect(m.classifyOrderStatus('has been awarded L1 order')).toBe('firm');
    expect(m.classifyOrderStatus('rate contract for supply')).toBe('framework');
    expect(m.classifyOrderStatus('received Letter of Intent')).toBe('loi');
    expect(m.classifyOrderStatus('Letter of Intent then work order issued')).toBe('firm');
    expect(m.classifyOrderStatus('project with GDV of Rs 400 crore')).toBe('indirect');
    expect(m.classifyOrderStatus('received purchase order')).toBe('firm');
  });
  test('selectTopCompanies ranks by TTM ratio, skips conditional and trivial', () => {
    const e = (companyId, ttm, valueCr, conditional = false) => ({
      companyId,
      metrics: { order: { valueCr, conditional }, ratios: { ttm } },
    });
    const top = m.selectTopCompanies(
      [
        e('A', 0.5, 100),
        e('B', 0.01, 5),
        e('C', 0.9, 90, true),
        e('D', 0.3, 60),
        e('E', 0.1, 10),
        e('F', 0.05, 1),
      ],
      3
    );
    expect(top).toEqual(['A', 'D', 'E']);
  });
  test('card html labels non-firm orders', () => {
    const html = orderMetricsHtml({
      order: { valueCr: 400, status: 'indirect', conditional: true },
      orderCount: 1,
      revenue: { ttmCr: 1000, lastFyCr: 900 },
      ratios: { ttm: 0.4, lastFy: 0.44 },
      impact: { available: false, note: 'no timeline' },
    });
    expect(html).toContain('GDV, NOT CONTRACT REVENUE');
  });
});

describe('orderMetrics: schedule and book', () => {
  test('accretionSchedule spreads revenue across fiscal quarters and sums to the order', () => {
    const s = m.accretionSchedule({ orderCr: 12, startDate: '2026-09-30', endDate: '2028-03-30' });
    expect(s[0].quarter).toBe('Q2FY27');
    expect(s[s.length - 1].quarter).toBe('Q4FY28');
    const total = s.reduce((a, q) => a + q.revenueCr, 0);
    expect(total).toBeCloseTo(12, 0);
  });

  const ledger = (cumulative, applied = []) => ({
    base: { valueCr: 1000, sourceQuarter: '2026-06-30', sourceQuarterEndDate: '2026-06-30' },
    cumulative: { valueCr: cumulative },
    announcementsApplied: applied.map((ssUrl) => ({ ssUrl })),
  });
  const rev = { ttmCr: 2000, lastFyCr: 1800 };

  test('unexecutedBook: order already applied in ledger is not double counted', () => {
    const b = m.unexecutedBook({
      ledger: ledger(1100, ['x']),
      orderCr: 100,
      orderSsUrls: ['x'],
      orderDate: '2026-09-30',
      revenue: rev,
      today: '2026-09-30',
    });
    expect(b.ok).toBe(true);
    expect(b.afterCr).toBe(1100);
    expect(b.beforeCr).toBe(1000);
  });

  test('unexecutedBook: order missing from ledger is added on top; fails cleanly without a base', () => {
    const b = m.unexecutedBook({
      ledger: ledger(1000),
      orderCr: 100,
      orderSsUrls: ['y'],
      orderDate: '2026-09-30',
      revenue: rev,
      today: '2026-09-30',
    });
    expect(b.afterCr).toBe(1100);
    expect(
      m.unexecutedBook({ ledger: null, orderCr: 1, revenue: rev, today: '2026-09-30' }).ok
    ).toBe(false);
  });
});
