'use strict';

const { splitSideBySide, splitRow } = require('../lib/pdfExtract/layout');

const PAGE = [
  'UNAUDITED FINANCIAL RESULTS FOR THE QUARTER ENDED JUNE 30, 2024',
  '(Rupees in crores)',
  '                          STANDALONE                     CONSOLIDATED',
  '                    Quarter ended   Year ended   Quarter ended   Year ended',
  'Revenue from operations   171.24 193.69 188.25 735.35   393.99 412.71 391.09 1,549.89',
  'Other income   6.69 5.43 4.65 30.29   13.85 15.88 9.15 45.07',
  'Total income   177.93 199.12 192.90 765.64   407.84 428.59 400.24 1,594.96',
  'Exceptional item (Refer Note No 6)   (3.12) - - (3.12) - - -',
  'Profit before tax   7.33 21.21 30.81 110.00   52.95 71.28 67.24 250.82',
].join('\n');

describe('splitSideBySide', () => {
  test('cuts a standalone | consolidated page into one text per block', () => {
    const r = splitSideBySide(PAGE);
    expect(r.order).toEqual(['standalone', 'consolidated']);
    expect(r.k).toBe(4);
    const [s, c] = r.parts;
    expect(s.basis).toBe('standalone');
    expect(s.text).toContain('Revenue from operations   171.24   193.69   188.25   735.35');
    expect(c.text).toContain('Revenue from operations   393.99   412.71   391.09   1,549.89');
    expect(s.text).not.toContain('393.99');
    expect(c.text).not.toContain('171.24');
  });
  test('a row whose column count does not match is dropped from both halves', () => {
    const r = splitSideBySide(PAGE);
    expect(r.parts[0].text).not.toContain('Exceptional item');
    expect(r.parts[1].text).not.toContain('Exceptional item');
  });
  test('consolidated first is respected', () => {
    const flipped = PAGE.replace(
      'STANDALONE                     CONSOLIDATED',
      'CONSOLIDATED                     STANDALONE'
    );
    expect(splitSideBySide(flipped).order).toEqual(['consolidated', 'standalone']);
  });
  test('a single-basis page, or one with too few paired rows, is not split', () => {
    expect(splitSideBySide('STANDALONE results for the quarter ended\nRevenue 1 2 3')).toBeNull();
    expect(splitSideBySide(PAGE.split('\n').slice(0, 6).join('\n'))).toBeNull();
  });
});

describe('splitRow', () => {
  test('takes the trailing numbers, not digits inside the label', () => {
    expect(splitRow('Finance costs (Refer Note 3)  0.08 0.15')).toEqual({
      label: 'Finance costs (Refer Note 3)',
      values: ['0.08', '0.15'],
    });
  });
});
