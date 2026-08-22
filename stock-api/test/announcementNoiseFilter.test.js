'use strict';

const { keywordToRegExp } = require('../src/utils/announcementNoiseFilter.js');

describe('keywordToRegExp', () => {
  test('plain keyword behaves like a case-insensitive substring match', () => {
    const re = keywordToRegExp('board meeting');
    expect(re.test('Intimation of Board Meeting')).toBe(true);
    expect(re.test('Notice of AGM')).toBe(false);
  });

  test('a `*` matches any run of characters, including digits and letters', () => {
    const re = keywordToRegExp('notice of * agm');
    expect(re.test('notice of 41st agm')).toBe(true);
    expect(re.test('notice of 50th agm')).toBe(true);
    expect(re.test('notice of agm')).toBe(false); // `*` still needs to match something is not required: `.*` allows empty too
  });

  test('regex-special characters in the keyword are treated literally', () => {
    const re = keywordToRegExp('q1 (unaudited) results');
    expect(re.test('q1 (unaudited) results announcement')).toBe(true);
    expect(re.test('q1 unaudited results')).toBe(false);
  });

  test('multiple wildcards are all treated as `.*`', () => {
    const re = keywordToRegExp('* agm *');
    expect(re.test('notice of 41st agm intimation')).toBe(true);
  });
});
