'use strict';

/**
 * Regression coverage for extract_statements.js's row/label/unit parsing —
 * all four fixtures below are minimal excerpts of real formatting quirks
 * found 2026-09-23 testing this pipeline against a real SUPRIYA Q4 FY26
 * Result filing (`stock_documents/NSE_SUPRIYA_Result_202603.pdf`, fetched
 * live via documentsFetcher.js). Each one silently corrupted or dropped a
 * real row before the fix; every one of these regressed the tool against
 * production data, not a hypothetical.
 */

const { parseRows, detectUnitScale, parseAsOfDate } = require('../extract_statements.js');

describe('detectUnitScale', () => {
  it('detects the unit when a corrupted glyph is glued directly onto the unit word (no whitespace)', () => {
    // Real text: '(All amounts in Indian "million, except as otherwise stated)'
    // — a broken rupee-symbol glyph rendered as a bare quote mark, glued to
    // "million" with zero separating whitespace. A token-count regex
    // (`in (?:\S+\s+){0,2}million`) fails this because the glued quote+word
    // is ONE token, not two.
    const body =
      'Standalone Balance Sheet as at March 31, 2026\n(All amounts in Indian "million, except as otherwise stated)\n';
    expect(detectUnitScale(body)).toEqual({ unit: 'million', toCr: 0.1 });
  });

  it('still detects the unit when the glyph is its own separate token', () => {
    const body =
      'Cash flow statement for the period ended March 31, 2026\n(All amounts in Indian ~ million, except as otherwise stated)\n';
    expect(detectUnitScale(body)).toEqual({ unit: 'million', toCr: 0.1 });
  });

  it('falls back to unknown when no unit phrase is present', () => {
    expect(detectUnitScale('Particulars\nRevenue 100 200')).toEqual({
      unit: 'unknown',
      toCr: null,
    });
  });
});

describe('parseAsOfDate', () => {
  it('parses "as at <Month> <D>, <YYYY>" (month-first order)', () => {
    // Real heading: "Standalone Balance Sheet as at March 31, 2026" — the
    // original DATE_RE only accepted day-first ("31st March 2026").
    expect(parseAsOfDate('Standalone Balance Sheet as at March 31, 2026')).toBe('2026-03-31');
  });

  it('still parses "as at <D> <Month> <YYYY>" (day-first order)', () => {
    expect(parseAsOfDate('Statement of Assets and Liabilities as at 30th September, 2026')).toBe(
      '2026-09-30'
    );
  });
});

describe('parseRows', () => {
  it('does not let an all-dash ("nil disclosed") row bleed its label into the NEXT row', () => {
    // Real bug found while fixing the wrapped-label merge above: an
    // all-dash row ("Purchase of Stock in Trade    -    -") has no PARSED
    // numeric values (dashes parse to null) but does have numeric-LOOKING
    // tokens. The first version of the wrap-merge fix treated "no parsed
    // values" as "label-only, hold it" and merged this row's label into the
    // real "Change in inventories..." row that followed, corrupting both.
    const body = [
      'bl Purchase of Stock in Trade                                                       -                                                                 -',
      'c) Change in inventories offinished goods , work',
      'in progress & stock in trade.',
      '                                                                       219.66           (160.98)              (467.05)',
    ].join('\n');
    const rows = parseRows(body);
    const row = rows.find((r) => /change in inventories/i.test(r.label));
    expect(row).toBeDefined();
    expect(row.label).not.toMatch(/purchase of stock/i);
    expect(row.values).toEqual([219.66, -160.98, -467.05]);
  });

  it('merges a wrapped label (data-free line) with the numbers-only line that follows it', () => {
    // Real filing text: a long P&L label wraps across two physical lines,
    // and the numeric columns land on their own line after the wrap —
    // without merging, this row was silently dropped entirely (no numbers
    // on the label line, no label on the numbers line).
    const body = [
      'c) Change in inventories offinished goods , work',
      'in progress & stock in trade.',
      '                    219.66           (160.98)              (467.05)',
    ].join('\n');
    const rows = parseRows(body);
    const row = rows.find((r) => /change in inventories/i.test(r.label));
    expect(row).toBeDefined();
    expect(row.values).toEqual([219.66, -160.98, -467.05]);
  });

  it('does not strip a real short label word as if it were a numbered marker', () => {
    // Real bug: the marker-stripper originally matched ANY short leading
    // word ("Net"), not just genuine markers (digits, Roman numerals,
    // parenthesised letters) — corrupting "Net Cash generated from
    // Operating Activities (A)" into "Cash generated from Operating
    // Activities (A)", which then still happened to match CF_MAP's regex,
    // but a stricter downstream label match would have missed it.
    const rows = parseRows(
      'Net Cash generated from Operating Activities (A)          1,857.69   1,646.75'
    );
    expect(rows[0].label).toMatch(/^Net Cash generated/);
  });

  it('still strips genuine numbered/lettered/Roman-numeral markers', () => {
    const rows = parseRows(
      [
        '1  Revenue from operations   1,897.47   2,765.28   1,450.74',
        'V  Profit before tax          407.92     921.29     474.12',
        '(a) Cost of materials consumed 1,094.00    833.61     437.76',
      ].join('\n')
    );
    expect(rows[0].label).toBe('Revenue from operations');
    expect(rows[1].label).toBe('Profit before tax');
    expect(rows[2].label).toBe('Cost of materials consumed');
  });
});
