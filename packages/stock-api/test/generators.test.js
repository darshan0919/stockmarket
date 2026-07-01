'use strict';

const fs = require('fs');
const path = require('path');
const {
  createResearchReport,
  createDrhpPdf,
  createForensicPdf,
  createConcallPdf,
  createSectorReport,
  createPeerComparisonPdf,
  createCredibilityWidget,
  createMarketShareWidget,
  createGrowthTriggersPdf
} = require('../src/index');

describe('Report Generators', () => {
  const tmpDir = path.join(__dirname, 'tmp_out');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should export all generator functions', () => {
    expect(typeof createResearchReport).toBe('function');
    expect(typeof createDrhpPdf).toBe('function');
    expect(typeof createForensicPdf).toBe('function');
    expect(typeof createConcallPdf).toBe('function');
    expect(typeof createSectorReport).toBe('function');
    expect(typeof createPeerComparisonPdf).toBe('function');
    expect(typeof createCredibilityWidget).toBe('function');
    expect(typeof createMarketShareWidget).toBe('function');
    expect(typeof createGrowthTriggersPdf).toBe('function');
  });

  it('should execute HTML based generators successfully', () => {
    const credPath = path.join(tmpDir, 'cred.html');
    createCredibilityWidget({ output_path: credPath, company_name: 'Test' });
    expect(fs.existsSync(credPath)).toBe(true);

    const sharePath = path.join(tmpDir, 'share.html');
    createMarketShareWidget({ output_path: sharePath, industry: 'Test' });
    expect(fs.existsSync(sharePath)).toBe(true);
  });
});
