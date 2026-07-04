'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

// Point notes/validation at temp dirs BEFORE requiring the module (paths bind at load).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wi-'));
process.env.WI_NOTES_DIR = path.join(TMP, 'notes');
process.env.WI_VALIDATION_DIR = path.join(TMP, 'validation');

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
    expect(wi.matchedNoiseKeyword('Intimation of Record Date', '')).toBe('intimation of record date');
    expect(wi.isNoise('Bagging large order', 'EPC win')).toBe(false);
  });
});

describe('announcementId', () => {
  test('uses ssUrl when present, else composite key', () => {
    expect(wi.announcementId({ ssUrl: 'abc.pdf' })).toBe('abc.pdf');
    expect(wi.announcementId({ companyId: 'NSE:X', date: '2026-06-27', title: 'A very long announcement title here' }))
      .toBe('NSE:X_2026-06-27_A very long announcement title');
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
      { companyId: 'NSE:A', ticker: 'NSE:A', name: 'A', title: 'Big order', significance: 'high', insight: 'won 500cr', tags: ['order_win'], pdfUrl: 'p' },
      { companyId: 'NSE:B', ticker: 'NSE:B', name: 'B', title: 'Minor', significance: 'routine', insight: 'meh', tags: [] },
    ]);
    expect(html).toContain('High Significance');
    expect(html).toContain('won 500cr');
    expect(html).not.toContain('meh'); // routine suppressed
    expect(html).toContain('2 announcements across 2 companies'); // count is pre-bucket
  });
});

describe('gatherInwindowRaw (pagination + 24h window)', () => {
  test('stops once the last item on a page is older than 24h', async () => {
    const now = new Date('2026-06-27T12:00:00+05:30');
    const iso = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
    const client = {
      scanAnnouncements: jest
        .fn()
        .mockResolvedValueOnce({ announcements: [{ companyId: 'NSE:A', createdAt: iso(1) }, { companyId: 'NSE:B', createdAt: iso(5) }] })
        .mockResolvedValueOnce({ announcements: [{ companyId: 'NSE:C', createdAt: iso(20) }, { companyId: 'NSE:D', createdAt: iso(30) }] }),
    };
    const out = await wi.gatherInwindowRaw(client, now);
    // D (30h) is outside the window and dropped; A,B,C kept
    expect(out.map((a) => a.companyId)).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
    expect(client.scanAnnouncements).toHaveBeenCalledTimes(2);
  });
});

describe('notes DB round-trip', () => {
  test('init, add company, add note, persist', () => {
    const dir = path.join(TMP, 'rt-notes');
    const db = new NotesDb(dir);
    db.initRun();
    const notes = db.load();
    const co = NotesDb.ensureCompany(notes, 'NSE:Z', 'NSE:Z', 'Zeta');
    co.notes.push({ id: NotesDb.uuid(), announcementId: 'z.pdf', insight: 'hi', significance: 'high', createdAt: '2026-06-27T10:00:00+05:30' });
    db.save(notes);

    const reloaded = db.load();
    expect(reloaded.meta.totalCompanies).toBe(1);
    expect(reloaded.meta.totalNotes).toBe(1);
    const idx = NotesDb.buildNoteIndex(reloaded);
    expect(idx['z.pdf'][0].insight).toBe('hi');
  });
});

describe('cmdFetchAnnouncements end-to-end (mock client + temp notes)', () => {
  test('drops noise + already-processed, tags category', async () => {
    const { stockscans } = require('@stock/api');
    const now = Date.now();
    const recent = new Date(now - 3600 * 1000).toISOString();
    stockscans.scanAnnouncements
      .mockResolvedValueOnce({
        announcements: [
          { companyId: 'NSE:ORDER', title: 'Bagging of order', ssUrl: 'order.pdf', createdAt: recent },
          { companyId: 'NSE:NOISE', title: 'Closure of Trading Window', ssUrl: 'noise.pdf', createdAt: recent },
        ],
      })
      .mockResolvedValue({ announcements: [] }); // terminate pagination
    let captured = '';
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => { captured += s; return true; });
    await wi.cmdFetchAnnouncements(stockscans);
    spy.mockRestore();

    const out = JSON.parse(captured);
    expect(out).toHaveLength(1);
    expect(out[0].companyId).toBe('NSE:ORDER');
    expect(out[0].category).toBe('order_book');
    expect(out[0].pdfUrl).toBe('https://s3.example/docs/order.pdf');
  });
});
