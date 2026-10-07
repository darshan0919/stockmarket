'use strict';

const { mergeParses, headlineAgreed } = require('../lib/pdfExtract/consensus');

describe('mergeParses', () => {
  test('the value most reads agree on wins over the best single read', () => {
    const m = mergeParses([
      { cur: { revenue: 4373.62, pat: 4.75 }, unit: 'lakh' },
      { cur: { revenue: 4373.62, pat: 475.22 }, unit: 'lakh' },
      { cur: { revenue: 4373.62, pat: 475.22 }, unit: 'lakh' },
    ]);
    expect(m.cur).toEqual({ revenue: 4373.62, pat: 475.22 });
    expect(m.votes).toEqual({ revenue: 3, pat: 2 });
  });
  test('a tie goes to the earlier read, and a field only one read has keeps one vote', () => {
    const m = mergeParses([{ cur: { revenue: 10, tax: 2 } }, { cur: { revenue: 11 } }]);
    expect(m.cur).toEqual({ revenue: 10, tax: 2 });
    expect(m.votes).toEqual({ revenue: 1, tax: 1 });
  });
  test('unit and basis follow the majority and ignore unknown', () => {
    const m = mergeParses([
      { cur: { revenue: 1 }, unit: 'unknown', basis: 'standalone' },
      { cur: { revenue: 1 }, unit: 'lakh', basis: 'consolidated' },
      { cur: { revenue: 1 }, unit: 'lakh', basis: 'consolidated' },
    ]);
    expect(m.unit).toBe('lakh');
    expect(m.basis).toBe('consolidated');
  });
  test('empty input is safe', () => {
    expect(mergeParses([]).cur).toEqual({});
    expect(mergeParses(null).reads).toBe(0);
  });
});

describe('headlineAgreed', () => {
  test('needs two headline fields, each backed by two reads', () => {
    expect(headlineAgreed({ cur: { revenue: 1, pat: 2 }, votes: { revenue: 2, pat: 2 } })).toBe(
      true
    );
    expect(headlineAgreed({ cur: { revenue: 1, pat: 2 }, votes: { revenue: 2, pat: 1 } })).toBe(
      false
    );
    expect(headlineAgreed({ cur: { revenue: 1 }, votes: { revenue: 3 } })).toBe(false);
  });
});
