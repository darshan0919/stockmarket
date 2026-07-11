'use strict';

const { fetchReactionCandles, fetchTier, toIstNaiveString } = require('../src/fetchers/reactionCandlesFetcher');

/** Build a fake StockscansClient whose ohlcv() serves synthetic 1-minute-spaced
 * candles from a fixed pool, honoring `tf` (spacing) and `before` (cursor),
 * paginated PAGE_SIZE at a time — close enough to the real API to exercise the
 * cursor logic without hitting the network. */
function fakeStockscans({ earliestMs, latestMs, pageSize = 1000 }) {
  const calls = [];
  return {
    calls,
    async ohlcv(ticker, { tf, before }) {
      calls.push({ tf, before });
      const stepMs = { '1m': 60e3, '5m': 5 * 60e3, '15m': 15 * 60e3, '1h': 3600e3, '1D': 86400e3 }[tf];
      // tf=1D sends a bare 'YYYY-MM-DD' `before` (date-only); everything else
      // sends a naive IST timestamp — mirror the real API's two formats.
      const beforeMs = /^\d{4}-\d{2}-\d{2}$/.test(before)
        ? Date.parse(`${before}T00:00:00+05:30`)
        : Date.parse(`${before}+05:30`);
      // Emit up to pageSize candles at `stepMs` spacing, strictly before `beforeMs`,
      // clipped to [earliestMs, latestMs].
      const rows = [];
      let t = beforeMs - stepMs;
      while (rows.length < pageSize && t >= earliestMs) {
        if (t <= latestMs) rows.unshift(t);
        t -= stepMs;
      }
      const prices = rows.map((ms) => {
        const iso = new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 19);
        return [iso, 100, 101, 99, 100.5, 10];
      });
      const hasMore = rows.length > 0 && rows[0] - stepMs >= earliestMs;
      return { companyId: ticker, tf, prices, hasMore };
    },
  };
}

describe('toIstNaiveString', () => {
  it('round-trips an epoch back to the naive IST string Stockscans expects', () => {
    // 2026-07-10T11:47:46 IST == 2026-07-10T06:17:46Z
    const ms = Date.parse('2026-07-10T06:17:46.000Z');
    expect(toIstNaiveString(ms)).toBe('2026-07-10T11:47:46');
  });
});

describe('fetchTier', () => {
  it('covers [stopAtMs, targetMs] within one page in exactly 1 API call when the gap fits a page span', async () => {
    const now = Date.parse('2026-07-10T12:00:00.000Z');
    const eventMs = now - 30 * 60e3; // 30 min ago
    const targetMs = eventMs + 60 * 60e3; // event + 1hr (partly in the future — clipped to "now")
    const ss = fakeStockscans({ earliestMs: eventMs - 5 * 3600e3, latestMs: now });

    const { candles, calls } = await fetchTier(ss, 'NSE:TEST', '1m', targetMs, { stopAtMs: eventMs });

    expect(calls).toBe(1);
    expect(candles[0].t).toBeLessThanOrEqual(eventMs);
    expect(candles[candles.length - 1].t).toBeLessThanOrEqual(now);
  });

  it('paginates (bounded) when the [stopAtMs, targetMs] gap exceeds one page span', async () => {
    // A single 1000-candle 1m page spans ~16.6h. Ask for a 2-day gap (an
    // unrealistic ask for the "near" tier in practice, but the right way to
    // exercise the pagination fallback deterministically): this must page
    // more than once to reach stopAtMs.
    const now = Date.parse('2026-07-10T12:00:00.000Z');
    const eventMs = now - 5 * 24 * 3600e3;
    const targetMs = eventMs + 2 * 24 * 3600e3; // 2-day gap >> ~16.6h page span
    const ss = fakeStockscans({ earliestMs: eventMs - 3600e3, latestMs: now });

    const { candles, calls } = await fetchTier(ss, 'NSE:TEST', '1m', targetMs, { stopAtMs: eventMs, maxPages: 6 });

    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(6);
    expect(candles[0].t).toBeLessThanOrEqual(eventMs);
  });

  it('respects maxPages as a hard cap even if stopAtMs is never reached', async () => {
    const now = Date.parse('2026-07-10T12:00:00.000Z');
    const eventMs = now - 30 * 24 * 3600e3; // gap far exceeds what 2 pages of 1m can cover
    const targetMs = eventMs + 10 * 24 * 3600e3;
    const ss = fakeStockscans({ earliestMs: now - 40 * 24 * 3600e3, latestMs: now });

    const { calls } = await fetchTier(ss, 'NSE:TEST', '1m', targetMs, { stopAtMs: eventMs, maxPages: 2 });

    expect(calls).toBe(2);
  });

  it('regression: a fixed target/stopAt gap always resolves in 1 call regardless of how long ago the event was (cursor anchors on the gap, not on "now")', async () => {
    const now = Date.parse('2026-07-10T12:00:00.000Z');
    const eventMs = now - 20 * 24 * 3600e3; // 20 days ago
    const targetMs = eventMs + 60 * 60e3; // event + 1hr — the real "near" tier usage
    const ss = fakeStockscans({ earliestMs: now - 40 * 24 * 3600e3, latestMs: now });

    const { calls } = await fetchTier(ss, 'NSE:TEST', '1m', targetMs, { stopAtMs: eventMs, maxPages: 4 });

    expect(calls).toBe(1);
  });
});

describe('fetchReactionCandles', () => {
  it('answers all four windows in exactly 3 API calls (one per tier) for a same-day recent event', async () => {
    const now = Date.parse('2026-07-10T06:20:00.000Z'); // ~ 11:50 IST
    const eventTimestamp = '2026-07-10T11:47:46+05:30'; // ~2min before "now" fixture below is irrelevant; fetchTier uses Date.now()
    // fakeStockscans has data from well before the event through "now".
    const eventMs = Date.parse(eventTimestamp);
    const ss = fakeStockscans({ earliestMs: eventMs - 40 * 24 * 3600e3, latestMs: eventMs + 5 * 60e3 });

    const result = await fetchReactionCandles(ss, 'NSE:ELECON', eventTimestamp);

    // near(1m)+mid(15m)+far(1d): each should resolve in 1 call since the event
    // is recent (target windows for mid/far are in the future, clipped to "now").
    expect(result.calls).toBe(3);
    expect(result.tiers.near.tf).toBe('1m');
    expect(result.tiers.mid.tf).toBe('15m');
    expect(result.tiers.far.tf).toBe('1D');
    expect(result.candles.length).toBeGreaterThan(0);
    // Ascending, deduped.
    for (let i = 1; i < result.candles.length; i++) {
      expect(result.candles[i].t).toBeGreaterThan(result.candles[i - 1].t);
    }
  });

  it('throws on an invalid event timestamp instead of silently returning empty data', async () => {
    const ss = fakeStockscans({ earliestMs: 0, latestMs: Date.now() });
    await expect(fetchReactionCandles(ss, 'NSE:X', 'not-a-date')).rejects.toThrow(/invalid eventTimestamp/);
  });
});
