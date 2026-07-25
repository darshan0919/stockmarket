'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@stock/api', () => ({
  nse: {},
  bse: {},
  stockscans: {},
  fetchEventReactionMetrics: jest.fn(),
  classifySignal: jest.fn(),
}));

const { fetchEventReactionMetrics, classifySignal } = require('@stock/api');
const svc = require('../src/features/screener/eventReactionService');

describe('eventReactionService (Drive/data-file cache, NOT MongoDB — see docs/DATA_RULES.md)', () => {
  let tmpDir;
  let OLD_ENV;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-reaction-svc-'));
    OLD_ENV = process.env.DATA_V2_DIR;
    process.env.DATA_V2_DIR = tmpDir;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.DATA_V2_DIR;
    else process.env.DATA_V2_DIR = OLD_ENV;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes into data/cache/event-reaction/<SYMBOL>.json, not a database connection', () => {
    expect(svc.cacheFile('ELECON')).toBe(
      path.join(tmpDir, 'cache', 'event-reaction', 'ELECON.json')
    );
  });

  describe('getLatestCached', () => {
    it('returns null when no cache file exists yet', async () => {
      expect(await svc.getLatestCached('ELECON', 'result')).toBeNull();
    });

    it('returns the most recent entry (by eventTimestamp) for the given eventType', async () => {
      fs.mkdirSync(path.dirname(svc.cacheFile('ELECON')), { recursive: true });
      fs.writeFileSync(
        svc.cacheFile('ELECON'),
        JSON.stringify({
          'result|2026-04-01T10:00:00+05:30': {
            eventType: 'result',
            eventTimestamp: '2026-04-01T10:00:00+05:30',
            metrics: { sinceResult: 0.01 },
          },
          'result|2026-07-10T11:47:46+05:30': {
            eventType: 'result',
            eventTimestamp: '2026-07-10T11:47:46+05:30',
            metrics: { sinceResult: 0.04 },
          },
          'concall|2026-07-09T22:21:12+05:30': {
            eventType: 'concall',
            eventTimestamp: '2026-07-09T22:21:12+05:30',
            metrics: { sinceResult: 0.02 },
          },
        })
      );

      const latest = await svc.getLatestCached('elecon', 'result');
      expect(latest.eventTimestamp).toBe('2026-07-10T11:47:46+05:30');
    });
  });

  describe('refreshEventReaction', () => {
    it('returns null without writing when no event is found', async () => {
      fetchEventReactionMetrics.mockResolvedValue({ event: null, metrics: null, apiCalls: {} });

      const result = await svc.refreshEventReaction('ELECON', 'result');

      expect(result).toBeNull();
      expect(fs.existsSync(svc.cacheFile('ELECON'))).toBe(false);
    });

    it('writes a new entry keyed by eventType|eventTimestamp for a new event', async () => {
      fetchEventReactionMetrics.mockResolvedValue({
        event: {
          source: 'NSE',
          headline: 'Outcome of Board Meeting',
          timestamp: '2026-07-10T11:47:46+05:30',
        },
        metrics: {
          sinceResult: 0.045,
          oneHour: 0.03,
          oneDay: null,
          oneWeek: null,
          oneMonth: null,
          note: 'window not yet elapsed',
        },
        apiCalls: { announcements: 3, ohlcv: 3 },
      });
      classifySignal.mockReturnValue({ oneDay: null, oneWeek: null, oneMonth: null, any: null });

      const result = await svc.refreshEventReaction('elecon', 'result');

      expect(result.eventTimestamp).toBe('2026-07-10T11:47:46+05:30');
      const onDisk = JSON.parse(fs.readFileSync(svc.cacheFile('ELECON'), 'utf8'));
      expect(onDisk['result|2026-07-10T11:47:46+05:30']).toBeDefined();
      expect(onDisk['result|2026-07-10T11:47:46+05:30'].companyId).toBe('ELECON');
    });

    it('accumulates history — a second, different event adds a new entry rather than overwriting', async () => {
      fetchEventReactionMetrics.mockResolvedValueOnce({
        event: { source: 'NSE', headline: 'Q1 Result', timestamp: '2026-04-01T10:00:00+05:30' },
        metrics: { sinceResult: 0.01, note: null },
        apiCalls: {},
      });
      classifySignal.mockReturnValue({
        oneDay: false,
        oneWeek: false,
        oneMonth: false,
        any: false,
      });
      await svc.refreshEventReaction('ELECON', 'result');

      fetchEventReactionMetrics.mockResolvedValueOnce({
        event: { source: 'NSE', headline: 'Q2 Result', timestamp: '2026-07-10T11:47:46+05:30' },
        metrics: { sinceResult: 0.045, note: null },
        apiCalls: {},
      });
      await svc.refreshEventReaction('ELECON', 'result');

      const onDisk = JSON.parse(fs.readFileSync(svc.cacheFile('ELECON'), 'utf8'));
      expect(Object.keys(onDisk)).toHaveLength(2);
      expect(onDisk['result|2026-04-01T10:00:00+05:30'].metrics.sinceResult).toBe(0.01);
      expect(onDisk['result|2026-07-10T11:47:46+05:30'].metrics.sinceResult).toBe(0.045);
    });

    it('is a no-op (no extra fetch, cache untouched) when the current event is already cached with settled metrics', async () => {
      fs.mkdirSync(path.dirname(svc.cacheFile('ELECON')), { recursive: true });
      const existingEntry = {
        companyId: 'ELECON',
        eventType: 'result',
        eventTimestamp: '2026-07-10T11:47:46+05:30',
        metrics: { sinceResult: 0.045, note: null },
      };
      fs.writeFileSync(
        svc.cacheFile('ELECON'),
        JSON.stringify({ 'result|2026-07-10T11:47:46+05:30': existingEntry })
      );
      fetchEventReactionMetrics.mockResolvedValue({
        event: {
          source: 'NSE',
          headline: 'Outcome of Board Meeting',
          timestamp: '2026-07-10T11:47:46+05:30',
        },
        metrics: { sinceResult: 0.045, note: null },
        apiCalls: {},
      });

      const result = await svc.refreshEventReaction('ELECON', 'result');

      expect(result).toEqual(existingEntry);
    });

    it('de-dupes concurrent refreshes for the same symbol+eventType into one fetch', async () => {
      let resolveMetrics;
      fetchEventReactionMetrics.mockReturnValue(
        new Promise((resolve) => {
          resolveMetrics = resolve;
        })
      );

      const p1 = svc.refreshEventReaction('ELECON', 'result');
      const p2 = svc.refreshEventReaction('ELECON', 'result');
      resolveMetrics({ event: null, metrics: null, apiCalls: {} });
      await Promise.all([p1, p2]);

      expect(fetchEventReactionMetrics).toHaveBeenCalledTimes(1);
    });

    it('swallows fetch errors and returns null instead of throwing', async () => {
      fetchEventReactionMetrics.mockRejectedValue(new Error('NSE 403'));
      await expect(svc.refreshEventReaction('ELECON', 'result')).resolves.toBeNull();
    });
  });

  describe('ensureEventReactionCached', () => {
    it('returns null immediately when nothing is cached, while still triggering a background refresh', async () => {
      fetchEventReactionMetrics.mockResolvedValue({ event: null, metrics: null, apiCalls: {} });

      const result = await svc.ensureEventReactionCached('ELECON', 'result');

      expect(result).toBeNull();
      expect(fetchEventReactionMetrics).toHaveBeenCalledWith(expect.anything(), 'ELECON', 'result');
    });

    it('reshapes a cached entry into the screener-web row.eventReaction shape', async () => {
      fs.mkdirSync(path.dirname(svc.cacheFile('ELECON')), { recursive: true });
      fs.writeFileSync(
        svc.cacheFile('ELECON'),
        JSON.stringify({
          'result|2026-07-10T11:47:46+05:30': {
            eventType: 'result',
            eventTimestamp: '2026-07-10T11:47:46+05:30',
            metrics: {
              sinceResult: 0.044,
              oneHour: 0.029,
              oneDay: null,
              oneWeek: null,
              oneMonth: null,
            },
          },
        })
      );
      fetchEventReactionMetrics.mockResolvedValue({ event: null, metrics: null, apiCalls: {} });

      const result = await svc.ensureEventReactionCached('elecon', 'result');

      expect(result).toEqual({
        timestamp: '2026-07-10T11:47:46+05:30',
        sinceResult: 0.044,
        oneHour: 0.029,
        oneDay: null,
        oneWeek: null,
        oneMonth: null,
      });
    });

    it('does not let a background refresh rejection propagate to the caller', async () => {
      fetchEventReactionMetrics.mockRejectedValue(new Error('boom'));
      await expect(svc.ensureEventReactionCached('ELECON', 'result')).resolves.toBeNull();
    });
  });
});
