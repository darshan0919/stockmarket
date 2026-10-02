'use strict';

const { parseXbrl } = require('../parse');
const { parseShareholding, diffShareholding, parseBrsr } = require('../filings');
const {
  fetchFilingSeries,
  nseItems,
  bseItems,
  BSE_FLAGS,
  bseDayAfter,
} = require('../filingsFetch');
const { createIssueLog } = require('../issues');

const P = 'ShareholdingAsAPercentageOfTotalNumberOfShares';
const shpDoc = (promoter, pub, holders) => `<xbrli:xbrl>
<in-capmkt:Symbol contextRef="OneD">ACME</in-capmkt:Symbol>
<in-capmkt:DateOfReport contextRef="OneD">2026-06-30</in-capmkt:DateOfReport>
<in-capmkt:WhetherAnySharesHeldByPromotersAreEncumberedUnderPledged contextRef="OneD">No</in-capmkt:WhetherAnySharesHeldByPromotersAreEncumberedUnderPledged>
<in-capmkt:${P} contextRef="ShareholdingOfPromoterAndPromoterGroup_ContextI" unitRef="pure">${promoter}</in-capmkt:${P}>
<in-capmkt:${P} contextRef="PublicShareholding_ContextI" unitRef="pure">${pub}</in-capmkt:${P}>
<in-capmkt:NumberOfShareholders contextRef="ShareholdingPattern_ContextI" unitRef="pure">${holders}</in-capmkt:NumberOfShareholders>
<in-capmkt:${P} contextRef="ShareholdingPattern_ContextI" unitRef="pure">1</in-capmkt:${P}>
</xbrli:xbrl>`;

describe('parseShareholding / diffShareholding', () => {
  it('converts fractions to percent and reads flags', () => {
    const d = parseShareholding(parseXbrl(shpDoc(0.6185, 0.3815, 1000)));
    expect(d.ok).toBe(true);
    expect(d.symbol).toBe('ACME');
    expect(d.promoterPct).toBe(61.85);
    expect(d.publicPct).toBe(38.15);
    expect(d.totalHolders).toBe(1000);
    expect(d.flags.promoterPledged).toBe(false);
  });

  it('returns ok:false for unrelated documents', () => {
    const d = parseShareholding(
      parseXbrl('<x><in-capmkt:Foo contextRef="OneD">1</in-capmkt:Foo></x>')
    );
    expect(d.ok).toBe(false);
  });

  it('computes percentage-point deltas and flags notable moves', () => {
    const cur = parseShareholding(parseXbrl(shpDoc(0.6239, 0.3761, 900)));
    const prev = parseShareholding(parseXbrl(shpDoc(0.6185, 0.3815, 1000)));
    const d = diffShareholding(cur, prev);
    expect(d.deltas.promoterGroup).toBe(0.54);
    expect(d.holdersDelta).toBe(-100);
    expect(d.notable.join()).toMatch(/promoterGroup/);
    expect(diffShareholding(cur, { ok: false })).toBeNull();
  });
});

describe('bseDayAfter', () => {
  it('rolls over month and year and drops zero padding', () => {
    const later = new Date('2027-06-01T00:00:00Z');
    expect(bseDayAfter('29-09-2026', later)).toBe('2026/9/30');
    expect(bseDayAfter('31-12-2026', later)).toBe('2027/1/1');
  });

  it('caps at today (IST) because a future todate returns nothing', () => {
    const now = new Date('2026-09-30T05:00:00Z'); // 10:30 IST on 30-Sep
    expect(bseDayAfter('30-09-2026', now)).toBe('2026/9/30');
    expect(bseDayAfter('01-10-2026', now)).toBe('2026/9/30');
  });
});

describe('row normalisers', () => {
  it('nseItems handles each kind and skips rows without XBRL', () => {
    expect(
      nseItems('shareholding', [{ xbrl: 'u1', date: '30-JUN-2026' }, { date: 'x' }])
    ).toHaveLength(1);
    expect(
      nseItems('voting', [{ metadata: { vrXbrlFilename: 'v' } }, { metadata: {} }])
    ).toHaveLength(1);
    expect(nseItems('pit', [{ xmlFileName: 'p' }])[0].url).toBe('p');
    expect(nseItems('governance', undefined)).toEqual([]);
  });
  it('bseItems keeps only rows with a file', () => {
    expect(bseItems([{ xbrlurl: 'a.html', xbrldate: '2026-06-30' }, {}])).toHaveLength(1);
  });
});

