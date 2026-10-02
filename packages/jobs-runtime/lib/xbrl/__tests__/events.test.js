'use strict';

const { parseXbrl } = require('../parse');
const { parseEvent, EVENT_KINDS, FLAG_TO_KIND, NSE_SUBJECT_TO_KIND } = require('../events');
const { fetchEventSeries, bseName, isoFromBroadcast } = require('../eventsFetch');
const { createIssueLog } = require('../issues');

const ix = (facts) =>
  `<html xmlns:ix='http://www.xbrl.org/2013/inlineXBRL'><body>` +
  facts
    .map(([k, v, num]) =>
      num
        ? `<ix:nonFraction name='in-capmkt:${k}' contextRef='MainI' unitRef='INR' decimals='0'>${v}</ix:nonFraction>`
        : `<ix:nonNumeric name='in-capmkt:${k}' contextRef='MainI'>${v}</ix:nonNumeric>`
    )
    .join('') +
  `</body></html>`;

const HEADER = [
  ['NameOfTheCompany', 'ACME LTD'],
  ['ScripCode', '500001'],
  ['NSESymbol', 'ACME'],
  ['ISIN', 'INE000A01010'],
];

describe('parseEvent', () => {
  it('parses text-only iXBRL (no numeric facts) — regression for the isIx detection', () => {
    const p = parseXbrl(
      ix([...HEADER, ['TypeOfMeeting', 'Board Meeting'], ['DateOfReport', '29-09-2026']])
    );
    expect(p.format).toBe('ixbrl');
    const e = parseEvent(p, 'board-meeting-intimation');
    expect(e.ok).toBe(true);
    expect(e.company).toMatchObject({ name: 'ACME LTD', scrip: '500001', symbol: 'ACME' });
    expect(e.ref).toBe('2026-09-29');
  });

  it('extracts order value in Rs Cr and the event type', () => {
    const e = parseEvent(
      parseXbrl(
        ix([
          ...HEADER,
          [
            'TypeOfEventAsPerRegulation30ParaBOfPartAOfScheduleIII',
            'Bagging/Receiving of orders',
            false,
          ],
          ['NameOfTheEntityAwardingTheOrdersOrContracts', 'Buyer Pvt Ltd'],
          ['AmountOfTheOrdersOrContracts', '20250000000', true],
          ['DateOfReport', '29-09-2026'],
        ])
      ),
      'reg30-para-b'
    );
    expect(e.eventType).toMatch(/Bagging/);
    expect(e.numbersCr.AmountOfTheOrdersOrContracts).toBe(2025);
    expect(e.summary.some((s) => /NameOfTheEntity/.test(s.field))).toBe(true);
  });

  it('splits repeated blocks into records', () => {
    const e = parseEvent(
      parseXbrl(
        ix([
          ...HEADER,
          ['NameOfTheDirector', 'A'],
          ['EffectiveDateOfResignation', '01-10-2026'],
          ['NameOfTheDirector', 'B'],
          ['EffectiveDateOfResignation', '02-10-2026'],
          ['DateOfReport', '29-09-2026'],
        ])
      ),
      'kmp-resignation'
    );
    expect(e.records).toHaveLength(2);
    expect(e.recordSummary[1].NameOfTheDirector).toBe('B');
    expect(e.records[1].EffectiveDateOfResignation).toBe('2026-10-02');
  });

  it('reports empty documents', () => {
    expect(parseEvent(parseXbrl('<html></html>'), 'cirp')).toMatchObject({ ok: false });
  });
});

