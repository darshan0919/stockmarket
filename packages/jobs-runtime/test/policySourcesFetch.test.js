'use strict';
const { parseDate, parseFeed, kindHint, fixLink } = require('../lib/policySourcesFetch');

describe('policySourcesFetch', () => {
  test('parseDate handles RBI and SEBI formats without tz shift', () => {
    expect(parseDate('Sat, 10 Oct 2026 01:25:00')).toBe('2026-10-10');
    expect(parseDate('09 Oct, 2026 +0530')).toBe('2026-10-09');
    expect(parseDate('garbage')).toBeNull();
  });
  test('fixLink strips SEBI double https prefix', () => {
    expect(
      fixLink('https://www.sebi.gov.in/https://www.sebi.gov.in/a.pdf', 'doubleHttpsPrefix')
    ).toBe('https://www.sebi.gov.in/a.pdf');
    expect(fixLink('https://x.y/a', 'doubleHttpsPrefix')).toBe('https://x.y/a');
  });
  test('kindHint', () => {
    expect(kindHint('RBI MPC raises repo rate')).toBe('rate');
    expect(kindHint('Nothing relevant')).toBeNull();
  });
  test('parseFeed windows by date, drops undated/non-https, flags noise', () => {
    const xml = `<rss><channel>
<item><title>Master Direction on X</title><link>https://a.b/1</link><pubDate>09 Oct, 2026 +0530</pubDate></item>
<item><title>Old</title><link>https://a.b/2</link><pubDate>01 Jan, 2026 +0530</pubDate></item>
<item><title>NoLink</title><link>http://a.b/3</link><pubDate>09 Oct, 2026</pubDate></item>
<item><title>Adjudication Order in the matter of Z</title><link>https://a.b/4</link><pubDate>10 Oct, 2026</pubDate></item>
</channel></rss>`;
    const src = { id: 's', authority: 'official', noiseTitleRegex: '^Adjudication Order' };
    const r = parseFeed(xml, src, { sinceDate: '2026-10-04', today: '2026-10-11' });
    expect(r.map((x) => x.url)).toEqual(['https://a.b/1', 'https://a.b/4']);
    expect(r[0].kindHint).toBe('regulation');
    expect(r[1].likelyNoise).toBe(true);
  });
});
