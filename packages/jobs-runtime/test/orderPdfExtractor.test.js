'use strict';

/**
 * Unit tests for orderPdfExtractor — value, quantity and timeline extraction
 * from SEBI Reg-30 order filings.
 *
 * @file packages/jobs-runtime/test/orderPdfExtractor.test.js
 * @see docs/ORDER_BOOK_EXTRACTION.md
 */

const {
  extractFromPdfText,
  wordsToRupees,
  findQuantities,
  findTimeline,
  findValueBand,
  normalizeUnit,
  addMonths,
} = require('../lib/orderPdfExtractor');

// The grid VA Tech Wabag prints in the footer of every Reg-30 filing, and the
// annexure rows that say which cell of it applies.
const BAND_GRID =
  'Order Classification Small Medium Large Major Mega ' +
  'Domestic (in INR Crores) Upto 100 100 to 250 250 to 600 600 to 1,000 Above 1,000 ' +
  'International (In USD Millions) Upto 10 10 to 30 30 to 75 75 to 150 Above 150';
const filing = (band, jurisdiction) =>
  `e) Whether domestic or international ${jurisdiction} Project ` +
  `g) Broad consideration or size of the order(s) ${band} Order * ` +
  `h) Whether the promoter/ promoter group is interested No. ${BAND_GRID}`;

describe('wordsToRupees', () => {
  test('parses plain crore amounts', () => {
    expect(wordsToRupees('Thirty Nine Crores Twenty One Lakhs')).toBe(39.21e7);
  });

  test('applies thousand within the crore group, not at rupee scale', () => {
    // The regression that matters: a naive left-to-right parser reads this as
    // 2000 + 977 crore instead of 2977 crore.
    expect(wordsToRupees('Two Thousand Nine Hundred and Seventy Seven Crores')).toBe(2977e7);
  });

  test('handles hundreds combined with lakhs', () => {
    expect(wordsToRupees('Seven Hundred Fifty Eight Crores Seven Lakhs')).toBe(758.07e7);
  });

  test('ignores sub-rupee paise tail', () => {
    expect(wordsToRupees('Twenty One Crore Thirty Lakh and Sixty Four Paise')).toBe(21.3e7);
  });

  test('rejects a phrase that is not an amount', () => {
    expect(wordsToRupees('Award of Order Receipt')).toBeNull();
  });
});

