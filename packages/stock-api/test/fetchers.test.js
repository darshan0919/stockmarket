const { normaliseType, docYyyymm, parseDateFilter } = require('../src/fetchers/documentsFetcher');
const { inDateRange } = require('../src/fetchers/announcementsFetcher');
const { lastNQuarterDates, tokenize, extractNgrams } = require('../src/fetchers/announcementScanner');

describe('documentsFetcher', () => {
  it('normaliseType', () => {
    expect(normaliseType('Annual Report')).toBe('Annual Report');
    expect(normaliseType('ar')).toBe('Annual Report');
    expect(normaliseType('investor presentation')).toBe('PPT');
  });

  it('docYyyymm', () => {
    expect(docYyyymm({ date: '2025' })).toBe(202503);
    expect(docYyyymm({ date: '202509' })).toBe(202509);
  });
});

describe('announcementsFetcher', () => {
  it('inDateRange', () => {
    const ann = { date: '2025-05-10' };
    expect(inDateRange(ann, '2025-05-01', '2025-05-31')).toBe(true);
    expect(inDateRange(ann, '2025-06-01', '2025-06-30')).toBe(false);
  });
});

describe('announcementScanner', () => {
  it('lastNQuarterDates', () => {
    const dates = lastNQuarterDates(4);
    expect(dates).toHaveLength(4);
    // Should be something like ['202603', '202512', '202509', '202506'] (depending on current date)
    expect(dates[0]).toMatch(/^\d{6}$/);
  });

  it('tokenize and extractNgrams', () => {
    const texts = ['The quick brown fox jumps over the lazy dog'];
    const { unigrams, bigrams } = extractNgrams(texts, 5);
    expect(unigrams['quick']).toBe(1);
    expect(unigrams['brown']).toBe(1);
    expect(bigrams['quick brown']).toBe(1);
  });
});
