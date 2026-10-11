'use strict';
const { tableHtml, sectorEnrichment } = require('../nearHighsDigest');

describe('near-highs digest enrichment', () => {
  const enrich = new Map([['IT Services', { rs1: 6.29, rs3: -2, flags: ['S2+', 'S1'] }]]);
  test('adds RS and Signals columns for enriched industries, dashes otherwise', () => {
    const html = tableHtml('t', [{ name: 'IT Services', count: 4 }, { name: 'Steel', count: 3 }], {}, {}, 'industry', enrich);
    expect(html).toContain('RS 1M / 3M');
    expect(html).toContain('+6.29');
    expect(html).toContain('-2');
    expect(html).toContain('S2+ S1');
    expect(html).toContain('–');
  });
  test('sector table (no enrichment) keeps the old 4 columns', () => {
    const html = tableHtml('t', [{ name: 'X', count: 1 }], {}, {}, 'sector');
    expect(html).not.toContain('RS 1M / 3M');
  });
  test('sectorEnrichment never throws', () => {
    expect(sectorEnrichment() instanceof Map).toBe(true);
  });
});
