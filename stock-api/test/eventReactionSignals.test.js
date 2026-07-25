'use strict';

const {
  classifyEventText,
  parseNseTimestamp,
  parseBseTimestamp,
  mergeAnnouncements,
  findLatestEvent,
  earliestEventTimestamp,
  normalizeOhlcv,
  computeReactionMetrics,
  classifySignal,
  SIGNAL_THRESHOLDS,
} = require('../src/analyzers/eventReactionSignals');

// Fixtures captured live 10-Jul-2026 against Elecon Engineering's actual results
// (see NseClient.getCorporateAnnouncements / BseClient.getAnnouncements /
// StockscansClient.ohlcv doc comments for the verification notes).
const NSE_ROWS = [
  {
    symbol: 'ELECON',
    desc: 'Press Release',
    an_dt: '10-Jul-2026 12:07:43',
    exchdisstime: '10-Jul-2026 12:07:44',
  },
  {
    symbol: 'ELECON',
    desc: 'Outcome of Board Meeting',
    an_dt: '10-Jul-2026 11:47:44',
    exchdisstime: '10-Jul-2026 11:47:46',
  },
];

const BSE_ROWS = [
  {
    NEWSSUB: 'Announcement under Regulation 30 (LODR)-Press Release / Media Release',
    CATEGORYNAME: 'Company Update',
    DissemDT: '2026-07-10T12:06:54.22',
    News_submission_dt: '2026-07-10T12:06:54',
  },
  {
    NEWSSUB: 'Financial Results For The Quarter Ended On 30Th June, 2026',
    CATEGORYNAME: 'Result',
    DissemDT: '2026-07-10T11:53:30.63',
    News_submission_dt: '2026-07-10T11:53:30',
  },
  {
    NEWSSUB: 'Board Meeting Outcome for Outcome Of Board Meeting Held On 10Th July, 2026',
    CATEGORYNAME: 'Board Meeting',
    DissemDT: '2026-07-10T11:46:21.317',
    News_submission_dt: '2026-07-10T11:46:21',
  },
  {
    NEWSSUB: 'Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Intimation',
    CATEGORYNAME: 'Company Update',
    DissemDT: '2026-07-07T15:43:02.787',
    News_submission_dt: '2026-07-07T15:43:02',
  },
];

// A slice of the live NSE:ELECON 1m OHLCV response spanning the result minute.
const OHLCV_ROWS = [
  ['2026-07-10T11:45:00', 515.4, 515.45, 514.95, 515.0, 331],
  ['2026-07-10T11:46:00', 515.95, 515.95, 503.4, 504.5, 44508],
  ['2026-07-10T11:47:00', 505.0, 505.95, 485.65, 489.3, 129326],
  ['2026-07-10T11:48:00', 487.9, 490.3, 484.6, 485.55, 83192],
  ['2026-07-10T12:48:00', 490.0, 491.0, 489.0, 490.5, 20000], // ~+1hr from 11:48 anchor
];

describe('classifyEventText', () => {
  it('classifies results, concalls, orders, monthly updates', () => {
    expect(classifyEventText('Outcome of Board Meeting')).toBe('result');
    expect(classifyEventText('Financial Results for the quarter')).toBe('result');
    expect(classifyEventText('Analysts/Institutional Investor Meet/Con. Call Updates')).toBe(
      'concall'
    );
    expect(classifyEventText('Award of Order(s)/Contract(s)')).toBe('order');
    expect(classifyEventText('Monthly Business Update')).toBe('monthly_update');
    expect(classifyEventText('Press Release')).toBeNull();
  });
});

describe('timestamp parsing', () => {
  it('parses NSE DD-Mon-YYYY HH:mm:ss as IST', () => {
    expect(parseNseTimestamp('10-Jul-2026 11:47:46')).toBe('2026-07-10T11:47:46+05:30');
  });
  it('parses BSE ISO-with-ms as IST', () => {
    expect(parseBseTimestamp('2026-07-10T11:46:21.317')).toBe('2026-07-10T11:46:21.317+05:30');
  });
  it('returns null on garbage', () => {
    expect(parseNseTimestamp('not a date')).toBeNull();
    expect(parseBseTimestamp('')).toBeNull();
  });
});

describe('mergeAnnouncements + findLatestEvent', () => {
  const events = mergeAnnouncements(NSE_ROWS, BSE_ROWS);

  it('classifies and time-sorts across exchanges, dropping unclassifiable rows', () => {
    // 2 NSE rows (1 classifiable: Outcome of Board Meeting; Press Release drops)
    // 4 BSE rows (2 classifiable: Board Meeting Outcome + Financial Results)
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.source)).toEqual(['BSE', 'NSE', 'BSE']);
    expect(events[0].timestamp < events[1].timestamp).toBe(true);
  });

  it('finds the latest event of a category across the whole history', () => {
    const latest = findLatestEvent(events, 'result');
    expect(latest.source).toBe('BSE');
    expect(latest.timestamp).toBe('2026-07-10T11:53:30.63+05:30');
  });

  it('time-window feature: restricts to events within [start, end]', () => {
    const windowed = findLatestEvent(events, 'result', { end: '2026-07-09T23:59:59+05:30' });
    expect(windowed).toBeNull();

    const inWindow = findLatestEvent(events, 'result', {
      start: '2026-07-10T11:47:00+05:30',
      end: '2026-07-10T11:48:00+05:30',
    });
    expect(inWindow.source).toBe('NSE');
  });

  it('earliestEventTimestamp takes the min across exchanges (BSE board-meeting sub-announcement led NSE by ~85s)', () => {
    const nseResult = findLatestEvent(
      events.filter((e) => e.source === 'NSE'),
      'result'
    );
    const bseResult = events.find((e) => e.headline.includes('Board Meeting Outcome'));
    expect(earliestEventTimestamp(nseResult, bseResult)).toBe(bseResult.timestamp);
  });
});