describe('extractFromPdfText — value', () => {
  test('reads a scaled figure with the currency symbol present', () => {
    const r = extractFromPdfText(
      'The Company has received orders totaling Rs. 534.85 Crore (excl. GST).'
    );
    expect(r.valueCr).toBe(534.85);
  });

  test('reads an absolute rupee figure in Indian digit grouping', () => {
    const r = extractFromPdfText(
      'Broad consideration: INR 39,21,00,000 /- (Rupees Thirty Nine Crores Twenty One Lakhs Only)'
    );
    expect(r.valueCr).toBe(39.21);
    expect(r.confidence).toBe('high');
  });

  test('recovers the value when the rupee glyph is mangled by font encoding', () => {
    // Real RVNL filings render ₹ as a stray "f" or "t"; requiring the symbol
    // would drop these entirely.
    const r = extractFromPdfText(
      'Domestic 36 Months f 758.07 crores (Rupees Seven Hundred Fifty Eight Crores Seven Lakhs Only), including GST @ 18%'
    );
    expect(r.valueCr).toBe(758.07);
    expect(r.confidence).toBe('high');
  });

  test('word form overrides a disagreeing numeric read', () => {
    const r = extractFromPdfText(
      't 977 Cr. (Rupees Two Thousand Nine Hundred and Seventy Seven Crores Only)'
    );
    expect(r.valueCr).toBe(2977);
    expect(r.wordFormCr).toBe(2977);
  });

  test('flags a period aggregate whose components sum to the total', () => {
    const r = extractFromPdfText(
      'Orders received during April 2026 totaling Rs. 1703.27 Crore comprising Rs. 929.96 Crore, Rs. 603.41 Crore and Rs. 169.90 Crore'
    );
    expect(r.valueCr).toBe(1703.27);
    expect(r.isAggregate).toBe(true);
    expect(r.components.sort((a, b) => b - a)).toEqual([929.96, 603.41, 169.9]);
  });

  test('ignores phone numbers, PIN codes and GST rates', () => {
    const r = extractFromPdfText(
      'Tel: +91-11-26738299, Fax: +91-11-26182957, New Delhi-110029, CIN: L74999DL2003GOI118633, GST @ 18%'
    );
    expect(r.valueCr).toBeNull();
    expect(r.confidence).toBe('none');
  });

  test('ignores the SEBI order-size band grid', () => {
    // Without this the "Medium" band's ceiling reads as the order's value.
    const r = extractFromPdfText(
      'DBO order from the Delhi Jal Board for a 17 MGD plant. ' +
        'Order Classification Small Medium Large Major Mega ' +
        'Domestic (in INR Crores) Upto 100 100 to 250 250 to 600 600 to 1,000 Above 1,000 ' +
        'International (In USD Millions) Upto 10 10 to 30 30 to 75 75 to 150 Above 150'
    );
    expect(r.valueCr).toBeNull();
  });

  test('ignores the band-definition footnote', () => {
    const r = extractFromPdfText(
      'g) Broad consideration or size of the order(s): Medium Order* ' +
        '*Note: A ‘Medium’ order shall mean an order value in the range of Rs. 100 to Rs. 250 Crores.'
    );
    expect(r.valueCr).toBeNull();
  });

  test('ignores the band footnote even when the PDF splits words mid-token', () => {
    // Real WABAG filings render these as "C rores" and "Me dium".
    const r = extractFromPdfText(
      '*Note:   ‘Large’   shall mean order inflow   value of   INR   250   to   600   C rores .'
    );
    expect(r.valueCr).toBeNull();
  });

  test('does not scale a USD amount through the rupee ladder', () => {
    // "USD 150 million" must not become ₹15 Cr.
    const r = extractFromPdfText('The contract value is USD 150 million for the SWRO plant.');
    expect(r.valueCr).toBeNull();
  });

  test('still reads a rupee figure that sits alongside a USD one', () => {
    const r = extractFromPdfText('Value USD 30 million, being Rs. 260 Crore at current rates.');
    expect(r.valueCr).toBe(260);
  });
});

describe('findQuantities', () => {
  test('captures product units and folds case variants together', () => {
    const q = findQuantities('total route length 385Km covering 22Km and 363 km, capacity 10 MTPA');
    const km = q.find((x) => x.unit === 'Km');
    expect(km.value).toBe(385);
    expect(q.find((x) => x.unit === 'MTPA').value).toBe(10);
  });

  test('normalizes unit spellings', () => {
    expect(normalizeUnit('kms')).toBe('Km');
    expect(normalizeUnit('mw')).toBe('MW');
    expect(normalizeUnit('tonnes')).toBe('Tonnes');
  });

  test('returns nothing when no product units are present', () => {
    expect(findQuantities('Rs. 500 Crore contract for civil works')).toEqual([]);
  });
});