describe('fetchFilingSeries', () => {
  const memCache = () => {
    const m = new Map();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) };
  };
  const fake = (over = {}) => ({
    cache: memCache(),
    nse: {
      getShareholdingFilings: async () => [{ xbrl: 'n1.xml', date: '30-JUN-2026' }],
      fetchArchiveXml: async () => shpDoc(0.6, 0.4, 10),
      ...over.nse,
    },
    bse: {
      getScripCode: async () => '123456',
      getXbrlFilings: async () => [{ xbrlurl: 'b1.xml', xbrldate: '2026-06-30' }],
      fetchXbrlFile: async () => shpDoc(0.5, 0.5, 20),
      ...over.bse,
    },
  });

  it('uses NSE when available and logs nothing', async () => {
    const issues = createIssueLog('t1');
    const r = await fetchFilingSeries({ kind: 'shareholding', symbol: 'ACME', issues, ...fake() });
    expect(r.exchange).toBe('NSE');
    expect(r.items[0].dto.promoterPct).toBe(60);
    expect(issues.all()).toHaveLength(0);
  });

  it('looks under index=sme when the equities listing is empty (SME-platform names)', async () => {
    const issues = createIssueLog('t-sme');
    const calls = [];
    const r = await fetchFilingSeries({
      kind: 'shareholding',
      symbol: 'SMECO',
      issues,
      ...fake({
        nse: {
          getShareholdingFilings: async (_s, index) => {
            calls.push(index);
            return index === 'sme' ? [{ xbrl: 'n1.xml', date: '30-JUN-2026' }] : [];
          },
        },
      }),
    });
    expect(calls).toEqual(['equities', 'sme']);
    expect(r.exchange).toBe('NSE');
    expect(issues.all()).toHaveLength(0);
  });

  it('falls back to BSE when NSE has no rows and records FALLBACK_USED', async () => {
    const issues = createIssueLog('t2');
    const r = await fetchFilingSeries({
      kind: 'shareholding',
      symbol: 'ACME',
      issues,
      ...fake({ nse: { getShareholdingFilings: async () => [] } }),
    });
    expect(r.exchange).toBe('BSE');
    expect(r.items[0].dto.promoterPct).toBe(50);
    expect(issues.all().map((i) => i.category)).toContain('FALLBACK_USED');
  });

  it('falls back on NSE endpoint errors and logs ENDPOINT_CHANGE', async () => {
    const issues = createIssueLog('t3');
    const r = await fetchFilingSeries({
      kind: 'shareholding',
      symbol: 'ACME',
      issues,
      ...fake({
        nse: {
          getShareholdingFilings: async () => {
            throw new Error('boom');
          },
        },
      }),
    });
    expect(r.exchange).toBe('BSE');
    expect(issues.all().map((i) => i.category)).toEqual(
      expect.arrayContaining(['ENDPOINT_CHANGE', 'FALLBACK_USED'])
    );
  });

  it('returns empty + major MISSING_FILING when both exchanges fail (PDF fallback)', async () => {
    const issues = createIssueLog('t4');
    const r = await fetchFilingSeries({
      kind: 'shareholding',
      symbol: 'ACME',
      issues,
      ...fake({
        nse: { getShareholdingFilings: async () => [] },
        bse: { getScripCode: async () => null },
      }),
    });
    expect(r.items).toEqual([]);
    expect(r.exchange).toBeNull();
    expect(
      issues.all().some((i) => i.category === 'MISSING_FILING' && i.severity === 'major')
    ).toBe(true);
  });

  it('logs a download failure and PARSE_ERROR for junk', async () => {
    const issues = createIssueLog('t5');
    await fetchFilingSeries({
      kind: 'shareholding',
      symbol: 'ACME',
      issues,
      ...fake({
        nse: { fetchArchiveXml: async () => null },
        bse: { fetchXbrlFile: async () => '<html>err</html>' },
      }),
    });
    const cats = issues.all().map((i) => i.category);
    expect(cats).toContain('MISSING_FILING');
    expect(cats).toContain('PARSE_ERROR');
  });

  it('keeps issue logs isolated per run and rejects unknown kinds', async () => {
    const a = createIssueLog('a');
    const b = createIssueLog('b');
    await fetchFilingSeries({
      kind: 'shareholding',
      symbol: 'X',
      issues: a,
      ...fake({
        nse: { getShareholdingFilings: async () => [] },
        bse: { getScripCode: async () => null },
      }),
    });
    expect(a.all().length).toBeGreaterThan(0);
    expect(b.all()).toHaveLength(0);
    await expect(
      fetchFilingSeries({ kind: 'nope', symbol: 'X', issues: b, ...fake() })
    ).rejects.toThrow(/Unsupported/);
  });

  it('exposes the BSE flags', () => {
    expect(BSE_FLAGS.shareholding).toBe(23);
  });
});

describe('parseBrsr', () => {
  const doc = `<x>
<in-capmkt:DateOfEndOfFinancialYear contextRef="DCYMain">31-03-2026</in-capmkt:DateOfEndOfFinancialYear>
<in-capmkt:TotalScope1Emissions contextRef="DCYMain" unitRef="u">120</in-capmkt:TotalScope1Emissions>
<in-capmkt:TotalScope1Emissions contextRef="DPYMain" unitRef="u">100</in-capmkt:TotalScope1Emissions>
<in-capmkt:TotalScope2Emissions contextRef="DCYMain" unitRef="u">80</in-capmkt:TotalScope2Emissions>
<in-capmkt:TotalEnergyConsumedFromRenewableSources contextRef="DCYMain" unitRef="u">30</in-capmkt:TotalEnergyConsumedFromRenewableSources>
<in-capmkt:TotalEnergyConsumedFromRenewableAndNonRenewableSources contextRef="DCYMain" unitRef="u">100</in-capmkt:TotalEnergyConsumedFromRenewableAndNonRenewableSources>
<in-capmkt:TotalWasteGenerated contextRef="DCYMain" unitRef="u">5</in-capmkt:TotalWasteGenerated>
<in-capmkt:TotalWasteRecovered contextRef="DCYMain" unitRef="u">9</in-capmkt:TotalWasteRecovered>
</x>`;
  it('derives ratios, yoy changes, ISO dates and unit warnings', () => {
    const d = parseBrsr(parseXbrl(doc));
    expect(d.ok).toBe(true);
    expect(d.fyEnd).toBe('2026-03-31');
    expect(d.current.derived.renewableEnergyShare).toBe(0.3);
    expect(d.current.derived.scope1And2).toBe(200);
    expect(d.yoyPct['emissions.scope1']).toBe(20);
    expect(d.unitWarnings.join()).toMatch(/recovered exceeds/);
  });
  it('rejects documents without BRSR contexts', () => {
    expect(parseBrsr(parseXbrl('<x><in-capmkt:A contextRef="OneD">1</in-capmkt:A></x>')).ok).toBe(
      false
    );
  });
});
