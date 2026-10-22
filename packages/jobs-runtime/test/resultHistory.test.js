'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let period;
let callDigest;
let historyPack;
let inputs;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qrh-'));
  process.env.DATA_V2_DIR = tmpRoot;
  period = require('../lib/resultHistory/period');
  callDigest = require('../lib/resultHistory/callDigest');
  historyPack = require('../lib/resultHistory/historyPack');
  inputs = require('../lib/resultHistory/inputs');
});

afterAll(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const docs = (type, dates) =>
  dates.map((d) => ({ documentType: type, date: d, ssUrl: `${type}${d}.pdf` }));

describe('period', () => {
  it('shifts quarters across year boundaries and computes quarter ends', () => {
    expect(period.shiftQuarter('202612', 1)).toBe('202703');
    expect(period.shiftQuarter('202603', -1)).toBe('202512');
    expect(period.quarterEndIso('202609')).toBe('2026-09-30');
    expect(period.quarterEndIso('202603')).toBe('2026-03-31');
    expect(period.quarterForDate('2026-10-21')).toBe('202609');
  });

  it('resolves pre mode for the quarter after the newest filed result', () => {
    const r = period.resolveResultMode(docs('Result', ['202606', '202603']), {
      now: new Date('2026-10-22T10:00:00'),
    });
    expect(r).toEqual({ mode: 'pre', targetQuarter: '202609', latestFiledQuarter: '202606' });
  });

  it('resolves post mode once the latest completed quarter is filed', () => {
    const r = period.resolveResultMode(docs('Result', ['202609']), {
      now: new Date('2026-10-22T10:00:00'),
    });
    expect(r.mode).toBe('post');
    expect(r.targetQuarter).toBe('202609');
  });

  it('honours an explicit quarter or business date', () => {
    const list = docs('Result', ['202606']);
    expect(period.resolveResultMode(list, { targetQuarter: '202606' }).mode).toBe('post');
    expect(period.resolveResultMode(list, { date: '2026-10-21' })).toMatchObject({
      mode: 'pre',
      targetQuarter: '202609',
    });
  });

  it('handles a company with no filed results', () => {
    const r = period.resolveResultMode([], { now: new Date('2026-10-22T10:00:00') });
    expect(r).toEqual({ mode: 'pre', targetQuarter: '202609', latestFiledQuarter: null });
  });

  it('lists history documents strictly before the target, newest first', () => {
    const list = [
      ...docs('Transcript', ['202603', '202609', '202606', '202512']),
      { documentType: 'Transcript', date: '2026' },
    ];
    expect(period.docsBefore(list, 'Transcript', '202609', 2).map((d) => d.date)).toEqual([
      '202606',
      '202603',
    ]);
  });
});

const goodDigest = () => ({
  tone: { label: 'confident', quote: 'we remain confident of 20% growth' },
  guidance: [
    {
      metric: 'Volume growth',
      period_guided: 'FY27',
      relative_pct: 20,
      quote: 'growth of 20% for the rest of the year',
    },
  ],
  topics: [{ topic: 'Steel cord', keywords: ['steel cord'], quote: 'first trial order' }],
  oneOffs: [{ costHead: 'gas', quote: 'gas cost has almost tripled' }],
  catalysts: [{ letter: 'APPROVALS', title: 'Steel cord trial', quote: 'first trial order' }],
});
const transcript =
  'Overall we remain   confident of 20% growth. We expect growth of 20% for the rest of the year.\n' +
  'Our gas cost has almost tripled in some plants. We got our first trial order.';

describe('callDigest', () => {
  it('accepts a well-formed digest and rejects bad enums, missing quotes and missing arrays', () => {
    expect(callDigest.validateDigest(goodDigest())).toEqual([]);
    const bad = goodDigest();
    bad.tone.label = 'happy';
    bad.catalysts[0].letter = 'MAGIC';
    delete bad.oneOffs[0].quote;
    delete bad.topics;
    const errs = callDigest.validateDigest(bad);
    expect(errs.join(' ')).toMatch(/tone.label/);
    expect(errs.join(' ')).toMatch(/catalysts\[0\]: letter/);
    expect(errs.join(' ')).toMatch(/oneOffs\[0\]: quote required/);
    expect(errs.join(' ')).toMatch(/topics must be an array/);
  });

  it('requires a number, a range or a milestone on every guide', () => {
    const d = goodDigest();
    d.guidance.push({ metric: 'Margins', period_guided: 'FY27', quote: 'x' });
    expect(callDigest.validateDigest(d).join(' ')).toMatch(/guidance\[1\]/);
  });

  it('passes verification only when every quote is in the transcript', () => {
    expect(callDigest.verifyDigest(goodDigest(), transcript).status).toBe('pass');
    const d = goodDigest();
    d.oneOffs[0].quote = 'power cost doubled';
    const v = callDigest.verifyDigest(d, transcript);
    expect(v.status).toBe('fail');
    expect(v.unmatched[0].quote).toBe('power cost doubled');
  });

  it('builds a record keyed to the quarter end with modelUsed', () => {
    const rec = callDigest.buildDigestRecord({
      companyId: 'NSE:X',
      quarter: '202606',
      transcript: { ssUrl: 'a.pdf', date: '202606' },
      digest: goodDigest(),
      verification: { status: 'pass', checked: 5, matched: 5 },
      modelUsed: 'm',
    });
    expect(rec).toMatchObject({ type: 'concall-digest', date: '2026-06-30', modelUsed: 'm' });
    expect(rec.transcript.url).toContain('a.pdf');
  });
});

const digest = (quarter, extra = {}) => ({
  id: `dg_${quarter}`,
  quarter,
  tone: { label: 'confident', quote: 'q' },
  guidance: [],
  topics: [],
  oneOffs: [],
  catalysts: [],
  ...extra,
});

describe('historyPack', () => {
  it('flags one-off excuses as recurrent at 2 of the trailing 4 calls', () => {
    const r = historyPack.oneOffRecurrence([
      digest('202606', { oneOffs: [{ costHead: 'gas', quote: 'a' }] }),
      digest('202603'),
      digest('202512', { oneOffs: [{ costHead: 'freight', quote: 'b' }] }),
      digest('202509'),
      digest('202506', { oneOffs: [{ costHead: 'power', quote: 'c' }] }),
    ]);
    expect(r.count).toBe(2);
    expect(r.recurrent).toBe(true);
    expect(r.window).toHaveLength(4);
    expect(r.items.map((i) => i.costHead)).toEqual(['gas', 'freight']);
  });

  it('seeds possiblyDropped from topic keywords absent in the current call', () => {
    const narrative = historyPack.narrativeArc([
      digest('202606', {
        topics: [
          { topic: 'Exports', keywords: ['export'], quote: 'x' },
          { topic: 'Dahej plant', keywords: ['dahej'], quote: 'y' },
        ],
      }),
    ]);
    const out = historyPack.possiblyDroppedTopics(narrative, 'Exports grew 30% this quarter.');
    expect(out.map((t) => t.topic)).toEqual(['Dahej plant']);
    expect(out[0].lastMentioned).toBe('Q1FY27');
  });

  it('reads the prior verdict chain and open Q+1 confirmation', () => {
    const v = historyPack.priorVerdicts(
      [
        {
          id: 'qr1',
          quarter: 'Q1FY27',
          date: '2026-08-10',
          verdictChips: ['MARGIN INFLECTION', 'Q+1 CONFIRMATION PENDING'],
          walkTheTalk: { summary: { verdict: 'DELIVERED' } },
          inflectionPoint: { verdict: 'INFLECTION_EMERGING' },
          monitoringChecklist: [{ kpi: 'GM', threshold: '>28%' }],
        },
        { id: 'qr2', quarter: 'Q2FY27', date: '2026-10-20' },
      ],
      '202609'
    );
    expect(v.lastResultId).toBe('qr1');
    expect(v.walkTheTalk).toEqual(['DELIVERED']);
    expect(v.q1ConfirmationPending).toBe(true);
    expect(v.lastChecklist).toHaveLength(1);
  });

  it('assembles a pack from explicit inputs, excluding digests at or after the target', () => {
    const pack = historyPack.assembleHistoryPack({
      companyId: 'NSE:X',
      targetYyyymm: '202609',
      asOf: '2026-10-20',
      digests: [
        digest('202609'),
        digest('202606', {
          guidance: [
            {
              metric: 'Capex',
              period_guided: 'FY27',
              absolute_value: 200,
              absolute_unit: 'cr',
              quote: 'z',
            },
          ],
          catalysts: [{ letter: 'CAPEX', title: 'Plant 2', quote: 'p' }],
        }),
      ],
      pendingDigestQuarters: ['202603'],
      rerating: { id: 'rr1', date: '2026-09-01', catalysts: [{ name: 'PLI approval' }] },
    });
    expect(pack).toMatchObject({
      type: 'quarterly-result-history',
      date: '2026-09-30',
      targetQuarter: 'Q2FY27',
      coversThrough: '2026-10-20',
    });
    expect(pack.digestCoverage).toEqual({
      verified: ['Q1FY27'],
      pending: ['Q4FY26'],
      complete: false,
    });
    expect(pack.priorGuidance).toHaveLength(1);
    expect(pack.walkTheTalkSkeleton[0]).toMatchObject({
      metric: 'Capex',
      measurability: 'INTERIM',
    });
    expect(pack.knownCatalysts.map((c) => c.title)).toEqual(['Plant 2', 'PLI approval']);
    expect(pack.sourcesConsumed).toEqual(['dg_202606', 'rr1']);
    expect(historyPack.historyContextOf(null)).toBeNull();
    expect(historyPack.historyContextOf({ ...pack, id: 'p1' }).packId).toBe('p1');
  });
});

describe('inputs.classifyFilings', () => {
  const tax = {
    categoriseAnnouncement: (t) =>
      /result/i.test(t) ? 'results' : /transcript/i.test(t) ? 'concall_transcript' : 'general',
    significanceOf: () => 'NORMAL',
  };
  it('splits KNOWN vs NEW at the transcript filing and tags dot-connect levers', () => {
    const out = inputs.classifyFilings(
      [
        { date: '2026-10-05', title: 'Commissioning of new plant capacity' },
        { date: '2026-08-02', title: 'Transcript of earnings call' },
        { date: '2026-07-28', title: 'Financial Results Q1' },
        { date: '2026-07-10', title: 'Trading window closure' },
      ],
      tax,
      { windowStart: '2026-06-30' }
    );
    expect(out.knownCutoff).toBe('2026-08-02');
    expect(out.knownCutoffBasis).toBe('transcript filing date');
    expect(out.items[0]).toMatchObject({ status: 'NEW_SINCE_CONCALL', dotTags: ['capacity'] });
    expect(out.items[3]).toMatchObject({ status: 'KNOWN_AT_CONCALL', routine: true });
  });
});
