'use strict';

const taxonomy = require('../lib/announcementTaxonomy');

// Regression tests for the 2026-09-04 gainers-signal misses: PC Jeweller
// (debt clearance), Jindal Worldwide (showroom rollout press release), and
// SML Mahindra (monthly sales update) all title-classified as ROUTINE/general
// and were never read. The fix is content-based classification — these tests
// assert the real filing text (not just the title) now resolves correctly.

describe('title-only annotate() is provisional, not final', () => {
  test('marks strengthSource as title', () => {
    // A title that gives no hint of what's inside — the whole point of the
    // fix is that these must still get read, not skipped as ROUTINE.
    const ann = taxonomy.annotate({
      subject: 'Press Release / Media Release',
      description: '',
    });
    expect(ann.strengthSource).toBe('title');
    expect(ann.strength).toBe('ROUTINE');
  });
});

describe('classifyFromContent — the 2026-09-04 misses', () => {
  test('PC Jeweller debt-clearance update reads as deleveraging/STRONG from body text', () => {
    const ann = { subject: 'Update On Clearance Of Outstanding Debt', description: '' };
    const bodyText =
      'the Company has successfully cleared and repaid all its outstanding debt ' +
      'to 9 out of the 14 consortium banks, discharged more than 96% of the ' +
      'outstanding debt of the remaining 5 banks, and remains on track to ' +
      'achieve a debt-free status this month.';
    const { category, strength } = taxonomy.classifyFromContent(ann, bodyText);
    expect(category).toBe('deleveraging');
    expect(strength).toBe('STRONG');
  });

  test('Jindal Worldwide showroom-rollout press release reads as capacity/STRONG from body text', () => {
    const ann = { subject: 'Press Release / Media Release', description: '' };
    const bodyText =
      'Jindal Mobilitric Private Limited to Expand Retail Footprint to 100 ' +
      'Showrooms by FY28, Reinforcing Its Nationwide EV Ambitions.';
    const { category, strength } = taxonomy.classifyFromContent(ann, bodyText);
    expect(category).toBe('capacity');
    expect(strength).toBe('STRONG');
  });

  test('SML Mahindra monthly sales update promotes to STRONG when the body shows a large YoY move', () => {
    const ann = {
      subject: 'Announcement under Regulation 30 (LODR)-Monthly Business Updates',
      description: '',
    };
    const bodyText =
      'sales figure for the month of August 2026: Total 1175 vehicles vs 842, ' + '40% YoY growth.';
    const { category, strength } = taxonomy.classifyFromContent(ann, bodyText);
    expect(category).toBe('monthly_update');
    expect(strength).toBe('STRONG');
  });

  test('a genuinely quiet monthly update stays SUPPORTING, not STRONG', () => {
    const ann = { subject: 'Monthly Business Updates', description: '' };
    const bodyText = 'sales figure for the month of August 2026: Total 500 vehicles vs 498.';
    const { category, strength } = taxonomy.classifyFromContent(ann, bodyText);
    expect(category).toBe('monthly_update');
    expect(strength).toBe('SUPPORTING');
  });

  test('a genuine board-meeting-intimation stays ROUTINE even against full body text', () => {
    const ann = {
      subject: 'Board Meeting Intimation for Consideration Of Un-Audited Financial Results',
      description: '',
    };
    const bodyText =
      'notice is hereby given that a meeting of the Board will be held to consider results.';
    const { strength } = taxonomy.classifyFromContent(ann, bodyText);
    expect(strength).toBe('ROUTINE');
  });

  test('a general-category filing with a quantified rupee figure is floored at SUPPORTING', () => {
    const ann = { subject: 'Update on strategic investment', description: '' };
    const bodyText =
      'the Company will make a strategic investment of Rs. 13,19,40,000 in the investee company.';
    // "strategic investment" alone doesn't match any STRONG/SUPPORTING category
    // keyword, but a real rupee-crore-scale figure in the body must not be
    // silently dropped to ROUTINE.
    const { strength } = taxonomy.classifyFromContent(ann, bodyText);
    expect(strength).not.toBe('ROUTINE');
  });
});