describe('normalizeOhlcv + computeReactionMetrics', () => {
  it('normalises rows to ascending epoch-ms candles', () => {
    const candles = normalizeOhlcv(OHLCV_ROWS);
    expect(candles).toHaveLength(5);
    expect(candles[0].t).toBeLessThan(candles[1].t);
    expect(candles[0].close).toBe(515.0);
  });

  it('anchors on the first candle at/after the event timestamp and computes sinceResult/1hr', () => {
    const candles = normalizeOhlcv(OHLCV_ROWS);
    // Event disseminated 11:47:46 -> anchor should be the 11:48 candle (open 487.9)
    const metrics = computeReactionMetrics(candles, '2026-07-10T11:47:46+05:30');
    expect(metrics.anchor.open).toBe(487.9);
    // sinceResult uses the LAST candle in the series (12:48, close 490.5)
    expect(metrics.sinceResult).toBeCloseTo(490.5 / 487.9 - 1, 10);
    // oneHour target = anchor.t + 1hr = 12:48 exactly -> matches the last candle
    expect(metrics.oneHour).toBeCloseTo(490.5 / 487.9 - 1, 10);
    // 1day/1month can't be answered from an hour of candles -> pending, not silently wrong
    expect(metrics.oneDay).toBeNull();
    expect(metrics.oneMonth).toBeNull();
    expect(metrics.note).toMatch(/not yet elapsed/);
  });

  it('does not fabricate a return for a window that has not elapsed yet (regression: previously equalled sinceResult)', () => {
    // Only 2 candles, event right before both — 1hr window target is beyond the
    // last candle, so must be null, NOT silently equal to sinceResult.
    const candles = normalizeOhlcv([
      ['2026-07-10T11:47:00', 505, 505, 505, 505, 1],
      ['2026-07-10T11:48:00', 487.9, 490, 484, 485.5, 1],
    ]);
    const metrics = computeReactionMetrics(candles, '2026-07-10T11:47:46+05:30');
    expect(metrics.sinceResult).not.toBeNull();
    expect(metrics.oneHour).toBeNull();
  });

  it('returns a "no candles" note when the series is empty', () => {
    const metrics = computeReactionMetrics([], '2026-07-10T11:47:46+05:30');
    expect(metrics.anchor).toBeNull();
    expect(metrics.note).toMatch(/no event timestamp or no candles/);
  });

  it('returns an "after last candle" note when the event postdates all available data', () => {
    const candles = normalizeOhlcv(OHLCV_ROWS);
    const metrics = computeReactionMetrics(candles, '2026-07-11T09:00:00+05:30');
    expect(metrics.anchor).toBeNull();
    expect(metrics.note).toMatch(/after the last available candle/);
  });

  it('exposes oneWeek alongside the other windows', () => {
    const candles = normalizeOhlcv(OHLCV_ROWS);
    const metrics = computeReactionMetrics(candles, '2026-07-10T11:47:46+05:30');
    expect(metrics).toHaveProperty('oneWeek');
    // Only ~1hr of data in this fixture -> oneWeek can't be answered yet.
    expect(metrics.oneWeek).toBeNull();
  });
});

describe('classifySignal', () => {
  it('uses the documented thresholds: 1day>4%, 1week>6%, 1month>10%', () => {
    expect(SIGNAL_THRESHOLDS).toEqual({ oneDay: 0.04, oneWeek: 0.06, oneMonth: 0.1 });
  });

  it('flags a move as signal when it clears the threshold, in either direction', () => {
    const s = classifySignal({ oneDay: 0.05, oneWeek: 0.03, oneMonth: -0.12 });
    expect(s.oneDay).toBe(true); // 5% > 4%
    expect(s.oneWeek).toBe(false); // 3% < 6%
    expect(s.oneMonth).toBe(true); // -12% magnitude > 10%
    expect(s.any).toBe(true);
  });

  it('treats a below-threshold move as noise (false), distinct from not-yet-computable (null)', () => {
    const s = classifySignal({ oneDay: 0.01, oneWeek: null, oneMonth: null });
    expect(s.oneDay).toBe(false);
    expect(s.oneWeek).toBeNull();
    expect(s.oneMonth).toBeNull();
    expect(s.any).toBe(false); // the one known window is below threshold
  });

  it('reports any:null when nothing is computable yet (all windows pending)', () => {
    const s = classifySignal({ oneDay: null, oneWeek: null, oneMonth: null });
    expect(s.any).toBeNull();
  });

  it('handles a missing/undefined metrics object without throwing', () => {
    expect(classifySignal(undefined)).toEqual({
      oneDay: null,
      oneWeek: null,
      oneMonth: null,
      any: null,
    });
  });
});
