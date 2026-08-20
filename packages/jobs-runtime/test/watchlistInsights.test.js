'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

// Point notes/validation at temp dirs BEFORE requiring the module (paths bind at load).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wi-'));
process.env.DATA_V2_DIR = TMP;

jest.mock('@stock/api', () => ({
  stockscans: { scanAnnouncements: jest.fn(), fetchPdf: jest.fn() },
  S3_BASE_URL: 'https://s3.example/docs/',
}));

const wi = require('../watchlistInsights');
const { NotesDb } = require('../lib/notesDb');

describe('categoriseAnnouncement (first match wins)', () => {
  test.each([
    ['Bagging of new order from L&T', '', 'order_book'],
    ['Disclosure under SAST Regulation 29', 'promoter bought', 'shareholding_change'],
    ['Credit rating upgrade by CRISIL', '', 'credit_rating'],
    ['Outcome of EGM', 'special resolution', 'agm_egm'],
    ['Some unrelated press note', 'nothing here', 'general'],
  ])('%s → %s', (title, desc, expected) => {
    expect(wi.categoriseAnnouncement(title, desc)).toBe(expected);
  });
});

describe('noise filter', () => {
  test('matches insignificant keywords', () => {
    expect(wi.isNoise('Closure of Trading Window', '')).toBe(true);
    expect(wi.matchedNoiseKeyword('Intimation of Record Date', '')).toBe(
      'intimation of record date'
    );
    expect(wi.isNoise('Bagging large order', 'EPC win')).toBe(false);
  });
});

describe('announcementId', () => {
  test('uses ssUrl when present, else composite key', () => {
    expect(wi.announcementId({ ssUrl: 'abc.pdf' })).toBe('abc.pdf');
    expect(
      wi.announcementId({
        companyId: 'NSE:X',
        date: '2026-06-27',
        title: 'A very long announcement title here',
      })
    ).toBe('NSE:X_2026-06-27_A very long announcement title');
  });
});

describe('insightTemplate', () => {
  test('includes global rules + the category block', () => {
    const t = wi.insightTemplate('order_book');
    expect(t).toContain('GLOBAL RULES');
    expect(t).toContain('CATEGORY: order_book');
  });
  test('unknown category falls back to general', () => {
    expect(wi.insightTemplate('nope')).toContain('CATEGORY: general');
  });
});

describe('buildDigestHtml', () => {
  test('buckets by significance and suppresses routine', () => {
    const html = wi.buildDigestHtml([
      {
        companyId: 'NSE:A',
        ticker: 'NSE:A',
        name: 'A',
        title: 'Big order',
        significance: 'high',
        insight: 'won 500cr',
        tags: ['order_win'],
        pdfUrl: 'p',
      },
      {
        companyId: 'NSE:B',
        ticker: 'NSE:B',
        name: 'B',
        title: 'Minor',
        significance: 'routine',
        insight: 'meh',
        tags: [],
      },
    ]);
    expect(html).toContain('High Significance');
    expect(html).toContain('won 500cr');
    expect(html).not.toContain('meh'); // routine suppressed
    expect(html).toContain('2 announcements across 2 companies'); // count is pre-bucket
  });
});

describe('parseWatchlistIds', () => {
  test('splits + trims a comma-separated list', () => {
    expect(wi.parseWatchlistIds(' id1, id2 ,id3')).toEqual(['id1', 'id2', 'id3']);
  });
  test('throws when missing/empty', () => {
    expect(() => wi.parseWatchlistIds('')).toThrow(/watchlistIds required/);
    expect(() => wi.parseWatchlistIds(undefined)).toThrow(/watchlistIds required/);
    expect(() => wi.parseWatchlistIds(',, ,')).toThrow(/watchlistIds required/);
  });
});

describe('gatherInwindowRaw (pagination + 24h window)', () => {
  test('stops once the last item on a page is older than 24h', async () => {
    const now = new Date('2026-06-27T12:00:00+05:30');
    const iso = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
    const client = {
      validateAuth: jest.fn().mockResolvedValue(true),
      scanAnnouncements: jest
        .fn()
        .mockResolvedValueOnce({
          announcements: [
            { companyId: 'NSE:A', createdAt: iso(1) },
            { companyId: 'NSE:B', createdAt: iso(5) },
          ],
        })
        .mockResolvedValueOnce({
          announcements: [
            { companyId: 'NSE:C', createdAt: iso(20) },
            { companyId: 'NSE:D', createdAt: iso(30) },
          ],
        }),
    };
    const out = await wi.gatherInwindowRaw(client, now, ['wl-1']);
    // D (30h) is outside the window and dropped; A,B,C kept
    expect(out.map((a) => a.companyId)).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
    expect(client.scanAnnouncements).toHaveBeenCalledTimes(2);
  });
});

