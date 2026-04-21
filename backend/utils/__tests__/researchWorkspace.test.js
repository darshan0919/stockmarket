/**
 * @fileoverview Unit tests for researchWorkspace
 */
const path = require('path');
const {
  parseResearchSymbol,
  getExpectedWorkspaceFiles,
  CATEGORY_FOLDERS,
} = require('../researchWorkspace');

describe('researchWorkspace', () => {
  it('parseResearchSymbol accepts valid NSE-style symbols', () => {
    expect(parseResearchSymbol('reliance')).toEqual({ ok: true, symbol: 'RELIANCE' });
    expect(parseResearchSymbol('360ONE')).toEqual({ ok: true, symbol: '360ONE' });
  });

  it('parseResearchSymbol rejects invalid input', () => {
    expect(parseResearchSymbol('').ok).toBe(false);
    expect(parseResearchSymbol('AB').ok).toBe(true);
    expect(parseResearchSymbol('A-B').ok).toBe(false);
    expect(parseResearchSymbol('TOOLONGTOOLONGTOOLONGTOOLONGTOOLONG').ok).toBe(false);
  });

  it('getExpectedWorkspaceFiles uses uppercase ticker', () => {
    const e = getExpectedWorkspaceFiles('abc');
    expect(e.masterData).toBe('ABC_MasterData.xlsx');
    expect(e.extracts.ar).toBe('ABC_AR_Extracts.txt');
    expect(e.extracts.ratingReports).toBe('ABC_RatingReports.txt');
  });

  it('CATEGORY_FOLDERS matches equity-research skill layout', () => {
    expect(CATEGORY_FOLDERS).toContain('Events_Announcements');
    expect(CATEGORY_FOLDERS.length).toBe(5);
  });
});