describe('findTimeline', () => {
  test('derives an end date from a stated duration and the filing date', () => {
    const t = findTimeline('to be executed within 15 Months', '2026-04-28');
    expect(t.durationMonths).toBe(15);
    expect(t.startDate).toBe('2026-04-28');
    expect(t.endDate).toBe('2027-07-28');
    // `basis` now also names which duration was selected, e.g.
    // "duration-from-filing-date:execution-context".
    expect(t.basis).toMatch(/^duration-from-filing-date/);
  });

  test('converts a duration stated in days', () => {
    const t = findTimeline('completion period 730 Days', '2026-06-08');
    expect(t.durationMonths).toBe(24);
    expect(t.endDate).toBe('2028-06-08');
  });

  test('takes the longest duration when several appear', () => {
    const t = findTimeline('30 days notice, execution over 42 months', '2026-06-20');
    expect(t.durationMonths).toBe(42);
  });

  test('answers SEBI annexure row (f) in preference to any other duration', () => {
    const t = findTimeline(
      'The plant carries a 60 months concession. f) Time period by which the ' +
        'order(s)/contract(s) is to be executed within 30 months from the Appointed Date',
      '2026-04-27'
    );
    expect(t.durationMonths).toBe(30);
    expect(t.selection).toBe('sebi-annexure-row-f');
  });

  // WABAG states 21 months of build followed by 15 years of O&M; taking the
  // longest span would report an execution window nearly nine times too long.
  test('excludes an O&M tail that trails the execution period', () => {
    const t = findTimeline(
      'The project will be completed within 21 months, followed by 15 years of ' +
        'operation and maintenance.',
      '2026-05-22'
    );
    expect(t.durationMonths).toBe(21);
    expect(t.omDurations).toEqual(['15 years']);
  });

  test('excludes an O&M tail that precedes its own figure', () => {
    const t = findTimeline('EPC scope within 36 months followed by O&M for 7 years', '2026-07-20');
    expect(t.durationMonths).toBe(36);
    expect(t.omDurations).toEqual(['7 years']);
  });

  test('returns null when the only duration stated is an O&M period', () => {
    expect(
      findTimeline('Post Commissioning the plant is under O&M for 15 years', '2026-05-22')
    ).toBeNull();
  });

  // These PDFs kern digits apart, so the text layer emits "6 0 months" for 60.
  // Read naively that becomes 0 months and the order looks already complete.
  test('reassembles a duration whose digits were split by PDF kerning', () => {
    const t = findTimeline(
      'is to be executed within 6 0 months from the Commencement Date',
      '2026-06-03'
    );
    expect(t.durationMonths).toBe(60);
    expect(t.endDate).toBe('2031-06-03');
  });

  test('does not absorb an adjacent year into the duration', () => {
    const t = findTimeline('awarded in 2026 36 months to complete', '2026-06-20');
    expect(t.durationMonths).toBe(36);
  });

  test('returns null when no duration is stated', () => {
    expect(findTimeline('Order(s) received during June 2026', '2026-06-30')).toBeNull();
  });

  test('ignores implausible spans', () => {
    expect(findTimeline('registered in 500 years of history', '2026-06-30')).toBeNull();
  });
});

describe('findValueBand', () => {
  test('resolves a domestic band against the grid, in crore', () => {
    const b = findValueBand(filing('Large', 'Domestic'));
    expect(b).toMatchObject({
      band: 'Large',
      jurisdiction: 'domestic',
      currency: 'INR',
      lowCr: 250,
      highCr: 600,
    });
  });

  // An FX rate would have to be invented to express these in crore, so they
  // stay in USD and contribute nothing to the rupee range.
  test('leaves an international band in its own currency', () => {
    const b = findValueBand(filing('Large', 'International'));
    expect(b).toMatchObject({ currency: 'USD', unit: 'mn', low: 30, high: 75 });
    expect(b.lowCr).toBeNull();
    expect(b.highCr).toBeNull();
  });

  test('treats the top band as open-ended rather than pinning a ceiling', () => {
    const b = findValueBand(filing('Mega', 'International'));
    expect(b.low).toBe(150);
    expect(b.high).toBeNull();
    expect(b.text).toBe('Mega — USD 150+ mn');
  });

  // "Large" appears repeatedly in the marketing prose above the annexure
  // ("a large-scale desalination solution"); only row (g)'s answer counts.
  test('ignores band words in prose and reads the annexure answer', () => {
    const text =
      'WABAG wins Mega Order for a large - scale desalination plant. ' + filing('Mega', 'Domestic');
    expect(findValueBand(text).band).toBe('Mega');
  });

  test('returns null without a grid to resolve the class against', () => {
    expect(findValueBand('g) size of the order Large Order * h) Whether the promoter')).toBeNull();
  });

  test('reports a band only when no figure was stated', () => {
    const banded = extractFromPdfText(filing('Medium', 'Domestic'));
    expect(banded.valueCr).toBeNull();
    expect(banded.confidence).toBe('band-only');
    expect(banded.valueBand.text).toBe('Medium — INR 100 to 250 Cr');

    const valued = extractFromPdfText(`Rs. 320 Crores. ${filing('Large', 'Domestic')}`);
    expect(valued.valueCr).toBe(320);
    expect(valued.valueBand).toBeNull();
  });
});

describe('addMonths', () => {
  test('rolls over year boundaries', () => {
    expect(addMonths('2026-06-20', 42)).toBe('2029-12-20');
  });

  test('clamps to the last valid day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});