describe('deterministic default window (anchor floor + resumable cursor)', () => {
  test("anchor floor is the previous calendar day's 8AM IST, regardless of same-day delay", () => {
    const onTime = new Date('2026-08-04T02:35:00.000Z'); // ~8:05 AM IST
    const delayed = new Date('2026-08-04T08:30:00.000Z'); // ~2:00 PM IST, same day
    const expectedFloor = new Date('2026-08-03T02:30:00.000Z').getTime(); // Aug 3, 8:00 AM IST
    expect(wi.defaultWindowFloorMs(onTime)).toBe(expectedFloor);
    expect(wi.defaultWindowFloorMs(delayed)).toBe(expectedFloor);
  });

  test("mostRecentEightAmIstMs rolls back to yesterday when now is before today's 8AM IST", () => {
    const beforeEight = new Date('2026-08-04T01:00:00.000Z'); // ~6:30 AM IST
    expect(wi.mostRecentEightAmIstMs(beforeEight)).toBe(
      new Date('2026-08-03T02:30:00.000Z').getTime()
    );
  });

  test('windowCursorKey is order-independent', () => {
    expect(wi.windowCursorKey(['b', 'a', 'c'])).toBe(wi.windowCursorKey(['c', 'b', 'a']));
  });

  test('resolveWindowHours: no cursor + no flag → hours back to the anchor floor', () => {
    const dir = path.join(TMP, 'window-no-cursor');
    process.env.DATA_V2_DIR = dir;
    try {
      const now = new Date('2026-08-04T08:30:00.000Z'); // 2:00 PM IST, same-day delay
      const hours = wi.resolveWindowHours(now, ['wl-a'], []);
      // floor = Aug 3 8:00 AM IST → ~30h back from 2:00 PM IST same day
      expect(hours).toBeCloseTo(30, 1);
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });

  test('resolveWindowHours: --window-hours flag always overrides the default', () => {
    const now = new Date('2026-08-04T02:35:00.000Z');
    expect(wi.resolveWindowHours(now, ['wl-a'], ['--window-hours', '72'])).toBe(72);
  });

  test('resolveWindowHours: a stale cursor extends the window further back than the anchor floor', async () => {
    const dir = path.join(TMP, 'window-stale-cursor');
    process.env.DATA_V2_DIR = dir;
    try {
      const watchlistIds = ['wl-x', 'wl-y'];
      // Simulate fetch-announcements' pending-window write, then commit-window,
      // for a run 3 days before "now" — mimicking a multi-day outage.
      const staleNow = new Date('2026-08-01T02:35:00.000Z');
      const staleWindowHours = 24;
      const fs2 = require('fs');
      const StorageService = require('@stock/cloud-utils').StorageService;
      StorageService.init();
      await StorageService.saveJson('cache/watchlist-insights-pending-window.json', {
        watchlistKey: wi.windowCursorKey(watchlistIds),
        windowStartMs: staleNow.getTime() - staleWindowHours * 3600 * 1000,
        windowEndMs: staleNow.getTime(),
        windowHours: staleWindowHours,
        computedAtIso: staleNow.toISOString(),
      });
      let captured = '';
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
        captured += s;
        return true;
      });
      await wi.cmdCommitWindow(watchlistIds.join(','));
      spy.mockRestore();
      expect(JSON.parse(captured).status).toBe('ok');

      const now = new Date('2026-08-04T02:35:00.000Z'); // 3 days after the stale commit
      const hours = wi.resolveWindowHours(now, watchlistIds, []);
      // Cursor (3 days back) reaches further than the anchor floor (~1 day back) → cursor wins.
      expect(hours).toBeCloseTo(72, 1);
      void fs2;
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });

  test('commit-window throws when no matching pending window exists for these watchlistIds', async () => {
    const dir = path.join(TMP, 'window-no-pending');
    process.env.DATA_V2_DIR = dir;
    try {
      await expect(wi.cmdCommitWindow('never-fetched-id')).rejects.toThrow(
        /no matching pending window/
      );
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });
});

describe('shared raw-PDF-text cache (Tier 1 — unconditionally shared across callers)', () => {
  test('a cache hit never calls stockscans.fetchPdf again', async () => {
    const dir = path.join(TMP, 'pdf-cache');
    process.env.DATA_V2_DIR = dir;
    try {
      const { stockscans } = require('@stock/api');
      const url = 'https://s3.example/docs/cached-doc.pdf';
      const StorageService = require('@stock/cloud-utils').StorageService;
      StorageService.init();
      await StorageService.saveJson(wi.pdfCachePath(url), {
        pdfUrl: url,
        text: 'cached text from a previous caller',
        numPages: 2,
        isHeavyParse: false,
        fetchedAtIso: new Date().toISOString(),
      });
      stockscans.fetchPdf.mockClear();
      const result = await wi.readOrFetchPdfMeta(url);
      expect(result.text).toBe('cached text from a previous caller');
      expect(result.numPages).toBe(2);
      expect(stockscans.fetchPdf).not.toHaveBeenCalled();
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });

  test('different URLs hash to different cache paths', () => {
    expect(wi.pdfCachePath('https://a.example/1.pdf')).not.toBe(
      wi.pdfCachePath('https://a.example/2.pdf')
    );
  });
});

describe('usecase scoping (Tier 2 — insight cache is skill+depth specific)', () => {
  test('defaultUsecase picks deep for high-conviction categories, standard otherwise', () => {
    expect(wi.defaultUsecase('management_change')).toBe('announcement-insights:deep');
    expect(wi.defaultUsecase('demerger')).toBe('announcement-insights:deep');
    expect(wi.defaultUsecase('investor_meet')).toBe('announcement-insights:standard');
    expect(wi.defaultUsecase('general', 'quick')).toBe('announcement-insights:quick');
  });

  test('usecaseMatchesPrefix matches exact and "prefix:variant" forms only', () => {
    expect(wi.usecaseMatchesPrefix('announcement-insights', 'announcement-insights')).toBe(true);
    expect(wi.usecaseMatchesPrefix('announcement-insights:deep', 'announcement-insights')).toBe(
      true
    );
    expect(wi.usecaseMatchesPrefix('gainers-signal:quick', 'announcement-insights')).toBe(false);
    // Must not false-positive on a prefix that merely starts with the same characters.
    expect(wi.usecaseMatchesPrefix('announcement-insights-v2:deep', 'announcement-insights')).toBe(
      false
    );
  });

  test('legacy processedAnnouncements-only records (pre-usecase data) still count as processed for announcement-insights', async () => {
    const dir = path.join(TMP, 'usecase-legacy-bridge');
    process.env.DATA_V2_DIR = dir;
    try {
      const { NotesDb } = require('../lib/notesDb');
      const legacyDb = new NotesDb();
      const notes = legacyDb.load();
      const co = NotesDb.ensureCompany(notes, 'NSE:LEGACY');
      co.processedAnnouncements.push('legacy.pdf'); // simulates pre-migration mark-processed
      await legacyDb.save(notes);

      const { stockscans } = require('@stock/api');
      stockscans.validateAuth = jest.fn().mockResolvedValue(true);
      const recent = new Date(Date.now() - 3600 * 1000).toISOString();
      stockscans.scanAnnouncements = jest
        .fn()
        .mockResolvedValueOnce({
          announcements: [
            { companyId: 'NSE:LEGACY', title: 'X', ssUrl: 'legacy.pdf', createdAt: recent },
          ],
        })
        .mockResolvedValue({ announcements: [] });

      let captured = '';
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
        captured += s;
        return true;
      });
      await wi.cmdFetchAnnouncements('wl-legacy', stockscans);
      spy.mockRestore();
      // Bridged as already-processed → not returned as "new".
      expect(JSON.parse(captured)).toEqual([]);
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });

  test('mark-processed under one usecase does not block a different usecase from fetching the same announcement', async () => {
    const dir = path.join(TMP, 'usecase-scoping');
    process.env.DATA_V2_DIR = dir;
    try {
      const { stockscans } = require('@stock/api');
      stockscans.validateAuth = jest.fn().mockResolvedValue(true);
      const recent = new Date(Date.now() - 3600 * 1000).toISOString();
      const ann = {
        companyId: 'NSE:SHARED',
        title: 'Some update',
        ssUrl: 'shared.pdf',
        createdAt: recent,
      };
      stockscans.scanAnnouncements = jest
        .fn()
        .mockResolvedValueOnce({ announcements: [ann] })
        .mockResolvedValue({ announcements: [] });

      // gainers-signal (a different usecase family) marks it processed first.
      await wi.cmdMarkProcessed('NSE:SHARED', 'shared.pdf', 'gainers-signal:quick');

      // watchlist-insights' own fetch-announcements (announcement-insights family)
      // must still see it as new — a different skill's processed-marker must not
      // shadow it.
      let captured = '';
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
        captured += s;
        return true;
      });
      await wi.cmdFetchAnnouncements('wl-shared', stockscans);
      spy.mockRestore();
      const out = JSON.parse(captured);
      expect(out.map((a) => a.announcementId)).toContain('shared.pdf');

      // But if announcement-insights itself already marked it processed, THAT skip works.
      stockscans.scanAnnouncements = jest
        .fn()
        .mockResolvedValueOnce({ announcements: [ann] })
        .mockResolvedValue({ announcements: [] });
      await wi.cmdMarkProcessed('NSE:SHARED', 'shared.pdf', 'announcement-insights:standard');
      let captured2 = '';
      const spy2 = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
        captured2 += s;
        return true;
      });
      await wi.cmdFetchAnnouncements('wl-shared', stockscans);
      spy2.mockRestore();
      expect(JSON.parse(captured2)).toEqual([]);
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });
});

