'use strict';

const fs = require('fs');
const path = require('path');

// Keep the cache off the real data/ tree: an in-memory StorageService.
const mockStore = new Map();
jest.mock('@stock/cloud-utils', () => ({
  StorageService: {
    readJson: (rel) => (mockStore.has(rel) ? JSON.parse(mockStore.get(rel)) : null),
    saveJson: async (rel, obj) => {
      mockStore.set(rel, JSON.stringify(obj));
    },
  },
}));

const {
  parseCompanyPage,
  selectBaselines,
  seasonalShares,
  getCompanyFinancials,
  parseNum,
  parsePeriodHeader,
  quarterLabel,
  shiftQuarter,
} = require('../src/analyzers/companyFinancials');

// Trimmed real company-page HTML (one quarterly + one annual P&L table, attributes
// stripped), captured 2026-09-20 from /company/NSE:AVALON (industrial layout) and
// /company/NSE:HDFCBANK (financial layout). See docs/stockscans-api-schemas.md.
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

describe('parseNum', () => {
  test.each([
    ['1,098', 1098],
    ['3,36,367', 336367], // Indian digit grouping
    ['-12,899', -12899],
    ['−12.5', -12.5], // unicode minus
    ['48.7', 48.7],
    ['12.0%', 12],
  ])('%s -> %s', (i, o) => expect(parseNum(i)).toBe(o));

  test.each(['', '-', '—', 'NA', 'n/a', 'abc', null, undefined])('%p -> null', (i) =>
    expect(parseNum(i)).toBeNull()
  );
});

describe('period helpers', () => {
  test('parsePeriodHeader', () => {
    expect(parsePeriodHeader('Jun 2026')).toMatchObject({ month: 6, year: 2026, yyyymm: '202606' });
    expect(parsePeriodHeader('TTM')).toMatchObject({ ttm: true });
    expect(parsePeriodHeader('Quarter')).toBeNull();
  });
  test('quarterLabel uses the Indian FY', () => {
    expect(quarterLabel(6, 2026)).toMatchObject({ fq: 'Q1FY27', fiscalYear: 2027 });
    expect(quarterLabel(3, 2026)).toMatchObject({ fq: 'Q4FY26', fiscalYear: 2026 });
    expect(quarterLabel(5, 2026)).toBeNull();
  });
  test('shiftQuarter wraps across fiscal years', () => {
    expect(shiftQuarter({ fiscalYear: 2026, fiscalPeriod: 'Q4' }, 1)).toEqual({
      fiscalYear: 2027,
      fiscalPeriod: 'Q1',
    });
    expect(shiftQuarter({ fiscalYear: 2027, fiscalPeriod: 'Q2' }, -4)).toEqual({
      fiscalYear: 2026,
      fiscalPeriod: 'Q2',
    });
    expect(shiftQuarter({ fiscalYear: 2027, fiscalPeriod: 'Q1' }, -1)).toEqual({
      fiscalYear: 2026,
      fiscalPeriod: 'Q4',
    });
  });
});

describe('parseCompanyPage -- industrial layout (NSE:AVALON)', () => {
  const p = parseCompanyPage(fixture('companyPage.industrial.html'));
  const q = (fq) => p.quarters.find((r) => r.fq === fq);

  test('layout, basis, shape, no sanity warnings', () => {
    expect(p.layout).toBe('industrial');
    expect(p.basis).toBe('consolidated');
    expect(p.quarters).toHaveLength(12);
    expect(p.years.map((y) => y.fy)).toEqual(expect.arrayContaining(['FY25', 'FY26']));
    expect(p.ttm).toMatchObject({ period: 'TTM', revenue: 1764, pat: 134 });
    expect(p.warnings).toEqual([]);
  });

  test('latest quarter values match the live page (Q1FY27)', () => {
    expect(q('Q1FY27')).toMatchObject({
      period: 'Jun 2026',
      revenue: 484,
      operating_profit: 58,
      opm_pct: 12.0,
      pat: 35,
      pat_growth_pct: 145.4,
    });
  });

  test('FY26 annual matches the concall base figure (1,603 Cr)', () => {
    expect(p.years.find((y) => y.fy === 'FY26')).toMatchObject({
      revenue: 1603,
      operating_profit: 173,
      pbt: 154,
      tax: 41,
      pat: 113,
    });
  });

  test('baselines', () => {
    const b = selectBaselines(p);
    expect(b.latest_quarter.fq).toBe('Q1FY27');
    expect(b.next_quarter.fq).toBe('Q2FY27');
    expect(b.year_ago_quarter.fq).toBe('Q2FY26'); // YoY base for the target quarter
    expect(b.latest_year_ago.fq).toBe('Q1FY26');
    expect(b.last_fy.fy).toBe('FY26'); // FY27 is not complete
    expect(b.ytd_quarters.map((r) => r.fq)).toEqual(['Q1FY27']);
  });

  test('seasonality only covers FYs with all four quarters and sums to 1', () => {
    const s = seasonalShares(p.quarters);
    expect(Object.keys(s).sort()).toEqual(['FY25', 'FY26']); // FY24 has only 3 quarters in-window
    for (const shares of Object.values(s)) {
      expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    }
  });
});

