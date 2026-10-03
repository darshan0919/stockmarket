'use strict';

const { adaptGuidanceDtoToPeadCandidate, adaptBatch } = require('../lib/peadCandidateAdapter.js');

describe('peadCandidateAdapter', () => {
  const sampleDto = {
    companyId: 'NSE:AVALON',
    companyName: 'Avalon Technologies Ltd',
    quarter: 'Q1FY27',
    transcriptAvailable: true,
    scanRow: { Sector: 'Electronic Manufacturing Services' },
    guidance: [
      {
        metric_category: 'Top Line',
        metric: 'Revenue',
        period_guided: 'FY27',
        relative_pct: 28.0,
        quote: 'FY27 revenue growth 26%-30% (raised from 24%-27%)',
        qoq_status: 'revised',
      },
      {
        metric_category: 'Margins',
        metric: 'EBITDA margin',
        period_guided: 'FY27',
        absolute_value: 12.5,
        absolute_unit: '%',
        quote: 'EBITDA margins around 12% to 13% for FY27',
        qoq_status: 'reaffirmed',
      },
    ],
  };

  test('correctly adapts forward-guidance DTO into PEAD candidate', () => {
    const candidate = adaptGuidanceDtoToPeadCandidate(sampleDto);

    expect(candidate.ticker).toBe('NSE:AVALON');
    expect(candidate.name).toBe('Avalon Technologies Ltd');
    expect(candidate.sector).toBe('Electronic Manufacturing Services');
    expect(candidate.tier).toBe(2);
    expect(candidate.rev_guided).toBe('FY27 revenue growth 26%-30% (raised from 24%-27%)');
    expect(candidate.rev_guided_pct).toBe(28.0);
    expect(candidate.margin_guided).toBe('EBITDA margins around 12% to 13% for FY27');
    expect(candidate.qoq_status).toBe('revised');
    expect(candidate.growth_inputs).toEqual({
      guided_fy: 'FY27',
      revenue: { growth_pct: 28.0, basis: 'explicit' },
      operating_profit: { opm_pct: 12.5, basis: 'explicit' },
    });
  });

  test('correctly splits batch into candidates and excluded', () => {
    const emptyDto = {
      companyId: 'NSE:NOTRANSCRIPT',
      quarter: 'Q1FY27',
      transcriptAvailable: false,
      guidance: [],
    };

    const { candidates, excluded } = adaptBatch([sampleDto, emptyDto]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].ticker).toBe('NSE:AVALON');

    expect(excluded).toHaveLength(1);
    expect(excluded[0].ticker).toBe('NSE:NOTRANSCRIPT');
    expect(excluded[0].reason).toContain('No transcript');
  });
});