describe('notes DB round-trip', () => {
  test('init, add company, add note, persist', () => {
    const dir = path.join(TMP, 'rt-notes');
    const db = new NotesDb(dir);
    db.initRun();
    const notes = db.load();
    const co = NotesDb.ensureCompany(notes, 'NSE:Z', 'NSE:Z', 'Zeta');
    co.notes.push({
      id: NotesDb.uuid(),
      announcementId: 'z.pdf',
      insight: 'hi',
      significance: 'high',
      createdAt: '2026-06-27T10:00:00+05:30',
    });
    db.save(notes);

    const reloaded = db.load();
    expect(reloaded.meta.totalCompanies).toBe(1);
    expect(reloaded.meta.totalNotes).toBe(1);
    const idx = NotesDb.buildNoteIndex(reloaded);
    expect(idx['z.pdf'].latest[0].insight).toBe('hi');
    // No explicit usecase was set on this note → falls into the legacy bucket.
    expect(idx['z.pdf'].byUsecase[NotesDb.LEGACY_USECASE][0].insight).toBe('hi');
  });

  test('a company touched only via mark-processed (no note at all) survives a reload', async () => {
    // Regression test for a real bug found while building usecase-scoping:
    // load() used to seed notes.companies ONLY from note records, so a
    // company that only ever got a processedAnnouncements/processedByUsecase
    // update (exactly what the heavy-document-skip flow does — mark-processed
    // with no add-note) would vanish on the very next load(), silently
    // breaking every "already processed" dedup check for it forever.
    const dir = path.join(TMP, 'rt-notes-noteless');
    process.env.DATA_V2_DIR = dir;
    try {
      const freshDb = new NotesDb();
      const notes = freshDb.load();
      const co = NotesDb.ensureCompany(notes, 'NSE:NOTELESS');
      co.processedByUsecase = { 'heavy-doc-skip': ['skip1.pdf'] };
      co.processedAnnouncements.push('skip1.pdf');
      await freshDb.save(notes);

      const reloaded = freshDb.load();
      const co2 = NotesDb.getCompany(reloaded, 'NSE:NOTELESS');
      expect(co2).not.toBeNull();
      expect(co2.processedByUsecase).toEqual({ 'heavy-doc-skip': ['skip1.pdf'] });
      expect(co2.processedAnnouncements).toEqual(['skip1.pdf']);
    } finally {
      process.env.DATA_V2_DIR = TMP;
    }
  });
});

