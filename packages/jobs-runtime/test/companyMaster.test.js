'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let companyMaster;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cm-'));
  process.env.DATA_V2_DIR = tmpRoot;
  fs.mkdirSync(path.join(tmpRoot, 'cache'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, 'cache', 'company-master.json'),
    JSON.stringify({
      companies: [
        {
          companyId: 'NSE:SWARAJENG',
          nseTicker: 'SWARAJENG',
          bseTicker: '500407',
          bseSymbol: 'SWARAJENG',
          companyName: 'Swaraj Engines Ltd',
          keywords: ['swaraj'],
        },
        {
          companyId: 'NSE:NPST',
          nseTicker: 'NPST',
          bseTicker: '544396',
          bseSymbol: 'NPST',
          companyName: 'Network People Services Technologies Limited',
          cleanName: 'Network People Services Technologies Ltd',
          rawNseName: 'Network People Services Technologies Ltd',
          rawBseName: 'NETWORK PEOPLE SRV TECH L',
          keywords: ['npst', 'network', 'people', 'services'],
        },
      ],
    })
  );
  jest.resetModules();
  companyMaster = require('../lib/companyMaster');
});

afterEach(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('companyMaster lookups sanitize a series-suffixed input', () => {
  test('findByTicker matches "SWARAJENG-BE" the same as "SWARAJENG"', () => {
    const plain = companyMaster.findByTicker('SWARAJENG');
    const suffixed = companyMaster.findByTicker('SWARAJENG-BE');
    expect(plain).not.toBeNull();
    expect(suffixed).toEqual(plain);
  });

  test('findByTicker still returns null for a genuinely unknown ticker', () => {
    expect(companyMaster.findByTicker('NOPE-BE')).toBeNull();
  });

  test('findByBseTicker matches a suffixed BSE symbol', () => {
    const suffixed = companyMaster.findByBseTicker('SWARAJENG-SM');
    expect(suffixed).not.toBeNull();
    expect(suffixed.companyName).toBe('Swaraj Engines Ltd');
  });

  test('findByScripCode matches a suffixed scrip code', () => {
    const suffixed = companyMaster.findByScripCode('500407-BE');
    expect(suffixed).not.toBeNull();
  });
});

describe('companyMaster 4-way mapping to NSE scrip code', () => {
  test('1. NSE Company Name -> NSE scrip code', () => {
    expect(companyMaster.resolveToNseTicker('Network People Services Technologies Ltd')).toBe(
      'NPST'
    );
  });

  test('2. BSE Company Name -> NSE scrip code', () => {
    expect(companyMaster.resolveToNseTicker('NETWORK PEOPLE SRV TECH L')).toBe('NPST');
  });

  test('3. BSE scrip code -> NSE scrip code', () => {
    expect(companyMaster.resolveToNseTicker('544396')).toBe('NPST');
    expect(companyMaster.resolveToNseTicker(544396)).toBe('NPST');
  });

  test('4. StockScans Company Name -> NSE scrip code', () => {
    expect(companyMaster.resolveToNseTicker('Network People Services Technologies Limited')).toBe(
      'NPST'
    );
  });

  test('findByName matches normalized and clean names', () => {
    const hit = companyMaster.findByName('Network People Services Technologies Ltd');
    expect(hit).not.toBeNull();
    expect(hit.nseTicker).toBe('NPST');
    expect(hit.bseTicker).toBe('544396');
  });
});

describe('resolveCompanyIdentity', () => {
  test('resolves NSE ticker correctly with canonical NSE key and companyId', () => {
    const ident = companyMaster.resolveCompanyIdentity({
      symbol: 'NPST',
      company: 'Network People Services Technologies Ltd',
      exchange: 'NSE',
    });
    expect(ident.key).toBe('NSE:NPST');
    expect(ident.companyId).toBe('NSE:NPST');
    expect(ident.displaySymbol).toBe('NPST');
    expect(ident.nseTicker).toBe('NPST');
    expect(ident.bseTicker).toBe('544396');
  });

  test('resolves BSE feed row with scrip code to dual-listed NSE identity', () => {
    const ident = companyMaster.resolveCompanyIdentity({
      symbol: '544396',
      company: 'NETWORK PEOPLE SRV TECH L',
      exchange: 'BSE',
    });
    expect(ident.key).toBe('NSE:NPST');
    expect(ident.companyId).toBe('NSE:NPST');
    expect(ident.nseTicker).toBe('NPST');
    expect(ident.bseTicker).toBe('544396');
  });

  test('resolves BSE feed row with company name to dual-listed NSE identity', () => {
    const ident = companyMaster.resolveCompanyIdentity({
      company: 'NETWORK PEOPLE SRV TECH L',
      exchange: 'BSE',
    });
    expect(ident.key).toBe('NSE:NPST');
    expect(ident.companyId).toBe('NSE:NPST');
    expect(ident.nseTicker).toBe('NPST');
  });

  test('never emits spaces in companyId or key even if unmapped', () => {
    const ident = companyMaster.resolveCompanyIdentity({
      symbol: 'Unknown Corp Ltd',
      company: 'Unknown Corp Ltd',
      exchange: 'NSE',
    });
    expect(ident.companyId).toBeNull();
    expect(ident.key).not.toContain(' ');
  });
});

describe('resolveCompanyId', () => {
  test('resolves NSE ticker string to canonical companyId', () => {
    expect(companyMaster.resolveCompanyId('NPST')).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId('NSE:NPST')).toBe('NSE:NPST');
  });

  test('resolves dual-listed BSE scrip code to canonical NSE companyId', () => {
    expect(companyMaster.resolveCompanyId('544396')).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId('BSE:544396')).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId(544396)).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId('500407')).toBe('NSE:SWARAJENG');
  });

  test('resolves dual-listed company name to canonical NSE companyId', () => {
    expect(companyMaster.resolveCompanyId('Network People Services Technologies Ltd')).toBe(
      'NSE:NPST'
    );
    expect(companyMaster.resolveCompanyId('NETWORK PEOPLE SRV TECH L')).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId('Swaraj Engines Ltd')).toBe('NSE:SWARAJENG');
  });

  test('resolves object input to canonical companyId', () => {
    expect(
      companyMaster.resolveCompanyId({
        symbol: '544396',
        exchange: 'BSE',
      })
    ).toBe('NSE:NPST');
    expect(
      companyMaster.resolveCompanyId({
        companyName: 'NETWORK PEOPLE SRV TECH L',
        exchange: 'BSE',
      })
    ).toBe('NSE:NPST');
  });

  test('strips trading series suffixes before resolution', () => {
    expect(companyMaster.resolveCompanyId('NPST-SM')).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId('NSE:NPST-BE')).toBe('NSE:NPST');
    expect(companyMaster.resolveCompanyId('544396-BE')).toBe('NSE:NPST');
  });

  test('fallback behavior preserves sanitized ticker if unmapped', () => {
    expect(companyMaster.resolveCompanyId('UNKNOWNCO')).toBe('NSE:UNKNOWNCO');
    expect(companyMaster.resolveCompanyId('NSE:UNKNOWNCO')).toBe('NSE:UNKNOWNCO');
    expect(companyMaster.resolveCompanyId('BSE:999999')).toBe('BSE:999999');
    expect(companyMaster.resolveCompanyId('999999')).toBe('BSE:999999');
    expect(companyMaster.resolveCompanyId('UNKNOWNCO', { fallback: false })).toBeNull();
    expect(companyMaster.resolveCompanyId('Unmapped Full Name Ltd', { fallback: true })).toBeNull();
  });
});
