'use strict';

const { nameSimilarity, buildCapexTimeline, buildCard } = require('../buildBaselines');

describe('nameSimilarity', () => {
  test('identical strings score 1', () => {
    expect(nameSimilarity('Unit 3 expansion', 'Unit 3 expansion')).toBe(1);
  });

  test('one containing the other (contiguous substring) scores high (0.9)', () => {
    expect(nameSimilarity('Greenfield plant at Dahej Gujarat', 'plant at Dahej')).toBe(0.9);
  });

  test('shared words in different order (not a substring) still scores well via word overlap', () => {
    const s = nameSimilarity('Greenfield plant at Dahej', 'Dahej plant');
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });

  test('down-weights short/common boilerplate words so a real distinguishing word decides the match', () => {
    // "Capacity expansion at Unit 3" vs "Capacity expansion at Unit 2" share every
    // word except the distinguishing digit — a naive unweighted ratio would score
    // this dangerously high. The digit words ("3", "2") are short and hence
    // low-weight, same as preprocessCalibrate.js's similarity() — but they are
    // still the ONLY differing tokens, so the score must land below a perfect
    // match while staying well above 0.
    const s = nameSimilarity('Capacity expansion at Unit 3', 'Capacity expansion at Unit 2');
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });

  test('unrelated names score low', () => {
    const s = nameSimilarity('Solar rooftop initiative', 'Debt refinancing facility');
    expect(s).toBeLessThan(0.34);
  });

  test('empty/missing inputs never throw and score 0', () => {
    expect(nameSimilarity(null, 'x')).toBe(0);
    expect(nameSimilarity('x', undefined)).toBe(0);
    expect(nameSimilarity('', '')).toBe(0);
  });
});

describe('buildCapexTimeline', () => {
  const guided = [
    { what: 'Greenfield facility at Dahej Gujarat', amountCr: 250, when: 'FY26', source: 'ppt' },
    { what: 'Brownfield expansion at existing Pune unit', amountCr: 40, when: 'FY25', source: 'ppt' },
    { what: 'Unrelated debt paydown target', amountCr: 100, when: 'FY26', source: 'ppt' },
  ];

  test('joins each guided commitment to its best-matching actual by name similarity', () => {
    const actuals = [
      { project: 'Dahej Gujarat greenfield facility', status: 'commissioned' },
      { project: 'Pune unit brownfield expansion', status: 'in_progress' },
    ];
    const timeline = buildCapexTimeline(guided, actuals);
    expect(timeline).toHaveLength(3);

    expect(timeline[0].guided.what).toBe(guided[0].what);
    expect(timeline[0].actual).not.toBeNull();
    expect(timeline[0].actual.status).toBe('commissioned');
    expect(timeline[0].matchScore).toBeGreaterThan(0);

    expect(timeline[1].actual).not.toBeNull();
    expect(timeline[1].actual.status).toBe('in_progress');
  });

  test('a guided commitment with no matching actual returns actual:null, matchScore:0 (informative, not hidden)', () => {
    const actuals = [{ project: 'Dahej Gujarat greenfield facility', status: 'commissioned' }];
    const timeline = buildCapexTimeline(guided, actuals);
    const unmatched = timeline.find((t) => t.guided.what === guided[2].what);
    expect(unmatched.actual).toBeNull();
    expect(unmatched.matchScore).toBe(0);
  });

  test('each actual is consumed at most once — two similar guided items never both claim the same actual', () => {
    const guidedTwins = [
      { what: 'Capacity expansion Unit A', amountCr: 10 },
      { what: 'Capacity expansion Unit B', amountCr: 10 },
    ];
    const oneActual = [{ project: 'Capacity expansion Unit A', status: 'commissioned' }];
    const timeline = buildCapexTimeline(guidedTwins, oneActual);
    const matchedCount = timeline.filter((t) => t.actual !== null).length;
    expect(matchedCount).toBe(1);
  });

  test('empty actuals leaves every guided commitment unmatched', () => {
    const timeline = buildCapexTimeline(guided, []);
    expect(timeline.every((t) => t.actual === null && t.matchScore === 0)).toBe(true);
  });

  test('empty commitments returns an empty timeline', () => {
    expect(buildCapexTimeline([], [{ project: 'x', status: 'commissioned' }])).toEqual([]);
  });
});

describe('buildCard — capex timeline end-to-end wiring', () => {
  test('joins a PPT capex_pipeline commitment against an annual_report capex_commercialisation actual', () => {
    const extracts = [
      {
        profile: 'ppt',
        documentDate: '2025-06-01',
        extractedAt: '2025-06-02T00:00:00.000Z',
        sourceUrl: 'https://x/ppt1.pdf',
        sourceHash: 'h1',
        data: {
          capex_pipeline: [
            { project: 'Greenfield facility at Dahej', amount_inr_cr: 250, commissioning: 'FY26' },
          ],
        },
      },
      {
        profile: 'annual_report',
        documentDate: '2026-05-01',
        extractedAt: '2026-05-02T00:00:00.000Z',
        sourceUrl: 'https://x/ar1.pdf',
        sourceHash: 'h2',
        data: {
          capex_commercialisation: [
            {
              project: 'Dahej greenfield facility',
              status: 'commissioned',
              quote: { text: 'The Dahej greenfield facility was commissioned in Q4FY26.', page: 12 },
            },
          ],
        },
      },
    ];

    const card = buildCard('NSE:TEST', extracts);

    expect(card.commitments).toHaveLength(1);
    expect(card.capexTimeline).toHaveLength(1);
    expect(card.capexTimeline[0].guided.what).toBe('Greenfield facility at Dahej');
    expect(card.capexTimeline[0].actual).not.toBeNull();
    expect(card.capexTimeline[0].actual.status).toBe('commissioned');
    expect(card.capexTimeline[0].actual.page).toBe(12);
  });

  test('no capex data on either side yields an empty (not undefined) capexTimeline', () => {
    const extracts = [
      {
        profile: 'announcement',
        documentDate: '2026-01-01',
        extractedAt: '2026-01-01T00:00:00.000Z',
        sourceUrl: 'https://x/a.pdf',
        sourceHash: 'h3',
        data: { category_hint: 'general' },
      },
    ];
    const card = buildCard('NSE:TEST2', extracts);
    expect(card.capexTimeline).toEqual([]);
  });
});
