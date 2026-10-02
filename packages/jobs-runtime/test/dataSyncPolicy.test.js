'use strict';

const { NEVER_SYNC } = require('../lib/dataSyncPolicy');

describe('data sync policy', () => {
  it('never syncs the local-only study corpora', () => {
    for (const rel of [
      'pdf-corpus/manifest.jsonl',
      'pdf-corpus/pdfs/Result/A_202603_ab12cd34.pdf',
      'pdf-corpus/scan/rows.jsonl',
      'pdf-corpus/truth.jsonl',
      'xbrl-corpus/NSE/A.xml',
    ])
      expect(NEVER_SYNC(rel)).toBe(true);
  });
  it('still syncs ordinary data and keeps the existing exclusions', () => {
    expect(NEVER_SYNC('companies.json')).toBe(false);
    expect(NEVER_SYNC('cache/company-master.json')).toBe(false);
    expect(NEVER_SYNC('pdf-corpus-notes.json')).toBe(false); // prefix match is directory-aligned
    expect(NEVER_SYNC('_meta/sync-state.json')).toBe(true);
    expect(NEVER_SYNC('x.json.corrupt.123')).toBe(true);
  });
});
