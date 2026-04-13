/**
 * Tests for NSE-only stock bootstrap in stockDetailsFetcher
 * @file backend/scripts/__tests__/stockDetailsFetcher.nse.test.js
 */

const { stockFromNseQuote } = require('../stockDetailsFetcher');

describe('stockFromNseQuote', () => {
  it('maps NSE quote-equity info into a Stock document', () => {
    const nseData = {
      info: {
        companyName: 'Test Co',
        industry: 'IT',
        isin: 'INE000A00000',
        macro: 'Technology',
      },
      metadata: { sectorName: 'IT Services' },
      securityInfo: { faceValue: 2 },
    };

    const doc = stockFromNseQuote('TESTCO', nseData);

    expect(doc.symbol).toBe('TESTCO');
    expect(doc.name).toBe('Test Co');
    expect(doc.isin).toBe('INE000A00000');
    expect(doc.industry).toBe('IT');
    expect(doc.face_value).toBe(2);
  });
});
