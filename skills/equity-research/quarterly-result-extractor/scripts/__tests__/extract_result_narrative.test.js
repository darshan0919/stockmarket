'use strict';

const { extractNarrative } = require('../extract_result_narrative');

const CLEAN = `Notes:

1. The above results were reviewed by the Audit Committee and approved by the Board of Directors at their meeting held on 4 August 2026.

2. Exceptional items for the quarter represent an impairment of goodwill on the Company's subsidiary, which the Group considers a one-time charge recognised during the quarter ended 30 June 2026.

Limited Review Report on unaudited financial results

We conducted our review in accordance with the standard on review engagements and nothing has come to our attention that causes us to believe that the results are materially misstated.`;

const QUALIFIED = `Independent Auditor's Review Report to the Board

Basis for qualified conclusion: the Company has not provided for expected credit loss on receivables of Rs 45 crore and, except for the possible effects of this matter, nothing has come to our attention.

Emphasis of Matter: we draw attention to Note 5 regarding material uncertainty related to going concern.`;

describe('extractNarrative', () => {
  it('captures one-off explanations and finds a clean review report', () => {
    const r = extractNarrative(CLEAN);
    expect(r.exceptionalNotes).toHaveLength(1);
    expect(r.exceptionalNotes[0].matched).toBe('exceptional items');
    expect(r.exceptionalNotes[0].text).toMatch(/impairment of goodwill/);
    expect(r.reviewReportFound).toBe(true);
    expect(r.qualification).toBe('none-detected');
  });

  it('detects a qualification and emphasis of matter', () => {
    const r = extractNarrative(QUALIFIED);
    expect(r.qualification).toBe('qualified');
    expect(r.auditorRemarks.map((a) => a.kind).sort()).toEqual(['emphasis', 'qualification']);
  });

  it('reports not-found for empty text and skips numeric table rows', () => {
    expect(extractNarrative('').qualification).toBe('not-found');
    const r = extractNarrative(
      'Exceptional items 1,234.00 (56.78) 90.12 3,456.00 (12.00) 5,678.90 1,234.00\n\n'
    );
    expect(r.exceptionalNotes).toHaveLength(0);
  });
});