// Darshan's stated bar (2026-09-05): "any kind of filing that leads to EPS
// accretion or J-Curve or Strong Anticipation is very high significance."
// `significance` is a SEPARATE axis from `strength` — these tests exist mainly
// to stop a future refactor from quietly collapsing the two back together.
describe('significance — the EPS-accretion / J-curve axis', () => {
  const veryHigh = [
    'capacity',
    'deleveraging',
    'margin_expansion',
    'order_book',
    'fundraise',
    'demerger',
    'merger',
    'acquisition',
    'management_change',
    'results',
    'concall_transcript',
    'investor_presentation',
    'annual_report',
    'anticipation',
  ];
  test.each(veryHigh)('%s is VERY_HIGH significance', (category) => {
    expect(taxonomy.significanceOf(category)).toBe('VERY_HIGH');
  });

  test('routine paperwork is NORMAL significance', () => {
    expect(taxonomy.significanceOf('general')).toBe('NORMAL');
    expect(taxonomy.significanceOf('agm_egm')).toBe('NORMAL');
  });

  test('a result-date intimation is ROUTINE strength but VERY_HIGH significance', () => {
    // The two axes coming apart is the entire point: the notice asserts no
    // facts (ROUTINE), but for a company that guided strongly it is a dated
    // catalyst the market front-runs.
    const { category, strength, significance, reasoningCheck } = taxonomy.classifyFromContent(
      { subject: 'Board Meeting Intimation for Consideration Of Un-Audited Financial Results' },
      'notice is hereby given that a meeting of the Board of Directors will be held'
    );
    expect(category).toBe('anticipation');
    expect(strength).toBe('ROUTINE');
    expect(significance).toBe('VERY_HIGH');
    // The script must hand the reasoning layer the question it cannot answer.
    expect(reasoningCheck).toMatch(/guidance/i);
  });

  test('an actual results filing still categorises as results, not anticipation', () => {
    const { category } = taxonomy.classifyFromContent(
      { subject: 'Un-Audited Financial Results for the quarter ended June 30, 2026' },
      'Revenue from operations Rs 450 crore, profit after tax Rs 62 crore'
    );
    expect(category).toBe('results');
  });

  test('margin expansion is STRONG and flagged for the structural-vs-transitory check', () => {
    const { category, strength, significance, reasoningCheck } = taxonomy.classifyFromContent(
      { subject: 'Investor Update' },
      'EBITDA margin expanded 380 bps driven by mix shift towards value-added products'
    );
    expect(category).toBe('margin_expansion');
    expect(strength).toBe('STRONG');
    expect(significance).toBe('VERY_HIGH');
    expect(reasoningCheck).toMatch(/structural|transitory/i);
  });
});

describe('learned rules', () => {
  test('loadLearnedRules never throws and always returns the expected shape', () => {
    // A missing or corrupt learned-rules file must degrade to the built-in
    // taxonomy, never take down a scan.
    const rules = taxonomy.loadLearnedRules();
    expect(typeof rules.categoryKeywords).toBe('object');
    expect(Array.isArray(rules.materialityPatterns)).toBe(true);
    expect(Array.isArray(rules.provenance)).toBe(true);
  });
});

describe('annotateFromContent', () => {
  test('never keeps a stale title-only verdict when content fetch failed', () => {
    const ann = taxonomy.annotate({ subject: 'Press Release / Media Release', description: '' });
    taxonomy.annotateFromContent(ann, null);
    expect(ann.strengthSource).toBe('content_unavailable');
  });

  test('overwrites the provisional strength once content is available', () => {
    const ann = taxonomy.annotate({ subject: 'Press Release / Media Release', description: '' });
    expect(ann.strength).toBe('ROUTINE'); // provisional, title-only
    taxonomy.annotateFromContent(
      ann,
      'the Company has repaid all its outstanding debt and is on track to be debt-free this month.'
    );
    expect(ann.strength).toBe('STRONG');
    expect(ann.strengthSource).toBe('content');
  });
});