describe('parseCompanyPage -- financial layout (NSE:HDFCBANK)', () => {
  const p = parseCompanyPage(fixture('companyPage.financial.html'));

  test('maps Financing Profit/FPM/Interest Expended onto the same keys and reports the layout', () => {
    expect(p.layout).toBe('financial');
    const last = p.quarters[p.quarters.length - 1];
    expect(last).toMatchObject({ fq: 'Q1FY27', revenue: 90575, pat: 20383, interest: 47626 });
    expect(last.operating_profit).toBeLessThan(0); // why growth on it must not be trusted
    expect(last.opm_pct).toBeLessThan(0);
  });

  test('handles Indian-grouped annual values', () => {
    expect(p.years.find((y) => y.fy === 'FY26').revenue).toBe(348615);
  });
});

describe('parseCompanyPage -- failure modes', () => {
  test('throws loudly on a page with no financials (login wall / layout change)', () => {
    expect(() => parseCompanyPage('<html><body>Please log in</body></html>')).toThrow(
      /quarterly P&L table not found/
    );
    expect(() => parseCompanyPage('')).toThrow(/empty HTML/);
  });

  test('a row with the wrong cell count is skipped with a warning, not mis-aligned', () => {
    const html = fixture('companyPage.industrial.html').replace(
      /(<td>[^<]*<\/td>)(<td>484<\/td>)/,
      '$2' // drop one cell from the Revenue row
    );
    const p = parseCompanyPage(html);
    expect(p.warnings.join('\n')).toMatch(/row "Revenue" has 11 cells vs 12 headers/);
    expect(p.quarters[p.quarters.length - 1].revenue).toBeNull();
  });
});

describe('selectBaselines edge: just after a Q4', () => {
  test('latest = Q4FY26 -> next = Q1FY27, base FY = FY26, no YTD quarters', () => {
    const p = parseCompanyPage(fixture('companyPage.industrial.html'));
    const trimmed = { ...p, quarters: p.quarters.filter((r) => r.yyyymm <= '202603') };
    const b = selectBaselines(trimmed);
    expect(b.latest_quarter.fq).toBe('Q4FY26');
    expect(b.next_quarter.fq).toBe('Q1FY27');
    expect(b.year_ago_quarter.fq).toBe('Q1FY26');
    expect(b.last_fy.fy).toBe('FY26');
    expect(b.ytd_quarters).toEqual([]);
  });
});

describe('getCompanyFinancials', () => {
  beforeEach(() => mockStore.clear());

  test('requires an explicit client', async () => {
    await expect(getCompanyFinancials('NSE:AVALON')).rejects.toThrow(/client/);
  });

  test('fetches once, then serves from cache; force bypasses it; ticker suffix is sanitized', async () => {
    let calls = 0;
    const client = {
      companyPageHtml: async (id) => {
        calls++;
        expect(id).toBe('NSE:AVALON');
        return fixture('companyPage.industrial.html');
      },
    };
    const a = await getCompanyFinancials('NSE:AVALON-BE', { client });
    const b = await getCompanyFinancials('NSE:AVALON', { client });
    expect([a.fromCache, b.fromCache]).toEqual([false, true]);
    expect(a.baselines.next_quarter.fq).toBe('Q2FY27');
    expect(calls).toBe(1);
    await getCompanyFinancials('NSE:AVALON', { client, force: true });
    expect(calls).toBe(2);
  });

  test('a stale cache entry (older than ttl) is refetched', async () => {
    let calls = 0;
    const client = {
      companyPageHtml: async () => {
        calls++;
        return fixture('companyPage.industrial.html');
      },
    };
    await getCompanyFinancials('NSE:AVALON', { client });
    await getCompanyFinancials('NSE:AVALON', { client, ttlHours: -1 });
    expect(calls).toBe(2);
  });
});
