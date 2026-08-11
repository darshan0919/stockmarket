'use strict';

const __os = require('os'),
  __fs = require('fs'),
  __path = require('path');
process.env.DATA_V2_DIR = __fs.mkdtempSync(__path.join(__os.tmpdir(), 'v2test-'));

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

describe('resolveMarketDate', () => {
  // 2026-08-10 is a Monday, 2026-08-07 the prior Friday.
  const monday = new Date(Date.UTC(2026, 7, 10));

  test('before settlement (8 AM IST default run) falls back to lastTradingDay', () => {
    const eightAmIst = new Date(Date.UTC(2026, 7, 10, 2, 30)); // 08:00 IST
    expect(g.istHour(eightAmIst)).toBe(8);
    expect(g.resolveMarketDate(monday, eightAmIst).toISOString().slice(0, 10)).toBe(
      '2026-08-07'
    );
  });

  test('at/after settlement on a trading day resolves to today', () => {
    const elevenPmIst = new Date(Date.UTC(2026, 7, 10, 17, 52)); // 23:52 IST — the bug's repro case
    expect(g.istHour(elevenPmIst)).toBe(23);
    expect(g.resolveMarketDate(monday, elevenPmIst).toISOString().slice(0, 10)).toBe(
      '2026-08-10'
    );
  });

  test('right at the settlement hour boundary resolves to today', () => {
    const sixPmIst = new Date(Date.UTC(2026, 7, 10, 12, 30)); // 18:00 IST exactly
    expect(g.istHour(sixPmIst)).toBe(18);
    expect(g.resolveMarketDate(monday, sixPmIst).toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  test('a weekend run still falls back regardless of hour', () => {
    const saturday = new Date(Date.UTC(2026, 7, 8)); // 2026-08-08 is a Saturday
    const saturdayNightIst = new Date(Date.UTC(2026, 7, 8, 17, 52)); // 23:52 IST Saturday
    expect(g.resolveMarketDate(saturday, saturdayNightIst).toISOString().slice(0, 10)).toBe(
      '2026-08-07'
    ); // prior Friday
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
      { ticker: 'NSE:LOWSTAKE', market_cap_cr: 50, retail_holding_pct: 80 },
    ];
    const deliveryMap = {
      'NSE:GOOD': { deliv_value_cr: 50 },
      'NSE:SMALL': { deliv_value_cr: 50 },
      'NSE:RETAIL': { deliv_value_cr: 50 },
      'NSE:LOWSTAKE': { deliv_value_cr: 50 },
    };
    const { passed, excluded } = g.applyQualityFilters(gainers, deliveryMap);
    // High retail holding alone no longer excludes a gainer (cap removed).
    expect(passed.map((x) => x.ticker)).toEqual(['NSE:GOOD', 'NSE:RETAIL']);
    expect(excluded.find((x) => x.ticker === 'NSE:SMALL').exclusion_reasons[0]).toMatch(/mcap/);
    // Still excluded via the separate min_retail_stake_value_cr check (50cr * 80% = 40cr < 50cr).
    expect(
      excluded
        .find((x) => x.ticker === 'NSE:LOWSTAKE')
        .exclusion_reasons.some((r) => /retail_stake_value/.test(r))
    ).toBe(true);
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
    const d = g.deriveBseDelivery(
      { deliveryPct: 40, qtyTraded: 200000, deliverableQty: 80000 },
      500,
      '500325'
    );
    expect(d.deliv_qty).toBe(80000);
    expect(d.deliv_value_cr).toBe(4); // 80000*500/1e7
    expect(d.high_delivery).toBe(false);
  });
});

describe('main() orchestration (mocked clients)', () => {
  test('produces schema 2.0, filters, enriches, writes file', async () => {
    const runScan = jest.fn(async (payload) => {
      if (payload.ratiosType === 'Ratios') {
        return {
          table: [
            ['companyId', 'Retail Holdings'],
            ['NSE:GOOD', '20'],
            ['NSE:SMALL', '10'],
          ],
        };
      }
      if (payload.scan.industry && payload.scan.industry.length) {
        return {
          companies: [{ companyId: 'NSE:GOOD', 'Returns 1D': 3, 'Market Capitalization': 1000 }],
        };
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
      validateAuth: jest.fn(async () => true),
      runScan,
      scanAnnouncements: jest.fn(async () => ({ announcements: [] })),
      // Price history comes from ohlcv(tf='1h') and is aggregated to daily —
      // the old prices() endpoint now 404s for every ticker, and tf='1d' is
      // rejected with HTTP 400, so hourly-and-aggregate is the supported path.
      // Two hourly bars on the same date must collapse into one daily candle
      // with the LAST close (200) and the SUMMED volume.
      ohlcv: jest.fn(async () => ({
        prices: [
          ['2026-06-26T10:15:00', 190, 198, 188, 195, 50000],
          ['2026-06-26T14:15:00', 195, 205, 193, 200, 70000],
        ],
      })),
      createWatchlist: jest.fn(async (name, companyIds) => ({
        watchlistId: 'wl_test',
        watchlistName: name,
        companyIds,
      })),
      deleteWatchlist: jest.fn(async () => ({ ok: true })),
    };
    const nse = {
      getSymbolData: jest.fn(async () => ({
        tradeInfo: { deliveryToTradedQuantity: 60, totalTradedVolume: 1e6, totalTradedValue: 1e10 },
      })),
    };
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
    const written = JSON.parse(
      fs.readFileSync(
        path.join(process.env.DATA_V2_DIR, 'runs', 'gainers_raw_20260626.json'),
        'utf8'
      )
    );
    expect(written.total_gainers).toBe(1);
  });
});

describe('announcement fetching uses a server-side filter', () => {
  const scanner = require('../gainersScanner');

  function annClient({ createFails = false } = {}) {
    const calls = { created: [], deleted: [], payloads: [] };
    return {
      calls,
      createWatchlist: jest.fn(async (name, companyIds) => {
        if (createFails) throw new Error('quota exceeded');
        calls.created.push({ name, companyIds });
        return { watchlistId: 'wl_1', watchlistName: name, companyIds };
      }),
      deleteWatchlist: jest.fn(async (id) => {
        calls.deleted.push(id);
        return {};
      }),
      scanAnnouncements: jest.fn(async (payload) => {
        calls.payloads.push(payload);
        if (payload.offset > 0) return { announcements: [] };
        return {
          announcements: [
            {
              companyId: 'NSE:AAA',
              title: 'Award of Order from NTPC',
              description: '',
              ssUrl: 'abc.pdf',
              createdAt: '2026-07-30T10:00:00',
            },
            // A ticker outside our universe must never leak into the results.
            {
              companyId: 'NSE:ZZZ',
              title: 'Some other filing',
              description: '',
              ssUrl: 'z.pdf',
              createdAt: '2026-07-30T10:00:00',
            },
          ],
        };
      }),
    };
  }

  const marketDate = new Date('2026-07-30T00:00:00Z');

  it('scans by watchlistIds, not companyIds, and cleans the scratch watchlist up', async () => {
    // The endpoint IGNORES scan.companyIds (verified live), so the old code
    // paginated the entire market to find ~40 companies. watchlistIds filters
    // server-side and has no 10-company cap.
    const client = annClient();
    const out = await scanner.fetchAnnouncementsBatch(
      ['NSE:AAA', 'NSE:BBB'],
      marketDate,
      client,
      async () => {},
      () => {}
    );
    expect(client.calls.created[0].companyIds).toEqual(['NSE:AAA', 'NSE:BBB']);
    expect(client.calls.payloads[0].scan.watchlistIds).toEqual(['wl_1']);
    expect(client.calls.payloads[0].scan.companyIds).toEqual([]);
    // A scratch watchlist is a REAL object in the user's account — leaking one
    // per run would be visible clutter.
    expect(client.calls.deleted).toEqual(['wl_1']);
    expect(out['NSE:AAA']).toHaveLength(1);
    expect(out['NSE:ZZZ']).toBeUndefined();
  });

  it('annotates each announcement with strength and a resolved pdfUrl', async () => {
    const client = annClient();
    const out = await scanner.fetchAnnouncementsBatch(
      ['NSE:AAA'],
      marketDate,
      client,
      async () => {},
      () => {}
    );
    const a = out['NSE:AAA'][0];
    expect(a.strength).toBe('STRONG');
    expect(a.category_derived).toBe('order_book');
    // Step 4 reads PDFs straight from this — no extra API calls to resolve URLs.
    expect(a.pdfUrl).toMatch(/abc\.pdf$/);
  });

  it('falls back to the market-wide sweep when the watchlist cannot be created', async () => {
    // A slow scan beats no announcements at all.
    const client = annClient({ createFails: true });
    const out = await scanner.fetchAnnouncementsBatch(
      ['NSE:AAA'],
      marketDate,
      client,
      async () => {},
      () => {}
    );
    expect(client.calls.payloads[0].scan.watchlistIds).toEqual([]);
    expect(client.calls.deleted).toEqual([]);
    expect(out['NSE:AAA']).toHaveLength(1);
  });
});

describe('normaliseGainer companyId sanitization', () => {
  test('strips a dash-separated series suffix from the raw companyId/ticker', () => {
    const out = g.normaliseGainer({
      companyId: 'NSE:SOMECO-BE',
      Name: 'Some Co',
      'Returns 1D': 5,
      'Market Capitalization': 500,
    });
    expect(out.ticker).toBe('NSE:SOMECO');
    expect(out.company_id).toBe('NSE:SOMECO');
  });

  test('leaves an unsuffixed ticker untouched', () => {
    const out = g.normaliseGainer({ companyId: 'NSE:TATASTEEL', 'Returns 1D': 1, 'Market Capitalization': 1 });
    expect(out.ticker).toBe('NSE:TATASTEEL');
  });
});

describe('parseConcallScanRows', () => {
  const { CONCALL_SCAN_SENTIMENT } = require('@stock/api/stockscansClient');

  // Row shape confirmed live 2026-08-01 — see docs/stockscans-api-schemas.md
  // and StockscansClient.concallScan's JSDoc for the field-by-field decode.
  const bajfinanceRow = [
    '3722',
    'NSE:BAJFINANCE',
    'Bajaj Finance Ltd',
    'Conglomerate Backed NBFC',
    '2026-07-30T18:30:00+05:30',
    'as-8ae63089e995515f8a6ad4ec.pdf',
    1,
    true,
    56,
    2,
    ['▲ Gold loan AUM +112%', '● FY27 guidance revision deferred', '▲ Credit costs 1.87% → 1.54%'],
    'qu7ifxpflh34fqrzkr3wlnx9.pdf',
  ];

  test('maps companyId (index 1) to sentiment/score/highlights', () => {
    const now = new Date('2026-07-31T00:00:00+05:30');
    const out = g.parseConcallScanRows([bajfinanceRow], CONCALL_SCAN_SENTIMENT, now);

    expect(Object.keys(out)).toEqual(['NSE:BAJFINANCE']);
    expect(out['NSE:BAJFINANCE']).toMatchObject({
      resultQualityScore: 56,
      sentimentCode: 2,
      sentiment: 'Neutral',
      highlights: [
        '▲ Gold loan AUM +112%',
        '● FY27 guidance revision deferred',
        '▲ Credit costs 1.87% → 1.54%',
      ],
      date: '2026-07-30T18:30:00+05:30',
    });
  });

  test('computes recentWithinDays from the row date relative to "now"', () => {
    const now = new Date('2026-08-06T18:30:00+05:30'); // exactly 7 days later
    const out = g.parseConcallScanRows([bajfinanceRow], CONCALL_SCAN_SENTIMENT, now);
    expect(out['NSE:BAJFINANCE'].recentWithinDays).toBe(7);
  });

  test('recentWithinDays is null when the date field is missing/unparseable', () => {
    const badRow = [...bajfinanceRow];
    badRow[4] = null;
    const out = g.parseConcallScanRows([badRow], CONCALL_SCAN_SENTIMENT, new Date());
    expect(out['NSE:BAJFINANCE'].recentWithinDays).toBeNull();
  });

  test('skips rows with no companyId rather than crashing', () => {
    const noIdRow = [...bajfinanceRow];
    noIdRow[1] = null;
    const out = g.parseConcallScanRows([noIdRow], CONCALL_SCAN_SENTIMENT, new Date());
    expect(Object.keys(out)).toHaveLength(0);
  });

  test('handles an empty/undefined rows array', () => {
    expect(g.parseConcallScanRows([], CONCALL_SCAN_SENTIMENT)).toEqual({});
    expect(g.parseConcallScanRows(undefined, CONCALL_SCAN_SENTIMENT)).toEqual({});
  });

  test('unknown sentiment code maps to null, not a crash', () => {
    const weirdRow = [...bajfinanceRow];
    weirdRow[9] = 99;
    const out = g.parseConcallScanRows([weirdRow], CONCALL_SCAN_SENTIMENT, new Date());
    expect(out['NSE:BAJFINANCE'].sentiment).toBeNull();
    expect(out['NSE:BAJFINANCE'].sentimentCode).toBe(99);
  });
});

describe('fetchConcallSentiment', () => {
  function concallClient({ pages }) {
    const calls = { created: [], deleted: [], concallScanCalls: [] };
    let pageIdx = 0;
    return {
      calls,
      createWatchlist: jest.fn(async (name, companyIds) => {
        calls.created.push({ name, companyIds });
        return { watchlistId: 'wl_concall_test' };
      }),
      deleteWatchlist: jest.fn(async (id) => {
        calls.deleted.push(id);
        return { ok: true };
      }),
      concallScan: jest.fn(async (payload) => {
        calls.concallScanCalls.push(payload);
        const page = pages[pageIdx];
        pageIdx += 1;
        return page;
      }),
    };
  }

  test('paginates using `next` as an offset cursor, not offset/total', async () => {
    const client = concallClient({
      pages: [
        {
          rows: [
            ['1', 'NSE:AAA', 'AAA Ltd', 'Tech', '2026-07-30T10:00:00+05:30', null, 1, true, 50, 3, [], null],
          ],
          next: 1,
          quarter: '202606',
        },
        {
          rows: [
            ['2', 'NSE:BBB', 'BBB Ltd', 'Tech', '2026-07-29T10:00:00+05:30', null, 1, true, 60, 4, [], null],
          ],
          next: null,
          quarter: '202606',
        },
      ],
    });

    const out = await g.fetchConcallSentiment(['NSE:AAA', 'NSE:BBB'], client);

    expect(client.concallScan).toHaveBeenCalledTimes(2);
    expect(client.concallScan.mock.calls[0][0].offset).toBe(0);
    expect(client.concallScan.mock.calls[1][0].offset).toBe(1); // page 2 uses `next`, not offset+rows.length
    expect(Object.keys(out).sort()).toEqual(['NSE:AAA', 'NSE:BBB']);
    expect(out['NSE:BBB'].sentiment).toBe('Bullish');
  });

  test('always deletes the throwaway watchlist, even if concallScan throws', async () => {
    const client = concallClient({ pages: [] });
    client.concallScan = jest.fn(async () => {
      throw new Error('boom');
    });

    await expect(g.fetchConcallSentiment(['NSE:AAA'], client)).rejects.toThrow('boom');
    expect(client.deleteWatchlist).toHaveBeenCalledWith('wl_concall_test');
  });

  test('returns {} for an empty ticker list without calling the API', async () => {
    const client = concallClient({ pages: [] });
    const out = await g.fetchConcallSentiment([], client);
    expect(out).toEqual({});
    expect(client.createWatchlist).not.toHaveBeenCalled();
  });
});

describe('daily aggregation of hourly candles', () => {
  const scanner = require('../gainersScanner');

  it('collapses intraday bars into one candle per day', () => {
    const daily = scanner.aggregateToDaily([
      ['2026-07-29T10:15:00', 100, 105, 99, 102, 1000],
      ['2026-07-29T14:15:00', 102, 110, 101, 108, 2000],
      ['2026-07-30T10:15:00', 108, 112, 107, 111, 3000],
    ]);
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({ date: '2026-07-29', open: 100, high: 110, low: 99, close: 108 });
    expect(daily[0].volume).toBe(3000); // summed, not last
    expect(daily[1].close).toBe(111);
  });
});