describe('event kind maps', () => {
  it('maps flags and NSE subjects back to kinds, with no flag in two kinds', () => {
    expect(FLAG_TO_KIND[54]).toBe('reg30-para-b');
    expect(FLAG_TO_KIND[14]).toBe('credit-rating');
    expect(NSE_SUBJECT_TO_KIND['Resignation of Statutory Auditor']).toBe('auditor-resignation');
    const flags = Object.values(EVENT_KINDS).flatMap((k) => k.flags);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it('helpers normalise BSE names and NSE broadcast dates', () => {
    expect(bseName('/XBRLFiles/CTWDuplicateDocument/x.xml')).toBe('CTWDuplicateDocument/x.xml');
    expect(isoFromBroadcast('29-Sep-2026 22:38:22')).toBe('2026-09-29');
    expect(isoFromBroadcast('2026-09-29T22:05:18.527')).toBe('2026-09-29');
  });
});

describe('fetchEventSeries', () => {
  const memCache = () => {
    const m = new Map();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) };
  };
  const file = ix([...HEADER, ['TypeOfChange', 'Appointment'], ['DateOfReport', '29-09-2026']]);

  it('prefers NSE for its families and falls back to BSE otherwise', async () => {
    const issues = createIssueLog('t1');
    const bse = {
      getScripCode: jest.fn(async () => '500001'),
      getXbrlFilings: jest.fn(async (flag) =>
        flag === 54
          ? [
              {
                scripcode: 500001,
                xbrlurl: '/XBRLFILES/REG/x.html',
                xbrldate: '2026-09-29T10:00:00',
              },
            ]
          : []
      ),
      fetchXbrlFile: jest.fn(async () =>
        ix([
          ...HEADER,
          ['TypeOfEventAsPerRegulation30ParaBOfPartAOfScheduleIII', 'Order'],
          ['DateOfReport', '29-09-2026'],
        ])
      ),
    };
    const nse = {
      getXbrlAnnouncements: jest.fn(async () => [
        {
          symbol: 'ACME',
          subject: 'Change in Directors/KMP/SMP/Auditor/RTA',
          attachment: 'https://n/a/CIM_1.xml',
          ixbrl: 'https://n/a/CIM_1.html',
          broadcastDateTime: '29-Sep-2026 22:38:22',
        },
      ]),
      fetchArchiveXml: jest.fn(async () => file),
    };
    const r = await fetchEventSeries({
      symbol: 'ACME',
      kinds: ['management-change', 'reg30-para-b'],
      from: '01-09-2026',
      to: '29-09-2026',
      nse,
      bse,
      issues,
      cache: memCache(),
      scripLookup: () => '500001',
    });
    expect(r.kinds['management-change'].exchange).toBe('NSE');
    expect(r.kinds['management-change'].items[0].eventType).toBe('Appointment');
    expect(r.kinds['reg30-para-b'].exchange).toBe('BSE');
    expect(r.kinds['reg30-para-b'].items[0].ref).toBe('2026-09-29');
    expect(bse.getScripCode).not.toHaveBeenCalled(); // stored scrip used
  });

  it('uses the iXBRL link when the NSE attachment is a ZIP, and flags a wrong-company BSE file', async () => {
    const issues = createIssueLog('t2');
    const nse = {
      getXbrlAnnouncements: jest.fn(async () => [
        {
          symbol: 'ACME',
          subject: 'Resignation of Statutory Auditor',
          attachment: 'https://n/a/x_KMP_Doc.zip',
          ixbrl: 'https://n/a/ROSA.html',
          broadcastDateTime: '28-Sep-2026 22:24:49',
        },
      ]),
      fetchArchiveXml: jest.fn(async (u) => (u.endsWith('.html') ? file : null)),
    };
    const bse = {
      getXbrlFilings: jest.fn(async () => [
        { scripcode: 999999, xbrlurl: '/XBRLFILES/a.html', xbrldate: '2026-09-29T10:00:00' },
        { scripcode: 500001, xbrlurl: '/XBRLFILES/b.html', xbrldate: '2026-09-28T10:00:00' },
      ]),
      fetchXbrlFile: jest.fn(async () =>
        ix([
          ['NameOfTheCompany', 'OTHER'],
          ['ScripCode', '777777'],
          ['DateOfReport', '28-09-2026'],
        ])
      ),
    };
    const r = await fetchEventSeries({
      symbol: 'ACME',
      kinds: ['auditor-resignation', 'credit-rating'],
      from: '01-09-2026',
      to: '29-09-2026',
      nse,
      bse,
      issues,
      cache: memCache(),
      scripLookup: () => '500001',
    });
    expect(nse.fetchArchiveXml).toHaveBeenCalledWith('https://n/a/ROSA.html');
    expect(r.kinds['auditor-resignation'].items).toHaveLength(1);
    // only the row for the requested scrip is fetched from BSE; its file says another scrip -> flagged
    expect(bse.fetchXbrlFile).toHaveBeenCalledTimes(1);
    expect(issues.all().some((i) => i.category === 'EXCHANGE_DISAGREE')).toBe(true);
  });

  it('logs endpoint failures and ignores unknown kinds', async () => {
    const issues = createIssueLog('t3');
    const r = await fetchEventSeries({
      symbol: 'ACME',
      kinds: ['nope', 'cirp'],
      nse: { getXbrlAnnouncements: jest.fn(), fetchArchiveXml: jest.fn() },
      bse: {
        getXbrlFilings: jest.fn(async () => {
          throw new Error('boom');
        }),
      },
      issues,
      cache: memCache(),
      scripLookup: () => '500001',
    });
    expect(Object.keys(r.kinds)).toEqual(['cirp']);
    expect(
      issues.all().some((i) => i.category === 'ENDPOINT_CHANGE' && i.severity === 'major')
    ).toBe(true);
    expect(issues.all().some((i) => /unknown event kind/.test(i.message))).toBe(true);
  });
});
