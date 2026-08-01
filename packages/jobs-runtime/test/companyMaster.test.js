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
