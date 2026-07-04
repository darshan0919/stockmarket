'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const g = require('../gainersScanner');

describe('pure date helpers', () => {
  test('quarterDate maps month → quarter-end YYYYMM', () => {
    expect(g.quarterDate(new Date(Date.UTC(2026, 5, 27)))).toBe('202606'); // Jun
    expect(g.quarterDate(new Date(Date.UTC(2026, 0, 5)))).toBe('202603'); // Jan
    expect(g.quarterDate(new Date(Date.UTC(2026, 9, 1)))).toBe('202612'); // Oct
  });

  test('lastTradingDay never returns a weekend and is before input', () => {
    for (let day = 1; day <= 7; day++) {
      const input = new Date(Date.UTC(2026, 5, day));
      const ltd = g.lastTradingDay(input);
      expect(ltd.getUTCDay()).not.toBe(0);
      expect(ltd.getUTCDay()).not.toBe(6);
      expect(ltd.getTime()).toBeLessThan(input.getTime());
    }
  });

  test('Monday resolves to the prior Friday', () => {
    const monday = new Date(Date.UTC(2026, 5, 29)); // 2026-06-29 is a Monday
    expect(monday.getUTCDay()).toBe(1);
    expect(g.lastTradingDay(monday).toISOString().slice(0, 10)).toBe('2026-06-26'); // Fri
  });
});

describe('filterNoise', () => {
  test('drops routine compliance, keeps material', () => {
    const anns = [
      { subject: 'Closure of Trading Window', description: '' },
      { subject: 'Bagged a large order', description: 'EPC contract win' },
      { subject: 'Regulation 74 certificate', description: '' },
    ];
    const out = g.filterNoise(anns);
    expect(out).toHaveLength(1);
    expect(out[0].subject).toMatch(/order/i);
  });
});

describe('sectorBreadth', () => {
  test('computes up/down/avg and broad_move', () => {
    const companies = [{ return_1d: 2 }, { return_1d: 1 }, { return_1d: -1 }, { return_1d: 0.1 }];
    const b = g.sectorBreadth(companies);
    expect(b.total).toBe(4);
    expect(b.up_count).toBe(2); // > 0.5
    expect(b.down_count).toBe(1); // < -0.5
    expect(b.pct_up).toBe(50);
    expect(b.broad_move).toBe(true);
  });
  test('empty → {}', () => expect(g.sectorBreadth([])).toEqual({}));
});

describe('applyQualityFilters', () => {
  test('separates passing and excluded with reasons', () => {
    const gainers = [
      { ticker: 'NSE:GOOD', market_cap_cr: 1000, retail_holding_pct: 20 },
      { ticker: 'NSE:SMALL', market_cap_cr: 100, retail_holding_pct: 10 },
      { ticker: 'NSE:RETAIL', market_cap_cr: 1000, retail_holding_pct: 80 },
    ];
    const deliveryMap = {
      'NSE:GOOD': { deliv_value_cr: 50 },
      'NSE:SMALL': { deliv_value_cr: 50 },
      'NSE:RETAIL': { deliv_value_cr: 50 },
    };
    const { passed, excluded } = g.applyQualityFilters(gainers, deliveryMap);
    expect(passed.map((x) => x.ticker)).toEqual(['NSE:GOOD']);
    expect(excluded.find((x) => x.ticker === 'NSE:SMALL').exclusion_reasons[0]).toMatch(/mcap/);
    expect(excluded.find((x) => x.ticker === 'NSE:RETAIL').exclusion_reasons.some((r) => /retail_holding/.test(r))).toBe(true);
  });
});

describe('delivery derivations match Python formulas', () => {
  test('NSE: deliv_qty = trd_qty*dper/100; value from totalTradedValue', () => {
    const d = g.deriveNseDelivery({
      tradeInfo: { deliveryToTradedQuantity: 60, totalTradedVolume: 100000, totalTradedValue: 1e9 },
    });
    expect(d.deliv_per).toBe(60);
    expect(d.deliv_qty).toBe(60000);
    expect(d.trd_value_cr).toBe(100); // 1e9 / 1e7
    expect(d.deliv_value_cr).toBe(60); // 100 * 60/100
    expect(d.high_delivery).toBe(true);
  });
  test('BSE: deliverableQty direct; value = delivQty*close/1e7', () => {
    const d = g.deriveBseDelivery({ deliveryPct: 40, qtyTraded: 200000, deliverableQty: 80000 }, 500, '500325');
    expect(d.deliv_qty).toBe(80000);
    expect(d.deliv_value_cr).toBe(4); // 80000*500/1e7
    expect(d.high_delivery).toBe(false);
  });
});

describe('main() orchestration (mocked clients)', () => {
  test('produces schema 2.0, filters, enriches, writes file', async () => {
    const runScan = jest.fn(async (payload) => {
      if (payload.ratiosType === 'Ratios') {
        return { table: [['companyId', 'Retail Holdings'], ['NSE:GOOD', '20'], ['NSE:SMALL', '10']] };
      }
      if (payload.scan.industry && payload.scan.industry.length) {
        return { companies: [{ companyId: 'NSE:GOOD', 'Returns 1D': 3, 'Market Capitalization': 1000 }] };
      }
      return {
        table: [
          ['companyId', 'Name', 'Industry', 'Returns 1D', 'Market Capitalization', 'Close'],
          ['NSE:GOOD', 'Good Co', 'Tech', 5, 1000, 200],
          ['NSE:SMALL', 'Small Co', 'Tech', 8, 100, 50],
        ],
      };
    });
    const stockscans = {
      runScan,
      scanAnnouncements: jest.fn(async () => ({ announcements: [] })),
      prices: jest.fn(async () => [['2026-06-26', 190, 205, 188, 200, 120000]]),
    };
    const nse = { getSymbolData: jest.fn(async () => ({ tradeInfo: { deliveryToTradedQuantity: 60, totalTradedVolume: 1e6, totalTradedValue: 1e10 } })) };
    const bse = { getScripCode: jest.fn(), getSecurityPosition: jest.fn() };

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gainers-'));
    const out = await g.main({
      marketDate: new Date(Date.UTC(2026, 5, 26)),
      clients: { stockscans, nse, bse },
      outputDir: outDir,
      sleep: () => Promise.resolve(),
      log: () => {},
    });

    expect(out.schema_version).toBe('2.0');
    expect(out.market_date).toBe('2026-06-26');
    // GOOD passes (mcap 1000, delivery value high); SMALL excluded (mcap < 300)
    expect(out.gainers.map((x) => x.ticker)).toEqual(['NSE:GOOD']);
    expect(out.quality_filter.excluded_count).toBe(1);
    expect(out.gainers[0].price_signals.close).toBe(200);
    expect(out.gainers[0].delivery.deliv_per).toBe(60);
    // file written
    const written = JSON.parse(fs.readFileSync(path.join(outDir, '2026-06-26_gainers_raw.json'), 'utf8'));
    expect(written.total_gainers).toBe(1);
  });
});
