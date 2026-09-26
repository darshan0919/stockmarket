'use strict';

const { StockscansClient } = require('../src/clients/StockscansClient');

function fakeHttp(responseData) {
  const calls = [];
  return {
    calls,
    userAgent: 'test-agent',
    async post(url, payload, opts) {
      calls.push({ url, payload, opts });
      return { data: responseData };
    },
  };
}

// Fixture: user-supplied sample from a real `interviewScan` call for
// `q: "NEPHROPLUS"` (2026-09-25) — see docs/stockscans-api-schemas.md.
const SCAN_FIXTURE = {
  rows: [
    [
      'Y7YT7sqszzg',
      'NephroPlus Targets 15–20% Revenue Growth: 40–50 New Clinics Every Year | Business News | ET Now',
      '2026-09-25T11:40:11+05:30',
      562,
      true,
      'ET Now',
      [['NSE:NEPHROPLUS', 'Nephrocare Health Services Ltd', true]],
    ],
    [
      'Wvu5H6mVloQ',
      'NephroPlus Q1: Profit Soars 42% As International Expansion Drives Operating Leverage | Business News',
      '2026-08-12T13:45:06+05:30',
      397,
      true,
      'ET Now',
      [['NSE:NEPHROPLUS', 'Nephrocare Health Services Ltd', true]],
    ],
  ],
  next: null,
  total: 9,
  channels: [['UCI_mwTKUhicNzFrhm33MzBQ', 'ET Now']],
  subscription: 'Premium Plus',
};

// Fixture: live-captured response for `interviewDetail({videoId: 'Y7YT7sqszzg'})`
// (2026-09-25) — CONFIRMED LIVE, not the user-supplied guess (the real shape
// is `{takeaways: [[companyId, markdownBullets, null]], video: {...}}`, not a
// flat `takeaways: string[]`). See docs/stockscans-api-schemas.md.
const DETAIL_FIXTURE = {
  takeaways: [
    [
      'NSE:NEPHROPLUS',
      '- **Revenue growth guidance:** NephroPlus is targeting 15% to 20% annual revenue growth ...',
      null,
    ],
  ],
  video: {
    title:
      'NephroPlus Targets 15–20% Revenue Growth: 40–50 New Clinics Every Year | Business News | ET Now',
    channelName: 'ET Now',
    publishedAt: '2026-09-25T11:40:11+05:30',
    embeddable: true,
  },
};

describe('StockscansClient.interviewScan', () => {
  beforeEach(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
  });

  test('posts to the interview-scan endpoint with the given payload', async () => {
    const http = fakeHttp(SCAN_FIXTURE);
    const client = new StockscansClient({ http });

    const payload = {
      industry: [],
      index: [],
      watchlistIds: [],
      channelIds: [],
      q: 'NEPHROPLUS',
      cursor: '',
    };
    await client.interviewScan(payload);

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/scans/interview/run');
    expect(http.calls[0].payload).toEqual(payload);
    expect(http.calls[0].opts.headers.referer).toBe('https://www.stockscans.in/interview-scans');
  });

  test('returns the raw {rows, next, total, channels, subscription} envelope untouched', async () => {
    const http = fakeHttp(SCAN_FIXTURE);
    const client = new StockscansClient({ http });

    const result = await client.interviewScan({ q: 'NEPHROPLUS' });

    expect(result).toBe(SCAN_FIXTURE);
    expect(result.rows).toHaveLength(2);
    expect(result.next).toBeNull();
    expect(result.total).toBe(9);
  });

  test('row field positions match the documented schema (videoId, publishedAt, companies)', async () => {
    const http = fakeHttp(SCAN_FIXTURE);
    const client = new StockscansClient({ http });
    const { rows } = await client.interviewScan({ q: 'NEPHROPLUS' });

    const [videoId, title, publishedAt, durationSec, embeddable, channelName, companies] = rows[1];
    expect(videoId).toBe('Wvu5H6mVloQ');
    expect(title).toMatch(/Profit Soars 42%/);
    expect(publishedAt).toBe('2026-08-12T13:45:06+05:30');
    expect(durationSec).toBe(397);
    expect(embeddable).toBe(true);
    expect(channelName).toBe('ET Now');
    expect(companies).toEqual([['NSE:NEPHROPLUS', 'Nephrocare Health Services Ltd', true]]);
  });
});

describe('StockscansClient.interviewDetail', () => {
  beforeEach(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
  });

  test('posts {videoId} to the interview-detail endpoint', async () => {
    const http = fakeHttp(DETAIL_FIXTURE);
    const client = new StockscansClient({ http });

    await client.interviewDetail('Y7YT7sqszzg');

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/scans/interview/detail');
    expect(http.calls[0].payload).toEqual({ videoId: 'Y7YT7sqszzg' });
    expect(http.calls[0].opts.headers.referer).toBe('https://www.stockscans.in/interview-scans');
  });

  test('returns {takeaways, video} — takeaways is [companyId, markdownBullets, null][], not a flat string[]', async () => {
    const http = fakeHttp(DETAIL_FIXTURE);
    const client = new StockscansClient({ http });

    const result = await client.interviewDetail('Y7YT7sqszzg');

    expect(result).toBe(DETAIL_FIXTURE);
    expect(Array.isArray(result.takeaways)).toBe(true);
    const [companyId, markdownBullets, third] = result.takeaways[0];
    expect(companyId).toBe('NSE:NEPHROPLUS');
    expect(typeof markdownBullets).toBe('string');
    expect(markdownBullets).toMatch(/Revenue growth guidance/);
    expect(third).toBeNull();
    expect(result.video.channelName).toBe('ET Now');
  });
});