describe('cmdFetchAnnouncements end-to-end (mock client + temp notes)', () => {
  test('drops noise + already-processed, tags category', async () => {
    const { stockscans } = require('@stock/api');
    stockscans.validateAuth = jest.fn().mockResolvedValue(true);
    const now = Date.now();
    const recent = new Date(now - 3600 * 1000).toISOString();
    stockscans.scanAnnouncements
      .mockResolvedValueOnce({
        announcements: [
          {
            companyId: 'NSE:ORDER',
            title: 'Bagging of order',
            ssUrl: 'order.pdf',
            createdAt: recent,
          },
          {
            companyId: 'NSE:NOISE',
            title: 'Closure of Trading Window',
            ssUrl: 'noise.pdf',
            createdAt: recent,
          },
        ],
      })
      .mockResolvedValue({ announcements: [] }); // terminate pagination
    let captured = '';
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
      captured += s;
      return true;
    });
    await wi.cmdFetchAnnouncements('wl-1,wl-2', stockscans);
    spy.mockRestore();

    const out = JSON.parse(captured);
    expect(out).toHaveLength(1);
    expect(out[0].companyId).toBe('NSE:ORDER');
    expect(out[0].category).toBe('order_book');
    expect(out[0].pdfUrl).toBe('https://s3.example/docs/order.pdf');
  });
});
