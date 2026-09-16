'use strict';

const { fetchAllResultsPages } = require('../jobs/daily_results_extractor');

/**
 * Covers the 2026-09-16 Stockscans path migration's breaking DTO change on
 * `resultsScan`: the old `response.data.results` array was replaced by a
 * top-level `resultTables` array of nested records
 * `{companyId, metaRatios, resultTable, documents}`. This test locks in
 * `fetchAllResultsPages`'s mapping from that new shape back to the flat
 * `{companyId, Name, resultSsUrl, pptSsUrl, transcriptSsUrl}` shape the rest
 * of the pipeline (and `main()`'s companies.map) still expects.
 */
describe('daily_results_extractor.fetchAllResultsPages (post-migration resultTables shape)', () => {
  function fakeClient(pages) {
    let call = 0;
    return {
      resultsScan: jest.fn(async () => {
        const page = pages[call];
        call += 1;
        return page;
      }),
    };
  }

  test('flattens resultTables into the legacy per-company record shape', async () => {
    const client = fakeClient([
      {
        status: 200,
        resultTables: [
          {
            companyId: 'NSE:SIRCA',
            metaRatios: { Name: 'Sirca Paints India Ltd' },
            resultTable: { C: [], S: null },
            documents: [
              { ssUrl: 'result-abc.pdf', documentType: 'Result', hasNotes: false },
              { ssUrl: 'ppt-def.pdf', documentType: 'PPT', hasNotes: false },
              { ssUrl: 'transcript-ghi.pdf', documentType: 'Transcript', hasNotes: true },
            ],
          },
        ],
      },
    ]);

    const result = await fetchAllResultsPages(client, '2026-09-15');

    expect(result.status).toBe('success');
    expect(result.allCompanies).toHaveLength(1);
    expect(result.allCompanies[0]).toEqual({
      companyId: 'NSE:SIRCA',
      Name: 'Sirca Paints India Ltd',
      resultSsUrl: 'result-abc.pdf',
      pptSsUrl: 'ppt-def.pdf',
      transcriptSsUrl: 'transcript-ghi.pdf',
    });
  });

  test('stops pagination when resultTables is empty', async () => {
    const client = fakeClient([{ status: 200, resultTables: [] }]);

    const result = await fetchAllResultsPages(client, '2026-09-15');

    expect(result.status).toBe('success');
    expect(result.allCompanies).toHaveLength(0);
    expect(result.pageCount).toBe(0);
    expect(client.resultsScan).toHaveBeenCalledTimes(1);
  });

  test('tolerates missing documents/metaRatios on a record without throwing', async () => {
    const client = fakeClient([
      {
        status: 200,
        resultTables: [{ companyId: 'NSE:EMPTY', metaRatios: {}, resultTable: {} }],
      },
    ]);

    const result = await fetchAllResultsPages(client, '2026-09-15');

    expect(result.status).toBe('success');
    expect(result.allCompanies[0]).toEqual({
      companyId: 'NSE:EMPTY',
      Name: undefined,
      resultSsUrl: undefined,
      pptSsUrl: undefined,
      transcriptSsUrl: undefined,
    });
  });
});
