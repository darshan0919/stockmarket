/**
 * Tests for NSE-only stock bootstrap in stockDetailsFetcher
 * @file backend/scripts/__tests__/stockDetailsFetcher.nse.test.js
 */

const { stockFromNseQuote, quoteFromBseData } = require('../stockDetailsFetcher');

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

  it('maps BSE quote header into NSE quote shape', () => {
    const nseShape = quoteFromBseData(
      {
        CurrRate: { LTP: '100.5', Chg: '-2.5', PcChg: '-2.43' },
        Cmpname: { FullN: 'Test Company Ltd' },
      },
      {
        SecurityId: 'TEST',
        ISIN: 'INE000A00000',
        Industry: 'IT',
        Sector: 'Technology',
        PE: '20',
        FaceVal: '1',
      },
      'TEST'
    );

    expect(nseShape.priceInfo.lastPrice).toBe(100.5);
    expect(nseShape.priceInfo.previousClose).toBe(103);
    expect(nseShape.info.companyName).toBe('Test Company Ltd');
  });
});
